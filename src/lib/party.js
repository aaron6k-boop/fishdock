// ---- party: Fish Together on the phone (starting, joining, the live connection) ----
// A party is joined with its invite link (#party/<code>/<secret>) or, while the host allows it, the short code.
// This phone keeps each party's member key (so you can come back to a party after closing the page) and nothing
// about where you are. The connection reconnects by itself and catches up on anything missed; events you send while
// it's down are sent when it's back, once each.
import { useCallback, useEffect, useRef, useState } from "react";
import { PREVIEW } from "./api.js";

const KEY = "fishdock.parties.v1";
const H = { accept: "application/json", "content-type": "application/json", "x-fishdock": "1" };
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const cleanCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
export const partyLink = (code, secret) => `${location.origin}/#party/${code}/${secret}`;

// ---- memberships kept on this phone ----
function readAll() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } }
export const myParties = () => Object.entries(readAll()).map(([code, v]) => ({ code, ...v })).filter((p) => !p.expiresAt || p.expiresAt > Date.now()).sort((a, b) => (b.at || 0) - (a.at || 0));
export const membershipOf = (code) => readAll()[code] || null;
export function remember(code, v) { const all = readAll(); all[code] = { ...(all[code] || {}), ...v, at: Date.now() }; for (const [k, p] of Object.entries(all)) if (p.expiresAt && p.expiresAt < Date.now() - 864e5) delete all[k]; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked */ } }
export function forget(code) { const all = readAll(); delete all[code]; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ } }

async function call(method, path, body) {
  if (PREVIEW) throw Object.assign(new Error("Fish Together needs FishDock's server, which the preview doesn't have."), { code: "preview" });
  const r = await fetch(`/api/party${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(b.message || "That didn't work. Try again."), { code: b.error, status: r.status });
  return b;
}
export const startParty = (o) => call("POST", "", o);
export const previewParty = (code, { secret, viaCode } = {}) => call("GET", `/${code}?${secret ? `s=${encodeURIComponent(secret)}` : ""}${viaCode ? "&via=code" : ""}`);
export const joinParty = (code, o) => call("POST", `/${code}/join`, o);
export async function uploadPartyPhoto(code, key, blob) {
  const r = await fetch(`/api/party/${code}/photo?m=${encodeURIComponent(key)}`, { method: "POST", headers: { "x-fishdock": "1", "content-type": "image/jpeg" }, body: blob });
  const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error("The photo couldn't be sent."); return b.photo;
}
export const partyPhotoUrl = (code, key, id) => `/api/party/${code}/photo/${encodeURIComponent(id)}?m=${encodeURIComponent(key)}`;

let cidN = 0;
const cid = () => `${Date.now().toString(36)}${(++cidN).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The live connection. Returns { status, party, me, members, events, chat, offset, send, sendEvent, ... }.
 * status: connecting | live | reconnecting | ended | kicked | denied. Event times are turned into this phone's clock.
 */
export function useParty(code, key, { onMessage } = {}) {
  const [status, setStatus] = useState("connecting");
  const [st, setSt] = useState({ party: null, me: null, members: [], events: [], chat: [] });
  const ws = useRef(null), queue = useRef([]), offset = useRef(0), tries = useRef(0), stop = useRef(false), cb = useRef(onMessage);
  cb.current = onMessage;
  const local = (e) => ({ ...e, t: e.t - offset.current }); // server time to this phone's
  const connect = useCallback(() => {
    if (stop.current || !code || !key) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let sock;
    try { sock = new WebSocket(`${proto}://${location.host}/api/party/${code}/ws?m=${encodeURIComponent(key)}`); } catch { setStatus("reconnecting"); return; }
    ws.current = sock;
    let ping = 0;
    sock.onopen = () => { tries.current = 0; ping = setInterval(() => { try { sock.send(JSON.stringify({ t: "ping", c: Date.now() })); } catch { /* ignore */ } }, 20e3); };
    sock.onmessage = (m) => {
      let msg; try { msg = JSON.parse(m.data); } catch { return; }
      if (msg.t === "hello") {
        offset.current = msg.now - Date.now();
        setSt({ party: msg.party, me: msg.you, members: msg.members, events: msg.events.map(local), chat: msg.chat });
        setStatus("live");
        // anything sent while the connection was down goes now (the server ignores repeats)
        const q = queue.current; queue.current = [];
        for (const x of q) sock.send(JSON.stringify(x));
      } else if (msg.t === "event") setSt((s) => (s.events.some((e) => e.seq === msg.ev.seq) ? s : { ...s, events: [...s.events, local(msg.ev)] }));
      else if (msg.t === "members") setSt((s) => ({ ...s, members: msg.members }));
      else if (msg.t === "chat") setSt((s) => ({ ...s, chat: [...s.chat, msg.c].slice(-100) }));
      else if (msg.t === "settings") setSt((s) => ({ ...s, party: { ...s.party, ...msg, t: undefined } }));
      else if (msg.t === "voice") setSt((s) => ({ ...s, members: s.members.map((x) => (x.id === msg.who ? { ...x, voice: msg.voice } : x)) }));
      else if (msg.t === "pong") offset.current = offset.current * 0.7 + (msg.now - Date.now()) * 0.3;
      else if (msg.t === "closed") { stop.current = true; setStatus("ended"); }
      else if (msg.t === "kicked") { stop.current = true; setStatus("kicked"); }
      cb.current?.(msg);
    };
    sock.onclose = (e) => {
      clearInterval(ping);
      if (ws.current === sock) ws.current = null;
      if (stop.current) return;
      if (e.code === 4003) { setStatus("denied"); return; }
      setStatus("reconnecting");
      const wait = Math.min(15000, 600 * 2 ** tries.current++) * (0.8 + Math.random() * 0.4);
      setTimeout(connect, wait);
    };
  }, [code, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    stop.current = false; connect();
    // a phone that was locked or offline reconnects as soon as it's back
    const wake = () => { if (document.visibilityState === "visible" && !ws.current && !stop.current) { tries.current = 0; connect(); } };
    document.addEventListener("visibilitychange", wake); addEventListener("online", wake);
    return () => { stop.current = true; document.removeEventListener("visibilitychange", wake); removeEventListener("online", wake); ws.current?.close(); };
  }, [connect]);

  const send = useCallback((msg, { queue: q = false } = {}) => {
    const s = ws.current;
    if (s && s.readyState === 1) { s.send(JSON.stringify(msg)); return true; }
    if (q) queue.current.push(msg);
    return false;
  }, []);
  const sendEvent = useCallback((type, data = null) => send({ t: "event", ev: { type, data, cid: cid() } }, { queue: true }), [send]);
  return { status, ...st, offset: offset.current, send, sendEvent, serverNow: () => Date.now() + offset.current };
}

/** Plain words for another angler's moment, for the small notifications. Real details only from the event. */
export function momentText(name, ev, mode) {
  const n = name || "Someone";
  if (ev.type === "bite") return `${n} has a bite!`;
  if (ev.type === "hooked") return `${n} is fighting a fish!`;
  if (ev.type === "lost") return `${n} lost one`;
  if (ev.type === "catch") {
    const d = ev.data || {}, what = (d.name || d.species || "a fish").toLowerCase();
    const size = d.weightKg ? `${Math.round(d.weightKg * 2.2046 * 10) / 10} lb ` : d.lengthCm ? `${d.lengthCm} cm ` : "";
    return `${n} landed ${size ? `a ${size}` : "a "}${what}${mode === "virtual" ? " (simulated)" : ""}`;
  }
  return null;
}
