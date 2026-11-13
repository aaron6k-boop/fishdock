// ---- FishParty: the Durable Object that holds one Fish Together party (see server/party.js) ----
// Its sockets use Cloudflare's hibernation API, so a quiet party costs nothing while nobody is sending. The party's
// storage is deleted a day after it ends.
import { PartyHost, BOARD } from "../server/party.js";

// (a plain class with the (state, env) constructor: fetch and the hibernation API don't need the RPC base class, and
// this way the Worker entry still imports in Node for tests)
export class FishParty {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.host = new PartyHost(
      { get: (k) => ctx.storage.get(k), put: (k, v) => ctx.storage.put(k, v), delete: (k) => ctx.storage.delete(k) },
      {
        all: () => ctx.getWebSockets(),
        memberOf: (ws) => ctx.getTags(ws)[0] || null,
        send: (ws, text) => { try { ws.send(text); } catch { /* gone */ } },
        close: (ws, code, why) => { try { ws.close(code, why); } catch { /* gone */ } },
      },
      // (a public place's count of anglers, to the board the map reads)
      (r) => env.PARTY.get(env.PARTY.idFromName(BOARD)).fetch(new Request("https://party.internal/board", { method: "POST", body: JSON.stringify(r) })),
    );
  }
  async fetch(request) {
    const url = new URL(request.url), now = Date.now();
    if (url.pathname === "/ws") {
      const room = await this.host.load();
      const m = await room.auth(url.searchParams.get("m"), now);
      if (!m || room.ended(now)) return new Response(JSON.stringify({ error: room.ended(now) ? "ended" : "not_member" }), { status: room.ended(now) ? 410 : 403 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [m.id]);
      await this.host.opened(pair[1], m.id, now);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const res = await this.host.fetch(request, now);
    if (url.pathname === "/init" && res.status === 200) { const room = await this.host.load(); await this.ctx.storage.setAlarm(room.s.expiresAt + 86400e3); }
    return res;
  }
  async webSocketMessage(ws, message) { await this.host.onMessage(ws, message); }
  // answer the closing handshake, or the phone waits (about 10 s) for a reply before it counts itself disconnected
  async webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 || !code ? 1000 : code, "bye"); } catch { /* already closed */ }
    await this.host.onClose(ws);
  }
  async webSocketError(ws) { await this.host.onClose(ws); }
  async alarm() { await this.ctx.storage.deleteAll(); }
}
