// App entry: connects a backend, keeps data in sync, and renders the layout.
import { APP } from "./config.js";
import { h, fill, icon, logo, modal, toast, store, isMobile, debounce } from "./lib/dom.js";
import { ping } from "./lib/sound.js";
import { connect } from "./backend/index.js";
import {
  S, register, schedule, scheduleAll, sub, unsub, want, nameOf, server, myServers, conv, currentChannel, go, setPanel,
  isUnread, unreadMentions, pendingFriendCount, markRead, dmTitle,
} from "./state.js";
import { applyAppearance, renderHomeSidebar, renderFriends, renderMeBar, openSettings, openProfile, notifyPrefs, newGroupDM, leaveGroup, saveMe } from "./features/people.js";
import { renderRail, renderServerSidebar, renderExplore, joinServer, createServerModal, openServerSettings, inviteModal } from "./features/servers.js";
import { renderFeed, renderCatchupText, scrollToMsg } from "./features/messages.js";
import { renderComposer, bindDrop } from "./features/composer.js";
import { renderPanel, resetPins } from "./features/panels.js";
import { renderStage, renderVoiceBar, wireVoice, voicePeers } from "./features/voice.js";
import { catchUp, aiReady } from "./features/ai.js";

const $ = id => document.getElementById(id);
applyAppearance();

// ---------- renderers ----------
register("layout", renderLayout); // first, so screens are visible before anything measures them
register("rail", () => renderRail($("rail")));
register("sidebar", () => {
  const box = $("side-content");
  if (S.view === "home") renderHomeSidebar(box);
  else if (S.view === "explore") fill(box, h("div", { class: "side-hd" }, h("b", { text: "Explore" })), h("div", { class: "side-scroll" }, h("p", { class: "side-empty", text: "Browse every server, or join one with an invite code." })));
  else renderServerSidebar(box);
});
register("mebar", () => renderMeBar($("mebar")));
register("voicebar", () => renderVoiceBar($("voicebar")));
register("header", renderHeader);
register("main", renderMain);
register("feed", () => { if (mode() === "chat") { renderFeed($("feed")); afterFeed(); } });
register("catchup", renderCatchupText);
register("composer", () => { if (mode() === "chat") renderComposer($("composer")); });
register("panel", () => { ensureThreadSub(); renderPanel($("panel")); });
register("thread", () => { if (S.panel === "thread") { ensureThreadSub(); renderPanel($("panel")); } });
register("typing", renderTyping);
register("tabs", renderTabs);
register("title", renderTitle);
register("banner", renderBanner);

function mode() {
  if (S.view === "home") return S.dms[S.homeTab] ? "chat" : "friends";
  if (S.view === "explore") return "explore";
  if (!server()) return "loading";
  if (S.stage && S.stage.startsWith(S.view + "/")) return "stage";
  return currentChannel() ? "chat" : "nochannel";
}

function renderLayout() {
  const app = $("app");
  app.dataset.screen = S.mobileScreen;
  app.dataset.mode = mode();
  app.classList.toggle("panel-open", !!S.panel && (S.panelUser || !isMobile()) && (mode() === "chat" || S.panel === "inbox"));
}

function renderMain() {
  renderLayout();
  const m = mode();
  const chat = $("chat"), alt = $("alt");
  chat.hidden = m !== "chat";
  alt.hidden = m === "chat";
  if (m === "friends") renderFriends(alt);
  else if (m === "explore") renderExplore(alt);
  else if (m === "stage") renderStage(alt, S.stage);
  else if (m === "nochannel") fill(alt, h("div", { class: "empty" }, icon("hash", 32), h("b", { text: "No channels here yet" }), h("span", { text: "Ask a mod to create one." })));
  else if (m === "loading") fill(alt, h("div", { class: "empty" }, h("span", { class: "spinner" }), h("span", { text: S.view && !S.servers[S.view] && S.serversLoaded ? "This server doesn't exist any more." : "Loading…" }), S.serversLoaded ? h("button", { class: "btn", type: "button", onclick: () => go("home") }, "Go home") : null));
  if (m === "chat") { if (S.lastScreen !== S.mobileScreen) S.stickBottom = true; renderFeed($("feed")); afterFeed(); renderComposer($("composer")); }
  S.lastScreen = S.mobileScreen;
  renderLayout(); renderHeader();
}

function renderHeader() {
  const box = $("header");
  const m = mode();
  const c = conv();
  const back = h("button", { type: "button", class: "ibtn back-btn", "aria-label": "Back", onclick: () => { S.mobileScreen = "nav"; schedule("layout", "tabs"); } }, icon("back", 20));
  const right = [];
  const pbtn = (p, ic, label, badge) => h("button", { type: "button", class: "ibtn" + (S.panel === p ? " on" : ""), "aria-label": label, title: label, onclick: () => { S.panelUser = S.panel !== p; setPanel(S.panel === p ? null : p); } }, icon(ic, 20), badge ? h("span", { class: "ibadge", text: badge > 9 ? "9+" : badge }) : null);
  let title;
  if (m === "chat" && c) {
    title = c.kind === "dm"
      ? [c.dm.group ? h("span", { class: "hd-ic" }, icon("users", 20)) : h("button", { type: "button", class: "hd-av", onclick: () => openProfile(c.dm.members.find(u => u !== S.me) || S.me) }, avatarSmall(c.dm.members.find(u => u !== S.me) || S.me)), h("b", { class: "ell", text: c.title })]
      : [h("span", { class: "hd-ic" }, icon(c.channel.type === "announce" ? "announce" : "hash", 20)), h("b", { class: "ell", text: c.channel.name }), c.channel.topic ? h("span", { class: "hd-topic ell", text: c.channel.topic }) : null];
    if (aiReady()) right.push(h("button", { type: "button", class: "ibtn", "aria-label": "Catch-up", title: "Catch me up (AI)", onclick: () => runCatchup() }, icon("sparkle", 20)));
    if (c.kind === "dm" && c.dm.group) right.push(h("button", { type: "button", class: "ibtn", "aria-label": "Leave group", title: "Leave group", onclick: () => leaveGroup(c.dm) }, icon("logout", 20)));
    right.push(pbtn("pins", "pin", "Pinned messages"), pbtn("search", "search", "Search"), pbtn("inbox", "bell", "Mentions", unreadMentions()), pbtn("members", "users", "Members"));
  } else if (m === "friends") {
    title = [h("span", { class: "hd-ic" }, icon("users", 20)), h("b", { text: "Friends" })];
    right.push(h("button", { type: "button", class: "ibtn", "aria-label": "New group chat", title: "New group chat", onclick: newGroupDM }, icon("plus", 20)), pbtn("inbox", "bell", "Mentions", unreadMentions()));
  } else if (m === "explore") {
    title = [h("span", { class: "hd-ic" }, icon("compass", 20)), h("b", { text: "Explore servers" })];
  } else if (m === "stage") {
    const ch = S.channels.find(x => S.stage === S.view + "/" + x.id);
    title = [h("span", { class: "hd-ic" }, icon("voice", 20)), h("b", { text: ch ? ch.name : "Hangout" })];
    right.push(h("button", { type: "button", class: "btn sm", onclick: () => { S.stage = null; schedule("main", "sidebar"); } }, "Back to chat"));
  } else title = [h("b", { text: server() ? server().name : APP.name })];
  fill(box, back, h("div", { class: "hd-title" }, title), h("div", { class: "hd-actions" }, right));
}

function avatarSmall(uid) {
  const p = S.profiles[uid];
  const el = h("span", { class: "av", style: { width: "26px", height: "26px", fontSize: "11px", background: (S.users[uid] && S.users[uid].banner) || (p && p.color) || "#71717A" } });
  if (p && p.avatarUrl && !p.avatarUrl.startsWith("data:image/svg")) el.append(h("img", { src: p.avatarUrl, alt: "" })); else el.textContent = nameOf(uid)[0];
  return el;
}

function renderTyping() {
  const c = conv();
  const box = $("typing");
  if (!c) { box.textContent = ""; return; }
  const ids = [...new Set(S.peers.filter(p => !p.isMe && p.uid && p.presence.typing === c.key && Date.now() - p.at < 7000).map(p => p.uid))];
  const names = ids.map(nameOf);
  if (S.botTyping === c.key) names.push(APP.botName);
  fill(box, names.length ? [h("span", { class: "dots" }, h("i"), h("i"), h("i")), h("b", { text: names.slice(0, 3).join(", ") }), names.length === 1 ? " is typing…" : " are typing…"] : null);
}
setInterval(() => schedule("typing"), 2000);

function renderTabs() {
  const box = $("tabs");
  const dmUnread = Object.values(S.dms).some(d => (d.members || []).includes(S.me) && isUnread("dm:" + d.id, d.lastAt, d.lastBy));
  const t = (id, ic, label, on, onclick, badge) => h("button", { type: "button", class: "tab" + (on ? " on" : ""), onclick }, h("span", { class: "tab-ic" }, icon(ic, 22), badge ? h("span", { class: "ibadge", text: badge === true ? "" : badge }) : null), h("span", { text: label }));
  fill(box,
    t("servers", "grid", "Servers", S.view !== "home", () => { const first = myServers()[0]; go(S.view !== "home" ? S.view : first || "explore"); S.mobileScreen = "nav"; schedule("layout", "tabs"); }, myServers().some(sid => isUnread("srv:" + sid, S.servers[sid].lastAt, S.servers[sid].lastBy)) ? true : 0),
    t("dms", "thread", "Messages", S.view === "home", () => { go("home"); S.mobileScreen = "nav"; schedule("layout", "tabs"); }, dmUnread ? true : pendingFriendCount()),
    t("inbox", "bell", "Mentions", false, () => { S.panelUser = true; S.mobileScreen = "main"; setPanel("inbox"); schedule("layout"); }, unreadMentions()),
    t("you", "user", "You", false, () => openSettings("profile")));
}

function renderTitle() {
  const n = unreadMentions() + Object.values(S.dms).filter(d => (d.members || []).includes(S.me) && isUnread("dm:" + d.id, d.lastAt, d.lastBy)).length;
  const c = conv();
  document.title = (n ? "(" + n + ") " : "") + (c ? (c.kind === "dm" ? c.title : "#" + c.title) + " · " : "") + APP.name;
}

function renderBanner() {
  const b = $("banner");
  if (S.api && S.api.mode === "demo") {
    b.hidden = false;
    fill(b, icon("eye", 14), h("span", { class: "grow", text: "Demo mode. The people here are examples and your changes stay in this browser." }), h("button", { type: "button", class: "link-btn", onclick: () => b.hidden = true }, "Hide"));
  } else if (S.api && !S.api.canWrite) {
    b.hidden = false; fill(b, icon("lock", 14), h("span", { text: "You have view-only access. Ask the owner to make you a Contributor to chat." }));
  } else b.hidden = true;
}

// ---------- conversation sync ----------
let convKey = null, serverKey = null, threadKey = null;
function onNavigate() {
  // server data
  const sid = S.servers[S.view] ? S.view : null;
  if (sid !== serverKey) {
    serverKey = sid;
    S.channels = []; S.members = {}; S.channelsLoaded = false;
    if (sid) {
      sub("channels", S.api.watchCol("servers/" + sid + "/channels", { orderBy: ["order"] }, rows => {
        S.channels = rows; S.channelsLoaded = true;
        const cur = S.chanBy[sid];
        if (!rows.some(c => c.id === cur && c.type !== "voice")) {
          const first = rows.find(c => c.type === "text") || rows.find(c => c.type !== "voice");
          if (first) { S.chanBy[sid] = first.id; store.set("chanBy", S.chanBy); }
        }
        syncConv(); schedule("sidebar", "main", "header", "voicebar");
      }));
      sub("members", S.api.watchCol("servers/" + sid + "/members", { limit: 1000 }, rows => {
        S.members = {}; for (const r of rows) S.members[r.id] = r;
        want(rows.map(r => r.id));
        schedule("sidebar", "panel", "composer", "header", "feed");
      }));
    } else { unsub("channels"); unsub("members"); }
  }
  if (S.stage && !S.stage.startsWith(S.view + "/")) S.stage = null;
  syncConv();
  scheduleAll();
}
document.addEventListener("roost:navigate", onNavigate);

function syncConv() {
  const c = conv();
  const key = c ? c.key : null;
  if (key === convKey) return;
  convKey = key;
  S.msgs = []; S.msgsReady = false; S.stickBottom = true; S.searchResults = null; S.searchQ = "";
  resetPins();
  if (!c) { unsub("msgs"); return; }
  S.readAnchor = { key, at: S.reads[key] || 0 };
  let first = true;
  sub("msgs", S.api.watchCol(c.path, { orderBy: ["at", "desc"], limit: APP.pageSize }, rows => {
    const prevIds = new Set(S.msgs.map(m => m.id));
    S.msgs = rows.reverse();
    S.msgsReady = true;
    want(S.msgs.map(m => m.by));
    if (!first) {
      const fresh = S.msgs.filter(m => !prevIds.has(m.id) && m.by !== S.me);
      if (fresh.some(m => (m.text || "").includes("<@" + S.me + ">")) && notifyPrefs().mentions) ping();
    }
    first = false;
    schedule("feed", "panel");
  }, () => { S.msgsReady = true; schedule("feed"); toast("Couldn't load messages. Reload to try again.", "bad"); }));
}

function ensureThreadSub() {
  const t = S.panel === "thread" ? S.thread : null;
  const key = t ? t.path : null;
  if (key === threadKey) return;
  threadKey = key;
  S.threadMsgs = [];
  if (!t) { unsub("thread"); return; }
  sub("thread", S.api.watchCol(t.path, { orderBy: ["at", "asc"], limit: 200 }, rows => { S.threadMsgs = rows; want(rows.map(r => r.by)); schedule("thread"); }));
}

function afterFeed() {
  if (S.jumpTo && S.msgsReady) {
    const id = S.jumpTo;
    if (document.getElementById("msg-" + id)) { S.jumpTo = null; setTimeout(() => scrollToMsg(id), 50); }
    else if (S.msgs.length) { S.jumpTo = null; }
  }
}

function runCatchup() {
  const c = conv(); if (!c) return;
  catchUp(c, S.msgs, S.readAnchor && S.readAnchor.key === c.key ? S.readAnchor.at : 0);
  $("feed").scrollTop = 0;
}
document.addEventListener("roost:catchup", runCatchup);
document.addEventListener("roost:join", e => joinServer(e.detail));

// ---------- quick switcher ----------
function quickSwitcher() {
  const input = h("input", { class: "input big", id: "qs", placeholder: "Where to? Servers, channels, people", autocomplete: "off" });
  const list = h("div", { class: "qs-list" });
  let items = [], idx = 0;
  const all = () => {
    const out = [];
    for (const sid of myServers()) out.push({ label: S.servers[sid].name, sub: "Server", icon: "grid", go: () => go(sid, { main: true }) });
    for (const c of S.channels) if (c.type !== "voice" && server()) out.push({ label: "#" + c.name, sub: server().name, icon: "hash", go: () => go(S.view, { channel: c.id, main: true }) });
    for (const d of Object.values(S.dms)) if ((d.members || []).includes(S.me)) out.push({ label: dmTitle(d), sub: "Direct message", icon: "thread", go: () => go("home", { dm: d.id, main: true }) });
    out.push({ label: "Friends", sub: "Home", icon: "users", go: () => go("home", { dm: "friends", main: true }) });
    out.push({ label: "Explore servers", sub: "", icon: "compass", go: () => go("explore", { main: true }) });
    return out;
  };
  const draw = () => {
    const q = input.value.toLowerCase().replace(/^#/, "");
    items = all().filter(i => i.label.toLowerCase().replace(/^#/, "").includes(q)).slice(0, 10);
    idx = Math.min(idx, Math.max(0, items.length - 1));
    fill(list, items.map((it, i) => h("button", { type: "button", class: "qs-item" + (i === idx ? " on" : ""), onclick: () => { m.close(); it.go(); } }, icon(it.icon, 16), h("b", { text: it.label }), h("span", { class: "dim grow-r", text: it.sub }))));
  };
  input.addEventListener("input", () => { idx = 0; draw(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); draw(); }
    if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(0, idx - 1); draw(); }
    if (e.key === "Enter" && items[idx]) { e.preventDefault(); m.close(); items[idx].go(); }
  });
  const m = modal({ body: [input, list], className: "qs" });
  draw();
  setTimeout(() => input.focus(), 30);
}
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); quickSwitcher(); }
  if (e.key === "Escape" && !document.querySelector("#layers .modal, #layers .menu") && S.panel && !isMobile() && document.activeElement && document.activeElement.id !== "msg-input") setPanel(null);
});

// ---------- boot ----------
async function boot() {
  const api = await connect();
  S.api = api; S.me = api.me.id;
  if (api.me.name || api.me.avatarUrl) S.profiles[S.me] = { id: S.me, name: api.me.name, avatarUrl: api.me.avatarUrl, color: api.me.color };
  want(S.me);
  document.documentElement.dataset.backend = api.mode;
  const bootAt = Date.now();
  let usersLoaded = false;

  sub("users", api.watchCol("users", { limit: 1000 }, rows => {
    S.users = {}; for (const r of rows) S.users[r.id] = r;
    if (!usersLoaded) {
      usersLoaded = true;
      if (!S.users[S.me] && api.canWrite) saveMe({}).catch(() => {});
      firstRun();
    }
    scheduleAll();
  }));
  sub("servers", api.watchCol("servers", { limit: 500 }, rows => {
    S.servers = {}; for (const r of rows) S.servers[r.id] = r;
    S.serversLoaded = true;
    onNavigate();
  }));
  sub("dms", api.watchCol("dms", { where: [["members", "array-contains", S.me]], limit: 300 }, rows => {
    const before = S.dms;
    S.dms = {}; for (const r of rows) S.dms[r.id] = r;
    want(rows.flatMap(r => r.members || []));
    // sound for new DMs you're not looking at
    for (const d of rows) {
      const old = before[d.id];
      if (old && d.lastAt > (old.lastAt || 0) && d.lastBy !== S.me && d.lastBy !== "system" && !(S.view === "home" && S.homeTab === d.id && document.visibilityState === "visible") && notifyPrefs().dms) { ping(); break; }
    }
    onNavigate();
  }));
  sub("friends", api.watchCol("friends", { where: [["users", "array-contains", S.me]], limit: 500 }, rows => {
    S.friends = rows; want(rows.flatMap(r => r.users)); schedule("rail", "sidebar", "main", "tabs", "header");
  }));
  sub("inbox", api.watchCol("inbox/" + S.me + "/items", { orderBy: ["at", "desc"], limit: 50 }, rows => {
    const newest = S.inbox[0] ? S.inbox[0].at : bootAt;
    S.inbox = rows; want(rows.map(r => r.by));
    if (rows[0] && rows[0].at > newest && notifyPrefs().mentions) ping();
    schedule("header", "tabs", "title", "panel");
  }));
  sub("reads", api.watchDoc("data/users/" + S.me + "/reads", doc => {
    if (doc) { const merged = Object.assign({}, doc); delete merged.id; for (const k in S.reads) merged[k] = Math.max(merged[k] || 0, S.reads[k]); S.reads = merged; }
    schedule("rail", "sidebar", "tabs", "title", "header");
  }));

  renderShell();
  scheduleAll();

  await api.loadExtras();
  if (api.live) {
    api.presence({ uid: S.me, voice: null, typing: null });
    let prevVoice = new Set();
    api.onPeers(peers => {
      S.peers = peers;
      want(peers.map(p => p.uid).filter(Boolean));
      if (S.voice) {
        const now = new Set(voicePeers(S.voice).map(p => p.uid));
        const joined = [...now].some(u => !prevVoice.has(u) && u !== S.me);
        const left = [...prevVoice].some(u => !now.has(u) && u !== S.me);
        if ((joined || left) && notifyPrefs().joins) import("./lib/sound.js").then(s => joined ? s.joinSound() : s.leaveSound());
        prevVoice = now;
      }
      schedule("sidebar", "panel", "typing", "main", "header");
    });
    wireVoice();
  }
  scheduleAll();
}

function firstRun() {
  if (store.get("onboarded") || S.api.mode === "demo") return;
  store.set("onboarded", true);
  const m = modal({
    title: "Welcome to " + APP.name,
    body: h("div", { class: "onboard" }, logo(64), h("p", { text: APP.tagline + " Create a server for your friends, or explore the ones already here." })),
    actions: [h("button", { class: "btn", type: "button", onclick: () => { m.close(); go("explore", { main: true }); } }, "Explore servers"), h("button", { class: "btn primary", type: "button", onclick: () => { m.close(); createServerModal(); } }, "Create a server")],
  });
}

function renderShell() {
  bindDrop($("chat"));
  window.addEventListener("resize", debounce(() => schedule("layout"), 100));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule("feed"); });
  $("feed").addEventListener("scroll", debounce(() => {
    const f = $("feed");
    const near = f.scrollHeight - f.scrollTop - f.clientHeight < 140;
    $("jump").hidden = near;
    const c = conv();
    if (near && c && S.msgs.length) markRead(c.key, S.msgs[S.msgs.length - 1].at);
  }, 80));
  $("jump").addEventListener("click", () => { const f = $("feed"); f.scrollTop = f.scrollHeight; });
}

boot().catch(e => {
  console.error(e);
  fill(document.getElementById("chat"), h("div", { class: "empty" }, h("b", { text: "Something went wrong starting " + APP.name }), h("span", { text: "Reload the page to try again." })));
});
