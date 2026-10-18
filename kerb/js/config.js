// Brand, fares, vehicles and the Blackpool map. Change the name here and it updates everywhere.
export const APP = {
  name: "Kerb",
  version: "1.0",
  tagline: "Dispatch and booking that drivers actually like.",
  demoFirm: "Seaside Cars",
  speedup: 45,          // demo cars move 45x real speed; shown ETAs are real-world minutes
  unitsPerSecond: 40,   // demo animation speed in map units per second
  unitsPerMile: 160,
  realMph: 18,
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

// ---------- the map (stylised, 1000 x 1400 units, north at the top, sea to the west) ----------
export const MAP = { w: 1000, h: 1400, coast: 95 };
export const ROADS_V = [150, 260, 380, 520, 660, 800, 920];
export const ROADS_H = [120, 300, 470, 610, 760, 900, 1050, 1200, 1300];

export const ZONES = [
  { id: "north", name: "North", test: p => p.y < 420 },
  { id: "central", name: "Central", test: p => p.y < 820 && p.x < 450 },
  { id: "east", name: "East", test: p => p.y < 1040 && p.x >= 450 },
  { id: "south", name: "South", test: p => p.y < 1240 },
  { id: "airport", name: "Airport", test: () => true },
];

export const PLACES = [
  { name: "Blackpool Tower", x: 150, y: 600, kind: "landmark" },
  { name: "Winter Gardens", x: 240, y: 615, kind: "landmark" },
  { name: "North Pier", x: 150, y: 490, kind: "landmark" },
  { name: "Central Pier", x: 150, y: 720, kind: "landmark" },
  { name: "South Pier", x: 150, y: 1060, kind: "landmark" },
  { name: "Pleasure Beach", x: 150, y: 1125, kind: "landmark" },
  { name: "Sandcastle Waterpark", x: 150, y: 1185, kind: "landmark" },
  { name: "Blackpool North station", x: 270, y: 470, kind: "station" },
  { name: "Blackpool South station", x: 260, y: 1010, kind: "station" },
  { name: "Pleasure Beach station", x: 260, y: 1140, kind: "station" },
  { name: "Bloomfield Road (Blackpool FC)", x: 330, y: 840, kind: "landmark" },
  { name: "Stanley Park", x: 590, y: 640, kind: "landmark" },
  { name: "Blackpool Zoo", x: 700, y: 610, kind: "landmark" },
  { name: "Victoria Hospital", x: 600, y: 440, kind: "hospital" },
  { name: "Blackpool Airport", x: 420, y: 1300, kind: "airport" },
  { name: "Bispham Village", x: 260, y: 140, kind: "area" },
  { name: "Layton", x: 480, y: 360, kind: "area" },
  { name: "Marton", x: 660, y: 900, kind: "area" },
  { name: "Squires Gate", x: 260, y: 1290, kind: "area" },
  { name: "Hawes Side", x: 470, y: 960, kind: "area" },
  { name: "Grange Park", x: 740, y: 330, kind: "area" },
  { name: "Mereside", x: 800, y: 1060, kind: "area" },
  { name: "Houndshill Shopping Centre", x: 220, y: 680, kind: "shop" },
  { name: "Blackpool & The Fylde College", x: 380, y: 300, kind: "landmark" },
  { name: "Tesco Extra, Clifton Road", x: 820, y: 1000, kind: "shop" },
  { name: "Cineworld, Festival Park", x: 700, y: 1210, kind: "shop" },
  { name: "The Grand Theatre", x: 245, y: 590, kind: "landmark" },
  { name: "Norbreck Castle", x: 150, y: 230, kind: "landmark" },
  { name: "Gynn Square", x: 160, y: 330, kind: "area" },
  { name: "Talbot Gateway", x: 300, y: 520, kind: "area" },
];

// streets: house numbers map to a point along the street
export const STREETS = [
  { name: "Promenade", x1: 150, y1: 120, x2: 150, y2: 1230 },
  { name: "Talbot Road", x1: 150, y1: 470, x2: 660, y2: 470 },
  { name: "Church Street", x1: 150, y1: 610, x2: 520, y2: 610 },
  { name: "Dickson Road", x1: 260, y1: 120, x2: 260, y2: 470 },
  { name: "Lytham Road", x1: 260, y1: 760, x2: 260, y2: 1300 },
  { name: "Devonshire Road", x1: 380, y1: 120, x2: 380, y2: 610 },
  { name: "Park Road", x1: 380, y1: 610, x2: 380, y2: 900 },
  { name: "Whitegate Drive", x1: 520, y1: 610, x2: 520, y2: 1050 },
  { name: "Waterloo Road", x1: 150, y1: 900, x2: 660, y2: 900 },
  { name: "Squires Gate Lane", x1: 150, y1: 1300, x2: 800, y2: 1300 },
  { name: "Preston New Road", x1: 520, y1: 760, x2: 920, y2: 760 },
  { name: "Bispham Road", x1: 260, y1: 120, x2: 800, y2: 120 },
  { name: "Newton Drive", x1: 380, y1: 300, x2: 800, y2: 300 },
  { name: "Highfield Road", x1: 150, y1: 1050, x2: 660, y2: 1050 },
  { name: "Lytham Road South", x1: 260, y1: 1200, x2: 660, y2: 1200 },
  { name: "Common Edge Road", x1: 660, y1: 900, x2: 660, y2: 1300 },
  { name: "Clifton Road", x1: 800, y1: 900, x2: 800, y2: 1200 },
];

export const DOCS = { badge: "Driver badge", licence: "Driving licence", insurance: "Hire insurance", mot: "MOT", plate: "Vehicle plate" };
