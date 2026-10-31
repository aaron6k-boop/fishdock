// ---- account: optional sign-in (Firebase Auth, loaded only when used, as DetectDock does) ----
// Guests can use everything that runs on the phone. An account adds private backup, Community and admin.
import { PREVIEW } from "./api.js";
import { FIREBASE_CONFIG } from "../config.js";

let auth = null, fb = null, user = null, ready = false;
const subs = new Set();
const emit = () => { for (const f of subs) f(user); };
export const onUser = (f) => { subs.add(f); f(user); return () => subs.delete(f); };
export const currentUser = () => user;
export const accountsEnabled = () => !PREVIEW && !!FIREBASE_CONFIG?.apiKey;

async function init() {
  if (ready || !accountsEnabled()) return auth;
  const [{ initializeApp }, a] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  fb = a;
  const app = initializeApp(FIREBASE_CONFIG);
  auth = a.getAuth(app);
  a.onAuthStateChanged(auth, (u) => { user = u ? { uid: u.uid, email: u.email, name: u.displayName, verified: u.emailVerified } : null; emit(); });
  ready = true;
  return auth;
}

export async function signIn() {
  if (!accountsEnabled()) return { error: "accounts_off" };
  await init();
  try { await fb.signInWithPopup(auth, new fb.GoogleAuthProvider()); return { ok: true }; }
  catch (e) { return { error: e?.code || "sign_in_failed" }; }
}
export async function signOut() { if (auth) await fb.signOut(auth); }
export async function idToken() { if (!auth?.currentUser) return null; try { return await auth.currentUser.getIdToken(); } catch { return null; } }
export async function restore() { if (accountsEnabled()) { try { await init(); } catch { /* offline */ } } }
