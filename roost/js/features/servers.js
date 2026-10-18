// Servers: rail, channel list, create/join/explore, settings, roles and moderation.
import { APP, ROLES, SERVER_COLORS, SERVER_ICONS } from "../config.js";
import { h, fill, icon, logo, modal, menu, toast, confirmBox, promptBox, copyText, randomCode, store } from "../lib/dom.js";
import { S, server, myServers, nameOf, roleOf, isMod, isOwner, canModerate, isUnread, serverUnread, unreadMentions, pendingFriendCount, go, write, schedule, rank } from "../state.js";
import { avatar, saveMe, toggle } from "./people.js";
import { postMessage } from "./send.js";
import { joinVoice, voicePeers } from "./voice.js";

// ---------- rail ----------
export function renderRail(box) {
  const dmUnread = Object.values(S.dms).some(d => (d.members || []).includes(S.me) && isUnread("dm:" + d.id, d.lastAt, d.lastBy));
  const homeBadge = pendingFriendCount();
  const item = (active, unread, label, content, onclick, extraCls = "") => h("div", { class: "rail-item" + (active ? " on" : "") + (unread ? " unread" : "") },
    h("span", { class: "rail-pill" }),
    h("button", { type: "button", class: "rail-btn " + extraCls, "aria-label": label, title: label, onclick }, content));
  const servers = myServers().map(sid => {
    const sv = S.servers[sid];
    const content = sv.iconUrl ? h("img", { src: sv.iconUrl, alt: "" }) : h("span", { text: sv.icon || sv.name.slice(0, 2) });
    const btn = item(S.view === sid, serverUnread(sid), sv.name, content, () => go(sid, { main: false }), "srv");
    btn.querySelector(".rail-btn").style.setProperty("--sc", sv.color || "var(--panel-2)");
    return btn;
  });
  fill(box,
    item(S.view === "home", dmUnread, "Direct messages", [logo(26), homeBadge ? h("span", { class: "rail-badge", text: homeBadge }) : null], () => go("home"), "home"),
    h("div", { class: "rail-sep" }),
    h("div", { class: "rail-list" }, servers),
    item(false, false, "Create a server", icon("plus", 22), createServerModal, "action"),
    item(S.view === "explore", false, "Explore servers", icon("compass", 22), () => go("explore", { main: true }), "action"));
}

// ---------- server sidebar ----------
export function renderServerSidebar(box) {
  const sv = server();
  if (!sv) { fill(box); return; }
  const hd = h("button", { type: "button", class: "side-hd srv-hd", "aria-label": sv.name + " menu" }, h("b", { class: "grow", text: sv.name }), icon("chevron", 16));
  hd.addEventListener("click", () => serverMenu(hd));
  const text = S.channels.filter(c => c.type !== "voice");
  const voice = S.channels.filter(c => c.type === "voice");
  const cur = S.chanBy[S.view];
  const chBtn = c => {
    const unread = isUnread(S.view + "/" + c.id, c.lastAt, c.lastBy);
    return h("div", { class: "ch-row" },
      h("button", { type: "button", class: "ch" + (c.id === cur ? " on" : "") + (unread ? " unread" : ""), onclick: () => go(S.view, { channel: c.id, main: true }) },
        icon(c.type === "announce" ? "announce" : "hash", 18), h("span", { class: "grow ell", text: c.name }), c.slowmode ? icon("mute", 13, "dim") : null),
      isMod() ? h("button", { type: "button", class: "ch-gear", "aria-label": "Edit #" + c.name, title: "Edit channel", onclick: () => editChannel(c) }, icon("settings", 14)) : null);
  };
  const vcBtn = c => {
    const key = S.view + "/" + c.id;
    const ppl = voicePeers(key);
    return h("div", { class: "vc" },
      h("div", { class: "ch-row" },
        h("button", { type: "button", class: "ch" + (S.voice === key ? " on" : ""), onclick: () => joinVoice(key) }, icon("voice", 18), h("span", { class: "grow ell", text: c.name }), ppl.length ? h("span", { class: "dim small", text: ppl.length }) : null),
        isMod() ? h("button", { type: "button", class: "ch-gear", "aria-label": "Edit " + c.name, title: "Edit channel", onclick: () => editChannel(c) }, icon("settings", 14)) : null),
      ppl.length ? h("div", { class: "vc-ppl" }, ppl.map(p => h("div", { class: "vc-p" + (p.presence.talking ? " talking" : "") }, avatar(p.uid, 22), h("span", { class: "ell", text: nameOf(p.uid) })))) : null);
  };
  const addBtn = type => isMod() ? h("button", { type: "button", class: "ibtn sm", "aria-label": "Create channel", title: "Create channel", onclick: () => createChannel(type) }, icon("plus", 16)) : null;
  fill(box, hd,
    h("div", { class: "side-scroll" },
      sv.banner || sv.desc ? h("div", { class: "srv-banner", style: { background: sv.color || "var(--panel-2)" } }, h("span", { text: sv.desc || "" })) : null,
      !S.members[S.me] ? h("div", { class: "preview-note" }, h("span", { text: "You're previewing this server." }), h("button", { class: "btn primary sm", type: "button", onclick: () => joinServer(sv.id) }, "Join")) : null,
      h("div", { class: "grp" }, h("span", { text: "Text channels" }), addBtn("text")),
      text.map(chBtn),
      h("div", { class: "grp" }, h("span", { text: "Hangouts" }), addBtn("voice")),
      voice.length ? voice.map(vcBtn) : h("p", { class: "side-empty", text: "No hangouts yet." })));
}

function serverMenu(anchor) {
  const sv = server();
  menu(anchor, [
    { label: "Invite people", icon: "userPlus", onClick: () => inviteModal(sv) },
    isMod() ? { label: "Server settings", icon: "settings", onClick: () => openServerSettings() } : null,
    isMod() ? { label: "Create channel", icon: "plus", onClick: () => createChannel("text") } : null,
    { label: "Welcome & rules", icon: "shield", onClick: () => showWelcome(sv, false) },
    S.members[S.me] && !isOwner() ? "-" : null,
    S.members[S.me] && !isOwner() ? { label: "Leave server", icon: "logout", danger: true, onClick: () => leaveServer(sv) } : null,
  ], { align: "left" });
}

// ---------- create / join / explore ----------
const TEMPLATES = {
  friends: { label: "Friends", ic: "🏠", text: ["general", "memes", "photos"], voice: ["Lounge"] },
  gaming: { label: "Gaming", ic: "🎮", text: ["general", "clips", "lfg"], voice: ["Squad", "Lounge"] },
  study: { label: "Study group", ic: "📚", text: ["general", "notes", "help"], voice: ["Study room"] },
  blank: { label: "Blank", ic: "💬", text: ["general"], voice: ["Lounge"] },
};

export function createServerModal() {
  if (!S.api.canWrite) { toast("You have view-only access."); return; }
  let tpl = "friends", ic = TEMPLATES.friends.ic, color = SERVER_COLORS[Math.floor(Math.random() * SERVER_COLORS.length)];
  const name = h("input", { class: "input", id: "sv-name", maxlength: 40, value: nameOf(S.me) !== "Someone" ? nameOf(S.me) + "'s server" : "My server" });
  const prev = h("span", { class: "srv-prev" });
  const draw = () => { prev.textContent = ic; prev.style.background = color; };
  const tpls = h("div", { class: "opts" }, Object.entries(TEMPLATES).map(([k, t]) => h("button", { type: "button", class: "opt" + (k === tpl ? " on" : ""), onclick: e => { tpl = k; ic = t.ic; draw(); e.currentTarget.parentNode.querySelectorAll(".opt").forEach(o => o.classList.remove("on")); e.currentTarget.classList.add("on"); } }, t.ic + " " + t.label)));
  const icons = h("div", { class: "icon-grid" }, SERVER_ICONS.map(e => h("button", { type: "button", class: "emoji-btn", onclick: () => { ic = e; draw(); } }, e)));
  const colors = h("div", { class: "swatches" }, SERVER_COLORS.map(c => h("button", { type: "button", class: "swatch", style: { background: c }, "aria-label": "Colour " + c, onclick: () => { color = c; draw(); } })));
  draw();
  const m = modal({
    title: "Create a server",
    body: [h("div", { class: "srv-create-hd" }, prev, h("p", { class: "muted", text: "Your server is where you and your friends hang out. Pick a starting point, you can change everything later." })),
      h("label", { class: "field", for: "sv-name" }, h("span", { text: "Server name" }), name),
      h("div", { class: "field" }, h("span", { text: "Template" }), tpls),
      h("div", { class: "field" }, h("span", { text: "Icon" }), icons),
      h("div", { class: "field" }, h("span", { text: "Colour" }), colors)],
    actions: [h("button", { type: "button", class: "btn", onclick: () => { m.close(); joinByCode(); } }, "Join with a code instead"), h("button", { type: "button", class: "btn primary", onclick: async () => {
      const n = name.value.trim(); if (!n) { toast("Give your server a name."); return; }
      m.close();
      await createServer(n, ic, color, TEMPLATES[tpl]);
    } }, "Create")],
  });
}

async function createServer(name, ic, color, tpl) {
  const sid = "s" + S.api.newId();
  const now = Date.now();
  const ok = await write(async () => {
    await S.api.set("servers/" + sid, { name: name.slice(0, 40), icon: ic, color, desc: "", ownerId: S.me, createdAt: now, invite: randomCode(), welcome: "Welcome to " + name + "! Say hi in #general.", rules: "Be kind.", filter: [], aiMod: false, emoji: {}, lastAt: now, lastBy: "system" });
    await S.api.set("servers/" + sid + "/members/" + S.me, { role: "owner", joinedAt: now });
    let order = 0, first = null;
    for (const t of tpl.text) { const cid = "c" + S.api.newId(); first = first || cid; await S.api.set("servers/" + sid + "/channels/" + cid, { name: t, type: "text", topic: "", order: order++, slowmode: 0, lastAt: 0 }); }
    for (const v of tpl.voice) await S.api.set("servers/" + sid + "/channels/c" + S.api.newId(), { name: v, type: "voice", topic: "", order: order++, slowmode: 0 });
    await saveMe({ servers: [...myServers(), sid] });
    S.chanBy[sid] = first; store.set("chanBy", S.chanBy);
    return true;
  }, "create the server");
  if (ok) { go(sid, { main: true }); toast("Server created. Invite people with the code in the server menu.", "ok"); }
}

export function joinByCode() {
  promptBox("Join a server", "Invite code", "", { placeholder: "e.g. lads22", ok: "Join", max: 20 }).then(code => {
    if (!code) return;
    const c = code.trim().toLowerCase().replace(/.*\//, "");
    const sv = Object.values(S.servers).find(s => (s.invite || "").toLowerCase() === c);
    if (!sv) { toast("No server has that invite code. Check it and try again."); return; }
    joinServer(sv.id);
  });
}

export async function joinServer(sid) {
  const sv = S.servers[sid]; if (!sv) return;
  if (!S.api.canWrite) { toast("You have view-only access."); return; }
  const banned = await S.api.getDoc("servers/" + sid + "/bans/" + S.me).catch(() => null);
  if (banned) { toast("You're banned from " + sv.name + "."); return; }
  const ok = await write(async () => {
    await S.api.set("servers/" + sid + "/members/" + S.me, { role: "member", joinedAt: Date.now() });
    if (!myServers().includes(sid)) await saveMe({ servers: [...myServers(), sid] });
    return true;
  }, "join the server");
  if (!ok) return;
  go(sid, { main: true });
  setTimeout(async () => {
    const chans = await S.api.getCol("servers/" + sid + "/channels", { orderBy: ["order"] }).catch(() => []);
    const first = chans.find(c => c.type === "text");
    if (first) postMessage({ kind: "channel", key: sid + "/" + first.id, path: "servers/" + sid + "/channels/" + first.id + "/messages", parentPath: "servers/" + sid + "/channels/" + first.id, server: sv, channel: first }, { kind: "system", text: "joined the server. Say hi! 👋", subject: S.me }, { silent: true });
    showWelcome(sv, true);
  }, 300);
}

export async function leaveServer(sv) {
  if (!(await confirmBox("Leave " + sv.name + "?", "You can rejoin later with an invite code.", "Leave", true))) return;
  await write(async () => {
    await S.api.del("servers/" + sv.id + "/members/" + S.me);
    await saveMe({ servers: myServers().filter(id => id !== sv.id) });
  }, "leave the server");
  go("home");
}

export function showWelcome(sv, first) {
  const m = modal({
    title: first ? "Welcome to " + sv.name : sv.name,
    body: h("div", { class: "welcome" },
      h("span", { class: "srv-prev big", style: { background: sv.color } }, sv.iconUrl ? h("img", { src: sv.iconUrl, alt: "" }) : sv.icon || ""),
      h("p", { text: sv.welcome || "Welcome!" }),
      sv.rules ? h("div", { class: "rules" }, h("b", { text: "Rules" }), h("p", { text: sv.rules })) : null),
    actions: [h("button", { type: "button", class: "btn primary", onclick: () => m.close() }, first ? "Let's go" : "Close")],
  });
}

export function renderExplore(box) {
  const all = Object.values(S.servers).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const q = (S.exploreQ || "").toLowerCase();
  const list = all.filter(s => !q || s.name.toLowerCase().includes(q) || (s.desc || "").toLowerCase().includes(q));
  const search = h("input", { class: "input", id: "explore-q", placeholder: "Search servers", value: S.exploreQ || "", autocomplete: "off" });
  search.addEventListener("input", () => { S.exploreQ = search.value; const pos = search.selectionStart; schedule("main"); setTimeout(() => { const s = document.getElementById("explore-q"); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }, 0); });
  fill(box, h("div", { class: "explore" },
    h("div", { class: "explore-hero" }, h("h1", { text: "Find your people" }), h("p", { class: "muted", text: "Every server on " + APP.name + ". Join one, or use an invite code." }),
      h("div", { class: "explore-bar" }, search, h("button", { type: "button", class: "btn", onclick: joinByCode }, "Have a code?"), h("button", { type: "button", class: "btn primary", onclick: createServerModal }, "Create server"))),
    list.length ? h("div", { class: "explore-grid" }, list.map(sv => {
      const member = myServers().includes(sv.id);
      return h("div", { class: "srv-card" },
        h("div", { class: "srv-card-banner", style: { background: sv.color || "var(--panel-2)" } }),
        h("span", { class: "srv-prev", style: { background: sv.color } }, sv.iconUrl ? h("img", { src: sv.iconUrl, alt: "" }) : sv.icon || sv.name.slice(0, 2)),
        h("b", { text: sv.name }), h("p", { class: "muted", text: sv.desc || "No description yet." }),
        h("div", { class: "srv-card-ft" },
          h("button", { type: "button", class: "btn sm", onclick: () => go(sv.id, { main: true }) }, member ? "Open" : "Preview"),
          member ? null : h("button", { type: "button", class: "btn sm primary", onclick: () => joinServer(sv.id) }, "Join")));
    })) : h("div", { class: "empty" }, h("b", { text: all.length ? "No servers match that search" : "No servers yet" }), h("span", { text: "Be the first. Create one and invite your friends." }))));
}

// ---------- invites ----------
export function inviteModal(sv) {
  const code = sv.invite;
  const m = modal({
    title: "Invite friends to " + sv.name,
    body: [h("p", { class: "muted", text: "Send them this code. They tap Explore (the compass), then \"Have a code?\"." }),
      h("div", { class: "invite-code" }, h("code", { text: code }), h("button", { type: "button", class: "btn primary", onclick: async () => toast((await copyText(code)) ? "Code copied." : "Couldn't copy. Select the code instead.") }, icon("copy", 16), "Copy")),
      S.api.mode === "live" ? h("p", { class: "dim small", text: "They also need access to this app. Share it from the page's Share menu as a Contributor." }) : null],
    actions: [isMod() ? h("button", { type: "button", class: "btn", onclick: async () => { await write(() => S.api.update("servers/" + sv.id, { invite: randomCode() }), "change the code"); m.close(); toast("New invite code made. The old one no longer works."); } }, "Make a new code") : null, h("button", { type: "button", class: "btn primary", onclick: () => m.close() }, "Done")],
  });
}

// ---------- channels ----------
async function createChannel(type) {
  const name = await promptBox(type === "voice" ? "New hangout" : "New text channel", "Name", "", { placeholder: type === "voice" ? "e.g. Gaming" : "e.g. memes", max: 30, ok: "Create" });
  if (!name) return;
  const clean = type === "voice" ? name.slice(0, 30) : name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  if (!clean) { toast("Use letters or numbers for the name."); return; }
  const cid = "c" + S.api.newId();
  const order = Math.max(0, ...S.channels.map(c => c.order || 0)) + 1;
  await write(() => S.api.set("servers/" + S.view + "/channels/" + cid, { name: clean, type, topic: "", order, slowmode: 0, lastAt: 0 }), "create the channel");
  if (type !== "voice") go(S.view, { channel: cid, main: true });
}

function editChannel(c) {
  const name = h("input", { class: "input", id: "ec-name", maxlength: 30, value: c.name });
  const topic = h("input", { class: "input", id: "ec-topic", maxlength: 120, value: c.topic || "", placeholder: "What's this channel for?" });
  const type = h("select", { class: "input", id: "ec-type" }, [["text", "Text"], ["announce", "Announcements (mods post)"], ["voice", "Hangout"]].map(([v, l]) => { const o = h("option", { value: v, text: l }); if (v === c.type) o.selected = true; return o; }));
  const slow = h("select", { class: "input", id: "ec-slow" }, [[0, "Off"], [5, "5 seconds"], [10, "10 seconds"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"]].map(([v, l]) => { const o = h("option", { value: v, text: l }); if (v === (c.slowmode || 0)) o.selected = true; return o; }));
  const path = "servers/" + S.view + "/channels/" + c.id;
  const m = modal({
    title: "Edit " + (c.type === "voice" ? "" : "#") + c.name,
    body: [h("label", { class: "field", for: "ec-name" }, h("span", { text: "Name" }), name), h("label", { class: "field", for: "ec-topic" }, h("span", { text: "Topic" }), topic),
      h("label", { class: "field", for: "ec-type" }, h("span", { text: "Type" }), type), h("label", { class: "field", for: "ec-slow" }, h("span", { text: "Slow mode" }), slow),
      h("div", { class: "row-btns" },
        h("button", { type: "button", class: "btn sm", onclick: () => move(-1) }, "Move up"), h("button", { type: "button", class: "btn sm", onclick: () => move(1) }, "Move down"))],
    actions: [h("button", { type: "button", class: "btn danger", onclick: async () => { if (await confirmBox("Delete " + c.name + "?", "Messages in it will no longer be reachable.", "Delete", true)) { m.close(); write(() => S.api.del(path), "delete the channel"); } } }, "Delete"),
      h("button", { type: "button", class: "btn primary", onclick: () => {
        const n = type.value === "voice" ? name.value.trim().slice(0, 30) : name.value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 30);
        if (!n) { toast("Give it a name."); return; }
        m.close(); write(() => S.api.update(path, { name: n, topic: topic.value.trim(), type: type.value, slowmode: +slow.value }), "save the channel");
      } }, "Save")],
  });
  async function move(dir) {
    const list = S.channels.slice();
    const i = list.findIndex(x => x.id === c.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].order !== k) await S.api.update("servers/" + S.view + "/channels/" + list[k].id, { order: k }).catch(() => {});
    toast("Moved.");
  }
}

// ---------- moderation ----------
function sys(text, subject) {
  const first = S.channels.find(c => c.type === "text");
  const sv = server();
  if (!first || !sv) return;
  postMessage({ kind: "channel", key: sv.id + "/" + first.id, path: "servers/" + sv.id + "/channels/" + first.id + "/messages", parentPath: "servers/" + sv.id + "/channels/" + first.id, server: sv, channel: first }, { kind: "system", text, subject }, { silent: true });
}
export async function kick(uid) {
  if (!canModerate(uid)) return;
  if (!(await confirmBox("Kick " + nameOf(uid) + "?", "They can rejoin with an invite code.", "Kick", true))) return;
  const ok = await write(() => S.api.del("servers/" + S.view + "/members/" + uid), "kick them");
  if (ok !== null) sys("was removed from the server.", uid);
}
export async function ban(uid) {
  if (!canModerate(uid)) return;
  const reason = await promptBox("Ban " + nameOf(uid) + "?", "Reason (optional)", "", { ok: "Ban", max: 120 });
  if (reason === null) return;
  const ok = await write(async () => {
    await S.api.set("servers/" + S.view + "/bans/" + uid, { by: S.me, at: Date.now(), reason });
    await S.api.del("servers/" + S.view + "/members/" + uid);
  }, "ban them");
  if (ok !== null) sys("was banned.", uid);
}
export function mute(uid, minutes) {
  if (!canModerate(uid)) return;
  return write(async () => { await S.api.update("servers/" + S.view + "/members/" + uid, { mutedUntil: Date.now() + minutes * 60000 }); toast(nameOf(uid) + " is timed out for " + (minutes >= 60 ? minutes / 60 + " hour" : minutes + " minutes") + "."); }, "time them out");
}
export function unmute(uid) { return write(() => S.api.update("servers/" + S.view + "/members/" + uid, { mutedUntil: 0 }), "remove the time out"); }
export function setRole(uid, role) {
  if (!isOwner() || uid === S.me) return;
  return write(async () => { await S.api.update("servers/" + S.view + "/members/" + uid, { role }); toast(nameOf(uid) + " is now " + (role === "mod" ? "a mod" : "a member") + "."); }, "change their role");
}

// ---------- server settings ----------
export function openServerSettings(tab = "overview") {
  const sv = server(); if (!sv) return;
  const nav = h("nav", { class: "settings-nav" }), pane = h("div", { class: "settings-pane" });
  const tabs = [["overview", "Overview", "settings"], ["welcome", "Welcome & rules", "shield"], ["members", "Members & roles", "users"], ["moderation", "Moderation", "ban"], ["emoji", "Custom emoji", "smile"], ["invite", "Invite", "link"]];
  if (isOwner()) tabs.push(["danger", "Delete server", "trash"]);
  const show = t => {
    fill(nav, tabs.map(([k, l, ic]) => h("button", { type: "button", class: "settings-tab" + (k === t ? " on" : "") + (k === "danger" ? " danger" : ""), onclick: () => show(k) }, icon(ic, 16), l)));
    fill(pane, ({ overview, welcome, members, moderation, emoji, invite, danger })[t](server() || sv, () => show(t), m));
  };
  const m = modal({ title: sv.name + " settings", body: h("div", { class: "settings" }, nav, pane), wide: true, className: "settings-modal" });
  show(tab);
}

const save = (sid, patch, what = "save settings") => write(async () => { await S.api.update("servers/" + sid, patch); toast("Saved.", "ok"); }, what);

function overview(sv) {
  let ic = sv.icon, color = sv.color, iconUrl = sv.iconUrl || "";
  const name = h("input", { class: "input", id: "so-name", maxlength: 40, value: sv.name });
  const desc = h("textarea", { class: "input", id: "so-desc", rows: 2, maxlength: 160, value: sv.desc || "" });
  const prev = h("span", { class: "srv-prev big" });
  const draw = () => { fill(prev, iconUrl ? h("img", { src: iconUrl, alt: "" }) : ic); prev.style.background = color; };
  draw();
  const upload = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!S.api.upload) { toast("Uploads aren't available here."); return; }
    const url = await write(() => S.api.upload(f), "upload the icon"); if (url) { iconUrl = url; draw(); }
  } });
  return h("div", { class: "form" },
    h("div", { class: "preview-row" }, prev, h("div", { class: "row-btns" }, h("button", { type: "button", class: "btn sm", onclick: () => upload.click() }, icon("upload", 14), "Upload image"), iconUrl ? h("button", { type: "button", class: "btn sm", onclick: () => { iconUrl = ""; draw(); } }, "Use emoji") : null, upload)),
    h("div", { class: "field" }, h("span", { text: "Icon" }), h("div", { class: "icon-grid" }, SERVER_ICONS.map(e => h("button", { type: "button", class: "emoji-btn", onclick: () => { ic = e; iconUrl = ""; draw(); } }, e)))),
    h("div", { class: "field" }, h("span", { text: "Colour" }), h("div", { class: "swatches" }, SERVER_COLORS.map(c => h("button", { type: "button", class: "swatch", style: { background: c }, "aria-label": "Colour " + c, onclick: () => { color = c; draw(); } })))),
    h("label", { class: "field", for: "so-name" }, h("span", { text: "Server name" }), name),
    h("label", { class: "field", for: "so-desc" }, h("span", { text: "Description" }), desc),
    h("div", { class: "form-ft" }, h("button", { type: "button", class: "btn primary", onclick: () => { if (!name.value.trim()) return toast("Name can't be empty."); save(sv.id, { name: name.value.trim(), desc: desc.value.trim(), icon: ic, iconUrl, color }); } }, "Save changes")));
}

function welcome(sv) {
  const w = h("textarea", { class: "input", id: "sw-w", rows: 3, maxlength: 400, value: sv.welcome || "" });
  const r = h("textarea", { class: "input", id: "sw-r", rows: 6, maxlength: 1200, value: sv.rules || "" });
  return h("div", { class: "form" },
    h("p", { class: "muted", text: "New members see this when they join." }),
    h("label", { class: "field", for: "sw-w" }, h("span", { text: "Welcome message" }), w),
    h("label", { class: "field", for: "sw-r" }, h("span", { text: "Rules" }), r),
    h("div", { class: "form-ft" }, h("button", { type: "button", class: "btn", onclick: () => showWelcome(Object.assign({}, sv, { welcome: w.value, rules: r.value }), true) }, "Preview"), h("button", { type: "button", class: "btn primary", onclick: () => save(sv.id, { welcome: w.value.trim(), rules: r.value.trim() }) }, "Save")));
}

function members(sv, refresh) {
  const ids = Object.keys(S.members).sort((a, b) => rank(b) - rank(a) || nameOf(a).localeCompare(nameOf(b)));
  return h("div", { class: "form" },
    h("p", { class: "muted", text: ids.length + " members. Owners can make mods; mods can time out, kick and ban members." }),
    h("div", { class: "flist" }, ids.map(uid => {
      const role = roleOf(uid);
      const m = S.members[uid] || {};
      const acts = [];
      if (isOwner() && uid !== S.me) {
        const sel = h("select", { class: "input sm", "aria-label": "Role for " + nameOf(uid), onchange: async e => { await setRole(uid, e.target.value); setTimeout(refresh, 300); } }, ["member", "mod"].map(r => { const o = h("option", { value: r, text: ROLES[r].label }); if (r === role) o.selected = true; return o; }));
        acts.push(sel);
      } else acts.push(h("span", { class: "rolechip", style: { "--rc": ROLES[role].color || "var(--muted)" }, text: ROLES[role].label }));
      if (canModerate(uid)) {
        if (m.mutedUntil > Date.now()) acts.push(h("button", { type: "button", class: "btn sm", onclick: async () => { await unmute(uid); setTimeout(refresh, 300); } }, "Unmute"));
        acts.push(h("button", { type: "button", class: "ibtn", title: "Kick", "aria-label": "Kick " + nameOf(uid), onclick: () => kick(uid) }, icon("logout", 16)));
        acts.push(h("button", { type: "button", class: "ibtn bad", title: "Ban", "aria-label": "Ban " + nameOf(uid), onclick: () => ban(uid) }, icon("ban", 16)));
      }
      return h("div", { class: "frow" }, h("span", { class: "frow-main" }, avatar(uid, 32), h("span", { class: "frow-txt" }, h("b", { text: nameOf(uid) }), m.mutedUntil > Date.now() ? h("small", { class: "warn", text: "Timed out" }) : null)), h("div", { class: "frow-act" }, acts));
    })));
}

function moderation(sv, refresh) {
  const words = h("textarea", { class: "input", id: "sm-words", rows: 3, value: (sv.filter || []).join(", "), placeholder: "comma, separated, words" });
  const bans = h("div", { class: "flist" }, h("p", { class: "dim", text: "Loading bans…" }));
  S.api.getCol("servers/" + sv.id + "/bans", { limit: 200 }).then(list => {
    fill(bans, list.length ? list.map(b => h("div", { class: "frow" }, h("span", { class: "frow-main" }, avatar(b.id, 30), h("span", { class: "frow-txt" }, h("b", { text: nameOf(b.id) }), h("small", { class: "dim", text: b.reason || "No reason given" }))),
      h("button", { type: "button", class: "btn sm", onclick: async () => { await write(() => S.api.del("servers/" + sv.id + "/bans/" + b.id), "unban"); toast(nameOf(b.id) + " can join again."); refresh(); } }, "Unban"))) : h("p", { class: "dim", text: "Nobody is banned." }));
  }).catch(() => fill(bans, h("p", { class: "dim", text: "Couldn't load bans." })));
  return h("div", { class: "form" },
    h("label", { class: "field", for: "sm-words" }, h("span", { text: "Blocked words" }), words, h("small", { class: "dim", text: "Messages with these words won't send. Mods are exempt." })),
    toggle("AI auto-mod", S.api.ai ? "Checks each message for harassment, hate and spam before it posts. Banter is fine." : "Needs the live app in Claude.", sv.aiMod, v => save(sv.id, { aiMod: v })),
    h("div", { class: "form-ft" }, h("button", { type: "button", class: "btn primary", onclick: () => save(sv.id, { filter: words.value.split(",").map(w => w.trim().toLowerCase()).filter(Boolean).slice(0, 100) }) }, "Save word list")),
    h("div", { class: "field" }, h("span", { text: "Bans" }), bans));
}

function emoji(sv, refresh) {
  const em = sv.emoji || {};
  const nameIn = h("input", { class: "input", id: "se-name", maxlength: 24, placeholder: "e.g. pog" });
  const fileIn = h("input", { type: "file", accept: "image/png,image/gif,image/webp,image/jpeg", id: "se-file", class: "input" });
  return h("div", { class: "form" },
    h("p", { class: "muted", text: "Use custom emoji in messages and reactions with :name:." }),
    h("div", { class: "emoji-admin" }, Object.keys(em).length ? Object.entries(em).map(([k, url]) => h("div", { class: "emoji-tile" }, h("img", { src: url, alt: ":" + k + ":" }), h("span", { text: ":" + k + ":" }),
      h("button", { type: "button", class: "ibtn sm", "aria-label": "Remove :" + k + ":", onclick: async () => { const next = Object.assign({}, em); delete next[k]; await write(() => S.api.update("servers/" + sv.id, { emoji: null }).then(() => S.api.update("servers/" + sv.id, { emoji: next })), "remove that emoji"); setTimeout(refresh, 300); } }, icon("x", 12)))) : h("p", { class: "dim", text: "No custom emoji yet." })),
    S.api.upload ? h("div", { class: "row-btns" }, h("label", { class: "field grow", for: "se-name" }, h("span", { text: "Name" }), nameIn), h("label", { class: "field grow", for: "se-file" }, h("span", { text: "Image" }), fileIn),
      h("button", { type: "button", class: "btn primary", onclick: async () => {
        const n = nameIn.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        const f = fileIn.files[0];
        if (n.length < 2 || !f) { toast("Add a name (2+ letters) and an image."); return; }
        if (f.size > 512 * 1024) { toast("Emoji images must be under 512 KB."); return; }
        const url = await write(() => S.api.upload(f), "upload the emoji"); if (!url) return;
        await save(sv.id, { emoji: Object.assign({}, em, { [n]: url }) }, "add the emoji");
        setTimeout(refresh, 300);
      } }, "Add")) : h("p", { class: "dim", text: "Uploads aren't available in this view." }));
}

function invite(sv) {
  return h("div", { class: "form" },
    h("div", { class: "invite-code" }, h("code", { text: sv.invite }), h("button", { type: "button", class: "btn primary", onclick: async () => toast((await copyText(sv.invite)) ? "Code copied." : "Couldn't copy.") }, icon("copy", 16), "Copy")),
    h("button", { type: "button", class: "btn", onclick: () => save(sv.id, { invite: randomCode() }, "change the code") }, "Make a new code"),
    h("p", { class: "dim", text: "Making a new code stops the old one working." }));
}

function danger(sv, refresh, m) {
  return h("div", { class: "form" },
    h("p", { class: "muted", text: "Deleting " + sv.name + " removes it for everyone. This can't be undone." }),
    h("button", { type: "button", class: "btn danger", onclick: async () => {
      const typed = await promptBox("Delete " + sv.name + "?", "Type the server name to confirm", "", { ok: "Delete forever" });
      if (typed !== sv.name) { if (typed !== null) toast("The name didn't match."); return; }
      m.close();
      await write(async () => {
        for (const c of S.channels) await S.api.del("servers/" + sv.id + "/channels/" + c.id);
        for (const uid of Object.keys(S.members)) await S.api.del("servers/" + sv.id + "/members/" + uid).catch(() => {});
        await S.api.del("servers/" + sv.id);
        await saveMe({ servers: myServers().filter(id => id !== sv.id) });
      }, "delete the server");
      go("home");
    } }, "Delete server"));
}
