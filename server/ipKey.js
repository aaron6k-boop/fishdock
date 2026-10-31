// Network addresses are never stored. Where a guest has to be told apart (rate limits,
// counting live viewers once), the address is turned into a keyed HMAC:
// - with IP_HASH_SECRET set in the server environment, that secret is the key;
// - otherwise a random key made for the day and kept in D1, deleted after two days,
//   after which yesterday's values can't be linked to anyone.
// Unlike a plain SHA-256 of an address, neither can be reversed by trying every address.

const DAY = 86400e3;
const cache = new Map(); // day -> CryptoKey
export function resetIpKeysForTests() { cache.clear(); }

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function keyFor(db, env, now) {
  const day = Math.floor(now / DAY);
  if (cache.has(day)) return cache.get(day);
  let raw;
  if (env?.IP_HASH_SECRET) raw = new TextEncoder().encode(env.IP_HASH_SECRET + "|" + day);
  else {
    await db.prepare(`CREATE TABLE IF NOT EXISTS ip_hash_keys (day INTEGER PRIMARY KEY, k TEXT NOT NULL)`).run();
    const fresh = b64(crypto.getRandomValues(new Uint8Array(32)));
    await db.prepare(`INSERT OR IGNORE INTO ip_hash_keys (day, k) VALUES (?1, ?2)`).bind(day, fresh).run();
    await db.prepare(`DELETE FROM ip_hash_keys WHERE day < ?1`).bind(day - 1).run();
    const row = await db.prepare(`SELECT k FROM ip_hash_keys WHERE day = ?1`).bind(day).first();
    raw = new TextEncoder().encode(row?.k || fresh);
  }
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  cache.set(day, key);
  for (const d of cache.keys()) if (d < day - 1) cache.delete(d);
  return key;
}

/** A short, non-reversible key for an address (stable within a day). */
export async function ipKey(db, env, ip, now = Date.now()) {
  const key = await keyFor(db, env, now);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(ip || "local")));
  return b64(sig).slice(0, 32);
}
