// Right-hand panels: members, pins, search, inbox (mentions), thread.
import { APP, ROLES, STATUSES } from "../config.js";
import { h, fill, icon, toast, stamp, relTime } from "../lib/dom.js";
import { renderText, plain } from "../lib/text.js";
import { S, conv, nameOf, statusOf, presenceOf, roleOf, rank, server, setPanel, go, schedule, write, sub, unsub, markRead } from "../state.js";
import { avatar, nameEl, openProfile } from "./people.js";
import { messageEl, scrollToMsg } from "./messages.js";

export function renderPanel(box) {
  const p = S.panel;
  const c = conv();
  if (!p || (!c && p !== "inbox")) { fill(box); box.hidden = true; unsub("pins"); return; }
  box.hidden = false;
  if (p === "search" && box.dataset.mode === "search" && box.dataset.key === c.key && !S.forcePanel) return;
  S.forcePanel = false;
  box.dataset.mode = p; box.dataset.key = c ? c.key : "";
  const titles = { members: "Members", pins: "Pinned messages", search: "Search", inbox: "Mentions", thread: "Thread" };
  const body = h("div", { class: "panel-body" });
  fill(box,
    h("div", { class: "panel-hd" }, h("b", { text: titles[p] }), h("button", { type: "button", class: "ibtn", "aria-label": "Close panel", onclick: () => setPanel(null) }, icon("x", 18))),
    body);
  if (p !== "pins") unsub("pins");
  if (p === "members") members(body, c);
  else if (p === "pins") pins(body, c);
  else if (p === "search") search(body, c);
  else if (p === "inbox") inbox(body);
  else if (p === "thread") thread(body);
}

// ---------- members ----------
function members(body, c) {
  let ids;
  if (c.kind === "dm") ids = c.dm.members.slice();
  else ids = Object.keys(S.members);
  const online = ids.filter(u => statusOf(u) !== "offline").sort((a, b) => rank(b) - rank(a) || nameOf(a).localeCompare(nameOf(b)));
  const offline = ids.filter(u => statusOf(u) === "offline").sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const row = uid => {
    const u = S.users[uid] || {};
    const pres = presenceOf(uid);
    const sub = pres.voice ? "🔊 In a hangout" : u.activity || u.custom || "";
    return h("button", { type: "button", class: "mem" + (statusOf(uid) === "offline" ? " off" : ""), onclick: () => openProfile(uid) },
      avatar(uid, 34, { status: true }), h("span", { class: "mem-txt" }, h("span", { class: "mem-name" }, nameEl(uid), uid === S.me && nameOf(uid) !== "You" ? h("span", { class: "dim", text: " (you)" }) : null), sub ? h("small", { text: sub }) : null));
  };
  if (c.kind === "channel") {
    const groups = {};
    for (const uid of online) { const r = roleOf(uid); (groups[r] = groups[r] || []).push(uid); }
    for (const r of ["owner", "mod", "member"]) if (groups[r]) body.append(h("div", { class: "grp" }, h("span", { text: (r === "member" ? "Online" : ROLES[r].label + "s") + " — " + groups[r].length })), ...groups[r].map(row));
  } else if (online.length) body.append(h("div", { class: "grp" }, h("span", { text: "Online — " + online.length })), ...online.map(row));
  if (offline.length) body.append(h("div", { class: "grp" }, h("span", { text: "Offline — " + offline.length })), ...offline.map(row));
  if (!ids.length) body.append(h("p", { class: "dim pad", text: "Nobody here yet." }));
}

// ---------- pins ----------
let pinsKey = null;
function pins(body, c) {
  if (pinsKey !== c.key) {
    pinsKey = c.key;
    S.pins = null;
    sub("pins", S.api.watchCol(c.path, { where: [["pinned", "==", true]], limit: 50 }, rows => { S.pins = rows.sort((a, b) => b.at - a.at); schedule("panel"); }, () => { S.pins = []; schedule("panel"); }));
  }
  if (!S.pins) { body.append(h("p", { class: "dim pad", text: "Loading…" })); return; }
  if (!S.pins.length) { body.append(h("div", { class: "empty" }, icon("pin", 28), h("b", { text: "No pinned messages" }), h("span", { text: "Pin important messages from the ⋯ menu on any message." }))); return; }
  for (const m of S.pins) body.append(resultCard(m, c.title, () => scrollToMsg(m.id)));
}
export function resetPins() { pinsKey = null; unsub("pins"); }

function resultCard(m, where, onclick) {
  const ctx = { me: S.me, nameOf, emoji: (server() && server().emoji) || {} };
  const t = h("div", { class: "res-text" }); t.append(renderText(m.text || (m.poll && m.poll.q) || (m.files ? "📎 " + m.files.map(f => f.name).join(", ") : ""), ctx));
  return h("button", { type: "button", class: "res", onclick },
    h("div", { class: "res-hd" }, avatar(m.by, 22), h("b", { text: nameOf(m.by) }), where ? h("span", { class: "dim", text: "in " + where }) : null, h("time", { class: "dim", text: stamp(m.at) })), t);
}

// ---------- search ----------
function search(body, c) {
  const input = h("input", { class: "input", id: "search-q", placeholder: c.kind === "channel" ? "Search " + c.server.name : "Search this chat", value: S.searchQ, autocomplete: "off" });
  const results = h("div", { class: "res-list" });
  const form = h("form", { class: "search-form", onsubmit: e => { e.preventDefault(); run(); } }, input, h("button", { type: "submit", class: "btn primary" }, icon("search", 16)));
  body.append(form,
    h("div", { class: "search-tips dim" }, "Tips: ", h("code", { text: "from:sam" }), " ", h("code", { text: "has:file" }), " ", h("code", { text: "has:link" })),
    results);
  setTimeout(() => input.focus(), 30);
  if (S.searchResults) draw();

  async function run() {
    S.searchQ = input.value.trim();
    if (!S.searchQ) { S.searchResults = null; fill(results); return; }
    fill(results, h("p", { class: "dim pad", text: "Searching…" }));
    let pool = [];
    if (c.kind === "channel") {
      for (const ch of S.channels.filter(x => x.type !== "voice")) {
        const path = "servers/" + c.server.id + "/channels/" + ch.id + "/messages";
        const rows = ch.id === c.channel.id ? S.msgs : await S.api.getCol(path, { orderBy: ["at", "desc"], limit: 200 }).catch(() => []);
        pool.push(...rows.map(m => Object.assign({}, m, { _ch: ch })));
      }
    } else pool = S.msgs.slice();
    S.searchResults = filter(pool, S.searchQ).sort((a, b) => b.at - a.at).slice(0, 60);
    draw();
  }
  function draw() {
    const list = S.searchResults || [];
    fill(results, h("div", { class: "dim small pad", text: list.length + (list.length === 1 ? " result" : " results") }),
      list.map(m => resultCard(m, m._ch ? "#" + m._ch.name : "", () => {
        if (m._ch && m._ch.id !== (conv() && conv().channel && conv().channel.id)) { S.jumpTo = m.id; go(S.view, { channel: m._ch.id, main: true }); setPanel("search"); }
        else scrollToMsg(m.id);
      })));
  }
}

function filter(pool, q) {
  let words = q.toLowerCase().split(/\s+/);
  let from = null, has = null;
  words = words.filter(w => {
    if (w.startsWith("from:")) { from = w.slice(5); return false; }
    if (w.startsWith("has:")) { has = w.slice(4); return false; }
    return true;
  });
  return pool.filter(m => {
    if (from && !nameOf(m.by).toLowerCase().includes(from)) return false;
    if (has === "file" && !(m.files && m.files.length)) return false;
    if (has === "image" && !(m.files || []).some(f => /^image\//.test(f.type))) return false;
    if (has === "link" && !/https?:\/\//.test(m.text || "")) return false;
    if (has === "poll" && m.kind !== "poll") return false;
    const text = plain(m.text || "", nameOf).toLowerCase() + " " + ((m.poll && m.poll.q) || "").toLowerCase();
    return words.every(w => text.includes(w));
  });
}

// ---------- inbox ----------
function inbox(body) {
  const since = S.reads["inbox"] || 0;
  body.append(h("div", { class: "row-btns pad" }, h("button", { type: "button", class: "btn sm", onclick: () => { markRead("inbox", Date.now()); schedule("panel"); } }, icon("check", 14), "Mark all read")));
  if (!S.inbox.length) { body.append(h("div", { class: "empty" }, icon("at", 28), h("b", { text: "No mentions yet" }), h("span", { text: "When someone @mentions you or replies to you, it shows up here." }))); return; }
  for (const it of S.inbox) {
    const where = it.where || {};
    const sv = where.sid && S.servers[where.sid];
    const label = sv ? sv.name : where.dm ? "Direct message" : "";
    const ctx = { me: S.me, nameOf, emoji: (sv && sv.emoji) || {} };
    const t = h("div", { class: "res-text" }); t.append(renderText(it.text || "", ctx));
    body.append(h("button", { type: "button", class: "res" + (it.at > since ? " new" : ""), onclick: () => {
      S.jumpTo = it.mid;
      if (where.dm) go("home", { dm: where.dm, main: true });
      else if (where.sid) go(where.sid, { channel: where.cid, main: true });
    } }, h("div", { class: "res-hd" }, avatar(it.by, 22), h("b", { text: nameOf(it.by) }), h("span", { class: "dim", text: (it.kind === "reply" ? "replied" : "mentioned you") + (label ? " · " + label : "") }), h("time", { class: "dim", text: relTime(it.at) })), t));
  }
}

// ---------- thread ----------
function thread(body) {
  const t = S.thread;
  if (!t) { setPanel(null); return; }
  const parentLive = S.msgs.find(m => m.id === t.parent.id) || t.parent;
  const ctx = { path: t.path, isThread: true, conv: conv() };
  const list = h("div", { class: "thread-list" });
  list.append(h("div", { class: "thread-parent" }, messageEl(parentLive, null, { path: t.path.replace(/\/[^/]+\/replies$/, ""), isThread: true, conv: conv() })));
  list.append(h("div", { class: "day" }, h("span", { text: S.threadMsgs.length + (S.threadMsgs.length === 1 ? " reply" : " replies") })));
  let prev = null;
  for (const m of S.threadMsgs) { list.append(messageEl(m, prev, ctx)); prev = m; }
  const input = h("textarea", { class: "msg-input", id: "thread-input", rows: 1, placeholder: "Reply in thread", maxlength: 4000, "aria-label": "Reply in thread" });
  input.value = S.threadDraft || "";
  input.addEventListener("input", () => { S.threadDraft = input.value; });
  input.addEventListener("focus", () => { S.threadFocus = true; });
  input.addEventListener("blur", () => { S.threadFocus = false; });
  if (S.threadFocus) setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 0);
  const send = async () => {
    const text = input.value.trim(); if (!text) return;
    input.value = ""; S.threadDraft = "";
    const at = Date.now();
    const id = await write(() => S.api.add(t.path, { by: S.me, text, at, kind: "text" }), "reply");
    if (id === null) return;
    S.api.update(t.parentPath, { threadCount: S.threadMsgs.length + 1, threadLastAt: at }).catch(() => {});
    if (parentLive.by !== S.me && parentLive.by !== APP.botId && parentLive.by !== "system") {
      const c = conv();
      if (c) S.api.add("inbox/" + parentLive.by + "/items", { by: S.me, at, text: text.slice(0, 200), where: c.kind === "channel" ? { sid: c.server.id, cid: c.channel.id } : { dm: c.dm.id }, mid: parentLive.id, kind: "reply" }).catch(() => {});
    }
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  body.append(list);
  if (S.api.canWrite) body.append(h("div", { class: "thread-composer" }, input, h("button", { type: "button", class: "cbtn send", "aria-label": "Send reply", onclick: send }, icon("send", 18))));
  setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);
}
