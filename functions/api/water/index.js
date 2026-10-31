// Cloudflare Pages Function: /api/water itself (no further path), the same handler as [[path]].js.
// Kept in case a catch-all doesn't match the bare route (see docs/BACKEND.md).
export { onRequest } from "./[[path]].js";
