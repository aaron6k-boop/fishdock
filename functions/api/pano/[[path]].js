// Cloudflare Pages Function: /api/pano (a real 360° photo near a documented mark, from Mapillary).
import { handlePano } from "../../../server/pano.js";

export const onRequest = ({ request, env }) => handlePano(request, env);
