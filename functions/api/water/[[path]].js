// Cloudflare Pages Function: GET /api/water?lat=&lon= (what water is at a tapped point, from OpenStreetMap). Works without the DB binding.
import { handleWater } from "../../../server/water.js";

export const onRequest = ({ request, env }) => handleWater(request, env);
