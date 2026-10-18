// Dispatcher console and office: live map, job board, queues, phone bookings, drivers, rent, reports, settings.
import { APP, VEHICLES, STATUS, SOURCES, ZONES, DOCS, DEFAULT_SETTINGS, MOBILITY } from "../config.js";
import { renderAccounts, renderQuality, renderPlanner } from "./office.js";
import { hotSpots } from "../features/planner.js";
import { h, fill, icon, toast, store, modal, menu, stamp, fmtTime, relTime, confirmBox, isMobile, labelTables } from "../lib/dom.js";
import { posOf, etaMinutes, money, zoneOf, zoneName, routeMiles, driveMinutes, searchPlaces, quote } from "../lib/geo.js";
import { createMap } from "../lib/map.js";
import { alarm, ping } from "../lib/sound.js";
import { K, onChange, driversList, activeJobs, jobOfDriver, offerFor, nextJobOf, etaTo, queueOf, assign, cancel, createJob, carLabel, fits, sendMsg, resolveAlert, saveSettings, saveDriver, setRentPaid, weekKey, earnings, setStatus, logCall, setCall } from "../store.js";
import { DEMO_DRIVERS, driverDoc } from "../backend/seed.js";

export function mountDispatch(root) {
  let tab = store.get("dTab", "dispatch");
  let jobFilter = "waiting";
  let selJob = null, selDriver = null;
  let mobilePane = "jobs";
  root.classList.add("app-root");
  const shell = h("div", { class: "console" });
  fill(root, shell);
  const top = h("header", { class: "k-top" });
  const alertBar = h("div", { class: "k-alerts", hidden: true });
  const body = h("div", { class: "k-body" });
  const callBox = h("div", { class: "k-calls", "aria-live": "polite" });
  shell.append(top, alertBar, body, callBox);
  let map = null, mapBox = null, cols = null;
  const editing = () => { const a = document.activeElement; return a && body.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };

  // ---------- top bar ----------
  function renderTop() {
    const act = activeJobs();
    const waiting = act.filter(j => (j.status === "new" || j.status === "offered") && !isPrebook(j)).length;
    const free = driversList().filter(d => d.status === "free" && !jobOfDriver(d.id)).length;
    const busyN = driversList().filter(d => d.status === "busy").length;
    const t = (k, l, ic) => h("button", { type: "button", class: "k-tab" + (tab === k ? " on" : ""), onclick: () => { tab = k; store.set("dTab", k); render(); } }, icon(ic, 16), h("span", { text: l }));
    fill(top,
      h("div", { class: "k-brand" }, logoSvg(26), h("b", { text: APP.name }), h("span", { class: "dim", text: K.settings.firm })),
      h("nav", { class: "k-tabs" }, t("dispatch", "Dispatch", "mapPin"), t("drivers", "Drivers", "users"), t("accounts", "Accounts", "briefcase"), t("rent", "Rent", "wallet"), t("planner", "Planner", "calendar"), t("quality", "Quality", "star"), t("reports", "Reports", "chart"), t("settings", "Settings", "settings")),
      h("div", { class: "k-chips" },
        h("span", { class: "chip " + (waiting ? "warn" : ""), title: "Jobs waiting for a car" }, icon("clock", 14), waiting + " waiting"),
        h("span", { class: "chip ok", title: "Cars free" }, h("i", { class: "sdot free" }), free + " free"),
        h("span", { class: "chip", title: "Cars on jobs" }, h("i", { class: "sdot busy" }), busyN + " busy"),
        K.settings.boost > 1 ? h("span", { class: "chip warn", text: "×" + K.settings.boost + " " + (K.settings.boostLabel || "boost") }) : null,
        missedChip(),
        h("span", { class: "chip dim", title: K.engineLeader ? "This screen is running auto-dispatch" : "Another open screen is running auto-dispatch" }, h("i", { class: "sdot " + (K.settings.autoDispatch ? "free" : "off") }), K.settings.autoDispatch ? "Auto" : "Manual")),
      h("button", { type: "button", class: "btn primary", "aria-label": "New booking", onclick: () => newBooking() }, icon("plus", 16), h("span", { text: "New booking" })));
    const nav = top.querySelector(".k-tabs"), on = top.querySelector(".k-tab.on");
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2);
  }

  // ---------- incoming calls (caller ID) ----------
  const digits = p => String(p || "").replace(/\D/g, "");
  function whoIs(number) {
    const key = digits(number);
    const cust = K.customers[key];
    const acc = Object.entries(K.accounts).find(([, a]) => digits(a.phone) === key);
    const trips = K.jobs.filter(j => digits(j.customer && j.customer.phone) === key || digits(j.passenger && j.passenger.phone) === key).sort((a, b) => (b.when || 0) - (a.when || 0));
    const pairs = {}; for (const j of trips.slice(0, 30)) { const k = j.pickup.name + " → " + j.drop.name; pairs[k] = pairs[k] || { n: 0, j }; pairs[k].n++; }
    const usual = Object.values(pairs).sort((a, b) => b.n - a.n)[0];
    const live = trips.find(j => ["new", "offered", "accepted", "arrived", "pob"].includes(j.status));
    const issues = K.complaints.filter(c => digits(c.customer && c.customer.phone) === key && c.status === "open").length;
    const lost = K.lost.filter(x => digits(x.customer && x.customer.phone) === key && !["returned", "disposed"].includes(x.status));
    return { key, cust, acc: acc ? { id: acc[0], ...acc[1] } : null, trips, usual: usual && usual.n >= 2 ? usual.j : null, live, issues, lost, noshows: trips.filter(j => j.status === "noshow").length };
  }
  function renderCalls() {
    const seen = new Set();
    const ringing = K.calls.filter(c => c.status === "ringing" && Date.now() - c.at < 35000).sort((a, b) => b.at - a.at).filter(c => { const k = digits(c.number); if (seen.has(k)) return false; seen.add(k); return true; });
    fill(callBox, ringing.slice(0, shell.clientWidth < 640 ? 1 : 2).map(c => {
      const w = whoIs(c.number);
      const name = w.acc ? w.acc.name : w.cust ? w.cust.name : "Unknown caller";
      const places = (w.cust && w.cust.places) || [];
      const book = pre => { setCall(c, "answered"); newBooking(Object.assign({ phone: c.number, name: w.acc ? "" : w.cust ? w.cust.name : "", account: w.acc ? w.acc.id : "" }, pre)); };
      return h("div", { class: "callcard" },
        h("div", { class: "callcard-hd" }, h("span", { class: "ring" }, icon("phoneIn", 18)), h("div", { class: "grow" }, h("b", { text: name }), h("small", { class: "dim", text: c.number + " · " + (c.line || "Main line") + " · ringing" })), h("button", { type: "button", class: "ibtn sm", "aria-label": "Dismiss", onclick: () => setCall(c, "answered") }, icon("x", 14))),
        h("div", { class: "callcard-facts" },
          w.acc ? h("span", { class: "pill info", text: "Account" }) : null,
          w.trips.length ? h("span", { class: "dim", text: w.trips.length + " trips · last " + relTime(w.trips[0].when) }) : h("span", { class: "dim", text: w.acc ? "Account line" : "New customer" }),
          w.noshows ? h("span", { class: "pill warn", text: w.noshows + " no-show" + (w.noshows > 1 ? "s" : "") }) : null,
          w.issues ? h("span", { class: "pill bad", text: "Open complaint" }) : null,
          w.lost.length ? h("span", { class: "pill warn", text: "Lost: " + w.lost[0].item }) : null),
        w.live ? h("div", { class: "callcard-live" }, h("b", { text: "Live job: " }), w.live.pickup.name + " → " + w.live.drop.name + " · " + STATUS[w.live.status].label + (w.live.driverId && K.drivers[w.live.driverId] ? " · car " + K.drivers[w.live.driverId].call + ", " + (etaTo(K.drivers[w.live.driverId], w.live.pickup) || 0) + " min" : "")) : null,
        h("div", { class: "row-btns" },
          h("button", { type: "button", class: "btn sm primary", onclick: () => book({ pickup: (w.cust && w.cust.lastPickup && w.cust.lastPickup.x > 1100) ? w.cust.lastPickup : null }) }, "Book"),
          w.usual ? h("button", { type: "button", class: "btn sm", onclick: () => book({ pickup: w.usual.pickup, drop: w.usual.drop }) }, "Usual: " + w.usual.drop.name) : null,
          places.slice(0, 2).map(p => h("button", { type: "button", class: "btn sm", onclick: () => book({ pickup: p }) }, "From " + p.label)),
          w.live ? h("button", { type: "button", class: "btn sm", onclick: () => { setCall(c, "answered"); tab = "dispatch"; selJob = w.live.id; jobFilter = filterOf(w.live); render(); } }, "Show job") : null));
    }));
  }
  function missedChip() {
    const today = new Date().setHours(0, 0, 0, 0);
    const missed = K.calls.filter(c => c.status === "missed" && c.at >= today);
    if (!missed.length) return null;
    return h("button", { type: "button", class: "chip warn", title: "Missed calls today", onclick: e => menu(e.currentTarget, [
      h("div", { class: "menu-hd dim small", text: "Missed today" }),
      ...missed.slice(0, 8).map(c => { const w = whoIs(c.number); return h("div", { class: "menu-call" }, h("div", { class: "grow" }, h("b", { text: w.acc ? w.acc.name : w.cust ? w.cust.name : c.number }), h("small", { class: "dim", text: c.number + " · " + fmtTime(c.at) })), h("a", { class: "btn sm", href: "tel:" + digits(c.number), onclick: () => setCall(c, "called-back") }, icon("phone", 13), "Call back")); })]) }, icon("phoneIn", 14), missed.length + " missed");
  }

  function renderAlerts() {
    const open = K.alerts.filter(a => !a.resolved);
    alertBar.hidden = !open.length;
    fill(alertBar, open.map(a => {
      const d = K.drivers[a.driverId];
      return h("div", { class: "k-alert" }, icon("alert", 18), h("b", { text: "SOS from car " + (d ? d.call + " · " + d.name : "?") }), h("span", { class: "grow", text: relTime(a.at) + " · " + (d ? zoneName(zoneOf(posOf(d))) : "") }),
        h("button", { type: "button", class: "btn sm", onclick: () => { tab = "dispatch"; selDriver = a.driverId; render(); if (d && map) map.lookAt(posOf(d), 1500); } }, "Show on map"),
        d ? h("a", { class: "btn sm", href: "tel:" + d.phone.replace(/\s/g, "") }, icon("phone", 14), "Call") : null,
        h("button", { type: "button", class: "btn sm", onclick: () => resolveAlert(a) }, "Resolve"));
    }));
  }
  let alerted = new Set();

  // ---------- dispatch tab ----------
  const isPrebook = j => j.status === "new" && j.when > Date.now() + 10 * 60000;
  function buildDispatch() {
    mapBox = h("div", { class: "k-map" });
    const jobsCol = h("section", { class: "k-col jobs", "aria-label": "Jobs" });
    const driversCol = h("section", { class: "k-col drivers", "aria-label": "Drivers" });
    const mapCol = h("section", { class: "k-mapcol" }, mapBox,
      h("div", { class: "k-mapctl" },
        h("button", { type: "button", class: "ibtn", "aria-label": "Zoom in", onclick: () => map.zoom(0.8) }, icon("zoomIn", 18)),
        h("button", { type: "button", class: "ibtn", "aria-label": "Zoom out", onclick: () => map.zoom(1.25) }, icon("zoomOut", 18)),
        h("button", { type: "button", class: "ibtn", "aria-label": "Show whole map", onclick: () => map.fit() }, icon("target", 18)),
        h("button", { type: "button", class: "ibtn tilt", "aria-label": "Tilt map", title: "3D view", onclick: e => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); map.tilt(on); } }, h("span", { class: "tilt-t", text: "3D" })),
        h("button", { type: "button", class: "ibtn" + (heatOn ? " on" : ""), "aria-label": "Hot spots", title: "Hot spots: where jobs usually come from at this time", onclick: e => { heatOn = !heatOn; store.set("dHeat", heatOn); e.currentTarget.classList.toggle("on", heatOn); map.setHeat(heatOn ? hotSpots() : null); } }, icon("flame", 18))),
      h("div", { class: "k-legend" }, h("span", {}, h("i", { class: "sdot free" }), "Free"), h("span", {}, h("i", { class: "sdot offered" }), "Offered"), h("span", {}, h("i", { class: "sdot busy" }), "On job"), h("span", {}, h("i", { class: "sdot break" }), "Break"), h("span", {}, h("i", { class: "pin-key" }), "Waiting job")));
    const mtabs = h("div", { class: "k-mtabs" }, [["jobs", "Jobs"], ["map", "Map"], ["drivers", "Cars"]].map(([k, l]) => h("button", { type: "button", class: "seg-btn" + (mobilePane === k ? " on" : ""), onclick: e => { mobilePane = k; cols.dataset.pane = k; e.currentTarget.parentNode.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("on", b === e.currentTarget)); if (k === "map") setTimeout(() => map.fit(), 30); } }, l)));
    cols = h("div", { class: "k-dispatch", dataset: { pane: mobilePane } }, jobsCol, mapCol, driversCol);
    fill(body, mtabs, cols);
    map = createMap(mapBox, {
      onCarClick: id => { selDriver = id; selJob = null; renderCols(); },
      onPinClick: id => { selJob = id; jobFilter = filterOf(K.jobs.find(j => j.id === id)) || jobFilter; renderCols(); },
    });
    if (heatOn) map.setHeat(hotSpots());
  }
  let heatOn = store.get("dHeat", false);
  const filterOf = j => !j ? null : (j.status === "new" || j.status === "offered") ? (isPrebook(j) ? "booked" : "waiting") : ["accepted", "arrived", "pob"].includes(j.status) ? "live" : "done";

  function renderCols() {
    if (!cols) return;
    renderJobs(cols.children[0]);
    renderDrivers(cols.children[2]);
    updateMap();
  }
  function updateMap() {
    if (!map) return;
    map.update({ drivers: driversList(), jobs: activeJobs().filter(j => !isPrebook(j)), focus: selJob, selected: selDriver || (selJob && (K.jobs.find(j => j.id === selJob) || {}).driverId) });
  }

  function renderJobs(col) {
    const act = activeJobs();
    const lists = {
      waiting: act.filter(j => (j.status === "new" || j.status === "offered") && !isPrebook(j)).sort((a, b) => a.createdAt - b.createdAt),
      live: act.filter(j => ["accepted", "arrived", "pob"].includes(j.status)).sort((a, b) => a.acceptedAt - b.acceptedAt),
      booked: act.filter(isPrebook).sort((a, b) => a.when - b.when),
      done: K.jobs.filter(j => ["done", "cancelled", "noshow"].includes(j.status) && (j.doneAt || j.cancelledAt || j.createdAt) > Date.now() - 86400000).slice(0, 40),
    };
    const ft = (k, l) => h("button", { type: "button", class: "seg-btn" + (jobFilter === k ? " on" : ""), onclick: () => { jobFilter = k; renderJobs(col); } }, l, h("span", { class: "count", text: lists[k].length }));
    fill(col,
      h("div", { class: "k-colhd" }, h("div", { class: "seg" }, ft("waiting", "Waiting"), ft("live", "Live"), ft("booked", "Booked"), ft("done", "Done"))),
      h("div", { class: "k-list" }, lists[jobFilter].length ? lists[jobFilter].map(jobCard) : h("div", { class: "empty small" }, h("b", { text: { waiting: "No jobs waiting", live: "No live jobs", booked: "No pre-bookings", done: "Nothing finished in the last 24 hours" }[jobFilter] }), jobFilter === "waiting" ? h("span", { text: "New bookings from the app, phone and website land here." }) : null)));
  }

  function jobCard(j) {
    const d = j.driverId && K.drivers[j.driverId];
    const od = j.offer && K.drivers[j.offer.driverId];
    const waitMin = Math.floor((Date.now() - j.createdAt) / 60000);
    const late = (j.status === "new" || j.status === "offered") && !isPrebook(j) && waitMin >= 3;
    const sel = selJob === j.id;
    const card = h("div", { class: "jcard" + (sel ? " sel" : "") + (late ? " late" : ""), tabindex: "0" });
    card.addEventListener("click", e => { if (e.target.closest("button, a, select")) return; selJob = sel ? null : j.id; selDriver = null; renderCols(); if (!sel && map) map.lookAt(j.pickup, 2200); });
    card.append(
      h("div", { class: "jcard-hd" },
        h("span", { class: "jtime", text: isPrebook(j) ? new Date(j.when).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : j.status === "done" ? fmtTime(j.doneAt || j.createdAt) : "ASAP" }),
        h("span", { class: "src", title: SOURCES[j.source] || j.source }, icon(j.source === "phone" ? "phone" : j.source === "whatsapp" ? "whatsapp" : j.source === "web" ? "globe" : j.source === "rank" ? "taxi" : "mapPin", 13), SOURCES[j.source] || j.source),
        h("span", { class: "grow" }),
        late ? h("span", { class: "pill bad", text: "Waiting " + waitMin + "m" }) : h("span", { class: "pill " + STATUS[j.status].tone, text: j.status === "offered" && od ? "Offered to " + od.call : STATUS[j.status].label })),
      h("div", { class: "jroute" }, h("div", { class: "b-line" }, h("i", { class: "a" }), h("span", { text: j.pickup.name })), h("div", { class: "b-line" }, h("i", { class: "b" }), h("span", { text: j.drop.name }))),
      h("div", { class: "jmeta" }, h("span", { text: j.customer.name || "Customer" }), h("span", { class: "dim", text: VEHICLES[j.vehicle].label + " · " + j.passengers + " pax" }), h("b", { text: money(j.fare) + (j.pay ? " " + j.pay : "") }), d ? h("span", { class: "callchip", text: d.call }) : null));
    const acc = j.account && K.accounts[j.account];
    if (acc || j.passenger || j.stacked) card.append(h("div", { class: "jextra" },
      acc ? h("span", { class: "pill info", text: acc.name.split(" ").slice(0, 3).join(" ") + (j.ref ? " · " + j.ref : "") }) : null,
      j.source === "contract" ? h("span", { class: "pill", text: "Regular run" }) : null,
      j.passenger && j.passenger.name ? h("span", { class: "dim small", text: "For " + j.passenger.name }) : null,
      j.mobility && j.mobility !== "walks" ? h("span", { class: "pill warn", text: MOBILITY[j.mobility] }) : null,
      j.stacked && d && jobOfDriver(d.id) && jobOfDriver(d.id).id !== j.id ? h("span", { class: "pill", text: "Next for car " + d.call }) : null));
    if (j.notes) card.append(h("div", { class: "jnotes", text: "Note: " + j.notes }));
    if (j.status === "noshow" && j.noshow) { const n = j.noshow; card.append(h("div", { class: "jproof" + (n.waitedSecs < 300 || !n.called ? " weak" : "") }, icon(n.waitedSecs >= 300 && n.called ? "check" : "alert", 13), "Waited " + Math.floor(n.waitedSecs / 60) + ":" + String(n.waitedSecs % 60).padStart(2, "0") + " · " + (n.called ? "called the customer" : "didn't call") + " · " + (n.distM != null ? n.distM + " m from pick-up" : n.place || ""))); }
    if (sel && ["new", "offered", "accepted", "arrived"].includes(j.status)) card.append(assignBox(j));
    if (sel && j.status === "done" && j.rating) card.append(h("div", { class: "dim small", text: "Rated " + "★".repeat(j.rating) }));
    return card;
  }

  function assignBox(j) {
    const cands = driversList().filter(d => d.status === "free" && !jobOfDriver(d.id) && fits(d, j.vehicle) && d.id !== j.driverId)
      .map(d => ({ d, m: driveMinutes(posOf(d), j.pickup) })).sort((a, b) => a.m - b.m).slice(0, 8);
    const sel = h("select", { class: "input sm", "aria-label": "Choose a car" }, cands.length ? cands.map(({ d, m }) => h("option", { value: d.id, text: "Car " + d.call + " · " + d.name.split(" ")[0] + " · " + m + " min" })) : h("option", { value: "", text: "No suitable cars free" }));
    return h("div", { class: "jassign" },
      sel,
      h("button", { type: "button", class: "btn sm", disabled: !cands.length, onclick: () => { const d = K.drivers[sel.value]; if (d) assign(j, d, false).then(() => toast("Offered to car " + d.call + ".")); } }, "Offer"),
      h("button", { type: "button", class: "btn sm primary", disabled: !cands.length, title: "Give the job straight to this car", onclick: () => { const d = K.drivers[sel.value]; if (d) assign(j, d, true).then(() => toast("Assigned to car " + d.call + ".", "ok")); } }, "Assign"),
      j.customer.phone ? h("a", { class: "ibtn", href: "tel:" + j.customer.phone.replace(/\s/g, ""), "aria-label": "Call customer", title: "Call customer" }, icon("phone", 16)) : null,
      h("button", { type: "button", class: "ibtn bad", "aria-label": "Cancel job", title: "Cancel job", onclick: async () => { if (await confirmBox("Cancel this job?", j.pickup.name + " → " + j.drop.name, "Cancel job", true)) { cancel(j); selJob = null; } } }, icon("x", 16)));
  }

  function renderDrivers(col) {
    const all = driversList();
    const sd = selDriver && K.drivers[selDriver];
    const row = d => {
      const j = jobOfDriver(d.id), o = offerFor(d.id);
      const sub = j ? STATUS[j.status].label + " · " + (j.status === "pob" ? j.drop.name : j.pickup.name) : o ? "Offered: " + o.pickup.name : d.status === "break" ? "On break" : d.status === "off" ? "Offline" : zoneName(zoneOf(posOf(d)));
      return h("button", { type: "button", class: "drow" + (selDriver === d.id ? " sel" : ""), onclick: () => { selDriver = selDriver === d.id ? null : d.id; selJob = null; renderCols(); if (selDriver && map) map.lookAt(posOf(d), 1800); } },
        h("span", { class: "callchip " + (o ? "offered" : d.status) , text: d.call }), h("span", { class: "drow-txt" }, h("b", { text: d.name }), h("small", { class: "dim", text: sub })),
        j && j.status !== "arrived" ? h("span", { class: "dim small", text: (etaTo(d, j.status === "pob" ? j.drop : j.pickup) || 0) + "m" + (nextJobOf(d.id) ? " +1" : "") }) : null);
    };
    const queues = ZONES.map(z => ({ z, q: queueOf(z.id) }));
    fill(col,
      sd ? driverPanel(sd) : null,
      h("div", { class: "k-colhd" }, h("b", { text: "Zone queues" })),
      h("div", { class: "queues" }, queues.map(({ z, q }) => h("div", { class: "queue" }, h("span", { class: "qname", text: z.name }), h("div", { class: "qcars" }, q.length ? q.map(d => h("button", { type: "button", class: "callchip free", title: d.name, onclick: () => { selDriver = d.id; renderCols(); } }, d.call)) : h("span", { class: "dim small", text: "empty" }))))),
      h("div", { class: "k-colhd" }, h("b", { text: "Cars" }), h("span", { class: "dim small", text: all.filter(d => d.status !== "off").length + " on shift" })),
      h("div", { class: "k-list" }, ["busy", "free", "break", "off"].flatMap(s => all.filter(d => d.status === s).sort((a, b) => +a.call - +b.call)).map(row)));
  }

  function driverPanel(d) {
    const msgs = K.msgs.filter(m => m.driverId === d.id).slice(-6);
    const today = earnings(d.id, new Date().setHours(0, 0, 0, 0));
    const input = h("input", { class: "input sm", placeholder: "Message car " + d.call, maxlength: 300, id: "k-msg-" + d.id });
    const send = () => { const t = input.value.trim(); if (!t) return; input.value = ""; sendMsg(d.id, "dispatch", t); };
    input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
    return h("div", { class: "dpanel" },
      h("div", { class: "dpanel-hd" }, h("span", { class: "callchip big " + d.status, text: d.call }), h("div", { class: "grow" }, h("b", { text: d.name }), h("small", { class: "dim", text: carLabel(d) + " · " + d.car.reg })), h("button", { type: "button", class: "ibtn sm", "aria-label": "Close", onclick: () => { selDriver = null; renderCols(); } }, icon("x", 14))),
      h("div", { class: "dpanel-stats" }, h("span", {}, "Today ", h("b", { text: today.count + " jobs" })), h("span", {}, h("b", { text: money(today.total) })), h("span", {}, "★ ", h("b", { text: (d.rating || 5).toFixed(1) }))),
      h("div", { class: "row-btns" },
        h("a", { class: "btn sm", href: "tel:" + d.phone.replace(/\s/g, "") }, icon("phone", 14), "Call"),
        d.status !== "busy" ? h("button", { type: "button", class: "btn sm", onclick: () => setStatus(d, d.status === "free" ? "break" : "free") }, d.status === "free" ? "Put on break" : "Make available") : null),
      h("div", { class: "dchat" }, msgs.length ? msgs.map(m => h("div", { class: "c-msg " + (m.from === "dispatch" ? "me" : "bot") }, m.text, h("small", { text: fmtTime(m.at) }))) : h("p", { class: "dim small", text: "No messages yet." })),
      h("div", { class: "dchat-in" }, input, h("button", { type: "button", class: "btn sm primary", onclick: send }, "Send")));
  }

  // ---------- new booking (phone) ----------
  function newBooking(prefill = {}) {
    let pickup = prefill.pickup || null, drop = prefill.drop || null, vehicle = "saloon";
    const accSel = h("select", { class: "input", id: "nb-acc" }, h("option", { value: "", text: "No account (customer pays)" }), Object.entries(K.accounts).map(([id, a]) => { const o = h("option", { value: id, text: a.name }); if (id === prefill.account) o.selected = true; return o; }));
    const ref = h("input", { class: "input", id: "nb-ref", placeholder: "Reference", maxlength: 40 });
    const pName = h("input", { class: "input", id: "nb-pname", placeholder: "Passenger, if not the caller", autocomplete: "off" });
    const accRow = h("div", { class: "nb-grid" }, h("label", { class: "field", for: "nb-acc" }, h("span", { text: "Account" }), accSel), h("label", { class: "field", for: "nb-ref" }, h("span", { id: "nb-ref-l", text: "Reference" }), ref));
    const syncAcc = () => { const a = K.accounts[accSel.value]; ref.placeholder = a ? (a.refLabel || "Reference") + (a.requireRef ? " (required)" : "") : "Reference"; const l = accRow.querySelector("#nb-ref-l"); if (l) l.textContent = a ? a.refLabel || "Reference" : "Reference"; drawQ && drawQ(); };
    accSel.addEventListener("change", syncAcc);
    const phone = h("input", { class: "input", id: "nb-phone", placeholder: "Caller's number", inputmode: "tel", autocomplete: "off" });
    const name = h("input", { class: "input", id: "nb-name", placeholder: "Name", autocomplete: "off" });
    const pIn = h("input", { class: "input", id: "nb-pick", placeholder: "Pick-up address or place", autocomplete: "off" });
    const dIn = h("input", { class: "input", id: "nb-drop", placeholder: "Destination", autocomplete: "off" });
    const sugg = h("div", { class: "nb-sugg", hidden: true });
    const when = h("input", { class: "input", id: "nb-when", type: "datetime-local" });
    const pax = h("input", { class: "input", id: "nb-pax", type: "number", min: 1, max: 8, value: 1 });
    const notes = h("input", { class: "input", id: "nb-notes", placeholder: "Notes for the driver", maxlength: 120 });
    const vrow = h("div", { class: "opts" });
    const qbox = h("div", { class: "nb-quote" });
    const hint = h("small", { class: "dim", id: "nb-hint" });
    const drawV = () => fill(vrow, Object.entries(VEHICLES).map(([k, v]) => h("button", { type: "button", class: "opt" + (vehicle === k ? " on" : ""), onclick: () => { vehicle = k; drawV(); drawQ(); } }, v.label)));
    const drawQ = () => {
      if (!pickup || !drop) { fill(qbox, h("span", { class: "dim", text: "Add pick-up and destination to price the job." })); return; }
      const t = when.value ? new Date(when.value).getTime() : Date.now();
      const a = K.accounts[accSel.value];
      const tr = a ? Object.assign({}, K.settings, a.tariff || {}, { boost: 1 }, a.noNight ? { nightRate: 1 } : {}) : K.settings;
      const q = quote(pickup, drop, tr, vehicle, t);
      if (a) q.fare = Math.round(q.fare * (1 - (a.discount || 0) / 100) * 10) / 10;
      const eta = driversList().filter(d => d.status === "free" && fits(d, vehicle)).map(d => driveMinutes(posOf(d), pickup)).sort((a, b) => a - b)[0];
      fill(qbox, h("b", { text: money(q.fare) }), h("span", { class: "dim", text: q.miles + " mi · " + q.mins + " min trip" + (q.night ? " · night rate" : "") + (eta ? " · nearest car " + eta + " min" : " · no car free") }));
    };
    let field = null;
    const show = (input, f) => {
      field = f; sugg.hidden = false;
      const list = searchPlaces(input.value, 7);
      fill(sugg, list.map(p => h("button", { type: "button", class: "nb-item", onmousedown: e => { e.preventDefault(); set(p); } }, icon(p.kind === "street" ? "mapPin" : "star", 14), p.name)));
      const r = input.getBoundingClientRect(), pr = input.closest(".modal-body").getBoundingClientRect();
      sugg.style.top = (r.bottom - pr.top + input.closest(".modal-body").scrollTop + 4) + "px";
    };
    const set = p => { if (field === "pickup") { pickup = p; pIn.value = p.name; } else { drop = p; dIn.value = p.name; } sugg.hidden = true; drawQ(); (field === "pickup" ? dIn : notes).focus(); };
    pIn.addEventListener("input", () => show(pIn, "pickup")); pIn.addEventListener("focus", () => show(pIn, "pickup"));
    dIn.addEventListener("input", () => show(dIn, "drop")); dIn.addEventListener("focus", () => show(dIn, "drop"));
    [pIn, dIn].forEach(i => i.addEventListener("blur", () => setTimeout(() => sugg.hidden = true, 150)));
    [pIn, dIn].forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter" && !sugg.hidden) { e.preventDefault(); const first = sugg.querySelector(".nb-item"); if (first) first.dispatchEvent(new MouseEvent("mousedown")); } }));
    phone.addEventListener("input", () => {
      const key = phone.value.replace(/\D/g, "");
      const c = key.length >= 10 && K.customers[key];
      const acc = Object.entries(K.accounts).find(([, a]) => (a.phone || "").replace(/\D/g, "") === key);
      if (acc) { accSel.value = acc[0]; syncAcc(); hint.textContent = "Account: " + acc[1].name; }
      else if (c) { name.value = c.name; hint.textContent = "Returning customer" + ((c.places || []).length ? " · saved: " + c.places.map(p => p.label).join(", ") : ""); if (c.lastPickup && c.lastPickup.x > 1100 && !pickup) { pickup = c.lastPickup; pIn.value = c.lastPickup.name; drawQ(); } }
      else hint.textContent = key.length >= 10 ? "New customer" : "";
    });
    when.addEventListener("change", drawQ);
    if (prefill.phone) { phone.value = prefill.phone; phone.dispatchEvent(new Event("input")); }
    if (prefill.name && !name.value) name.value = prefill.name;
    if (pickup) pIn.value = pickup.name;
    if (drop) dIn.value = drop.name;
    if (prefill.account) syncAcc();
    drawV(); drawQ();
    const f = (id, l, el) => h("label", { class: "field", for: id }, h("span", { text: l }), el);
    const m = modal({
      title: "New booking", wide: false, className: "nb-modal",
      body: [h("div", { class: "nb-grid" }, f("nb-phone", "Phone", phone), f("nb-name", "Name", name)), hint,
        accRow,
        f("nb-pick", "Pick-up", pIn), f("nb-drop", "Destination", dIn), sugg, f("nb-pname", "Passenger", pName),
        h("div", { class: "field" }, h("span", { text: "Car" }), vrow),
        h("div", { class: "nb-grid" }, f("nb-when", "When (leave empty for ASAP)", when), f("nb-pax", "Passengers", pax)),
        f("nb-notes", "Notes", notes), qbox],
      actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!pickup || !drop) { toast("Add a pick-up and destination."); return; }
        const a = K.accounts[accSel.value];
        if (a && a.requireRef && !ref.value.trim()) { toast("This account needs a " + (a.refLabel || "reference") + "."); ref.focus(); return; }
        const t = when.value ? new Date(when.value).getTime() : Date.now();
        const id = await createJob({ pickup, drop, vehicle, passengers: +pax.value || 1, notes: notes.value.trim(), when: t, customer: { name: name.value.trim() || (a ? a.name : "Phone customer"), phone: phone.value.trim() }, passenger: pName.value.trim() ? { name: pName.value.trim(), phone: "" } : null, account: accSel.value, ref: ref.value.trim(), source: "phone" });
        if (id) { m.close(); toast("Booked. " + (t > Date.now() + 10 * 60000 ? "It's in Booked." : "Finding a car now."), "ok"); jobFilter = t > Date.now() + 10 * 60000 ? "booked" : "waiting"; selJob = id; renderCols(); }
      } }, "Book job")],
    });
    setTimeout(() => (prefill.phone ? pIn : phone).focus(), 30);
  }

  // ---------- office: drivers ----------
  function renderDriversTab() {
    const all = Object.values(K.drivers).sort((a, b) => +a.call - +b.call);
    const wk = weekKey();
    const weekStart = new Date(wk).getTime();
    const docState = d => { let worst = 99999; for (const k in DOCS) { const v = d.docs && d.docs[k]; if (!v) return -1; worst = Math.min(worst, Math.round((new Date(v) - Date.now()) / 86400000)); } return worst; };
    fill(body, h("div", { class: "office" },
      h("div", { class: "office-hd" }, h("h1", { text: "Drivers" }), h("span", { class: "dim", text: all.length + " drivers · self-employed" }), h("button", { type: "button", class: "btn primary", onclick: () => editDriver(null) }, icon("plus", 16), "Add driver")),
      h("div", { class: "tablewrap" }, h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, ["Car", "Driver", "Vehicle", "Status", "This week", "Rating", "Documents", "Rent", ""].map(t => h("th", { text: t })))),
        h("tbody", {}, all.map(d => {
          const e = earnings(d.id, weekStart);
          const ds = docState(d);
          const rent = K.rent.find(r => r.driverId === d.id && r.week === wk);
          return h("tr", { class: d.active === false ? "inactive" : "" },
            h("td", {}, h("span", { class: "callchip " + d.status, text: d.call })),
            h("td", {}, h("b", { text: d.name }), h("div", { class: "dim small", text: d.phone })),
            h("td", {}, carLabel(d), h("div", { class: "dim small" }, h("span", { class: "plate sm", text: d.car.reg }), " " + VEHICLES[d.car.type].label)),
            h("td", {}, h("span", { class: "pill " + ({ free: "ok", busy: "info", break: "warn", off: "dim" })[d.status], text: ({ free: "Available", busy: "On a job", break: "Break", off: "Offline" })[d.status] })),
            h("td", {}, h("b", { text: e.count + " jobs" }), h("div", { class: "dim small", text: money(e.total) })),
            h("td", { text: "★ " + (d.rating || 5).toFixed(1) }),
            h("td", {}, h("span", { class: "pill " + (ds < 0 ? "bad" : ds < 30 ? "warn" : "ok"), text: ds === -1 ? "Missing" : ds < 0 ? "Expired" : ds < 30 ? "Expiring" : "All valid" })),
            h("td", {}, h("span", { class: "pill " + (rent && rent.paid ? "ok" : "warn"), text: rent && rent.paid ? "Paid" : "Due " + money(d.rent) })),
            h("td", {}, h("button", { type: "button", class: "btn sm", onclick: () => editDriver(d) }, "Edit")));
        }))))));
  }

  function editDriver(d) {
    const isNew = !d;
    d = d || { call: String(Math.max(0, ...Object.values(K.drivers).map(x => +x.call || 0)) + 1), name: "", phone: "", car: { make: "", model: "", colour: "", reg: "", type: "saloon" }, status: "off", rent: 120, docs: {}, active: true, x: 380, y: 610 };
    const v = {};
    const inp = (k, l, val, type = "text") => { v[k] = h("input", { class: "input", id: "ed-" + k, value: val || "", type }); return h("label", { class: "field", for: "ed-" + k }, h("span", { text: l }), v[k]); };
    const typeSel = h("select", { class: "input", id: "ed-type" }, Object.entries(VEHICLES).map(([k, x]) => { const o = h("option", { value: k, text: x.label }); if (k === d.car.type) o.selected = true; return o; }));
    const active = h("input", { type: "checkbox", id: "ed-active", class: "tg" }); active.checked = d.active !== false;
    const m = modal({
      title: isNew ? "Add driver" : "Edit car " + d.call, wide: true,
      body: h("div", { class: "form" },
        h("div", { class: "nb-grid" }, inp("call", "Call sign", d.call), inp("name", "Full name", d.name), inp("phone", "Mobile", d.phone, "tel"), inp("rent", "Weekly rent (£)", d.rent, "number")),
        h("div", { class: "nb-grid" }, inp("make", "Make", d.car.make), inp("model", "Model", d.car.model), inp("colour", "Colour", d.car.colour), inp("reg", "Registration", d.car.reg), h("label", { class: "field", for: "ed-type" }, h("span", { text: "Type" }), typeSel)),
        h("div", { class: "lbl", text: "Document expiry dates" }),
        h("div", { class: "nb-grid" }, Object.entries(DOCS).map(([k, l]) => inp("doc_" + k, l, d.docs && d.docs[k], "date"))),
        h("label", { class: "toggle-row", for: "ed-active" }, h("span", { class: "grow" }, h("b", { text: "Active" }), h("small", { class: "dim", text: "Turn off to stop this driver signing in." })), active)),
      actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!v.name.value.trim() || !v.call.value.trim()) { toast("Add a call sign and name."); return; }
        const docs = {}; for (const k in DOCS) docs[k] = v["doc_" + k].value || null;
        const data = { call: v.call.value.trim(), name: v.name.value.trim(), phone: v.phone.value.trim(), rent: +v.rent.value || 0, car: { make: v.make.value.trim(), model: v.model.value.trim(), colour: v.colour.value.trim(), reg: v.reg.value.trim().toUpperCase(), type: typeSel.value }, docs, active: active.checked };
        const id = isNew ? "d" + K.api.newId() : d.id;
        await saveDriver(id, isNew ? Object.assign({ status: "off", x: 380, y: 610, move: null, queuedAt: Date.now(), sim: false, rating: 5, joinedAt: Date.now() }, data) : data);
        m.close(); toast(isNew ? "Driver added." : "Saved.", "ok");
      } }, "Save")],
    });
  }

  // ---------- office: rent ----------
  let rentWeekBack = 0;
  function renderRentTab() {
    const wk = weekKey(Date.now() - rentWeekBack * 7 * 86400000);
    const all = driversList().sort((a, b) => +a.call - +b.call);
    const wkStart = new Date(wk).getTime();
    const rows = all.map(d => ({ d, r: K.rent.find(x => x.driverId === d.id && x.week === wk), acc: earnings(d.id, wkStart, wkStart + 7 * 86400000).account }));
    const collected = rows.filter(x => x.r && x.r.paid).reduce((a, x) => a + x.r.amount, 0);
    const owed = rows.filter(x => !(x.r && x.r.paid)).reduce((a, x) => a + (x.r ? x.r.amount : x.d.rent || 0), 0);
    fill(body, h("div", { class: "office" },
      h("div", { class: "office-hd" }, h("h1", { text: "Weekly rent" }), h("div", { class: "seg" }, [[2, "2 weeks ago"], [1, "Last week"], [0, "This week"]].map(([n, l]) => h("button", { type: "button", class: "seg-btn" + (rentWeekBack === n ? " on" : ""), onclick: () => { rentWeekBack = n; renderRentTab(); } }, l)))),
      h("div", { class: "kpis" }, kpi("Week starting", new Date(wk).toLocaleDateString(undefined, { day: "numeric", month: "short" })), kpi("Collected", money(collected)), kpi("Outstanding", money(owed), owed ? "warn" : ""), kpi("Drivers paid", rows.filter(x => x.r && x.r.paid).length + " of " + rows.length)),
      h("p", { class: "note small", text: "Account work (NHS, council, hotels) is billed by the office, so it's paid to drivers. Balance = account work minus unpaid rent." }),

      h("div", { class: "tablewrap" }, h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, ["Car", "Driver", "Rent", "Account work", "Balance", "Status", ""].map(t => h("th", { text: t })))),
        h("tbody", {}, rows.map(({ d, r, acc }) => h("tr", {},
          h("td", {}, h("span", { class: "callchip " + d.status, text: d.call })), h("td", { text: d.name }),
          h("td", { text: money(r ? r.amount : d.rent) }),
          h("td", { class: acc ? "" : "dim", text: money(acc) }),
          h("td", {}, (() => { const bal = acc - (r && r.paid ? 0 : (r ? r.amount : d.rent || 0)); return h("span", { class: bal >= 0 ? "ok-t" : "", title: bal >= 0 ? "The firm owes the driver this after rent" : "The driver owes this after their account work", text: bal >= 0 ? "Pay driver " + money(bal) : "Driver owes " + money(-bal) }); })()),
          h("td", {}, h("span", { class: "pill " + (r && r.paid ? "ok" : "warn"), text: r && r.paid ? "Paid " + (r.paidAt ? new Date(r.paidAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "") : "Due" })),
          h("td", {}, h("button", { type: "button", class: "btn sm" + (r && r.paid ? "" : " primary"), onclick: () => setRentPaid(d.id, wk, r ? r.amount : d.rent || 0, !(r && r.paid)) }, r && r.paid ? "Undo" : "Mark paid")))))))));
  }
  const kpi = (l, v, tone = "") => h("div", { class: "kpi " + tone }, h("small", { text: l }), h("b", { text: v }));

  // ---------- office: reports ----------
  let repDays = 7;
  function renderReportsTab() {
    const from = Date.now() - repDays * 86400000;
    const jobs = K.jobs.filter(j => (j.createdAt || 0) >= from);
    const done = jobs.filter(j => j.status === "done");
    const takings = done.reduce((a, j) => a + (j.fare || 0), 0);
    const cash = done.filter(j => j.pay === "cash").length;
    const waits = done.filter(j => j.arrivedAt && j.createdAt).map(j => (j.arrivedAt - j.createdAt) / 60000);
    const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
    const lost = jobs.filter(j => j.status === "cancelled" || j.status === "noshow").length;
    const bySrc = {}; for (const j of jobs) bySrc[j.source] = (bySrc[j.source] || 0) + 1;
    const byHour = Array(24).fill(0); for (const j of jobs) byHour[new Date(j.when || j.createdAt).getHours()]++;
    const pickups = {}; for (const j of jobs) pickups[j.pickup.name] = (pickups[j.pickup.name] || 0) + 1;
    const top5 = Object.entries(pickups).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxH = Math.max(1, ...byHour), maxS = Math.max(1, ...Object.values(bySrc)), maxP = Math.max(1, ...top5.map(x => x[1]));
    const byDriver = driversList().map(d => ({ d, e: earnings(d.id, from) })).sort((a, b) => b.e.count - a.e.count);
    fill(body, h("div", { class: "office" },
      h("div", { class: "office-hd" }, h("h1", { text: "Reports" }), h("div", { class: "seg" }, [[1, "Today"], [7, "7 days"], [14, "14 days"]].map(([n, l]) => h("button", { type: "button", class: "seg-btn" + (repDays === n ? " on" : ""), onclick: () => { repDays = n; renderReportsTab(); } }, l)))),
      h("div", { class: "kpis" }, kpi("Jobs done", done.length), kpi("Driver takings", money(takings)), kpi("Average pick-up time", avgWait.toFixed(1) + " min"), kpi("Cash / card", done.length ? Math.round(cash / done.length * 100) + "% / " + (100 - Math.round(cash / done.length * 100)) + "%" : "–"), kpi("Cancelled or no-show", lost, lost ? "warn" : "")),
      h("div", { class: "rgrid" },
        h("div", { class: "rcard wide" }, h("b", { text: "Bookings by hour" }), h("div", { class: "hbars" }, byHour.map((n, i) => h("div", { class: "hbar", title: i + ":00 · " + n + " jobs" }, h("i", { style: { height: (n / maxH * 100) + "%" } }), h("small", { text: i % 3 === 0 ? String(i).padStart(2, "0") : "" }))))),
        h("div", { class: "rcard" }, h("b", { text: "Where bookings come from" }), Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([s, n]) => hrow(SOURCES[s] || s, n, maxS))),
        h("div", { class: "rcard" }, h("b", { text: "Busiest pick-ups" }), top5.map(([p, n]) => hrow(p, n, maxP))),
        h("div", { class: "rcard wide" }, h("b", { text: "Drivers" }), h("div", { class: "tablewrap" }, h("table", { class: "tbl compact" }, h("thead", {}, h("tr", {}, ["Car", "Driver", "Jobs", "Takings", "Cash", "Card"].map(t => h("th", { text: t })))),
          h("tbody", {}, byDriver.map(({ d, e }) => h("tr", {}, h("td", {}, h("span", { class: "callchip " + d.status, text: d.call })), h("td", { text: d.name }), h("td", { text: e.count }), h("td", { text: money(e.total) }), h("td", { text: money(e.cash) }), h("td", { text: money(e.card) }))))))))));
  }
  const hrow = (l, n, max) => h("div", { class: "hrow" }, h("span", { class: "ell", text: l }), h("div", { class: "hrow-bar" }, h("i", { style: { width: (n / max * 100) + "%" } })), h("b", { text: n }));

  // ---------- office: settings ----------
  function renderSettingsTab() {
    const s = K.settings;
    const v = {};
    const num = (k, l, step = "0.1") => { v[k] = h("input", { class: "input", id: "s-" + k, type: "number", step, value: s[k] }); return h("label", { class: "field", for: "s-" + k }, h("span", { text: l }), v[k]); };
    const tg = (k, l, hint) => { v[k] = h("input", { type: "checkbox", class: "tg", id: "s-" + k }); v[k].checked = !!s[k]; return h("label", { class: "toggle-row", for: "s-" + k }, h("span", { class: "grow" }, h("b", { text: l }), h("small", { class: "dim", text: hint })), v[k]); };
    v.firm = h("input", { class: "input", id: "s-firm", value: s.firm });
    v.boostLabel = h("input", { class: "input", id: "s-boostLabel", value: s.boostLabel || "", placeholder: "e.g. Illuminations" });
    v.officePhone = h("input", { class: "input", id: "s-officePhone", value: s.officePhone || "", inputmode: "tel" });
    const textLog = () => { const list = K.texts.slice(0, 8); return list.length ? h("div", { class: "textlog" }, list.map(t => h("div", { class: "textlog-row" }, h("div", { class: "grow" }, h("small", { class: "dim", text: (t.name || t.to) + " · " + t.to + " · " + relTime(t.at) + " · " + t.status }), h("p", { text: t.body }))))) : h("p", { class: "dim small", text: "No texts yet." }); };
    v.mode = h("select", { class: "input", id: "s-mode" }, [["queue", "Zone queue (first come, first served)"], ["nearest", "Nearest car"]].map(([k, l]) => { const o = h("option", { value: k, text: l }); if (s.mode === k) o.selected = true; return o; }));
    fill(body, h("div", { class: "office narrow" },
      h("div", { class: "office-hd" }, h("h1", { text: "Settings" })),
      h("div", { class: "form" },
        h("label", { class: "field", for: "s-firm" }, h("span", { text: "Firm name" }), v.firm),
        h("div", { class: "lbl", text: "Fares" }),
        h("div", { class: "nb-grid" }, num("flag", "Pick-up charge (£)"), num("perMile", "Per mile (£)"), num("minimum", "Minimum fare (£)", "0.5"), num("nightRate", "Night and Sunday rate (×)")),
        h("div", { class: "lbl", text: "Event boost" }),
        h("div", { class: "nb-grid" }, num("boost", "Boost (× fares, 1 = off)"), h("label", { class: "field", for: "s-boostLabel" }, h("span", { text: "Shown to customers as" }), v.boostLabel)),
        h("div", { class: "lbl", text: "Dispatch" }),
        tg("autoDispatch", "Auto-dispatch", "Offer jobs to cars automatically. Turn off to assign everything by hand."),
        h("label", { class: "field", for: "s-mode" }, h("span", { text: "How cars are picked" }), v.mode),
        tg("stacking", "Back-to-back jobs", "Offer the next job to a car that's about to drop off, if no car is free."),
        h("div", { class: "lbl", text: "Text messages" }),
        tg("texts", "Text customers", "Booking confirmation, car on the way with a live link, outside, and receipt."),
        h("div", { class: "svc" }, icon("sms", 18), h("div", { class: "grow" }, h("b", { text: s.smsProvider ? "Sending through " + s.smsProvider : "No SMS provider connected" }), h("small", { class: "dim", text: s.smsProvider ? "Texts go out as they happen." : "Texts are logged below so you can see them. Connect an SMS service (Twilio, Textlocal, Firetext) at launch to send them, about 3–4p a text." }))),
        textLog(),
        h("div", { class: "lbl", text: "Phone line" }),
        h("label", { class: "field", for: "s-officePhone" }, h("span", { text: "Office number (shown in texts)" }), v.officePhone),
        h("div", { class: "svc" }, icon("phoneIn", 18), h("div", { class: "grow" }, h("b", { text: s.phoneSystem ? "Connected to " + s.phoneSystem : "Caller ID not connected" }), h("small", { class: "dim", text: "When your phone system (Gamma, RingCentral, Twilio, 3CX) is connected, each incoming call pops up with the caller's history. Until then, try it here." })),
          h("button", { type: "button", class: "btn sm", onclick: () => { const ppl = Object.values(K.customers).filter(c => c.phone); const p = ppl[Math.floor(Math.random() * ppl.length)]; logCall(p ? p.phone : "07700 900999", { line: "Test call" }); } }, "Simulate a call")),
        h("div", { class: "lbl", text: "Demo" }),
        tg("demoDrivers", "Demo drivers", "Cars marked as demo accept jobs and drive themselves."),
        tg("autoBookings", "Fake bookings", "Create a random booking every 30 seconds or so."),
        K.api.mode === "demo" ? tg("demoCalls", "Fake phone calls", "Ring the office every couple of minutes so you can see caller ID.") : null,
        h("div", { class: "form-ft" },
          K.api.mode === "demo" ? h("button", { type: "button", class: "btn danger", onclick: async () => { if (await confirmBox("Reset the demo?", "This wipes all demo data and starts again.", "Reset", true)) K.api.resetDemo(); } }, "Reset demo") : h("button", { type: "button", class: "btn", onclick: addDemoDrivers }, "Add demo drivers"),
          h("button", { type: "button", class: "btn primary", onclick: () => saveSettings({ firm: v.firm.value.trim() || s.firm, flag: +v.flag.value, perMile: +v.perMile.value, minimum: +v.minimum.value, nightRate: +v.nightRate.value || 1, boost: Math.max(1, +v.boost.value || 1), boostLabel: v.boostLabel.value.trim(), autoDispatch: v.autoDispatch.checked, mode: v.mode.value, demoDrivers: v.demoDrivers.checked, autoBookings: v.autoBookings.checked, stacking: v.stacking.checked, texts: v.texts.checked, officePhone: v.officePhone.value.trim(), demoCalls: v.demoCalls ? v.demoCalls.checked : s.demoCalls }) }, "Save settings")))));
  }

  async function addDemoDrivers() {
    const now = Date.now();
    for (const d of DEMO_DRIVERS) if (!K.drivers[d.id]) await saveDriver(d.id, driverDoc(Object.assign({}, d, { sim: true }), now, true));
    toast("Added " + DEMO_DRIVERS.length + " demo drivers.", "ok");
  }

  // first run in live mode
  function renderSetup() {
    const firm = h("input", { class: "input big", id: "setup-firm", placeholder: "e.g. Seaside Cars", value: "" });
    fill(body, h("div", { class: "setup" },
      logoSvg(56), h("h1", { text: "Set up " + APP.name }),
      h("p", { class: "muted", text: "Name your firm and we'll add 10 demo drivers so you can see bookings flow straight away. You can remove them later." }),
      h("label", { class: "field", for: "setup-firm" }, h("span", { text: "Firm name" }), firm),
      h("button", { type: "button", class: "btn primary big", onclick: async () => {
        await K.api.set("settings/firm", Object.assign({}, DEFAULT_SETTINGS, { firm: firm.value.trim() || "My Cabs" }));
        await addDemoDrivers();
      } }, "Start")));
  }

  // ---------- render ----------
  function render() {
    renderTop(); renderAlerts();
    shell.dataset.tab = tab;
    if (K.api.mode === "live" && K.settingsLoaded && !K.hasFirm && K.ready && !Object.keys(K.drivers).length) { map && map.destroy(); map = null; cols = null; return renderSetup(); }
    if (tab === "dispatch") { if (!cols || !body.contains(cols)) buildDispatch(); renderCols(); return; }
    if (map) { map.destroy(); map = null; cols = null; }
    if (tab === "drivers") renderDriversTab();
    else if (tab === "rent") renderRentTab();
    else if (tab === "accounts") renderAccounts(body, render);
    else if (tab === "quality") renderQuality(body, render);
    else if (tab === "planner") renderPlanner(body, render);
    else if (tab === "reports") renderReportsTab();
    else renderSettingsTab();
    labelTables(body);
  }

  let callKey = "", lastOffice = 0;
  onChange(() => {
    renderTop(); renderAlerts();
    const ck = K.calls.filter(c => c.status === "ringing").map(c => c.id).join(",");
    if (ck !== callKey) { if (ck && ck.length > callKey.length) ping(); callKey = ck; renderCalls(); }
    for (const a of K.alerts) if (!a.resolved && !alerted.has(a.id) && Date.now() - a.at < 120000) { alerted.add(a.id); alarm(); }
    if (tab === "dispatch") { if (!cols) return render(); if (!editing()) renderCols(); else updateMap(); }
    else if (tab !== "settings" && !editing() && !document.querySelector("#layers .modal") && Date.now() - lastOffice > 1500) { lastOffice = Date.now(); render(); }
  });
  setInterval(() => { if (tab === "dispatch" && cols && !editing()) renderJobs(cols.children[0]); }, 15000);
  render();
}

function logoSvg(size) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 120 120"); s.setAttribute("width", size); s.setAttribute("height", size); s.innerHTML = '<use href="#logo"/>'; s.classList.add("logo"); return s; }
