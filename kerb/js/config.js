// Brand, fares, vehicles and the Blackpool map. Change the name here and it updates everywhere.
export const APP = {
  name: "Kerb",
  version: "1.0",
  tagline: "Dispatch and booking that drivers actually like.",
  demoFirm: "Seaside Cars",
  speedup: 30,          // demo cars move 30x real speed; shown ETAs are real-world minutes
  offerSeconds: 20,
};

export const DEFAULT_SETTINGS = {
  firm: "Seaside Cars",
  flag: 3.5,          // £ pick-up charge
  perMile: 2.1,       // £ per mile
  minimum: 5,
  nightRate: 1.5,     // 10pm to 6am, Sundays and bank holidays
  boost: 1,           // event boost multiplier (Illuminations, match days)
  boostLabel: "",
  autoDispatch: true,
  mode: "queue",      // "queue" (first in zone queue) or "nearest"
  demoDrivers: true,
  autoBookings: true,
};

export const VEHICLES = {
  saloon: { label: "Saloon", seats: 4, extra: 0, icon: "🚗" },
  estate: { label: "Estate", seats: 4, extra: 1, icon: "🚙", note: "Extra luggage" },
  mpv: { label: "6–8 seater", seats: 8, extra: 4, icon: "🚐" },
  wav: { label: "Wheelchair", seats: 5, extra: 0, icon: "♿" },
};

export const STATUS = {
  new: { label: "Waiting", tone: "warn" },
  offered: { label: "Offered", tone: "info" },
  accepted: { label: "On the way", tone: "info" },
  arrived: { label: "Outside", tone: "ok" },
  pob: { label: "On board", tone: "ok" },
  done: { label: "Completed", tone: "dim" },
  cancelled: { label: "Cancelled", tone: "bad" },
  noshow: { label: "No show", tone: "bad" },
};

export const SOURCES = { app: "App", phone: "Phone", web: "Website", whatsapp: "WhatsApp", rank: "Rank" };

// ---------- zones (metres on the real map: x east, y south from 53.872N, 3.075W) ----------
export const ZONES = [
  { id: "north", name: "North", test: p => p.y < 5086 },          // north of Talbot Road / Layton
  { id: "airport", name: "Airport", test: p => p.y > 9620 },      // Squires Gate and the airport
  { id: "central", name: "Central", test: p => p.x < 2700 && p.y < 7520 },
  { id: "east", name: "East", test: p => p.x >= 2700 && p.y < 8300 },
  { id: "south", name: "South", test: () => true },
];

export const DOCS = { badge: "Driver badge", licence: "Driving licence", insurance: "Hire insurance", mot: "MOT", plate: "Vehicle plate" };
