# Kerb

Taxi dispatch, driver and customer booking apps that work together, plus the Kerb website.
Built for UK firms with self-employed drivers (own card machines, cash, weekly rent).

## Files

```
kerb/
  index.html              Website (Isaeva-style splash, features, pricing, FAQ)
  app.html                The app. Pick a screen with the hash:
                            #book (customer)  #driver  #dispatch (dispatch + office)  #demo (all three)
  manifest.webmanifest    Install on phones from the browser
  data/blackpool.json     Real Blackpool roads, coastline, parks, water and places (built by tools/build_map.py)
  tools/build_map.py      Rebuilds the map data from Overture Maps (OpenStreetMap) extracts
  assets/                 Icon and website screenshots
  css/
    tokens.css            Colours and fonts
    app.css               All app screens (launcher, demo, map, customer, driver, console, office)
    site.css              Website
  js/
    config.js             Name, fares, vehicles, zones and the Blackpool map data
    app.js                Start-up and screen picker
    store.js              Live data, every job step, and the dispatch engine (auto-dispatch + demo cars)
    lib/
      dom.js              Element builder, icons, modals, toasts
      geo.js              Routes, car positions, ETAs, fares, zones, address search
      mapdata.js          Loads the real map, builds the road graph, A* routing, street/place search
      map.js              Canvas map renderer with top-down car icons (no tile servers needed)
      sound.js            Offer chime, SOS alarm, vibration
    backend/
      index.js            Picks live or demo
      artifact.js         Live backend (Claude shared database)
      local.js            Demo backend (this browser only)
      seed.js             Demo firm, drivers, two weeks of jobs; documents the data model
    views/
      book.js             Customer app: book, live tracking, rating, trips, book by message
      driver.js           Driver app: offers, job steps, cash/card, earnings, tax, documents, messages, SOS
      dispatch.js         Dispatch console and office: map, jobs, queues, phone bookings, drivers, rent, reports, settings
```

## Run locally

```
cd kerb
python3 -m http.server 8000
```

Website: http://localhost:8000 · App: http://localhost:8000/app.html (add `?demo` to force demo mode).

## Map data

Roads, coastline, parks, water and places come from Overture Maps, which is built mostly from OpenStreetMap.
Map data © OpenStreetMap contributors (ODbL) and Overture Maps Foundation. Keep the on-map credit.
To cover another town, download that area's `segment`, `place`, `water`, `land_use` and `land` GeoParquet from the Overture release,
change the box in `tools/build_map.py`, and rebuild.

## How it works

- Jobs go `new → offered → accepted → arrived → pob (on board) → done` (or cancelled / no show).
- Car positions are stored as a route plus start time, so every screen animates cars without constant writes.
- The dispatch engine runs in whichever open page holds a short lock. In production it moves to a small server.

## Next steps for a real launch

1. Backend: a `firebase.js` (or Supabase) with the same methods as `backend/artifact.js`, plus a server for the dispatch engine.
2. GPS: feed the driver phone's location into `drivers/{id}` instead of the simulated route (the real-road map and routing are already in).
3. Native apps: wrap with Capacitor for push notifications and background location.
4. Phone line: caller ID into the booking form (e.g. Twilio), and WhatsApp Business API for book-by-message.
5. Card machines: SumUp / Zettle links so the fare goes straight to the driver's reader.
