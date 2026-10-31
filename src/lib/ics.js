// ---- ics: a calendar event for a fishing window, made on the phone (nothing is sent anywhere) ----
// RFC 5545: UTC times, CRLF lines, commas, semicolons and backslashes escaped, lines folded at 75 octets.

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
function fold(line) {
  const out = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let n = 75;
    while (new TextEncoder().encode(rest.slice(0, n)).length > 75) n--;
    out.push(rest.slice(0, n));
    rest = " " + rest.slice(n);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** { title, start, end, where, notes, alarmMin } to an .ics file's text. `where` is a place name, never coordinates. */
export function icsEvent({ title, start, end, where = "", notes = "", alarmMin = 60, now = Date.now() }) {
  const uid = `${stamp(start)}-${Math.abs(hash(title + where))}@fishdock`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FishDock//Fishing window//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    where ? `LOCATION:${esc(where)}` : null,
    notes ? `DESCRIPTION:${esc(notes)}` : null,
    alarmMin ? "BEGIN:VALARM" : null, alarmMin ? `TRIGGER:-PT${alarmMin}M` : null, alarmMin ? "ACTION:DISPLAY" : null,
    alarmMin ? `DESCRIPTION:${esc(title)}` : null, alarmMin ? "END:VALARM" : null,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
