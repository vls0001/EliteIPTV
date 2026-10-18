// Backup map (canvas) used when the device cannot run the WebGL map engine.
// Works offline and inside artifacts because the map data ships with the app (no tile servers).
import { MAP, onMapReady, roadAngle } from "./mapdata.js";
import { posOf } from "./geo.js";

const STYLE = {
  sea: "#0A1424", land: "#121318", park: "#13251B", water: "#0F2238", sand: "#2A2617",
  road: { motorway: "#7A5E1C", trunk: "#5E4C1E", primary: "#4A4D57", secondary: "#3F424B", tertiary: "#363941", residential: "#2A2C33", unclassified: "#2A2C33", living_street: "#26282E", service: "#212227" },
  width: { motorway: 18, trunk: 16, primary: 14, secondary: 12, tertiary: 11, residential: 8, unclassified: 8, living_street: 7, service: 5 },
  minScale: { residential: 0.06, unclassified: 0.06, living_street: 0.09, service: 0.16 },
  label: "#8B8F9A", labelMajor: "#B5B8C2", halo: "#121318",
};
const STATUS_COLOR = { free: "#4ADE80", busy: "#FACC15", offered: "#60A5FA", break: "#A1A1AA", off: "#52525B" };
const CAR_COLORS = { silver: "#C9CDD3", white: "#F2F2F2", black: "#1D1F24", blue: "#2F6FD6", red: "#C9302C", grey: "#7C818B", gray: "#7C818B", green: "#2E8B57", yellow: "#E8C21C" };

// ---------- car icon ----------
const spriteCache = new Map();
export function carSprite(colour, type, status, dpr) {
  const key = colour + type + status + dpr;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const long = type === "mpv" || type === "wav" ? 50 : type === "estate" ? 47 : 44;
  const wide = type === "mpv" || type === "wav" ? 23 : 21;
  const pad = 14, W = (wide + pad * 2), H = (long + pad * 2);
  const c = document.createElement("canvas"); c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext("2d"); g.scale(dpr, dpr); g.translate(W / 2, H / 2);
  const body = CAR_COLORS[String(colour).toLowerCase()] || "#C9CDD3";
  // status glow
  if (status === "plain") { g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 6; g.shadowOffsetY = 2; rr(g, -wide / 2 + 1.5, -long / 2 + 1.5, wide - 3, long - 3, 6); g.fillStyle = "#000"; g.fill(); g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0; }
  else { g.shadowColor = STATUS_COLOR[status] || "#4ADE80"; g.shadowBlur = 12; rr(g, -wide / 2, -long / 2, wide, long, 7); g.fillStyle = STATUS_COLOR[status] || "#4ADE80"; g.fill(); g.shadowBlur = 0; }
  // wheels
  g.fillStyle = "#0B0B0D";
  for (const [x, y] of [[-wide / 2 - 1.5, -long / 2 + 7], [wide / 2 - 2.5, -long / 2 + 7], [-wide / 2 - 1.5, long / 2 - 13], [wide / 2 - 2.5, long / 2 - 13]]) rr(g, x, y, 4, 8, 1.5), g.fill();
  // body
  rr(g, -wide / 2 + 1.5, -long / 2 + 1.5, wide - 3, long - 3, 6);
  const grad = g.createLinearGradient(-wide / 2, 0, wide / 2, 0);
  grad.addColorStop(0, shade(body, -18)); grad.addColorStop(0.5, shade(body, 12)); grad.addColorStop(1, shade(body, -18));
  g.fillStyle = grad; g.fill();
  // windscreen (front = up)
  g.fillStyle = "rgba(20,28,40,.92)";
  g.beginPath(); g.moveTo(-wide / 2 + 3.5, -long / 2 + 13); g.quadraticCurveTo(0, -long / 2 + 9, wide / 2 - 3.5, -long / 2 + 13); g.lineTo(wide / 2 - 5, -long / 2 + 19); g.lineTo(-wide / 2 + 5, -long / 2 + 19); g.closePath(); g.fill();
  // rear window
  g.beginPath(); g.moveTo(-wide / 2 + 5, long / 2 - 11); g.lineTo(wide / 2 - 5, long / 2 - 11); g.lineTo(wide / 2 - 4, long / 2 - 6.5); g.quadraticCurveTo(0, long / 2 - 4.5, -wide / 2 + 4, long / 2 - 6.5); g.closePath(); g.fill();
  // roof + taxi light
  g.fillStyle = shade(body, 6); rr(g, -wide / 2 + 4.5, -long / 2 + 19, wide - 9, long - 30.5, 3); g.fill();
  g.fillStyle = "#FACC15"; rr(g, -5.5, -3.5, 11, 5, 1.5); g.fill();
  g.fillStyle = "#3D3100"; g.font = "bold 3.6px sans-serif"; g.textAlign = "center"; g.fillText("TAXI", 0, -0.2);
  // headlights
  g.fillStyle = "#FFF6C8"; rr(g, -wide / 2 + 3, -long / 2 + 2, 4, 2.4, 1); g.fill(); rr(g, wide / 2 - 7, -long / 2 + 2, 4, 2.4, 1); g.fill();
  g.fillStyle = "#E23B3B"; rr(g, -wide / 2 + 3, long / 2 - 4, 4, 2, 1); g.fill(); rr(g, wide / 2 - 7, long / 2 - 4, 4, 2, 1); g.fill();
  if (type === "wav") { g.fillStyle = "#3B82F6"; rr(g, -4, 6, 8, 8, 2); g.fill(); g.fillStyle = "#fff"; g.font = "bold 7px sans-serif"; g.fillText("♿", 0, 12.5); }
  const out = { c, W, H };
  spriteCache.set(key, out);
  return out;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
}

// ---------- map component ----------
export function createMap(container, opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "map" + (opts.compact ? " compact" : "");
  canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Live map of Blackpool");
  container.append(canvas);
  const ctx = canvas.getContext("2d");
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let Wpx = 300, Hpx = 300;
  let view = { cx: 3300, cy: 6000, scale: 0.08 }; // scale = px per metre
  let target = null, follow = opts.follow || null, alive = true, dirty = true;
  let data = { drivers: [], jobs: [], me: null, focus: null, selected: null, onlyRoute: null };
  let staticCanvas = null, staticKey = "";
  const hits = [];
  const angles = new Map();

  function resize() {
    const r = container.getBoundingClientRect();
    Wpx = Math.max(50, r.width); Hpx = Math.max(50, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(Wpx * dpr); canvas.height = Math.round(Hpx * dpr);
    canvas.style.width = Wpx + "px"; canvas.style.height = Hpx + "px";
    staticKey = ""; dirty = true;
  }
  const ro = new ResizeObserver(() => { const had = Wpx; resize(); if (!follow && !target && Math.abs(had - Wpx) > 40) fit(); });
  ro.observe(container);

  function fit() {
    if (!MAP.ready) return;
    const s = Math.min(Wpx / (MAP.w * 1.02), Hpx / (MAP.h * 1.02));
    view = { cx: MAP.w / 2, cy: MAP.h / 2, scale: s }; target = null; dirty = true;
  }
  function lookAt(p, widthMetres = 2200) {
    const s = Wpx / widthMetres;
    target = { cx: p.x, cy: p.y, scale: s };
  }
  function zoom(f, sx, sy) {
    const ns = Math.max(0.012, Math.min(1.6, view.scale / f));
    sx = sx ?? Wpx / 2; sy = sy ?? Hpx / 2;
    const wx = view.cx + (sx - Wpx / 2) / view.scale, wy = view.cy + (sy - Hpx / 2) / view.scale;
    view = { cx: wx - (sx - Wpx / 2) / ns, cy: wy - (sy - Hpx / 2) / ns, scale: ns };
    target = null; follow = null; dirty = true;
  }
  const toScreen = (x, y) => [(x - view.cx) * view.scale + Wpx / 2, (y - view.cy) * view.scale + Hpx / 2];
  const toWorld = (sx, sy) => ({ x: view.cx + (sx - Wpx / 2) / view.scale, y: view.cy + (sy - Hpx / 2) / view.scale });

  // ---------- static layer ----------
  function drawStatic() {
    const key = [view.cx.toFixed(1), view.cy.toFixed(1), view.scale.toFixed(5), Wpx, Hpx, MAP.ready].join("|");
    if (key === staticKey && staticCanvas) return;
    staticKey = key;
    if (!staticCanvas) staticCanvas = document.createElement("canvas");
    staticCanvas.width = canvas.width; staticCanvas.height = canvas.height;
    const g = staticCanvas.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = STYLE.sea; g.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
    if (!MAP.ready) return;
    const s = view.scale * dpr;
    g.setTransform(s, 0, 0, s, (Wpx / 2 - view.cx * view.scale) * dpr, (Hpx / 2 - view.cy * view.scale) * dpr);
    g.fillStyle = STYLE.land; g.fill(MAP.paths.land, "evenodd");
    g.fillStyle = STYLE.sand; g.fill(MAP.paths.sand);
    g.fillStyle = STYLE.park; g.fill(MAP.paths.parks);
    g.fillStyle = STYLE.water; g.fill(MAP.paths.water);
    g.lineCap = "round"; g.lineJoin = "round";
    for (const cls of MAP.drawOrder) {
      if (STYLE.minScale[cls] && view.scale < STYLE.minScale[cls]) continue;
      const px = STYLE.width[cls] * Math.min(1.4, Math.max(0.12, view.scale * 4.2));
      g.lineWidth = Math.max(0.6, px) / view.scale;
      g.strokeStyle = STYLE.road[cls];
      g.stroke(MAP.paths.roads[cls]);
    }
    // labels in screen space
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const boxes = [];
    const fits = (x, y, w, h) => { if (x < 0 || y < 0 || x + w > Wpx || y + h > Hpx) return false; for (const b of boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; boxes.push([x, y, w, h]); return true; };
    g.textBaseline = "middle";
    // landmarks
    for (const p of MAP.landmarks) {
      const [sx, sy] = toScreen(p.x, p.y);
      if (sx < -40 || sy < -20 || sx > Wpx + 40 || sy > Hpx + 20) continue;
      const big = p.major;
      if (!big && view.scale < 0.1) continue;
      g.font = (big ? "600 " : "500 ") + (opts.compact ? 12 : 11.5) + "px Geist, system-ui, sans-serif";
      const w = g.measureText(p.name).width;
      if (!fits(sx + 6, sy - 8, w + 6, 16)) continue;
      g.fillStyle = p.kind === "hospital" ? "#F87171" : p.kind === "station" ? "#60A5FA" : p.kind === "airport" ? "#A78BFA" : "#FACC15";
      g.beginPath(); g.arc(sx, sy, big ? 4 : 3, 0, Math.PI * 2); g.fill();
      g.lineWidth = 3; g.strokeStyle = STYLE.halo; g.strokeText(p.name, sx + 8, sy);
      g.fillStyle = big ? "#E4E4E7" : STYLE.label; g.fillText(p.name, sx + 8, sy);
    }
    // street names
    if (view.scale > 0.11) {
      g.font = "500 10.5px Geist, system-ui, sans-serif";
      for (const L of MAP.labels) {
        if (L.minor && view.scale < 0.22) continue;
        const [sx, sy] = toScreen(L.x, L.y);
        if (sx < 0 || sy < 0 || sx > Wpx || sy > Hpx) continue;
        const w = g.measureText(L.name).width;
        if (L.len * view.scale < w + 20) continue;
        if (!fits(sx - w / 2 - 2, sy - 7, w + 4, 14)) continue;
        g.save(); g.translate(sx, sy); g.rotate(L.angle);
        g.lineWidth = 3; g.strokeStyle = STYLE.halo; g.strokeText(L.name, -w / 2, 0);
        g.fillStyle = L.minor ? STYLE.label : STYLE.labelMajor; g.fillText(L.name, -w / 2, 0);
        g.restore();
      }
    }
  }

  // ---------- dynamic layer ----------
  function frame() {
    if (!alive) return;
    const now = Date.now();
    if (follow) { const f = follow(); if (f) target = { cx: f.x, cy: f.y, scale: Wpx / (f.w || 2200) }; }
    if (target) {
      const k = 0.14;
      view = { cx: view.cx + (target.cx - view.cx) * k, cy: view.cy + (target.cy - view.cy) * k, scale: view.scale + (target.scale - view.scale) * k };
      if (Math.abs(target.cx - view.cx) * view.scale < 0.4 && Math.abs(target.cy - view.cy) * view.scale < 0.4 && Math.abs(target.scale - view.scale) / view.scale < 0.004) { view = { ...target }; if (!follow) target = null; }
    }
    drawStatic();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hits.length = 0;
    // map data credit (required by the OpenStreetMap licence)
    ctx.font = "10px Geist, system-ui, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(9,9,11,.6)"; const credit = "© OpenStreetMap contributors · Overture Maps"; const cw = ctx.measureText(credit).width;
    ctx.fillRect(Wpx - cw - 10, Hpx - 16, cw + 10, 16); ctx.fillStyle = "#8B8F9A"; ctx.fillText(credit, Wpx - 5, Hpx - 4); ctx.textAlign = "start";
    // routes
    for (const d of data.drivers) {
      if (!d.move || !d.move.path || (data.onlyRoute && d.id !== data.onlyRoute)) continue;
      if (d.status !== "busy" && d.id !== data.me) continue;
      const mine = d.id === data.me || d.id === data.onlyRoute;
      ctx.beginPath();
      d.move.path.forEach((p, i) => { const [x, y] = toScreen(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (mine) { ctx.strokeStyle = "rgba(250,204,21,.25)"; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = "#FACC15"; ctx.lineWidth = 4; ctx.setLineDash([]); ctx.stroke(); }
      else { ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 2.5; ctx.setLineDash([2, 6]); ctx.stroke(); ctx.setLineDash([]); }
    }
    // pins
    for (const j of data.jobs) {
      const waiting = j.status === "new" || j.status === "offered";
      if (waiting || ["accepted", "arrived"].includes(j.status)) pin(j.pickup, "P", "#FACC15", "#1A1400", j.id, waiting && j.status === "new", j.id === data.focus);
      if (j.id === data.focus || j.status === "pob") pin(j.drop, "D", "#FAFAFA", "#09090B", j.id, false, j.id === data.focus);
    }
    // cars
    const carScale = Math.max(0.62, Math.min(1.25, 0.55 + view.scale * 3));
    const list = data.drivers.filter(d => d.status !== "off" || d.id === data.me);
    for (const d of list) {
      const p = posOf(d, now);
      const [sx, sy] = toScreen(p.x, p.y);
      if (sx < -40 || sy < -40 || sx > Wpx + 40 || sy > Hpx + 40) continue;
      const moving = d.move && now < d.move.startAt + d.move.dur * 1000;
      let ang;
      if (moving) { ang = p.dir + Math.PI / 2; angles.set(d.id, ang); }
      else ang = angles.get(d.id) ?? ((d.move && d.move.path && d.move.path.length > 1 ? p.dir : roadAngle(p)) + Math.PI / 2);
      if (!moving && !angles.has(d.id)) angles.set(d.id, ang);
      const st = data.offered && data.offered.has(d.id) ? "offered" : d.status;
      const sp = carSprite(d.car && d.car.colour, d.car && d.car.type, st, dpr);
      const sel = d.id === data.me || d.id === data.selected;
      if (sel) { ctx.beginPath(); ctx.arc(sx, sy, 30 * carScale, 0, Math.PI * 2); ctx.fillStyle = "rgba(250,204,21,.14)"; ctx.fill(); ctx.strokeStyle = "#FACC15"; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(carScale, carScale);
      ctx.drawImage(sp.c, -sp.W / 2, -sp.H / 2, sp.W, sp.H);
      ctx.restore();
      // call sign badge
      if (d.call) {
        ctx.font = "700 11px 'Geist Mono', ui-monospace, monospace";
        const t = d.call, w = ctx.measureText(t).width + 10, bx = sx - w / 2, by = sy - 30 * carScale - 9;
        ctx.fillStyle = STATUS_COLOR[st] || "#4ADE80"; rr(ctx, bx, by, w, 16, 5); ctx.fill();
        ctx.fillStyle = "#0B0B0D"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, sx, by + 8.5); ctx.textAlign = "start";
      }
      hits.push({ kind: "car", id: d.id, x: sx, y: sy, r: 24 * carScale });
    }
    requestAnimationFrame(frame);
  }
  function pin(p, letter, fill, ink, id, bob, focus) {
    if (!p) return;
    const [sx, syRaw] = toScreen(p.x, p.y);
    const sy = syRaw - (bob ? Math.abs(Math.sin(Date.now() / 300)) * 5 : 0);
    ctx.save(); ctx.translate(sx, sy);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-13, -15, -13, -34, 0, -34); ctx.bezierCurveTo(13, -34, 13, -15, 0, 0);
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = focus ? 3 : 2; ctx.strokeStyle = focus ? "#FAFAFA" : "#09090B"; ctx.stroke();
    ctx.fillStyle = ink; ctx.font = "800 14px Geist, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(letter, 0, -21);
    ctx.restore();
    hits.push({ kind: "pin", id, x: sx, y: sy - 20, r: 16 });
  }

  // ---------- interaction ----------
  const pointers = new Map();
  let drag = null, pinch = null;
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale }; drag = null; }
    else drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
  });
  canvas.addEventListener("pointermove", e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = canvas.getBoundingClientRect();
      const ns = Math.max(0.012, Math.min(1.6, pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      zoom(view.scale / ns, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; follow = null; target = null; }
    if (drag.moved) { view = { ...view, cx: drag.cx - dx / view.scale, cy: drag.cy - dy / view.scale }; }
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = hits.slice().reverse().find(h => Math.hypot(h.x - x, h.y - y) < h.r + 6);
      if (hit && hit.kind === "car" && opts.onCarClick) opts.onCarClick(hit.id);
      else if (hit && hit.kind === "pin" && opts.onPinClick) opts.onPinClick(hit.id);
      else if (opts.onMapClick) opts.onMapClick(toWorld(x, y));
    }
    drag = null;
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoom(e.deltaY > 0 ? 1.15 : 0.87, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  canvas.addEventListener("dblclick", e => { const r = canvas.getBoundingClientRect(); zoom(0.6, e.clientX - r.left, e.clientY - r.top); });

  resize();
  onMapReady(() => { staticKey = ""; if (!follow && !target) fit(); });
  requestAnimationFrame(frame);

  const moveEnd = [];
  const fireMove = () => { const c = { x: view.cx, y: view.cy }; moveEnd.forEach(cb => cb(c)); };
  canvas.addEventListener("pointerup", () => setTimeout(fireMove, 50));
  canvas.addEventListener("wheel", () => { clearTimeout(canvas._mt); canvas._mt = setTimeout(fireMove, 200); });
  return {
    el: canvas, fit, zoom, lookAt,
    center() { return { x: view.cx, y: view.cy }; },
    onMoveEnd(cb) { moveEnd.push(cb); },
    tilt() {},
    update(next) { data = Object.assign(data, next); data.offered = new Set((data.jobs || []).filter(j => j.status === "offered" && j.offer).map(j => j.offer.driverId)); },
    setFollow(fn) { follow = fn; if (!fn) target = null; },
    destroy() { alive = false; ro.disconnect(); canvas.remove(); },
  };
}
