// ---- ics: a calendar event for a fishing window, made on the phone (nothing is sent anywhere) ----
// RFC 5545: UTC times, CRLF lines, commas, semicolons and backslashes escaped, lines folded at 75 octets.

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
function fold(line) {
  // by whole characters (code points), so an emoji or accented letter is never cut in half
  const enc = new TextEncoder(), out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 75) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
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
