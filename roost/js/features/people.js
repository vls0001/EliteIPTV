// People: avatars, profile cards, friends, DM list, status, and user settings.
import { APP, ROLES, STATUSES, ACCENTS } from "../config.js";
import { h, fill, icon, logo, modal, menu, toast, store, stamp, confirmBox, promptBox, isMobile } from "../lib/dom.js";
import { S, nameOf, colorOf, statusOf, presenceOf, roleOf, server, isBlocked, dmIdFor, go, write, schedule, scheduleAll, isUnread, canModerate, isOwner, want } from "../state.js";
import { kick, ban, mute, setRole } from "./servers.js";

// ---------- avatar ----------
export function avatar(uid, size = 40, opts = {}) {
  const el = h("span", { class: "av", style: { width: size + "px", height: size + "px", fontSize: Math.round(size * 0.4) + "px" } });
  if (uid === APP.botId) { el.classList.add("bot"); el.append(icon("sparkle", Math.round(size * 0.5))); }
  else if (uid === "system") { el.classList.add("bot"); el.innerHTML = '<svg viewBox="0 0 120 120" width="' + Math.round(size * .62) + '" height="' + Math.round(size * .62) + '"><use href="#logo"/></svg>'; }
  else {
    const p = S.profiles[uid];
    if (!p) want(uid);
    if (p && p.avatarUrl && !p.avatarUrl.startsWith("data:image/svg")) el.append(h("img", { src: p.avatarUrl, alt: "", loading: "lazy" }));
    else { el.textContent = (nameOf(uid)[0] || "?").toUpperCase(); el.style.background = colorOf(uid); }
  }
  if (opts.status) {
    const st = statusOf(uid);
    el.append(h("span", { class: "st st-" + st, title: st === "offline" ? "Offline" : (STATUSES[st] || {}).label }));
  }
  return el;
}

export function nameEl(uid, cls = "") {
  const role = server() ? roleOf(uid) : "member";
  const color = ROLES[role] && ROLES[role].color;
  return h("span", { class: "uname " + cls, style: color ? { color } : null, text: nameOf(uid) });
}

// ---------- profile card ----------
export function openProfile(uid, anchor) {
  if (uid === APP.botId || uid === "system") return;
  const u = S.users[uid] || {};
  const st = statusOf(uid);
  const pres = presenceOf(uid);
  const sv = server();
  const role = sv ? roleOf(uid) : null;
  const fr = friendDoc(uid);
  const body = h("div", { class: "pcard" },
    h("div", { class: "pcard-banner", style: { background: u.banner || colorOf(uid) } }),
    h("div", { class: "pcard-av" }, avatar(uid, 84, { status: true })),
    h("div", { class: "pcard-body" },
      h("div", { class: "pcard-name" }, h("b", { text: nameOf(uid) }), u.pronouns ? h("span", { class: "dim", text: u.pronouns }) : null),
      u.custom ? h("div", { class: "pcard-custom", text: u.custom }) : null,
      u.activity || pres.voice ? h("div", { class: "pcard-act" }, icon(pres.voice ? "voice" : "game", 14), h("span", { text: pres.voice ? "In a hangout" : u.activity })) : null,
      u.bio ? h("div", { class: "pcard-sec" }, h("span", { class: "lbl", text: "About me" }), h("p", { text: u.bio })) : null,
      sv && role ? h("div", { class: "pcard-sec" }, h("span", { class: "lbl", text: "Role in " + sv.name }), h("span", { class: "rolechip", style: { "--rc": ROLES[role].color || "var(--muted)" }, text: ROLES[role].label })) : null,
      u.joinedAt ? h("div", { class: "pcard-sec" }, h("span", { class: "lbl", text: "Member since" }), h("span", { text: new Date(u.joinedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) })) : null,
      h("div", { class: "pcard-sec dim", text: st === "offline" ? "Offline" : (STATUSES[st] || {}).label }),
    ));
  const actions = [];
  if (uid !== S.me) {
    actions.push(h("button", { class: "btn primary", type: "button", onclick: () => { m.close(); openDM(uid); } }, icon("thread", 16), "Message"));
    if (!fr) actions.push(h("button", { class: "btn", type: "button", onclick: () => { m.close(); addFriend(uid); } }, icon("userPlus", 16), "Add friend"));
    else if (fr.state === "pending" && fr.from !== S.me) actions.push(h("button", { class: "btn", type: "button", onclick: () => { m.close(); acceptFriend(fr); } }, icon("check", 16), "Accept"));
    const more = h("button", { class: "btn", type: "button", "aria-label": "More" }, icon("more", 16));
    more.addEventListener("click", () => {
      const items = [];
      if (fr && fr.state === "accepted") items.push({ label: "Remove friend", icon: "x", onClick: () => removeFriend(fr) });
      items.push({ label: isBlocked(uid) ? "Unblock" : "Block", icon: "ban", danger: !isBlocked(uid), onClick: () => toggleBlock(uid) });
      if (sv && canModerate(uid)) {
        items.push("-");
        items.push({ label: "Time out 10 minutes", icon: "mute", onClick: () => mute(uid, 10) });
        items.push({ label: "Time out 1 hour", icon: "mute", onClick: () => mute(uid, 60) });
        if (isOwner()) items.push({ label: roleOf(uid) === "mod" ? "Remove mod" : "Make mod", icon: "shield", onClick: () => setRole(uid, roleOf(uid) === "mod" ? "member" : "mod") });
        items.push({ label: "Kick", icon: "logout", danger: true, onClick: () => kick(uid) });
        items.push({ label: "Ban", icon: "ban", danger: true, onClick: () => ban(uid) });
      }
      menu(more, items);
    });
    actions.push(more);
  } else {
    actions.push(h("button", { class: "btn primary", type: "button", onclick: () => { m.close(); openSettings("profile"); } }, icon("edit", 16), "Edit profile"));
  }
  const m = modal({ body, actions, className: "profile-modal" });
}

// ---------- friends ----------
export function friendDoc(uid) { return S.friends.find(f => f.users.includes(uid) && f.users.includes(S.me)) || null; }
export const friendIds = () => S.friends.filter(f => f.state === "accepted").map(f => f.users.find(u => u !== S.me));

export function addFriend(uid) {
  if (uid === S.me) return;
  const id = dmIdFor(S.me, uid);
  return write(async () => { await S.api.set("friends/" + id, { users: [S.me, uid].sort(), from: S.me, state: "pending", at: Date.now() }); toast("Friend request sent to " + nameOf(uid) + "."); }, "send a friend request");
}
export function acceptFriend(f) { return write(() => S.api.update("friends/" + f.id, { state: "accepted", at: Date.now() }), "accept that request"); }
export function removeFriend(f) { return write(() => S.api.del("friends/" + f.id), "remove that friend"); }
export function toggleBlock(uid) {
  const blocked = new Set((S.users[S.me] && S.users[S.me].blocked) || []);
  const was = blocked.has(uid);
  if (was) blocked.delete(uid); else blocked.add(uid);
  return write(async () => {
    await saveMe({ blocked: [...blocked] });
    if (!was) { const f = friendDoc(uid); if (f) await S.api.del("friends/" + f.id); }
    toast(was ? nameOf(uid) + " is unblocked." : nameOf(uid) + " is blocked. You won't see their messages.");
  }, "update your block list");
}

export function saveMe(patch) {
  const cur = S.users[S.me];
  return cur ? S.api.update("users/" + S.me, patch) : S.api.set("users/" + S.me, Object.assign({ status: "online", servers: [], blocked: [], joinedAt: Date.now() }, patch));
}

// ---------- DMs ----------
export async function openDM(uid) {
  const id = dmIdFor(S.me, uid);
  if (!S.dms[id]) {
    const ok = await write(() => S.api.set("dms/" + id, { members: [S.me, uid].sort(), group: false, createdAt: Date.now(), lastAt: 0 }), "start that conversation");
    if (ok === null) return;
    S.dms[id] = { id, members: [S.me, uid].sort(), group: false, lastAt: 0 };
  }
  go("home", { dm: id, main: true });
}

export function newGroupDM() {
  const picks = new Set();
  const list = h("div", { class: "picklist" });
  const ids = friendIds();
  if (!ids.length) list.append(h("p", { class: "muted", text: "Add some friends first, then you can start a group chat." }));
  for (const uid of ids) {
    const cb = h("input", { type: "checkbox", id: "pk-" + uid, onchange: e => e.target.checked ? picks.add(uid) : picks.delete(uid) });
    list.append(h("label", { class: "pickrow", for: "pk-" + uid }, cb, avatar(uid, 28), h("span", { text: nameOf(uid) })));
  }
  const nameIn = h("input", { class: "input", id: "gdm-name", maxlength: 40, placeholder: "Optional, e.g. Weekend plans" });
  const m = modal({
    title: "New group chat",
    body: [h("label", { class: "field", for: "gdm-name" }, h("span", { text: "Group name" }), nameIn), h("div", { class: "lbl", style: { margin: "14px 0 6px" }, text: "Add friends" }), list],
    actions: [h("button", { class: "btn", type: "button", onclick: () => m.close() }, "Cancel"), h("button", { class: "btn primary", type: "button", onclick: async () => {
      if (!picks.size) { toast("Pick at least one friend."); return; }
      const members = [S.me, ...picks].sort();
      if (members.length === 2) { m.close(); openDM([...picks][0]); return; }
      const id = S.api.newId();
      const ok = await write(() => S.api.set("dms/" + id, { members, group: true, name: nameIn.value.trim().slice(0, 40), ownerId: S.me, createdAt: Date.now(), lastAt: Date.now(), lastBy: "system", lastText: "Group created" }), "create the group");
      if (ok === null) return;
      m.close(); go("home", { dm: id, main: true });
    } }, "Create")],
  });
}

export function leaveGroup(dm) {
  return confirmBox("Leave " + (dm.name || "group") + "?", "You won't get new messages from this group.", "Leave", true).then(ok => {
    if (!ok) return;
    const members = dm.members.filter(u => u !== S.me);
    return write(async () => {
      if (members.length) await S.api.update("dms/" + dm.id, { members });
      else await S.api.del("dms/" + dm.id);
      go("home", { dm: "friends" });
    }, "leave the group");
  });
}

export function renderHomeSidebar(box) {
  const pend = S.friends.filter(f => f.state === "pending" && f.from !== S.me).length;
  fill(box,
    h("div", { class: "side-hd" }, h("b", { text: "Messages" })),
    h("div", { class: "side-scroll" },
      h("button", { class: "nav-item" + (S.homeTab === "friends" ? " on" : ""), type: "button", onclick: () => go("home", { dm: "friends", main: true }) }, icon("users", 18), h("span", { class: "grow", text: "Friends" }), pend ? h("span", { class: "badge", text: pend }) : null),
      h("div", { class: "grp" }, h("span", { text: "Direct messages" }), h("button", { class: "ibtn sm", type: "button", "aria-label": "New group chat", title: "New group chat", onclick: newGroupDM }, icon("plus", 16))),
      dmList(),
    ));
}

function dmList() {
  const list = Object.values(S.dms).filter(d => (d.members || []).includes(S.me) && (d.lastAt || d.id === S.homeTab)).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  if (!list.length) return h("p", { class: "side-empty", text: "No messages yet. Open a friend's profile and tap Message." });
  return list.map(d => {
    const others = d.members.filter(u => u !== S.me);
    const unread = isUnread("dm:" + d.id, d.lastAt, d.lastBy);
    const pic = d.group ? h("span", { class: "av group", style: { width: "34px", height: "34px" } }, icon("users", 16)) : avatar(others[0] || S.me, 34, { status: true });
    return h("button", { class: "dm-item" + (S.homeTab === d.id ? " on" : "") + (unread ? " unread" : ""), type: "button", onclick: () => go("home", { dm: d.id, main: true }) },
      pic, h("span", { class: "dm-txt" }, h("b", { text: d.name || (others.length ? others.map(nameOf).join(", ") : "Just you") }), h("small", { text: d.group ? d.members.length + " members" : (d.lastText || "") })),
      unread ? h("span", { class: "dot" }) : null);
  });
}

export function renderFriends(box) {
  const tab = S.friendTab || "online";
  const setTab = t => { S.friendTab = t; schedule("main"); };
  const accepted = S.friends.filter(f => f.state === "accepted");
  const pending = S.friends.filter(f => f.state === "pending");
  const other = f => f.users.find(u => u !== S.me);
  const row = (uid, extra) => h("div", { class: "frow" },
    h("button", { class: "frow-main", type: "button", onclick: () => openProfile(uid) }, avatar(uid, 38, { status: true }),
      h("span", { class: "frow-txt" }, h("b", { text: nameOf(uid) }), h("small", { text: (S.users[uid] && (S.users[uid].custom || S.users[uid].activity)) || (statusOf(uid) === "offline" ? "Offline" : (STATUSES[statusOf(uid)] || {}).label) }))),
    h("div", { class: "frow-act" }, extra));
  let content;
  if (tab === "add") {
    const input = h("input", { class: "input", id: "addf", placeholder: "Search people by name", autocomplete: "off" });
    const results = h("div", { class: "flist" });
    const run = () => {
      const q = input.value.trim().toLowerCase();
      const ids = Object.keys(S.users).filter(u => u !== S.me && !isBlocked(u));
      want(ids);
      const hits = ids.filter(u => !q || nameOf(u).toLowerCase().includes(q)).slice(0, 30);
      fill(results, hits.length ? hits.map(uid => {
        const f = friendDoc(uid);
        const btn = !f ? h("button", { class: "btn sm primary", type: "button", onclick: () => addFriend(uid) }, "Add friend")
          : f.state === "accepted" ? h("span", { class: "dim", text: "Friends" })
          : f.from === S.me ? h("span", { class: "dim", text: "Request sent" })
          : h("button", { class: "btn sm primary", type: "button", onclick: () => acceptFriend(f) }, "Accept");
        return row(uid, btn);
      }) : h("p", { class: "muted pad", text: q ? "Nobody here by that name yet. People appear once they've opened " + APP.name + "." : "Nobody else has joined yet. Share " + APP.name + " with friends to see them here." }));
    };
    input.addEventListener("input", run);
    setTimeout(run, 0);
    content = [h("div", { class: "addf" }, h("label", { for: "addf", class: "lbl", text: "Add a friend" }), input), results];
  } else {
    let list = tab === "pending" ? pending : accepted;
    if (tab === "online") list = accepted.filter(f => statusOf(other(f)) !== "offline");
    content = list.length ? h("div", { class: "flist" }, list.map(f => {
      const uid = other(f);
      if (tab === "pending") {
        return row(uid, f.from === S.me
          ? [h("span", { class: "dim", text: "Sent" }), h("button", { class: "ibtn", type: "button", title: "Cancel", "aria-label": "Cancel request", onclick: () => removeFriend(f) }, icon("x", 16))]
          : [h("button", { class: "ibtn ok", type: "button", title: "Accept", "aria-label": "Accept", onclick: () => acceptFriend(f) }, icon("check", 16)), h("button", { class: "ibtn", type: "button", title: "Decline", "aria-label": "Decline", onclick: () => removeFriend(f) }, icon("x", 16))]);
      }
      return row(uid, [h("button", { class: "ibtn", type: "button", title: "Message", "aria-label": "Message", onclick: () => openDM(uid) }, icon("thread", 16))]);
    })) : h("div", { class: "empty" }, h("b", { text: tab === "pending" ? "No pending requests" : tab === "online" ? "No friends online right now" : "No friends yet" }), h("span", { text: "Add people from the Add friend tab or from anyone's profile." }), tab !== "pending" ? h("button", { class: "btn primary", type: "button", onclick: () => setTab("add") }, "Add friend") : null);
  }
  const tabs = [["online", "Online"], ["all", "All"], ["pending", "Pending" + (S.friends.filter(f => f.state === "pending" && f.from !== S.me).length ? " (" + S.friends.filter(f => f.state === "pending" && f.from !== S.me).length + ")" : "")], ["add", "Add friend"]];
  fill(box, h("div", { class: "friends" },
    h("div", { class: "seg" }, tabs.map(([k, l]) => h("button", { type: "button", class: "seg-btn" + (tab === k ? " on" : "") + (k === "add" ? " accent" : ""), onclick: () => setTab(k) }, l))),
    content));
}

// ---------- me bar & status ----------
export function renderMeBar(box) {
  const u = S.users[S.me] || {};
  const st = statusOf(S.me);
  const btn = h("button", { class: "me-btn", type: "button", "aria-label": "Your status and profile" }, avatar(S.me, 34, { status: true }),
    h("span", { class: "me-txt" }, h("b", { text: nameOf(S.me) }), h("small", { text: u.custom || (STATUSES[st] || STATUSES.online).label })));
  btn.addEventListener("click", () => statusMenu(btn));
  fill(box, btn,
    h("button", { class: "ibtn", type: "button", title: "Settings", "aria-label": "Settings", onclick: () => openSettings() }, icon("settings", 18)));
}

function statusMenu(anchor) {
  const set = s => write(() => saveMe({ status: s }), "change your status");
  menu(anchor, [
    ...Object.entries(STATUSES).map(([k, v]) => ({ label: v.label, icon: k === "invisible" ? "eye" : k === "dnd" ? "ban" : k === "idle" ? "mute" : "check", onClick: () => set(k), sub: (S.users[S.me] || {}).status === k ? "✓" : "" })),
    "-",
    { label: "Set a custom status", icon: "edit", onClick: async () => { const v = await promptBox("Custom status", "What are you up to?", (S.users[S.me] || {}).custom || "", { max: 60, placeholder: "e.g. in the library till 6" }); if (v !== null) write(() => saveMe({ custom: v }), "save your status"); } },
    { label: "View profile", icon: "user", onClick: () => openProfile(S.me) },
    { label: "Settings", icon: "settings", onClick: () => openSettings() },
  ], { align: "left" });
}

// ---------- settings ----------
const APPEAR_DEFAULT = { skin: "dark", accent: "mono", size: 15, compact: false, motion: true };
const NOTIFY_DEFAULT = { mentions: true, dms: true, soundboard: true, joins: true };
export const appearance = () => Object.assign({}, APPEAR_DEFAULT, store.get("appearance", {}));
export const notifyPrefs = () => Object.assign({}, NOTIFY_DEFAULT, store.get("notify", {}));
export function applyAppearance() {
  const a = appearance(), root = document.documentElement;
  root.dataset.skin = a.skin;
  root.dataset.compact = a.compact ? "1" : "0";
  root.dataset.motion = a.motion ? "1" : "0";
  root.style.setProperty("--fs", a.size + "px");
  const acc = ACCENTS[a.accent];
  if (acc) { root.style.setProperty("--accent", acc[0]); root.style.setProperty("--accent-ink", acc[1]); }
  else { root.style.removeProperty("--accent"); root.style.removeProperty("--accent-ink"); }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = a.skin === "light" ? "#FFFFFF" : a.skin === "oled" ? "#000000" : "#09090B";
}

export function openSettings(tab = "profile") {
  const body = h("div", { class: "settings" });
  const nav = h("nav", { class: "settings-nav" });
  const pane = h("div", { class: "settings-pane" });
  const tabs = [["profile", "Profile", "user"], ["appearance", "Appearance", "palette"], ["notifications", "Notifications", "bell"], ["privacy", "Privacy & blocked", "lock"], ["about", "About", "sparkle"]];
  const show = t => {
    tab = t;
    fill(nav, tabs.map(([k, l, ic]) => h("button", { type: "button", class: "settings-tab" + (k === t ? " on" : ""), onclick: () => show(k) }, icon(ic, 16), l)));
    fill(pane, ({ profile: profilePane, appearance: appearancePane, notifications: notifyPane, privacy: privacyPane, about: aboutPane })[t]());
  };
  body.append(nav, pane);
  modal({ title: "Settings", body, wide: true, className: "settings-modal" });
  show(tab);
}

function profilePane() {
  const u = S.users[S.me] || {};
  const f = (id, label, el, hint) => h("label", { class: "field", for: id }, h("span", { text: label }), el, hint ? h("small", { class: "dim", text: hint }) : null);
  const bio = h("textarea", { class: "input", id: "s-bio", rows: 3, maxlength: 190, value: u.bio || "" });
  const pron = h("input", { class: "input", id: "s-pron", maxlength: 30, value: u.pronouns || "", placeholder: "e.g. they/them" });
  const act = h("input", { class: "input", id: "s-act", maxlength: 60, value: u.activity || "", placeholder: "e.g. Playing Minecraft" });
  const cust = h("input", { class: "input", id: "s-cust", maxlength: 60, value: u.custom || "" });
  let banner = u.banner || colorOf(S.me);
  const swatches = h("div", { class: "swatches" }, ["#FBBF24", "#4ADE80", "#60A5FA", "#A78BFA", "#F472B6", "#F87171", "#2DD4BF", "#FB923C", "#E4E4E7", "#3F3F46"].map(c =>
    h("button", { type: "button", class: "swatch" + (c === banner ? " on" : ""), style: { background: c }, "aria-label": "Banner colour " + c, onclick: e => { banner = c; e.currentTarget.parentNode.querySelectorAll(".swatch").forEach(s => s.classList.remove("on")); e.currentTarget.classList.add("on"); prev.style.background = c; } })));
  const prev = h("div", { class: "pcard-banner small", style: { background: banner } });
  return h("div", { class: "form" },
    h("div", { class: "preview-row" }, prev, h("div", { class: "preview-me" }, avatar(S.me, 64), h("div", {}, h("b", { text: nameOf(S.me) }), h("small", { class: "dim", text: S.api.mode === "demo" ? "In demo mode you appear as \"You\"." : "Your name and photo come from your Claude account." })))),
    h("div", { class: "field" }, h("span", { text: "Banner colour" }), swatches),
    f("s-bio", "About me", bio),
    f("s-pron", "Pronouns", pron),
    f("s-act", "Activity", act, "Shows on your profile and in the member list."),
    f("s-cust", "Custom status", cust),
    h("div", { class: "form-ft" }, h("button", { class: "btn primary", type: "button", onclick: () => write(async () => { await saveMe({ bio: bio.value.trim(), pronouns: pron.value.trim(), activity: act.value.trim(), custom: cust.value.trim(), banner }); toast("Profile saved.", "ok"); }, "save your profile") }, "Save profile")));
}

function appearancePane() {
  const a = appearance();
  const save = patch => { store.set("appearance", Object.assign(appearance(), patch)); applyAppearance(); scheduleAll(); };
  const opt = (group, value, label, cur, extra) => h("button", { type: "button", class: "opt" + (cur === value ? " on" : ""), onclick: e => { save({ [group]: value }); e.currentTarget.parentNode.querySelectorAll(".opt").forEach(o => o.classList.remove("on")); e.currentTarget.classList.add("on"); } }, extra, label);
  return h("div", { class: "form" },
    h("div", { class: "field" }, h("span", { text: "Theme" }), h("div", { class: "opts" },
      opt("skin", "dark", "Dark", a.skin, h("i", { class: "skin-dot", style: { background: "#09090B" } })),
      opt("skin", "oled", "OLED black", a.skin, h("i", { class: "skin-dot", style: { background: "#000" } })),
      opt("skin", "light", "Light", a.skin, h("i", { class: "skin-dot", style: { background: "#fff" } })))),
    h("div", { class: "field" }, h("span", { text: "Accent colour" }), h("div", { class: "opts" }, Object.keys(ACCENTS).map(k =>
      opt("accent", k, k[0].toUpperCase() + k.slice(1), a.accent, h("i", { class: "skin-dot", style: { background: ACCENTS[k] ? ACCENTS[k][0] : "var(--fg)" } }))))),
    h("div", { class: "field" }, h("span", { text: "Text size" }), h("div", { class: "opts" }, [13, 14, 15, 16, 17].map(n => opt("size", n, n + "px", a.size)))),
    toggle("Compact messages", "Fit more messages on screen.", a.compact, v => save({ compact: v })),
    toggle("Animations", "Turn off to reduce motion.", a.motion, v => save({ motion: v })));
}

function notifyPane() {
  const n = notifyPrefs();
  const save = patch => store.set("notify", Object.assign(notifyPrefs(), patch));
  return h("div", { class: "form" },
    toggle("Mention sound", "Play a sound when someone @mentions you.", n.mentions, v => save({ mentions: v })),
    toggle("DM sound", "Play a sound for new direct messages.", n.dms, v => save({ dms: v })),
    toggle("Soundboard", "Hear soundboard clips in hangouts.", n.soundboard, v => save({ soundboard: v })),
    toggle("Join and leave sounds", "Play a sound when people join your hangout.", n.joins, v => save({ joins: v })),
    h("p", { class: "dim", text: "Sounds play while " + APP.name + " is open. Phone push notifications come with the mobile app." }));
}

function privacyPane() {
  const blocked = (S.users[S.me] && S.users[S.me].blocked) || [];
  return h("div", { class: "form" },
    h("div", { class: "field" }, h("span", { text: "Blocked people" }),
      blocked.length ? h("div", { class: "flist" }, blocked.map(uid => h("div", { class: "frow" }, h("span", { class: "frow-main" }, avatar(uid, 32), h("b", { text: nameOf(uid) })), h("button", { class: "btn sm", type: "button", onclick: () => toggleBlock(uid) }, "Unblock")))) : h("p", { class: "dim", text: "You haven't blocked anyone." })),
    h("div", { class: "note" }, icon("lock", 16), h("span", { text: S.api.mode === "demo"
      ? "Demo mode: everything is stored only in this browser."
      : "Messages are stored in this app's shared database. Anyone with access to the app can technically read stored data, so don't share passwords or bank details here." })));
}

function aboutPane() {
  return h("div", { class: "form" },
    h("div", { class: "about" }, logo(56), h("div", {}, h("b", { text: APP.name + " " + APP.version }), h("small", { class: "dim", text: APP.tagline }))),
    h("p", { class: "muted", text: S.api.mode === "demo" ? "You're in demo mode. Data stays in this browser and the people here are examples." : "You're connected live. Messages sync instantly with everyone who has access." }),
    h("div", { class: "kbd-list" },
      h("b", { text: "Keyboard shortcuts" }),
      [["Ctrl / ⌘ + K", "Quick switcher"], ["Esc", "Close panel or cancel reply"], ["↑ in empty box", "Edit your last message"], ["Enter", "Send"], ["Shift + Enter", "New line"]].map(([k, v]) => h("div", { class: "kbd-row" }, h("kbd", { text: k }), h("span", { text: v })))),
    S.api.mode === "demo" ? h("button", { class: "btn danger", type: "button", onclick: async () => { if (await confirmBox("Reset demo?", "This clears everything you've done in demo mode.", "Reset", true)) S.api.resetDemo(); } }, "Reset demo data") : null);
}

export function toggle(label, hint, value, onChange) {
  const id = "tg" + Math.random().toString(36).slice(2, 7);
  const input = h("input", { type: "checkbox", id, class: "tg", role: "switch" });
  input.checked = !!value;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "toggle-row", for: id }, h("span", { class: "grow" }, h("b", { text: label }), hint ? h("small", { class: "dim", text: hint }) : null), input);
}
