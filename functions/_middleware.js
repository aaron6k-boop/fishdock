// Serves Firebase Auth's sign-in helper pages from our own domain (as DetectDock does).
//
// Safari (and other browsers that block third-party storage) lose the result of Google or Apple sign-in when the
// helper runs on <project>.firebaseapp.com. Proxying /__/auth/* and /__/firebase/* through this site makes
// sign-in first-party, as Firebase recommends. Only those two paths are forwarded, and only to FishDock's own
// Firebase project (FIREBASE_PROJECT_ID, default "fishdock"; never DetectDock's).
// (A root middleware, because Pages doesn't route function folders named "__". public/_routes.json should limit
// Functions to /api/* and /__/* so normal pages stay static.)

const DEFAULT_PROJECT_ID = "fishdock";
const PROJECT_RE = /^[a-z][a-z0-9-]{4,29}$/; // Firebase / Google Cloud project ids

export function upstreamFor(env) {
  const id = String(env?.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID).trim().toLowerCase();
  return `https://${PROJECT_RE.test(id) ? id : DEFAULT_PROJECT_ID}.firebaseapp.com`;
}

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/__/")) return next();
  if (!/^\/__\/(auth|firebase)\//.test(url.pathname)) return new Response("Not found", { status: 404 });
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie"); // nothing of ours needs to reach Firebase
  headers.delete("authorization");
  let res;
  try {
    res = await fetch(upstreamFor(env) + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      signal: AbortSignal.timeout?.(20e3), // a helper page that hangs is given up
    });
  } catch {
    return new Response("Sign-in is unavailable just now. Please try again.", { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const out = new Response(res.body, res);
  out.headers.delete("set-cookie");
  return out;
}
