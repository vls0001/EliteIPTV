// Customer app: book a taxi, track it live, rate the driver, see past trips, or book by message.
import { APP, VEHICLES, STATUS } from "../config.js";
import { h, fill, icon, toast, store, stamp, fmtTime, confirmBox } from "../lib/dom.js";
import { searchPlaces, findPlace, quote, money, posOf, etaMinutes, randomSpot, zoneOf } from "../lib/geo.js";
import { createMap } from "../lib/map.js";
import { K, onChange, createJob, cancel, rate, nearestEta, carLabel, driversList } from "../store.js";

export function mountBook(root) {
  let profile = store.get("customer", { name: "Alex Morgan", phone: "07700 900123" });
  let screen = "home";
  let draft = { pickup: store.get("lastPickup", { name: "Blackpool Tower", x: 150, y: 600 }), drop: null, vehicle: "saloon", when: null, passengers: 1, notes: "" };
  let watching = store.get("watchJob", null);
  let rated = new Set();

  const mapBox = h("div", { class: "b-map" });
  const sheet = h("div", { class: "b-sheet" });
  const top = h("div", { class: "b-top" });
  fill(root, h("div", { class: "phone-app book" }, mapBox, top, sheet));
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
    const bookBtn = h("button", { type: "button", class: "b-book" }, "Book");
    let field = null;

    const showSugg = (input, which) => {
      field = which;
      const list = searchPlaces(input.value, 6);
      sugg.hidden = false;
      fill(sugg,
        which === "pickup" ? h("button", { type: "button", class: "b-sugg-item", onmousedown: e => { e.preventDefault(); const p = randomSpot("central"); pick({ name: "Your location (demo)", x: p.x, y: p.y }); } }, icon("target", 16), h("span", {}, h("b", { text: "Use my location" }), h("small", { text: "Demo: picks a spot in town" }))) : null,
        list.map(p => h("button", { type: "button", class: "b-sugg-item", onmousedown: e => { e.preventDefault(); pick(p); } }, icon(p.kind === "street" ? "mapPin" : p.kind === "station" ? "list" : "star", 16), h("span", {}, h("b", { text: p.name }), h("small", { text: p.kind === "street" ? "Street" : "Blackpool" })))));
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

    const recents = [...new Map(myJobs().filter(j => j.drop).map(j => [j.drop.name, j.drop])).values()].slice(0, 4);
    fill(sheet,
      h("div", { class: "b-grab" }),
      h("h2", { class: "b-hello", text: "Where to" + (profile.name ? ", " + profile.name.split(" ")[0] : "") + "?" }),
      h("div", { class: "b-route" },
        h("div", { class: "b-dots" }, h("i", { class: "a" }), h("span"), h("i", { class: "b" })),
        h("div", { class: "b-fields" }, pickIn, dropIn),
        h("button", { type: "button", class: "b-swap", "aria-label": "Swap pick-up and destination", onclick: () => { [draft.pickup, draft.drop] = [draft.drop, draft.pickup]; pickIn.value = draft.pickup ? draft.pickup.name : ""; dropIn.value = draft.drop ? draft.drop.name : ""; updateQuote(); } }, icon("swap", 18))),
      sugg,
      recents.length ? h("div", { class: "b-chips" }, recents.map(r => h("button", { type: "button", class: "b-chip", onclick: () => { field = "drop"; pick(r); } }, icon("clock", 13), r.name))) : null,
      vehicles,
      h("div", { class: "b-when" },
        h("button", { type: "button", class: "b-chip" + (!draft.when ? " on" : ""), onclick: e => { draft.when = null; later.hidden = true; e.currentTarget.classList.add("on"); e.currentTarget.nextSibling.classList.remove("on"); updateQuote(); } }, "Now"),
        h("button", { type: "button", class: "b-chip" + (draft.when ? " on" : ""), onclick: e => { later.hidden = false; e.currentTarget.classList.add("on"); e.currentTarget.previousSibling.classList.remove("on"); if (!later.value) { const t = new Date(Date.now() + 3600000); t.setMinutes(0); later.value = new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); draft.when = t.getTime(); updateQuote(); } later.focus(); } }, "Later"),
        later),
      h("details", { class: "b-more" }, h("summary", { text: "Your details and notes" }), h("div", { class: "b-more-body" }, nameIn, phoneIn, notes,
        h("div", { class: "b-pax" }, h("span", { text: "Passengers" }), h("button", { type: "button", class: "b-step", onclick: () => setPax(-1) }, "−"), h("b", { id: "b-paxn", text: draft.passengers }), h("button", { type: "button", class: "b-step", onclick: () => setPax(1) }, "+")))),
      summary, bookBtn);
    homeEls = { vehicles, summary, bookBtn, nameIn, phoneIn };
    updateQuote();
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
        h("span", { class: "b-veh-ic", text: v.icon }), h("b", { text: v.label }), h("small", { text: v.seats + " seats" }), h("span", { class: "b-veh-p", text: q ? money(q.fare) : "–" }));
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
    const id = await createJob({ pickup: draft.pickup, drop: draft.drop, vehicle: draft.vehicle, passengers: draft.passengers, notes: draft.notes, when: draft.when || Date.now(), customer: profile, source: "app" });
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
    else if (j.status === "accepted") { const m = etaMinutes(d && d.move); head = m <= 1 ? "Your driver is nearly there" : "Arriving in " + m + " min"; sub = "Car " + (d ? d.call : "") + " is on the way to " + j.pickup.name; }
    else if (j.status === "arrived") { head = "Your driver is outside"; sub = "Look for the " + carLabel(d) + " · " + (d ? d.car.reg : ""); }
    else if (j.status === "pob") { const m = etaMinutes(d && d.move); head = "On the way to " + j.drop.name; sub = "Arriving in about " + Math.max(1, m) + " min"; }
    else if (j.status === "done") return renderRate(j, d);
    fill(sheet,
      h("div", { class: "b-grab" }),
      h("div", { class: "b-status" + (j.status === "arrived" ? " outside" : "") }, j.status === "new" || j.status === "offered" ? h("span", { class: "spinner" }) : h("span", { class: "live-dot" }), h("div", {}, h("h2", { text: head }), h("p", { class: "dim", text: sub }))),
      d ? h("div", { class: "b-driver" },
        h("span", { class: "b-av", text: initials(d.name) }),
        h("div", { class: "b-driver-txt" }, h("b", { text: d.name.split(" ")[0] + " · Car " + d.call }), h("span", { class: "dim" }, "★ " + (d.rating || 5).toFixed(1) + " · " + carLabel(d))),
        h("span", { class: "plate", text: d.car.reg })) : null,
      h("div", { class: "b-trip" }, line("a", j.pickup.name), line("b", j.drop.name)),
      h("div", { class: "b-meta" }, h("span", {}, icon("pound", 14), money(j.fare) + " · pay the driver by cash or card")),
      h("div", { class: "b-actions" },
        d ? h("a", { class: "b-btn", href: "tel:" + d.phone.replace(/\s/g, "") }, icon("phone", 16), "Call " + d.name.split(" ")[0]) : null,
        j.status !== "pob" ? h("button", { type: "button", class: "b-btn danger", onclick: async () => { if (await confirmBox("Cancel this booking?", "The driver will be told straight away.", "Cancel booking", true)) { await cancel(j); watching = null; store.set("watchJob", null); go("home"); } } }, "Cancel") : null));
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
      h("button", { type: "button", class: "b-book", onclick: async () => { if (stars) await rate(j, stars); rated.add(j.id); watching = null; store.set("watchJob", null); draft.drop = null; toast(stars ? "Thanks for rating!" : "Thanks for riding with " + K.settings.firm + "."); go("home"); } }, stars ? "Send rating" : "Done"));
  }

  // ---------- trips ----------
  function renderTrips() {
    const list = myJobs().sort((a, b) => (b.when || 0) - (a.when || 0)).slice(0, 40);
    fill(sheet,
      h("div", { class: "b-head" }, h("button", { type: "button", class: "ibtn", "aria-label": "Back", onclick: () => go("home") }, icon("back", 20)), h("h2", { text: "Your trips" })),
      list.length ? h("div", { class: "b-trips" }, list.map(j => h("div", { class: "b-tripcard" },
        h("div", { class: "b-tripcard-hd" }, h("b", { text: stamp(j.when) }), h("span", { class: "pill " + STATUS[j.status].tone, text: j.prebook && j.status === "new" ? "Booked" : STATUS[j.status].label })),
        line("a", j.pickup.name), line("b", j.drop.name),
        h("div", { class: "b-tripcard-ft dim" }, money(j.fare) + (j.pay ? " · " + (j.pay === "cash" ? "cash" : "card") : "") + (j.rating ? " · " + "★".repeat(j.rating) : "")),
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
    const pickup = parsed.pickup || draft.pickup || { name: "Blackpool Tower", x: 150, y: 600 };
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

  // ---------- render ----------
  function render() {
    renderTop();
    const j = current();
    if (j && screen !== "trips" && screen !== "chat") { screen = "track"; homeEls = null; renderTrack(j); }
    else if (screen === "track") { screen = "home"; renderHome(); }
    else if (screen === "trips") { homeEls = null; renderTrips(); }
    else if (screen === "chat") { homeEls = null; renderChat(); }
    else renderHome();
    root.querySelector(".phone-app").dataset.screen = screen;
    updateMap();
  }
  function updateMap() {
    const j = current();
    if (j && j.driverId && K.drivers[j.driverId]) {
      const d = K.drivers[j.driverId];
      map.update({ drivers: [d], jobs: [j], me: d.id, focus: j.id, onlyRoute: d.id });
      map.setFollow(() => Object.assign(posOf(d), { w: 520 }));
    } else if (j) {
      map.update({ drivers: driversList().filter(d => d.status === "free"), jobs: [j], focus: j.id });
      map.setFollow(null); map.lookAt(j.pickup, 700);
    } else {
      const near = driversList().filter(d => d.status === "free");
      map.update({ drivers: near, jobs: draft.drop ? [{ id: "draft", status: "new", pickup: draft.pickup || { x: 150, y: 600 }, drop: draft.drop }] : [], focus: draft.drop ? "draft" : null });
      map.setFollow(null);
      if (draft.pickup) map.lookAt(draft.pickup, 760);
    }
  }

  let lastKey = "";
  onChange(() => {
    const j = current();
    const key = screen + "|" + (j ? j.id + j.status + (j.driverId || "") : "") + "|" + K.settingsLoaded;
    if (key !== lastKey || (screen === "track" && !(j && j.status === "done"))) { lastKey = key; if (screen === "home" && !j) { updateQuote(); updateMap(); } else render(); }
    else if (screen === "home") { updateQuote(); updateMap(); }
    else updateMap();
  });
  setInterval(() => { if (screen === "track") { const j = current(); if (j && j.status !== "done") renderTrack(j); } }, 1000);
  render();
}
