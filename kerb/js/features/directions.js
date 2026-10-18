// Turn-by-turn directions from a car's route, using the street names on the map.
import { streetAt, toLatLon } from "../lib/mapdata.js";
import { moveProgress, pathLen } from "../lib/geo.js";

const cache = new Map();
const bearing = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

// steps: [{at: metres from start, street, turn}] — turn is left/right/slight-left/slight-right/straight/uturn/arrive
export function stepsFor(path) {
  if (!path || path.length < 2) return [];
  const key = path.length + ":" + path[0] + ":" + path[path.length - 1];
  if (cache.has(key)) return cache.get(key);
  // street name for each segment (blank names keep the previous street)
  const names = [];
  let last = "";
  for (let i = 1; i < path.length; i++) {
    const m = { x: (path[i - 1][0] + path[i][0]) / 2, y: (path[i - 1][1] + path[i][1]) / 2 };
    const n = streetAt(m) || last;
    names.push(n); last = n;
  }
  const steps = [];
  let dist = 0, cur = names[0];
  for (let i = 1; i < path.length - 1; i++) {
    dist += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const next = names[i];
    if (!next || next === cur) continue;
    // compare the heading a little before and after the junction
    const a = path[Math.max(0, i - 2)], b = path[i], c = path[Math.min(path.length - 1, i + 2)];
    let d = bearing(b, c) - bearing(a, b);
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const deg = d * 180 / Math.PI; // y points south, so positive is a right turn
    const turn = Math.abs(deg) > 150 ? "uturn" : Math.abs(deg) < 20 ? "straight" : Math.abs(deg) < 55 ? (deg > 0 ? "slight-right" : "slight-left") : deg > 0 ? "right" : "left";
    // ignore tiny wobbles onto a street and straight back
    if (steps.length && dist - steps[steps.length - 1].at < 25 && steps[steps.length - 1].street === next) continue;
    steps.push({ at: dist, street: next, turn });
    cur = next;
  }
  steps.push({ at: pathLen(path), street: "", turn: "arrive" });
  cache.set(key, steps);
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return steps;
}

export const TURN_ICON = { left: "turnLeft", right: "turnRight", "slight-left": "slightLeft", "slight-right": "slightRight", straight: "straight", uturn: "uturn", arrive: "flag" };
export function turnText(s, placeName) {
  if (s.turn === "arrive") return "Arrive at " + (placeName || "the destination");
  const onto = s.street ? " onto " + s.street : "";
  return ({ left: "Turn left", right: "Turn right", "slight-left": "Bear left", "slight-right": "Bear right", straight: "Continue", uturn: "Make a U-turn" })[s.turn] + onto;
}
export const fmtDist = m => m < 1000 ? (m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50) + " m" : (m / 1609.34).toFixed(1) + " mi";

// the next instruction for a car on a move (or near a path when on GPS)
export function nextStep(move, pos) {
  if (!move || !move.path) return null;
  const steps = stepsFor(move.path);
  let done = moveProgress(move) * pathLen(move.path);
  if (pos) done = travelledTo(move.path, pos);
  const i = steps.findIndex(s => s.at > done + 5);
  if (i < 0) return null;
  return { step: steps[i], then: steps[i + 1] || null, in: steps[i].at - done };
}
function travelledTo(path, p) {
  let best = Infinity, at = 0, run = 0;
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = path[i - 1], [x2, y2] = path[i], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    const t = Math.max(0, Math.min(1, ((p.x - x1) * (x2 - x1) + (p.y - y1) * (y2 - y1)) / (L * L)));
    const d = Math.hypot(x1 + (x2 - x1) * t - p.x, y1 + (y2 - y1) * t - p.y);
    if (d < best) { best = d; at = run + L * t; }
    run += L;
  }
  return at;
}

// links that open the same destination in the driver's own sat-nav app
export function navLinks(place) {
  const q = toLatLon(place);
  const ll = q.lat.toFixed(6) + "," + q.lon.toFixed(6);
  return {
    google: "https://www.google.com/maps/dir/?api=1&destination=" + ll + "&travelmode=driving",
    waze: "https://waze.com/ul?ll=" + ll + "&navigate=yes",
    apple: "https://maps.apple.com/?daddr=" + ll + "&dirflg=d",
  };
}
