// Posting messages: writes the message, bumps unread markers, and notifies mentioned people.
import { APP } from "../config.js";
import { S, nameOf, write } from "../state.js";
import { mentionsIn, plain } from "../lib/text.js";

// conv: from state.conv(); data: message fields (by/at/kind filled in if missing)
export async function postMessage(c, data, opts = {}) {
  const msg = Object.assign({ by: S.me, at: Date.now(), kind: "text" }, data);
  const id = await write(() => S.api.add(c.path, msg), "send that message");
  if (id === null) return null;
  const preview = previewOf(msg);
  // unread markers (best effort; failures don't matter)
  if (c.kind === "channel") {
    S.api.update(c.parentPath, { lastAt: msg.at, lastBy: msg.by }).catch(() => {});
    S.api.update("servers/" + c.server.id, { lastAt: msg.at, lastBy: msg.by }).catch(() => {});
  } else if (c.kind === "dm") {
    S.api.update(c.parentPath, { lastAt: msg.at, lastBy: msg.by, lastText: preview.slice(0, 80) }).catch(() => {});
  }
  // notify mentioned people and the person being replied to
  if (!opts.silent) {
    const targets = new Set(mentionsIn(msg.text || ""));
    if (msg.replyTo && msg.replyTo.by) targets.add(msg.replyTo.by);
    targets.delete(S.me); targets.delete(APP.botId); targets.delete("system");
    const where = c.kind === "channel" ? { sid: c.server.id, cid: c.channel.id } : { dm: c.dm.id };
    for (const uid of targets) {
      S.api.add("inbox/" + uid + "/items", { by: msg.by, at: msg.at, text: preview.slice(0, 200), where, mid: id, kind: mentionsIn(msg.text || "").includes(uid) ? "mention" : "reply" }).catch(() => {});
    }
  }
  return id;
}

export function previewOf(m) {
  if (m.kind === "poll") return "📊 " + ((m.poll && m.poll.q) || "Poll");
  if (m.kind === "game") return "🎮 Started a game";
  if (m.kind === "watch") return "🍿 Watch party";
  if (m.files && m.files.length && !m.text) return "📎 " + m.files.map(f => f.name).join(", ");
  return plain(m.text || "", nameOf);
}

// Word filter (server setting). Returns the matched word or null.
export function filterHit(text, words) {
  const t = " " + String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ") + " ";
  for (const w of words || []) { const x = String(w).toLowerCase().trim(); if (x && t.includes(" " + x + " ")) return x; }
  return null;
}
