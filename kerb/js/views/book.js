// Customer app: book a taxi, track it live, rate the driver, see past trips, or book by message.
import { APP, VEHICLES, STATUS, COMPLAINT_KINDS } from "../config.js";
import { h, fill, icon, toast, store, stamp, fmtTime, confirmBox, modal, copyText } from "../lib/dom.js";
import { searchPlaces, findPlace, quote, money, posOf, etaMinutes, randomSpot, zoneOf, landmark, driveMinutes } from "../lib/geo.js";
import { MAP, describe } from "../lib/mapdata.js";
const validPick = p => p && p.x >= 0 && p.x <= MAP.w && p.y >= 0 && p.y <= MAP.h && p.x > 1100 ? p : null;
import { createMap } from "../lib/map.js";
import { K, onChange, createJob, cancel, rate, nearestEta, carLabel, driversList, etaTo, jobOfDriver, shareLink, savePlaces, addComplaint, addLost, sendMsg } from "../store.js";

function vehicleIcon(k) {
  const paths = {
    saloon: "M3 15h18M5 15l2-5a2 2 0 0 1 1.9-1.3h6.2A2 2 0 0 1 17 10l2 5M4 15v3h3v-1.5h10V18h3v-3",
    estate: "M3 15h18M5 15l2-5a2 2 0 0 1 1.9-1.3H20l1 6M4 15v3h3v-1.5h10V18h3v-3",
    mpv: "M3 16h18M4 16V9a2 2 0 0 1 2-2h11l3 4v5M4 16v2h3v-1.5h10V18h3v-2M8 7v4M13 7v4",
    wav: "M3 16h18M4 16V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 16v2h3v-1.5h10V18h3v-2M15 9h3v4",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "30"); svg.setAttribute("height", "30");
  svg.innerHTML = '<path d="' + paths[k] + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

export function mountBook(root) {
  let profile = store.get("customer", { name: "Alex Morgan", phone: "07700 900123" });
  let screen = "home";
  let draft = { pickup: validPick(store.get("lastPickup", null)) || landmark("Blackpool Tower"), drop: null, vehicle: "saloon", when: null, passengers: 1, notes: "" };
  let watching = store.get("watchJob", null);
  let forOther = store.get("forOther", null); // { name, phone } when booking for someone else
  const custKey = () => String(profile.phone || "").replace(/\D/g, "");
  const savedPlaces = () => { const c = K.customers[custKey()]; return (c && c.places) || store.get("places", []); };
  const setPlaces = list => { store.set("places", list); savePlaces(profile.phone, list); };
  let rated = new Set();

  const mapBox = h("div", { class: "b-map" });
  const sheet = h("div", { class: "b-sheet" });
  const top = h("div", { class: "b-top" });
  fill(root, h("div", { class: "phone-app book" }, mapBox, h("div", { class: "b-centerpin", "aria-hidden": "true" }, h("i"), h("span")), top, sheet));
  root.classList.add("app-root");
  const map = createMap(mapBox, { compact: true });

  const myJobs = () => K.jobs.filter(j => j.customer && profile.phone && j.customer.phone === profile.phone);
  const current = () => {
    const mine = myJobs();
    const live = mine.find(j => ["new", "offered", "accepted", "arrived", "pob"].includes(j.status) && !j.prebook);
    if (live) return live;
    if (watching) { const j = K.jobs.find(x => x.id === watching); if (j && j.status === "done" && !j.rating && !rated.has(j.id)) return j; }
    return null;
  };

  function renderTop() {
    fill(top,
      h("button", { type: "button", class: "b-pill", onclick: () => go("trips") }, icon("receipt", 16), "Trips"),
      h("span", { class: "b-brand" }, h("svg", { viewBox: "0 0 120 120", width: 18, height: 18 }), K.settings.firm),
      h("button", { type: "button", class: "b-pill", onclick: () => go("chat") }, icon("whatsapp", 16), "Message"));
    top.querySelector("svg").innerHTML = '<use href="#logo"/>';
  }

  function go(s) { screen = s; render(); }

  // ---------- home ----------
  let homeEls = null;
  function renderHome() {
    const pickIn = h("input", { class: "b-input", id: "b-pick", value: draft.pickup ? draft.pickup.name : "", placeholder: "Pick-up", autocomplete: "off" });
    const dropIn = h("input", { class: "b-input", id: "b-drop", value: draft.drop ? draft.drop.name : "", placeholder: "Where to?", autocomplete: "off" });
    const sugg = h("div", { class: "b-sugg", hidden: true });
    const vehicles = h("div", { class: "b-vehicles" });
    const summary = h("div", { class: "b-summary" });
    const later = h("input", { class: "b-input sm", type: "datetime-local", id: "b-when", hidden: !draft.when });
    if (draft.when) later.value = new Date(draft.when - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const nameIn = h("input", { class: "b-input sm", id: "b-name", value: profile.name, placeholder: "Your name", autocomplete: "name" });
    const phoneIn = h("input", { class: "b-input sm", id: "b-phone", value: profile.phone, placeholder: "Mobile number", inputmode: "tel", autocomplete: "tel" });
    const notes = h("input", { class: "b-input sm", id: "b-notes", value: draft.notes, placeholder: "Notes for the driver (optional)", maxlength: 120 });
    const otherTg = h("input", { type: "checkbox", class: "tg", id: "b-other" }); otherTg.checked = !!forOther;
    const oName = h("input", { class: "b-input sm", id: "b-oname", value: forOther ? forOther.name : "", placeholder: "Passenger's name", autocomplete: "off" });
    const oPhone = h("input", { class: "b-input sm", id: "b-ophone", value: forOther ? forOther.phone : "", placeholder: "Passenger's mobile (they get the texts)", inputmode: "tel", autocomplete: "off" });
    const oBox = h("div", { class: "b-other", hidden: !forOther }, oName, oPhone, h("small", { class: "dim", text: "The driver sees their name and calls them. You still get the updates." }));
    otherTg.addEventListener("change", () => { oBox.hidden = !otherTg.checked; forOther = otherTg.checked ? { name: oName.value, phone: oPhone.value } : null; store.set("forOther", forOther); if (otherTg.checked) oName.focus(); });
    [oName, oPhone].forEach(i => i.addEventListener("input", () => { forOther = { name: oName.value, phone: oPhone.value }; store.set("forOther", forOther); }));
    const bookBtn = h("button", { type: "button", class: "b-book" }, "Book");
    let field = null;

    const showSugg = (input, which) => {
      field = which;
      const list = searchPlaces(input.value, 6);
      sugg.hidden = false;
      const kindLabel = k => ({ street: "Street", address: "Address", postcode: "Postcode", station: "Station", landmark: "Landmark", hospital: "Hospital", airport: "Airport", area: "Area", shop: "Shopping" })[k] || "Place";
      fill(sugg,
        which === "pickup" && !input.value ? h("button", { type: "button", class: "b-sugg-item", onmousedown: e => { e.preventDefault(); const p = randomSpot("central"); const d = describe(p); pick({ name: d.name, x: p.x, y: p.y }); } }, icon("target", 16), h("span", {}, h("b", { text: "Current location" }), h("small", { text: K.api.mode === "demo" ? "Demo: a spot in town" : "Uses a spot in town until GPS is on" }))) : null,
        list.map(p => h("button", { type: "button", class: "b-sugg-item", onmousedown: e => { e.preventDefault(); pick(p); } }, icon(p.kind === "street" || p.kind === "address" || p.kind === "postcode" ? "mapPin" : "star", 16), h("span", {}, h("b", { text: p.name }), h("small", { text: kindLabel(p.kind) })))),
        input.value && !list.length ? h("div", { class: "b-sugg-empty", text: "No match. Try a street, postcode or place, or choose on the map." }) : null,
        h("button", { type: "button", class: "b-sugg-item map", onmousedown: e => { e.preventDefault(); startPick(which); } }, icon("mapPin", 16), h("span", {}, h("b", { text: "Choose on map" }), h("small", { text: "Drag the map to the exact spot" }))));
    };
    const pick = p => {
      draft[field] = { name: p.name, x: p.x, y: p.y };
      (field === "pickup" ? pickIn : dropIn).value = p.name;
      sugg.hidden = true;
      if (field === "pickup") store.set("lastPickup", draft.pickup);
      if (field === "pickup" && !draft.drop) dropIn.focus(); else (document.activeElement && document.activeElement.blur());
      updateQuote();
    };
    pickIn.addEventListener("focus", () => { pickIn.select(); showSugg(pickIn, "pickup"); });
    pickIn.addEventListener("input", () => showSugg(pickIn, "pickup"));
    dropIn.addEventListener("focus", () => showSugg(dropIn, "drop"));
    dropIn.addEventListener("input", () => showSugg(dropIn, "drop"));
    [pickIn, dropIn].forEach(i => i.addEventListener("blur", () => setTimeout(() => { sugg.hidden = true; }, 150)));
    later.addEventListener("change", () => { draft.when = later.value ? new Date(later.value).getTime() : null; updateQuote(); });
    notes.addEventListener("input", () => { draft.notes = notes.value; });
    bookBtn.addEventListener("click", book);

    const recents = [...new Map(myJobs().filter(j => j.drop).map(j => [j.drop.name, j.drop])).values()].filter(r => !savedPlaces().some(p => p.name === r.name)).slice(0, 4);
    const places = savedPlaces();
    const placeChip = (label, ic) => {
      const p = places.find(x => x.label === label);
      return h("button", { type: "button", class: "b-chip saved" + (p ? "" : " add"), onclick: () => { if (p) { field = "drop"; pick(p); } else savePlace(label); } }, icon(ic, 13), p ? label : "Add " + label.toLowerCase());
    };
    fill(sheet,
      h("div", { class: "b-grab" }),
      h("h2", { class: "b-hello", text: "Where to" + (profile.name ? ", " + profile.name.split(" ")[0] : "") + "?" }),
      h("div", { class: "b-route" },
        h("div", { class: "b-dots" }, h("i", { class: "a" }), h("span"), h("i", { class: "b" })),
        h("div", { class: "b-fields" }, pickIn, dropIn),
        h("button", { type: "button", class: "b-swap", "aria-label": "Swap pick-up and destination", onclick: () => { [draft.pickup, draft.drop] = [draft.drop, draft.pickup]; pickIn.value = draft.pickup ? draft.pickup.name : ""; dropIn.value = draft.drop ? draft.drop.name : ""; updateQuote(); } }, icon("swap", 18))),
      sugg,
      h("div", { class: "b-chips" }, placeChip("Home", "home"), placeChip("Work", "briefcase"),
        places.filter(p => p.label !== "Home" && p.label !== "Work").map(p => h("button", { type: "button", class: "b-chip saved", onclick: () => { field = "drop"; pick(p); } }, icon("star", 13), p.label)),
        h("button", { type: "button", class: "b-chip ghost", "aria-label": "Save a place", onclick: () => savePlace("") }, icon("plus", 13), "Save"),
        recents.map(r => h("button", { type: "button", class: "b-chip", onclick: () => { field = "drop"; pick(r); } }, icon("clock", 13), r.name))),
      vehicles,
      h("div", { class: "b-when" },
        h("button", { type: "button", class: "b-chip" + (!draft.when ? " on" : ""), onclick: e => { draft.when = null; later.hidden = true; e.currentTarget.classList.add("on"); e.currentTarget.nextSibling.classList.remove("on"); updateQuote(); } }, "Now"),
        h("button", { type: "button", class: "b-chip" + (draft.when ? " on" : ""), onclick: e => { later.hidden = false; e.currentTarget.classList.add("on"); e.currentTarget.previousSibling.classList.remove("on"); if (!later.value) { const t = new Date(Date.now() + 3600000); t.setMinutes(0); later.value = new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); draft.when = t.getTime(); updateQuote(); } later.focus(); } }, "Later"),
        later),
      h("details", { class: "b-more", open: !!forOther }, h("summary", { text: forOther ? "For " + (forOther.name || "someone else") + " · details and notes" : "Your details and notes" }), h("div", { class: "b-more-body" }, nameIn, phoneIn, notes,
        h("label", { class: "toggle-row", for: "b-other" }, h("span", { class: "grow" }, h("b", { text: "Booking for someone else" }), h("small", { class: "dim", text: "A parent, a friend, a guest" })), otherTg), oBox,
        h("div", { class: "b-pax" }, h("span", { text: "Passengers" }), h("button", { type: "button", class: "b-step", onclick: () => setPax(-1) }, "−"), h("b", { id: "b-paxn", text: draft.passengers }), h("button", { type: "button", class: "b-step", onclick: () => setPax(1) }, "+")))),
      summary, bookBtn);
    homeEls = { vehicles, summary, bookBtn, nameIn, phoneIn };
    updateQuote();
  }
  // save Home, Work or any named place
  function savePlace(label) {
    const lab = h("input", { class: "input", id: "sp-label", value: label, placeholder: "Name, e.g. Mum's", maxlength: 24 });
    const q = h("input", { class: "input", id: "sp-q", placeholder: "Address, postcode or place", autocomplete: "off" });
    const list = h("div", { class: "sp-list" });
    let chosen = null;
    const draw = () => fill(list, searchPlaces(q.value, 6).map(p => h("button", { type: "button", class: "b-sugg-item" + (chosen && chosen.name === p.name ? " on" : ""), onclick: () => { chosen = { name: p.name, x: p.x, y: p.y }; q.value = p.name; draw(); } }, icon("mapPin", 16), h("span", {}, h("b", { text: p.name })))));
    q.addEventListener("input", () => { chosen = null; draw(); });
    const cur = savedPlaces();
    const m = modal({ title: label ? "Set " + label.toLowerCase() : "Save a place", body: h("div", { class: "form" },
      label ? null : h("label", { class: "field", for: "sp-label" }, h("span", { text: "Name" }), lab),
      h("label", { class: "field", for: "sp-q" }, h("span", { text: "Where" }), q), list,
      cur.length ? h("div", { class: "sp-saved" }, h("small", { class: "dim", text: "Saved" }), cur.map(p => h("div", { class: "sp-row" }, h("b", { text: p.label }), h("span", { class: "dim grow ell", text: p.name }), h("button", { type: "button", class: "ibtn sm", "aria-label": "Remove " + p.label, onclick: () => { setPlaces(savedPlaces().filter(x => x.label !== p.label)); m.close(); render(); } }, icon("x", 14))))) : null),
      actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: () => {
        const name = (label || lab.value).trim();
        if (!name) { toast("Give the place a name."); return; }
        if (!chosen) { const first = searchPlaces(q.value, 1)[0]; if (first) chosen = { name: first.name, x: first.x, y: first.y }; }
        if (!chosen) { toast("Pick an address from the list."); return; }
        setPlaces([...savedPlaces().filter(x => x.label !== name), Object.assign({ label: name }, chosen)]);
        m.close(); toast(name + " saved.", "ok"); render();
      } }, "Save")] });
    setTimeout(() => q.focus(), 40);
  }

  function setPax(dv) {
    draft.passengers = Math.max(1, Math.min(8, draft.passengers + dv));
    const n = document.getElementById("b-paxn"); if (n) n.textContent = draft.passengers;
    if (draft.passengers > 4 && draft.vehicle !== "mpv") { draft.vehicle = "mpv"; toast("More than 4 passengers needs a 6–8 seater."); }
    updateQuote();
  }

  function updateQuote() {
    if (!homeEls) return;
    const { vehicles, summary, bookBtn } = homeEls;
    fill(vehicles, Object.entries(VEHICLES).map(([k, v]) => {
      const q = draft.pickup && draft.drop ? quote(draft.pickup, draft.drop, K.settings, k, draft.when || Date.now()) : null;
      return h("button", { type: "button", class: "b-veh" + (draft.vehicle === k ? " on" : ""), onclick: () => { draft.vehicle = k; updateQuote(); } },
        h("span", { class: "b-veh-ic" }, vehicleIcon(k)), h("b", { text: v.label }), h("small", { text: v.seats + " seats" }), h("span", { class: "b-veh-p", text: q ? money(q.fare) : "–" }));
    }));
    if (!draft.pickup || !draft.drop) { fill(summary, h("p", { class: "dim", text: "Pick where you're going to see the price." })); bookBtn.disabled = true; bookBtn.textContent = "Book"; return; }
    const q = quote(draft.pickup, draft.drop, K.settings, draft.vehicle, draft.when || Date.now());
    const eta = nearestEta(draft.pickup, draft.vehicle);
    fill(summary,
      h("div", { class: "b-price" }, h("b", { text: money(q.fare) }), h("span", { class: "dim", text: q.miles + " mi · about " + q.mins + " min" + (q.night ? " · night rate" : "") + (q.boost ? " · " + (K.settings.boostLabel || "busy") + " pricing" : "") })),
      h("div", { class: "b-meta" },
        h("span", {}, icon("clock", 14), draft.when ? "Booked for " + new Date(draft.when).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : eta ? "Car in about " + eta + " min" : "No cars free right now, we'll queue you"),
        h("span", {}, icon("wallet", 14), "Pay the driver by cash or card")));
    bookBtn.disabled = false;
    bookBtn.textContent = (draft.when ? "Book for later · " : "Book now · ") + money(q.fare);
  }

  async function book() {
    const name = homeEls.nameIn.value.trim(), phone = homeEls.phoneIn.value.trim();
    if (!name || phone.replace(/\D/g, "").length < 10) { toast("Add your name and mobile number so the driver can reach you."); const d = sheet.querySelector(".b-more"); if (d) d.open = true; return; }
    profile = { name, phone }; store.set("customer", profile);
    if (draft.when && draft.when < Date.now() + 10 * 60000) draft.when = null;
    homeEls.bookBtn.disabled = true;
    let passenger = null;
    if (forOther) {
      if (!forOther.name.trim()) { toast("Add the passenger's name, or switch off \"Booking for someone else\"."); const d = sheet.querySelector(".b-more"); if (d) d.open = true; return; }
      passenger = { name: forOther.name.trim(), phone: forOther.phone.trim() };
    }
    const id = await createJob({ pickup: draft.pickup, drop: draft.drop, vehicle: draft.vehicle, passengers: draft.passengers, notes: draft.notes, when: draft.when || Date.now(), customer: profile, passenger, source: "app" });
    if (!id) { homeEls.bookBtn.disabled = false; return; }
    watching = id; store.set("watchJob", id);
    if (draft.when) { toast("Booked for " + new Date(draft.when).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) + ". See it in Trips.", "ok"); draft.drop = null; draft.when = null; render(); }
    else go("track");
  }

  // ---------- tracking ----------
  function renderTrack(j) {
    const d = j.driverId && K.drivers[j.driverId];
    let head, sub = "";
    if (j.status === "new" || j.status === "offered") { head = "Finding your driver…"; sub = "Usually under a minute"; }
    else if (j.status === "accepted" && j.stacked && d && jobOfDriver(d.id) && jobOfDriver(d.id).id !== j.id) { const cur = jobOfDriver(d.id); const m = (etaTo(d, cur.drop) || 0) + driveMinutes(cur.drop, j.pickup); head = "Arriving in about " + Math.max(2, m) + " min"; sub = "Car " + d.call + " is finishing a trip nearby, then coming straight to you"; }
    else if (j.status === "accepted") { const m = etaTo(d, j.pickup); head = m <= 1 ? "Your driver is nearly there" : "Arriving in " + m + " min"; sub = "Car " + (d ? d.call : "") + " is on the way to " + j.pickup.name; }
    else if (j.status === "arrived") { head = "Your driver is outside"; sub = "Look for the " + carLabel(d) + " · " + (d ? d.car.reg : ""); }
    else if (j.status === "pob") { const m = etaTo(d, j.drop); head = "On the way to " + j.drop.name; sub = "Arriving in about " + Math.max(1, m) + " min"; }
    else if (j.status === "done") return renderRate(j, d);
    fill(sheet,
      h("div", { class: "b-grab" }),
      h("div", { class: "b-status" + (j.status === "arrived" ? " outside" : "") }, j.status === "new" || j.status === "offered" ? h("span", { class: "spinner" }) : h("span", { class: "live-dot" }), h("div", {}, h("h2", { text: head }), h("p", { class: "dim", text: sub }))),
      d ? h("div", { class: "b-driver" },
        h("span", { class: "b-av", text: initials(d.name) }),
        h("div", { class: "b-driver-txt" }, h("b", { text: d.name.split(" ")[0] + " · Car " + d.call }), h("span", { class: "dim" }, "★ " + (d.rating || 5).toFixed(1) + " · " + carLabel(d))),
        h("span", { class: "plate", text: d.car.reg })) : null,
      h("div", { class: "b-trip" }, line("a", j.pickup.name), line("b", j.drop.name)),
      j.passenger ? h("div", { class: "b-meta" }, h("span", {}, icon("user", 14), "For " + j.passenger.name + (j.passenger.phone ? " · they get the texts too" : ""))) : null,
      h("div", { class: "b-meta" }, h("span", {}, icon("pound", 14), money(j.fare) + " · pay the driver by cash or card")),
      h("button", { type: "button", class: "b-share", onclick: () => shareTrip(j) }, icon("share", 16), h("span", {}, h("b", { text: "Share live trip" }), h("small", { class: "dim", text: "Send family a link to watch the car" }))),
      h("div", { class: "b-actions" },
        d ? h("a", { class: "b-btn", href: "tel:" + d.phone.replace(/\s/g, "") }, icon("phone", 16), "Call " + d.name.split(" ")[0]) : null,
        j.status !== "pob" ? h("button", { type: "button", class: "b-btn danger", onclick: async () => { if (await confirmBox("Cancel this booking?", "The driver will be told straight away.", "Cancel booking", true)) { await cancel(j); watching = null; store.set("watchJob", null); go("home"); } } }, "Cancel") : null));
  }
  async function shareTrip(j) {
    const url = shareLink(j.id);
    const ok = await copyText(url);
    const m = modal({ title: "Share live trip", body: h("div", { class: "form" },
      h("p", { class: "muted", text: "Anyone with this link can see the car on the map, the driver's name and reg, and when you'll arrive. It stops working when the trip ends." }),
      h("input", { class: "input", id: "share-url", value: url, readonly: true, onfocus: e => e.target.select() }),
      h("small", { class: "dim", text: ok ? "Link copied. Paste it into WhatsApp or a text." : "Select the link and copy it." })),
      actions: [h("button", { type: "button", class: "btn primary", onclick: () => m.close() }, "Done")] });
  }
  const line = (cls, text) => h("div", { class: "b-line" }, h("i", { class: cls }), h("span", { text }));
  const initials = n => n.split(" ").map(x => x[0]).join("").slice(0, 2);

  function renderRate(j, d) {
    let stars = 0;
    const row = h("div", { class: "b-stars" });
    const draw = () => fill(row, [1, 2, 3, 4, 5].map(n => h("button", { type: "button", class: "b-star" + (n <= stars ? " on" : ""), "aria-label": n + " stars", onclick: () => { stars = n; draw(); } }, "★")));
    draw();
    fill(sheet,
      h("div", { class: "b-grab" }),
      h("h2", { class: "b-hello", text: "You've arrived" }),
      h("p", { class: "dim", text: "How was your trip with " + (d ? d.name.split(" ")[0] : "your driver") + "?" }),
      row,
      h("div", { class: "b-receipt" },
        h("div", {}, h("span", { text: "Fare" }), h("b", { text: money(j.fare) })),
        h("div", {}, h("span", { text: "Paid by" }), h("b", { text: j.pay === "cash" ? "Cash" : "Card" })),
        h("div", {}, h("span", { text: "Trip" }), h("b", { text: j.pickup.name + " → " + j.drop.name })),
        h("div", {}, h("span", { text: "Date" }), h("b", { text: stamp(j.doneAt || Date.now()) }))),
      h("div", { class: "b-links" },
        h("button", { type: "button", class: "link-btn", onclick: () => reportProblem(j) }, icon("thumbDown", 14), "Report a problem"),
        h("button", { type: "button", class: "link-btn", onclick: () => reportLost(j) }, icon("box", 14), "I left something")),
      h("button", { type: "button", class: "b-book", onclick: async () => { if (stars) await rate(j, stars); rated.add(j.id); watching = null; store.set("watchJob", null); draft.drop = null; toast(stars ? "Thanks for rating!" : "Thanks for riding with " + K.settings.firm + "."); go("home"); if (stars && stars <= 2) reportProblem(j); } }, stars ? "Send rating" : "Done"));
  }

  function reportProblem(j) {
    let kind = null;
    const opts = h("div", { class: "opts wrap" });
    const draw = () => fill(opts, Object.entries(COMPLAINT_KINDS).map(([k, l]) => h("button", { type: "button", class: "opt" + (kind === k ? " on" : ""), onclick: () => { kind = k; draw(); } }, l)));
    draw();
    const txt = h("textarea", { class: "input", id: "rp-text", rows: 3, maxlength: 500, placeholder: "What happened?" });
    const m = modal({ title: "Report a problem", body: h("div", { class: "form" }, h("p", { class: "muted", text: j.pickup.name + " → " + j.drop.name + " · " + stamp(j.doneAt || j.when) }), opts, txt, h("small", { class: "dim", text: "The office reads every report and will call you back if needed." })),
      actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!kind) { toast("Pick what went wrong."); return; }
        await addComplaint({ jobId: j.id, driverId: j.driverId || null, customer: profile, kind, text: txt.value.trim() });
        m.close(); toast("Sent to the office. Sorry about that.", "ok");
      } }, "Send")] });
  }
  function reportLost(j) {
    const item = h("input", { class: "input", id: "lp-item", placeholder: "What did you leave? e.g. black purse", maxlength: 80 });
    const det = h("input", { class: "input", id: "lp-det", placeholder: "Where in the car, anything distinctive", maxlength: 160 });
    const m = modal({ title: "Left something in the car?", body: h("div", { class: "form" }, h("p", { class: "muted", text: "We'll tell your driver straight away and call you on " + profile.phone + "." }), item, det),
      actions: [h("button", { type: "button", class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { type: "button", class: "btn primary", onclick: async () => {
        if (!item.value.trim()) { toast("Say what you left."); return; }
        await addLost({ item: item.value.trim(), details: det.value.trim(), jobId: j.id, driverId: j.driverId || null, customer: profile, by: "customer" });
        if (j.driverId) sendMsg(j.driverId, "dispatch", "Lost property: " + profile.name + " left " + item.value.trim() + " after " + j.pickup.name + " → " + j.drop.name + ". Please check the car and tell the office.");
        m.close(); toast("Reported. Your driver has been told.", "ok");
      } }, "Report")] });
  }

  // ---------- trips ----------
  function renderTrips() {
    const list = myJobs().sort((a, b) => (b.when || 0) - (a.when || 0)).slice(0, 40);
    fill(sheet,
      h("div", { class: "b-head" }, h("button", { type: "button", class: "ibtn", "aria-label": "Back", onclick: () => go("home") }, icon("back", 20)), h("h2", { text: "Your trips" })),
      list.length ? h("div", { class: "b-trips" }, list.map(j => h("div", { class: "b-tripcard" },
        h("div", { class: "b-tripcard-hd" }, h("b", { text: stamp(j.when) }), h("span", { class: "pill " + STATUS[j.status].tone, text: j.prebook && j.status === "new" ? "Booked" : STATUS[j.status].label })),
        line("a", j.pickup.name), line("b", j.drop.name),
        h("div", { class: "b-tripcard-ft dim" }, money(j.fare) + (j.pay ? " · " + (j.pay === "cash" ? "cash" : j.pay === "account" ? "on account" : "card") : "") + (j.rating ? " · " + "★".repeat(j.rating) : "") + (j.passenger ? " · for " + j.passenger.name : "")),
        j.status === "done" || j.status === "cancelled" ? h("div", { class: "b-tripcard-act" },
          h("button", { type: "button", class: "b-chip", onclick: () => { draft.pickup = j.pickup; draft.drop = j.drop; draft.vehicle = j.vehicle || "saloon"; draft.passengers = j.passengers || 1; draft.when = null; go("home"); } }, icon("repeat", 13), "Book again"),
          h("button", { type: "button", class: "b-chip", onclick: () => { draft.pickup = j.drop; draft.drop = j.pickup; draft.when = null; go("home"); } }, icon("swap", 13), "Return trip"),
          j.status === "done" ? h("button", { type: "button", class: "b-chip ghost", onclick: () => reportLost(j) }, "Lost item") : null,
          j.status === "done" ? h("button", { type: "button", class: "b-chip ghost", onclick: () => reportProblem(j) }, "Problem") : null) : null,
        j.prebook && ["new", "offered"].includes(j.status) ? h("button", { type: "button", class: "link-btn", onclick: async () => { if (await confirmBox("Cancel this booking?", "", "Cancel booking", true)) cancel(j); } }, "Cancel booking") : null))) :
        h("div", { class: "empty" }, h("b", { text: "No trips yet" }), h("span", { text: "Your bookings will show up here." })),
      h("button", { type: "button", class: "link-btn center", onclick: () => profileEdit() }, "Not " + profile.name + "? Change details"));
  }
  function profileEdit() { go("home"); setTimeout(() => { const d = sheet.querySelector(".b-more"); if (d) d.open = true; }, 50); }

  // ---------- book by message ----------
  let chat = store.get("chat", [{ from: "bot", text: "Hi! Tell me where you want to go, like \"from the Tower to the airport at 8pm for 3 people\"." }]);
  let pendingQuote = null;
  function renderChat() {
    const list = h("div", { class: "c-list" });
    const input = h("input", { class: "b-input", id: "c-in", placeholder: "Type a message", autocomplete: "off", enterkeyhint: "send" });
    const send = () => { const t = input.value.trim(); if (!t) return; input.value = ""; say(t); };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send(); } });
    fill(sheet,
      h("div", { class: "b-head" }, h("button", { type: "button", class: "ibtn", "aria-label": "Back", onclick: () => go("home") }, icon("back", 20)), h("div", {}, h("h2", { text: K.settings.firm }), h("small", { class: "dim", text: "Book by message · works like WhatsApp" }))),
      list,
      h("div", { class: "c-input" }, input, h("button", { type: "button", class: "b-send", "aria-label": "Send", onclick: send }, icon("send", 18))));
    fill(list, chat.slice(-30).map(m => h("div", { class: "c-msg " + m.from, text: m.text })));
    setTimeout(() => { list.scrollTop = list.scrollHeight; input.focus(); }, 0);
  }
  function push(from, text) { chat.push({ from, text, at: Date.now() }); chat = chat.slice(-40); store.set("chat", chat); if (screen === "chat") renderChat(); }
  async function say(text) {
    push("me", text);
    if (pendingQuote && /^(y|yes|yeah|yep|book|ok|go)\b/i.test(text)) {
      const q = pendingQuote; pendingQuote = null;
      const id = await createJob(Object.assign({ customer: profile, source: "whatsapp" }, q));
      if (id) { watching = id; store.set("watchJob", id); push("bot", q.when > Date.now() + 15 * 60000 ? "Booked for " + new Date(q.when).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) + ". We'll text when your driver is on the way." : "Booked! Finding your driver now. Tap Back to watch the car arrive."); }
      return;
    }
    if (pendingQuote && /^(n|no|nah|cancel)\b/i.test(text)) { pendingQuote = null; push("bot", "No problem. Where would you like to go instead?"); return; }
    const parsed = await parse(text);
    if (!parsed.drop) { push("bot", "Where are you heading? You can say a place like \"Pleasure Beach\" or an address like \"23 Church Street\"."); return; }
    const pickup = parsed.pickup || draft.pickup || landmark("Blackpool Tower");
    const q = quote(pickup, parsed.drop, K.settings, parsed.vehicle, parsed.when || Date.now());
    pendingQuote = { pickup, drop: parsed.drop, when: parsed.when || Date.now(), passengers: parsed.passengers, vehicle: parsed.vehicle };
    const eta = nearestEta(pickup, parsed.vehicle);
    push("bot", "From " + pickup.name + " to " + parsed.drop.name + (parsed.when ? " at " + new Date(parsed.when).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "") + " for " + parsed.passengers + (parsed.passengers === 1 ? " person" : " people") + " in a " + VEHICLES[parsed.vehicle].label.toLowerCase() + ". " + money(q.fare) + (parsed.when ? "" : eta ? ", car in about " + eta + " min" : "") + ". Pay the driver by cash or card. Reply YES to book.");
  }
  async function parse(text) {
    const t = text.toLowerCase();
    let pickup = null, drop = null;
    const m = t.match(/(?:from\s+)?(.+?)\s+to\s+(.+?)(?:\s+(?:at|for|tomorrow|tonight|please)\b.*)?$/);
    if (m) { pickup = findPlace(m[1]); drop = findPlace(m[2]); }
    if (!drop) drop = findPlace(t.replace(/^.*\bto\b/, ""));
    if (pickup && drop && pickup.name === drop.name) pickup = null;
    if (K.api.ai && (!drop || !m)) {
      try {
        const out = await K.api.ai.ask("Extract a taxi booking from this message. Reply with JSON only: {\"pickup\": place or null, \"drop\": place or null}. Places are in Blackpool. Message: " + JSON.stringify(text));
        const j = JSON.parse(out.replace(/```(json)?/g, "").trim());
        if (j.drop) drop = findPlace(j.drop) || drop;
        if (j.pickup) pickup = findPlace(j.pickup) || pickup;
      } catch (e) {}
    }
    let when = null;
    const tm = t.match(/(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/) || t.match(/at\s+(\d{1,2})[:.](\d{2})/);
    if (tm) {
      let hh = +tm[1]; const mm = +(tm[2] || 0);
      if (tm[3] === "pm" && hh < 12) hh += 12; if (tm[3] === "am" && hh === 12) hh = 0;
      const d = new Date(); d.setHours(hh, mm, 0, 0);
      if (/tomorrow/.test(t) || d.getTime() < Date.now() - 5 * 60000) d.setDate(d.getDate() + 1);
      when = d.getTime();
    }
    const pm = t.match(/(\d)\s*(?:people|passengers|of us|persons)/);
    const passengers = pm ? Math.min(8, +pm[1]) : 1;
    const vehicle = /wheelchair/.test(t) ? "wav" : passengers > 4 ? "mpv" : /estate|luggage|suitcases|cases/.test(t) ? "estate" : "saloon";
    return { pickup, drop, when, passengers, vehicle };
  }

  // ---------- choose on map ----------
  let pickField = null, pickDesc = null;
  function startPick(which) {
    pickField = which; screen = "pick"; homeEls = null;
    if (document.activeElement) document.activeElement.blur();
    render();
    const start = draft[which] || draft.pickup || landmark("Blackpool Tower");
    map.setFollow(null); map.lookAt(start, 700);
    setTimeout(() => onPickMove(map.center() || start), 700);
  }
  function onPickMove(p) {
    if (screen !== "pick" || !p) return;
    pickDesc = Object.assign(describe(p), { x: Math.round(p.x), y: Math.round(p.y) });
    const t = document.getElementById("pick-name"), s = document.getElementById("pick-street");
    if (t) t.textContent = pickDesc.name;
    if (s) s.textContent = pickDesc.street && !pickDesc.name.includes(pickDesc.street) ? pickDesc.street : "Blackpool";
  }
  map.onMoveEnd && map.onMoveEnd(onPickMove);
  function renderPick() {
    fill(sheet,
      h("div", { class: "b-grab" }),
      h("div", { class: "b-pick" },
        h("small", { class: "dim", text: pickField === "pickup" ? "Set pick-up" : "Set destination" }),
        h("b", { id: "pick-name", text: pickDesc ? pickDesc.name : "Move the map" }),
        h("span", { class: "dim", id: "pick-street", text: "Blackpool" })),
      h("div", { class: "b-actions" },
        h("button", { type: "button", class: "b-btn", onclick: () => { screen = "home"; render(); } }, "Cancel"),
        h("button", { type: "button", class: "b-btn primary", onclick: () => { if (!pickDesc) return; draft[pickField] = { name: pickDesc.name, x: pickDesc.x, y: pickDesc.y }; if (pickField === "pickup") store.set("lastPickup", draft.pickup); screen = "home"; render(); } }, "Confirm")));
  }

  // ---------- render ----------
  function render() {
    renderTop();
    const j = current();
    if (j && screen !== "trips" && screen !== "chat" && screen !== "pick") { screen = "track"; homeEls = null; renderTrack(j); }
    else if (screen === "track") { screen = "home"; renderHome(); }
    else if (screen === "trips") { homeEls = null; renderTrips(); }
    else if (screen === "chat") { homeEls = null; renderChat(); }
    else if (screen === "pick") { renderPick(); }
    else renderHome();
    root.querySelector(".phone-app").dataset.screen = screen;
    updateMap();
  }
  function updateMap() {
    const j = current();
    if (screen === "pick") { map.update({ drivers: driversList().filter(d => d.status === "free"), jobs: [], focus: null }); return; }
    if (j && j.driverId && K.drivers[j.driverId]) {
      const d = K.drivers[j.driverId];
      map.update({ drivers: [d], jobs: [j], me: d.id, focus: j.id, onlyRoute: d.id });
      map.setFollow(() => Object.assign(posOf(d), { w: 1600 }));
    } else if (j) {
      map.update({ drivers: driversList().filter(d => d.status === "free"), jobs: [j], focus: j.id });
      map.setFollow(null); map.lookAt(j.pickup, 2400);
    } else {
      const near = driversList().filter(d => d.status === "free");
      map.update({ drivers: near, jobs: draft.drop && draft.pickup ? [{ id: "draft", status: "new", pickup: draft.pickup, drop: draft.drop }] : [], focus: draft.drop ? "draft" : null });
      map.setFollow(null);
      if (draft.pickup && draft.drop) { const c = { x: (draft.pickup.x + draft.drop.x) / 2, y: (draft.pickup.y + draft.drop.y) / 2 }; map.lookAt(c, Math.max(2000, Math.hypot(draft.pickup.x - draft.drop.x, draft.pickup.y - draft.drop.y) * 1.5)); } else if (draft.pickup) map.lookAt(draft.pickup, 2600);
    }
  }

  // text messages land as a phone-style banner (in the demo, texts are logged rather than sent)
  let seenTexts = Date.now();
  function showTexts() {
    const mine = new Set([custKey(), forOther && String(forOther.phone || "").replace(/\D/g, "")].filter(Boolean));
    const fresh = K.texts.filter(t => t.at > seenTexts && mine.has(String(t.to).replace(/\D/g, ""))).sort((a, b) => a.at - b.at);
    if (!fresh.length) return;
    seenTexts = fresh[fresh.length - 1].at;
    const t = fresh[fresh.length - 1];
    const old = root.querySelector(".sms-banner"); if (old) old.remove();
    const b = h("div", { class: "sms-banner", role: "status" }, h("span", { class: "sms-ic" }, icon("sms", 16)), h("div", { class: "grow" }, h("small", { class: "dim", text: "Text message · now" + (t.status === "logged" ? " · demo" : "") }), h("p", { text: t.body })));
    b.addEventListener("click", () => b.remove());
    root.querySelector(".phone-app").append(b);
    setTimeout(() => b.classList.add("out"), 6500); setTimeout(() => b.remove(), 7000);
  }

  let lastKey = "";
  onChange(() => {
    showTexts();
    const j = current();
    const key = screen + "|" + (j ? j.id + j.status + (j.driverId || "") : "") + "|" + K.settingsLoaded;
    if (screen === "pick") { updateMap(); return; }
    if (key !== lastKey || (screen === "track" && !(j && j.status === "done"))) { lastKey = key; if (screen === "home" && !j) { updateQuote(); updateMap(); } else render(); }
    else if (screen === "home") { updateQuote(); updateMap(); }
    else updateMap();
  });
  setInterval(() => { if (screen === "track") { const j = current(); if (j && j.status !== "done") renderTrack(j); } }, 1000);
  render();
}
