// ---- Cloudflare Worker entry: the same app as the Pages set-up, for Cloudflare's Workers flow ----
// Static files (dist/) are served by Workers Static Assets, which also applies public/_headers. Only /api/* and the
// Firebase sign-in helper paths (/__/*) reach this code (wrangler.jsonc "run_worker_first"), exactly the routes
// public/_routes.json gives Pages Functions. The handlers are the same server/*.js modules the Pages Functions mount.
import { handleConditions } from "../server/conditions.js";
import { handleTides } from "../server/tides.js";
import { handleRiver } from "../server/river.js";
import { handleAi } from "../server/ai.js";
import { handleSync } from "../server/sync.js";
import { handleCommunity } from "../server/community.js";
import { handleFeedback } from "../server/feedback.js";
import { handleMetrics } from "../server/metrics.js";
import { handleAdmin } from "../server/admin.js";
import { handleHealth } from "../server/health.js";
import { handleWater } from "../server/water.js";
import { handleFishInfo } from "../server/fishinfo.js";
import { onRequest as authHelper } from "../functions/_middleware.js";

const API = {
  conditions: handleConditions, tides: handleTides, river: handleRiver, ai: handleAi, sync: handleSync,
  community: handleCommunity, feedback: handleFeedback, metrics: handleMetrics, admin: handleAdmin, health: handleHealth, water: handleWater, fishinfo: handleFishInfo,
};

const notFound = () => new Response(JSON.stringify({ error: "not_found", message: "There's nothing here." }), {
  status: 404, headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/([a-z]+)(?:\/|$)/);
    if (m) {
      const handler = API[m[1]];
      return handler ? handler(request, env) : notFound();
    }
    if (url.pathname.startsWith("/__/")) {
      return authHelper({ request, env, next: () => env.ASSETS.fetch(request) });
    }
    return env.ASSETS.fetch(request);
  },
};
