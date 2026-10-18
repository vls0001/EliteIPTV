// Driver app: go available, take offers, run the job, take cash or card, and track earnings, tax and documents.
import { APP, VEHICLES, DOCS, SOURCES, MOBILITY } from "../config.js";
import { h, fill, icon, toast, store, stamp, fmtTime, confirmBox, relTime, modal } from "../lib/dom.js";
import { posOf, etaMinutes, money, zoneOf, zoneName, routeMiles, driveMinutes } from "../lib/geo.js";
import { routeBetween, describe } from "../lib/mapdata.js";
import { nextStep, turnText, fmtDist, TURN_ICON, navLinks } from "../features/directions.js";
import { busiestAreas, hotSpots, eventsBetween } from "../features/planner.js";
import { startGps, stopGps, gpsOn } from "../features/gps.js";
import { createMap } from "../lib/map.js";
import { offerSound, alarm, vibrate, ping } from "../lib/sound.js";
import { K, onChange, driversList, jobOfDriver, offerFor, nextJobOf, etaTo, markCalled, addLost, setLost, accept, decline, arrive, pob, complete, cancel, setStatus, queuePos, sendMsg, sos, earnings, taxYearStart, addExpense, delExpense, weekKey, saveDriver } from "../store.js";

export function mountDriver(root) {
  let meId = store.get("driverId", null);
  let tab = "drive";
  let completing = null;
  let lastOffer = null, lastMsgAt = Date.now();
  root.classList.add("app-root");
  const shell = h("div", { class: "phone-app driver" });
  fill(root, shell);
  let map = null, mapBox = null;

  const me = () => meId && K.drivers[meId];
  const editing = () => { const a = document.activeElement; return a && shell.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };

  // ---------- sign in ----------
  function renderSignIn() {
    if (map) { map.destroy(); map = null; }
    const list = driversList().sort((a, b) => (K.api.mode === "demo" ? (b.id === "d07") - (a.id === "d07") : 0) || +a.call - +b.call);
    fill(shell, h("div", { class: "d-signin" },
      h("div", { class: "d-brand" }, logoSvg(44), h("b", { text: APP.name + " Driver" })),
      h("p", { class: "dim", text: K.api.mode === "demo" ? "Demo: pick a car to drive. The others are driven by the demo." : "Pick your car to sign in." }),
      list.length ? h("div", { class: "d-cars" }, list.map(d => h("button", { type: "button", class: "d-carpick", onclick: () => signIn(d) },
        h("span", { class: "d-call", text: d.call }), h("span", {}, h("b", { text: d.name }), h("small", { class: "dim", text: d.car.colour + " " + d.car.make + " " + d.car.model + " · " + d.car.reg })),
        null)))
        : h("p", { class: "dim", text: "No drivers set up yet. Add them in the office first." })));
  }
  async function signIn(d) {
    meId = d.id; store.set("driverId", d.id);
    if (d.sim) { store.set("wasSim." + d.id, true); await saveDriver(d.id, { sim: false }); }
    render();
  }
  async function signOut() {
    const d = me();
    if (d && d.status !== "off" && !(await confirmBox("Sign out?", "You'll go offline and stop getting jobs.", "Sign out"))) return;
    if (d) { await setStatus(d, "off"); if (store.get("wasSim." + d.id)) await saveDriver(d.id, { sim: true, status: "free" }); }
    meId = null; store.set("driverId", null); render();
  }

  // ---------- shell ----------
  function render() {
    const d = me();
    if (!d) return renderSignIn();
    if (!shell.querySelector(".d-main")) {
      mapBox = h("div", { class: "d-map" });
      fill(shell, h("header", { class: "d-hd" }), mapBox, h("main", { class: "d-main" }), h("nav", { class: "d-tabs" }));
      map = createMap(mapBox, { compact: true });
      mapBox.append(h("div", { class: "d-nav", id: "d-nav", hidden: true }));
      if (store.get("gps." + d.id)) turnGps(d, true);
      map.setFollow(() => { const x = me(); return x ? Object.assign(posOf(x), { w: 1500 }) : null; });
    }
    shell.dataset.tab = tab;
    renderHeader(d); renderTabs(); renderMain(d); updateMap(d);
  }

  function renderHeader(d) {
    const qp = d.status === "free" ? queuePos(d) : null;
    const unread = K.msgs.filter(m => m.driverId === d.id && m.from === "dispatch" && m.at > (store.get("readMsgs." + d.id, 0))).length;
    fill(shell.querySelector(".d-hd"),
      h("div", { class: "d-who" }, h("span", { class: "d-call", text: d.call }), h("div", {}, h("b", { text: d.name.split(" ")[0] }), h("small", { class: "dim", text: zoneName(zoneOf(posOf(d))) + (qp ? " · " + ordinal(qp) + " in queue" : d.status === "busy" ? " · on a job" : "") }))),
      h("div", { class: "d-status" }, [["free", "Available"], ["break", "Break"], ["off", "Off"]].map(([k, l]) => h("button", {
        type: "button", class: "d-st " + k + ((d.status === k || (k === "free" && d.status === "busy")) ? " on" : ""), disabled: d.status === "busy",
        onclick: () => setStatus(d, k),
      }, l))),
      h("button", { type: "button", class: "ibtn", "aria-label": "Messages", onclick: () => { tab = "more"; render(); setTimeout(() => { const i = document.getElementById("d-msg"); if (i) i.scrollIntoView(); }, 50); } }, icon("thread", 20), unread ? h("span", { class: "ibadge", text: unread }) : null));
  }
  const ordinal = n => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

  function renderTabs() {
    const t = (k, ic, l) => h("button", { type: "button", class: "d-tab" + (tab === k ? " on" : ""), onclick: () => { tab = k; completing = null; render(); } }, icon(ic, 22), h("span", { text: l }));
    fill(shell.querySelector(".d-tabs"), t("drive", "car", "Drive"), t("earn", "wallet", "Earnings"), t("tax", "receipt", "Tax"), t("more", "doc", "More"));
  }

  function renderMain(d) {
    const main = shell.querySelector(".d-main");
    if (tab === "drive") return drive(main, d);
    if (tab === "earn") return earn(main, d);
    if (tab === "tax") return tax(main, d);
    return more(main, d);
  }

  // ---------- drive ----------
  function drive(main, d) {
    const o = offerFor(d.id), j = jobOfDriver(d.id);
    if (o) return offerCard(main, d, o);
    if (j) return completing === j.id ? completeCard(main, d, j) : jobCard(main, d, j);
    const today = earnings(d.id, startOfDay());
    const msgs = K.msgs.filter(m => m.driverId === d.id).slice(-1);
    fill(main,
      h("div", { class: "d-idle" },
        d.status === "free" ? h("div", { class: "d-wait" }, h("span", { class: "live-dot" }), h("div", {}, h("b", { text: "You're available" }), h("small", { class: "dim", text: "Jobs pop up here. Keep the app open." })))
          : d.status === "break" ? h("div", { class: "d-wait" }, icon("coffee", 22), h("div", {}, h("b", { text: "On a break" }), h("small", { class: "dim", text: "Tap Available when you're ready." })))
          : h("div", { class: "d-wait" }, icon("power", 22), h("div", {}, h("b", { text: "You're offline" }), h("small", { class: "dim", text: "Tap Available to start taking jobs." }))),
        h("div", { class: "d-stats" },
          stat("Today", money(today.total)), stat("Jobs", today.count), stat("Cash", money(today.cash)), stat("Card", money(today.card))),
        hotCard(d),
        msgs.length ? h("div", { class: "d-msgcard" }, icon("headset", 16), h("div", {}, h("small", { class: "dim", text: (msgs[0].from === "dispatch" ? "Base" : "You") + " · " + relTime(msgs[0].at) }), h("p", { text: msgs[0].text }))) : null,
        h("button", { type: "button", class: "d-sos", onclick: async () => { if (await confirmBox("Send an emergency alert?", "The office will see your location straight away.", "Send SOS", true)) { await sos(d.id); vibrate([300, 100, 300]); toast("SOS sent to the office.", "bad"); } } }, icon("alert", 16), "SOS")));
  }
  let showHeat = store.get("heat", true);
  function hotCard(d) {
    if (d.status === "off") return null;
    const areas = busiestAreas(Date.now(), 3);
    const evs = eventsBetween(Date.now() - 3600000, Date.now() + 12 * 3600000).filter(e => !e.nightly || e.start > Date.now() - 3600000).slice(0, 2);
    if (!areas.length && !evs.length) return null;
    return h("div", { class: "d-hot" },
      h("div", { class: "d-hot-hd" }, icon("flame", 16), h("b", { class: "grow", text: "Busy around now" }), h("button", { type: "button", class: "link-btn", onclick: () => { showHeat = !showHeat; store.set("heat", showHeat); updateMap(d); renderMain(d); } }, showHeat ? "Hide on map" : "Show on map")),
      areas.map(a => h("div", { class: "d-hot-row" }, h("span", { class: "grow", text: a.name }), h("small", { class: "dim", text: a.event ? a.event.name : "busy at this time" }))),
      evs.map(e => h("div", { class: "d-hot-row ev" }, icon("calendar", 14), h("span", { class: "grow", text: e.name }), h("small", { class: "dim", text: "ends " + fmtTime(e.end) }))));
  }
  const stat = (l, v) => h("div", { class: "d-stat" }, h("small", { text: l }), h("b", { text: v }));
  const startOfDay = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };

  function offerCard(main, d, o) {
    const left = Math.max(0, Math.ceil((o.offer.until - Date.now()) / 1000));
    const cur = jobOfDriver(d.id);
    const from = cur ? cur.drop : posOf(d);
    const toPick = driveMinutes(from, o.pickup) + (cur ? etaTo(d, cur.drop) || 0 : 0);
    const acc = o.account && K.accounts[o.account];
    fill(main, h("div", { class: "d-offer" + (cur ? " next" : "") },
      h("div", { class: "d-offer-hd" }, h("b", { text: cur ? "Next job" : "New job" }), h("span", { class: "d-timer", id: "d-timer", style: { "--p": left / APP.offerSeconds }, text: left })),
      cur ? h("div", { class: "d-nextnote" }, icon("repeat", 14), "Starts after you drop off at " + cur.drop.name) : null,
      h("div", { class: "d-fare", text: money(o.fare) }),
      h("div", { class: "dim center", text: o.miles + " mi trip · pick-up " + toPick + " min " + (cur ? "from now" : "away") + " · " + (SOURCES[o.source] || o.source) }),
      h("div", { class: "d-route" }, line("a", o.pickup.name), line("b", o.drop.name)),
      h("div", { class: "d-tags" }, acc ? h("span", { class: "pill info", text: acc.name }) : null, h("span", { class: "pill", text: VEHICLES[o.vehicle].label }), h("span", { class: "pill", text: o.passengers + " pax" }), o.mobility && o.mobility !== "walks" ? h("span", { class: "pill warn", text: MOBILITY[o.mobility] }) : null, o.notes ? h("span", { class: "pill warn", text: o.notes }) : null),
      h("div", { class: "d-btns" },
        h("button", { type: "button", class: "d-btn ghost", onclick: () => decline(o, d.id) }, "Decline"),
        h("button", { type: "button", class: "d-btn go", onclick: () => accept(o, d) }, "Accept"))));
  }

  function jobCard(main, d, j) {
    const moving = d.move && Date.now() < d.move.startAt + d.move.dur * 1000;
    const eta = etaTo(d, j.status === "pob" ? j.drop : j.pickup);
    const acc = j.account && K.accounts[j.account];
    const who = j.passenger && j.passenger.name ? j.passenger.name : j.customer.name || "Customer";
    const phone = (j.passenger && j.passenger.phone) || j.customer.phone;
    let title, step, actions;
    if (j.status === "accepted") {
      title = "Go to pick-up"; step = 1;
      actions = [h("button", { type: "button", class: "d-btn go" + (moving ? " soft" : ""), onclick: () => arrive(j) }, moving ? "I'm outside (" + eta + " min away)" : "I'm outside")];
    } else if (j.status === "arrived") {
      title = "Waiting for " + who.split(" ")[0]; step = 2;
      actions = [
        h("button", { type: "button", class: "d-btn go", onclick: () => pob(j, d) }, "Passenger on board"),
        h("button", { type: "button", class: "d-btn ghost", onclick: () => noShow(d, j) }, "No show")];
    } else {
      title = "Drop off"; step = 3;
      actions = [h("button", { type: "button", class: "d-btn go" + (moving ? " soft" : ""), onclick: () => { completing = j.id; render(); } }, moving ? "Complete trip (" + eta + " min to go)" : "Complete trip")];
    }
    const target = j.status === "pob" ? j.drop : j.pickup;
    const links = navLinks(target);
    const nx = nextJobOf(d.id);
    fill(main, h("div", { class: "d-job" },
      h("div", { class: "d-steps" }, ["Pick-up", "Outside", "On board"].map((s, i) => h("span", { class: i + 1 < step ? "done" : i + 1 === step ? "on" : "", text: s }))),
      h("h2", { text: title }),
      j.status === "arrived" ? h("div", { class: "d-waittime", id: "d-wait", "data-since": j.arrivedAt, text: "Waiting " + mins(j.arrivedAt) }) : null,
      h("div", { class: "d-route" }, line("a", j.pickup.name, j.status !== "pob"), line("b", j.drop.name, j.status === "pob")),
      acc ? h("div", { class: "d-acc" }, icon(acc.kind === "nhs" ? "cross" : "briefcase", 15), h("div", { class: "grow" }, h("b", { text: acc.name }), h("small", { class: "dim", text: [j.ref, j.mobility && MOBILITY[j.mobility], j.escorts ? j.escorts + " escort" + (j.escorts > 1 ? "s" : "") : "", j.appointment ? "appointment " + fmtTime(j.appointment) : "", "no payment to take"].filter(Boolean).join(" · ") }))) : null,
      h("div", { class: "d-cust" }, h("div", {}, h("b", { text: who }), h("small", { class: "dim", text: j.passengers + " pax · " + money(j.fare) + (j.passenger && j.passenger.name ? " · booked by " + (j.customer.name || "").split(" (")[0] : "") + (j.notes ? " · " + j.notes : "") })),
        phone ? h("a", { class: "ibtn", href: "tel:" + phone.replace(/\s/g, ""), "aria-label": "Call " + who, onclick: () => markCalled(j) }, icon("phone", 18)) : null),
      h("div", { class: "d-navbtns" },
        h("a", { class: "d-navbtn", href: links.google, target: "_blank", rel: "noopener" }, icon("nav", 16), "Google Maps"),
        h("a", { class: "d-navbtn", href: links.waze, target: "_blank", rel: "noopener" }, icon("nav", 16), "Waze")),
      nx ? h("div", { class: "d-nextjob" }, icon("repeat", 15), h("span", {}, "Next: ", h("b", { text: nx.pickup.name }), " → " + nx.drop.name)) : null,
      h("div", { class: "d-btns col" }, actions)));
  }
  // no-show: record how long the driver waited, whether they called, and where they were
  async function noShow(d, j) {
    const waited = Math.floor((Date.now() - (j.arrivedAt || Date.now())) / 1000);
    const short = waited < 300, called = !!j.calledAt;
    const msg = "You've waited " + Math.floor(waited / 60) + ":" + String(waited % 60).padStart(2, "0") + (called ? " and called them." : " and haven't called them yet.") + (short || !called ? " Most firms ask for 5 minutes and a call first." : " This is saved as proof.");
    if (!(await confirmBox("Mark as no show?", msg, "No show", true))) return;
    const p = posOf(d);
    cancel(j, "noshow", { at: Date.now(), waitedSecs: waited, called, calledAt: j.calledAt || null, x: Math.round(p.x), y: Math.round(p.y), place: describe(p).name, distM: Math.round(Math.hypot(p.x - j.pickup.x, p.y - j.pickup.y)) });
  }
  const mins = t => { const s = Math.floor((Date.now() - (t || Date.now())) / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const line = (cls, text, on) => h("div", { class: "b-line" + (on ? " on" : "") }, h("i", { class: cls }), h("span", { text }));

  function completeCard(main, d, j) {
    const fareIn = h("input", { class: "d-fare-in", id: "d-fare", type: "number", step: "0.1", min: "0", inputmode: "decimal", value: j.fare.toFixed(2), "aria-label": "Fare" });
    const done = pay => { const f = parseFloat(fareIn.value); if (!(f >= 0)) { toast("Check the fare."); return; } completing = null; complete(j, d, f, pay).then(() => toast("Job complete · " + money(f) + " " + pay, "ok")); };
    if (j.pay === "account" || j.account) {
      const acc = K.accounts[j.account];
      fill(main, h("div", { class: "d-complete" },
        h("h2", { text: "On account" }),
        h("p", { class: "dim center", text: "No payment to take. " + money(j.fare) + " is billed to " + (acc ? acc.name : "the account") + " and paid to you by the office." }),
        h("label", { class: "d-fare-row", for: "d-fare" }, h("span", { text: "£" }), fareIn),
        h("p", { class: "dim center small", text: "Only change the fare if the account agreed to waiting time or extras." }),
        h("button", { type: "button", class: "d-btn go", onclick: () => done("account") }, "Complete trip"),
        h("button", { type: "button", class: "link-btn center", onclick: () => { completing = null; render(); } }, "Back")));
      setTimeout(() => fareIn.blur(), 30);
      return;
    }
    fill(main, h("div", { class: "d-complete" },
      h("h2", { text: "Take payment" }),
      h("label", { class: "d-fare-row", for: "d-fare" }, h("span", { text: "£" }), fareIn),
      h("p", { class: "dim center", text: "Quoted " + money(j.fare) + ". Change it if there were extras or waiting time." }),
      h("div", { class: "d-btns" },
        h("button", { type: "button", class: "d-btn pay", onclick: () => done("cash") }, icon("pound", 22), "Cash"),
        h("button", { type: "button", class: "d-btn pay", onclick: () => done("card") }, icon("wallet", 22), "Card")),
      h("button", { type: "button", class: "link-btn center", onclick: () => { completing = null; render(); } }, "Back")));
    setTimeout(() => fareIn.select(), 30);
  }

  // ---------- earnings ----------
  let earnRange = "week";
  function earn(main, d) {
    const ranges = { today: startOfDay(), week: new Date(weekKey()).getTime(), year: taxYearStart() };
    const e = earnings(d.id, ranges[earnRange]);
    const wk = weekKey();
    const rentRow = K.rent.find(r => r.driverId === d.id && r.week === wk);
    const rentDue = d.rent || 0;
    const days = [];
    for (let i = 6; i >= 0; i--) { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - i); const v = earnings(d.id, t.getTime(), t.getTime() + 86400000 - 1).total; days.push([t, v]); }
    const max = Math.max(1, ...days.map(x => x[1]));
    fill(main, h("div", { class: "d-earn" },
      h("div", { class: "seg" }, [["today", "Today"], ["week", "This week"], ["year", "Tax year"]].map(([k, l]) => h("button", { type: "button", class: "seg-btn" + (earnRange === k ? " on" : ""), onclick: () => { earnRange = k; render(); } }, l))),
      h("div", { class: "d-big" }, h("small", { class: "dim", text: "Takings" }), h("b", { text: money(e.total) }), h("span", { class: "dim", text: e.count + " jobs · " + e.miles.toFixed(0) + " paid miles" })),
      h("div", { class: "d-split" },
        h("div", {}, h("small", { text: "Cash" }), h("b", { text: money(e.cash) })),
        h("div", {}, h("small", { text: "Card" }), h("b", { text: money(e.card) })),
        e.account ? h("div", {}, h("small", { text: "Account" }), h("b", { text: money(e.account) })) : null),
      e.account && earnRange === "week" ? h("p", { class: "dim small", text: "Account work is paid to you by the office, usually against your rent." }) : null,
      earnRange !== "year" ? h("div", { class: "d-rent" + (rentRow && rentRow.paid ? " paid" : "") }, h("div", {}, h("small", { class: "dim", text: "Weekly rent to " + K.settings.firm }), h("b", { text: money(rentDue) })), h("span", { class: "pill " + (rentRow && rentRow.paid ? "ok" : "warn"), text: rentRow && rentRow.paid ? "Paid" : "Due" })) : null,
      earnRange === "week" ? h("div", { class: "d-net" }, h("span", { text: "After rent this week" }), h("b", { text: money(e.total - rentDue) })) : null,
      h("div", { class: "lbl", text: "Last 7 days" }),
      h("div", { class: "bars" }, days.map(([t, v]) => h("div", { class: "bar" }, h("span", { class: "bar-v", text: v ? "£" + Math.round(v) : "" }), h("i", { style: { height: Math.max(3, v / max * 100) + "%" } }), h("small", { text: t.toLocaleDateString([], { weekday: "narrow" }) })))),
      h("div", { class: "lbl", text: "Recent jobs" }),
      h("div", { class: "d-list" }, e.jobs.sort((a, b) => b.doneAt - a.doneAt).slice(0, 12).map(j => h("div", { class: "d-row" }, h("div", {}, h("b", { text: j.drop.name }), h("small", { class: "dim", text: stamp(j.doneAt) + " · from " + j.pickup.name })), h("span", { class: "d-row-v" }, money(j.fare), h("small", { class: "dim", text: j.pay })))))));
  }

  // ---------- tax ----------
  function tax(main, d) {
    const from = taxYearStart();
    const e = earnings(d.id, from);
    const ex = K.expenses.filter(x => x.driverId === d.id && x.at >= from);
    const exTotal = ex.reduce((a, x) => a + (x.amount || 0), 0);
    const rentPaid = K.rent.filter(r => r.driverId === d.id && r.paid && new Date(r.week).getTime() >= from).reduce((a, r) => a + (r.amount || 0), 0);
    const totalMiles = e.miles * 1.6; // paid miles plus dead miles (rough)
    const mileage = Math.min(totalMiles, 10000) * 0.45 + Math.max(0, totalMiles - 10000) * 0.25;
    const actualProfit = e.total - exTotal - rentPaid;
    const simpleProfit = e.total - mileage - rentPaid;
    const kind = h("select", { class: "input", id: "x-kind" }, [["fuel", "Fuel"], ["repairs", "Repairs and servicing"], ["insurance", "Insurance"], ["phone", "Phone"], ["cleaning", "Cleaning"], ["licence", "Licence and badge fees"], ["other", "Other"]].map(([v, l]) => h("option", { value: v, text: l })));
    const amt = h("input", { class: "input", id: "x-amt", type: "number", step: "0.01", min: "0", inputmode: "decimal", placeholder: "£" });
    const note = h("input", { class: "input", id: "x-note", placeholder: "Note (optional)", maxlength: 60 });
    const tyLabel = new Date(from).getFullYear() + "/" + String(new Date(from).getFullYear() + 1).slice(2);
    fill(main, h("div", { class: "d-tax" },
      h("div", { class: "d-big" }, h("small", { class: "dim", text: "Tax year " + tyLabel + " so far" }), h("b", { text: money(e.total) }), h("span", { class: "dim", text: "income from " + e.count + " jobs" })),
      h("div", { class: "d-taxgrid" },
        h("div", {}, h("small", { text: "Expenses" }), h("b", { text: money(exTotal) })),
        h("div", {}, h("small", { text: "Rent paid" }), h("b", { text: money(rentPaid) })),
        h("div", {}, h("small", { text: "Profit (actual costs)" }), h("b", { text: money(actualProfit) })),
        h("div", {}, h("small", { text: "Profit (mileage method)" }), h("b", { text: money(simpleProfit) }))),
      h("p", { class: "note small" }, "Self-employed drivers can claim actual running costs or a flat 45p a mile (25p after 10,000). Pick whichever leaves less profit. These are estimates, not tax advice; check with an accountant or HMRC."),
      h("div", { class: "lbl", text: "Add an expense" }),
      h("div", { class: "d-addx" }, kind, amt, note, h("button", { type: "button", class: "btn primary", onclick: async () => { const a = parseFloat(amt.value); if (!(a > 0)) { toast("Enter an amount."); return; } await addExpense({ driverId: d.id, kind: kind.value, amount: Math.round(a * 100) / 100, note: note.value.trim() }); amt.value = ""; note.value = ""; toast("Expense added.", "ok"); } }, "Add")),
      h("div", { class: "d-list" }, ex.slice(0, 30).map(x => h("div", { class: "d-row" }, h("div", {}, h("b", { text: x.kind[0].toUpperCase() + x.kind.slice(1) }), h("small", { class: "dim", text: stamp(x.at) + (x.note ? " · " + x.note : "") })), h("span", { class: "d-row-v" }, money(x.amount)), h("button", { type: "button", class: "ibtn sm", "aria-label": "Delete expense", onclick: () => delExpense(x.id) }, icon("x", 14))))),
      h("button", { type: "button", class: "btn", onclick: () => exportCsv(d, e, ex, from) }, icon("upload", 16), "Export for my accountant (CSV)")));
  }
  async function exportCsv(d, e, ex, from) {
    const rows = [["Date", "Type", "Description", "Amount", "Payment"]];
    for (const j of e.jobs) rows.push([new Date(j.doneAt).toISOString().slice(0, 10), "Income", j.pickup.name + " to " + j.drop.name, j.fare.toFixed(2), j.pay]);
    for (const x of ex) rows.push([new Date(x.at).toISOString().slice(0, 10), "Expense: " + x.kind, x.note || "", (-x.amount).toFixed(2), ""]);
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    if (!K.api.download) { toast("Downloads aren't available here."); return; }
    try { await K.api.download("kerb-" + d.call + "-tax-" + new Date(from).getFullYear() + ".csv", csv); } catch (err) { if (!err || err.code !== "declined") toast("Couldn't save the file."); }
  }

  // ---------- more: docs, messages, car ----------
  function more(main, d) {
    const today = new Date();
    const docRow = (k, label) => {
      const date = d.docs && d.docs[k];
      const days = date ? Math.round((new Date(date) - today) / 86400000) : null;
      const tone = days == null ? "dim" : days < 0 ? "bad" : days < 30 ? "warn" : "ok";
      return h("div", { class: "d-row" }, h("div", {}, h("b", { text: label }), h("small", { class: "dim", text: date ? "Expires " + new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not added" })),
        h("span", { class: "pill " + tone, text: days == null ? "Missing" : days < 0 ? "Expired" : days < 30 ? days + " days left" : "OK" }));
    };
    const msgs = K.msgs.filter(m => m.driverId === d.id).slice(-20);
    store.set("readMsgs." + d.id, Date.now());
    const msgIn = h("input", { class: "input", id: "d-msg", placeholder: "Message the office", maxlength: 300, enterkeyhint: "send" });
    const send = () => { const t = msgIn.value.trim(); if (!t) return; msgIn.value = ""; sendMsg(d.id, "driver", t); };
    msgIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send(); } });
    fill(main, h("div", { class: "d-more" },
      h("div", { class: "d-car" }, h("span", { class: "d-call big", text: d.call }), h("div", {}, h("b", { text: d.name }), h("small", { class: "dim", text: d.car.colour + " " + d.car.make + " " + d.car.model }), h("span", { class: "plate", text: d.car.reg }))),
      h("div", { class: "lbl", text: "Messages with the office" }),
      h("div", { class: "d-chat" }, msgs.length ? msgs.map(m => h("div", { class: "c-msg " + (m.from === "driver" ? "me" : "bot") }, m.text, h("small", { text: fmtTime(m.at) }))) : h("p", { class: "dim", text: "No messages yet." })),
      h("div", { class: "c-input" }, msgIn, h("button", { type: "button", class: "b-send", "aria-label": "Send", onclick: send }, icon("send", 18))),
      h("div", { class: "lbl", text: "Location" }),
      h("label", { class: "toggle-row", for: "d-gps" }, h("span", { class: "grow" }, h("b", { text: "Use my phone's GPS" }), h("small", { class: "dim", id: "d-gps-note", text: d.gps ? "Sharing your location" + (d.gpsAcc ? " (±" + d.gpsAcc + " m)" : "") + ", updated " + relTime(d.gpsAt || Date.now()) : K.api.mode === "demo" ? "Off. The demo moves your car for you." : "Off. Your car's position is estimated from its route." })),
        (() => { const t = h("input", { type: "checkbox", class: "tg", id: "d-gps" }); t.checked = !!d.gps || gpsOn(); t.addEventListener("change", () => turnGps(d, t.checked)); return t; })()),
      h("div", { class: "lbl", text: "Lost property" }),
      lostList(d),
      h("button", { type: "button", class: "btn", onclick: () => logLost(d) }, icon("box", 16), "Log something left in the car"),
      h("div", { class: "lbl", text: "Documents" }),
      h("div", { class: "d-list" }, Object.entries(DOCS).map(([k, l]) => docRow(k, l))),
      h("p", { class: "dim small", text: "You'll get a reminder 30 days before anything expires." }),
      h("button", { type: "button", class: "btn", onclick: signOut }, icon("logout", 16), "Sign out")));
  }

  function turnGps(d, on) {
    store.set("gps." + d.id, on);
    if (!on) { stopGps(); toast("GPS off."); return; }
    startGps(d.id, err => { store.set("gps." + d.id, false); toast(err, "bad"); const t = document.getElementById("d-gps"); if (t) t.checked = false; }, () => {});
  }
  function lostList(d) {
    const items = K.lost.filter(x => x.driverId === d.id && x.status !== "returned" && x.status !== "disposed");
    if (!items.length) return h("p", { class: "dim small", text: "Nothing waiting. Items customers report go here." });
    return h("div", { class: "d-list" }, items.map(x => h("div", { class: "d-row" }, h("div", {}, h("b", { text: x.item }), h("small", { class: "dim", text: (x.by === "customer" ? "Reported by " + ((x.customer && x.customer.name) || "the customer") : "You logged it") + " · " + relTime(x.at) })),
      x.status === "reported" || x.status === "driver" ? h("button", { type: "button", class: "btn sm", onclick: () => setLost(x, { status: "office", handedInAt: Date.now() }).then(() => toast("Marked as handed in to the office.", "ok")) }, "Handed in") : h("span", { class: "pill", text: "At office" }))));
  }
  function logLost(d) {
    const recent = K.jobs.filter(j => j.driverId === d.id && j.status === "done").sort((a, b) => b.doneAt - a.doneAt).slice(0, 6);
    const sel = h("select", { class: "input", id: "ll-job" }, recent.map(j => h("option", { value: j.id, text: fmtTime(j.doneAt) + " · " + j.pickup.name + " → " + j.drop.name })), h("option", { value: "", text: "Not sure which job" }));
    const item = h("input", { class: "input", id: "ll-item", placeholder: "What is it? e.g. black wallet", maxlength: 80 });
    const det = h("input", { class: "input", id: "ll-det", placeholder: "Where you found it", maxlength: 120 });
    const m = modal({ title: "Lost property", body: h("div", { class: "form" }, h("label", { class: "field", for: "ll-job" }, h("span", { text: "Which job?" }), sel), item, det),
      actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!item.value.trim()) { toast("Say what you found."); return; }
        const j = K.jobs.find(x => x.id === sel.value);
        await addLost({ item: item.value.trim(), details: det.value.trim(), jobId: sel.value || null, driverId: d.id, customer: j ? (j.passenger && j.passenger.name ? j.passenger : j.customer) : null, by: "driver", status: "driver" });
        m.close(); toast("Logged. The office will contact the customer.", "ok");
      } }, "Log it")] });
  }

  // ---------- map & live updates ----------
  function updateMap(d) {
    if (!map) return;
    const j = jobOfDriver(d.id) || offerFor(d.id);
    map.update({ drivers: [d], jobs: j ? [j] : [], me: d.id, focus: j ? j.id : null, onlyRoute: d.id });
    const heatOn = showHeat && !j && d.status !== "off";
    const hk = heatOn ? "on" + Math.floor(Date.now() / 300000) : "off";
    if (hk !== lastHeat) { lastHeat = hk; map.setHeat(heatOn ? hotSpots() : null); }
  }
  let lastHeat = "";
  // turn-by-turn banner over the map
  let gpsRoute = null;
  function updateNav(d) {
    const el = document.getElementById("d-nav"); if (!el) return;
    const j = jobOfDriver(d.id);
    if (!j || j.status === "arrived" || tab !== "drive") { el.hidden = true; return; }
    const target = j.status === "pob" ? j.drop : j.pickup;
    let move = d.move;
    if (!move || !move.path) {
      const key = j.id + j.status;
      if (!gpsRoute || gpsRoute.key !== key || Date.now() - gpsRoute.at > 30000) gpsRoute = { key, at: Date.now(), move: { path: routeBetween(posOf(d), target).path, startAt: 0, dur: 1 } };
      move = gpsRoute.move;
    }
    const n = nextStep(move, d.move ? null : posOf(d));
    if (!n) { el.hidden = true; return; }
    el.hidden = false;
    fill(el, h("span", { class: "d-nav-ic" }, icon(TURN_ICON[n.step.turn] || "straight", 26)),
      h("div", { class: "grow" }, h("b", { text: fmtDist(n.in) }), h("span", { text: turnText(n.step, target.name) }),
        n.then && n.in < 400 ? h("small", { text: "Then " + turnText(n.then, target.name).replace(/^./, c => c.toLowerCase()) }) : null));
  }

  let lastKey = "";
  onChange(() => {
    const d = me();
    if (!d) { if (!shell.querySelector(".d-signin") || !editing()) render(); return; }
    const o = offerFor(d.id);
    if (o && o.id !== lastOffer) { lastOffer = o.id; offerSound(); vibrate(); if (tab !== "drive") { tab = "drive"; } }
    if (!o) lastOffer = null;
    const lastIn = K.msgs.filter(m => m.driverId === d.id && m.from === "dispatch").slice(-1)[0];
    if (lastIn && lastIn.at > lastMsgAt) { lastMsgAt = lastIn.at; ping(); toast("Office: " + lastIn.text); }
    const j = jobOfDriver(d.id);
    const key = [tab, d.status, o ? o.id : "", j ? j.id + j.status : "", completing, K.msgs.length, K.expenses.length, K.rent.length, d.call, (nextJobOf(d.id) || {}).id, K.lost.length, !!d.gps].join("|");
    if (!shell.querySelector(".d-main")) return render();
    renderHeader(d); updateMap(d);
    if (key !== lastKey && !editing()) { lastKey = key; renderMain(d); renderTabs(); shell.dataset.tab = tab; }
  });
  setInterval(() => {
    const d = me(); if (!d) return;
    const o = offerFor(d.id);
    const t = document.getElementById("d-timer");
    if (o && t) { const left = Math.max(0, Math.ceil((o.offer.until - Date.now()) / 1000)); t.textContent = left; t.style.setProperty("--p", left / APP.offerSeconds); }
    const w = document.getElementById("d-wait"); if (w) w.textContent = "Waiting " + mins(+w.dataset.since);
    updateNav(d);
    const j = jobOfDriver(d.id);
    if (j && tab === "drive" && completing !== j.id && !editing()) renderMain(d);
  }, 1000);
  render();
}

function logoSvg(size) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 120 120"); s.setAttribute("width", size); s.setAttribute("height", size); s.innerHTML = '<use href="#logo"/>'; s.classList.add("logo"); return s; }
