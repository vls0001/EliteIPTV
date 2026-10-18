// Central app state, render scheduling, subscriptions and shared helpers.
import { APP, ROLES } from "./config.js";
import { store, toast } from "./lib/dom.js";

export const S = {
  api: null,
  me: null,
  // data
  users: {},        // uid -> profile doc
  profiles: {},     // uid -> {name, avatarUrl, color}
  servers: {},      // sid -> server doc
  dms: {},          // dmId -> dm doc
  friends: [],      // friend docs involving me
  inbox: [],
  reads: {},
  peers: [],
  channels: [],     // channels of the open server
  members: {},      // uid -> member doc (open server)
  bans: {},
  msgs: [],         // open conversation
  msgsReady: false,
  threadMsgs: [],
  // view
  view: store.get("view", "home"),   // "home" | "explore" | serverId
  chanBy: store.get("chanBy", {}),   // serverId -> channelId
  homeTab: store.get("homeTab", "friends"), // "friends" | dmId
  panel: store.get("panel", "members"),     // "members" | "pins" | "search" | "inbox" | "thread" | null
  mobileScreen: "nav",               // "nav" | "main"
  thread: null,                      // {path, parent}
  replyTo: null,
  editing: null,
  translations: {},
  catchup: null,
  searchQ: "",
  searchResults: null,
  voice: null,                       // "sid/cid" when in a hangout
  lastSent: {},
};

// ---------- render scheduling ----------
const renderers = {};
const pending = new Set();
let raf = 0;
export function register(name, fn) { renderers[name] = fn; }
export function schedule(...names) {
  for (const n of names) pending.add(n);
  if (!raf) raf = (window.requestAnimationFrame || setTimeout)(flush);
}
export function scheduleAll() { schedule(...Object.keys(renderers)); }
function flush() {
  raf = 0;
  const list = [...pending]; pending.clear();
  for (const n of list) { try { renderers[n] && renderers[n](); } catch (e) { console.error("render " + n, e); } }
}

// ---------- subscriptions ----------
const subs = {};
export function sub(key, unsubscribe) { if (subs[key]) subs[key](); subs[key] = unsubscribe; }
export function unsub(key) { if (subs[key]) { subs[key](); delete subs[key]; } }

// ---------- people ----------
const wanted = new Set();
let profTimer = null;
export function want(ids) {
  let added = false;
  for (const id of [].concat(ids)) if (id && id !== APP.botId && id !== "system" && !S.profiles[id] && !wanted.has(id)) { wanted.add(id); added = true; }
  if (added && !profTimer) profTimer = setTimeout(loadProfiles, 30);
}
async function loadProfiles() {
  profTimer = null;
  const ids = [...wanted]; wanted.clear();
  if (!ids.length || !S.api) return;
  try {
    const ps = await S.api.profiles(ids);
    for (const id in ps) S.profiles[id] = ps[id];
    scheduleAll();
  } catch (e) {}
}
export function nameOf(uid) {
  if (uid === APP.botId) return APP.botName;
  if (uid === "system") return APP.name;
  const p = S.profiles[uid];
  if (p && p.name) return p.name;
  if (uid === S.me) return (S.api && S.api.me.name) || "You";
  if (!p) want(uid);
  return "Someone";
}
export function colorOf(uid) {
  const p = S.profiles[uid];
  return (S.users[uid] && S.users[uid].banner) || (p && p.color) || "#71717A";
}

export function statusOf(uid) {
  const u = S.users[uid] || {};
  const online = S.peers.some(p => p.uid === uid);
  if (!online && uid !== S.me) return "offline";
  if (u.status === "invisible") return uid === S.me ? "invisible" : "offline";
  return u.status || "online";
}
export function presenceOf(uid) {
  const list = S.peers.filter(p => p.uid === uid);
  return list.find(p => p.sameTab) ? list.find(p => p.sameTab).presence : (list[0] && list[0].presence) || {};
}
export const isBlocked = uid => ((S.users[S.me] && S.users[S.me].blocked) || []).includes(uid);

// ---------- servers & permissions ----------
export const server = () => S.servers[S.view] || null;
export const myServers = () => ((S.users[S.me] && S.users[S.me].servers) || []).filter(id => S.servers[id]);
export function roleOf(uid) {
  const sv = server();
  if (sv && sv.ownerId === uid) return "owner";
  const m = S.members[uid];
  return (m && m.role) || "member";
}
export const rank = uid => ROLES[roleOf(uid)].rank;
export const isMod = () => !!server() && rank(S.me) >= 2;
export const isOwner = () => !!server() && roleOf(S.me) === "owner";
export const isMember = () => !!server() && !!S.members[S.me];
export function canModerate(uid) { return isMod() && uid !== S.me && rank(S.me) > rank(uid); }
export function isMuted() {
  const m = S.members[S.me];
  return !!(m && m.mutedUntil && m.mutedUntil > Date.now());
}

// ---------- conversations ----------
export function currentChannel() {
  const sv = server(); if (!sv) return null;
  const cid = S.chanBy[S.view];
  return S.channels.find(c => c.id === cid && c.type !== "voice") || null;
}
export function conv() {
  if (S.view === "home") {
    const dm = S.dms[S.homeTab];
    if (!dm) return null;
    return { kind: "dm", key: "dm:" + dm.id, path: "dms/" + dm.id + "/messages", parentPath: "dms/" + dm.id, dm, title: dmTitle(dm) };
  }
  const sv = server(), ch = currentChannel();
  if (!sv || !ch) return null;
  return { kind: "channel", key: S.view + "/" + ch.id, path: "servers/" + S.view + "/channels/" + ch.id + "/messages", parentPath: "servers/" + S.view + "/channels/" + ch.id, server: sv, channel: ch, title: ch.name };
}
export function dmTitle(dm) {
  if (dm.name) return dm.name;
  const others = (dm.members || []).filter(u => u !== S.me);
  return others.length ? others.map(nameOf).join(", ") : "Just you";
}
export const dmIdFor = (a, b) => [a, b].sort().join("__");

// ---------- unread ----------
export function isUnread(key, lastAt, lastBy) {
  if (!lastAt || lastBy === S.me) return false;
  return lastAt > (S.reads[key] || 0);
}
let readTimer = null;
export function markRead(key, at) {
  if (!key || !at || (S.reads[key] || 0) >= at) return;
  S.reads = Object.assign({}, S.reads, { [key]: at });
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    if (!S.api) return;
    S.api.set("data/users/" + S.me + "/reads", S.reads).catch(() => {});
  }, 800);
  schedule("rail", "sidebar", "tabs", "title");
}
export function serverUnread(sid) {
  const sv = S.servers[sid]; if (!sv) return false;
  return isUnread("srv:" + sid, sv.lastAt, sv.lastBy);
}
export function unreadMentions() {
  const since = S.reads["inbox"] || 0;
  return S.inbox.filter(i => i.at > since).length;
}
export function pendingFriendCount() { return S.friends.filter(f => f.state === "pending" && f.from !== S.me).length; }

// ---------- navigation ----------
export function go(view, opts = {}) {
  S.view = view; store.set("view", view);
  if (opts.channel) { S.chanBy[view] = opts.channel; store.set("chanBy", S.chanBy); }
  if (opts.dm) { S.homeTab = opts.dm; store.set("homeTab", opts.dm); }
  if (opts.main) S.mobileScreen = "main";
  S.replyTo = null; S.editing = null; S.catchup = null;
  if (S.panel === "thread" || S.panel === "search") setPanel(null);
  document.dispatchEvent(new CustomEvent("roost:navigate"));
}
export function setPanel(p) {
  S.panel = p; if (p !== "thread") S.thread = null;
  if (p !== "thread" && p !== "search") store.set("panel", p);
  schedule("panel", "header", "layout");
}

// ---------- writes with friendly errors ----------
export async function write(fn, what = "do that") {
  try { return await fn(); }
  catch (e) {
    const code = e && e.code;
    if (code === "invalid_argument") toast("You don't have permission to " + what + ".", "bad");
    else if (code === "quota_exceeded") toast("Storage is full. Delete some old messages or uploads first.", "bad");
    else if (code === "resource_exhausted") toast("Slow down a little, then try again.", "bad");
    else if (code === "too_big") toast(e.message, "bad");
    else toast("Couldn't " + what + ". Check your connection and try again.", "bad");
    console.warn(e);
    return null;
  }
}
