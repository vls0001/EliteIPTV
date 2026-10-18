// Demo data. Also documents the data model (same paths in every backend):
//   settings/firm                 firm name, tariff, boost, dispatch mode, demo switches
//   drivers/{id}                  call sign, name, phone, car, status (off|free|busy|break), x/y, move, queuedAt, rent, docs, sim
//   jobs/{id}                     status, pickup, drop, when, vehicle, passengers, customer, source, fare, pay, driverId, offer, timestamps, rating
//   customers/{phone}             name, phone, last pickup
//   rent/{driverId__week}         weekly rent: amount, paid, paidAt
//   expenses/{id}                 driver expenses for the tax tracker
//   msgs/{id}                     dispatch <-> driver messages
//   alerts/{id}                   driver SOS alerts
//   accounts/{id}                 account customers (NHS, council, hotels, care homes): tariff, booking ref rules, destinations
//   schedules/{id}                contract runs that book themselves (days, time, return time)
//   invoices/{account__yyyy-mm}   months marked as invoiced
//   calls/{id}                    incoming calls (from the phone system, or pretend ones in the demo)
//   complaints/{id}               customer complaints and low ratings to follow up
//   lost/{id}                     lost property
//   events/{id}                   busy nights for the planner (gigs, matches, the Illuminations)
//   texts/{id}                    every text message sent (or logged) to customers
import { DEFAULT_SETTINGS } from "../config.js";
import { quote, landmark, snap } from "../lib/geo.js";
import { MAP } from "../lib/mapdata.js";

export const DEMO_DRIVERS = [
  { id: "d07", call: "7", name: "Dave Holt", car: ["Skoda", "Octavia", "Silver", "PK19 XLD", "saloon"], status: "free", sim: false, at: "Winter Gardens" },
  { id: "d03", call: "3", name: "Mo Patel", car: ["Toyota", "Corolla", "White", "PO20 HNB", "saloon"], status: "free", at: "Blackpool North station" },
  { id: "d12", call: "12", name: "Gary Shaw", car: ["Kia", "Niro", "Blue", "PN21 KTA", "saloon"], status: "free", at: "Central Pier" },
  { id: "d15", call: "15", name: "Sue Brennan", car: ["Toyota", "Prius+", "Black", "PL18 WSE", "saloon"], status: "free", at: "Stanley Park" },
  { id: "d21", call: "21", name: "Imran Ali", car: ["Skoda", "Superb Estate", "Grey", "PO22 FVR", "estate"], status: "free", at: "Gynn Square" },
  { id: "d04", call: "4", name: "Kev Doyle", car: ["Hyundai", "Ioniq", "White", "PJ70 ZRC", "saloon"], status: "free", at: "Marton" },
  { id: "d09", call: "9", name: "Tracy Lund", car: ["Ford", "Mondeo", "Red", "PF17 OLB", "saloon"], status: "break", at: "Pleasure Beach" },
  { id: "d18", call: "18", name: "Jamal Okafor", car: ["Ford", "Galaxy", "Black", "PE68 GHY", "mpv"], status: "free", at: "Victoria Hospital" },
  { id: "d25", call: "25", name: "Paul Kerr", car: ["Peugeot", "e-Traveller", "White", "PK23 WAV", "wav"], status: "free", at: "Squires Gate station" },
  { id: "d30", call: "30", name: "Lee Burns", car: ["Toyota", "Corolla Estate", "Grey", "PN72 LEE", "estate"], status: "free", at: "Bispham" },
  { id: "d33", call: "33", name: "Chris Wade", car: ["Kia", "Ceed", "Blue", "PO16 CWD", "saloon"], status: "off", at: "Layton" },
];

const CUSTOMERS = [
  ["07700 900123", "Alex Morgan"], ["07700 900456", "Jean Fletcher"], ["07700 900789", "Ryan Cooper"],
  ["07700 900321", "Priya Shah"], ["07700 900654", "Tom Walsh"], ["07700 900987", "Linda Hart"],
  ["07700 900111", "Mick Rowe"], ["07700 900222", "Sophie Ward"],
];

export function weekKey(t = Date.now()) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function spotFor(d) {
  const l = landmark(d.at || "Blackpool Tower") || { x: 1500, y: 5600 };
  const p = snap({ x: l.x + 80 + Math.random() * 120, y: l.y + (Math.random() * 300 - 150) });
  return { x: p.x, y: p.y };
}
const stop = () => {
  if (Math.random() < 0.6) { const l = MAP.landmarks[Math.floor(Math.random() * MAP.landmarks.length)]; return { name: l.name, x: l.x, y: l.y }; }
  const list = MAP.popular.length ? MAP.popular : MAP.places; const p = list[Math.floor(Math.random() * list.length)]; return { name: p.name, x: p.x, y: p.y };
};

export function driverDoc(d, now = Date.now(), sim = true) {
  const day = 86400000;
  return {
    call: d.call, name: d.name, phone: "07700 9" + String(10000 + parseInt(d.call, 10) * 37).slice(-5),
    car: { make: d.car[0], model: d.car[1], colour: d.car[2], reg: d.car[3], type: d.car[4] },
    status: d.status, ...spotFor(d), move: null, queuedAt: now - Math.random() * 600000,
    sim: d.sim === false ? false : sim, rent: d.car[4] === "mpv" || d.car[4] === "wav" ? 140 : 120,
    docs: {
      badge: new Date(now + (d.call === "12" ? 12 : 200) * day).toISOString().slice(0, 10),
      licence: new Date(now + 900 * day).toISOString().slice(0, 10),
      insurance: new Date(now + (d.call === "4" ? -3 : d.call === "21" ? 20 : 150) * day).toISOString().slice(0, 10),
      mot: new Date(now + (d.call === "9" ? 25 : 240) * day).toISOString().slice(0, 10),
      plate: new Date(now + 300 * day).toISOString().slice(0, 10),
    },
    rating: 4.6 + Math.random() * 0.4, joinedAt: now - 400 * day, active: true,
  };
}

const place = n => { const l = landmark(n); if (l) return l; const p = MAP.places.find(x => x.name === n); return p ? { name: p.name, x: p.x, y: p.y } : null; };
const xy = n => { const p = place(n) || { x: 1500, y: 5600 }; return { x: p.x, y: p.y }; };
const addr = i => { const a = MAP.addresses[Math.floor(MAP.addresses.length * i)]; return a ? { name: a.name, x: a.x, y: a.y } : landmark("Bispham"); };
const at = (dayOff, hh, mm = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOff); d.setHours(hh, mm, 0, 0); return d.getTime(); };

export const DEMO_ACCOUNTS = {
  nhs: { name: "NHS Patient Transport", kind: "nhs", contact: "Transport desk, Victoria Hospital", phone: "01253 000101", email: "transport@example.nhs.uk",
    requireRef: true, refLabel: "NHS booking ref", tariff: { flag: 3, perMile: 1.9, minimum: 6 }, noNight: true, discount: 0, terms: "Invoice monthly, 30 days",
    destinations: ["Victoria Hospital", "Whitegate Health Centre", "Grange Park Health Centre", "Lytham Road Health Centre"], notes: "Wait up to 10 minutes. Help patients to the door." },
  council: { name: "Blackpool Council SEND transport", kind: "council", contact: "School transport team", phone: "01253 000202", email: "transport@example.gov.uk",
    requireRef: false, refLabel: "Route number", tariff: {}, noNight: true, discount: 5, terms: "Invoice monthly", destinations: ["Kincraig Primary School"], notes: "DBS-checked drivers only." },
  hotel: { name: "Promenade Hotels group", kind: "business", contact: "Front desk", phone: "01253 000303", email: "", requireRef: false, refLabel: "Room number", tariff: {}, noNight: false, discount: 10, terms: "Invoice monthly", destinations: [], notes: "" },
  care: { name: "Seaview Care Home", kind: "care", contact: "Manager", phone: "01253 000404", email: "", requireRef: false, refLabel: "Resident", tariff: {}, noNight: true, discount: 0, terms: "Invoice monthly", destinations: ["Victoria Hospital"], notes: "Most residents need a hand." },
};

export function seedDemo(put) {
  const now = Date.now(), day = 86400000;
  const settings = Object.assign({}, DEFAULT_SETTINGS);
  put("settings/firm", settings);
  for (const d of DEMO_DRIVERS) put("drivers/" + d.id, driverDoc(d, now));
  for (const [phone, name] of CUSTOMERS) put("customers/" + phone.replace(/\D/g, ""), { name, phone });

  // two weeks of finished jobs for earnings and reports
  const drivers = DEMO_DRIVERS.filter(d => d.id !== "d33");
  const sources = ["phone", "phone", "phone", "app", "app", "web", "whatsapp", "rank"];
  let n = 0;
  for (let back = 13; back >= 0; back--) {
    const count = 9 + Math.floor(Math.random() * 7) + (new Date(now - back * day).getDay() >= 5 ? 6 : 0);
    for (let i = 0; i < count; i++) {
      const start = new Date(now - back * day); start.setHours(7 + Math.floor(Math.random() * 17), Math.floor(Math.random() * 60), 0, 0);
      if (start.getTime() > now - 20 * 60000) continue;
      const a = stop();
      let b = stop(); for (let k = 0; k < 4 && Math.hypot(a.x - b.x, a.y - b.y) < 900; k++) b = stop();
      const q = quote(a, b, settings, "saloon", start.getTime());
      const drv = drivers[Math.floor(Math.random() * drivers.length)];
      const [phone, name] = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
      const t0 = start.getTime();
      put("jobs/h" + (++n), {
        status: Math.random() < 0.04 ? "cancelled" : "done", pickup: a, drop: b,
        when: t0, createdAt: t0, vehicle: drv.car[4], passengers: 1 + Math.floor(Math.random() * 3), customer: { name, phone }, source: sources[Math.floor(Math.random() * sources.length)],
        fare: q.fare, miles: q.miles, pay: Math.random() < 0.55 ? "cash" : "card", driverId: drv.id,
        acceptedAt: t0 + 40000, arrivedAt: t0 + (3 + Math.random() * 8) * 60000, pobAt: t0 + 10 * 60000, doneAt: t0 + (10 + q.mins) * 60000,
        rating: Math.random() < 0.4 ? (Math.random() < 0.85 ? 5 : 4) : null,
      });
    }
  }
  // rent: last two weeks paid (mostly), this week partly
  for (const d of drivers) for (let w = 2; w >= 0; w--) {
    const wk = weekKey(now - w * 7 * day);
    const paid = w > 0 ? Math.random() < 0.9 : Math.random() < 0.4;
    if (paid || w > 0) put("rent/" + d.id + "__" + wk, { driverId: d.id, week: wk, amount: d.car[4] === "mpv" || d.car[4] === "wav" ? 140 : 120, paid, paidAt: paid ? now - w * 7 * day : null });
  }
  // expenses for car 7 (the driver you play in the demo)
  const ex = [["fuel", 52.4, "Shell, Preston New Rd"], ["fuel", 48.1, "Tesco Clifton Rd"], ["phone", 18, "Phone contract"], ["repairs", 86, "Brake pads"], ["insurance", 145, "Monthly hire insurance"], ["cleaning", 12, "Valet"]];
  ex.forEach(([kind, amount, note], i) => put("expenses/e" + i, { driverId: "d07", kind, amount, note, at: now - (i * 2 + 1) * day }));
  // accounts and contract runs
  for (const [id, a] of Object.entries(DEMO_ACCOUNTS)) put("accounts/" + id, a);
  const vic = place("Victoria Hospital"), school = place("Kincraig Primary School") || place("Bispham"), wg = place("Whitegate Health Centre") || vic;
  put("schedules/dial1", { account: "nhs", customer: { name: "Victoria Hospital renal unit", phone: "01253 000101" }, passenger: { name: "Joan Barnes", phone: "07700 900345" }, pickup: addr(0.12), drop: vic, days: [1, 3, 5], time: "07:30", returnTime: "12:30", vehicle: "saloon", passengers: 1, mobility: "help", escorts: 0, ref: "DIA-2231", notes: "Dialysis. Help to the door, she uses a stick.", active: true, createdAt: now - 40 * day });
  put("schedules/sch1", { account: "council", customer: { name: "SEND transport", phone: "01253 000202" }, passenger: { name: "3 pupils (route 14)", phone: "" }, pickup: addr(0.31), drop: school, days: [1, 2, 3, 4, 5], time: "08:10", returnTime: "15:15", vehicle: "mpv", passengers: 4, escorts: 1, ref: "Route 14", notes: "Passenger assistant Mrs Khan travels with the pupils.", active: true, createdAt: now - 60 * day });
  put("schedules/care1", { account: "care", customer: { name: "Seaview Care Home", phone: "01253 000404" }, passenger: { name: "Resident: Mr P. Doyle", phone: "" }, pickup: addr(0.55), drop: vic, days: [2], time: "10:00", returnTime: "", vehicle: "wav", passengers: 1, mobility: "chair", escorts: 1, ref: "", notes: "Outpatients. Carer travels with him.", active: true, createdAt: now - 20 * day });
  // two weeks of NHS account work so invoices have something in them
  for (let back = 13, k = 0; back >= 1; back--) {
    for (let i = 0; i < 3; i++) {
      const t0 = new Date(now - back * day); t0.setHours(8 + i * 3, 15, 0, 0);
      const a = addr(0.05 + ((back * 7 + i * 13) % 90) / 100), b = i === 1 ? wg : vic;
      const q = quote(a, b, Object.assign({}, settings, DEMO_ACCOUNTS.nhs.tariff, { boost: 1, nightRate: 1 }), "saloon", t0.getTime());
      const drv = drivers[(back + i) % drivers.length];
      put("jobs/acc" + (++k), { status: "done", pickup: a, drop: b, when: t0.getTime(), createdAt: t0.getTime() - 86400000, vehicle: "saloon", passengers: 1, customer: { name: "Victoria Hospital transport", phone: "01253 000101" }, passenger: { name: ["Ann Price", "Bill Shaw", "Eileen Ward", "Frank Hill", "Mary Cole"][k % 5], phone: "" },
        source: "account", account: "nhs", ref: "NHS-" + (40210 + k), mobility: k % 3 ? "walks" : "help", fare: q.fare, miles: q.miles, pay: "account", driverId: drv.id,
        acceptedAt: t0.getTime() - 600000, arrivedAt: t0.getTime(), pobAt: t0.getTime() + 300000, doneAt: t0.getTime() + (5 + q.mins) * 60000, rating: null });
    }
  }
  // saved places for the demo customer
  put("customers/07700900123", { name: "Alex Morgan", phone: "07700 900123", places: [{ label: "Home", ...addr(0.4) }, { label: "Work", ...(place("Talbot Gateway") || addr(0.5)) }] });
  // complaints and lost property
  put("complaints/c1", { jobId: "h3", driverId: "d12", customer: { name: "Ryan Cooper", phone: "07700 900789" }, kind: "fare", text: "Charged £14 for a trip that's usually £9.", at: now - 2 * day, status: "open" });
  put("complaints/c2", { jobId: "h8", driverId: "d04", customer: { name: "Linda Hart", phone: "07700 900987" }, kind: "late", text: "Waited 25 minutes for a booked car.", at: now - 5 * day, status: "open" });
  put("complaints/c3", { jobId: "h12", driverId: "d03", customer: { name: "Tom Walsh", phone: "07700 900654" }, kind: "driving", text: "Went through an amber light quite fast.", at: now - 9 * day, status: "resolved", note: "Spoke to Mo, he apologised.", resolvedAt: now - 8 * day });
  put("lost/l1", { item: "Black umbrella", details: "Back seat", jobId: "h5", driverId: "d03", customer: { name: "Jean Fletcher", phone: "07700 900456" }, at: now - day, status: "driver", by: "driver" });
  put("lost/l2", { item: "iPhone in a blue case", details: "Found in the footwell", jobId: "h9", driverId: "d15", customer: null, at: now - 3 * day, status: "office", by: "driver" });
  // busy nights for the planner (examples)
  put("events/illum", { name: "Illuminations", venue: "Blackpool Tower", ...xy("Blackpool Tower"), start: at(0, 18, 30), end: at(0, 23, 0), nightly: true, until: at(70, 23, 0), crowd: 6000, example: false });
  put("events/e1", { name: "Tribute night, Empress Ballroom", venue: "Winter Gardens", ...xy("Winter Gardens"), start: at(1, 19, 30), end: at(1, 23, 15), crowd: 2500, example: true });
  const sat = (6 - new Date().getDay() + 7) % 7 || 7;
  put("events/e2", { name: "Blackpool FC home match", venue: "Bloomfield Road (Blackpool FC)", ...xy("Bloomfield Road (Blackpool FC)"), start: at(sat, 15, 0), end: at(sat, 16, 55), crowd: 9000, example: true });
  put("events/e3", { name: "Comedy at the Grand Theatre", venue: "The Grand Theatre", ...xy("The Grand Theatre"), start: at(3, 19, 30), end: at(3, 22, 30), crowd: 1100, example: true });
  put("msgs/m1", { driverId: "d07", from: "dispatch", text: "Morning Dave, it'll be busy round the Tower from 7 tonight. Illuminations switch-on.", at: now - 3 * 3600000 });
}
