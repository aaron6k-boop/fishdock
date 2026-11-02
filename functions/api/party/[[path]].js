// Cloudflare Pages Function: /api/party (Fish Together). Parties need the Worker's Durable Object, so on Pages this answers 503.
import { handleParty } from "../../../server/party.js";

export const onRequest = ({ request, env }) => handleParty(request, env);
