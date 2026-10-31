// Cloudflare Pages Function: GET /api/places?q= (UK place search by name). Works without the DB binding.
import { handlePlaces } from "../../../server/places.js";

export const onRequest = ({ request, env }) => handlePlaces(request, env);
