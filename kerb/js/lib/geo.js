// Map maths on the real Blackpool road network: routes, car positions, ETAs, fares, zones and address search.
// Coordinates are metres from the top-left of the map box (x east, y south).
import { APP, ZONES, VEHICLES } from "../config.js";
import { MAP, routeBetween, search, findInText, randomRoadPoint, snap } from "./mapdata.js";

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function route(a, b) { return routeBetween(a, b).path; }
export function pathLen(path) {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return L;
}
export function pointAt(path, t) {
  if (!path || !path.length) return null;
  if (path.length === 1 || t <= 0) { const d = path.length > 1 ? Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]) : 0; return { x: path[0][0], y: path[0][1], dir: d }; }
  let target = Math.min(1, t) * pathLen(path);
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = path[i - 1], [x2, y2] = path[i];
    const seg = Math.hypot(x2 - x1, y2 - y1);
    if (target <= seg || i === path.length - 1) {
      const k = seg ? Math.min(1, target / seg) : 1;
      return { x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k, dir: Math.atan2(y2 - y1, x2 - x1) };
    }
    target -= seg;
  }
  const n = path.length;
  return { x: path[n - 1][0], y: path[n - 1][1], dir: Math.atan2(path[n - 1][1] - path[n - 2][1], path[n - 1][0] - path[n - 2][0]) };
}

// A move is {path, startAt, dur (demo seconds)}. Every screen computes the car's position from it, so there are no constant writes.
export function makeMove(from, to, now = Date.now()) {
  const r = routeBetween(from, to);
  const dur = Math.max(2, r.secs / APP.speedup);
  return { path: r.path, startAt: now, dur, realSecs: Math.round(r.secs) };
}
export function moveProgress(m, now = Date.now()) { return m ? Math.min(1, Math.max(0, (now - m.startAt) / (m.dur * 1000))) : 1; }
export function moveDone(m, now = Date.now()) { return !m || moveProgress(m, now) >= 1; }
export function posOf(d, now = Date.now()) {
  if (d && d.move && d.move.path && d.move.path.length) return pointAt(d.move.path, moveProgress(d.move, now));
  return { x: (d && d.x) || 3300, y: (d && d.y) || 6000, dir: (d && d.dir) || 0 };
}
// real-world minutes left on a move (the demo runs faster than real time)
export function etaMinutes(m, now = Date.now()) {
  if (!m) return 0;
  const secsLeft = Math.max(0, m.dur * (1 - moveProgress(m, now)));
  return Math.max(0, Math.round(secsLeft * APP.speedup / 60));
}
export function routeMiles(a, b) { return MAP.ready ? routeBetween(a, b).metres / 1609.34 : dist(a, b) * 1.3 / 1609.34; }
// cheap estimate for ranking many cars at once
export function roughMinutes(a, b) { return Math.max(1, Math.round(dist(a, b) * 1.35 / 9 / 60)); }
export function driveMinutes(a, b) { return MAP.ready ? Math.max(1, Math.round(routeBetween(a, b).secs / 60)) : roughMinutes(a, b); }

export const zoneOf = p => (ZONES.find(z => z.test(p)) || ZONES[ZONES.length - 1]).id;
export const zoneName = id => (ZONES.find(z => z.id === id) || {}).name || id;

// ---------- fares ----------
export function isNight(when = Date.now()) {
  const d = new Date(when);
  return d.getHours() >= 22 || d.getHours() < 6 || d.getDay() === 0;
}
export function quote(pickup, drop, settings, vehicle = "saloon", when = Date.now()) {
  const r = MAP.ready ? routeBetween(pickup, drop) : { metres: dist(pickup, drop) * 1.3, secs: dist(pickup, drop) * 1.3 / 9 };
  const miles = r.metres / 1609.34;
  let fare = settings.flag + miles * settings.perMile + ((VEHICLES[vehicle] && VEHICLES[vehicle].extra) || 0);
  const night = isNight(when);
  if (night) fare *= settings.nightRate;
  if (settings.boost && settings.boost > 1) fare *= settings.boost;
  fare = Math.max(settings.minimum, fare);
  return { fare: Math.round(fare * 10) / 10, miles: Math.round(miles * 10) / 10, mins: Math.max(1, Math.round(r.secs / 60)), night, boost: settings.boost > 1 };
}
export const money = n => { const v = Number(n) || 0; return (v < 0 ? "-£" : "£") + Math.abs(v).toFixed(2); };

// ---------- addresses ----------
export function searchPlaces(q, limit = 8) { return MAP.ready ? search(q, limit) : []; }
export function findPlace(text) { return MAP.ready ? findInText(text) : null; }
export function landmark(name) { const l = MAP.landmarks.find(x => x.name === name); return l ? { name: l.name, x: l.x, y: l.y } : null; }
export function randomSpot(zoneId) { return randomRoadPoint(zoneId ? p => zoneOf(p) === zoneId : null); }
export { snap };
