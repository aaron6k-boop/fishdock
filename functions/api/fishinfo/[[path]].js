// Cloudflare Pages Function: GET /api/fishinfo?id= (a free-licensed photo and summary from Wikipedia). Works without the DB binding.
import { handleFishInfo } from "../../../server/fishinfo.js";

export const onRequest = ({ request, env }) => handleFishInfo(request, env);
