// Cloudflare Pages Function: GET /api/conditions?lat=&lon= (Open-Meteo weather and sea state). Works without the DB binding (no caching then).
import { handleConditions } from "../../../server/conditions.js";

export const onRequest = ({ request, env }) => handleConditions(request, env);
