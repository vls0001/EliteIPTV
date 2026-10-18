// Turns stored message text into safe DOM nodes (never innerHTML).
// Supports: **bold**, *italic*, _italic_, ~~strike~~, `code`, ```blocks```, ||spoilers||, > quotes,
// links, <@userId> mentions, @everyone and :custom_emoji:.
import { h } from "./dom.js";

const INLINE = /(`[^`\n]+`)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(<@[\w:.-]+>)|(@everyone\b|@here\b)|(:[a-z0-9_]{2,32}:)|(\*\*[^*\n]+\*\*)|(\|\|[^|\n]+\|\|)|(~~[^~\n]+~~)|((?<![\w*])\*[^*\s][^*\n]*\*(?![\w*]))|((?<![\w\\])_[^_\s][^_\n]*_(?!\w))/g;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s|:[a-z0-9_]{2,32}:)+$/u;

export function renderText(text, ctx = {}) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  const big = text.length <= 40 && EMOJI_ONLY.test(text) && /\p{Extended_Pictographic}|:[a-z0-9_]{2,32}:/u.test(text) && !/[0-9#*]/.test(text.replace(/:[a-z0-9_]+:/g, ""));
  const parts = text.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) { frag.append(h("pre", { class: "codeblock" }, h("code", { text: part.replace(/^\w*\n/, "") }))); return; }
    const lines = part.split("\n");
    let quote = null;
    lines.forEach((line, li) => {
      const isQuote = /^>\s?/.test(line);
      const target = isQuote ? (quote = quote || h("blockquote")) : frag;
      if (!isQuote && quote) { frag.append(quote); quote = null; }
      inline(target, isQuote ? line.replace(/^>\s?/, "") : line, ctx);
      if (li < lines.length - 1) target.append(h("br"));
    });
    if (quote) frag.append(quote);
  });
  if (big) { const wrap = h("span", { class: "bigmoji" }); wrap.append(frag); const f2 = document.createDocumentFragment(); f2.append(wrap); return f2; }
  return frag;
}

function inline(target, s, ctx) {
  let last = 0;
  INLINE.lastIndex = 0;
  let m;
  while ((m = INLINE.exec(s))) {
    if (m.index > last) target.append(s.slice(last, m.index));
    const t = m[0];
    if (m[1]) target.append(h("code", { class: "inline", text: t.slice(1, -1) }));
    else if (m[2]) target.append(h("a", { href: t, target: "_blank", rel: "noopener noreferrer", text: t }));
    else if (m[3]) {
      const id = t.slice(2, -1);
      target.append(h("span", { class: "mention" + (id === ctx.me ? " me" : ""), "data-uid": id, text: "@" + (ctx.nameOf ? ctx.nameOf(id) : id) }));
    }
    else if (m[4]) target.append(h("span", { class: "mention all", text: t }));
    else if (m[5]) {
      const name = t.slice(1, -1);
      const url = ctx.emoji && ctx.emoji[name];
      target.append(url ? h("img", { class: "cemoji", src: url, alt: t, title: t }) : t);
    }
    else if (m[6]) target.append(h("strong", { text: t.slice(2, -2) }));
    else if (m[7]) target.append(h("span", { class: "spoiler", tabindex: "0", role: "button", "aria-label": "Spoiler, tap to reveal", onclick: e => e.currentTarget.classList.add("open"), text: t.slice(2, -2) }));
    else if (m[8]) target.append(h("s", { text: t.slice(2, -2) }));
    else if (m[9] || m[10]) target.append(h("em", { text: t.slice(1, -1) }));
    last = m.index + t.length;
  }
  if (last < s.length) target.append(s.slice(last));
}

// Plain-text version for previews, notifications and AI prompts.
export function plain(text, nameOf) {
  return String(text || "").replace(/<@([\w:.-]+)>/g, (_, id) => "@" + (nameOf ? nameOf(id) : id)).replace(/\*\*|~~|\|\||```|`/g, "");
}

export function mentionsIn(text) {
  const ids = new Set();
  String(text || "").replace(/<@([\w:.-]+)>/g, (_, id) => ids.add(id));
  return [...ids];
}
