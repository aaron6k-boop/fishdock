// Cloudflare Pages Function: GET /api/tides?lat=&lon= (Admiralty UK Tidal API when ADMIRALTY_API_KEY is set). Works without the DB binding.
import { handleTides } from "../../../server/tides.js";

export const onRequest = ({ request, env }) => handleTides(request, env);
