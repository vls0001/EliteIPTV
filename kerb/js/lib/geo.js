// Map maths: routes along the road grid, car positions, ETAs, fares, zones and address search.
import { APP, MAP, ROADS_V, ROADS_H, ZONES, PLACES, STREETS, VEHICLES } from "../config.js";

const nearest = (arr, v) => arr.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Manhattan route along the grid so cars follow roads.
export function route(a, b) {
  const va = nearest(ROADS_V, a.x), vb = nearest(ROADS_V, b.x), hb = nearest(ROADS_H, b.y);
  const pts = [[a.x, a.y], [va, a.y], [va, hb], [vb, hb], [vb, b.y], [b.x, b.y]];
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}
export function pathLen(path) {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return L;
}
export function pointAt(path, t) {
  if (!path || !path.length) return null;
  if (t <= 0) return { x: path[0][0], y: path[0][1], dir: 0 };
  const total = pathLen(path);
  let target = Math.min(1, t) * total;
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = path[i - 1], [x2, y2] = path[i];
    const seg = Math.hypot(x2 - x1, y2 - y1);
    if (target <= seg || i === path.length - 1) {
      const k = seg ? Math.min(1, target / seg) : 1;
      return { x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k, dir: Math.atan2(y2 - y1, x2 - x1) };
    }
    target -= seg;
  }
  const last = path[path.length - 1];
  return { x: last[0], y: last[1], dir: 0 };
}

// A move is {path, startAt, dur (seconds)}. Everyone computes the car's position from it, so no constant writes.
export function makeMove(from, to, now = Date.now()) {
  const path = route(from, to);
  const dur = Math.max(1.5, pathLen(path) / APP.unitsPerSecond);
  return { path, startAt: now, dur };
}
export function moveProgress(m, now = Date.now()) { return m ? Math.min(1, Math.max(0, (now - m.startAt) / (m.dur * 1000))) : 1; }
export function moveDone(m, now = Date.now()) { return !m || moveProgress(m, now) >= 1; }
export function posOf(d, now = Date.now()) {
  if (d && d.move && d.move.path) return pointAt(d.move.path, moveProgress(d.move, now));
  return { x: (d && d.x) || 400, y: (d && d.y) || 700, dir: 0 };
}
// real-world minutes left on a move (the demo runs faster than real time)
export function etaMinutes(m, now = Date.now()) {
  if (!m) return 0;
  const secsLeft = Math.max(0, m.dur * (1 - moveProgress(m, now)));
  return Math.max(0, Math.round(secsLeft * APP.speedup / 60));
}
export function routeMiles(a, b) { return pathLen(route(a, b)) / APP.unitsPerMile; }
export function driveMinutes(a, b) { return Math.max(1, Math.round(routeMiles(a, b) / APP.realMph * 60)); }

export const zoneOf = p => (ZONES.find(z => z.test(p)) || ZONES[ZONES.length - 1]).id;
export const zoneName = id => (ZONES.find(z => z.id === id) || {}).name || id;

// ---------- fares ----------
export function isNight(when = Date.now()) {
  const d = new Date(when);
  return d.getHours() >= 22 || d.getHours() < 6 || d.getDay() === 0;
}
export function quote(pickup, drop, settings, vehicle = "saloon", when = Date.now()) {
  const miles = routeMiles(pickup, drop);
  let fare = settings.flag + miles * settings.perMile + ((VEHICLES[vehicle] && VEHICLES[vehicle].extra) || 0);
  const night = isNight(when);
  if (night) fare *= settings.nightRate;
  if (settings.boost && settings.boost > 1) fare *= settings.boost;
  fare = Math.max(settings.minimum, fare);
  return { fare: Math.round(fare * 10) / 10, miles: Math.round(miles * 10) / 10, mins: driveMinutes(pickup, drop), night, boost: settings.boost > 1 };
}
export const money = n => { const v = Number(n) || 0; return (v < 0 ? "-£" : "£") + Math.abs(v).toFixed(2); };

// ---------- addresses ----------
export function searchPlaces(q, limit = 8) {
  q = String(q || "").trim().toLowerCase();
  if (!q) return PLACES.slice(0, limit).map(p => ({ name: p.name, x: p.x, y: p.y, kind: p.kind }));
  const out = [];
  const num = (q.match(/^(\d{1,4})\s+/) || [])[1];
  const rest = num ? q.slice(num.length).trim() : q;
  for (const s of STREETS) {
    if (s.name.toLowerCase().includes(rest)) {
      const n = num ? +num : 1;
      const t = Math.min(1, (n % 300) / 300);
      out.push({ name: (num ? num + " " : "") + s.name + ", Blackpool", x: Math.round(s.x1 + (s.x2 - s.x1) * t), y: Math.round(s.y1 + (s.y2 - s.y1) * t), kind: "street" });
    }
  }
  for (const p of PLACES) if (p.name.toLowerCase().includes(q) || q.split(/\s+/).every(w => p.name.toLowerCase().includes(w))) out.unshift({ name: p.name, x: p.x, y: p.y, kind: p.kind });
  return out.slice(0, limit);
}
// finds the best place mentioned in free text (used by message booking)
export function findPlace(text) {
  const t = String(text || "").toLowerCase();
  let best = null;
  for (const p of PLACES) {
    const words = p.name.toLowerCase().replace(/[()&,]/g, " ").split(/\s+/).filter(w => w.length > 3 && !["blackpool", "station", "road", "the"].includes(w));
    const hit = words.filter(w => t.includes(w)).length;
    const full = t.includes(p.name.toLowerCase());
    const score = full ? 99 : hit;
    if (score > 0 && (!best || score > best.score)) best = { score, place: p };
  }
  if (best) return { name: best.place.name, x: best.place.x, y: best.place.y };
  const st = STREETS.find(s => t.includes(s.name.toLowerCase()));
  if (st) { const m = t.match(new RegExp("(\\d{1,4})\\s+" + st.name.toLowerCase())); return searchPlaces((m ? m[1] + " " : "") + st.name, 1)[0]; }
  return null;
}

export function randomSpot(zoneId) {
  for (let i = 0; i < 40; i++) {
    const p = { x: ROADS_V[Math.floor(Math.random() * ROADS_V.length)], y: 140 + Math.random() * (MAP.h - 200) };
    if (Math.random() < 0.5) { p.x = 160 + Math.random() * 760; p.y = ROADS_H[Math.floor(Math.random() * ROADS_H.length)]; }
    p.x = Math.round(p.x); p.y = Math.round(p.y);
    if (!zoneId || zoneOf(p) === zoneId) return p;
  }
  return { x: 380, y: 610 };
}
