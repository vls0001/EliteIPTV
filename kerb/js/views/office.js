// Office screens: account customers and their regular runs, quality (ratings, complaints, lost property), and the busy-night planner.
import { ACCOUNT_KINDS, MOBILITY, COMPLAINT_KINDS, LOST_STATUS, VEHICLES, STATUS } from "../config.js";
import { h, fill, icon, toast, modal, stamp, fmtTime, relTime, confirmBox, promptBox, copyText } from "../lib/dom.js";
import { searchPlaces, money, landmark } from "../lib/geo.js";
import { MAP } from "../lib/mapdata.js";
import { K, driversList, saveAccount, saveSchedule, delSchedule, markInvoiced, addComplaint, resolveComplaint, setLost, addLost, sendMsg, saveEvent, delEvent, broadcast, saveSettings, shareLink } from "../store.js";
import { forecastDay, eventsBetween, JOBS_PER_CAR_HOUR } from "../features/planner.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const kpi = (l, v, tone = "") => h("div", { class: "kpi " + tone }, h("small", { text: l }), h("b", { text: v }));
const monthKey = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const monthStart = (back = 0) => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - back); return d.getTime(); };
const findNamed = n => landmark(n) || (p => p ? { name: p.name, x: p.x, y: p.y } : null)(MAP.places.find(x => x.name === n));
const appUrl = hash => (K.api.mode === "live" ? "https://claude.ai/artifact/KzXimsPWuop1ca4mtLKLNR" : location.href.split("#")[0]) + "#" + hash;
const opt = (v, l, cur) => { const o = h("option", { value: v, text: l }); if (String(v) === String(cur)) o.selected = true; return o; };

// a text field with address suggestions underneath
function placeField(id, label, cur, onPick) {
  const input = h("input", { class: "input", id, value: cur ? cur.name : "", placeholder: "Address, postcode or place", autocomplete: "off" });
  const sugg = h("div", { class: "pt-sugg", hidden: true });
  const show = () => { const list = searchPlaces(input.value, 6); sugg.hidden = !input.value || !list.length; fill(sugg, list.map(p => h("button", { type: "button", class: "nb-item", onmousedown: e => { e.preventDefault(); input.value = p.name; sugg.hidden = true; onPick({ name: p.name, x: p.x, y: p.y }); } }, icon("mapPin", 14), p.name))); };
  input.addEventListener("input", show); input.addEventListener("blur", () => setTimeout(() => sugg.hidden = true, 150));
  return h("label", { class: "field pt-place", for: id }, h("span", { text: label }), input, sugg);
}

// ================= accounts =================
let selAcc = null, invBack = 0;
export function renderAccounts(body, rerender) {
  const accs = Object.entries(K.accounts).sort((a, b) => a[1].name.localeCompare(b[1].name));
  if ((!selAcc || !K.accounts[selAcc]) && accs.length) selAcc = (accs.find(([, a]) => a.kind === "nhs") || accs[0])[0];
  const m0 = monthStart();
  const month = id => K.jobs.filter(j => j.account === id && j.status === "done" && j.doneAt >= m0);
  const allMonth = K.jobs.filter(j => j.account && j.status === "done" && j.doneAt >= m0);
  fill(body, h("div", { class: "office" },
    h("div", { class: "office-hd" }, h("h1", { text: "Accounts" }), h("span", { class: "dim", text: "NHS, council, hotels and care homes. Billed monthly." }), h("button", { type: "button", class: "btn primary", onclick: () => editAccount(null, rerender) }, icon("plus", 16), "Add account")),
    h("div", { class: "kpis" }, kpi("Accounts", accs.length), kpi("Trips this month", allMonth.length), kpi("Billed this month", money(allMonth.reduce((s, j) => s + (j.fare || 0), 0))), kpi("Regular runs", K.schedules.filter(s => s.active).length)),
    h("div", { class: "tablewrap" }, h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, ["Account", "Contact", "This month", "Regular runs", "Last invoice", ""].map(t => h("th", { text: t })))),
      h("tbody", {}, accs.map(([id, a]) => {
        const mj = month(id);
        const inv = Object.values(K.invoices).filter(x => x.account === id).sort((x, y) => y.at - x.at)[0];
        return h("tr", { class: selAcc === id ? "sel" : "", onclick: e => { if (e.target.closest("button")) return; selAcc = id; rerender(); } },
          h("td", {}, h("b", { text: a.name }), h("div", {}, h("span", { class: "pill " + (a.kind === "nhs" ? "info" : ""), text: ACCOUNT_KINDS[a.kind] || a.kind }))),
          h("td", {}, a.contact || "", h("div", { class: "dim small", text: a.phone || "" })),
          h("td", {}, h("b", { text: mj.length + " trips" }), h("div", { class: "dim small", text: money(mj.reduce((s, j) => s + (j.fare || 0), 0)) })),
          h("td", { text: K.schedules.filter(s => s.account === id && s.active).length }),
          h("td", { class: "dim", text: inv ? inv.month + " · " + money(inv.total) : "None yet" }),
          h("td", {}, h("button", { type: "button", class: "btn sm", onclick: () => editAccount(id, rerender) }, "Edit")));
      })))),
    selAcc && K.accounts[selAcc] ? accountDetail(selAcc, K.accounts[selAcc], rerender) : null));
}

function accountDetail(id, a, rerender) {
  const runs = K.schedules.filter(s => s.account === id).sort((x, y) => (x.time || "").localeCompare(y.time || ""));
  const from = monthStart(invBack), to = monthStart(invBack - 1);
  const jobs = K.jobs.filter(j => j.account === id && j.status === "done" && j.doneAt >= from && j.doneAt < to).sort((x, y) => x.doneAt - y.doneAt);
  const total = jobs.reduce((s, j) => s + (j.fare || 0), 0);
  const mk = monthKey(from);
  const inv = K.invoices[id + "__" + mk];
  const t = a.tariff || {};
  const S = K.settings;
  const url = appUrl("account-" + id);
  const upcoming = K.jobs.filter(j => j.account === id && ["new", "offered", "accepted", "arrived", "pob"].includes(j.status)).sort((x, y) => x.when - y.when).slice(0, 8);
  return h("div", { class: "acc-detail" },
    h("div", { class: "acc-hd" }, h("div", { class: "grow" }, h("h2", { text: a.name }), h("p", { class: "dim", text: [ACCOUNT_KINDS[a.kind], a.contact, a.email, a.terms].filter(Boolean).join(" · ") })),
      h("button", { type: "button", class: "btn sm", onclick: async () => { const ok = await copyText(url); toast(ok ? "Booking page link copied." : url); } }, icon("link", 14), "Copy booking page link"),
      h("a", { class: "btn sm", href: "#account-" + id, target: "_blank" }, "Open booking page")),
    h("div", { class: "acc-facts" },
      h("span", {}, h("small", { class: "dim", text: "Tariff" }), h("b", { text: "£" + (t.flag ?? S.flag).toFixed(2) + " + £" + (t.perMile ?? S.perMile).toFixed(2) + "/mi, min £" + (t.minimum ?? S.minimum).toFixed(2) })),
      h("span", {}, h("small", { class: "dim", text: "Night rate" }), h("b", { text: a.noNight ? "Not charged" : "×" + S.nightRate })),
      h("span", {}, h("small", { class: "dim", text: "Discount" }), h("b", { text: (a.discount || 0) + "%" })),
      h("span", {}, h("small", { class: "dim", text: a.refLabel || "Reference" }), h("b", { text: a.requireRef ? "Required" : "Optional" }))),
    a.notes ? h("p", { class: "note small", text: a.notes }) : null,
    h("div", { class: "lbl-row" }, h("b", { text: "Regular runs" }), h("span", { class: "dim small", text: "Booked automatically up to 36 hours ahead" }), h("span", { class: "grow" }), h("button", { type: "button", class: "btn sm primary", onclick: () => editRun(null, id, rerender) }, icon("plus", 14), "Add regular run")),
    runs.length ? h("div", { class: "tablewrap" }, h("table", { class: "tbl compact" },
      h("thead", {}, h("tr", {}, ["Passenger", "Days", "Out", "Back", "Route", "Car", "", ""].map(x => h("th", { text: x })))),
      h("tbody", {}, runs.map(s => h("tr", { class: s.active ? "" : "inactive" },
        h("td", {}, h("b", { text: (s.passenger && s.passenger.name) || "" }), h("div", { class: "dim small", text: [s.ref, s.mobility && s.mobility !== "walks" ? MOBILITY[s.mobility] : ""].filter(Boolean).join(" · ") })),
        h("td", { text: (s.days || []).slice().sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).map(d => DAYS[d]).join(" ") }),
        h("td", { text: s.time || "" }), h("td", { text: s.returnTime || "–" }),
        h("td", {}, h("span", { class: "ell", text: s.pickup.name + " → " + s.drop.name })),
        h("td", { text: VEHICLES[s.vehicle || "saloon"].label }),
        h("td", {}, h("span", { class: "pill " + (s.active ? "ok" : "dim"), text: s.active ? "On" : "Paused" })),
        h("td", {}, h("button", { type: "button", class: "btn sm", onclick: () => editRun(s, id, rerender) }, "Edit"))))))) : h("p", { class: "dim small", text: "No regular runs. Add school runs, dialysis or clinic trips that happen every week." }),
    upcoming.length ? h("div", { class: "lbl-row" }, h("b", { text: "Coming up" })) : null,
    upcoming.length ? h("div", { class: "acc-up" }, upcoming.map(j => h("div", { class: "acc-up-row" }, h("b", { text: stamp(j.when) }), h("span", { class: "grow ell", text: ((j.passenger && j.passenger.name) || j.customer.name) + " · " + j.pickup.name + " → " + j.drop.name }), h("span", { class: "pill " + STATUS[j.status].tone, text: j.status === "new" && j.when > Date.now() + 600000 ? "Booked" : STATUS[j.status].label })))) : null,
    h("div", { class: "lbl-row" }, h("b", { text: "Invoice" }), h("div", { class: "seg" }, [[1, "Last month"], [0, "This month"]].map(([n, l]) => h("button", { type: "button", class: "seg-btn" + (invBack === n ? " on" : ""), onclick: () => { invBack = n; rerender(); } }, l))), h("span", { class: "grow" }),
      inv ? h("span", { class: "pill ok", text: "Invoiced " + new Date(inv.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) }) : null,
      h("button", { type: "button", class: "btn sm", disabled: !jobs.length, onclick: () => exportInvoice(a, jobs, mk) }, icon("upload", 14), "Download CSV"),
      h("button", { type: "button", class: "btn sm primary", disabled: !jobs.length || !!inv, onclick: () => markInvoiced(id, mk, total, jobs.length).then(() => toast("Marked " + mk + " as invoiced.", "ok")) }, "Mark invoiced")),
    h("div", { class: "kpis" }, kpi("Month", new Date(from).toLocaleDateString(undefined, { month: "long", year: "numeric" })), kpi("Trips", jobs.length), kpi("Total", money(total))),
    jobs.length ? h("div", { class: "tablewrap" }, h("table", { class: "tbl compact" },
      h("thead", {}, h("tr", {}, ["Date", "Passenger", a.refLabel || "Ref", "Route", "Car", "Fare"].map(x => h("th", { text: x })))),
      h("tbody", {}, jobs.map(j => h("tr", {}, h("td", { text: stamp(j.doneAt) }), h("td", { text: (j.passenger && j.passenger.name) || "" }), h("td", { text: j.ref || "" }), h("td", {}, h("span", { class: "ell", text: j.pickup.name + " → " + j.drop.name })), h("td", { text: (K.drivers[j.driverId] || {}).call || "" }), h("td", { text: money(j.fare) })))))) : h("p", { class: "dim small", text: "No finished trips in this month." }));
}

async function exportInvoice(a, jobs, mk) {
  const rows = [["Date", "Time", "Passenger", a.refLabel || "Reference", "From", "To", "Miles", "Car", "Fare"]];
  for (const j of jobs) rows.push([new Date(j.doneAt).toISOString().slice(0, 10), fmtTime(j.when), (j.passenger && j.passenger.name) || "", j.ref || "", j.pickup.name, j.drop.name, j.miles || "", (K.drivers[j.driverId] || {}).call || "", (j.fare || 0).toFixed(2)]);
  rows.push(["", "", "", "", "", "", "", "Total", jobs.reduce((s, j) => s + (j.fare || 0), 0).toFixed(2)]);
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
  if (!K.api.download) { toast("Downloads aren't available here."); return; }
  try { await K.api.download((K.settings.firm + " " + a.name + " " + mk).replace(/[^\w -]+/g, "").replace(/\s+/g, "-") + ".csv", csv); } catch (e) { if (!e || e.code !== "declined") toast("Couldn't save the file."); }
}

function editAccount(id, rerender) {
  const a = id ? K.accounts[id] : { name: "", kind: "nhs", contact: "", phone: "", email: "", requireRef: true, refLabel: "Booking ref", tariff: {}, noNight: true, discount: 0, terms: "Invoice monthly, 30 days", destinations: [], notes: "" };
  const v = {};
  const inp = (k, l, val, type = "text", ph = "") => { v[k] = h("input", { class: "input", id: "ac-" + k, value: val ?? "", type, placeholder: ph, step: type === "number" ? "0.01" : null }); return h("label", { class: "field", for: "ac-" + k }, h("span", { text: l }), v[k]); };
  const kind = h("select", { class: "input", id: "ac-kind" }, Object.entries(ACCOUNT_KINDS).map(([k, l]) => opt(k, l, a.kind)));
  const tg = (k, l, hint, on) => { v[k] = h("input", { type: "checkbox", class: "tg", id: "ac-" + k }); v[k].checked = !!on; return h("label", { class: "toggle-row", for: "ac-" + k }, h("span", { class: "grow" }, h("b", { text: l }), h("small", { class: "dim", text: hint })), v[k]); };
  const t = a.tariff || {};
  const m = modal({ title: id ? "Edit account" : "Add account", wide: true, body: h("div", { class: "form" },
    h("div", { class: "nb-grid" }, inp("name", "Account name", a.name, "text", "e.g. NHS Patient Transport"), h("label", { class: "field", for: "ac-kind" }, h("span", { text: "Type" }), kind), inp("contact", "Contact", a.contact), inp("phone", "Phone", a.phone, "tel"), inp("email", "Invoice email", a.email, "email"), inp("terms", "Payment terms", a.terms)),
    h("div", { class: "lbl", text: "Prices (leave blank to use your normal fares)" }),
    h("div", { class: "nb-grid" }, inp("flag", "Pick-up charge (£)", t.flag, "number"), inp("perMile", "Per mile (£)", t.perMile, "number"), inp("minimum", "Minimum fare (£)", t.minimum, "number"), inp("discount", "Discount (%)", a.discount || 0, "number")),
    tg("noNight", "No night or Sunday rate", "Common on NHS and council contracts", a.noNight),
    h("div", { class: "lbl", text: "Bookings" }),
    h("div", { class: "nb-grid" }, inp("refLabel", "Reference name", a.refLabel, "text", "e.g. NHS booking ref, PO number"), inp("dests", "Usual destinations", (a.destinations || []).join(", "), "text", "Victoria Hospital, Whitegate Health Centre")),
    tg("requireRef", "Reference required", "Bookings can't be made without it", a.requireRef),
    inp("notes", "Notes for drivers", a.notes)),
    actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
      if (!v.name.value.trim()) { toast("Give the account a name."); return; }
      const num = k => v[k].value === "" ? undefined : +v[k].value;
      const tariff = {}; for (const k of ["flag", "perMile", "minimum"]) if (num(k) != null) tariff[k] = num(k);
      const dests = v.dests.value.split(",").map(x => x.trim()).filter(Boolean);
      const bad = dests.filter(d => !findNamed(d));
      if (bad.length) toast("Not on the map: " + bad.join(", ") + ". Use the exact place name.");
      const data = { name: v.name.value.trim(), kind: kind.value, contact: v.contact.value.trim(), phone: v.phone.value.trim(), email: v.email.value.trim(), terms: v.terms.value.trim(), tariff, discount: +v.discount.value || 0, noNight: v.noNight.checked, refLabel: v.refLabel.value.trim(), requireRef: v.requireRef.checked, destinations: dests.filter(d => findNamed(d)), notes: v.notes.value.trim() };
      const nid = await saveAccount(id, data);
      if (nid) { selAcc = nid; m.close(); toast("Saved.", "ok"); rerender(); }
    } }, "Save")] });
}

function editRun(s, accId, rerender) {
  const a = K.accounts[accId] || {};
  const r = s ? JSON.parse(JSON.stringify(s)) : { account: accId, passenger: { name: "", phone: "" }, pickup: null, drop: (a.destinations || []).map(findNamed).filter(Boolean)[0] || null, days: [1, 2, 3, 4, 5], time: "08:30", returnTime: "", vehicle: "saloon", passengers: 1, mobility: "walks", escorts: 0, ref: "", notes: "", active: true };
  const v = {};
  const inp = (k, l, val, type = "text", ph = "") => { v[k] = h("input", { class: "input", id: "rn-" + k, value: val ?? "", type, placeholder: ph }); return h("label", { class: "field", for: "rn-" + k }, h("span", { text: l }), v[k]); };
  const days = h("div", { class: "opts" }, [1, 2, 3, 4, 5, 6, 0].map(d => h("button", { type: "button", class: "opt" + (r.days.includes(d) ? " on" : ""), onclick: e => { r.days = r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d]; e.currentTarget.classList.toggle("on"); } }, DAYS[d])));
  const veh = h("select", { class: "input", id: "rn-veh" }, Object.entries(VEHICLES).map(([k, x]) => opt(k, x.label, r.vehicle)));
  const mob = h("select", { class: "input", id: "rn-mob" }, Object.entries(MOBILITY).map(([k, l]) => opt(k, l, r.mobility)));
  const act = h("input", { type: "checkbox", class: "tg", id: "rn-act" }); act.checked = r.active !== false;
  const m = modal({ title: s ? "Edit regular run" : "Add regular run", wide: true, body: h("div", { class: "form" },
    h("p", { class: "muted", text: a.name }),
    h("div", { class: "nb-grid" }, inp("pname", "Passenger", r.passenger && r.passenger.name, "text", "Name, or e.g. 3 pupils"), inp("pphone", "Passenger mobile", r.passenger && r.passenger.phone, "tel"), inp("ref", a.refLabel || "Reference", r.ref)),
    h("div", { class: "nb-grid" }, placeField("rn-pick", "Pick-up", r.pickup, p => r.pickup = p), placeField("rn-drop", "Destination", r.drop, p => r.drop = p)),
    h("div", { class: "field" }, h("span", { text: "Days" }), days),
    h("div", { class: "nb-grid" }, inp("time", "Pick-up time", r.time, "time"), inp("ret", "Return pick-up (optional)", r.returnTime, "time"), inp("from", "Starts", r.from || "", "date"), inp("to", "Ends (optional)", r.to || "", "date")),
    h("div", { class: "nb-grid" }, h("label", { class: "field", for: "rn-veh" }, h("span", { text: "Car" }), veh), inp("pax", "Passengers", r.passengers, "number"), h("label", { class: "field", for: "rn-mob" }, h("span", { text: "Mobility" }), mob), inp("esc", "Escorts", r.escorts || 0, "number")),
    inp("notes", "Notes for the driver", r.notes),
    h("label", { class: "toggle-row", for: "rn-act" }, h("span", { class: "grow" }, h("b", { text: "Active" }), h("small", { class: "dim", text: "Pause for school holidays or a hospital stay" })), act)),
    actions: [s ? h("button", { type: "button", class: "btn danger", onclick: async () => { if (await confirmBox("Delete this regular run?", "Trips already booked stay booked.", "Delete", true)) { await delSchedule(s.id); m.close(); rerender(); } } }, "Delete") : null,
      h("span", { class: "grow" }), h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!r.pickup || !r.drop) { toast("Pick the pick-up and destination from the list."); return; }
        if (!r.days.length) { toast("Pick at least one day."); return; }
        if (!v.time.value) { toast("Add a pick-up time."); return; }
        const data = { account: accId, customer: { name: a.name || "Account", phone: a.phone || "" }, passenger: { name: v.pname.value.trim(), phone: v.pphone.value.trim() }, ref: v.ref.value.trim(), pickup: r.pickup, drop: r.drop, days: r.days, time: v.time.value, returnTime: v.ret.value, from: v.from.value || "", to: v.to.value || "", vehicle: veh.value, passengers: Math.max(1, +v.pax.value || 1), mobility: mob.value, escorts: +v.esc.value || 0, notes: v.notes.value.trim(), active: act.checked };
        if (await saveSchedule(s && s.id, data) !== null) { m.close(); toast("Saved. Trips will book themselves.", "ok"); rerender(); }
      } }, "Save")].filter(Boolean) });
}

// ================= quality =================
let cFilter = "open";
export function renderQuality(body, rerender) {
  const since = Date.now() - 30 * 86400000;
  const rated = K.jobs.filter(j => j.rating && (j.doneAt || 0) >= since);
  const avg = rated.length ? rated.reduce((s, j) => s + j.rating, 0) / rated.length : 0;
  const open = K.complaints.filter(c => c.status === "open");
  const noshows = K.jobs.filter(j => j.status === "noshow" && (j.cancelledAt || 0) >= Date.now() - 7 * 86400000);
  const lostOpen = K.lost.filter(x => !["returned", "disposed"].includes(x.status));
  const rows = driversList().map(d => {
    const r = rated.filter(j => j.driverId === d.id);
    const cs = K.complaints.filter(c => c.driverId === d.id);
    return { d, n: r.length, avg: r.length ? r.reduce((s, j) => s + j.rating, 0) / r.length : null, low: r.filter(j => j.rating <= 2).length, open: cs.filter(c => c.status === "open").length, total: cs.length, ns: K.jobs.filter(j => j.driverId === d.id && j.status === "noshow" && (j.cancelledAt || 0) >= since).length };
  }).sort((a, b) => (b.open - a.open) || ((a.avg ?? 5) - (b.avg ?? 5)));
  const list = (cFilter === "open" ? open : K.complaints).slice(0, 40);
  fill(body, h("div", { class: "office" },
    h("div", { class: "office-hd" }, h("h1", { text: "Quality" }), h("span", { class: "dim", text: "Ratings, complaints and lost property" }), h("button", { type: "button", class: "btn", onclick: () => logComplaint(rerender) }, icon("plus", 16), "Log complaint"), h("button", { type: "button", class: "btn", onclick: () => logLostItem(rerender) }, icon("box", 16), "Log lost item")),
    h("div", { class: "kpis" }, kpi("Average rating (30 days)", avg ? "★ " + avg.toFixed(2) : "–"), kpi("Open complaints", open.length, open.length ? "warn" : ""), kpi("No-shows (7 days)", noshows.length), kpi("Lost items waiting", lostOpen.length, lostOpen.length ? "warn" : "")),
    h("div", { class: "rgrid" },
      h("div", { class: "rcard wide" }, h("b", { text: "Drivers" }), h("div", { class: "tablewrap" }, h("table", { class: "tbl compact" },
        h("thead", {}, h("tr", {}, ["Car", "Driver", "Rating (30 days)", "1–2 stars", "Complaints", "No-shows"].map(x => h("th", { text: x })))),
        h("tbody", {}, rows.map(x => h("tr", {}, h("td", {}, h("span", { class: "callchip " + x.d.status, text: x.d.call })), h("td", { text: x.d.name }),
          h("td", {}, x.avg ? h("span", { class: x.avg < 4.3 ? "bad-t" : "" , text: "★ " + x.avg.toFixed(2) }) : h("span", { class: "dim", text: "–" }), h("span", { class: "dim small", text: x.n ? " (" + x.n + ")" : "" })),
          h("td", {}, x.low ? h("span", { class: "pill warn", text: x.low }) : h("span", { class: "dim", text: "0" })),
          h("td", {}, x.open ? h("span", { class: "pill bad", text: x.open + " open" }) : null, h("span", { class: "dim small", text: x.total ? " " + x.total + " total" : "0" })),
          h("td", { text: x.ns }))))))),
      h("div", { class: "rcard wide" }, h("div", { class: "lbl-row" }, h("b", { text: "Complaints" }), h("div", { class: "seg" }, [["open", "Open"], ["all", "All"]].map(([k, l]) => h("button", { type: "button", class: "seg-btn" + (cFilter === k ? " on" : ""), onclick: () => { cFilter = k; rerender(); } }, l)))),
        list.length ? h("div", { class: "clist" }, list.map(c => complaintCard(c, rerender))) : h("p", { class: "dim small", text: cFilter === "open" ? "No open complaints." : "No complaints yet." })),
      h("div", { class: "rcard wide" }, h("b", { text: "Lost property" }),
        K.lost.length ? h("div", { class: "tablewrap" }, h("table", { class: "tbl compact" },
          h("thead", {}, h("tr", {}, ["Item", "Car", "Customer", "Logged", "Status"].map(x => h("th", { text: x })))),
          h("tbody", {}, K.lost.slice(0, 40).map(x => { const d = K.drivers[x.driverId]; const sel = h("select", { class: "input sm", "aria-label": "Status of " + x.item }, Object.entries(LOST_STATUS).map(([k, l]) => opt(k, l, x.status))); sel.addEventListener("change", () => setLost(x, { status: sel.value, updatedAt: Date.now() })); return h("tr", {},
            h("td", {}, h("b", { text: x.item }), h("div", { class: "dim small", text: x.details || "" })),
            h("td", {}, d ? h("span", { class: "callchip " + d.status, text: d.call }) : h("span", { class: "dim", text: "?" })),
            h("td", {}, x.customer ? [x.customer.name || "", h("div", { class: "dim small", text: x.customer.phone || "" })] : h("span", { class: "dim", text: "Unknown" })),
            h("td", { class: "dim", text: relTime(x.at) + (x.by === "customer" ? " · by customer" : " · by driver") }),
            h("td", {}, sel)); })))) : h("p", { class: "dim small", text: "Nothing logged." })))));
}
function complaintCard(c, rerender) {
  const d = K.drivers[c.driverId], j = K.jobs.find(x => x.id === c.jobId);
  return h("div", { class: "ccard" + (c.status === "open" ? " open" : "") },
    h("div", { class: "ccard-hd" }, h("span", { class: "pill " + (c.status === "open" ? "bad" : "dim"), text: COMPLAINT_KINDS[c.kind] || c.kind }), d ? h("span", { class: "callchip " + d.status, text: d.call }) : null, h("b", { class: "grow", text: (c.customer && c.customer.name) || "Customer" }), h("span", { class: "dim small", text: relTime(c.at) })),
    c.text ? h("p", { text: c.text }) : null,
    j ? h("div", { class: "dim small", text: stamp(j.doneAt || j.when) + " · " + j.pickup.name + " → " + j.drop.name + " · " + money(j.fare) + (j.rating ? " · rated " + j.rating + "★" : "") }) : null,
    c.status === "resolved" ? h("div", { class: "dim small", text: "Resolved: " + (c.note || "no note") }) :
      h("div", { class: "row-btns" },
        c.customer && c.customer.phone ? h("a", { class: "btn sm", href: "tel:" + c.customer.phone.replace(/\s/g, "") }, icon("phone", 14), "Call " + (c.customer.name || "").split(" ")[0]) : null,
        d ? h("button", { type: "button", class: "btn sm", onclick: async () => { const t = await promptBox("Message car " + d.call, "Message", "About your trip " + (j ? j.pickup.name + " → " + j.drop.name : "") + ": ", { max: 300, ok: "Send" }); if (t) { await sendMsg(d.id, "dispatch", t); toast("Sent.", "ok"); } } }, "Message driver") : null,
        h("button", { type: "button", class: "btn sm primary", onclick: async () => { const n = await promptBox("Resolve complaint", "What was done?", "", { max: 200, ok: "Resolve" }); if (n !== null) { await resolveComplaint(c, n); rerender(); } } }, "Resolve")));
}
function logComplaint(rerender) {
  const v = {};
  const drv = h("select", { class: "input", id: "lc-d" }, opt("", "Not about a driver", ""), driversList().sort((a, b) => +a.call - +b.call).map(d => opt(d.id, d.call + " · " + d.name, "")));
  const kind = h("select", { class: "input", id: "lc-k" }, Object.entries(COMPLAINT_KINDS).map(([k, l]) => opt(k, l, "")));
  const name = h("input", { class: "input", id: "lc-n", placeholder: "Customer name" }), phone = h("input", { class: "input", id: "lc-p", placeholder: "Phone", inputmode: "tel" });
  const txt = h("textarea", { class: "input", id: "lc-t", rows: 3, placeholder: "What happened?", maxlength: 500 });
  const m = modal({ title: "Log complaint", body: h("div", { class: "form" }, h("div", { class: "nb-grid" }, h("label", { class: "field", for: "lc-d" }, h("span", { text: "Driver" }), drv), h("label", { class: "field", for: "lc-k" }, h("span", { text: "About" }), kind), name, phone), txt),
    actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
      if (!txt.value.trim()) { toast("Say what happened."); return; }
      const ph = phone.value.trim(); const recent = ph ? K.jobs.filter(j => (j.customer.phone || "").replace(/\D/g, "") === ph.replace(/\D/g, "") && (!drv.value || j.driverId === drv.value)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))[0] : null;
      await addComplaint({ driverId: drv.value || null, kind: kind.value, customer: { name: name.value.trim(), phone: ph }, text: txt.value.trim(), jobId: recent ? recent.id : null, via: "phone" });
      m.close(); toast("Logged.", "ok"); rerender();
    } }, "Log")] });
}
function logLostItem(rerender) {
  const drv = h("select", { class: "input", id: "li-d" }, opt("", "Unknown car", ""), driversList().sort((a, b) => +a.call - +b.call).map(d => opt(d.id, d.call + " · " + d.name, "")));
  const item = h("input", { class: "input", id: "li-i", placeholder: "Item, e.g. grey rucksack", maxlength: 80 }), det = h("input", { class: "input", id: "li-x", placeholder: "Details", maxlength: 160 });
  const name = h("input", { class: "input", id: "li-n", placeholder: "Customer name (if known)" }), phone = h("input", { class: "input", id: "li-p", placeholder: "Customer phone", inputmode: "tel" });
  const m = modal({ title: "Log lost item", body: h("div", { class: "form" }, item, det, h("div", { class: "nb-grid" }, h("label", { class: "field", for: "li-d" }, h("span", { text: "Car" }), drv), name, phone)),
    actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
      if (!item.value.trim()) { toast("Say what the item is."); return; }
      await addLost({ item: item.value.trim(), details: det.value.trim(), driverId: drv.value || null, customer: name.value.trim() || phone.value.trim() ? { name: name.value.trim(), phone: phone.value.trim() } : null, by: "office" });
      if (drv.value) sendMsg(drv.value, "dispatch", "Lost property: please check your car for " + item.value.trim() + (name.value.trim() ? " (" + name.value.trim() + ")" : "") + ".");
      m.close(); toast("Logged.", "ok"); rerender();
    } }, "Log")] });
}

// ================= planner =================
let selDay = 0;
export function renderPlanner(body, rerender) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => forecastDay(today.getTime() + i * 86400000));
  const sel = days[selDay] || days[0];
  // show the evening from 3pm to 4am the next day, when events matter
  const next = forecastDay(sel.dayStart + 86400000);
  const hours = [...sel.hours.slice(15), ...next.hours.slice(0, 5)];
  const maxJ = Math.max(1, ...hours.map(x => x.jobs));
  const peak = hours.reduce((a, x) => x.jobs > a.jobs ? x : a, hours[0]);
  const onBooks = driversList().length;
  const evs = eventsBetween(sel.dayStart + 12 * 3600000, sel.dayStart + 28 * 3600000);
  const dayName = t => new Date(t).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
  const upcoming = K.events.filter(e => (e.nightly ? (e.until || e.end) : e.end) > Date.now()).sort((a, b) => a.start - b.start);
  fill(body, h("div", { class: "office" },
    h("div", { class: "office-hd" }, h("h1", { text: "Busy-night planner" }), h("span", { class: "dim", text: "Forecast from your last 4 weeks of jobs plus events" }), h("button", { type: "button", class: "btn primary", onclick: () => editEvent(null, rerender) }, icon("plus", 16), "Add event")),
    h("div", { class: "pdays" }, days.map((d, i) => {
      const evN = eventsBetween(d.dayStart + 12 * 3600000, d.dayStart + 28 * 3600000).filter(e => !e.nightly);
      const nPeak = Math.max(...[...d.hours.slice(15), ...forecastDay(d.dayStart + 86400000).hours.slice(0, 5)].map(x => x.cars));
      const short = nPeak > onBooks;
      return h("button", { type: "button", class: "pday" + (i === selDay ? " on" : "") + (short ? " short" : ""), onclick: () => { selDay = i; rerender(); } },
        h("small", { text: i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(d.dayStart).toLocaleDateString(undefined, { weekday: "short" }) }),
        h("b", { text: new Date(d.dayStart).getDate() }),
        h("span", { class: "pday-cars", text: nPeak + " cars" }),
        evN.length ? h("span", { class: "pday-ev", text: evN[0].name.split(",")[0] }) : h("span", { class: "pday-ev dim", text: "No events" }));
    })),
    h("div", { class: "rgrid" },
      h("div", { class: "rcard wide" },
        h("div", { class: "lbl-row" }, h("b", { text: dayName(sel.dayStart) + " evening" }), h("span", { class: "grow" }),
          h("span", { class: "pill " + (peak.cars > onBooks ? "bad" : "ok"), text: "Peak " + String(peak.hour).padStart(2, "0") + ":00 · " + peak.cars + " cars needed · " + onBooks + " on your books" })),
        h("div", { class: "pchart" }, hours.map(x => h("div", { class: "pcol", title: String(x.hour).padStart(2, "0") + ":00 · about " + Math.round(x.jobs) + " jobs · " + x.cars + " cars" },
          h("span", { class: "pcol-v", text: x.cars }),
          h("div", { class: "pcol-bar" }, h("i", { class: "lift", style: { height: (x.lift / maxJ * 100) + "%" } }), h("i", { class: "base", style: { height: (x.base / maxJ * 100) + "%" } })),
          h("small", { text: String(x.hour).padStart(2, "0") })))),
        h("div", { class: "pkey dim small" }, h("span", {}, h("i", { class: "k base" }), "Normal for this day"), h("span", {}, h("i", { class: "k lift" }), "Extra from events"), h("span", { text: "Number above each bar: cars needed (about " + JOBS_PER_CAR_HOUR + " jobs a car an hour)" })),
        h("div", { class: "row-btns" },
          h("button", { type: "button", class: "btn", onclick: async () => {
            const evText = evs.filter(e => !e.nightly).map(e => e.name + " ends " + fmtTime(e.end)).join(", ");
            const t = await promptBox("Message all drivers", "Message", (selDay === 0 ? "Tonight" : dayName(sel.dayStart)) + ": busy from " + String(Math.max(15, peak.hour - 1)).padStart(2, "0") + ":00" + (evText ? ". " + evText : "") + ". We need " + peak.cars + " cars. Reply if you can work.", { max: 300, ok: "Send to all", multiline: true });
            if (t) { await broadcast(t); toast("Sent to every driver.", "ok"); }
          } }, icon("send", 14), "Message all drivers"),
          evs.filter(e => !e.nightly)[0] ? h("button", { type: "button", class: "btn", onclick: async () => {
            const e = evs.filter(x => !x.nightly)[0];
            if (await confirmBox("Turn on event pricing?", "Fares go up 20% for everyone until you turn it off in Settings. Customers see \"" + e.name.split(",")[0] + " pricing\".", "Turn on")) saveSettings({ boost: 1.2, boostLabel: e.name.split(",")[0] });
          } }, "Turn on event pricing") : null)),
      h("div", { class: "rcard wide" }, h("b", { text: "Events" }),
        upcoming.length ? h("div", { class: "tablewrap" }, h("table", { class: "tbl compact" },
          h("thead", {}, h("tr", {}, ["Event", "Venue", "When", "Crowd", ""].map(x => h("th", { text: x })))),
          h("tbody", {}, upcoming.map(e => h("tr", {},
            h("td", {}, h("b", { text: e.name }), e.example ? h("span", { class: "pill dim", text: "Example" }) : null),
            h("td", { text: e.venue || "" }),
            h("td", { text: e.nightly ? "Nightly " + fmtTime(e.start) + "–" + fmtTime(e.end) + " until " + new Date(e.until).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : stamp(e.start) + "–" + fmtTime(e.end) }),
            h("td", { text: (e.crowd || 0).toLocaleString() }),
            h("td", {}, h("button", { type: "button", class: "btn sm", onclick: () => editEvent(e, rerender) }, "Edit"))))))) : h("p", { class: "dim small", text: "No events. Add gigs, matches and shows so the forecast knows about them." })))));
}
function editEvent(e, rerender) {
  const r = e ? Object.assign({}, e) : { name: "", venue: "Winter Gardens", start: null, end: null, crowd: 1500, nightly: false };
  const toLocal = t => t ? new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const name = h("input", { class: "input", id: "ev-n", value: r.name, placeholder: "e.g. Comedy night", maxlength: 80 });
  const venue = h("select", { class: "input", id: "ev-v" }, MAP.landmarks.map(l => opt(l.name, l.name, r.venue)));
  const start = h("input", { class: "input", id: "ev-s", type: "datetime-local", value: toLocal(r.start) }), end = h("input", { class: "input", id: "ev-e", type: "datetime-local", value: toLocal(r.end) });
  const crowd = h("input", { class: "input", id: "ev-c", type: "number", min: 0, step: 100, value: r.crowd });
  const fl = (id, l, el) => h("label", { class: "field", for: id }, h("span", { text: l }), el);
  const m = modal({ title: e ? "Edit event" : "Add event", body: h("div", { class: "form" }, fl("ev-n", "Name", name), fl("ev-v", "Venue", venue), h("div", { class: "nb-grid" }, fl("ev-s", "Starts", start), fl("ev-e", "Ends", end)), fl("ev-c", "Expected crowd", crowd), r.nightly ? h("p", { class: "dim small", text: "This repeats every night." }) : null),
    actions: [e ? h("button", { type: "button", class: "btn danger", onclick: async () => { if (await confirmBox("Delete this event?", e.name, "Delete", true)) { await delEvent(e.id); m.close(); rerender(); } } }, "Delete") : null, h("span", { class: "grow" }),
      h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!name.value.trim() || !start.value || !end.value) { toast("Add a name, start and end."); return; }
        const s = new Date(start.value).getTime(), en = new Date(end.value).getTime();
        if (en <= s) { toast("The end has to be after the start."); return; }
        const l = landmark(venue.value) || {};
        await saveEvent(e && e.id, { name: name.value.trim(), venue: venue.value, x: l.x, y: l.y, start: s, end: en, crowd: Math.max(0, +crowd.value || 0), nightly: !!r.nightly, until: r.until || null, example: false });
        m.close(); toast("Saved.", "ok"); rerender();
      } }, "Save")].filter(Boolean) });
}
