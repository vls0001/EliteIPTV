// Live map: MapLibre GL (vector, smooth zoom and rotate) with Blackpool data shipped in the app,
// so it works inside artifacts and offline. Falls back to the canvas map if WebGL isn't available.
import { MAP, onMapReady, geojson, buildingsGeojson, toLatLon, toXY } from "./mapdata.js";
import { posOf } from "./geo.js";
import { createMap as createCanvasMap, carSprite } from "./mapcanvas.js";

const ML = () => window.maplibregl;
const STATUS = { free: "#3DDC84", busy: "#F5C518", offered: "#5AA2FF", break: "#9A9AA3", off: "#5A5A63" };
const CREDIT = "© OpenStreetMap contributors · Overture Maps";
let geoCache = null, bldPromise = null;

function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}
// Label glyphs ship as one JSON file (artifact hosting can't serve .pbf), handed to MapLibre through a custom protocol.
let glyphs = null, protoOn = false;
function glyphProtocol() {
  if (protoOn) return; protoOn = true;
  ML().addProtocol("kglyph", async params => {
    glyphs = glyphs || fetch(baseUrl() + "data/glyphs.json").then(r => r.json());
    const g = await glyphs, range = (params.url.match(/(\d+-\d+)$/) || [])[1];
    if (!g[range]) return { data: new ArrayBuffer(0) };
    const bin = atob(g[range]), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { data: out.buffer };
  });
}
const baseUrl = () => location.href.split("#")[0].replace(/[?].*$/, "").replace(/[^/]*$/, "");

function style() {
  const g = geoCache || (geoCache = geojson());
  const W = (z0, w0, z1, w1) => ["interpolate", ["exponential", 1.6], ["zoom"], z0, w0, z1, w1];
  const roadCls = list => ["in", ["get", "c"], ["literal", list]];
  const FONT = ["noto"];
  return {
    version: 8,
    glyphs: "kglyph://{fontstack}/{range}",
    sources: {
      land: { type: "geojson", data: g.land }, sand: { type: "geojson", data: g.sand }, parks: { type: "geojson", data: g.parks },
      water: { type: "geojson", data: g.water }, roads: { type: "geojson", data: g.roads, tolerance: 0.25 },
      landmarks: { type: "geojson", data: g.landmarks }, places: { type: "geojson", data: g.places },
      buildings: { type: "geojson", data: { type: "FeatureCollection", features: [] }, tolerance: 0.2 },
      routes: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": "#0B1420" } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": "#141518" } },
      { id: "sand", type: "fill", source: "sand", paint: { "fill-color": "#24221B" } },
      { id: "parks", type: "fill", source: "parks", paint: { "fill-color": "#15211A" } },
      { id: "water", type: "fill", source: "water", paint: { "fill-color": "#0E1C2E" } },
      { id: "buildings", type: "fill-extrusion", source: "buildings", minzoom: 14.5, paint: {
        "fill-extrusion-color": "#202227", "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15.5, 0.9],
        "fill-extrusion-height": ["case", [">", ["get", "h"], 0], ["get", "h"], 6], "fill-extrusion-base": 0 } },
      { id: "road-minor-case", type: "line", source: "roads", filter: roadCls(["residential", "unclassified", "living_street", "service"]), minzoom: 13.5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0F1013", "line-width": W(13.5, 1.5, 18, 16) } },
      { id: "road-minor", type: "line", source: "roads", filter: roadCls(["residential", "unclassified", "living_street", "service"]), minzoom: 12.5,
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "c"], "service", "#24262B", "#2C2E34"], "line-width": W(12.5, 0.5, 18, 12) } },
      { id: "road-major-case", type: "line", source: "roads", filter: roadCls(["tertiary", "secondary", "primary", "trunk", "motorway"]),
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0C0D10", "line-width": W(11, 2, 18, 24) } },
      { id: "road-major", type: "line", source: "roads", filter: roadCls(["tertiary", "secondary", "primary", "trunk", "motorway"]),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["match", ["get", "c"], "motorway", "#8A6A22", "trunk", "#6E5A26", "primary", "#4C4F57", "secondary", "#43464E", "#3A3D44"], "line-width": W(11, 1, 18, 20) } },
      { id: "routes-other", type: "line", source: "routes", filter: ["!=", ["get", "mine"], 1], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FFFFFF", "line-opacity": 0.35, "line-width": 2.5, "line-dasharray": [1, 2.5] } },
      { id: "routes-mine-glow", type: "line", source: "routes", filter: ["==", ["get", "mine"], 1], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#F5C518", "line-opacity": 0.25, "line-width": W(12, 6, 18, 18) } },
      { id: "routes-mine", type: "line", source: "routes", filter: ["==", ["get", "mine"], 1], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#F5C518", "line-width": W(12, 3, 18, 8) } },
      { id: "road-labels", type: "symbol", source: "roads", filter: ["!=", ["get", "n"], ""], minzoom: 13.2,
        layout: { "symbol-placement": "line", "text-field": ["get", "n"], "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 17, 13.5],
          "text-max-angle": 30, "symbol-spacing": 280, "text-padding": 4 },
        paint: { "text-color": "#9EA2AC", "text-halo-color": "#141518", "text-halo-width": 1.6 } },
      { id: "places", type: "symbol", source: "places", minzoom: 15.6,
        layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": 11, "text-anchor": "left", "text-offset": [0.7, 0], "text-optional": true,
          "icon-optional": true, "text-max-width": 9 },
        paint: { "text-color": "#7D828C", "text-halo-color": "#141518", "text-halo-width": 1.4 } },
      { id: "landmarks", type: "symbol", source: "landmarks", filter: ["any", ["==", ["get", "m"], 1], [">=", ["zoom"], 13.6]],
        layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 16, 14], "text-anchor": "left", "text-offset": [0.6, 0], "text-max-width": 10 },
        paint: { "text-color": "#E7E8EB", "text-halo-color": "#0E0F12", "text-halo-width": 1.8 } },
      { id: "landmark-dots", type: "circle", source: "landmarks", filter: ["any", ["==", ["get", "m"], 1], [">=", ["zoom"], 13.6]],
        paint: { "circle-radius": 3.5, "circle-color": ["match", ["get", "k"], "hospital", "#F06A6A", "station", "#5AA2FF", "airport", "#9B8CFF", "#F5C518"], "circle-stroke-color": "#0E0F12", "circle-stroke-width": 1.5 } },
    ],
  };
}

const imgCache = new Map();
function carImage(colour, type) {
  const key = colour + "|" + type;
  if (!imgCache.has(key)) { const sp = carSprite(colour, type, "plain", 2); imgCache.set(key, { url: sp.c.toDataURL(), w: sp.W, h: sp.H }); }
  return imgCache.get(key);
}

export function createMap(container, opts = {}) {
  if (!ML() || !webglOk()) return createCanvasMap(container, opts);
  const wrap = document.createElement("div");
  wrap.className = "ml-wrap" + (opts.compact ? " compact" : "");
  container.append(wrap);
  let map, loaded = false, alive = true, follow = opts.follow || null, lastRoutesKey = "";
  let data = { drivers: [], jobs: [], me: null, focus: null, selected: null, onlyRoute: null };
  const cars = new Map(), pins = new Map(), angles = new Map();
  const moveEnd = [];

  const ll = p => { const q = toLatLon(p); return [q.lon, q.lat]; };
  const metresPerPx = z => 156543.03 * Math.cos(53.82 * Math.PI / 180) / Math.pow(2, z);
  const zoomFor = widthM => Math.log2(156543.03 * Math.cos(53.82 * Math.PI / 180) * Math.max(200, wrap.clientWidth || 360) / widthM);

  function init() {
    glyphProtocol();
    map = new (ML().Map)({
      container: wrap, style: style(), center: ll({ x: 2300, y: 5900 }), zoom: 12.4, minZoom: 10.5, maxZoom: 19,
      maxBounds: [ll({ x: -3000, y: 15000 }), ll({ x: 9500, y: -3000 })],
      attributionControl: false, dragRotate: !opts.compact, pitchWithRotate: !opts.compact, touchPitch: !opts.compact, fadeDuration: 120,
    });
    map.addControl(new (ML().AttributionControl)({ compact: true, customAttribution: CREDIT }), "bottom-right");
    map.once("load", () => wrap.querySelectorAll(".maplibregl-compact-show").forEach(e => e.classList.remove("maplibregl-compact-show")));
    map.on("load", () => {
      loaded = true;
      pushRoutes(true);
      if (!opts.noBuildings) {
        bldPromise = bldPromise || buildingsGeojson();
        bldPromise.then(b => { if (alive && map.getSource("buildings")) map.getSource("buildings").setData(b); }).catch(() => {});
      }
      if (opts.fitOnLoad !== false && !follow) fit(true);
    });
    map.on("click", e => { if (opts.onMapClick) opts.onMapClick(toXY(e.lngLat.lat, e.lngLat.lng)); });
    map.on("dragstart", () => { follow = null; });
    map.on("moveend", () => { const c = map.getCenter(); const p = toXY(c.lat, c.lng); moveEnd.forEach(cb => cb(p)); });
    requestAnimationFrame(frame);
  }

  // ---------- markers ----------
  function carMarker(d) {
    let m = cars.get(d.id);
    if (!m) {
      const el = document.createElement("div"); el.className = "car-mk";
      el.innerHTML = '<img class="car-img" alt="" draggable="false"><span class="car-tag"></span>';
      el.addEventListener("click", ev => { ev.stopPropagation(); opts.onCarClick && opts.onCarClick(d.id); });
      m = { el, img: el.firstChild, tag: el.lastChild, marker: new (ML().Marker)({ element: el, anchor: "center" }).setLngLat(ll(posOf(d))).addTo(map), key: "" };
      cars.set(d.id, m);
    }
    m.d = d;
    const key = (d.car && d.car.colour) + "|" + (d.car && d.car.type);
    if (m.key !== key) { const im = carImage(d.car && d.car.colour, d.car && d.car.type); m.img.src = im.url; m.img.style.width = im.w + "px"; m.img.style.height = im.h + "px"; m.key = key; }
    return m;
  }
  function pinMarker(id, p, letter, kind) {
    const k = id + letter;
    let m = pins.get(k);
    if (!m) {
      const el = document.createElement("div"); el.className = "pin-mk " + kind;
      el.innerHTML = '<div class="pin-in"><svg viewBox="0 0 30 40" width="30" height="40"><path d="M15 39C6 27 1 21 1 14a14 14 0 0 1 28 0c0 7-5 13-14 25z"/></svg><b>' + letter + "</b></div>";
      el.addEventListener("click", ev => { ev.stopPropagation(); opts.onPinClick && opts.onPinClick(id); });
      m = { el, marker: new (ML().Marker)({ element: el, anchor: "bottom" }).setLngLat(ll(p)).addTo(map) };
      pins.set(k, m);
    }
    m.marker.setLngLat(ll(p)); m.seen = true;
    if (m.kind !== kind) { if (m.kind) m.el.classList.remove(...m.kind.split(" ")); m.el.classList.add(...kind.split(" ")); m.kind = kind; }
    return m;
  }

  function update(next) {
    data = Object.assign(data, next);
    if (!map) return;
    const offered = new Set((data.jobs || []).filter(j => j.status === "offered" && j.offer).map(j => j.offer.driverId));
    const seen = new Set();
    for (const d of data.drivers) {
      if (d.status === "off" && d.id !== data.me) continue;
      seen.add(d.id);
      const m = carMarker(d);
      const st = offered.has(d.id) ? "offered" : d.status;
      m.tag.textContent = d.call || "";
      m.tag.style.background = STATUS[st] || STATUS.free;
      m.el.classList.toggle("sel", d.id === data.me || d.id === data.selected);
    }
    for (const [id, m] of cars) if (!seen.has(id)) { m.marker.remove(); cars.delete(id); }
    pins.forEach(p => p.seen = false);
    for (const j of data.jobs || []) {
      const waiting = j.status === "new" || j.status === "offered";
      if (waiting || ["accepted", "arrived"].includes(j.status)) pinMarker(j.id, j.pickup, "P", "pick" + (j.status === "new" ? " waiting" : "") + (j.id === data.focus ? " focus" : ""));
      if (j.id === data.focus || j.status === "pob") pinMarker(j.id, j.drop, "D", "drop" + (j.id === data.focus ? " focus" : ""));
    }
    for (const [k, p] of pins) if (!p.seen) { p.marker.remove(); pins.delete(k); }
    pushRoutes();
  }
  function pushRoutes(force) {
    if (!loaded) return;
    const feats = [];
    for (const d of data.drivers) {
      if (!d.move || !d.move.path || (data.onlyRoute && d.id !== data.onlyRoute)) continue;
      if (d.status !== "busy" && d.id !== data.me) continue;
      feats.push({ type: "Feature", properties: { mine: d.id === data.me || d.id === data.onlyRoute ? 1 : 0 }, geometry: { type: "LineString", coordinates: d.move.path.map(p => ll({ x: p[0], y: p[1] })) } });
    }
    const key = feats.length + ":" + feats.map(f => f.geometry.coordinates.length + "," + f.geometry.coordinates[0]).join("|");
    if (!force && key === lastRoutesKey) return;
    lastRoutesKey = key;
    map.getSource("routes").setData({ type: "FeatureCollection", features: feats });
  }

  function frame() {
    if (!alive) return;
    const now = Date.now();
    const bearing = map.getBearing();
    const z = map.getZoom();
    const scale = Math.max(0.55, Math.min(1.25, (z - 11) / 5));
    for (const [id, m] of cars) {
      const d = m.d; const p = posOf(d, now);
      m.marker.setLngLat(ll(p));
      const moving = d.move && now < d.move.startAt + d.move.dur * 1000;
      let ang;
      if (moving) { ang = p.dir; angles.set(id, ang); } else ang = angles.has(id) ? angles.get(id) : p.dir;
      const deg = ang * 180 / Math.PI + 90 - bearing;
      m.img.style.transform = "rotate(" + deg.toFixed(1) + "deg) scale(" + scale.toFixed(2) + ")";
    }
    if (follow) { const f = follow(); if (f) { const c = map.getCenter(), t = ll(f); const k = 0.12; map.jumpTo({ center: [c.lng + (t[0] - c.lng) * k, c.lat + (t[1] - c.lat) * k], zoom: map.getZoom() + (zoomFor(f.w || 1600) - map.getZoom()) * 0.08 }); } }
    requestAnimationFrame(frame);
  }

  function fit(instant) {
    if (!map) return;
    const a = ll({ x: 900, y: 600 }), b = ll({ x: 6300, y: 11300 });
    map.fitBounds([[a[0], b[1]], [b[0], a[1]]], { padding: 20, duration: instant ? 0 : 600, bearing: 0, pitch: 0 });
  }

  const ro = new ResizeObserver(() => map && map.resize());
  ro.observe(wrap);
  onMapReady(() => init());

  return {
    el: wrap, update, fit,
    zoom(f) { if (map) map.easeTo({ zoom: map.getZoom() + Math.log2(1 / f), duration: 250 }); },
    lookAt(p, widthM = 2200) { if (!map) return; follow = null; map.easeTo({ center: ll(p), zoom: zoomFor(widthM), duration: 650 }); },
    setFollow(fn) { follow = fn; },
    center() { if (!map) return null; const c = map.getCenter(); return toXY(c.lat, c.lng); },
    onMoveEnd(cb) { moveEnd.push(cb); },
    tilt(on) { if (map) map.easeTo({ pitch: on ? 55 : 0, bearing: on ? -18 : 0, duration: 700 }); },
    destroy() { alive = false; ro.disconnect(); cars.forEach(m => m.marker.remove()); pins.forEach(m => m.marker.remove()); if (map) map.remove(); wrap.remove(); },
  };
}
