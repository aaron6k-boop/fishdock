// ---- timeOfDay: a time today for "morning", "midday", "dusk" or "night" at a place (or now), from the sun ----
import ASTRO from "./astro.js";

export const LIGHTS = [["now", "Now"], ["morning", "Morning"], ["midday", "Midday"], ["dusk", "Dusk"], ["night", "Night"]];
export function timeFor(choice, place) {
  if (choice === "now") return Date.now();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  let best = Date.now(), score = Infinity;
  for (let m = 0; m < 24 * 60; m += 10) {
    const t = day.getTime() + m * 60e3, a = ASTRO.sunPos(t, place.lat, place.lon).alt, pm = m >= 12 * 60;
    const s = choice === "midday" ? -a : choice === "morning" ? (pm ? Infinity : Math.abs(a - 8)) : choice === "dusk" ? (pm ? Math.abs(a + 1) : Infinity) : (pm ? Math.abs(a + 18) : Infinity);
    if (s < score) { score = s; best = t; }
  }
  return best;
}
