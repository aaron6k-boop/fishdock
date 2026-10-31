// GET /api/health  A public, read-only status check (no X-FishDock header needed, so uptime monitors and a plain
// browser can open it). It says which data sources are switched on and whether the database answers. It never
// returns keys, ids, coordinates or anything about users.
import { ensureSchema } from "./db.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

export async function handleHealth(request, env, now = Date.now()) {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method", message: "Use GET." }, 405);
  const out = {
    ok: true,
    at: new Date(now).toISOString(),
    database: env?.DB ? "connected" : "not bound",
    sources: {
      weather: "open-meteo",
      rivers: "environment-agency",
      water: "openstreetmap (overpass)",
      tides: env?.ADMIRALTY_API_KEY ? "admiralty" : "on-phone estimate (no ADMIRALTY_API_KEY)",
      ai: env?.GEMINI_API_KEY ? "gemini" : "off (no GEMINI_API_KEY)",
      accounts: env?.FIREBASE_PROJECT_ID ? `firebase project set` : "off",
      admin: env?.ADMIN_EMAILS || env?.ADMIN_UIDS ? "configured" : "no admins set",
    },
    upstreams: [],
  };
  if (env?.DB) {
    try {
      await ensureSchema(env.DB);
      const rows = await env.DB.prepare("SELECT upstream, last_ok, last_fail, last_error FROM source_health ORDER BY upstream").all();
      out.upstreams = (rows.results || []).map((r) => ({
        name: r.upstream,
        lastOk: r.last_ok ? new Date(r.last_ok).toISOString() : null,
        lastFail: r.last_fail ? new Date(r.last_fail).toISOString() : null,
        lastError: r.last_error || null, // a short code such as "timeout" or "http_429", never an upstream body
      }));
    } catch {
      out.ok = false;
      out.database = "error";
    }
  }
  return json(out, out.ok ? 200 : 503);
}
