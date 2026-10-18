// Shared live trip: what family see when someone sends them the "Share live trip" link.
import { h, fill, icon, fmtTime } from "../lib/dom.js";
import { posOf, driveMinutes } from "../lib/geo.js";
import { createMap } from "../lib/map.js";
import { K, onChange, carLabel, etaTo, jobOfDriver } from "../store.js";

export function mountShare(root, jobId) {
  root.classList.add("app-root");
  const mapBox = h("div", { class: "b-map" }), sheet = h("div", { class: "b-sheet" });
  fill(root, h("div", { class: "phone-app book share", dataset: { screen: "track" } }, mapBox,
    h("div", { class: "b-top" }, h("span", { class: "b-brand" }, icon("share", 15), "Live trip")), sheet));
  const map = createMap(mapBox, { compact: true });

  function render() {
    const j = K.jobs.find(x => x.id === jobId);
    if (!j) { fill(sheet, h("div", { class: "b-grab" }), h("h2", { class: "b-hello", text: "Trip not found" }), h("p", { class: "dim", text: "The link may be wrong, or the trip was a while ago." })); return; }
    const d = j.driverId && K.drivers[j.driverId];
    const who = (j.passenger && j.passenger.name) || (j.customer && j.customer.name || "").split(" ")[0] || "They";
    let head, sub = "";
    const ended = ["done", "cancelled", "noshow"].includes(j.status);
    if (j.status === "new" || j.status === "offered") { head = "Finding a driver"; sub = "Booked with " + K.settings.firm; }
    else if (j.status === "accepted") { const cur = d && jobOfDriver(d.id); const m = cur && cur.id !== j.id ? (etaTo(d, cur.drop) || 0) + driveMinutes(cur.drop, j.pickup) : etaTo(d, j.pickup); head = "Car arriving in about " + Math.max(1, m) + " min"; sub = "Picking " + who + " up from " + j.pickup.name; }
    else if (j.status === "arrived") { head = "The car is outside"; sub = "At " + j.pickup.name; }
    else if (j.status === "pob") { const m = Math.max(1, etaTo(d, j.drop)); head = who + " is on the way"; sub = "Arriving at " + j.drop.name + " about " + fmtTime(Date.now() + m * 60000); }
    else if (j.status === "done") { head = who + " has arrived"; sub = "Dropped at " + j.drop.name + " at " + fmtTime(j.doneAt); }
    else { head = "This trip was cancelled"; }
    fill(sheet, h("div", { class: "b-grab" }),
      h("div", { class: "b-status" }, ended ? icon(j.status === "done" ? "check" : "x", 20) : h("span", { class: "live-dot" }), h("div", {}, h("h2", { text: head }), h("p", { class: "dim", text: sub }))),
      d && !ended ? h("div", { class: "b-driver" }, h("span", { class: "b-av", text: d.name.split(" ").map(x => x[0]).join("").slice(0, 2) }),
        h("div", { class: "b-driver-txt" }, h("b", { text: d.name.split(" ")[0] + " · Car " + d.call }), h("span", { class: "dim", text: carLabel(d) })), h("span", { class: "plate", text: d.car.reg })) : null,
      h("div", { class: "b-trip" }, h("div", { class: "b-line" }, h("i", { class: "a" }), h("span", { text: j.pickup.name })), h("div", { class: "b-line" }, h("i", { class: "b" }), h("span", { text: j.drop.name }))),
      h("p", { class: "dim small", text: "Shared by " + ((j.customer && j.customer.name) || "the passenger") + ". You can see this trip until it ends." }));
    if (d && !ended) { map.update({ drivers: [d], jobs: [j], me: d.id, focus: j.id, onlyRoute: d.id }); map.setFollow(() => Object.assign(posOf(d), { w: 1800 })); }
    else { map.update({ drivers: [], jobs: [Object.assign({}, j, { status: "new" })], focus: j.id }); map.setFollow(null); map.lookAt(j.status === "done" ? j.drop : j.pickup, 1800); }
  }
  onChange(render);
  setInterval(render, 5000);
  render();
}
