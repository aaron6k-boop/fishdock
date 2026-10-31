// UK time (Europe/London) for daily allowances and for the times the app shows.
// Allowances reset at UK midnight, so "back tomorrow" is true for UK anglers whatever the server's clock zone.
// The clocks change at 01:00 UTC, after UK midnight, so the offset at that UTC midnight is the right one;
// the days the clocks change are 23 and 25 hours long.

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function londonParts(t) {
  const p = Object.fromEntries(LONDON.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}

/** UK clock minus UTC at `t` (0 in winter, an hour in summer), in ms. */
export function londonOffset(t) {
  const p = londonParts(t);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

const pad = (n) => String(n).padStart(2, "0");

/** The UK date at `now`, "YYYY-MM-DD". */
export function ukDay(now) {
  const p = londonParts(now);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** When the UK day containing `now` ends: the next midnight in Europe/London, in ms. */
export function ukDayEnd(now) {
  const p = londonParts(now);
  const utcMidnight = Date.UTC(p.y, p.m - 1, p.d + 1);
  return utcMidnight - londonOffset(utcMidnight);
}

/** When the UK day containing `now` began (UK midnight), in ms. */
export function ukDayStart(now) {
  const p = londonParts(now);
  const utcMidnight = Date.UTC(p.y, p.m - 1, p.d);
  return utcMidnight - londonOffset(utcMidnight);
}

/** The UK date `n` days before the UK date at `now` ("YYYY-MM-DD"). */
export function ukDayBefore(now, n) {
  const p = londonParts(now);
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d - n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `t` as an ISO 8601 string in UK local time with its offset, e.g. "2026-10-31T14:00:00+00:00". */
export function ukIso(t) {
  const p = londonParts(t);
  const off = Math.round(londonOffset(t) / 60e3);
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
