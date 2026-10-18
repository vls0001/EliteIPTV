// Phone GPS for drivers. Works when Kerb runs on its own web address; inside Claude the browser blocks location,
// so the demo moves the car instead.
import { toXY, MAP } from "../lib/mapdata.js";
import { K } from "../store.js";

let watchId = null, lastSent = 0, last = null, driverId = null;
export const gpsOn = () => watchId !== null;

export function startGps(id, onError, onFix) {
  stopGps(false);
  if (!("geolocation" in navigator)) { onError("This phone doesn't share its location with the browser."); return false; }
  driverId = id;
  watchId = navigator.geolocation.watchPosition(pos => {
    const p = toXY(pos.coords.latitude, pos.coords.longitude);
    if (p.x < -500 || p.y < -500 || p.x > MAP.w + 500 || p.y > MAP.h + 500) { onError("You're outside the area this map covers, so GPS is off."); stopGps(); return; }
    const now = Date.now();
    const moved = last ? Math.hypot(p.x - last.x, p.y - last.y) : 999;
    if (onFix) onFix(p, pos.coords.accuracy);
    if (moved < 12 && now - lastSent < 15000) return;
    const dir = pos.coords.heading != null && !isNaN(pos.coords.heading) ? (pos.coords.heading - 90) * Math.PI / 180 : last && moved > 5 ? Math.atan2(p.y - last.y, p.x - last.x) : undefined;
    last = p; lastSent = now;
    const patch = { x: p.x, y: p.y, gps: true, gpsAt: now, gpsAcc: Math.round(pos.coords.accuracy || 0), move: null };
    if (dir !== undefined) patch.dir = dir;
    K.api.update("drivers/" + id, patch).catch(() => {});
  }, err => {
    onError(err && err.code === 1 ? "Location is blocked here. GPS works when Kerb runs on your firm's own web address, or after you allow location for this site." : "Couldn't get a GPS fix. Check location is on.");
    stopGps();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  return true;
}
export function stopGps(write = true) {
  if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} }
  watchId = null; last = null;
  if (write && driverId && K.api) K.api.update("drivers/" + driverId, { gps: false }).catch(() => {});
}
