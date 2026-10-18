// Account booking page: NHS transport desks, schools, hotels and care homes book rides that are billed monthly.
import { APP, STATUS, MOBILITY, ACCOUNT_KINDS } from "../config.js";
import { h, fill, icon, toast, store, stamp, fmtTime, confirmBox } from "../lib/dom.js";
import { searchPlaces, quote, money, driveMinutes, landmark } from "../lib/geo.js";
import { MAP } from "../lib/mapdata.js";
import { K, onChange, createJob, cancel, carLabel } from "../store.js";

const findNamed = n => landmark(n) || (p => p ? { name: p.name, x: p.x, y: p.y } : null)(MAP.places.find(x => x.name === n));
const toLocal = t => new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function mountPortal(root, accId) {
  root.classList.add("app-root");
  const shell = h("div", { class: "portal" });
  fill(root, shell);
  let f = { passenger: "", phone: "", pickup: null, drop: null, appt: null, setTime: false, mobility: "walks", escorts: 0, ret: false, retTime: "", ref: "", notes: "" };
  let bookedBy = store.get("portalBy", "");

  const acc = () => K.accounts[accId] || null;

  function render() {
    const a = acc();
    const accounts = Object.entries(K.accounts);
    if (!a) {
      fill(shell, h("div", { class: "portal-pick" }, logoSvg(48), h("h1", { text: "Account bookings" }), h("p", { class: "muted", text: "Choose your account." }),
        accounts.length ? h("div", { class: "stack" }, accounts.map(([id, x]) => h("a", { class: "big", href: "#account-" + id }, icon(x.kind === "nhs" ? "cross" : "briefcase", 22), h("span", { class: "big-txt" }, h("b", { text: x.name }), h("small", { text: ACCOUNT_KINDS[x.kind] || "" })))))
          : h("p", { class: "dim", text: "No accounts set up yet. The office adds them under Accounts." })));
      return;
    }
    fill(shell,
      h("header", { class: "portal-hd" }, logoSvg(26), h("div", { class: "grow" }, h("b", { text: a.name }), h("small", { class: "dim", text: "Book with " + K.settings.firm + " · billed to your account monthly" })),
        accounts.length > 1 ? h("a", { class: "btn sm", href: "#account" }, "Switch account") : null),
      h("div", { class: "portal-body" }, form(a), list(a)));
  }

  function form(a) {
    const kids = [];
    const byIn = h("input", { class: "input", id: "pt-by", value: bookedBy, placeholder: "e.g. Sarah, Ward 6", autocomplete: "name" });
    byIn.addEventListener("input", () => { bookedBy = byIn.value; store.set("portalBy", bookedBy); });
    const pName = h("input", { class: "input", id: "pt-name", value: f.passenger, placeholder: a.kind === "nhs" ? "Patient's full name" : "Passenger's name", autocomplete: "off" });
    const pPhone = h("input", { class: "input", id: "pt-phone", value: f.phone, placeholder: "Mobile (optional)", inputmode: "tel", autocomplete: "off" });
    pName.addEventListener("input", () => f.passenger = pName.value); pPhone.addEventListener("input", () => f.phone = pPhone.value);
    const pick = placeInput("pt-pick", "Home address or postcode", f.pickup, p => { f.pickup = p; drawPrice(); });
    const destChips = h("div", { class: "opts wrap" }, (a.destinations || []).map(n => findNamed(n)).filter(Boolean).map(p => h("button", { type: "button", class: "opt" + (f.drop && f.drop.name === p.name ? " on" : ""), onclick: () => { f.drop = p; drop.set(p); render(); } }, p.name)));
    const drop = placeInput("pt-drop", "Or search any address", f.drop, p => { f.drop = p; render(); });
    const appt = h("input", { class: "input", id: "pt-appt", type: "datetime-local", value: f.appt ? toLocal(f.appt) : "" });
    appt.addEventListener("change", () => { f.appt = appt.value ? new Date(appt.value).getTime() : null; drawPrice(); });
    const setTime = h("input", { type: "checkbox", class: "tg", id: "pt-settime" }); setTime.checked = f.setTime;
    setTime.addEventListener("change", () => { f.setTime = setTime.checked; render(); });
    const mob = h("select", { class: "input", id: "pt-mob" }, Object.entries(MOBILITY).map(([k, l]) => { const o = h("option", { value: k, text: l }); if (f.mobility === k) o.selected = true; return o; }));
    mob.addEventListener("change", () => { f.mobility = mob.value; drawPrice(); });
    const esc = h("select", { class: "input", id: "pt-esc" }, [0, 1, 2].map(n => { const o = h("option", { value: n, text: n ? n + (n === 1 ? " escort or carer" : " escorts") : "No escort" }); if (f.escorts === n) o.selected = true; return o; }));
    esc.addEventListener("change", () => { f.escorts = +esc.value; drawPrice(); });
    const ret = h("input", { type: "checkbox", class: "tg", id: "pt-ret" }); ret.checked = f.ret;
    const retTime = h("input", { class: "input", id: "pt-rett", type: "time", value: f.retTime, hidden: !f.ret });
    ret.addEventListener("change", () => { f.ret = ret.checked; retTime.hidden = !f.ret; if (f.ret && !retTime.value) { retTime.value = f.appt ? new Date(f.appt + 2 * 3600000).toTimeString().slice(0, 5) : "12:00"; f.retTime = retTime.value; } });
    retTime.addEventListener("change", () => f.retTime = retTime.value);
    const ref = h("input", { class: "input", id: "pt-ref", value: f.ref, placeholder: a.refLabel || "Reference", maxlength: 40 });
    ref.addEventListener("input", () => f.ref = ref.value);
    const notes = h("input", { class: "input", id: "pt-notes", value: f.notes, placeholder: "e.g. ground floor flat, ring twice", maxlength: 160 });
    notes.addEventListener("input", () => f.notes = notes.value);
    const price = h("div", { class: "nb-quote", id: "pt-price" });
    const fl = (id, l, el, hint) => h("label", { class: "field", for: id }, h("span", { text: l }), el, hint ? h("small", { class: "dim", text: hint }) : null);
    function pickupTime() {
      if (!f.appt) return null;
      if (f.setTime || !f.pickup || !f.drop) return f.appt;
      return f.appt - (driveMinutes(f.pickup, f.drop) + 15) * 60000; // drive time plus 15 minutes to get in and find the clinic
    }
    function drawPrice() {
      const t = pickupTime();
      if (!f.pickup || !f.drop) { fill(price, h("span", { class: "dim", text: "Add the pick-up and destination to see the price." })); return; }
      const tr = Object.assign({}, K.settings, a.tariff || {}, { boost: 1 }); if (a.noNight) tr.nightRate = 1;
      const veh = f.mobility === "chair" ? "wav" : "saloon";
      const q = quote(f.pickup, f.drop, tr, veh, t || Date.now());
      const fare = Math.round(q.fare * (1 - (a.discount || 0) / 100) * 10) / 10;
      fill(price, h("b", { text: money(fare) }), h("span", { class: "dim", text: q.miles + " mi · " + q.mins + " min" + (veh === "wav" ? " · wheelchair car" : "") + (t ? " · pick-up " + (f.setTime ? "at " : "about ") + fmtTime(t) : "") + (f.ret ? " · plus the return" : "") }));
    }
    async function submit(btn) {
      if (!bookedBy.trim()) { toast("Add your name so the office knows who booked."); byIn.focus(); return; }
      if (!f.passenger.trim()) { toast("Add the " + (a.kind === "nhs" ? "patient's" : "passenger's") + " name."); pName.focus(); return; }
      if (!f.pickup || !f.drop) { toast("Pick an address from the list for pick-up and destination."); return; }
      if (!f.appt) { toast(f.setTime ? "Add the pick-up time." : "Add the appointment time."); appt.focus(); return; }
      if (a.requireRef && !f.ref.trim()) { toast("Add the " + (a.refLabel || "reference") + "."); ref.focus(); return; }
      const t = pickupTime();
      if (t < Date.now() - 5 * 60000) { toast("That time has already passed."); return; }
      btn.disabled = true;
      const veh = f.mobility === "chair" ? "wav" : "saloon";
      const base = { account: accId, customer: { name: a.name + " (" + bookedBy.trim() + ")", phone: a.phone || "" }, passenger: { name: f.passenger.trim(), phone: f.phone.trim() }, ref: f.ref.trim(), mobility: f.mobility, escorts: f.escorts, vehicle: veh, passengers: 1 + f.escorts, notes: f.notes.trim(), bookedBy: bookedBy.trim(), source: "account" };
      const id = await createJob(Object.assign({}, base, { pickup: f.pickup, drop: f.drop, when: Math.max(Date.now(), t), appointment: f.setTime ? null : f.appt }));
      if (id && f.ret && f.retTime) {
        const [hh, mm] = f.retTime.split(":").map(Number); const r = new Date(f.appt); r.setHours(hh, mm, 0, 0);
        if (r.getTime() > t) await createJob(Object.assign({}, base, { pickup: f.drop, drop: f.pickup, when: r.getTime(), returnOf: id }));
      }
      btn.disabled = false;
      if (id) { toast("Booked. " + (f.ret ? "Return trip booked too." : "We'll text updates to the patient if you gave a mobile."), "ok"); f = { passenger: "", phone: "", pickup: null, drop: null, appt: null, setTime: false, mobility: "walks", escorts: 0, ret: false, retTime: "", ref: "", notes: "" }; render(); }
    }
    const btn = h("button", { type: "button", class: "btn primary big", onclick: e => submit(e.currentTarget) }, "Book transport");
    const box = h("section", { class: "portal-form" },
      h("h2", { text: "New booking" }),
      fl("pt-by", "Booked by", byIn),
      h("div", { class: "nb-grid" }, fl("pt-name", a.kind === "nhs" ? "Patient" : "Passenger", pName), fl("pt-phone", "Mobile", pPhone)),
      fl("pt-pick", "Pick-up", pick.el),
      h("div", { class: "field" }, h("span", { text: "Going to" }), destChips, drop.el),
      h("div", { class: "nb-grid" }, fl("pt-appt", f.setTime ? "Pick-up time" : "Appointment time", appt, f.setTime ? "" : "We work out the pick-up time"), h("label", { class: "toggle-row", for: "pt-settime" }, h("span", { class: "grow" }, h("b", { text: "Set the pick-up time instead" })), setTime)),
      h("div", { class: "nb-grid" }, fl("pt-mob", "Mobility", mob), fl("pt-esc", "Escort", esc)),
      h("label", { class: "toggle-row", for: "pt-ret" }, h("span", { class: "grow" }, h("b", { text: "Book the return trip" }), h("small", { class: "dim", text: "Pick up from the destination later the same day" })), ret), retTime,
      h("div", { class: "nb-grid" }, fl("pt-ref", (a.refLabel || "Reference") + (a.requireRef ? "" : " (optional)"), ref), fl("pt-notes", "Notes for the driver", notes)),
      price, btn);
    drawPrice();
    return box;
  }

  function placeInput(id, ph, cur, onPick) {
    const input = h("input", { class: "input", id, placeholder: ph, value: cur ? cur.name : "", autocomplete: "off" });
    const sugg = h("div", { class: "pt-sugg", hidden: true });
    const show = () => { const list = searchPlaces(input.value, 6); sugg.hidden = !input.value || !list.length; fill(sugg, list.map(p => h("button", { type: "button", class: "nb-item", onmousedown: e => { e.preventDefault(); input.value = p.name; sugg.hidden = true; onPick({ name: p.name, x: p.x, y: p.y }); } }, icon("mapPin", 14), p.name))); };
    input.addEventListener("input", show); input.addEventListener("focus", show);
    input.addEventListener("blur", () => setTimeout(() => sugg.hidden = true, 150));
    return { el: h("div", { class: "pt-place" }, input, sugg), set: p => { input.value = p.name; } };
  }

  function list(a) {
    const mine = K.jobs.filter(j => j.account === accId && (j.when > Date.now() - 2 * 86400000 || ["new", "offered", "accepted", "arrived", "pob"].includes(j.status))).sort((x, y) => x.when - y.when);
    const upcoming = mine.filter(j => ["new", "offered", "accepted", "arrived", "pob"].includes(j.status));
    const past = mine.filter(j => !upcoming.includes(j)).reverse().slice(0, 15);
    const card = j => {
      const d = j.driverId && K.drivers[j.driverId];
      return h("div", { class: "pt-card" },
        h("div", { class: "pt-card-hd" }, h("b", { text: stamp(j.when) }), j.source === "contract" ? h("span", { class: "pill", text: "Regular run" }) : null, h("span", { class: "grow" }), h("span", { class: "pill " + STATUS[j.status].tone, text: j.status === "new" && j.when > Date.now() + 600000 ? "Booked" : STATUS[j.status].label })),
        h("div", { class: "pt-who" }, h("b", { text: (j.passenger && j.passenger.name) || j.customer.name }), j.ref ? h("span", { class: "dim", text: " · " + j.ref }) : null, j.mobility && j.mobility !== "walks" ? h("span", { class: "dim", text: " · " + MOBILITY[j.mobility] }) : null),
        h("div", { class: "b-line" }, h("i", { class: "a" }), h("span", { text: j.pickup.name })), h("div", { class: "b-line" }, h("i", { class: "b" }), h("span", { text: j.drop.name })),
        h("div", { class: "pt-card-ft dim" }, money(j.fare) + (d ? " · car " + d.call + ", " + carLabel(d) + " " + d.car.reg : "") + (j.appointment ? " · appointment " + fmtTime(j.appointment) : "")),
        ["new", "offered"].includes(j.status) ? h("button", { type: "button", class: "link-btn", onclick: async () => { if (await confirmBox("Cancel this booking?", ((j.passenger && j.passenger.name) || "") + " · " + stamp(j.when), "Cancel booking", true)) cancel(j); } }, "Cancel booking") : null);
    };
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const mJobs = K.jobs.filter(j => j.account === accId && j.status === "done" && j.doneAt >= month.getTime());
    return h("section", { class: "portal-list" },
      h("div", { class: "kpis" }, kpi("Upcoming", upcoming.length), kpi("This month", mJobs.length + " trips"), kpi("Month to date", money(mJobs.reduce((s, j) => s + (j.fare || 0), 0)))),
      h("h2", { text: "Upcoming" }), upcoming.length ? upcoming.map(card) : h("p", { class: "dim", text: "Nothing booked yet." }),
      past.length ? h("h2", { text: "Recent" }) : null, past.map(card),
      h("p", { class: "dim small", text: "Problems on the day? Call " + K.settings.firm + " on " + (K.settings.officePhone || "the office") + "." }));
  }
  const kpi = (l, v) => h("div", { class: "kpi" }, h("small", { text: l }), h("b", { text: v }));

  let key = "";
  onChange(() => {
    if (!acc() || !shell.querySelector(".portal-form")) { if (acc() || !shell.querySelector(".portal-pick")) render(); return; }
    const k = K.jobs.filter(j => j.account === accId).map(j => j.id + j.status + (j.driverId || "")).join(",");
    if (k === key) return; key = k;
    const l = shell.querySelector(".portal-list"); if (l) l.replaceWith(list(acc()));
  });
  render();
}
function logoSvg(size) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 120 120"); s.setAttribute("width", size); s.setAttribute("height", size); s.innerHTML = '<use href="#logo"/>'; s.classList.add("logo"); return s; }
