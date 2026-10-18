// Demand forecasts and hot spots, worked out from past jobs and upcoming events.
import { K, driversList } from "../store.js";
import { MAP } from "../lib/mapdata.js";

const HOUR = 3600000, DAY = 86400000;
export const JOBS_PER_CAR_HOUR = 2; // a Blackpool car does about two jobs an hour on a busy night

// events that are on during [from, to). Nightly events (the Illuminations) repeat each evening until "until".
export function eventsBetween(from, to) {
  const out = [];
  for (const e of K.events) {
    if (!e.start) continue;
    if (e.nightly) {
      const len = (e.end || e.start + 4 * HOUR) - e.start;
      for (let t = e.start; t < Math.min(to, e.until || e.start); t += DAY) if (t + len > from) out.push(Object.assign({}, e, { start: t, end: t + len }));
    } else if (e.end > from && e.start < to) out.push(e);
  }
  return out.sort((a, b) => a.start - b.start);
}
// extra jobs an event brings: most people leave in the hour after it ends
export function eventLift(e, hourStart) {
  const crowd = e.crowd || 1000, share = e.nightly ? 0.0015 : 0.005; // share of the crowd that books with this firm (one firm of many)
  const end = e.end || e.start + 3 * HOUR;
  if (hourStart >= end - HOUR / 2 && hourStart < end + HOUR) return crowd * share * (hourStart < end + HOUR / 4 ? 0.65 : 0.35);
  if (hourStart >= e.start - HOUR && hourStart < e.start) return crowd * share * 0.3;
  if (e.nightly && hourStart >= e.start && hourStart < end) return crowd * share * 0.3;
  return 0;
}
// average jobs in each hour of a given weekday, from the last 4 weeks of history
export function baseline(weekday) {
  const from = Date.now() - 28 * DAY;
  const hours = Array(24).fill(0), daysSeen = new Set(), allDays = new Set(), all = Array(24).fill(0);
  for (const j of K.jobs) {
    const t = j.when || j.createdAt; if (!t || t < from || j.status === "cancelled") continue;
    const d = new Date(t); const dk = d.toDateString();
    allDays.add(dk); all[d.getHours()]++;
    if (d.getDay() === weekday) { daysSeen.add(dk); hours[d.getHours()]++; }
  }
  const n = daysSeen.size, m = Math.max(1, allDays.size);
  // blend the same weekday with all days so two weeks of history still gives a sensible shape
  return hours.map((v, i) => n ? 0.6 * v / n + 0.4 * all[i] / m : all[i] / m);
}
export function forecastDay(dayStart) {
  const base = baseline(new Date(dayStart).getDay());
  const evs = eventsBetween(dayStart - 2 * HOUR, dayStart + DAY + 3 * HOUR);
  const hours = base.map((b, h) => {
    const t = dayStart + h * HOUR;
    const lift = evs.reduce((a, e) => a + eventLift(e, t), 0);
    const jobs = b + lift;
    return { hour: h, t, base: b, lift, jobs, cars: Math.ceil(jobs / JOBS_PER_CAR_HOUR) };
  });
  const peak = hours.reduce((a, x) => x.jobs > a.jobs ? x : a, hours[0]);
  const onBooks = driversList().length;
  return { dayStart, hours, events: evs.filter(e => e.start < dayStart + DAY && e.end > dayStart), peak, total: hours.reduce((a, x) => a + x.jobs, 0), onBooks, short: Math.max(0, peak.cars - onBooks) };
}

// hot spots right now: past pickups around this time of day, plus events about to empty out
export function hotSpots(now = Date.now()) {
  const pts = [];
  const h = new Date(now).getHours();
  for (const j of K.jobs) {
    const t = j.when || j.createdAt; if (!t || t > now || now - t > 21 * DAY || !j.pickup) continue;
    const jh = new Date(t).getHours(), dh = Math.min(Math.abs(jh - h), 24 - Math.abs(jh - h));
    if (dh <= 1) pts.push({ x: j.pickup.x, y: j.pickup.y, w: dh ? 0.5 : 1 });
  }
  for (const e of eventsBetween(now - HOUR, now + 2 * HOUR)) if (e.x != null) {
    const w = Math.min(14, (e.crowd || 1000) / 500);
    for (let i = 0; i < 6; i++) pts.push({ x: e.x + (Math.random() - 0.5) * 120, y: e.y + (Math.random() - 0.5) * 120, w: w / 3 });
  }
  return pts;
}
// the busiest areas as a short list for drivers: "Blackpool Tower · 9 jobs around now"
export function busiestAreas(now = Date.now(), n = 4) {
  const counts = new Map();
  for (const p of hotSpots(now)) {
    let best = null, bd = 700 * 700;
    for (const l of MAP.landmarks) { const d = (l.x - p.x) ** 2 + (l.y - p.y) ** 2; if (d < bd) { bd = d; best = l; } }
    if (best) counts.set(best.name, (counts.get(best.name) || 0) + p.w);
  }
  const evNow = eventsBetween(now - HOUR, now + 3 * HOUR);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, w]) => ({ name, score: Math.round(w), event: evNow.find(e => e.venue === name) || null }));
}
