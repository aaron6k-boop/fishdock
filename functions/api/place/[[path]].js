// Cloudflare Pages Function: /api/place (the real shape of a documented mark for the 3D view, from OpenStreetMap).
import { handlePlace3d } from "../../../server/place3d.js";

export const onRequest = ({ request, env }) => handlePlace3d(request, env);
