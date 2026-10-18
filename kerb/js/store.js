// Shared state, live data and every job action. All three apps (customer, driver, dispatch) use this.
import { APP, DEFAULT_SETTINGS, VEHICLES } from "./config.js";
import { toast } from "./lib/dom.js";
import { posOf, makeMove, zoneOf, dist, quote, roughMinutes, randomSpot, etaMinutes, driveMinutes, money } from "./lib/geo.js";
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
  accounts: {},
  schedules: [],
  calls: [],
  complaints: [],
  lost: [],
  events: [],
  texts: [],
  invoices: {},
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
  api.watchCol("accounts", { limit: 200 }, rows => { K.accounts = {}; for (const r of rows) K.accounts[r.id] = r; changed(); });
  api.watchCol("schedules", { limit: 300 }, rows => { K.schedules = rows; changed(); });
  api.watchCol("calls", { orderBy: ["at", "desc"], limit: 60 }, rows => { K.calls = rows; changed(); });
  api.watchCol("complaints", { orderBy: ["at", "desc"], limit: 200 }, rows => { K.complaints = rows; changed(); });
  api.watchCol("lost", { orderBy: ["at", "desc"], limit: 200 }, rows => { K.lost = rows; changed(); });
  api.watchCol("events", { orderBy: ["start", "asc"], limit: 200 }, rows => { K.events = rows; changed(); });
  api.watchCol("texts", { orderBy: ["at", "desc"], limit: 120 }, rows => { K.texts = rows; changed(); });
  api.watchCol("invoices", { limit: 300 }, rows => { K.invoices = {}; for (const r of rows) K.invoices[r.id] = r; changed(); });
}

// ---------- helpers ----------
export const driversList = () => Object.values(K.drivers).filter(d => d.active !== false);
export const activeJobs = () => K.jobs.filter(j => ["new", "offered", "accepted", "arrived", "pob"].includes(j.status));
export const jobFor = id => K.jobs.find(j => j.id === id) || null;
// a car can hold its current job plus one "next job" accepted before drop-off
export function jobOfDriver(id) {
  const js = K.jobs.filter(j => j.driverId === id && ["accepted", "arrived", "pob"].includes(j.status));
  if (!js.length) return null;
  return js.find(j => j.status === "pob") || js.find(j => j.status === "arrived") || js.find(j => !j.stacked) || js[0];
}
export function nextJobOf(id) {
  const cur = jobOfDriver(id);
  return K.jobs.find(j => j.driverId === id && j.status === "accepted" && j.stacked && (!cur || j.id !== cur.id)) || null;
}
// minutes until a car reaches a place, using its route if it has one, or the road network if it's on GPS
export function etaTo(d, target) {
  if (!d) return null;
  if (d.move) return etaMinutes(d.move);
  return target ? driveMinutes(posOf(d), target) : 0;
}
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
  if (!free.length) return K.settings.stacking === false ? null : finishingSoon(job, exclude);
  if (K.settings.mode === "queue") {
    const zone = zoneOf(job.pickup);
    const q = free.filter(d => zoneOf(posOf(d)) === zone).sort((a, b) => (K.api.mode === "demo" ? (!a.sim ? 0 : 1) - (!b.sim ? 0 : 1) : 0) || (a.queuedAt || 0) - (b.queuedAt || 0));
    if (q.length) return q[0];
  }
  return free.sort((a, b) => dist(posOf(a), job.pickup) - dist(posOf(b), job.pickup))[0];
}
// cars about to drop off that could take this job next
function finishingSoon(job, exclude) {
  const c = driversList().filter(d => d.status === "busy" && !offerFor(d.id) && !nextJobOf(d.id) && fits(d, job.vehicle) && !exclude.includes(d.id))
    .map(d => { const j = jobOfDriver(d.id); if (!j || j.status !== "pob") return null; const left = etaTo(d, j.drop); return left <= 5 ? { d, m: left + roughMinutes(j.drop, job.pickup) } : null; })
    .filter(Boolean).sort((a, b) => a.m - b.m);
  return c.length && c[0].m <= 14 ? c[0].d : null;
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
  // optional extras: passenger (booking for someone else), account work (NHS, schools), contract runs
  for (const k of ["passenger", "ref", "mobility", "escorts", "appointment", "bookedBy", "scheduleId", "returnOf"]) if (o[k] != null && o[k] !== "") job[k] = o[k];
  const acc = o.account && K.accounts[o.account];
  if (acc) {
    job.pay = "account";
    if (!o.fare) { const t = Object.assign({}, K.settings, acc.tariff || {}, { boost: 1 }); if (acc.noNight) t.nightRate = 1; job.fare = Math.round(quote(o.pickup, o.drop, t, job.vehicle, job.when).fare * (1 - (acc.discount || 0) / 100) * 10) / 10; }
  }
  const id = await w(() => o.id ? K.api.set("jobs/" + o.id, job).then(() => o.id) : K.api.add("jobs", job), "book that");
  if (id && job.customer.phone && !acc) K.api.update("customers/" + job.customer.phone.replace(/\D/g, ""), { name: job.customer.name, phone: job.customer.phone, lastPickup: job.pickup }).catch(() => K.api.set("customers/" + job.customer.phone.replace(/\D/g, ""), { name: job.customer.name, phone: job.customer.phone, lastPickup: job.pickup }).catch(() => {}));
  if (id) text(Object.assign({ id }, job), "booked");
  return id;
}

// ---------- text messages ----------
// Every customer text goes into "texts". With an SMS provider connected a small server sends them;
// until then they're logged so the office can see exactly what customers would get.
export function shareLink(jobId) {
  const base = K.api && K.api.mode === "live" ? APP.liveUrl : location.href.split("#")[0];
  return base + "#t-" + jobId;
}
function textBody(j, kind) {
  const S = K.settings, d = j.driverId && K.drivers[j.driverId];
  const when = new Date(j.when).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const car = d ? carLabel(d) + " (" + d.car.reg + ")" : "";
  if (kind === "booked") return S.firm + ": booked " + j.pickup.name + " to " + j.drop.name + (j.prebook ? " for " + when : "") + ". " + (j.pay === "account" ? "Billed to your account." : "About " + money(j.fare) + ", pay the driver by cash or card.");
  if (kind === "accepted") return S.firm + ": car " + (d ? d.call : "") + ", a " + car + ", is " + (j.stacked ? "finishing a trip nearby and will come straight to you" : "on the way, about " + Math.max(1, etaTo(d, j.pickup) || 1) + " min") + ". Track it: " + shareLink(j.id);
  if (kind === "arrived") return S.firm + ": your taxi is outside. " + car + ".";
  if (kind === "noshow") return S.firm + ": your driver waited at " + j.pickup.name + " but couldn't find you. Call " + (S.officePhone || "the office") + " if you still need a car.";
  if (kind === "done") return "Thanks for travelling with " + S.firm + ". " + (j.pay === "account" ? "Billed to your account." : money(j.fare) + " paid by " + (j.pay === "cash" ? "cash" : "card") + ".");
  return "";
}
export function text(j, kind) {
  const S = K.settings;
  if (S.texts === false || !K.api || !K.api.canWrite) return;
  const tos = [];
  if (j.customer && j.customer.phone) tos.push({ phone: j.customer.phone, name: j.customer.name });
  if (j.passenger && j.passenger.phone && j.passenger.phone !== (j.customer || {}).phone) tos.push({ phone: j.passenger.phone, name: j.passenger.name });
  const body = textBody(j, kind);
  if (!body) return;
  for (const to of tos) K.api.add("texts", { to: to.phone, name: to.name || "", body, jobId: j.id, kind, at: Date.now(), status: S.smsProvider ? "queued" : "logged" }).catch(() => {});
}

export function offer(job, driverId) {
  return w(() => up("jobs/" + job.id, { status: "offered", offer: { driverId, until: Date.now() + APP.offerSeconds * 1000, at: Date.now() } }), "offer the job");
}

export async function accept(job, d) {
  const now = Date.now();
  const cur = jobOfDriver(d.id);
  const stacked = !!(cur && cur.id !== job.id);
  await w(async () => {
    await up("jobs/" + job.id, { status: "accepted", driverId: d.id, acceptedAt: now, offer: null, stacked });
    if (!stacked) await up("drivers/" + d.id, d.gps ? { status: "busy", move: null } : { status: "busy", move: makeMove(posOf(d, now), job.pickup, now) });
    text(Object.assign({}, job, { driverId: d.id, stacked }), "accepted");
  }, "accept the job");
}
// after a drop-off, send the car on to its next job if it has one
async function promoteNext(d, p, doneId) {
  const nx = K.jobs.find(j => j.id !== doneId && j.driverId === d.id && j.status === "accepted");
  if (!nx) return false;
  const now = Date.now();
  await up("jobs/" + nx.id, { stacked: false, startedAt: now });
  await up("drivers/" + d.id, { status: "busy", x: Math.round(p.x), y: Math.round(p.y), move: d.gps ? null : makeMove(p, nx.pickup, now), queuedAt: now });
  return true;
}

export function decline(job, driverId) {
  return w(() => up("jobs/" + job.id, { status: "new", offer: null, declined: [...new Set([...(job.declined || []), driverId])] }), "decline");
}

export function arrive(job) { return w(async () => { await up("jobs/" + job.id, { status: "arrived", arrivedAt: Date.now() }); text(job, "arrived"); }, "mark arrived"); }
export function markCalled(job) { return up("jobs/" + job.id, { calledAt: Date.now() }).catch(() => {}); }

export async function pob(job, d) {
  const now = Date.now();
  await w(async () => {
    await up("jobs/" + job.id, { status: "pob", pobAt: now });
    if (!d.gps) await up("drivers/" + d.id, { move: makeMove(posOf(d, now), job.drop, now) });
  }, "start the trip");
}

export async function complete(job, d, fare, pay) {
  const now = Date.now();
  const p = posOf(d, now);
  await w(async () => {
    await up("jobs/" + job.id, { status: "done", doneAt: now, fare: Math.round(fare * 100) / 100, pay });
    if (!(await promoteNext(d, p, job.id))) await up("drivers/" + d.id, { status: "free", x: Math.round(p.x), y: Math.round(p.y), move: null, queuedAt: now });
    text(Object.assign({}, job, { fare, pay }), "done");
  }, "complete the job");
}

export async function cancel(job, why = "cancelled", proof = null) {
  await w(async () => {
    const patch = { status: why, cancelledAt: Date.now(), offer: null };
    if (proof) patch.noshow = proof;
    await up("jobs/" + job.id, patch);
    const d = job.driverId && K.drivers[job.driverId];
    // a stacked "next job" being cancelled doesn't affect the car's current trip
    if (d && !(job.stacked && jobOfDriver(d.id) && jobOfDriver(d.id).id !== job.id)) {
      const p = posOf(d);
      if (!(await promoteNext(d, p, job.id))) await up("drivers/" + d.id, { status: "free", x: Math.round(p.x), y: Math.round(p.y), move: null, queuedAt: Date.now() });
    }
    if (why === "noshow") text(job, "noshow");
  }, "cancel the job");
}

export function rate(job, stars) { return w(() => up("jobs/" + job.id, { rating: stars }), "save your rating"); }

export async function setStatus(d, status) {
  const p = posOf(d);
  if (status === "off" && d.gps) await up("drivers/" + d.id, { gps: false }).catch(() => {});
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

// accounts, contracts, calls, complaints, lost property, events
export function saveAccount(id, data) { return w(async () => { if (id && K.accounts[id]) await up("accounts/" + id, data); else { id = id || "a" + K.api.newId(); await K.api.set("accounts/" + id, data); } return id; }, "save the account"); }
export function saveSchedule(id, data) { return w(async () => { if (id) await up("schedules/" + id, data); else id = await K.api.add("schedules", Object.assign({ createdAt: Date.now(), active: true }, data)); return id; }, "save the contract run"); }
export function delSchedule(id) { return w(() => K.api.del("schedules/" + id), "delete the contract run"); }
export function markInvoiced(accId, month, total, count) { return w(() => K.api.set("invoices/" + accId + "__" + month, { account: accId, month, total, count, at: Date.now() }), "mark it invoiced"); }
export function logCall(number, extra = {}) { return w(() => K.api.add("calls", Object.assign({ number, at: Date.now(), status: "ringing" }, extra)), "log the call"); }
export function setCall(c, status) { return w(() => up("calls/" + c.id, { status, handledAt: Date.now() }), "update the call"); }
export function addComplaint(c) { return w(() => K.api.add("complaints", Object.assign({ at: Date.now(), status: "open" }, c)), "send that"); }
export function resolveComplaint(c, note) { return w(() => up("complaints/" + c.id, { status: "resolved", note: note || "", resolvedAt: Date.now() }), "resolve the complaint"); }
export function addLost(x) { return w(() => K.api.add("lost", Object.assign({ at: Date.now(), status: "reported" }, x)), "log the item"); }
export function setLost(x, patch) { return w(() => up("lost/" + x.id, patch), "update the item"); }
export function saveEvent(id, data) { return w(async () => { if (id) await up("events/" + id, data); else await K.api.add("events", data); }, "save the event"); }
export function delEvent(id) { return w(() => K.api.del("events/" + id), "delete the event"); }
export function savePlaces(phone, places) { const key = String(phone || "").replace(/\D/g, ""); if (!key) return; return K.api.update("customers/" + key, { places }).catch(() => K.api.set("customers/" + key, { phone, places }).catch(() => {})); }
export function broadcast(text) { return w(async () => { for (const d of driversList()) if (d.status !== "off" || !d.sim) await K.api.add("msgs", { driverId: d.id, from: "dispatch", text: String(text).slice(0, 500), at: Date.now() }); }, "message the drivers"); }

// ---------- dispatch engine ----------
// Runs in one open page at a time (a lease), assigns jobs, expires offers, and drives demo cars.
// In production this belongs on a server; here any open page can take the job.
const holder = Math.random().toString(36).slice(2);
let leader = false, lastLease = 0, lastBooking = Date.now() - 14000, inflight = new Map();
const busy = (key, ms = 4000) => { const t = inflight.get(key); if (t && Date.now() - t < ms) return true; inflight.set(key, Date.now()); return false; };

export function startEngine() {
  setInterval(tick, 1000);
}
let lastSched = 0, lastCall = Date.now() - 45000;
const dateKey = t => { const d = new Date(t); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); };
const atTime = (day, hhmm) => { const [hh, mm] = String(hhmm || "09:00").split(":").map(Number); const d = new Date(day); d.setHours(hh || 0, mm || 0, 0, 0); return d.getTime(); };
// contract runs (school runs, NHS dialysis, care homes): book each day's jobs up to 36 hours ahead
async function runSchedules(now) {
  for (const s of K.schedules) {
    if (!s.active) continue;
    for (let off = 0; off <= 1; off++) {
      const day = new Date(now + off * 86400000);
      const dk = dateKey(day);
      if (!(s.days || []).includes(day.getDay()) || (s.from && dk < s.from.replace(/-/g, "")) || (s.to && dk > s.to.replace(/-/g, "")) || (s.skip || []).includes(dk)) continue;
      const legs = [[s.time, s.pickup, s.drop, ""], s.returnTime ? [s.returnTime, s.drop, s.pickup, "r"] : null].filter(Boolean);
      for (const [tm, a, b, sfx] of legs) {
        const when = atTime(day, tm), id = "s" + s.id + dk + sfx;
        if (when < now + 5 * 60000 || when > now + 36 * 3600000 || K.jobs.some(j => j.id === id) || busy("sch" + id, 600000)) continue;
        if (await K.api.getDoc("jobs/" + id)) continue;
        await createJob({ id, pickup: a, drop: b, when, vehicle: s.vehicle || "saloon", passengers: s.passengers || 1, customer: s.customer || { name: "Contract", phone: "" }, passenger: s.passenger, account: s.account || "", ref: s.ref, mobility: s.mobility, escorts: s.escorts, notes: s.notes || "", source: "contract", scheduleId: s.id });
      }
    }
  }
}
// demo only: pretend calls ring into the office now and then
function demoCall(now) {
  const people = Object.values(K.customers).filter(c => c.phone);
  const accs = Object.values(K.accounts).filter(a => a.phone);
  const pick = Math.random() < 0.2 && accs.length ? accs[Math.floor(Math.random() * accs.length)].phone : Math.random() < 0.8 && people.length ? people[Math.floor(Math.random() * people.length)].phone : "07" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0").replace(/^(\d{3})(\d{6})$/, "$1 $2");
  logCall(pick, { line: "Main line", demo: true });
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

  if (now - lastSched > 30000) { lastSched = now; runSchedules(now).catch(e => console.warn(e)); }
  // calls nobody picked up within 30s are missed
  for (const c of K.calls) if (c.status === "ringing" && now - c.at > 30000 && !busy("miss" + c.id, 10000)) setCall(c, "missed");
  if (K.api.mode === "demo" && S.demoCalls && S.autoBookings && now - lastCall > 70000 + Math.random() * 50000) { lastCall = now; demoCall(now); }

  if (S.demoDrivers) {
    for (const d of driversList()) {
      if (!d.sim) continue;
      const j = jobOfDriver(d.id);
      const o = offerFor(d.id);
      if (o && now - (o.offer.at || 0) > 2500 && !busy("acc" + o.id)) { if (Math.random() < 0.9) accept(o, d); else decline(o, d.id); continue; }
      if (!j) {
        if (d.status === "busy" && !nextJobOf(d.id) && !busy("fix" + d.id)) setStatus(d, "free");
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
  const sum = f => jobs.filter(f).reduce((a, j) => a + (j.fare || 0), 0);
  const cash = sum(j => j.pay === "cash"), account = sum(j => j.pay === "account"), card = sum(j => j.pay !== "cash" && j.pay !== "account");
  const miles = jobs.reduce((a, j) => a + (j.miles || 0), 0);
  return { jobs, count: jobs.length, cash, card, account, total: cash + card + account, miles };
}
export { VEHICLES };
