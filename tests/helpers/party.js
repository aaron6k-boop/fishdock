// An in-memory stand-in for the Fish Together Durable Object namespace (env.PARTY), for tests and the local server:
// the same PartyHost as the Worker, with a Map for storage and plain objects for sockets.
import { PartyHost } from "../../server/party.js";

export function localPartyNamespace(clock = Date.now) {
  const hosts = new Map();
  const entry = (code) => {
    if (!hosts.has(code)) {
      const store = new Map(), sockets = new Map();
      const host = new PartyHost(
        { get: async (k) => (store.has(k) ? structuredClone(store.get(k)) : undefined), put: async (k, v) => { store.set(k, structuredClone(v)); }, delete: async (k) => { store.delete(k); } },
        { all: () => [...sockets.keys()], memberOf: (ws) => sockets.get(ws) || null, send: (ws, t) => ws.send(t), close: (ws, c, w) => { sockets.delete(ws); ws.close?.(c, w); } },
      );
      hosts.set(code, { host, sockets, store });
    }
    return hosts.get(code);
  };
  return {
    hosts,
    idFromName: (n) => n,
    get: (code) => ({ fetch: (req) => entry(code).host.fetch(req, clock()) }),
    /** a member's socket: ws needs send(text) and close(code, why); returns { send(msg), close() } or null */
    async connect(code, key, ws) {
      const e = entry(code), room = await e.host.load(), now = clock();
      const m = await room.auth(key, now);
      if (!m || room.ended(now)) return null;
      e.sockets.set(ws, m.id);
      await e.host.opened(ws, m.id, clock());
      return { member: m.id, send: (msg) => e.host.onMessage(ws, typeof msg === "string" ? msg : JSON.stringify(msg), clock()), close: async () => { if (e.sockets.has(ws)) { await e.host.onClose(ws, clock()); e.sockets.delete(ws); } } };
    },
  };
}
