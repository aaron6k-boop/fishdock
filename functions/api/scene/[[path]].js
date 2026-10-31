// Cloudflare Pages Function: /api/scene (free-licensed photos near a fishing place, from Wikimedia Commons).
import { handleScene } from "../../../server/scene.js";

export const onRequest = ({ request, env }) => handleScene(request, env);
