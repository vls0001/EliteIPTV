// SVG map of Blackpool with live cars, pins and routes. No map tiles needed, so it works offline and in artifacts.
import { MAP, ROADS_V, ROADS_H, PLACES, STREETS, ZONES } from "../config.js";
import { posOf } from "./geo.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

function staticLayer(compact) {
  const W = MAP.w, H = MAP.h, c = MAP.coast;
  let s = "";
  s += `<rect class="m-land" x="0" y="0" width="${W}" height="${H}"/>`;
  // zones
  s += `<path class="m-zone z-north" d="M${c} 0H${W}V420H${c}z"/><path class="m-zone z-central" d="M${c} 420H450V820H${c}z"/><path class="m-zone z-east" d="M450 420H${W}V1040H450z"/><path class="m-zone z-south" d="M${c} 820H450V1040H${W}V1240H${c}z"/><path class="m-zone z-airport" d="M${c} 1240H${W}V${H}H${c}z"/>`;
  // parks
  s += `<rect class="m-park" x="540" y="560" width="200" height="130" rx="18"/><rect class="m-park" x="330" y="1250" width="190" height="90" rx="14"/>`;
  // roads
  for (const x of ROADS_V) s += `<line class="m-road${x === 150 ? " major" : ""}" x1="${x}" y1="${x === 150 ? 100 : 60}" x2="${x}" y2="${x === 150 ? 1240 : H - 40}"/>`;
  for (const y of ROADS_H) s += `<line class="m-road${y === 470 || y === 610 || y === 900 || y === 1300 ? " major" : ""}" x1="${c + 55}" y1="${y}" x2="${W - 40}" y2="${y}"/>`;
  s += `<line class="m-road motorway" x1="${W - 40}" y1="760" x2="${W + 40}" y2="760"/>`;
  // sea + beach
  s += `<rect class="m-beach" x="${c - 12}" y="0" width="22" height="${H}"/>`;
  s += `<rect class="m-sea" x="-400" y="-400" width="${c - 8 + 400}" height="${H + 800}"/>`;
  for (let y = 60; y < H; y += 90) s += `<path class="m-wave" d="M${18} ${y}q10 -8 20 0t20 0"/>`;
  // piers
  for (const y of [490, 720, 1060]) s += `<rect class="m-pier" x="${c - 70}" y="${y - 6}" width="80" height="12" rx="3"/>`;
  // street labels
  if (!compact) for (const st of STREETS.slice(1, 12)) {
    const v = st.x1 === st.x2;
    const x = v ? st.x1 + 8 : (st.x1 + st.x2) / 2, y = v ? (st.y1 + st.y2) / 2 : st.y1 - 8;
    s += `<text class="m-street" x="${x}" y="${y}" ${v ? `transform="rotate(90 ${x} ${y})"` : 'text-anchor="middle"'}>${st.name}</text>`;
  }
  s += `<text class="m-street sea" x="${c + 6}" y="300" transform="rotate(90 ${c + 6} 300)">PROMENADE</text>`;
  s += `<text class="m-sea-label" x="40" y="760" transform="rotate(-90 40 760)">IRISH SEA</text>`;
  // zone labels
  const zl = { north: [700, 210], central: [330, 760], east: [800, 520], south: [560, 1130], airport: [700, 1350] };
  for (const z of ZONES) s += `<text class="m-zone-label" x="${zl[z.id][0]}" y="${zl[z.id][1]}" text-anchor="middle">${z.name.toUpperCase()}</text>`;
  // places
  for (const p of PLACES) {
    if (compact && p.kind === "area") continue;
    const big = p.name === "Blackpool Tower";
    s += `<g class="m-place k-${p.kind}"><circle cx="${p.x}" cy="${p.y}" r="${big ? 7 : 4.5}"/>${compact && !big ? "" : `<text x="${p.x + 10}" y="${p.y + 4}">${p.name.replace(/ \(.*\)/, "")}</text>`}</g>`;
  }
  return s;
}

export function createMap(container, opts = {}) {
  const svg = el("svg", { class: "map" + (opts.compact ? " compact" : ""), viewBox: `0 0 ${MAP.w} ${MAP.h}`, preserveAspectRatio: "xMidYMid slice", role: "img", "aria-label": "Live map" });
  const base = el("g"); base.innerHTML = staticLayer(opts.compact);
  const routes = el("g", { class: "m-routes" });
  const pins = el("g", { class: "m-pins" });
  const cars = el("g", { class: "m-cars" });
  svg.append(base, routes, pins, cars);
  container.append(svg);

  let vb = { x: -40, y: 0, w: MAP.w + 40, h: MAP.h };
  let target = null;           // smooth camera target {x,y,w}
  let data = { drivers: [], jobs: [], me: null, focus: null };
  const carEls = new Map();
  let follow = opts.follow || null; // function returning {x,y} to follow
  let alive = true;

  const setVB = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  function aspect() { const r = svg.getBoundingClientRect(); return r.width && r.height ? r.height / r.width : MAP.h / MAP.w; }
  function fit() { const a = aspect(); let w = MAP.w + 60, h = w * a; if (h < MAP.h) { h = MAP.h; w = h / a; } vb = { x: (MAP.w - w) / 2 - 10, y: (MAP.h - h) / 2, w, h }; target = null; setVB(); }
  function lookAt(p, w = 460) { const a = aspect(); target = { x: p.x - w / 2, y: p.y - (w * a) / 2, w, h: w * a }; }
  function zoom(f, cx, cy) {
    const a = vb.h / vb.w;
    const nw = Math.min(2400, Math.max(180, vb.w * f));
    cx = cx ?? vb.x + vb.w / 2; cy = cy ?? vb.y + vb.h / 2;
    vb = { x: cx - (cx - vb.x) * (nw / vb.w), y: cy - (cy - vb.y) * (nw / vb.w), w: nw, h: nw * a };
    target = null; follow = null; setVB();
  }

  // pan & zoom
  let drag = null;
  svg.addEventListener("pointerdown", e => { if (e.target.closest(".car")) return; drag = { x: e.clientX, y: e.clientY, vb: { ...vb }, moved: false }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    const r = svg.getBoundingClientRect(), k = vb.w / r.width;
    const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; follow = null; target = null; }
    vb = { ...drag.vb, x: drag.vb.x - dx, y: drag.vb.y - dy }; setVB();
  });
  svg.addEventListener("pointerup", e => {
    if (drag && !drag.moved && opts.onMapClick) {
      const r = svg.getBoundingClientRect();
      opts.onMapClick({ x: Math.round(vb.x + (e.clientX - r.left) / r.width * vb.w), y: Math.round(vb.y + (e.clientY - r.top) / r.height * vb.h) });
    }
    drag = null;
  });
  svg.addEventListener("wheel", e => {
    if (opts.compact) return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoom(e.deltaY > 0 ? 1.12 : 0.89, vb.x + (e.clientX - r.left) / r.width * vb.w, vb.y + (e.clientY - r.top) / r.height * vb.h);
  }, { passive: false });

  function carEl(d) {
    let g = carEls.get(d.id);
    if (!g) {
      g = el("g", { class: "car" });
      g.innerHTML = `<circle class="car-halo" r="26"/><circle class="car-body" r="17"/><path class="car-dir" d="M0 -27 L6 -19 L-6 -19z"/><text class="car-label" text-anchor="middle" y="5"></text>`;
      g.addEventListener("click", ev => { ev.stopPropagation(); opts.onCarClick && opts.onCarClick(d.id); });
      cars.append(g); carEls.set(d.id, g);
    }
    return g;
  }

  function update(next) {
    data = Object.assign(data, next);
    const seen = new Set();
    for (const d of data.drivers) {
      if (d.status === "off" && d.id !== data.me) continue;
      seen.add(d.id);
      const g = carEl(d);
      g.dataset.status = d.status || "free";
      g.classList.toggle("me", d.id === data.me);
      g.classList.toggle("sel", d.id === data.selected);
      g.querySelector("text").textContent = d.call || "";
      g._d = d;
    }
    for (const [id, g] of carEls) if (!seen.has(id)) { g.remove(); carEls.delete(id); }
    // routes & pins
    routes.replaceChildren(); pins.replaceChildren();
    for (const d of data.drivers) {
      if (!d.move || !d.move.path || (data.onlyRoute && d.id !== data.onlyRoute)) continue;
      if (d.status !== "busy" && d.id !== data.me) continue;
      routes.append(el("polyline", { class: "m-route" + (d.id === data.me || d.id === data.onlyRoute ? " mine" : ""), points: d.move.path.map(p => p.join(",")).join(" ") }));
    }
    for (const j of data.jobs) {
      const waiting = j.status === "new" || j.status === "offered";
      if (waiting || ["accepted", "arrived"].includes(j.status)) pins.append(pin(j.pickup, "P", "pick" + (j.status === "new" ? " waiting" : "") + (j.id === data.focus ? " focus" : ""), j.id));
      if (j.id === data.focus || j.status === "pob") pins.append(pin(j.drop, "D", "drop" + (j.id === data.focus ? " focus" : ""), j.id));
    }
  }
  function pin(p, letter, cls, id) {
    const g = el("g", { class: "m-pin " + cls, transform: `translate(${p.x} ${p.y})` });
    g.innerHTML = `<path d="M0 0 C-14 -16 -14 -38 0 -38 C14 -38 14 -16 0 0z"/><text y="-21" text-anchor="middle">${letter}</text>`;
    if (opts.onPinClick) g.addEventListener("click", ev => { ev.stopPropagation(); opts.onPinClick(id); });
    return g;
  }

  function frame() {
    if (!alive) return;
    const now = Date.now();
    for (const [, g] of carEls) {
      const p = posOf(g._d, now);
      g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      const dirEl = g.querySelector(".car-dir");
      if (g._d.move && now < g._d.move.startAt + g._d.move.dur * 1000) dirEl.setAttribute("transform", `rotate(${(p.dir * 180 / Math.PI + 90).toFixed(0)})`), dirEl.style.opacity = 1;
      else dirEl.style.opacity = 0;
    }
    if (follow) { const f = follow(); if (f) lookAt(f, f.w || 460); }
    if (target) {
      const k = 0.12;
      vb = { x: vb.x + (target.x - vb.x) * k, y: vb.y + (target.y - vb.y) * k, w: vb.w + (target.w - vb.w) * k, h: vb.h + (target.h - vb.h) * k };
      setVB();
      if (Math.abs(target.x - vb.x) < 0.5 && Math.abs(target.w - vb.w) < 0.5 && !follow) target = null;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(() => { fit(); frame(); });
  const ro = "ResizeObserver" in window ? new ResizeObserver(() => { if (!follow && !target) fit(); }) : null;
  if (ro) ro.observe(svg);

  return {
    el: svg, update, fit, zoom, lookAt,
    setFollow(fn) { follow = fn; },
    destroy() { alive = false; if (ro) ro.disconnect(); svg.remove(); },
  };
}
