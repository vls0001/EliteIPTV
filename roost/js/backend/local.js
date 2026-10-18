// Demo backend: everything lives in this browser (localStorage), synced between tabs.
// Used when the app is opened outside Claude, e.g. hosted on GitHub Pages, so it always works.
import { seedDemo, DEMO_PEOPLE, DEMO_ME } from "./seed.js";

const KEY = "roost.demo.v1";

export function createLocalBackend() {
  const docs = new Map(); // path -> data
  let saveTimer = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) for (const [k, v] of JSON.parse(raw)) docs.set(k, v);
  } catch (e) {}

  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify([...docs])); } catch (e) {} }, 200); };
  const parent = p => p.slice(0, p.lastIndexOf("/"));
  const idOf = p => p.slice(p.lastIndexOf("/") + 1);
  const clone = v => JSON.parse(JSON.stringify(v));
  const watchers = new Set();
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("roost-demo") : null;

  function merge(a, b) {
    const out = Object.assign({}, a);
    for (const k in b) {
      const v = b[k];
      if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) out[k] = merge(out[k], v);
      else out[k] = v;
    }
    return out;
  }
  function match(d, [f, op, v]) {
    const x = d[f];
    switch (op) {
      case "==": return x === v;
      case "!=": return x !== v;
      case "<": return x < v;
      case "<=": return x <= v;
      case ">": return x > v;
      case ">=": return x >= v;
      case "in": return Array.isArray(v) && v.includes(x);
      case "not-in": return Array.isArray(v) && !v.includes(x);
      case "array-contains": return Array.isArray(x) && x.includes(v);
      default: return false;
    }
  }
  function runQuery(path, q = {}) {
    let out = [];
    for (const [p, d] of docs) if (parent(p) === path) out.push(Object.assign({ id: idOf(p) }, clone(d)));
    for (const w of q.where || []) out = out.filter(d => match(d, w));
    if (q.orderBy) {
      const [f, dir] = q.orderBy, s = dir === "desc" ? -1 : 1;
      out.sort((a, b) => (a[f] === undefined) - (b[f] === undefined) || (a[f] < b[f] ? -s : a[f] > b[f] ? s : 0));
    } else out.sort((a, b) => a.id < b.id ? -1 : 1);
    if (q.limit) out = out.slice(0, q.limit);
    return out;
  }
  function notify(path) {
    for (const w of watchers) {
      if (w.kind === "doc" ? w.path === path : w.path === parent(path)) queueMicrotask(() => w.fire());
    }
  }
  function apply(path, data, broadcast = true) {
    if (data === null) docs.delete(path); else docs.set(path, data);
    save(); notify(path);
    if (broadcast && bc) bc.postMessage({ t: "w", path, data });
  }
  if (bc) bc.onmessage = e => {
    const m = e.data || {};
    if (m.t === "w") apply(m.path, m.data, false);
    if (m.t === "e") for (const l of listeners[m.topic] || []) l({ uid: m.uid, isMe: true, sameTab: false, data: m.data });
    if (m.t === "p") { remotePresence[m.tab] = m.presence; firePeers(); }
  };

  const me = DEMO_ME;
  if (!docs.size) seedDemo((p, d) => docs.set(p, d), me.id), save();

  // presence: you + a few demo people shown online
  const tab = Math.random().toString(36).slice(2);
  let myPresence = { uid: me.id };
  const remotePresence = {};
  const peerCbs = new Set();
  const listeners = {};
  function peers() {
    const list = [{ peer: tab, uid: me.id, isMe: true, sameTab: true, presence: myPresence, at: Date.now() }];
    for (const t in remotePresence) list.push({ peer: t, uid: me.id, isMe: true, sameTab: false, presence: remotePresence[t], at: Date.now() });
    for (const p of DEMO_PEOPLE) if (p.online) list.push({ peer: "demo-" + p.id, uid: p.id, isMe: false, sameTab: false, presence: { uid: p.id, voice: p.voice || null }, at: Date.now() });
    return list;
  }
  function firePeers() { const l = peers(); peerCbs.forEach(cb => cb(l)); }
  window.addEventListener("beforeunload", () => bc && bc.postMessage({ t: "p", tab, presence: null }));

  const api = {
    mode: "demo",
    me: { id: me.id, name: me.name, avatarUrl: "", color: me.color },
    canWrite: true,
    isOwner: true,
    watchCol(path, q, cb) {
      const w = { kind: "col", path, fire: () => cb(runQuery(path, q)) };
      watchers.add(w); queueMicrotask(w.fire);
      return () => watchers.delete(w);
    },
    watchDoc(path, cb) {
      const w = { kind: "doc", path, fire: () => cb(docs.has(path) ? Object.assign({ id: idOf(path) }, clone(docs.get(path))) : null) };
      watchers.add(w); queueMicrotask(w.fire);
      return () => watchers.delete(w);
    },
    async getCol(path, q) { return runQuery(path, q); },
    async getDoc(path) { return docs.has(path) ? Object.assign({ id: idOf(path) }, clone(docs.get(path))) : null; },
    async set(p, d) { apply(p, clone(d)); },
    async update(p, d) { if (!docs.has(p)) throw { code: "invalid_argument", message: "missing" }; apply(p, merge(docs.get(p), clone(d))); },
    async del(p) { apply(p, null); },
    async add(colPath, d) { const id = api.newId(); apply(colPath + "/" + id, clone(d)); return id; },
    newId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    async profiles(ids) {
      const out = {};
      for (const id of [].concat(ids)) {
        const p = id === me.id ? me : DEMO_PEOPLE.find(x => x.id === id);
        out[id] = { id, name: p ? p.name : "", avatarUrl: "", color: p ? p.color : "#71717A", isMe: id === me.id, guest: false };
      }
      return out;
    },
    ai: null,
    live: true,
    async upload(file) {
      if (file.size > 1.5 * 1024 * 1024) throw { code: "too_big", message: "In demo mode files must be under 1.5 MB." };
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    },
    presence(patch) {
      for (const k in patch) { if (patch[k] === null) delete myPresence[k]; else myPresence[k] = patch[k]; }
      myPresence = Object.assign({}, myPresence);
      if (bc) bc.postMessage({ t: "p", tab, presence: myPresence });
      firePeers();
    },
    onPeers(cb) { peerCbs.add(cb); queueMicrotask(() => cb(peers())); return () => peerCbs.delete(cb); },
    emit(topic, data) {
      for (const l of listeners[topic] || []) l({ uid: me.id, isMe: true, sameTab: true, data });
      if (bc) bc.postMessage({ t: "e", topic, uid: me.id, data });
    },
    on(topic, cb) { (listeners[topic] = listeners[topic] || []).push(cb); return () => { listeners[topic] = listeners[topic].filter(x => x !== cb); }; },
    async loadExtras() {},
    resetDemo() { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); },
  };
  return api;
}
