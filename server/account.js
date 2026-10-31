// Signed-in accounts: who is calling, from a verified Firebase ID token.
//
// - The token is checked here against Google's public keys (firebaseAuth.js) for FishDock's own Firebase project
//   (FIREBASE_PROJECT_ID, default "fishdock"; never DetectDock's).
// - Only real accounts count: Google, Apple, or email and password. Anonymous or other providers are treated as
//   signed out, even if they are switched on in Firebase.
// - The uid always comes from the verified token, never from a request body or the URL.

import { verifyIdToken } from "./firebaseAuth.js";
import { fail } from "./http.js";
import { noteAccount } from "./db.js";
import { recordHealth } from "./upstream.js";
import { ukDay } from "./time.js";

export const DEFAULT_PROJECT_ID = "fishdock";
export const PROVIDERS = ["password", "google.com", "apple.com"];

export const hasToken = (request) => /^Bearer\s+\S/.test(request.headers.get("authorization") || "");

// Google's token-signing keys are fetched rarely (cached for hours); each fetch is noted in source_health.
const keysFetch = (db, now) => async (url, init) => {
  try {
    const res = await globalThis.fetch(url, init);
    await recordHealth(db, "google-signing-keys", res.ok, res.ok ? null : `http_${res.status}`, now);
    return res;
  } catch (e) {
    await recordHealth(db, "google-signing-keys", false, e?.name === "TimeoutError" ? "timeout" : "network", now);
    throw e;
  }
};

/** { uid, email, emailVerified, provider, unverified, authTime } for a valid token, otherwise null. */
export async function accountFrom(request, env, now = Date.now(), deps = {}) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const verify = deps.verifyIdToken ?? ((t) => verifyIdToken(t, env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID, { now, fetch: keysFetch(env.DB, now) }));
  let user = null;
  try {
    user = await verify(auth.slice(7).trim());
  } catch {
    user = null;
  }
  if (!user || typeof user.uid !== "string" || !user.uid || !PROVIDERS.includes(user.provider)) return null;
  const emailVerified = user.emailVerified === true;
  return {
    uid: user.uid,
    email: emailVerified && typeof user.email === "string" ? user.email.toLowerCase() : null,
    emailVerified,
    provider: user.provider,
    // An email and password account whose address isn't confirmed yet.
    unverified: user.provider === "password" && !emailVerified,
    authTime: Number(user.authTime) || null,
  };
}

/** The account, or a 401 thrown with `words`. */
export async function requireAccount(request, env, now, deps, words = "Sign in to your FishDock account first.") {
  const me = await accountFrom(request, env, now, deps);
  if (!me) throw fail(401, "sign_in_required", hasToken(request) ? "Your sign-in has expired. Sign in again." : words);
  return me;
}

// ---- activity ----
// One write a day per account per worker at most (the users row and a hashed active-day row).
const noted = new Map(); // uid -> UK day
export function resetAccountsForTests() { noted.clear(); }
export async function noteActive(db, env, uid, now) {
  if (!db) return;
  const day = ukDay(now);
  if (noted.get(uid) === day) return;
  try {
    await noteAccount(db, env, uid, now);
    noted.set(uid, day);
    if (noted.size > 5000) noted.clear();
  } catch {
    // activity counts never fail a request
  }
}

export async function isBanned(db, uid) {
  if (!db || !uid) return false;
  return Boolean(await db.prepare(`SELECT 1 FROM users WHERE uid = ?1 AND banned_at IS NOT NULL`).bind(uid).first());
}

/** The caller's network as the day's keyed hash (ipKey.js); never the address itself. */
export const clientIp = (request) => request.headers.get("cf-connecting-ip") || "local";
