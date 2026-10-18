// Demo backend: data lives in this browser (localStorage) and syncs between open tabs.
// Used outside Claude (e.g. GitHub Pages) so the demo always works.
import { seedDemo } from "./seed.js";

const KEY = "kerb.demo.v3"; // v3: accounts, contracts, events

export function createLocalBackend() {
  const docs = new Map();
  try { const raw = localStorage.getItem(KEY); if (raw) for (const [k, v] of JSON.parse(raw)) docs.set(k, v); } catch (e) {}
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify([...docs])); } catch (e) {} }, 250); };
  const parent = p => p.slice(0, p.lastIndexOf("/"));
  const idOf = p => p.slice(p.lastIndexOf("/") + 1);
  const clone = v => JSON.parse(JSON.stringify(v));
  const watchers = new Set();
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("kerb-demo") : null;

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
      case "==": return x === v; case "!=": return x !== v;
      case "<": return x < v; case "<=": return x <= v; case ">": return x > v; case ">=": return x >= v;
      case "in": return Array.isArray(v) && v.includes(x);
      case "array-contains": return Array.isArray(x) && x.includes(v);
      default: return false;
    }
  }
  function runQuery(path, q = {}) {
    let out = [];
    for (const [p, d] of docs) if (parent(p) === path) out.push(Object.assign({ id: idOf(p) }, clone(d)));
    for (const w of q.where || []) out = out.filter(d => match(d, w));
    if (q.orderBy) { const [f, dir] = q.orderBy, s = dir === "desc" ? -1 : 1; out.sort((a, b) => (a[f] === undefined) - (b[f] === undefined) || (a[f] < b[f] ? -s : a[f] > b[f] ? s : 0)); }
    if (q.limit) out = out.slice(0, q.limit);
    return out;
  }
  let pendingNotify = new Set(), notifyQueued = false;
  function notify(path) {
    pendingNotify.add(path);
    if (notifyQueued) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      const paths = [...pendingNotify]; pendingNotify = new Set();
      const fired = new Set();
      for (const w of watchers) for (const p of paths) if (!fired.has(w) && (w.kind === "doc" ? w.path === p : w.path === parent(p))) { fired.add(w); w.fire(); }
    });
  }
  function apply(path, data, broadcast = true) {
    if (data === null) docs.delete(path); else docs.set(path, data);
    save(); notify(path);
    if (broadcast && bc) bc.postMessage({ path, data });
  }
  if (bc) bc.onmessage = e => { const m = e.data || {}; if (m.path) apply(m.path, m.data, false); };

  if (!docs.size) { seedDemo((p, d) => docs.set(p, d)); save(); }

  const api = {
    mode: "demo",
    me: { id: "me", name: "You" },
    canWrite: true, isOwner: true,
    watchCol(path, q, cb) { const w = { kind: "col", path, fire: () => cb(runQuery(path, q)) }; watchers.add(w); queueMicrotask(w.fire); return () => watchers.delete(w); },
    watchDoc(path, cb) { const w = { kind: "doc", path, fire: () => cb(docs.has(path) ? Object.assign({ id: idOf(path) }, clone(docs.get(path))) : null) }; watchers.add(w); queueMicrotask(w.fire); return () => watchers.delete(w); },
    async getCol(path, q) { return runQuery(path, q); },
    async getDoc(path) { return docs.has(path) ? Object.assign({ id: idOf(path) }, clone(docs.get(path))) : null; },
    async set(p, d) { apply(p, clone(d)); },
    async update(p, d) { if (!docs.has(p)) throw { code: "invalid_argument", message: "missing" }; apply(p, merge(docs.get(p), clone(d))); },
    async del(p) { apply(p, null); },
    async add(colPath, d) { const id = api.newId(); apply(colPath + "/" + id, clone(d)); return id; },
    newId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    async profiles(ids) { const out = {}; for (const id of [].concat(ids)) out[id] = { id, name: id === "me" ? "You" : "", avatarUrl: "", color: "#71717A" }; return out; },
    async lease(path, holder, ttlMs) {
      const k = "kerb.lease." + path;
      try {
        const cur = JSON.parse(localStorage.getItem(k) || "null");
        if (cur && cur.holder !== holder && cur.until > Date.now()) return false;
        localStorage.setItem(k, JSON.stringify({ holder, until: Date.now() + ttlMs }));
        return true;
      } catch (e) { return true; }
    },
    ai: null,
    download(filename, data) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return Promise.resolve({ saved: true });
    },
    async loadExtras() {},
    resetDemo() { try { localStorage.removeItem(KEY); Object.keys(localStorage).filter(k => k.startsWith("kerb.")).forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); },
  };
  return api;
}
