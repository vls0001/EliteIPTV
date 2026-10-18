// Hangouts: join a room, see who's there, soundboard and floating emotes for everyone in it.
// Real voice audio needs WebRTC, which comes with the mobile/desktop apps.
import { h, fill, icon, toast } from "../lib/dom.js";
import { SOUNDS, joinSound, leaveSound } from "../lib/sound.js";
import { S, nameOf, schedule, go } from "../state.js";
import { avatar, notifyPrefs } from "./people.js";

export function voicePeers(key) {
  const seen = new Set();
  return S.peers.filter(p => p.presence && p.presence.voice === key && p.uid && !seen.has(p.uid) && seen.add(p.uid));
}

export function joinVoice(key) {
  const [sid, cid] = key.split("/");
  if (!S.api.live) { toast("Hangouts need the live app."); return; }
  if (S.voice !== key) {
    S.voice = key;
    S.api.presence({ voice: key, talking: null });
    if (notifyPrefs().joins) joinSound();
  }
  S.stage = key;
  go(sid, { main: true });
  schedule("sidebar", "main", "voicebar");
}

export function leaveVoice() {
  if (!S.voice) return;
  S.voice = null; S.stage = null;
  S.api.presence({ voice: null, talking: null });
  if (notifyPrefs().joins) leaveSound();
  schedule("sidebar", "main", "voicebar");
}

export function playSound(key) {
  if (!S.voice) return;
  S.api.emit("sound", { key, room: S.voice });
}
export function sendEmote(e) {
  if (!S.voice) return;
  S.api.emit("emote", { e, room: S.voice });
}

let wired = false;
export function wireVoice() {
  if (wired || !S.api.live) return;
  wired = true;
  S.api.on("sound", m => {
    const d = m.data || {};
    if (!S.voice || d.room !== S.voice || !SOUNDS[d.key]) return;
    if (notifyPrefs().soundboard) SOUNDS[d.key].play();
    floatEmote(SOUNDS[d.key].emoji, m.uid);
  });
  S.api.on("emote", m => {
    const d = m.data || {};
    if (!S.voice || d.room !== S.voice || typeof d.e !== "string" || d.e.length > 8) return;
    floatEmote(d.e, m.uid);
  });
}

function floatEmote(e, uid) {
  const stage = document.getElementById("stage-floats");
  if (!stage) return;
  const el = h("span", { class: "float-emote", style: { left: (10 + Math.random() * 80) + "%" } }, e, h("small", { text: nameOf(uid) }));
  stage.append(el);
  setTimeout(() => el.remove(), 2600);
}

// main area when a hangout is open
export function renderStage(box, key) {
  const [sid, cid] = key.split("/");
  const ch = S.channels.find(c => c.id === cid);
  const ppl = voicePeers(key);
  const inIt = S.voice === key;
  fill(box, h("div", { class: "stage" },
    h("div", { class: "stage-hd" }, icon("voice", 20), h("b", { text: ch ? ch.name : "Hangout" }), h("span", { class: "dim", text: ppl.length + (ppl.length === 1 ? " person" : " people") + " here" })),
    h("div", { class: "stage-floats", id: "stage-floats" }),
    h("div", { class: "stage-grid" }, ppl.length ? ppl.map(p => h("div", { class: "tile" + (p.presence.talking ? " talking" : "") }, avatar(p.uid, 88), h("b", { text: nameOf(p.uid) + (p.isMe && nameOf(p.uid) !== "You" ? " (you)" : "") }), p.presence.mood ? h("span", { class: "dim", text: p.presence.mood }) : null))
      : h("div", { class: "empty" }, h("b", { text: "Nobody's here yet" }), h("span", { text: "Join and people will see you in the channel list." }))),
    inIt ? h("div", { class: "stage-tools" },
      h("div", { class: "sb" }, Object.entries(SOUNDS).map(([k, s]) => h("button", { type: "button", class: "sb-btn", onclick: () => playSound(k) }, h("span", { class: "sb-e", text: s.emoji }), h("span", { text: s.label })))),
      h("div", { class: "emote-row" }, ["👋", "😂", "🔥", "💀", "❤️", "🎉", "👀", "🫡"].map(e => h("button", { type: "button", class: "emoji-btn", "aria-label": "Send " + e, onclick: () => sendEmote(e) }, e))),
      h("div", { class: "row-btns center" },
        h("button", { type: "button", class: "btn" + (presenceTalking() ? " primary" : ""), onclick: toggleHand }, "✋ " + (presenceTalking() ? "Lower hand" : "Raise hand")),
        h("button", { type: "button", class: "btn danger", onclick: leaveVoice }, icon("logout", 16), "Leave hangout"))) :
      h("div", { class: "row-btns center" }, h("button", { type: "button", class: "btn primary big", onclick: () => joinVoice(key) }, "Join hangout")),
    h("p", { class: "dim small center", text: "Voice and video calls arrive with the " + "mobile and desktop apps. For now, hang out with soundboard clips and emotes." })));
}

function presenceTalking() { const me = S.peers.find(p => p.isMe && p.sameTab); return !!(me && me.presence.talking); }
function toggleHand() { S.api.presence({ talking: presenceTalking() ? null : true }); }

export function renderVoiceBar(box) {
  if (!S.voice) { box.hidden = true; return; }
  const [sid, cid] = S.voice.split("/");
  const sv = S.servers[sid];
  const ch = S.channels.find(c => c.id === cid);
  box.hidden = false;
  fill(box,
    h("button", { type: "button", class: "vbar-main", onclick: () => joinVoice(S.voice) }, h("span", { class: "live-dot" }), h("span", { class: "vbar-txt" }, h("b", { text: "In a hangout" }), h("small", { text: (ch ? ch.name : "Hangout") + (sv ? " · " + sv.name : "") }))),
    h("button", { type: "button", class: "ibtn bad", title: "Leave hangout", "aria-label": "Leave hangout", onclick: leaveVoice }, icon("logout", 16)));
}
