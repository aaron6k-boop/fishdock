// Server-side verification of Firebase Auth ID tokens (RS256 JWTs) using
// Google's public signing keys (ported from DetectDock). No service account or secret key is needed:
// the signature proves Google issued the token for this Firebase project (FIREBASE_PROJECT_ID, default
// "fishdock"). Checks follow Firebase's documented rules for verifying ID tokens.

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let cache = { keys: null, expires: 0 };

function b64urlToBytes(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const decodeJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

export async function googleKeys(now = Date.now(), fetchFn = globalThis.fetch) {
  if (cache.keys && now < cache.expires) return cache.keys;
  const res = await fetchFn(JWKS_URL, { signal: AbortSignal.timeout?.(8e3) });
  if (!res.ok) throw new Error("jwks fetch failed");
  const { keys } = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  cache = { keys, expires: now + Math.min(Number(m?.[1] ?? 3600), 6 * 3600) * 1000 };
  return keys;
}

/**
 * Returns the verified Firebase user { uid, email, emailVerified, name, provider }
 * or null when the token is missing, malformed, expired, for another project,
 * or not signed by Google.
 */
export async function verifyIdToken(token, projectId, { now = Date.now(), keys, fetch: fetchFn } = {}) {
  try {
    if (typeof token !== "string" || token.length > 4096) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJson(parts[0]);
    const p = decodeJson(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const sec = Math.floor(now / 1000);
    if (p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof p.exp !== "number" || p.exp <= sec) return null;
    if (typeof p.iat !== "number" || p.iat > sec + 300) return null;
    if (typeof p.auth_time !== "number" || p.auth_time > sec + 300) return null;
    if (typeof p.sub !== "string" || !p.sub || p.sub.length > 128) return null;

    const jwks = keys ?? (await googleKeys(now, fetchFn ?? globalThis.fetch));
    const jwk = jwks.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    if (!ok) return null;
    return {
      uid: p.sub,
      email: typeof p.email === "string" ? p.email : null,
      emailVerified: p.email_verified === true,
      name: typeof p.name === "string" ? p.name : null,
      provider: p.firebase?.sign_in_provider ?? null,
      authTime: p.auth_time * 1000, // when the user last actually signed in
    };
  } catch {
    return null;
  }
}

export function resetKeyCacheForTests() {
  cache = { keys: null, expires: 0 };
}
