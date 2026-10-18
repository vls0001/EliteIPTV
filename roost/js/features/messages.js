// Message list: rendering, grouping, reactions, edit/delete/pin, replies, threads, attachments.
import { APP, QUICK_REACTIONS, EMOJI } from "../config.js";
import { h, fill, icon, menu, modal, toast, fmtTime, dayLabel, stamp, relTime, fmtSize, confirmBox, copyText, isMobile, closeMenus } from "../lib/dom.js";
import { renderText, plain } from "../lib/text.js";
import { S, nameOf, conv, server, isMod, isBlocked, schedule, setPanel, write, markRead, roleOf } from "../state.js";
import { avatar, nameEl, openProfile } from "./people.js";
import { pollCard, gameCard, rollCard, watchCard } from "./widgets.js";
import { translate, aiReady } from "./ai.js";

const GROUP_MS = 7 * 60 * 1000;
const textCtx = () => ({ me: S.me, nameOf, emoji: (server() && server().emoji) || {} });

// ---------- emoji picker ----------
export function emojiPicker(anchor, onPick) {
  const custom = (server() && server().emoji) || {};
  const grid = h("div", { class: "emoji-grid" });
  const tabs = h("div", { class: "emoji-tabs" });
  const cats = Object.assign(Object.keys(custom).length ? { Server: Object.keys(custom).map(k => ":" + k + ":") } : {}, EMOJI);
  const show = cat => {
    tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.cat === cat));
    fill(grid, cats[cat].map(e => h("button", { type: "button", class: "emoji-btn", title: e, onclick: () => { onPick(e); m.close(); } },
      e.startsWith(":") ? h("img", { class: "cemoji", src: custom[e.slice(1, -1)], alt: e }) : e)));
  };
  for (const c in cats) tabs.append(h("button", { type: "button", class: "emoji-tab", dataset: { cat: c }, title: c, onclick: () => show(c) }, c === "Server" ? "★" : cats[c][0]));
  const m = menu(anchor, [h("div", { class: "emoji-pick" }, tabs, grid)]);
  m.el.classList.add("emoji-menu");
  show(Object.keys(cats)[0]);
  return m;
}

// ---------- actions ----------
export function toggleReaction(path, m, emoji) {
  const has = !!(m.reactions && m.reactions[emoji] && m.reactions[emoji][S.me]);
  return write(() => S.api.update(path, { reactions: { [emoji]: { [S.me]: !has } } }), "react");
}
export async function deleteMessage(path, m, skipConfirm) {
  if (!skipConfirm && !(await confirmBox("Delete message?", "This can't be undone.", "Delete", true))) return;
  write(() => S.api.del(path), "delete that message");
}
export function togglePin(path, m) {
  return write(async () => { await S.api.update(path, { pinned: !m.pinned }); toast(m.pinned ? "Unpinned." : "Pinned to this conversation.", "ok"); }, "pin that message");
}
export function startReply(m) {
  S.replyTo = { id: m.id, by: m.by, text: plain(m.text || "", nameOf).slice(0, 120) || "attachment" };
  schedule("composer");
  setTimeout(() => { const i = document.getElementById("msg-input"); if (i) i.focus(); }, 30);
}
export function openThread(c, m) {
  S.thread = { path: c.path + "/" + m.id + "/replies", parentPath: c.path + "/" + m.id, parent: m, convKey: c.key };
  setPanel("thread");
}
export function startEdit(m) { S.editing = m.id; schedule("feed", "thread"); }
async function saveEdit(path, m, text) {
  text = text.trim();
  S.editing = null;
  if (!text) { deleteMessage(path, m); return; }
  if (text !== m.text) await write(() => S.api.update(path, { text, edited: Date.now() }), "edit that message");
  schedule("feed", "thread");
}

export function scrollToMsg(id) {
  const el = document.getElementById("msg-" + id);
  if (!el) { toast("That message is too far back to show."); return; }
  el.scrollIntoView({ block: "center", behavior: document.documentElement.dataset.motion === "0" ? "auto" : "smooth" });
  el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600);
}

function canDelete(m) { return m.by === S.me || (S.view !== "home" ? isMod() : m.by === APP.botId); }

function moreMenu(anchor, path, m, ctx) {
  const items = [];
  items.push({ label: "Add reaction", icon: "smile", onClick: () => emojiPicker(anchor, e => toggleReaction(path, m, e)) });
  if (!ctx.isThread) items.push({ label: "Reply", icon: "reply", onClick: () => startReply(m) });
  if (!ctx.isThread && ctx.conv && ctx.conv.kind === "channel") items.push({ label: "Open thread", icon: "thread", onClick: () => openThread(ctx.conv, m) });
  if (m.by === S.me && (m.kind === "text" || !m.kind)) items.push({ label: "Edit", icon: "edit", onClick: () => startEdit(m) });
  if (!ctx.isThread && (S.view === "home" || isMod())) items.push({ label: m.pinned ? "Unpin" : "Pin", icon: "pin", onClick: () => togglePin(path, m) });
  if (m.text) items.push({ label: "Copy text", icon: "copy", onClick: async () => toast((await copyText(plain(m.text, nameOf))) ? "Copied." : "Couldn't copy. Select the text instead.") });
  if (m.text && aiReady()) items.push({ label: S.translations[m.id] ? "Hide translation" : "Translate", icon: "translate", onClick: () => { if (S.translations[m.id]) { delete S.translations[m.id]; schedule("feed", "thread"); } else translate(m); } });
  if (m.by !== S.me && m.by !== APP.botId && m.by !== "system") items.push({ label: "View profile", icon: "user", onClick: () => openProfile(m.by) });
  if (canDelete(m)) { items.push("-"); items.push({ label: "Delete", icon: "trash", danger: true, onClick: () => deleteMessage(path, m) }); }
  const header = isMobile() ? h("div", { class: "sheet-reacts" }, QUICK_REACTIONS.map(e => h("button", { type: "button", class: "emoji-btn", onclick: () => { closeMenus(); toggleReaction(path, m, e); } }, e))) : null;
  menu(anchor, items, { header });
}

// ---------- one message ----------
export function messageEl(m, prev, ctx) {
  const path = ctx.path + "/" + m.id;
  const grouped = prev && prev.by === m.by && m.at - prev.at < GROUP_MS && !m.replyTo && isPlain(m) && isPlain(prev) && dayLabel(prev.at) === dayLabel(m.at);
  const mentionsMe = (m.text || "").includes("<@" + S.me + ">") || (/@everyone|@here/.test(m.text || "") && m.by !== S.me) || (m.replyTo && m.replyTo.by === S.me && m.by !== S.me);

  if (m.kind === "system") {
    return h("div", { class: "msg system", id: "msg-" + m.id }, h("span", { class: "sys-ic" }, icon("bolt", 14)), h("span", {}, h("b", { text: nameOf(m.subject || m.by) }), " " + (m.text || "")), h("time", { text: stamp(m.at) }));
  }
  if (isBlocked(m.by)) {
    const el = h("div", { class: "msg blocked", id: "msg-" + m.id }, h("span", { class: "dim", text: "Blocked message" }), h("button", { type: "button", class: "link-btn", onclick: () => { el.replaceWith(messageEl(Object.assign({}, m), null, Object.assign({}, ctx, { forceShow: true }))); } }, "Show"));
    if (!ctx.forceShow) return el;
  }

  const row = h("div", { class: "msg" + (grouped ? " grouped" : "") + (mentionsMe ? " mentioned" : "") + (m.pinned && !ctx.isThread ? " pinned" : ""), id: "msg-" + m.id });
  if (m.replyTo) {
    row.append(h("button", { type: "button", class: "reply-ref", onclick: () => scrollToMsg(m.replyTo.id) }, icon("reply", 12), avatar(m.replyTo.by, 16), h("b", { text: nameOf(m.replyTo.by) }), h("span", { text: m.replyTo.text || "" })));
  }
  const gutter = grouped ? h("time", { class: "gtime", text: fmtTime(m.at) }) : h("button", { type: "button", class: "av-btn", "aria-label": nameOf(m.by) + " profile", onclick: () => openProfile(m.by) }, avatar(m.by, 40));
  const body = h("div", { class: "msg-body" });
  if (!grouped) {
    body.append(h("div", { class: "msg-hd" },
      h("button", { type: "button", class: "name-btn", onclick: () => openProfile(m.by) }, nameEl(m.by)),
      m.by === APP.botId ? h("span", { class: "tag", text: "AI" }) : null,
      S.view !== "home" && roleOf(m.by) !== "member" && m.by !== APP.botId ? h("span", { class: "tag role-" + roleOf(m.by), text: roleOf(m.by) === "owner" ? "Owner" : "Mod" }) : null,
      h("time", { text: stamp(m.at), title: new Date(m.at).toLocaleString() })));
  }
  if (S.editing === m.id) {
    const ta = h("textarea", { class: "input edit-box", rows: 2, value: m.text || "", "aria-label": "Edit message" });
    ta.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(path, m, ta.value); }
      if (e.key === "Escape") { e.stopPropagation(); S.editing = null; schedule("feed", "thread"); }
    });
    body.append(ta, h("div", { class: "edit-hint dim" }, "Enter to save · Esc to cancel"));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20);
  } else if (m.text && m.kind !== "poll") {
    const p = h("div", { class: "msg-text" });
    p.append(renderText(m.text, textCtx()));
    if (m.edited) p.append(h("span", { class: "edited", title: "Edited " + stamp(m.edited), text: " (edited)" }));
    body.append(p);
  }
  if (S.translations[m.id]) body.append(h("div", { class: "translation" }, icon("translate", 13), h("span", { text: S.translations[m.id] })));
  if (m.files && m.files.length) body.append(h("div", { class: "files" }, m.files.map(fileEl)));
  const card = m.kind === "poll" ? pollCard(m, path) : m.kind === "game" ? gameCard(m, path) : m.kind === "roll" ? rollCard(m) : m.kind === "watch" ? watchCard(m, path) : null;
  if (card) body.append(card);

  const reacts = Object.entries(m.reactions || {}).map(([e, who]) => [e, Object.keys(who).filter(u => who[u])]).filter(([, w]) => w.length);
  if (reacts.length) {
    body.append(h("div", { class: "reacts" }, reacts.map(([e, who]) => h("button", {
      type: "button", class: "react" + (who.includes(S.me) ? " mine" : ""), title: who.map(nameOf).join(", ") + " reacted " + e,
      onclick: () => toggleReaction(path, m, e),
    }, e.startsWith(":") && textCtx().emoji[e.slice(1, -1)] ? h("img", { class: "cemoji", src: textCtx().emoji[e.slice(1, -1)], alt: e }) : e, h("span", { text: who.length }))),
    h("button", { type: "button", class: "react add", "aria-label": "Add reaction", onclick: ev => emojiPicker(ev.currentTarget, e => toggleReaction(path, m, e)) }, icon("smile", 14))));
  }
  if (!ctx.isThread && m.threadCount) {
    body.append(h("button", { type: "button", class: "thread-sum", onclick: () => openThread(ctx.conv, m) }, icon("thread", 14), h("b", { text: m.threadCount + (m.threadCount === 1 ? " reply" : " replies") }), m.threadLastAt ? h("span", { class: "dim", text: "Last reply " + relTime(m.threadLastAt) }) : null));
  }
  row.append(gutter, body);

  // hover toolbar
  if (S.editing !== m.id && S.api.canWrite) {
    const tools = h("div", { class: "msg-tools" });
    for (const e of QUICK_REACTIONS.slice(0, 3)) tools.append(h("button", { type: "button", class: "tool emoji", title: "React " + e, onclick: () => toggleReaction(path, m, e) }, e));
    if (!ctx.isThread) tools.append(h("button", { type: "button", class: "tool", title: "Reply", "aria-label": "Reply", onclick: () => startReply(m) }, icon("reply", 16)));
    if (!ctx.isThread && ctx.conv && ctx.conv.kind === "channel") tools.append(h("button", { type: "button", class: "tool", title: "Thread", "aria-label": "Open thread", onclick: () => openThread(ctx.conv, m) }, icon("thread", 16)));
    if (m.by === S.me && (m.kind === "text" || !m.kind)) tools.append(h("button", { type: "button", class: "tool", title: "Edit", "aria-label": "Edit", onclick: () => startEdit(m) }, icon("edit", 16)));
    const more = h("button", { type: "button", class: "tool", title: "More", "aria-label": "More actions" }, icon("more", 16));
    more.addEventListener("click", () => moreMenu(more, path, m, ctx));
    tools.append(more);
    row.append(tools);
    // long-press on phones
    let pressT = null;
    row.addEventListener("touchstart", () => { pressT = setTimeout(() => { pressT = null; moreMenu(row, path, m, ctx); }, 450); }, { passive: true });
    ["touchend", "touchmove", "touchcancel"].forEach(ev => row.addEventListener(ev, () => clearTimeout(pressT), { passive: true }));
  }
  return row;
}

const isPlain = m => !m.kind || m.kind === "text" || m.kind === "bot";

function fileEl(f) {
  if (/^image\//.test(f.type)) return h("button", { type: "button", class: "file-img", onclick: () => modal({ body: h("img", { class: "lightbox-img", src: f.url, alt: f.name }), className: "lightbox", actions: [h("a", { class: "btn", href: f.url, target: "_blank", rel: "noopener" }, "Open original")] }) }, h("img", { src: f.url, alt: f.name, loading: "lazy" }));
  if (/^video\//.test(f.type)) return h("video", { class: "file-video", src: f.url, controls: true, preload: "metadata" });
  if (/^audio\//.test(f.type)) return h("audio", { class: "file-audio", src: f.url, controls: true });
  return h("a", { class: "file-chip", href: f.url, target: "_blank", rel: "noopener" }, icon("clip", 16), h("span", { class: "grow", text: f.name }), h("span", { class: "dim", text: fmtSize(f.size || 0) }));
}

// ---------- the feed ----------
export function renderFeed(feed) {
  const c = conv();
  const inner = feed.querySelector(".feed-inner") || feed.appendChild(h("div", { class: "feed-inner" }));
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 140 || S.stickBottom;
  const keepFrom = atBottom ? null : feed.scrollHeight - feed.scrollTop;
  const nodes = [];
  if (!c) { fill(inner); return; }
  if (!S.msgsReady) {
    for (let i = 0; i < 6; i++) nodes.push(h("div", { class: "msg skeleton" }, h("span", { class: "sk av" }), h("div", { class: "msg-body" }, h("span", { class: "sk line", style: { width: 20 + (i * 37 % 50) + "%" } }), h("span", { class: "sk line", style: { width: 40 + (i * 53 % 50) + "%" } }))));
    fill(inner, nodes); return;
  }
  if (S.msgs.length >= APP.pageSize) nodes.push(h("div", { class: "older-note dim", text: "Showing the latest " + APP.pageSize + " messages" }));
  else nodes.push(intro(c));
  if (S.catchup && S.catchup.key === c.key) nodes.push(catchupCard());

  const lastRead = S.readAnchor && S.readAnchor.key === c.key ? S.readAnchor.at : Infinity;
  let prev = null, newShown = false, lastDay = "";
  const ctx = { path: c.path, conv: c };
  for (const m of S.msgs) {
    const d = dayLabel(m.at);
    if (d !== lastDay) { nodes.push(h("div", { class: "day" }, h("span", { text: d }))); lastDay = d; prev = null; }
    if (!newShown && m.at > lastRead && m.by !== S.me) { nodes.push(h("div", { class: "new-line" }, h("span", { text: "New" }))); newShown = true; prev = null; }
    nodes.push(messageEl(m, prev, ctx));
    prev = m;
  }
  fill(inner, nodes);
  if (atBottom) { feed.scrollTop = feed.scrollHeight; S.stickBottom = false; }
  else if (keepFrom != null) feed.scrollTop = feed.scrollHeight - keepFrom;
  const last = S.msgs[S.msgs.length - 1];
  if (last && atBottom && document.visibilityState === "visible") markRead(c.key, last.at);
  if (c.kind === "channel" && last && atBottom) markRead("srv:" + c.server.id, Math.max(last.at, c.server.lastAt || 0));
}

function intro(c) {
  if (c.kind === "dm") {
    const others = c.dm.members.filter(u => u !== S.me);
    return h("div", { class: "intro" },
      c.dm.group ? h("span", { class: "av group big" }, icon("users", 36)) : avatar(others[0] || S.me, 72),
      h("h2", { text: c.title }),
      h("p", { class: "muted", text: c.dm.group ? "This is the start of the group chat." : "This is the start of your conversation with " + c.title + "." }));
  }
  return h("div", { class: "intro" },
    h("span", { class: "intro-ic" }, icon(c.channel.type === "announce" ? "announce" : "hash", 34)),
    h("h2", { text: "Welcome to #" + c.channel.name }),
    h("p", { class: "muted", text: c.channel.topic || "This is the start of #" + c.channel.name + ". Say hi!" }));
}

function catchupCard() {
  return h("div", { class: "catchup", id: "catchup" },
    h("div", { class: "catchup-hd" }, icon("sparkle", 16), h("b", { text: "Catch-up" }), h("span", { class: "dim", text: S.catchup.count + " messages" }),
      h("button", { type: "button", class: "ibtn sm", "aria-label": "Dismiss", onclick: () => { S.catchup = null; schedule("feed"); } }, icon("x", 14))),
    h("div", { class: "catchup-body", id: "catchup-body", text: S.catchup.text || "Reading the chat…" }));
}
export function renderCatchupText() {
  const b = document.getElementById("catchup-body");
  if (b && S.catchup) b.textContent = S.catchup.text || "Reading the chat…";
}

// timers on cards (trivia, watch parties)
setInterval(() => {
  let flip = false;
  document.querySelectorAll(".tick[data-ends]").forEach(el => {
    const left = +el.dataset.ends - Date.now();
    if (left <= 0) { flip = true; return; }
    const s = Math.ceil(left / 1000);
    el.textContent = el.dataset.label ? el.dataset.label + s : s + "s left";
  });
  if (flip) schedule("feed", "thread");
}, 500);
