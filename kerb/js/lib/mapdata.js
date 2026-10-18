// Loads the real Blackpool map (OpenStreetMap data via Overture), builds a road graph,
// and provides routing (A*), snapping, address search and drawing paths.
export const MAP = { ready: false, w: 6572, h: 11831, landmarks: [], places: [], labels: [], drawOrder: [], paths: null };
const readyCbs = [];
export function onMapReady(cb) { if (MAP.ready) cb(); else readyCbs.push(cb); }

// road speeds in metres per second (used for route times)
const SPEED = { motorway: 27, trunk: 20, primary: 14, secondary: 13, tertiary: 12, unclassified: 9.5, residential: 9, living_street: 5, service: 5 };
const RANK = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5, residential: 6, living_street: 7, service: 8 };

let nodeX, nodeY, adj, nodeRank, comp, grid, roadsByName, nameGrid;
const GRID = 150;

export async function loadMap(url = "data/blackpool.json") {
  if (MAP.ready) return MAP;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Map data failed to load (" + res.status + ")");
  const D = await res.json();
  build(D);
  MAP.ready = true;
  readyCbs.splice(0).forEach(cb => { try { cb(); } catch (e) { console.error(e); } });
  return MAP;
}

function build(D) {
  MAP.w = D.w; MAP.h = D.h; MAP.box = D.box; MAP.kx = D.kx; MAP.ky = D.ky;
  const classes = D.classes.map(c => c === "unknown" ? "unclassified" : c);
  // ---- graph ----
  const index = new Map(); const xs = [], ys = [], ranks = [], edges = [];
  const nodeOf = (x, y, rank) => {
    const k = x * 20000 + y;
    let id = index.get(k);
    if (id === undefined) { id = xs.length; index.set(k, id); xs.push(x); ys.push(y); ranks.push(rank); edges.push([]); }
    else if (rank < ranks[id]) ranks[id] = rank;
    return id;
  };
  roadsByName = new Map();
  const byClass = {};
  for (const [ci, ni, pts] of D.roads) {
    const cls = classes[ci] || "unclassified";
    (byClass[cls] = byClass[cls] || []).push(pts);
    const rank = RANK[cls] ?? 6, sp = SPEED[cls] || 9;
    let prev = nodeOf(pts[0], pts[1], rank);
    for (let i = 2; i < pts.length; i += 2) {
      const cur = nodeOf(pts[i], pts[i + 1], rank);
      if (cur !== prev) {
        const len = Math.hypot(xs[cur] - xs[prev], ys[cur] - ys[prev]);
        const t = len / sp;
        edges[prev].push(cur, t); edges[cur].push(prev, t);
      }
      prev = cur;
    }
    if (ni >= 0) { const n = D.names[ni]; if (!roadsByName.has(n)) roadsByName.set(n, []); roadsByName.get(n).push({ pts, rank }); }
  }
  nodeX = Int32Array.from(xs); nodeY = Int32Array.from(ys); nodeRank = Int8Array.from(ranks); adj = edges;
  // largest connected component, so snapped points can always reach each other
  comp = new Int32Array(xs.length).fill(-1);
  let best = -1, bestSize = 0, c = 0;
  for (let s = 0; s < xs.length; s++) {
    if (comp[s] !== -1) continue;
    let size = 0; const stack = [s]; comp[s] = c;
    while (stack.length) { const u = stack.pop(); size++; const e = adj[u]; for (let i = 0; i < e.length; i += 2) if (comp[e[i]] === -1) { comp[e[i]] = c; stack.push(e[i]); } }
    if (size > bestSize) { bestSize = size; best = c; }
    c++;
  }
  MAP.mainComp = best;
  // spatial grid of main-component nodes on real roads (not service lanes)
  grid = new Map();
  for (let i = 0; i < xs.length; i++) {
    if (comp[i] !== best || nodeRank[i] > 7) continue;
    const k = Math.floor(xs[i] / GRID) * 1000 + Math.floor(ys[i] / GRID);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  // ---- drawing paths ----
  const poly = rings => { const p = new Path2D(); for (const r of rings) { p.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]); p.closePath(); } return p; };
  const lines = list => { const p = new Path2D(); for (const r of list) { p.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]); } return p; };
  const roads = {};
  for (const cls in byClass) roads[cls] = lines(byClass[cls]);
  MAP.drawOrder = ["service", "living_street", "residential", "unclassified", "tertiary", "secondary", "primary", "trunk", "motorway"].filter(c => roads[c]);
  MAP.paths = { land: poly(D.land), sand: poly(D.sand), parks: poly(D.parks), water: poly(D.water), roads };
  // ---- labels ----
  const labels = [];
  for (const [name, list] of roadsByName) {
    const placed = [];
    for (const { pts, rank } of list) {
      if (rank > 7) continue;
      let bi = -1, bl = 0;
      for (let i = 2; i < pts.length; i += 2) { const l = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); if (l > bl) { bl = l; bi = i; } }
      if (bl < 90) continue;
      const x = (pts[bi] + pts[bi - 2]) / 2, y = (pts[bi + 1] + pts[bi - 1]) / 2;
      if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < 700)) continue;
      placed.push([x, y]);
      let a = Math.atan2(pts[bi + 1] - pts[bi - 1], pts[bi] - pts[bi - 2]);
      if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      labels.push({ name, x, y, angle: a, len: bl, minor: rank >= 5 });
    }
  }
  labels.sort((a, b) => (a.minor - b.minor) || (b.len - a.len));
  MAP.labels = labels;
  MAP.landmarks = D.landmarks.map(([name, x, y, kind, major]) => ({ name, x, y, kind, major: !!major }));
  MAP.places = D.places.map(([name, cat, x, y]) => ({ name, cat, x, y }));
  MAP.addresses = (D.addresses || []).map(([name, x, y]) => ({ name, x, y }));
  MAP.postcodes = (D.postcodes || []).map(([name, x, y]) => ({ name, x, y }));
  MAP.raw = D;
  // grid of named road points for "what street is this?"
  nameGrid = new Map();
  for (const [ci, ni, pts] of D.roads) {
    if (ni < 0) continue;
    for (let i = 0; i < pts.length; i += 2) {
      const k = Math.floor(pts[i] / GRID) * 1000 + Math.floor(pts[i + 1] / GRID);
      if (!nameGrid.has(k)) nameGrid.set(k, []);
      nameGrid.get(k).push([pts[i], pts[i + 1], ni]);
    }
  }
  MAP.streets = [...roadsByName.keys()];
  const POPULAR = new Set(["bar", "restaurant", "hotel", "cafe", "train_station", "shopping_mall", "supermarket", "casual_eatery", "theatre_venue", "music_venue", "night_club", "cinema", "fast_food_restaurant", "hospital", "college_or_university", "museum", "casino", "stadium_or_arena"]);
  MAP.popular = MAP.places.filter(p => POPULAR.has(p.cat) && p.name.length < 34);
}

// ---------- projection ----------
export function toXY(lat, lon) { return { x: Math.round((lon - MAP.box[0]) * MAP.kx), y: Math.round((MAP.box[3] - lat) * MAP.ky) }; }
export function toLatLon(p) { return { lat: MAP.box[3] - p.y / MAP.ky, lon: MAP.box[0] + p.x / MAP.kx }; }

// ---------- snapping & routing ----------
export function nearestNode(p) {
  const gx = Math.floor(p.x / GRID), gy = Math.floor(p.y / GRID);
  let best = -1, bd = Infinity;
  for (let r = 0; r < 25 && (best < 0 || r < 2); r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const cell = grid.get((gx + dx) * 1000 + gy + dy);
      if (!cell) continue;
      for (const i of cell) { const d = (nodeX[i] - p.x) ** 2 + (nodeY[i] - p.y) ** 2; if (d < bd) { bd = d; best = i; } }
    }
  }
  return best;
}
// direction of the road at a point (radians), so parked cars line up with the kerb
export function roadAngle(p) {
  const n = nearestNode(p); if (n < 0) return 0;
  const e = adj[n]; if (!e || !e.length) return 0;
  const m = e[0];
  return Math.atan2(nodeY[m] - nodeY[n], nodeX[m] - nodeX[n]);
}
export function snap(p) { const n = nearestNode(p); return n < 0 ? { x: p.x, y: p.y } : { x: nodeX[n], y: nodeY[n] }; }

const cache = new Map();
// returns { path: [[x,y],...], secs, metres }
export function routeBetween(a, b) {
  const s = nearestNode(a), t = nearestNode(b);
  const key = s + ">" + t;
  let r = cache.get(key);
  if (!r) {
    r = astar(s, t);
    cache.set(key, r);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
  }
  const path = [[Math.round(a.x), Math.round(a.y)], ...r.nodes.map(i => [nodeX[i], nodeY[i]]), [Math.round(b.x), Math.round(b.y)]];
  const ends = Math.hypot(a.x - nodeX[s], a.y - nodeY[s]) + Math.hypot(b.x - nodeX[t], b.y - nodeY[t]);
  return { path: simplify(path, 2.5), secs: r.secs + ends / 6, metres: r.metres + ends };
}

function astar(s, t) {
  if (s < 0 || t < 0) return { nodes: [], secs: 0, metres: 0 };
  if (s === t) return { nodes: [s], secs: 0, metres: 0 };
  const n = nodeX.length;
  const g = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const h = i => Math.hypot(nodeX[i] - nodeX[t], nodeY[i] - nodeY[t]) / 27;
  const heap = [[h(s), s]]; g[s] = 0;
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  while (heap.length) {
    const [, u] = pop();
    if (closed[u]) continue;
    if (u === t) break;
    closed[u] = 1;
    const e = adj[u];
    for (let i = 0; i < e.length; i += 2) {
      const v = e[i], nd = g[u] + e[i + 1];
      if (nd < g[v]) { g[v] = nd; from[v] = u; push(nd + h(v), v); }
    }
  }
  if (from[t] < 0) return { nodes: [s, t], secs: Math.hypot(nodeX[s] - nodeX[t], nodeY[s] - nodeY[t]) / 8, metres: Math.hypot(nodeX[s] - nodeX[t], nodeY[s] - nodeY[t]) * 1.3 };
  const nodes = []; for (let v = t; v !== -1; v = from[v]) nodes.push(v);
  nodes.reverse();
  let metres = 0; for (let i = 1; i < nodes.length; i++) metres += Math.hypot(nodeX[nodes[i]] - nodeX[nodes[i - 1]], nodeY[nodes[i]] - nodeY[nodes[i - 1]]);
  return { nodes, secs: g[t], metres };
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function randomRoadPoint(test) {
  const cells = [...grid.values()];
  for (let i = 0; i < 80; i++) {
    const cell = cells[Math.floor(Math.random() * cells.length)];
    const n = cell[Math.floor(Math.random() * cell.length)];
    if (nodeRank[n] > 6) continue;
    const p = { x: nodeX[n], y: nodeY[n] };
    if (!test || test(p)) return p;
  }
  return { x: 3300, y: 6000 };
}

// ---------- search ----------
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export function search(q, limit = 8) {
  q = norm(q);
  const out = [];
  if (!q) return MAP.landmarks.filter(l => l.major).slice(0, limit).map(l => ({ name: l.name, x: l.x, y: l.y, kind: l.kind }));
  const num = (q.match(/^(\d{1,4}[a-z]?)\s+/) || [])[1];
  const rest = num ? q.slice(num.length).trim() : q;
  const words = rest.split(" ").filter(Boolean);
  const hit = name => { const n = norm(name); return words.every(w => n.includes(w)); };
  const pcq = q.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{1,2}\d/.test(pcq)) for (const p of MAP.postcodes) { if (p.name.replace(" ", "").startsWith(pcq)) { out.push({ name: p.name + ", Blackpool", x: p.x, y: p.y, kind: "postcode" }); if (out.length >= 5) break; } }
  for (const l of MAP.landmarks) if (hit(l.name)) out.push({ name: l.name, x: l.x, y: l.y, kind: l.kind });
  if (num) for (const a of MAP.addresses) { if (out.length >= 4) break; if (norm(a.name).startsWith(q)) out.push({ name: a.name, x: a.x, y: a.y, kind: "address" }); }
  if (rest.length >= 2) {
    for (const s of MAP.streets) {
      if (out.length >= limit) break;
      if (!hit(s)) continue;
      const p = pointOnStreet(s, num);
      if (p) out.push({ name: (num ? num + " " : "") + s + ", Blackpool", x: p.x, y: p.y, kind: "street" });
    }
    if (!num) for (const a of MAP.addresses) { if (out.length >= limit) break; if (hit(a.name)) out.push({ name: a.name, x: a.x, y: a.y, kind: "address" }); }
    for (const p of MAP.places) {
      if (out.length >= limit * 2) break;
      if (hit(p.name)) out.push({ name: p.name, x: p.x, y: p.y, kind: p.cat });
    }
  }
  const seen = new Set();
  return out.filter(o => !seen.has(o.name) && seen.add(o.name)).slice(0, limit);
}
function pointOnStreet(name, num) {
  const list = roadsByName.get(name); if (!list || !list.length) return null;
  const segs = list.filter(r => r.rank <= 7);
  const all = (segs.length ? segs : list).map(r => r.pts);
  let total = 0; const lens = all.map(pts => { let L = 0; for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); total += L; return L; });
  let target = total * (num ? ((parseInt(num, 10) % 150) / 150) : 0.5);
  for (let k = 0; k < all.length; k++) {
    if (target > lens[k]) { target -= lens[k]; continue; }
    const pts = all[k];
    for (let i = 2; i < pts.length; i += 2) {
      const L = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      if (target <= L) { const f = L ? target / L : 0; return { x: Math.round(pts[i - 2] + (pts[i] - pts[i - 2]) * f), y: Math.round(pts[i - 1] + (pts[i + 1] - pts[i - 1]) * f) }; }
      target -= L;
    }
  }
  const p = all[0]; return { x: p[0], y: p[1] };
}
// "what's here?" for a point picked on the map
export function describe(p) {
  let best = null, bd = 45 * 45, isAddr = false;
  for (const a of MAP.addresses) { const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2; if (d < bd) { bd = d; best = a.name; isAddr = true; } }
  for (const l of MAP.landmarks) { const d = (l.x - p.x) ** 2 + (l.y - p.y) ** 2; if (d < 70 * 70 && d < bd + 900) { bd = d; best = l.name; isAddr = false; } }
  const street = streetAt(p);
  if (best) return { name: best, street: isAddr || !street || best.includes(street) ? "Blackpool" : street + ", Blackpool" };
  return { name: street ? street + ", Blackpool" : "Pinned location", street };
}
export function streetAt(p) {
  const gx = Math.floor(p.x / GRID), gy = Math.floor(p.y / GRID);
  let best = -1, bd = Infinity;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const cell = nameGrid.get((gx + dx) * 1000 + gy + dy); if (!cell) continue;
    for (const [x, y, ni] of cell) { const d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < bd) { bd = d; best = ni; } }
  }
  return best >= 0 && bd < 120 * 120 ? MAP.raw.names[best] : "";
}
// GeoJSON for the map engine (lon/lat)
export function geojson() {
  const D = MAP.raw;
  const ll = (x, y) => { const q = toLatLon({ x, y }); return [Math.round(q.lon * 1e6) / 1e6, Math.round(q.lat * 1e6) / 1e6]; };
  const ring = r => { const out = []; for (let i = 0; i < r.length; i += 2) out.push(ll(r[i], r[i + 1])); if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]); return out; };
  const polys = rings => ({ type: "FeatureCollection", features: rings.map(r => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring(r)] } })) });
  const classes = D.classes.map(c => c === "unknown" ? "unclassified" : c);
  const roads = { type: "FeatureCollection", features: D.roads.map(([ci, ni, pts]) => { const c = []; for (let i = 0; i < pts.length; i += 2) c.push(ll(pts[i], pts[i + 1])); return { type: "Feature", properties: { c: classes[ci], n: ni >= 0 ? D.names[ni] : "" }, geometry: { type: "LineString", coordinates: c } }; }) };
  const land = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: D.land.map(ring) } }] };
  const pts = (list, props) => ({ type: "FeatureCollection", features: list.map(p => ({ type: "Feature", properties: props(p), geometry: { type: "Point", coordinates: ll(p.x, p.y) } })) });
  return {
    land, sand: polys(D.sand), parks: polys(D.parks), water: polys(D.water), roads,
    landmarks: pts(MAP.landmarks, l => ({ n: l.name.replace(/ \(.*\)/, ""), k: l.kind, m: l.major ? 1 : 0 })),
    places: pts(MAP.popular || [], p => ({ n: p.name, k: p.cat })),
  };
}
export async function buildingsGeojson(url = "data/buildings.json") {
  const res = await fetch(url); if (!res.ok) throw new Error("buildings " + res.status);
  const B = await res.json();
  const ll = (x, y) => { const q = toLatLon({ x, y }); return [Math.round(q.lon * 1e6) / 1e6, Math.round(q.lat * 1e6) / 1e6]; };
  return { type: "FeatureCollection", features: B.polys.map((r, i) => { const c = []; for (let k = 0; k < r.length; k += 2) c.push(ll(r[k], r[k + 1])); c.push(c[0]); return { type: "Feature", properties: { h: B.h[i] || 0 }, geometry: { type: "Polygon", coordinates: [c] } }; }) };
}

// best guess at a place mentioned in free text ("from the tower to the airport")
export function findInText(text) {
  const t = norm(text);
  if (!t) return null;
  const KEYS = { tower: "Blackpool Tower", airport: "Blackpool Airport", hospital: "Victoria Hospital", vic: "Victoria Hospital", zoo: "Blackpool Zoo", "pleasure beach": "Pleasure Beach", "north station": "Blackpool North station", "south station": "Blackpool South station", "bloomfield": "Bloomfield Road (Blackpool FC)", "football": "Bloomfield Road (Blackpool FC)", "winter gardens": "Winter Gardens", "north pier": "North Pier", "central pier": "Central Pier", "south pier": "South Pier", "sandcastle": "Sandcastle Waterpark", "houndshill": "Houndshill Shopping Centre", "stanley park": "Stanley Park", "grand theatre": "The Grand Theatre", "bispham": "Bispham", "layton": "Layton", "marton": "Marton", "gynn": "Gynn Square", "tesco": "Tesco Extra, Clifton Road", "college": "Blackpool & The Fylde College", "comedy carpet": "Comedy Carpet", "squires gate": "Squires Gate station", "mereside": "Mereside" };
  for (const k of Object.keys(KEYS).sort((a, b) => b.length - a.length)) if (t.includes(k)) { const l = MAP.landmarks.find(x => x.name === KEYS[k]); if (l) return { name: l.name, x: l.x, y: l.y }; }
  const m = t.match(/(\d{1,4})\s+([a-z ]+?(?:road|street|avenue|drive|lane|way|close|grove|crescent|place|terrace|promenade|square|gardens))\b/);
  if (m) { const s = MAP.streets.find(n => norm(n) === m[2].trim()); if (s) { const p = pointOnStreet(s, m[1]); if (p) return { name: m[1] + " " + s + ", Blackpool", x: p.x, y: p.y }; } }
  for (const s of MAP.streets) if (s.length > 6 && t.includes(norm(s))) { const p = pointOnStreet(s, null); if (p) return { name: s + ", Blackpool", x: p.x, y: p.y }; }
  for (const p of MAP.places) if (p.name.length > 5 && t.includes(norm(p.name))) return { name: p.name, x: p.x, y: p.y };
  return null;
}
