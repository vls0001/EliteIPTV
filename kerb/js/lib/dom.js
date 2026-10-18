// Small DOM toolkit: element builder, icons, modals, menus, toasts, formatting, storage.

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, attrs, ...kids) {
  const el = tag === "svg" || tag === "path" ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") { for (const sk in v) { if (sk.startsWith("--")) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function fill(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

// ---------- icons ----------
const P = {
  hash: "M5 9h14M5 15h14M10 3 8 21M16 3l-2 18",
  voice: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  announce: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8",
  plus: "M12 5v14M5 12h14",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0",
  pin: "M12 17v5M8 3h8l-1 6 3 4H6l3-4z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  userPlus: "M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a8 8 0 0 1 14-5.3M19 14v6M16 17h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  smile: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",
  clip: "m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  reply: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v6",
  thread: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  x: "M18 6 6 18M6 6l12 12",
  back: "M15 18l-6-6 6-6",
  chevron: "M6 9l6 6 6-6",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  headphones: "M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z",
  image: "M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 19",
  game: "M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6L2 16a3 3 0 0 0 5.2 2L9 16h6l1.8 2a3 3 0 0 0 5.2-2l-.7-7.4A4 4 0 0 0 17.3 5z",
  poll: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  sparkle: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  translate: "M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-2 6-6 8M13 21l4-9 4 9M14.5 18h5",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  crown: "M3 18h18M4 8l4 4 4-7 4 7 4-4-2 10H6z",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  check: "M20 6 9 17l-5-5",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  play: "M6 4l14 8-14 8z",
  at: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z",
  film: "M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4",
  dice: "M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  ban: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.7 5.7l12.6 12.6",
  mute: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  home: "M3 11l9-8 9 8v10h-6v-6H9v6H3z",
  grid: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  palette: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM7.5 11h.01M9.5 7h.01M14.5 7h.01M17.5 11h.01",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  arrowDown: "M12 5v14M5 12l7 7 7-7",
  upload: "M12 15V3M7 8l5-5 5 5M4 21h16",
  car: "M5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3zM3 13h18M7 15h.01M17 15h.01",
  taxi: "M9 3h6l1 2H8zM5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3zM3 13h18",
  mapPin: "M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  pound: "M17 20H7c2-1.5 3-3.5 3-6V8a4 4 0 0 1 7.5-2M6 13h8",
  nav: "M3 11l19-9-9 19-2-8z",
  star: "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z",
  alert: "M12 3l10 18H2zM12 10v4M12 18h.01",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
  receipt: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3",
  doc: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6",
  power: "M12 3v9M6.4 6.4a8 8 0 1 0 11.2 0",
  coffee: "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3",
  swap: "M7 4v16M7 4 3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4",
  whatsapp: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  share: "M12 3v12M8 7l4-4 4 4M5 13v7h14v-7",
  turnLeft: "M9 4 4 9l5 5M4 9h9a6 6 0 0 1 6 6v5",
  turnRight: "M15 4l5 5-5 5M20 9h-9a6 6 0 0 0-6 6v5",
  slightRight: "M7 5h6v6M13 5 7 11a4 4 0 0 0-1 3v6",
  slightLeft: "M17 5h-6v6M11 5l6 6a4 4 0 0 1 1 3v6",
  straight: "M12 20V4M7 9l5-5 5 5",
  uturn: "M8 20V9a4 4 0 0 1 8 0v4M12 9l4 4 4-4",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  flame: "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  calendar: "M4 6h16v15H4zM4 10h16M9 3v5M15 3v5",
  cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  phoneIn: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2zM15 3v6h6M21 3l-6 6",
  sms: "M4 5h16v11H9l-5 4zM8 10h.01M12 10h.01M16 10h.01",
  locate: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v4M12 18v4M2 12h4M18 12h4",
  thumbDown: "M10 15v4a3 3 0 0 0 3 3l4-9V3H6.7a2 2 0 0 0-2 1.7L3.3 12A2 2 0 0 0 5.3 15zM17 3h3v10h-3",
  headset: "M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z",
};

export function icon(name, size = 18, extra = "") {
  const svg = h("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": name === "more" ? 3 : 2, "stroke-linecap": "round", "stroke-linejoin": "round", class: "i " + extra, "aria-hidden": "true" });
  svg.append(h("path", { d: P[name] || P.x }));
  return svg;
}

export function logo(size = 28) {
  const svg = h("svg", { viewBox: "0 0 120 120", width: size, height: size, class: "logo", "aria-hidden": "true" });
  svg.innerHTML = '<use href="#logo"/>';
  return svg;
}

// ---------- toasts ----------
export function toast(text, kind = "") {
  let host = $("#toasts");
  if (!host) { host = h("div", { id: "toasts", class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(host); }
  const el = h("div", { class: "toast " + kind, text });
  host.append(el);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3600);
}

// ---------- layers: modal, menu, sheet ----------
export const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

let openLayers = [];
function layerHost() {
  let host = $("#layers");
  if (!host) { host = h("div", { id: "layers" }); document.body.append(host); }
  return host;
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && openLayers.length) { e.preventDefault(); openLayers[openLayers.length - 1].close(); }
});

export function modal({ title, body, actions, wide, onClose, className }) {
  const scrim = h("div", { class: "scrim show" });
  const box = h("div", { class: "modal" + (wide ? " wide" : "") + (className ? " " + className : ""), role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog" });
  const close = () => {
    scrim.remove(); box.remove();
    openLayers = openLayers.filter(l => l.close !== close);
    if (onClose) onClose();
  };
  if (title) box.append(h("div", { class: "modal-hd" }, h("h2", { text: title }), h("button", { class: "ibtn", type: "button", "aria-label": "Close", onclick: close }, icon("x"))));
  const bodyEl = h("div", { class: "modal-body" }, body);
  box.append(bodyEl);
  if (actions && actions.length) box.append(h("div", { class: "modal-ft" }, actions));
  scrim.addEventListener("click", close);
  layerHost().append(scrim, box);
  openLayers.push({ close });
  const f = box.querySelector("input, textarea, select, button.primary");
  if (f && !isMobile()) setTimeout(() => f.focus(), 30);
  return { close, el: box, body: bodyEl };
}

export function confirmBox(title, text, okLabel = "Confirm", danger = false) {
  return new Promise(resolve => {
    let done = false;
    const m = modal({
      title, body: h("p", { class: "muted", text }),
      onClose: () => { if (!done) resolve(false); },
      actions: [
        h("button", { class: "btn", type: "button", onclick: () => { done = true; resolve(false); m.close(); } }, "Cancel"),
        h("button", { class: "btn " + (danger ? "danger" : "primary"), type: "button", onclick: () => { done = true; resolve(true); m.close(); } }, okLabel),
      ],
    });
  });
}

export function promptBox(title, label, value = "", opts = {}) {
  return new Promise(resolve => {
    let done = false;
    const id = "pb" + Math.random().toString(36).slice(2, 7);
    const input = h(opts.multiline ? "textarea" : "input", { id, class: "input", value, maxlength: opts.max || 100, placeholder: opts.placeholder || "", rows: opts.multiline ? 4 : null });
    const submit = () => { done = true; resolve(input.value.trim()); m.close(); };
    if (!opts.multiline) input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    const m = modal({
      title, body: h("label", { class: "field", for: id }, h("span", { text: label }), input),
      onClose: () => { if (!done) resolve(null); },
      actions: [h("button", { class: "btn", type: "button", onclick: () => m.close() }, "Cancel"), h("button", { class: "btn primary", type: "button", onclick: submit }, opts.ok || "Save")],
    });
    setTimeout(() => input.focus(), 30);
  });
}

// Popover on desktop, bottom sheet on phones. items: [{label, icon, onClick, danger, sub}] | nodes | "-"
export function menu(anchor, items, opts = {}) {
  closeMenus();
  const mobile = isMobile();
  const scrim = h("div", { class: "scrim menu-scrim" + (mobile ? " show" : "") });
  const box = h("div", { class: "menu" + (mobile ? " sheet" : ""), role: "menu" });
  const close = () => { scrim.remove(); box.remove(); openLayers = openLayers.filter(l => l.close !== close); };
  if (opts.header) box.append(opts.header);
  for (const it of items) {
    if (!it) continue;
    if (it === "-") { box.append(h("div", { class: "menu-sep" })); continue; }
    if (it.nodeType) { box.append(it); continue; }
    box.append(h("button", {
      class: "menu-item" + (it.danger ? " danger" : ""), type: "button", role: "menuitem",
      onclick: () => { close(); it.onClick && it.onClick(); },
    }, it.icon ? icon(it.icon, 16) : h("span", { class: "i-pad" }), h("span", { class: "grow", text: it.label }), it.sub ? h("span", { class: "dim", text: it.sub }) : null));
  }
  scrim.addEventListener("click", close);
  layerHost().append(scrim, box);
  openLayers.push({ close, menu: true });
  if (!mobile && anchor) {
    const r = anchor.getBoundingClientRect();
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let left = opts.align === "left" ? r.left : r.right - bw;
    let top = r.bottom + 6;
    if (top + bh > window.innerHeight - 8) top = Math.max(8, r.top - bh - 6);
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    box.style.left = left + "px"; box.style.top = top + "px";
  }
  return { close, el: box };
}
export function closeMenus() { openLayers.filter(l => l.menu).forEach(l => l.close()); }

// ---------- formatting ----------
const pad = n => String(n).padStart(2, "0");
export const fmtTime = t => { const d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
export function dayLabel(t) {
  const d = new Date(t), now = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
export function stamp(t) {
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today at " + fmtTime(t);
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday at " + fmtTime(t);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }) + " " + fmtTime(t);
}
export function relTime(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
export const fmtSize = b => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB";

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem("kerb." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("kerb." + k, JSON.stringify(v)); } catch (e) {} },
};

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = h("textarea", { value: text, style: { position: "fixed", left: "-9999px" } });
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {}
    ta.remove();
    return ok;
  }
}

// on phones, tables turn into stacked cards: each cell gets its column name as a label
export function labelTables(root) {
  for (const t of root.querySelectorAll("table.tbl")) {
    const heads = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim());
    for (const tr of t.querySelectorAll("tbody tr")) [...tr.children].forEach((td, i) => {
      if (td.dataset.label != null) return;
      td.dataset.label = heads[i] || "";
      const v = document.createElement("span"); v.className = "tdv";
      while (td.firstChild) v.append(td.firstChild);
      td.append(v);
    });
  }
}

export const randomCode = (n = 6) => Array.from({ length: n }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
