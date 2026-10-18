// The message box: typing, mentions, slash commands, uploads, polls/games, sending.
import { APP } from "../config.js";
import { h, fill, icon, menu, modal, toast, fmtSize, isMobile } from "../lib/dom.js";
import { S, conv, nameOf, server, isMod, isMuted, schedule, write } from "../state.js";
import { avatar } from "./people.js";
import { emojiPicker, startEdit } from "./messages.js";
import { postMessage, filterHit } from "./send.js";
import { aiReady, botReply, moderate, triviaQuestion } from "./ai.js";
import { newTTT, newRPS, newTrivia, newPoll, newWatch, rollDice, TRIVIA_BANK } from "./widgets.js";

const drafts = {};
let pendingFiles = [];
let mentionMap = {};
let typingTimer = null, lastTypingSent = 0;
let ac = null; // autocomplete state {items, index, start, kind}

const COMMANDS = [
  ["poll", "Question | option | option", "Start a poll"],
  ["ttt", "", "Play tic-tac-toe"],
  ["rps", "", "Rock, paper, scissors"],
  ["trivia", "[topic]", "A 30-second trivia question"],
  ["roll", "[2d6]", "Roll dice"],
  ["flip", "", "Flip a coin"],
  ["watch", "link [title]", "Start a watch party"],
  ["ai", "question", "Ask " + APP.botName],
  ["catchup", "", "Summarise what you missed"],
  ["shrug", "[message]", "¯\\_(ツ)_/¯"],
  ["tableflip", "[message]", "(╯°□°)╯︵ ┻━┻"],
  ["me", "action", "Say it in italics"],
];

export function renderComposer(box) {
  const c = conv();
  if (!c) { fill(box); box.dataset.key = ""; return; }
  const blocked = reasonBlocked(c);
  if (box.dataset.key !== c.key || !box.querySelector("#msg-input") !== !!blocked) build(box, c, blocked);
  updateBits(box, c);
}

function reasonBlocked(c) {
  if (!S.api.canWrite) return "You have view-only access, so you can read but not send.";
  if (c.kind === "channel") {
    if (!S.members[S.me]) return "join";
    if (isMuted()) return "You're timed out until " + new Date(S.members[S.me].mutedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ".";
    if (c.channel.type === "announce" && !isMod()) return "Only mods can post in announcement channels.";
  }
  return null;
}

function build(box, c, blocked) {
  box.dataset.key = c.key;
  pendingFiles = []; mentionMap = {};
  if (blocked === "join") {
    fill(box, h("div", { class: "composer-ro" }, h("span", { text: "You're previewing " + c.server.name + "." }), h("button", { class: "btn primary sm", type: "button", onclick: () => document.dispatchEvent(new CustomEvent("roost:join", { detail: c.server.id })) }, "Join server")));
    return;
  }
  if (blocked) { fill(box, h("div", { class: "composer-ro", text: blocked })); return; }
  const input = h("textarea", { id: "msg-input", class: "msg-input", rows: 1, maxlength: 4000, "aria-label": "Message", enterkeyhint: "send" });
  input.value = drafts[c.key] || "";
  const fileIn = h("input", { type: "file", id: "file-in", multiple: true, hidden: true, onchange: e => { addFiles([...e.target.files]); e.target.value = ""; } });
  const plusBtn = h("button", { type: "button", class: "cbtn", "aria-label": "Add", title: "Upload, polls, games" }, icon("plus", 20));
  plusBtn.addEventListener("click", () => plusMenu(plusBtn, c, fileIn));
  const emojiBtn = h("button", { type: "button", class: "cbtn", "aria-label": "Emoji", title: "Emoji" }, icon("smile", 20));
  emojiBtn.addEventListener("click", () => emojiPicker(emojiBtn, e => insertAt(input, e + " ")));
  const sendBtn = h("button", { type: "button", class: "cbtn send", "aria-label": "Send", title: "Send" }, icon("send", 18));
  sendBtn.addEventListener("click", () => send(input));
  fill(box,
    h("div", { class: "ac", id: "ac", hidden: true }),
    h("div", { class: "reply-bar", id: "reply-bar", hidden: true }),
    h("div", { class: "pending-files", id: "pending-files", hidden: true }),
    h("div", { class: "composer-row" }, plusBtn, input, emojiBtn, sendBtn, fileIn),
    h("div", { class: "composer-hint dim", id: "composer-hint" }));
  autosize(input);
  input.addEventListener("input", () => { drafts[c.key] = input.value; autosize(input); typing(c); autocomplete(input, c); });
  input.addEventListener("keydown", e => keydown(e, input, c));
  input.addEventListener("paste", e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
  input.addEventListener("blur", () => setTimeout(() => closeAC(), 150));
  if (!isMobile()) setTimeout(() => input.focus(), 30);
}

function updateBits(box, c) {
  const input = box.querySelector("#msg-input");
  if (!input) return;
  input.placeholder = c.kind === "dm" ? "Message " + c.title : "Message #" + c.channel.name;
  const rb = box.querySelector("#reply-bar");
  if (S.replyTo) {
    rb.hidden = false;
    fill(rb, icon("reply", 14), h("span", { class: "grow" }, "Replying to ", h("b", { text: nameOf(S.replyTo.by) }), h("span", { class: "dim", text: " " + S.replyTo.text })),
      h("button", { type: "button", class: "ibtn sm", "aria-label": "Cancel reply", onclick: () => { S.replyTo = null; schedule("composer"); } }, icon("x", 14)));
  } else rb.hidden = true;
  const pf = box.querySelector("#pending-files");
  pf.hidden = !pendingFiles.length;
  fill(pf, pendingFiles.map((f, i) => h("div", { class: "pfile" },
    f.preview ? h("img", { src: f.preview, alt: "" }) : icon("clip", 18),
    h("span", { class: "pfile-name", text: f.file.name }), h("span", { class: "dim", text: fmtSize(f.file.size) }),
    h("button", { type: "button", class: "ibtn sm", "aria-label": "Remove " + f.file.name, onclick: () => { if (f.preview) URL.revokeObjectURL(f.preview); pendingFiles.splice(i, 1); schedule("composer"); } }, icon("x", 14)))));
  const hint = box.querySelector("#composer-hint");
  const sm = c.kind === "channel" && c.channel.slowmode ? c.channel.slowmode : 0;
  hint.textContent = sm ? "Slow mode: one message every " + sm + "s" : "";
}

function autosize(t) { t.style.height = "auto"; const sh = t.scrollHeight; t.style.height = sh ? Math.min(sh, 200) + "px" : ""; }
function insertAt(input, text) {
  const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, s) + text + input.value.slice(e);
  input.selectionStart = input.selectionEnd = s + text.length;
  input.dispatchEvent(new Event("input")); input.focus();
}

function typing(c) {
  if (!S.api.live) return;
  const now = Date.now();
  if (now - lastTypingSent > 2500) { S.api.presence({ typing: c.key }); lastTypingSent = now; }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 4000);
}
function stopTyping() { clearTimeout(typingTimer); lastTypingSent = 0; if (S.api && S.api.live) S.api.presence({ typing: null }); }

// ---------- files ----------
export function addFiles(files) {
  if (!S.api.upload) { toast("Uploads aren't available in this view."); return; }
  for (const f of files) {
    if (f.size > APP.maxUploadMB * 1048576) { toast(f.name + " is over " + APP.maxUploadMB + " MB."); continue; }
    if (pendingFiles.length >= 6) { toast("Up to 6 files per message."); break; }
    pendingFiles.push({ file: f, preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : null });
  }
  schedule("composer");
}

// ---------- keyboard & autocomplete ----------
function keydown(e, input, c) {
  if (ac && !ac.el.hidden) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); ac.index = (ac.index + (e.key === "ArrowDown" ? 1 : -1) + ac.items.length) % ac.items.length; drawAC(); return; }
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      const it = ac.items[ac.index];
      // a finished command (or one that needs no extra text) sends straight away
      if (e.key === "Enter" && it.kind === "cmd" && (input.value.trim() === it.label || !it.sub)) { input.value = it.label; closeAC(); send(input); return; }
      pickAC(input, ac.index); return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAC(); return; }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !(isMobile() && !e.ctrlKey)) { e.preventDefault(); send(input); return; }
  if (e.key === "Escape" && S.replyTo) { e.stopPropagation(); S.replyTo = null; schedule("composer"); return; }
  if (e.key === "ArrowUp" && !input.value) {
    const mine = [...S.msgs].reverse().find(m => m.by === S.me && (!m.kind || m.kind === "text"));
    if (mine) { e.preventDefault(); startEdit(mine); }
  }
}

function people(c) {
  const ids = c.kind === "dm" ? c.dm.members : Object.keys(S.members);
  return ids.filter(u => u !== S.me);
}

function autocomplete(input, c) {
  const before = input.value.slice(0, input.selectionStart);
  let m;
  if ((m = before.match(/^\/(\w*)$/))) {
    const q = m[1].toLowerCase();
    const items = COMMANDS.filter(([n]) => n.startsWith(q)).map(([n, args, desc]) => ({ kind: "cmd", label: "/" + n, sub: args, desc, insert: "/" + n + " " }));
    return openAC(items, 0);
  }
  if ((m = before.match(/(^|\s)@([\w.-]*)$/))) {
    const q = m[2].toLowerCase();
    const start = before.length - m[2].length - 1;
    const items = [];
    if (aiReady() && APP.botName.toLowerCase().startsWith(q)) items.push({ kind: "bot", label: APP.botName, desc: "Ask the AI", insert: "@" + APP.botName + " ", uid: APP.botId });
    for (const uid of people(c)) if (nameOf(uid).toLowerCase().includes(q)) items.push({ kind: "user", label: nameOf(uid), uid, insert: "@" + nameOf(uid) + " " });
    if (c.kind === "channel" && "everyone".startsWith(q) && isMod()) items.push({ kind: "all", label: "@everyone", desc: "Notify everyone here", insert: "@everyone " });
    return openAC(items.slice(0, 8), start);
  }
  if ((m = before.match(/(^|\s):([a-z0-9_]{2,})$/))) {
    const emo = (server() && server().emoji) || {};
    const q = m[2];
    const items = Object.keys(emo).filter(k => k.includes(q)).slice(0, 8).map(k => ({ kind: "emoji", label: ":" + k + ":", img: emo[k], insert: ":" + k + ": " }));
    return openAC(items, before.length - q.length - 1);
  }
  closeAC();
}
function openAC(items, start) {
  const el = document.getElementById("ac");
  if (!el || !items.length) return closeAC();
  ac = { items, index: 0, start, el };
  drawAC();
}
function drawAC() {
  const { el, items, index } = ac;
  el.hidden = false;
  fill(el, items.map((it, i) => h("button", { type: "button", class: "ac-item" + (i === index ? " on" : ""), onmousedown: e => { e.preventDefault(); pickAC(document.getElementById("msg-input"), i); } },
    it.kind === "user" ? avatar(it.uid, 22) : it.kind === "bot" ? avatar(APP.botId, 22) : it.kind === "emoji" ? h("img", { class: "cemoji", src: it.img, alt: "" }) : h("span", { class: "ac-ic" }, icon(it.kind === "cmd" ? "bolt" : "at", 14)),
    h("b", { text: it.label }), it.sub ? h("span", { class: "dim", text: it.sub }) : null, it.desc ? h("span", { class: "dim grow-r", text: it.desc }) : null)));
}
function pickAC(input, i) {
  const it = ac.items[i];
  const pos = input.selectionStart;
  const start = it.kind === "cmd" ? 0 : ac.start;
  input.value = input.value.slice(0, start) + it.insert + input.value.slice(pos);
  input.selectionStart = input.selectionEnd = start + it.insert.length;
  if (it.uid) mentionMap[it.label] = it.uid;
  closeAC();
  input.dispatchEvent(new Event("input"));
  input.focus();
}
function closeAC() { if (ac && ac.el) ac.el.hidden = true; ac = null; }

// ---------- plus menu ----------
function plusMenu(anchor, c, fileIn) {
  menu(anchor, [
    { label: "Upload files", icon: "upload", onClick: () => S.api.upload ? fileIn.click() : toast("Uploads aren't available in this view.") },
    { label: "Create poll", icon: "poll", onClick: () => pollBuilder(c) },
    "-",
    { label: "Tic-tac-toe", icon: "game", onClick: () => post(c, newTTT()) },
    { label: "Rock, paper, scissors", icon: "game", onClick: () => post(c, newRPS()) },
    { label: "Trivia question", icon: "sparkle", onClick: () => startTrivia(c, "") },
    { label: "Roll dice", icon: "dice", onClick: () => post(c, { kind: "roll", text: "", roll: rollDice("1d6") }) },
    { label: "Watch party", icon: "film", onClick: () => watchBuilder(c) },
    aiReady() ? "-" : null,
    aiReady() ? { label: "Ask " + APP.botName, icon: "sparkle", onClick: () => { const i = document.getElementById("msg-input"); i.value = "@" + APP.botName + " "; mentionMap[APP.botName] = APP.botId; i.focus(); } } : null,
  ], { align: "left" });
}

function pollBuilder(c) {
  const q = h("input", { class: "input", id: "pq", maxlength: 140, placeholder: "Ask a question" });
  const opts = h("div", { class: "poll-build" });
  const addOpt = (v = "") => { if (opts.children.length >= 6) return; const i = opts.children.length; opts.append(h("input", { class: "input", id: "po" + i, maxlength: 60, placeholder: "Option " + (i + 1), value: v })); };
  addOpt(); addOpt();
  const m = modal({
    title: "Create a poll",
    body: [h("label", { class: "field", for: "pq" }, h("span", { text: "Question" }), q), h("div", { class: "field" }, h("span", { text: "Options" }), opts, h("button", { type: "button", class: "link-btn", onclick: () => addOpt() }, "+ Add option"))],
    actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: () => {
      const options = [...opts.querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean);
      if (!q.value.trim() || options.length < 2) { toast("Add a question and at least two options."); return; }
      m.close(); post(c, newPoll(q.value.trim(), options));
    } }, "Post poll")],
  });
}

function watchBuilder(c) {
  const url = h("input", { class: "input", id: "wu", placeholder: "https://youtube.com/watch?v=…", inputmode: "url" });
  const title = h("input", { class: "input", id: "wt", maxlength: 60, placeholder: "Optional title" });
  const m = modal({
    title: "Start a watch party",
    body: [h("p", { class: "muted", text: "Everyone opens the link, then you start a 5-second countdown so you all press play together." }), h("label", { class: "field", for: "wu" }, h("span", { text: "Link" }), url), h("label", { class: "field", for: "wt" }, h("span", { text: "Title" }), title)],
    actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: () => { const w = newWatch(url.value.trim(), title.value.trim()); if (w) { m.close(); post(c, w); } } }, "Post")],
  });
}

async function startTrivia(c, topic) {
  let q = null;
  if (aiReady()) { toast("Writing a question…"); q = await triviaQuestion(topic); }
  if (!q) q = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
  post(c, newTrivia(q));
}

function post(c, data) { S.stickBottom = true; return postMessage(c, data); }

// ---------- sending ----------
async function send(input) {
  const c = conv(); if (!c) return;
  let text = input.value.replace(/\s+$/, "");
  if (!text.trim() && !pendingFiles.length) return;

  // slash commands
  const cmd = text.match(/^\/(\w+)\s*([\s\S]*)$/);
  if (cmd && COMMANDS.some(([n]) => n === cmd[1].toLowerCase())) {
    const name = cmd[1].toLowerCase(), arg = cmd[2].trim();
    clear(input, c);
    if (name === "poll") {
      const parts = arg.split("|").map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3) post(c, newPoll(parts[0], parts.slice(1, 7))); else pollBuilder(c);
    } else if (name === "ttt") post(c, newTTT());
    else if (name === "rps") post(c, newRPS());
    else if (name === "trivia") startTrivia(c, arg);
    else if (name === "roll") post(c, { kind: "roll", text: "", roll: rollDice(arg || "1d6") });
    else if (name === "flip") post(c, { kind: "roll", text: "", roll: { coin: Math.random() < 0.5 ? "heads" : "tails" } });
    else if (name === "watch") { const [u, ...t] = arg.split(/\s+/); if (!u) watchBuilder(c); else { const w = newWatch(u, t.join(" ")); if (w) post(c, w); } }
    else if (name === "ai") { if (!arg) { toast("Add a question after /ai"); return; } await post(c, { text: "<@" + APP.botId + "> " + arg }); botReply(c, arg, S.msgs); }
    else if (name === "catchup") document.dispatchEvent(new CustomEvent("roost:catchup"));
    else if (name === "shrug") post(c, { text: (arg ? arg + " " : "") + "¯\\_(ツ)_/¯" });
    else if (name === "tableflip") post(c, { text: (arg ? arg + " " : "") + "(╯°□°)╯︵ ┻━┻" });
    else if (name === "me") post(c, { text: "_" + arg + "_" });
    return;
  }

  // checks
  if (c.kind === "channel") {
    const sm = c.channel.slowmode || 0;
    const last = S.lastSent[c.key] || 0;
    if (sm && !isMod() && Date.now() - last < sm * 1000) { toast("Slow mode is on. Wait " + Math.ceil((sm * 1000 - (Date.now() - last)) / 1000) + "s."); return; }
    const hit = filterHit(text, c.server.filter);
    if (hit && !isMod()) { toast("That message has a blocked word (\"" + hit + "\")."); return; }
  }

  // mentions -> ids
  let askBot = false;
  for (const label in mentionMap) {
    const uid = mentionMap[label];
    if (text.includes("@" + label)) { text = text.split("@" + label).join("<@" + uid + ">"); if (uid === APP.botId) askBot = true; }
  }
  if (!askBot && aiReady() && new RegExp("@" + APP.botName.split(" ")[0] + "\\b", "i").test(text)) { askBot = true; text = text.replace(new RegExp("@" + APP.botName.replace(/\s/g, "\\s") + "|@" + APP.botName.split(" ")[0], "i"), "<@" + APP.botId + ">"); }

  if (c.kind === "channel" && c.server.aiMod && text.trim() && !isMod()) {
    const reason = await moderate(text);
    if (reason) { toast("Auto-mod blocked this: " + reason, "bad"); return; }
  }

  const files = pendingFiles.slice();
  const replyTo = S.replyTo ? { id: S.replyTo.id, by: S.replyTo.by, text: S.replyTo.text } : null;
  clear(input, c);
  let uploaded = [];
  if (files.length) {
    toast("Uploading " + files.length + (files.length === 1 ? " file…" : " files…"));
    for (const f of files) {
      const url = await write(() => S.api.upload(f.file), "upload " + f.file.name);
      if (url) uploaded.push({ url, name: f.file.name, type: f.file.type || "application/octet-stream", size: f.file.size });
      if (f.preview) URL.revokeObjectURL(f.preview);
    }
    if (!uploaded.length && !text.trim()) return;
  }
  const data = { text: text.trim() };
  if (replyTo) data.replyTo = replyTo;
  if (uploaded.length) data.files = uploaded;
  S.lastSent[c.key] = Date.now();
  const recent = S.msgs.slice();
  const id = await post(c, data);
  if (id && askBot) botReply(c, text.replace(/<@[\w:.-]+>/g, "").trim(), recent.concat([Object.assign({ id, by: S.me, at: Date.now() }, data)]));
}

function clear(input, c) {
  input.value = ""; drafts[c.key] = ""; autosize(input);
  pendingFiles = []; S.replyTo = null; mentionMap = {};
  stopTyping(); closeAC(); schedule("composer");
}

// drag & drop onto the chat
export function bindDrop(el) {
  el.addEventListener("dragover", e => { if ([...(e.dataTransfer.types || [])].includes("Files")) { e.preventDefault(); el.classList.add("drop"); } });
  el.addEventListener("dragleave", e => { if (e.target === el) el.classList.remove("drop"); });
  el.addEventListener("drop", e => { e.preventDefault(); el.classList.remove("drop"); addFiles([...e.dataTransfer.files]); });
}
