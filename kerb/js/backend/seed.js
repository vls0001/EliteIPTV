// Demo data. Also documents the data model (same paths in every backend):
//   settings/firm                 firm name, tariff, boost, dispatch mode, demo switches
//   drivers/{id}                  call sign, name, phone, car, status (off|free|busy|break), x/y, move, queuedAt, rent, docs, sim
//   jobs/{id}                     status, pickup, drop, when, vehicle, passengers, customer, source, fare, pay, driverId, offer, timestamps, rating
//   customers/{phone}             name, phone, last pickup
//   rent/{driverId__week}         weekly rent: amount, paid, paidAt
//   expenses/{id}                 driver expenses for the tax tracker
//   msgs/{id}                     dispatch <-> driver messages
//   alerts/{id}                   driver SOS alerts
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
  put("msgs/m1", { driverId: "d07", from: "dispatch", text: "Morning Dave, it'll be busy round the Tower from 7 tonight. Illuminations switch-on.", at: now - 3 * 3600000 });
}
