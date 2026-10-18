// Shared state, live data and every job action. All three apps (customer, driver, dispatch) use this.
import { APP, DEFAULT_SETTINGS, VEHICLES } from "./config.js";
import { toast } from "./lib/dom.js";
import { posOf, makeMove, zoneOf, dist, quote, roughMinutes, randomSpot } from "./lib/geo.js";
import { MAP } from "./lib/mapdata.js";
import { weekKey } from "./backend/seed.js";

export const K = {
  api: null,
  settings: Object.assign({}, DEFAULT_SETTINGS),
  drivers: {},
  jobs: [],
  customers: {},
  rent: [],
  expenses: [],
  msgs: [],
  alerts: [],
  ready: false,
  settingsLoaded: false,
};

// ---------- change notifications (batched per frame) ----------
const listeners = new Set();
let raf = 0;
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function changed() {
  if (raf) return;
  raf = (window.requestAnimationFrame || setTimeout)(() => { raf = 0; for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } });
}

// ---------- loading ----------
export function startSync(api) {
  K.api = api;
  api.watchDoc("settings/firm", d => { K.settings = Object.assign({}, DEFAULT_SETTINGS, d || {}); delete K.settings.id; K.settingsLoaded = true; K.hasFirm = !!d; changed(); });
  api.watchCol("drivers", { limit: 300 }, rows => { K.drivers = {}; for (const r of rows) K.drivers[r.id] = r; K.ready = true; changed(); });
  api.watchCol("jobs", { orderBy: ["createdAt", "desc"], limit: 800 }, rows => { K.jobs = rows; changed(); });
  api.watchCol("customers", { limit: 1000 }, rows => { K.customers = {}; for (const r of rows) K.customers[r.id] = r; changed(); });
  api.watchCol("rent", { limit: 1000 }, rows => { K.rent = rows; changed(); });
  api.watchCol("expenses", { orderBy: ["at", "desc"], limit: 500 }, rows => { K.expenses = rows; changed(); });
  api.watchCol("msgs", { orderBy: ["at", "desc"], limit: 300 }, rows => { K.msgs = rows.reverse(); changed(); });
  api.watchCol("alerts", { orderBy: ["at", "desc"], limit: 50 }, rows => { K.alerts = rows; changed(); });
}

// ---------- helpers ----------
export const driversList = () => Object.values(K.drivers).filter(d => d.active !== false);
export const activeJobs = () => K.jobs.filter(j => ["new", "offered", "accepted", "arrived", "pob"].includes(j.status));
export const jobFor = id => K.jobs.find(j => j.id === id) || null;
export const jobOfDriver = id => K.jobs.find(j => j.driverId === id && ["accepted", "arrived", "pob"].includes(j.status)) || null;
export const offerFor = id => K.jobs.find(j => j.status === "offered" && j.offer && j.offer.driverId === id) || null;
export function carLabel(d) { return d && d.car ? [d.car.colour, d.car.make, d.car.model].filter(Boolean).join(" ") : ""; }
export function queueOf(zone) {
  return driversList().filter(d => d.status === "free" && !jobOfDriver(d.id) && !offerFor(d.id) && zoneOf(posOf(d)) === zone).sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
}
export function queuePos(d) { const q = queueOf(zoneOf(posOf(d))); const i = q.findIndex(x => x.id === d.id); return i < 0 ? null : i + 1; }
export function fits(d, vehicle) {
  const t = (d.car && d.car.type) || "saloon";
  if (vehicle === "wav") return t === "wav";
  if (vehicle === "mpv") return t === "mpv";
  if (vehicle === "estate") return t === "estate" || t === "mpv";
  return true;
}
export function bestDriver(job, exclude = []) {
  const free = driversList().filter(d => d.status === "free" && !jobOfDriver(d.id) && !offerFor(d.id) && fits(d, job.vehicle) && !exclude.includes(d.id));
  if (!free.length) return null;
  if (K.settings.mode === "queue") {
    const zone = zoneOf(job.pickup);
    const q = free.filter(d => zoneOf(posOf(d)) === zone).sort((a, b) => (K.api.mode === "demo" ? (!a.sim ? 0 : 1) - (!b.sim ? 0 : 1) : 0) || (a.queuedAt || 0) - (b.queuedAt || 0));
    if (q.length) return q[0];
  }
  return free.sort((a, b) => dist(posOf(a), job.pickup) - dist(posOf(b), job.pickup))[0];
}
export function nearestEta(pickup, vehicle = "saloon") {
  const free = driversList().filter(d => d.status === "free" && !jobOfDriver(d.id) && fits(d, vehicle));
  if (!free.length) return null;
  return Math.max(2, Math.min(...free.map(d => roughMinutes(posOf(d), pickup))) + 1);
}

async function w(fn, what) {
  try { return await fn(); }
  catch (e) {
    console.warn(e);
    toast(e && e.code === "invalid_argument" ? "You don't have permission to " + what + "." : "Couldn't " + what + ". Try again.", "bad");
    return null;
  }
}
const up = (path, data) => K.api.update(path, data);

// ---------- job lifecycle ----------
export async function createJob(o) {
  const now = Date.now();
  const q = quote(o.pickup, o.drop, K.settings, o.vehicle || "saloon", o.when || now);
  const job = {
    status: "new", pickup: o.pickup, drop: o.drop, when: o.when || now, createdAt: now, vehicle: o.vehicle || "saloon",
    passengers: o.passengers || 1, customer: o.customer || { name: "Customer", phone: "" }, source: o.source || "app",
    notes: o.notes || "", fare: o.fare || q.fare, miles: q.miles, prebook: !!(o.when && o.when > now + 15 * 60000),
    driverId: null, offer: null, declined: [], account: o.account || "",
  };
  const id = await w(() => K.api.add("jobs", job), "book that");
  if (id && job.customer.phone) K.api.set("customers/" + job.customer.phone.replace(/\D/g, ""), { name: job.customer.name, phone: job.customer.phone, lastPickup: job.pickup }).catch(() => {});
  return id;
}

export function offer(job, driverId) {
  return w(() => up("jobs/" + job.id, { status: "offered", offer: { driverId, until: Date.now() + APP.offerSeconds * 1000, at: Date.now() } }), "offer the job");
}

export async function accept(job, d) {
  const now = Date.now();
  await w(async () => {
    await up("jobs/" + job.id, { status: "accepted", driverId: d.id, acceptedAt: now, offer: null });
    await up("drivers/" + d.id, { status: "busy", move: makeMove(posOf(d, now), job.pickup, now) });
  }, "accept the job");
}

export function decline(job, driverId) {
  return w(() => up("jobs/" + job.id, { status: "new", offer: null, declined: [...new Set([...(job.declined || []), driverId])] }), "decline");
}

export function arrive(job) { return w(() => up("jobs/" + job.id, { status: "arrived", arrivedAt: Date.now() }), "mark arrived"); }

export async function pob(job, d) {
  const now = Date.now();
  await w(async () => {
    await up("jobs/" + job.id, { status: "pob", pobAt: now });
    await up("drivers/" + d.id, { move: makeMove(posOf(d, now), job.drop, now) });
  }, "start the trip");
}

export async function complete(job, d, fare, pay) {
  const now = Date.now();
  const p = posOf(d, now);
  await w(async () => {
    await up("jobs/" + job.id, { status: "done", doneAt: now, fare: Math.round(fare * 100) / 100, pay });
    await up("drivers/" + d.id, { status: "free", x: Math.round(p.x), y: Math.round(p.y), move: null, queuedAt: now });
  }, "complete the job");
}

export async function cancel(job, why = "cancelled") {
  await w(async () => {
    await up("jobs/" + job.id, { status: why, cancelledAt: Date.now(), offer: null });
    const d = job.driverId && K.drivers[job.driverId];
    if (d) { const p = posOf(d); await up("drivers/" + d.id, { status: "free", x: Math.round(p.x), y: Math.round(p.y), move: null, queuedAt: Date.now() }); }
  }, "cancel the job");
}

export function rate(job, stars) { return w(() => up("jobs/" + job.id, { rating: stars }), "save your rating"); }

export async function setStatus(d, status) {
  const p = posOf(d);
  const patch = { status, x: Math.round(p.x), y: Math.round(p.y), move: null };
  if (status === "free") patch.queuedAt = Date.now();
  return w(() => up("drivers/" + d.id, patch), "change status");
}

export async function assign(job, d, force) {
  if (force) {
    if (job.driverId && job.driverId !== d.id && K.drivers[job.driverId]) await setStatus(K.drivers[job.driverId], "free");
    return accept(job, d);
  }
  return offer(job, d.id);
}

export function sendMsg(driverId, from, text) { return w(() => K.api.add("msgs", { driverId, from, text: String(text).slice(0, 500), at: Date.now() }), "send that"); }
export function sos(driverId) { return w(() => K.api.add("alerts", { driverId, kind: "sos", at: Date.now(), resolved: false }), "send the alert"); }
export function resolveAlert(a) { return w(() => up("alerts/" + a.id, { resolved: true, resolvedAt: Date.now() }), "resolve the alert"); }
export function saveSettings(patch) { return w(async () => { if (K.hasFirm) await up("settings/firm", patch); else await K.api.set("settings/firm", Object.assign({}, K.settings, patch)); toast("Saved.", "ok"); }, "save settings"); }
export function saveDriver(id, data) { return w(() => K.drivers[id] ? up("drivers/" + id, data) : K.api.set("drivers/" + id, data), "save the driver"); }
export function setRentPaid(driverId, week, amount, paid) { return w(() => K.api.set("rent/" + driverId + "__" + week, { driverId, week, amount, paid, paidAt: paid ? Date.now() : null }), "update rent"); }
export function addExpense(e) { return w(() => K.api.add("expenses", Object.assign({ at: Date.now() }, e)), "add the expense"); }
export function delExpense(id) { return w(() => K.api.del("expenses/" + id), "delete the expense"); }
export { weekKey };

// ---------- dispatch engine ----------
// Runs in one open page at a time (a lease), assigns jobs, expires offers, and drives demo cars.
// In production this belongs on a server; here any open page can take the job.
const holder = Math.random().toString(36).slice(2);
let leader = false, lastLease = 0, lastBooking = Date.now() - 14000, inflight = new Map();
const busy = (key, ms = 4000) => { const t = inflight.get(key); if (t && Date.now() - t < ms) return true; inflight.set(key, Date.now()); return false; };

export function startEngine() {
  setInterval(tick, 1000);
}

async function tick() {
  if (!K.api || !K.ready || !K.settingsLoaded || !K.api.canWrite) return;
  const now = Date.now();
  if (now - lastLease > 2000) { lastLease = now; leader = await K.api.lease("engine/lock", holder, 6000); K.engineLeader = leader; }
  if (!leader) return;
  const S = K.settings;

  const offeredNow = new Set(K.jobs.filter(j => j.status === "offered" && j.offer).map(j => j.offer.driverId));
  for (const j of activeJobs()) {
    // offers that ran out go back to the pool
    if (j.status === "offered" && j.offer && j.offer.until < now && !busy("exp" + j.id)) decline(j, j.offer.driverId);
    // auto-dispatch
    if (j.status === "new" && S.autoDispatch && j.when <= now + 10 * 60000 && !busy("off" + j.id, 3000)) {
      const d = bestDriver(j, [...(j.declined || []), ...offeredNow]);
      if (d) { offeredNow.add(d.id); offer(j, d.id); }
      else if ((j.declined || []).length && !bestDriver(j)) { /* everyone declined: leave for the dispatcher */ }
      else if ((j.declined || []).length) up("jobs/" + j.id, { declined: [] }).catch(() => {});
    }
  }

  if (S.demoDrivers) {
    for (const d of driversList()) {
      if (!d.sim) continue;
      const j = jobOfDriver(d.id);
      const o = offerFor(d.id);
      if (o && now - (o.offer.at || 0) > 2500 && !busy("acc" + o.id)) { if (Math.random() < 0.9) accept(o, d); else decline(o, d.id); continue; }
      if (!j) {
        if (d.status === "busy" && !busy("fix" + d.id)) setStatus(d, "free");
        else if (d.status === "free" && (!d.move || now - d.move.startAt > 40000) && Math.random() < 0.015 && !busy("wan" + d.id, 20000)) wander(d);
        continue;
      }
      const moving = d.move && now < d.move.startAt + d.move.dur * 1000;
      if (j.status === "accepted" && !moving && now - (j.acceptedAt || now) > 1500 && !busy("arr" + j.id)) arrive(j);
      else if (j.status === "arrived" && now - (j.arrivedAt || now) > 4000 && !busy("pob" + j.id)) pob(j, d);
      else if (j.status === "pob" && !moving && now - (j.pobAt || now) > 1500 && !busy("done" + j.id)) complete(j, d, j.fare, Math.random() < 0.55 ? "cash" : "card");
    }
    if (S.autoBookings && now - lastBooking > 18000 + Math.random() * 12000) { lastBooking = now; randomBooking(); }
  }
}

function wander(d) {
  const p = posOf(d);
  const to = randomSpot(zoneOf(p));
  up("drivers/" + d.id, { move: makeMove(p, to, Date.now()) }).catch(() => {});
}

function randomStop() {
  // mostly landmarks, sometimes a real pub, hotel, shop or street
  if (Math.random() < 0.55) { const l = MAP.landmarks[Math.floor(Math.random() * MAP.landmarks.length)]; return { name: l.name, x: l.x, y: l.y }; }
  const list = MAP.popular.length ? MAP.popular : MAP.places; const p = list[Math.floor(Math.random() * list.length)]; return { name: p.name, x: p.x, y: p.y };
}

async function randomBooking() {
  const names = [["Jean Fletcher", "07700 900456"], ["Ryan Cooper", "07700 900789"], ["Linda Hart", "07700 900987"], ["Mick Rowe", "07700 900111"], ["Sophie Ward", "07700 900222"], ["Tom Walsh", "07700 900654"]];
  let a = randomStop();
  // half the time, start the job near a free car that a person is driving, so the demo driver gets work
  const human = driversList().find(d => !d.sim && d.status === "free" && !jobOfDriver(d.id) && !offerFor(d.id));
  if (human && Math.random() < 0.8) { const z = zoneOf(posOf(human)); for (let i = 0; i < 20; i++) { const c = randomStop(); if (zoneOf(c) === z) { a = c; break; } } }
  let b = randomStop(); for (let i = 0; i < 5 && dist(a, b) < 900; i++) b = randomStop();
  const [name, phone] = names[Math.floor(Math.random() * names.length)];
  const src = ["phone", "phone", "app", "web", "whatsapp"][Math.floor(Math.random() * 5)];
  const veh = Math.random() < 0.1 ? "mpv" : Math.random() < 0.05 ? "wav" : "saloon";
  createJob({ pickup: a, drop: b, customer: { name, phone }, source: src, vehicle: veh, passengers: 1 + Math.floor(Math.random() * 3), when: Math.random() < 0.12 ? Date.now() + (30 + Math.random() * 90) * 60000 : Date.now() });
}

// ---------- earnings ----------
export function taxYearStart(t = Date.now()) { const d = new Date(t); const y = d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6) ? d.getFullYear() : d.getFullYear() - 1; return new Date(y, 3, 6).getTime(); }
export function earnings(driverId, from, to = Date.now()) {
  const jobs = K.jobs.filter(j => j.driverId === driverId && j.status === "done" && j.doneAt >= from && j.doneAt <= to);
  const cash = jobs.filter(j => j.pay === "cash").reduce((a, j) => a + (j.fare || 0), 0);
  const card = jobs.filter(j => j.pay !== "cash").reduce((a, j) => a + (j.fare || 0), 0);
  const miles = jobs.reduce((a, j) => a + (j.miles || 0), 0);
  return { jobs, count: jobs.length, cash, card, total: cash + card, miles };
}
export { VEHICLES };
