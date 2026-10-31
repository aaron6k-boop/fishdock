// ---- time: everything shown in UK time (Europe/London), whatever the phone's zone ----

export const TZ = "Europe/London";
const partsFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export function ukParts(ms) {
  const o = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = +p.value;
  return o; // { year, month, day, hour, minute, second }
}

/** Offset of UK time from UTC at instant ms, in ms (0 in winter, 3600000 in summer). */
export function ukOffset(ms) {
  const p = ukParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of UK midnight starting the UK day that contains ms. */
export function ukDayStart(ms) {
  const p = ukParts(ms);
  const guess = Date.UTC(p.year, p.month - 1, p.day);
  return guess - ukOffset(guess - 3600e3 * 3 + 3600e3 * 3);
}

export const fmtTime = (ms) => (ms == null ? "–" : new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ms)));
export const fmtDay = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(ms));
export const fmtShortDay = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(ms));
export const fmtDateTime = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
export const ukMonth = (ms) => ukParts(ms).month; // 1..12
export const ukHour = (ms) => { const p = ukParts(ms); return p.hour + p.minute / 60; };

export function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

export function fmtClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function hoursUntil(ms, now = Date.now()) {
  const h = (ms - now) / 3600e3;
  if (Math.abs(h) < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1).replace(/\.0$/, "")} h`;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
