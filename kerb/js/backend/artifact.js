// Live backend: Claude artifact runtime (shared database, AI, downloads).
// Any backend must provide the same methods, so a Firebase or Supabase version can replace this later.

export async function createArtifactBackend() {
  const claude = window.claude;
  if (!claude || typeof claude.use !== "function") return null;
  const use = n => claude.use(n).catch(() => null);
  const [db, user] = await Promise.all([use("db"), use("user")]);
  if (!db || !user) return null;
  const me = await user.me();
  if (!me || !me.id) return null;
  const canWrite = (await user.can("data.write")) !== false;

  // one write at a time per document
  const chains = new Map();
  const serial = (path, fn) => {
    const prev = chains.get(path) || Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(path, next.catch(() => {}));
    return next;
  };
  const doc = p => db.doc(p);
  const col = p => db.collection(p);
  const rows = snap => snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  function query(path, q = {}) {
    let r = col(path);
    for (const w of q.where || []) r = r.where(w[0], w[1], w[2]);
    if (q.orderBy) r = r.orderBy(q.orderBy[0], q.orderBy[1] || "asc");
    if (q.limit) r = r.limit(q.limit);
    return r;
  }

  const api = {
    mode: "live",
    me: { id: me.id, name: me.name || "", avatarUrl: me.avatarUrl, color: me.color },
    canWrite,
    isOwner: me.isOwner,

    watchCol(path, q, cb, onErr) { return query(path, q).onSnapshot(s => cb(rows(s)), e => onErr && onErr(e)); },
    watchDoc(path, cb, onErr) { return doc(path).onSnapshot(s => cb(s.exists ? Object.assign({ id: s.id }, s.data()) : null), e => onErr && onErr(e)); },
    async getCol(path, q) { return rows(await query(path, q).get()); },
    async getDoc(path) { const s = await doc(path).get(); return s.exists ? Object.assign({ id: s.id }, s.data()) : null; },
    set: (p, d) => serial(p, () => doc(p).set(d)),
    update: (p, d) => serial(p, () => doc(p).update(d)),
    del: p => serial(p, () => doc(p).delete()),
    async add(colPath, d) { const r = col(colPath).doc(); await serial(r.path, () => r.set(d)); return r.id; },
    newId: () => col("ids").doc().id,
    profiles: ids => user.profiles(ids),
    // short lock so only one page runs the dispatch engine
    async lease(path, holder, ttlMs) { try { const r = await doc(path).acquire({ holder, ttlMs }); return !!r.acquired; } catch (e) { return false; } },
    download: null,

    // filled by loadExtras()
    ai: null, upload: null, live: false,
    presence() {}, onPeers() { return () => {}; }, emit() {}, on() { return () => {}; },

    async loadExtras() {
      const [room, sample, assets, downloads] = await Promise.all([use("room"), use("sample"), use("assets"), use("downloads")]);
      if (downloads) api.download = (filename, data) => downloads.save({ filename, data });
      if (room) {
        api.live = true;
        api.presence = patch => room.presence(patch).catch(() => {});
        api.onPeers = cb => room.onPeers(ch => cb(ch.peers.filter(p => p.kind === "viewer").map(p => ({
          peer: p.peer, uid: p.by || (p.presence && p.presence.uid) || null, isMe: p.isMe, sameTab: p.sameTab,
          presence: p.presence || {}, at: p.updatedAt,
        }))));
        api.emit = (topic, data) => room.emit(topic, data).catch(() => {});
        api.on = (topic, cb) => room.on(topic, m => cb({ uid: m.by, isMe: m.isMe, sameTab: m.sameTab, data: m.data }));
      }
      if (sample) {
        api.ai = {
          async ask(prompt, opts = {}) {
            const r = await sample(prompt, {
              modelTier: opts.tier || "quick", cache: false,
              onText: opts.onText ? ({ text }) => opts.onText(text) : undefined,
            });
            return r.text || "";
          },
        };
      }
      if (assets) api.upload = async file => (await assets.upload(file)).url;
    },
  };
  return api;
}
