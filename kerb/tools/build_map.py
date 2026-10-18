"""Builds kerb/data/blackpool.json from Overture Maps (OpenStreetMap-based) GeoParquet extracts.
Usage: python3 tools/build_map.py <folder with segment/place/water/land_use/land .parquet> <output json>
Coordinates are metres from the top-left corner of the box (x east, y south)."""
import sys, json, math
import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import box, LineString, Polygon, MultiPolygon, GeometryCollection

SRC, OUT = sys.argv[1], sys.argv[2]
W, S, E, N = -3.075, 53.765, -2.975, 53.872
LAT0 = (S + N) / 2
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110574.0
BOX = box(W, S, E, N)

def xy(lon, lat): return (round((lon - W) * KX), round((N - lat) * KY))
def proj_line(coords): return [v for c in coords for v in xy(*c)]

def polys(geom):
    if geom.is_empty: return []
    if isinstance(geom, Polygon): return [geom]
    if isinstance(geom, (MultiPolygon, GeometryCollection)): return [g for p in geom.geoms for g in polys(p)]
    return []

def rings(geom, tol):
    out = []
    for p in polys(geom.intersection(BOX)):
        p = p.simplify(tol, preserve_topology=True)
        if p.is_empty or p.area < (tol * tol * 4): continue
        for r in [p.exterior] + list(p.interiors):
            pts = proj_line(list(r.coords))
            if len(pts) >= 6: out.append(pts)
    return out

DRIVE = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service", "unknown"]
seg = pq.read_table(f"{SRC}/segment.parquet").to_pylist()
names, name_idx, roads = [], {}, []
for r in seg:
    if r.get("subtype") != "road" or r.get("class") not in DRIVE: continue
    g = wkb.loads(r["geometry"])
    g = g.intersection(BOX)
    if g.is_empty: continue
    lines = [g] if isinstance(g, LineString) else [x for x in getattr(g, "geoms", []) if isinstance(x, LineString)]
    nm = (r.get("names") or {}).get("primary") or ""
    cls = r["class"] if r["class"] != "unknown" else "unclassified"
    if nm and nm not in name_idx: name_idx[nm] = len(names); names.append(nm)
    for ln in lines:
        ln = ln.simplify(0.00002)  # about 1.5 m
        pts = proj_line(list(ln.coords))
        if len(pts) >= 4: roads.append([DRIVE.index(cls) if cls in DRIVE else 6, name_idx.get(nm, -1), pts])

from shapely.ops import unary_union
land_geoms, sand = [], []
for r in pq.read_table(f"{SRC}/land.parquet").to_pylist():
    g = wkb.loads(r["geometry"])
    if r.get("subtype") == "land" and g.geom_type in ("Polygon", "MultiPolygon"): land_geoms.append(g.intersection(BOX))
    elif r.get("subtype") == "sand": sand += rings(g, 0.00005)
# overlapping land shapes (mainland, island, archipelago) are merged so the coastline fills cleanly
land = rings(unary_union(land_geoms), 0.00006)
parks = []
for r in pq.read_table(f"{SRC}/land_use.parquet").to_pylist():
    if r.get("subtype") in ("park", "recreation", "golf") or r.get("class") in ("grass", "park", "recreation_ground", "golf_course", "pitch", "village_green", "garden"):
        if r.get("class") in ("bunker", "tee", "green", "playground"): continue
        parks += rings(wkb.loads(r["geometry"]), 0.00004)
water = []
for r in pq.read_table(f"{SRC}/water.parquet").to_pylist():
    if r.get("subtype") in ("ocean", "physical") or r.get("class") in ("swimming_pool",): continue
    g = wkb.loads(r["geometry"])
    water += rings(g, 0.00004)

KEEP = {"hotel", "restaurant", "bar", "pub", "cafe", "casual_eatery", "fast_food_restaurant", "bed_and_breakfast", "shopping_mall", "supermarket", "food_and_beverage_store",
        "convenience_store", "train_station", "travel_and_transportation", "hospital", "outpatient_care_facility", "theatre_venue", "music_venue", "amusement_park", "historic_site",
        "pier", "park", "zoo", "golf_course", "sport_or_fitness_facility", "stadium_or_arena", "elementary_school", "high_school", "college_or_university", "library", "museum",
        "cinema", "night_club", "casino", "airport", "parking", "lodging", "pharmacy_and_drug_store", "christian_place_of_worship", "place_of_worship", "beach", "fashion_and_apparel_store",
        "shopping", "bank", "post_office", "police_station", "skating_rink", "playground", "landmark_and_historical_building", "event_space", "entertainment_venue"}
places, seen = [], set()
for r in pq.read_table(f"{SRC}/place.parquet").to_pylist():
    nm = (r.get("names") or {}).get("primary")
    cat = r.get("basic_category")
    if not nm or (r.get("confidence") or 0) < 0.6 or cat not in KEEP: continue
    b = r["bbox"]; lon, lat = (b["xmin"] + b["xmax"]) / 2, (b["ymin"] + b["ymax"]) / 2
    if not (W < lon < E and S < lat < N): continue
    key = nm.lower()
    if key in seen: continue
    seen.add(key)
    x, y = xy(lon, lat)
    places.append([nm[:60], cat, x, y])

LANDMARKS = [
  ("Blackpool Tower", 53.8159, -3.0552, "landmark", 1), ("Winter Gardens", 53.8171, -3.0510, "landmark", 1),
  ("North Pier", 53.8187, -3.0560, "landmark", 1), ("Central Pier", 53.8110, -3.0559, "landmark", 1), ("South Pier", 53.7930, -3.0562, "landmark", 1),
  ("Pleasure Beach", 53.7905, -3.0548, "landmark", 1), ("Sandcastle Waterpark", 53.7955, -3.0563, "landmark", 0),
  ("Blackpool North station", 53.8219, -3.0490, "station", 1), ("Blackpool South station", 53.7985, -3.0452, "station", 0),
  ("Pleasure Beach station", 53.7880, -3.0530, "station", 0), ("Squires Gate station", 53.7773, -3.0503, "station", 0),
  ("Bloomfield Road (Blackpool FC)", 53.8046, -3.0482, "landmark", 1), ("Stanley Park", 53.8156, -3.0253, "landmark", 1),
  ("Blackpool Zoo", 53.8165, -3.0110, "landmark", 0), ("Victoria Hospital", 53.8211, -3.0166, "hospital", 1),
  ("Blackpool Airport", 53.7745, -3.0370, "airport", 1), ("Bispham", 53.8548, -3.0398, "area", 1), ("Layton", 53.8272, -3.0327, "area", 0),
  ("Marton", 53.8030, -3.0266, "area", 0), ("Gynn Square", 53.8327, -3.0545, "area", 0), ("Houndshill Shopping Centre", 53.8137, -3.0527, "shop", 0),
  ("The Grand Theatre", 53.8173, -3.0537, "landmark", 0), ("Tesco Extra, Clifton Road", 53.7946, -2.9923, "shop", 0),
  ("Blackpool & The Fylde College", 53.8473, -3.0346, "landmark", 0), ("Comedy Carpet", 53.8152, -3.0565, "landmark", 0),
  ("Talbot Gateway", 53.8195, -3.0490, "area", 0), ("Mereside", 53.7980, -3.0060, "area", 0), ("Norbreck Castle", 53.8610, -3.0440, "landmark", 0),
]
landmarks = [[n, *xy(lon, lat), k, m] for (n, lat, lon, k, m) in LANDMARKS]

w, h = xy(E, S)
out = {"v": 1, "box": [W, S, E, N], "kx": KX, "ky": KY, "w": w, "h": h, "classes": DRIVE, "names": names, "roads": roads,
       "land": land, "sand": sand, "parks": parks, "water": water, "places": places, "landmarks": landmarks}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("roads", len(roads), "names", len(names), "land", len(land), "sand", len(sand), "parks", len(parks), "water", len(water), "places", len(places), "size", w, h)
