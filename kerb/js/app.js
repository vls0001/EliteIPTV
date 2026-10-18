// Entry point: connects a backend, starts live sync and the dispatch engine, then shows the chosen app.
//   #book      customer app        #driver   driver app
//   #dispatch  dispatcher + office #demo     all three side by side
import { APP } from "./config.js";
import { h, fill, icon, toast, store } from "./lib/dom.js";
import { connect } from "./backend/index.js";
import { K, startSync, startEngine, onChange } from "./store.js";
import { mountBook } from "./views/book.js";
import { mountDriver } from "./views/driver.js";
import { mountDispatch } from "./views/dispatch.js";

const root = document.getElementById("root");
const view = () => (location.hash.replace("#", "") || "home").split("-")[0];
window.addEventListener("hashchange", () => location.reload());

function logo(size) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 120 120"); s.setAttribute("width", size); s.setAttribute("height", size); s.innerHTML = '<use href="#logo"/>'; s.classList.add("logo"); return s; }

function home() {
  document.body.dataset.view = "home";
  const big = (href, ic, label, sub) => h("a", { class: "big", href }, icon(ic, 26), h("span", { class: "big-txt" }, h("b", { text: label }), h("small", { text: sub })));
  fill(root, h("div", { class: "launch" },
    h("div", { class: "launch-brand" }, logo(110), h("h1", {}, APP.name, h("span", { class: "ver", text: APP.version }))),
    h("p", { class: "launch-tag", text: APP.tagline }),
    h("nav", { class: "stack" },
      big("#demo", "play", "Watch the live demo", "Customer, dispatcher and driver side by side"),
      big("#book", "mapPin", "Book a taxi", "Customer app"),
      big("#driver", "car", "Driver app", "Jobs, earnings, tax and documents"),
      big("#dispatch", "list", "Dispatch & office", "Live map, bookings, drivers, rent, reports")),
    h("p", { class: "launch-note dim", text: K.api.mode === "demo" ? "Demo mode: " + K.settings.firm + " is a pretend Blackpool firm. Cars move at " + APP.speedup + "× speed and data stays in this browser." : "Connected live to " + K.settings.firm + ". Everyone with access sees the same jobs." })));
}

function demo() {
  document.body.dataset.view = "demo";
  const pane = (cls, title, sub) => h("section", { class: "demo-pane " + cls }, h("div", { class: "demo-label" }, h("b", { text: title }), h("span", { class: "dim", text: sub })), h("div", { class: "demo-mount" }));
  const a = pane("phone", "Customer", "books a taxi"), b = pane("wide", "Dispatcher", "sees it land, cars auto-assigned"), c = pane("phone", "Driver · Car 7", "gets the offer");
  const tabs = h("div", { class: "demo-tabs" }, [["Customer", a], ["Dispatcher", b], ["Driver", c]].map(([l, p], i) => h("button", { type: "button", class: "seg-btn" + (i === 1 ? " on" : ""), onclick: e => { [a, b, c].forEach(x => x.classList.toggle("show", x === p)); e.currentTarget.parentNode.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === e.currentTarget)); } }, l)));
  b.classList.add("show");
  if (!store.get("driverId") && K.drivers.d07) store.set("driverId", "d07");
  fill(root, h("div", { class: "demo" },
    h("header", { class: "demo-hd" }, h("a", { href: "#", class: "demo-home" }, logo(24), h("b", { text: APP.name })), h("span", { class: "dim grow", text: "Live demo · book on the left, watch it reach dispatch and the driver" }), tabs),
    h("div", { class: "demo-grid" }, a, b, c)));
  mountBook(a.querySelector(".demo-mount"));
  mountDispatch(b.querySelector(".demo-mount"));
  mountDriver(c.querySelector(".demo-mount"));
}

async function boot() {
  const api = await connect();
  startSync(api);
  startEngine();
  api.loadExtras().catch(() => {});
  document.documentElement.dataset.backend = api.mode;
  // wait briefly for settings so the first screen shows the firm name
  await new Promise(r => { const t = setTimeout(r, 1500); const off = onChange(() => { if (K.settingsLoaded && K.ready) { clearTimeout(t); off(); r(); } }); });
  const v = view();
  if (v === "book") { document.body.dataset.view = "phone"; mountBook(root); }
  else if (v === "driver") { document.body.dataset.view = "phone"; mountDriver(root); }
  else if (v === "dispatch") { document.body.dataset.view = "console"; mountDispatch(root); }
  else if (v === "demo") demo();
  else { home(); onChange(() => { if (view() === "home") { const n = root.querySelector(".launch-note"); if (n && K.settingsLoaded) n.textContent = n.textContent.replace(/^(Demo mode: |Connected live to )[^.]+/, m => m.startsWith("Demo") ? "Demo mode: " + K.settings.firm : "Connected live to " + K.settings.firm); } }); }
}

boot().catch(e => { console.error(e); fill(root, h("div", { class: "empty" }, h("b", { text: "Something went wrong starting " + APP.name }), h("span", { text: "Reload the page to try again." }))); });
