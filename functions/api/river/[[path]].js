// Cloudflare Pages Function: GET /api/river?lat=&lon= (Environment Agency river levels, England only). Works without the DB binding.
import { handleRiver } from "../../../server/river.js";

export const onRequest = ({ request, env }) => handleRiver(request, env);
