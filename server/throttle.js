// Flood throttles for the open data routes (conditions, tides, river), per network.
//
// The network is never stored: it's turned into the day's keyed hash (ipKey.js). The same key counts the
// network once as "active today" for the admin overview (guests: hashed network day keys). Without the
// database nothing is throttled or counted here (the routes still answer).

import { ipKey } from "./ipKey.js";
import { enforce, noteGuest } from "./db.js";
import { clientIp } from "./account.js";
import { ukDay } from "./time.js";

export const DATA_LIMITS = { perNetworkPerMinute: 120 };

const seen = new Map(); // network key -> UK day already counted (per worker)
export function resetThrottleForTests() { seen.clear(); }

/** The day's keyed hash of the caller's network. */
export const networkKey = (db, env, request, now) => ipKey(db, env, clientIp(request), now);

/** Counts this network active today (one write a day per worker). */
export async function noteNetwork(db, key, now) {
  const day = ukDay(now);
  if (seen.get(key) === day) return;
  try {
    await noteGuest(db, key, now);
    seen.set(key, day);
    if (seen.size > 20000) seen.clear();
  } catch {
    // counting never fails a request
  }
}

export async function dataThrottle(db, env, request, now) {
  if (!db) return;
  const key = await networkKey(db, env, request, now);
  await noteNetwork(db, key, now);
  await enforce(db, "data:" + key, DATA_LIMITS.perNetworkPerMinute, now, { windowMs: 60e3 }, "Just a moment: lots of lookups at once.");
}
