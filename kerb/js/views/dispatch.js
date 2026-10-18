// Dispatcher console and office: live map, job board, queues, phone bookings, drivers, rent, reports, settings.
import { APP, VEHICLES, STATUS, SOURCES, ZONES, DOCS, DEFAULT_SETTINGS } from "../config.js";
import { h, fill, icon, toast, store, modal, menu, stamp, fmtTime, relTime, confirmBox, isMobile } from "../lib/dom.js";
import { posOf, etaMinutes, money, zoneOf, zoneName, routeMiles, driveMinutes, searchPlaces, quote } from "../lib/geo.js";
import { createMap } from "../lib/map.js";
import { alarm, ping } from "../lib/sound.js";
import { K, onChange, driversList, activeJobs, jobOfDriver, offerFor, queueOf, assign, cancel, createJob, carLabel, fits, sendMsg, resolveAlert, saveSettings, saveDriver, setRentPaid, weekKey, earnings, setStatus } from "../store.js";
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
  shell.append(top, alertBar, body);
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
      h("nav", { class: "k-tabs" }, t("dispatch", "Dispatch", "mapPin"), t("drivers", "Drivers", "users"), t("rent", "Rent", "wallet"), t("reports", "Reports", "chart"), t("settings", "Settings", "settings")),
      h("div", { class: "k-chips" },
        h("span", { class: "chip " + (waiting ? "warn" : ""), title: "Jobs waiting for a car" }, icon("clock", 14), waiting + " waiting"),
        h("span", { class: "chip ok", title: "Cars free" }, h("i", { class: "sdot free" }), free + " free"),
        h("span", { class: "chip", title: "Cars on jobs" }, h("i", { class: "sdot busy" }), busyN + " busy"),
        K.settings.boost > 1 ? h("span", { class: "chip warn", text: "×" + K.settings.boost + " " + (K.settings.boostLabel || "boost") }) : null,
        h("span", { class: "chip dim", title: K.engineLeader ? "This screen is running auto-dispatch" : "Another open screen is running auto-dispatch" }, h("i", { class: "sdot " + (K.settings.autoDispatch ? "free" : "off") }), K.settings.autoDispatch ? "Auto" : "Manual")),
      h("button", { type: "button", class: "btn primary", onclick: () => newBooking() }, icon("plus", 16), h("span", { text: "New booking" })));
  }

  function renderAlerts() {
    const open = K.alerts.filter(a => !a.resolved);
    alertBar.hidden = !open.length;
    fill(alertBar, open.map(a => {
      const d = K.drivers[a.driverId];
      return h("div", { class: "k-alert" }, icon("alert", 18), h("b", { text: "SOS from car " + (d ? d.call + " · " + d.name : "?") }), h("span", { class: "grow", text: relTime(a.at) + " · " + (d ? zoneName(zoneOf(posOf(d))) : "") }),
        h("button", { type: "button", class: "btn sm", onclick: () => { tab = "dispatch"; selDriver = a.driverId; render(); if (d && map) map.lookAt(posOf(d), 380); } }, "Show on map"),
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
        h("button", { type: "button", class: "ibtn", "aria-label": "Show whole map", onclick: () => map.fit() }, icon("target", 18))),
      h("div", { class: "k-legend" }, h("span", {}, h("i", { class: "sdot free" }), "Free"), h("span", {}, h("i", { class: "sdot offered" }), "Offered"), h("span", {}, h("i", { class: "sdot busy" }), "On job"), h("span", {}, h("i", { class: "sdot break" }), "Break"), h("span", {}, h("i", { class: "pin-key" }), "Waiting job")));
    const mtabs = h("div", { class: "k-mtabs" }, [["jobs", "Jobs"], ["map", "Map"], ["drivers", "Cars"]].map(([k, l]) => h("button", { type: "button", class: "seg-btn" + (mobilePane === k ? " on" : ""), onclick: e => { mobilePane = k; cols.dataset.pane = k; e.currentTarget.parentNode.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("on", b === e.currentTarget)); if (k === "map") setTimeout(() => map.fit(), 30); } }, l)));
    cols = h("div", { class: "k-dispatch", dataset: { pane: mobilePane } }, jobsCol, mapCol, driversCol);
    fill(body, mtabs, cols);
    map = createMap(mapBox, {
      onCarClick: id => { selDriver = id; selJob = null; renderCols(); },
      onPinClick: id => { selJob = id; jobFilter = filterOf(K.jobs.find(j => j.id === id)) || jobFilter; renderCols(); },
    });
  }
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
    card.addEventListener("click", e => { if (e.target.closest("button, a, select")) return; selJob = sel ? null : j.id; selDriver = null; renderCols(); if (!sel && map) map.lookAt(j.pickup, 520); });
    card.append(
      h("div", { class: "jcard-hd" },
        h("span", { class: "jtime", text: isPrebook(j) ? new Date(j.when).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : j.status === "done" ? fmtTime(j.doneAt || j.createdAt) : "ASAP" }),
        h("span", { class: "src", title: SOURCES[j.source] || j.source }, icon(j.source === "phone" ? "phone" : j.source === "whatsapp" ? "whatsapp" : j.source === "web" ? "globe" : j.source === "rank" ? "taxi" : "mapPin", 13), SOURCES[j.source] || j.source),
        h("span", { class: "grow" }),
        late ? h("span", { class: "pill bad", text: "Waiting " + waitMin + "m" }) : h("span", { class: "pill " + STATUS[j.status].tone, text: j.status === "offered" && od ? "Offered to " + od.call : STATUS[j.status].label })),
      h("div", { class: "jroute" }, h("div", { class: "b-line" }, h("i", { class: "a" }), h("span", { text: j.pickup.name })), h("div", { class: "b-line" }, h("i", { class: "b" }), h("span", { text: j.drop.name }))),
      h("div", { class: "jmeta" }, h("span", { text: j.customer.name || "Customer" }), h("span", { class: "dim", text: VEHICLES[j.vehicle].label + " · " + j.passengers + " pax" }), h("b", { text: money(j.fare) + (j.pay ? " " + j.pay : "") }), d ? h("span", { class: "callchip", text: d.call }) : null));
    if (j.notes) card.append(h("div", { class: "jnotes", text: "📝 " + j.notes }));
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
      return h("button", { type: "button", class: "drow" + (selDriver === d.id ? " sel" : ""), onclick: () => { selDriver = selDriver === d.id ? null : d.id; selJob = null; renderCols(); if (selDriver && map) map.lookAt(posOf(d), 420); } },
        h("span", { class: "callchip " + (o ? "offered" : d.status) , text: d.call }), h("span", { class: "drow-txt" }, h("b", { text: d.name }), h("small", { class: "dim", text: sub })),
        j && j.status !== "arrived" ? h("span", { class: "dim small", text: etaMinutes(d.move) + "m" }) : null);
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
    let pickup = prefill.pickup || null, drop = null, vehicle = "saloon";
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
    const drawV = () => fill(vrow, Object.entries(VEHICLES).map(([k, v]) => h("button", { type: "button", class: "opt" + (vehicle === k ? " on" : ""), onclick: () => { vehicle = k; drawV(); drawQ(); } }, v.icon + " " + v.label)));
    const drawQ = () => {
      if (!pickup || !drop) { fill(qbox, h("span", { class: "dim", text: "Add pick-up and destination to price the job." })); return; }
      const t = when.value ? new Date(when.value).getTime() : Date.now();
      const q = quote(pickup, drop, K.settings, vehicle, t);
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
      if (c) { name.value = c.name; hint.textContent = "Returning customer"; if (c.lastPickup && !pickup) { pickup = c.lastPickup; pIn.value = c.lastPickup.name; drawQ(); } }
      else hint.textContent = key.length >= 10 ? "New customer" : "";
    });
    when.addEventListener("change", drawQ);
    drawV(); drawQ();
    const f = (id, l, el) => h("label", { class: "field", for: id }, h("span", { text: l }), el);
    const m = modal({
      title: "New booking", wide: false, className: "nb-modal",
      body: [h("div", { class: "nb-grid" }, f("nb-phone", "Phone", phone), f("nb-name", "Name", name)), hint,
        f("nb-pick", "Pick-up", pIn), f("nb-drop", "Destination", dIn), sugg,
        h("div", { class: "field" }, h("span", { text: "Car" }), vrow),
        h("div", { class: "nb-grid" }, f("nb-when", "When (leave empty for ASAP)", when), f("nb-pax", "Passengers", pax)),
        f("nb-notes", "Notes", notes), qbox],
      actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!pickup || !drop) { toast("Add a pick-up and destination."); return; }
        const t = when.value ? new Date(when.value).getTime() : Date.now();
        const id = await createJob({ pickup, drop, vehicle, passengers: +pax.value || 1, notes: notes.value.trim(), when: t, customer: { name: name.value.trim() || "Phone customer", phone: phone.value.trim() }, source: "phone" });
        if (id) { m.close(); toast("Booked. " + (t > Date.now() + 10 * 60000 ? "It's in Booked." : "Finding a car now."), "ok"); jobFilter = t > Date.now() + 10 * 60000 ? "booked" : "waiting"; selJob = id; renderCols(); }
      } }, "Book job")],
    });
    setTimeout(() => phone.focus(), 30);
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
    const rows = all.map(d => ({ d, r: K.rent.find(x => x.driverId === d.id && x.week === wk) }));
    const collected = rows.filter(x => x.r && x.r.paid).reduce((a, x) => a + x.r.amount, 0);
    const owed = rows.filter(x => !(x.r && x.r.paid)).reduce((a, x) => a + (x.r ? x.r.amount : x.d.rent || 0), 0);
    fill(body, h("div", { class: "office" },
      h("div", { class: "office-hd" }, h("h1", { text: "Weekly rent" }), h("div", { class: "seg" }, [[2, "2 weeks ago"], [1, "Last week"], [0, "This week"]].map(([n, l]) => h("button", { type: "button", class: "seg-btn" + (rentWeekBack === n ? " on" : ""), onclick: () => { rentWeekBack = n; renderRentTab(); } }, l)))),
      h("div", { class: "kpis" }, kpi("Week starting", new Date(wk).toLocaleDateString(undefined, { day: "numeric", month: "short" })), kpi("Collected", money(collected)), kpi("Outstanding", money(owed), owed ? "warn" : ""), kpi("Drivers paid", rows.filter(x => x.r && x.r.paid).length + " of " + rows.length)),
      h("div", { class: "tablewrap" }, h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, ["Car", "Driver", "Amount", "Status", ""].map(t => h("th", { text: t })))),
        h("tbody", {}, rows.map(({ d, r }) => h("tr", {},
          h("td", {}, h("span", { class: "callchip " + d.status, text: d.call })), h("td", { text: d.name }),
          h("td", { text: money(r ? r.amount : d.rent) }),
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
        h("div", { class: "lbl", text: "Demo" }),
        tg("demoDrivers", "Demo drivers", "Cars marked as demo accept jobs and drive themselves."),
        tg("autoBookings", "Fake bookings", "Create a random booking every 30 seconds or so."),
        h("div", { class: "form-ft" },
          K.api.mode === "demo" ? h("button", { type: "button", class: "btn danger", onclick: async () => { if (await confirmBox("Reset the demo?", "This wipes all demo data and starts again.", "Reset", true)) K.api.resetDemo(); } }, "Reset demo") : h("button", { type: "button", class: "btn", onclick: addDemoDrivers }, "Add demo drivers"),
          h("button", { type: "button", class: "btn primary", onclick: () => saveSettings({ firm: v.firm.value.trim() || s.firm, flag: +v.flag.value, perMile: +v.perMile.value, minimum: +v.minimum.value, nightRate: +v.nightRate.value || 1, boost: Math.max(1, +v.boost.value || 1), boostLabel: v.boostLabel.value.trim(), autoDispatch: v.autoDispatch.checked, mode: v.mode.value, demoDrivers: v.demoDrivers.checked, autoBookings: v.autoBookings.checked }) }, "Save settings")))));
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
    else if (tab === "reports") renderReportsTab();
    else renderSettingsTab();
  }

  onChange(() => {
    renderTop(); renderAlerts();
    for (const a of K.alerts) if (!a.resolved && !alerted.has(a.id) && Date.now() - a.at < 120000) { alerted.add(a.id); alarm(); }
    if (tab === "dispatch") { if (!cols) return render(); if (!editing()) renderCols(); else updateMap(); }
    else if (tab !== "settings" && !editing() && !document.querySelector("#layers .modal")) render();
  });
  setInterval(() => { if (tab === "dispatch" && cols && !editing()) renderJobs(cols.children[0]); }, 15000);
  render();
}

function logoSvg(size) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 120 120"); s.setAttribute("width", size); s.setAttribute("height", size); s.innerHTML = '<use href="#logo"/>'; s.classList.add("logo"); return s; }
