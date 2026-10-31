// Calls to outside services (Open-Meteo, Admiralty, Environment Agency, Gemini) and the shared cache.
//
// - Every call has a timeout (8 s for data sources) and records its outcome in source_health: the time of the
//   last success or failure and a short code ("timeout", "network", "http_503", "bad_json"). Never an upstream
//   body, URL or key: those can carry keys or personal data.
// - Callers turn a failure into a plain-English 502 for the app. Nothing from the upstream answer leaks out.
// - Answers are kept for everyone in the D1 `cache` table and, where the platform has one, the Cache API
//   (caches.default, local to each Cloudflare location). A source that's down is answered from an older copy
//   for up to a day, marked `stale`.

export const UPSTREAM_TIMEOUT_MS = 8000;
export const STALE_GRACE_MS = 86400e3;

export class UpstreamError extends Error {
  constructor(upstream, code, status = null) {
    super(`${upstream} ${code}`);
    this.upstream = upstream;
    this.code = code;
    this.status = status;
  }
}

/** Notes one call's outcome (never fails the request). */
export async function recordHealth(db, upstream, ok, code, now) {
  if (!db) return;
  try {
    await db.prepare(ok
      ? `INSERT INTO source_health (upstream, last_ok, ok_count) VALUES (?1, ?2, 1)
         ON CONFLICT(upstream) DO UPDATE SET last_ok = ?2, ok_count = source_health.ok_count + 1`
      : `INSERT INTO source_health (upstream, last_fail, last_error, fail_count) VALUES (?1, ?2, ?3, 1)
         ON CONFLICT(upstream) DO UPDATE SET last_fail = ?2, last_error = ?3, fail_count = source_health.fail_count + 1`
    ).bind(...(ok ? [upstream, now] : [upstream, now, String(code || "error").slice(0, 40)])).run();
  } catch {
    // health is best effort
  }
}

/**
 * GETs (or POSTs) `url` and returns its parsed JSON, or throws UpstreamError. `ctx` is { db, fetch, now }.
 * `upstream` names the source in source_health ("open-meteo", "admiralty", "ea-flood", "gemini", ...).
 */
export async function upstreamJson(ctx, upstream, url, { method = "GET", headers = {}, body, timeoutMs = UPSTREAM_TIMEOUT_MS, noDataStatuses = [] } = {}) {
  const fetchFn = ctx.fetch ?? globalThis.fetch;
  let res;
  try {
    res = await fetchFn(url, {
      method,
      headers: { accept: "application/json", "user-agent": "FishDock (UK fishing app)", ...headers },
      body,
      signal: AbortSignal.timeout?.(timeoutMs),
    });
  } catch (e) {
    const code = e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network";
    await recordHealth(ctx.db, upstream, false, code, ctx.now);
    throw new UpstreamError(upstream, code);
  }
  if (!res.ok) {
    try { await res.body?.cancel(); } catch {}
    // A status that means "nothing here" for this source (say, no sea data for an inland point): the service
    // answered, so it counts as healthy, and the caller gets null.
    if (noDataStatuses.includes(res.status)) {
      await recordHealth(ctx.db, upstream, true, null, ctx.now);
      return null;
    }
    const code = `http_${res.status}`;
    await recordHealth(ctx.db, upstream, false, code, ctx.now);
    throw new UpstreamError(upstream, code, res.status);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    await recordHealth(ctx.db, upstream, false, "bad_json", ctx.now);
    throw new UpstreamError(upstream, "bad_json", res.status);
  }
  await recordHealth(ctx.db, upstream, true, null, ctx.now);
  return data;
}

// ---- cache ----

const cacheUrl = (key) => `https://cache.fishdock.internal/${encodeURIComponent(key)}`;

async function readEdge(cache, key, now) {
  if (!cache) return null;
  try {
    const hit = await cache.match(new Request(cacheUrl(key)));
    if (!hit) return null;
    const box = await hit.json();
    return box && box.exp > now ? box : null;
  } catch {
    return null;
  }
}
async function writeEdge(cache, key, box, ttlMs) {
  if (!cache) return;
  try {
    await cache.put(new Request(cacheUrl(key)), new Response(JSON.stringify(box), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${Math.max(1, Math.floor(ttlMs / 1000))}` },
    }));
  } catch {}
}
async function readRow(db, key) {
  if (!db) return null;
  try {
    const row = await db.prepare(`SELECT value, expires FROM cache WHERE key = ?1`).bind(key).first();
    if (!row) return null;
    return { ...JSON.parse(row.value), exp: Number(row.expires) };
  } catch {
    return null;
  }
}
async function writeRow(db, key, box) {
  if (!db) return;
  try {
    await db.prepare(`INSERT INTO cache (key, value, expires) VALUES (?1, ?2, ?3)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires`).bind(key, JSON.stringify({ v: box.v, at: box.at }), box.exp).run();
  } catch {}
}

/**
 * The value for `key`: from the Cache API or D1 while it's fresh, otherwise from `load()` (and kept for `ttlMs`).
 * With ttlMs 0 nothing is read or kept. If `load` fails and an older copy is less than a day old, that copy is
 * answered with stale: true. Returns { value, cached, stale, fetchedAt }.
 */
export async function cachedJson(ctx, key, ttlMs, load) {
  const now = ctx.now;
  if (ttlMs > 0) {
    const edge = await readEdge(ctx.cache, key, now);
    if (edge) return { value: edge.v, cached: true, stale: false, fetchedAt: edge.at };
  }
  const row = ttlMs > 0 ? await readRow(ctx.db, key) : null;
  if (row && row.exp > now) {
    await writeEdge(ctx.cache, key, row, row.exp - now);
    return { value: row.v, cached: true, stale: false, fetchedAt: row.at };
  }
  let value;
  try {
    value = await load();
  } catch (e) {
    if (row && now - row.exp < STALE_GRACE_MS) return { value: row.v, cached: true, stale: true, fetchedAt: row.at };
    throw e;
  }
  if (ttlMs > 0) {
    const box = { v: value, at: now, exp: now + ttlMs };
    await writeRow(ctx.db, key, box);
    await writeEdge(ctx.cache, key, box, ttlMs);
  }
  return { value, cached: false, stale: false, fetchedAt: now };
}

/** The context every data route passes around: the database if there is one, the Cache API if there is one. */
export function upstreamCtx(db, now, deps = {}) {
  const ctx = { db: db || null, now, fetch: deps.fetch ?? null, cache: deps.cache !== undefined ? deps.cache : globalThis.caches?.default ?? null };
  ctx.upstreamJson = (upstream, url, opts) => upstreamJson(ctx, upstream, url, opts);
  return ctx;
}
