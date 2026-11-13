// /api/party  Fish Together: private fishing parties of up to four anglers (and a few spectators).
//
// - Each party lives in one Cloudflare Durable Object, named by its code (a four-digit PIN for now: see makePin below), which keeps the members,
//   their events, the chat and the settings, and holds everyone's WebSocket. Only meaningful events travel (a cast,
//   a bite, a fish on, a catch, a reaction): every phone animates them itself, so nothing like video is streamed.
// - Two kinds, never mixed: "virtual" (everyone fishes the simulation; every catch is marked simulated and is never
//   a real record) and "real" (people fishing for real log what actually happens; the others watch reconstructions).
// - Private by default. Joining needs the invite link (code plus a secret) or, while the host allows it, the short
//   code. The host can turn code joining off, make a new link (old links stop working), lock the party, remove
//   people, turn chat or voice off and close it. Parties end after the hours the host chose.
// - No positions: a party knows the kind of place (pier, beach, ...) and a place label the host typed or picked, at
//   most an area, or (a virtual party started from the 3D demo) one of FishDock's own public, documented marks by id,
//   so everyone fishes that real place's 3D reconstruction. Never anyone's coordinates. Member keys are stored hashed. Network addresses are never stored.
// - Looks: an angler's figure in the 3D view (skin tone, hair, hat, beard, build: small whole numbers chosen in the
//   app, or none). It's how their character looks in the simulation, nothing more.
// - Voice: the server only relays the connection set-up (WebRTC signalling) between members; audio goes phone to
//   phone and never through FishDock.
// - Public places (13 November): everyone playing the game at one of FishDock's documented marks is put in that mark's
//   own room without joining anyone (POST /api/party/public), so whoever's fishing Gorleston South Pier sees the others
//   there. Up to four anglers a room; a fifth goes in the mark's next room. Virtual only, no host, no chat and no voice
//   (strangers); the names people chose, their looks, their fishing and their walking about. Nobody's kept for long:
//   anyone gone two hours is dropped. Still never anyone's coordinates: the mark is a public place.
//   The map shows how many are fishing each place now (GET /api/party/public): each public room tells one board its
//   count of connected anglers when it changes, and the board adds them up by mark. Numbers by place only.
// - Notices: a line in the chat when someone joins, leaves or is removed ({ sys: "joined" | "left" | "removed" }),
//   kept with the chat so someone who connects later sees it too. A name only, nothing else about them.

import { json, err, guard, toResponse, sameOrigin, readJson, routePath, cleanLine, randomId, sha256Hex } from "./http.js";
import { needDb, enforce, giveBack } from "./db.js";
import { ipKey } from "./ipKey.js";
import { assignSpots, layoutFor, MAX_ANGLERS } from "../src/lib/world3d/spots.js";
import { markFor } from "./place3d.js";
import { cleanLook } from "../src/lib/world3d/people.js";

/** A walking pose: { x, y, z, face, air } within the 3D place, null (back at their spot), or an emote ({ emote });
 * undefined if it's not one. */
export const EMOTES = ["wave", "cheer", "clap"];
export function cleanPose(p) {
  if (p === null) return null;
  if (!p || typeof p !== "object") return undefined;
  // a wave, cheer or clap: just its name
  if ("emote" in p) return EMOTES.includes(p.emote) ? { emote: p.emote } : undefined;
  // a fish being reeled in (virtual fishing): how far in, the line's tension, the drag slipping, the reel's turns
  if ("fight" in p) {
    const f = p.fight || {}, n = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : NaN);
    const out = { progress: Math.round(n(f.progress, 0, 1) * 1000) / 1000, tension: Math.round(n(f.tension, 0, 2) * 100) / 100, slipping: !!f.slipping, turns: Math.round(n(f.turns, 0, 100000) * 10) / 10 };
    return [out.progress, out.tension, out.turns].some(Number.isNaN) ? undefined : { fight: out };
  }
  const n = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : NaN);
  // fishing from somewhere they walked to: where they now stand, which way they face, the edge and the cast
  if (p.spotAt) {
    const at = Array.isArray(p.at) ? [n(p.at[0], -700, 700), n(p.at[1], -5, 60), n(p.at[2], -700, 700)] : [NaN];
    const o = { spotAt: true, at, face: n(p.face, -7, 7), edge: n(p.edge, 0, 10), cast: n(p.cast, 1, 120) };
    return [...at, o.face, o.edge, o.cast].some(Number.isNaN) ? undefined : o;
  }
  const out = { x: n(p.x, -700, 700), y: n(p.y, -5, 60), z: n(p.z, -700, 700), face: n(p.face, -7, 7), air: !!p.air };
  return [out.x, out.y, out.z, out.face].some(Number.isNaN) ? undefined : out;
}

/** A party's place: a label, and for a virtual party only, a documented FishDock mark id (a public place) or nothing. */
export function cleanPlace(place, mode) {
  const mark = mode !== "real" && typeof place?.mark === "string" && markFor(place.mark) ? place.mark : null;
  return { label: cleanLine(place?.label, 60) || null, ...(mark ? { mark } : {}) };
}

export const PARTY = {
  maxAnglers: MAX_ANGLERS, maxMembers: 12, maxEverMembers: 60, maxReports: 100, maxEvents: 3000, maxChat: 120, chatChars: 200, chatPer10s: 6, chatPerMinute: 20, hours: [2, 6, 12, 24], defaultHours: 12,
  spotHoldMs: 10 * 60e3, createPerDay: 12, lookupsPerMinute: 30, missesPerHour: 20, pin: true, joinsPerMinute: 12, msgsPer10s: 40, posesPer10s: 50, maxSpeed: 12, signalBytes: 16000, photoBytes: 400e3,
};
export const VENUES = ["pier", "beach", "estuary", "river", "lake"];
export const EVENT_TYPES = ["cast", "bite", "missed", "hooked", "lost", "catch", "reelin"];
export const REACTIONS = { nice: "Nice one", wow: "Wow", clap: "Well done", fish: "Fish on!" };
export const CHALLENGES = { biggest: "Biggest fish", most: "Most fish", species: "Most species", longest: "Longest fish" };
const CODE_ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// each character equally likely (a byte that would favour the first few letters is thrown away and drawn again)
export function makeLongCode() {
  const out = [], top = 256 - (256 % CODE_ABC.length);
  while (out.length < 6) for (const b of crypto.getRandomValues(new Uint8Array(12))) { if (b < top && out.length < 6) out.push(CODE_ABC[b % CODE_ABC.length]); }
  return out.join("");
}
// ---- the four-digit PIN ----
// While FishDock is being tested a party's code is a four-digit PIN, easy to read out and type. There are only
// 10,000 of them, so a PIN can be guessed: wrong guesses are counted per network (PARTY.missesPerHour), the host can
// turn joining by PIN off, and the private link still carries its own long secret. Before FishDock opens to the
// public, set PARTY.pin to false to go back to six letters and numbers (old codes of either kind keep working).
export function makePin() {
  for (;;) for (const b of crypto.getRandomValues(new Uint16Array(8))) if (b < 60000) return String(b % 10000).padStart(4, "0");
}
export const makeCode = () => (PARTY.pin ? makePin() : makeLongCode());
/** A public place's room code: made from the mark and the room's number, the same everywhere, so everyone at the mark
 * finds the same rooms (in the six-character form, from the letters and numbers that can't be misread). */
const PUBLIC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export async function publicCode(mark, n) { const h = await sha256Hex(`fishdock-public:${mark}:${n}`); let c = ""; for (let i = 0; i < 6; i++) c += PUBLIC_ALPHABET[parseInt(h.slice(i * 4, i * 4 + 4), 16) % PUBLIC_ALPHABET.length]; return c; }
export const PUBLIC = { rooms: 8, days: 30, dropAfterMs: 2 * 3600e3, boardMs: 3 * 3600e3, retellMs: 30 * 60e3 };
export const BOARD = "~board"; // (the board's own object: not a code anyone can join)
export const validCode = (c) => typeof c === "string" && /^(?:[0-9]{4}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})$/.test(c);
const hashKey = (k) => sha256Hex(`party-member|${k}`);
const nameOf = (v, d) => cleanLine(v, 24) || d;

// ---- the party itself: pure state and rules (tested without Cloudflare) ----
export class PartyRoom {
  constructor(state = null) { this.s = state; this.online = new Map(); this.rate = new Map(); this.poseRate = new Map(); this.lastPose = new Map(); this.chatRate = new Map(); }
  get ready() { return !!this.s; }

  async init({ code, mode, venue, place, name, outfit, look, hours }, now) {
    if (this.s) throw new Error("exists");
    const h = PARTY.hours.includes(Number(hours)) ? Number(hours) : PARTY.defaultHours;
    this.s = {
      code, mode: mode === "real" ? "real" : "virtual", venue: VENUES.includes(venue) ? venue : "pier",
      place: cleanPlace(place, mode), createdAt: now, expiresAt: now + h * 3600e3, closed: false,
      light: mode === "real" ? "now" : "midday", secret: randomId(12), codeOn: true, locked: false, chatOn: true, voiceOn: true, anglersOn: true,
      members: {}, events: [], seq: 0, chat: [], challenge: null, reports: [], photos: [],
    };
    const host = await this.addMember({ name, role: "host", outfit, look }, now);
    return host;
  }
  async addMember({ name, role, outfit, look }, now) {
    const id = randomId(6), key = randomId(24);
    const angler = role === "host" || role === "angler";
    const m = { id, keyHash: await hashKey(key), name: nameOf(name, angler ? "Angler" : "Spectator"), role: role === "host" ? "host" : angler ? "angler" : "spectator",
      outfit: Number.isInteger(outfit) ? ((outfit % 5) + 5) % 5 : Object.keys(this.s.members).length % 5, look: cleanLook(look), spot: null, presence: this.s.mode === "virtual" ? "virtual" : "remote",
      joinedAt: now, seenAt: now, left: false, kicked: false, voice: { on: false, muted: true } };
    this.s.members[id] = m;
    if (m.role !== "spectator") this.placeAnglers(now, m.id);
    return { id, key };
  }
  /** fishing spots: whoever has one keeps it; newcomers get the first free one (a fifth angler watches instead) */
  placeAnglers(now, newcomer = null) {
    const S = this.s, keep = {}, anglers = [];
    for (const m of Object.values(S.members)) {
      if (m.role === "spectator" || m.left || m.kicked) { m.spot = null; continue; }
      // (a spot's kept ten minutes for someone whose phone has dropped out of a party; at a public place, one minute,
      // so people who've closed the game don't fill the place and send newcomers to its next room)
      const away = !this.online.get(m.id) && now - m.seenAt > (S.public ? 60e3 : PARTY.spotHoldMs) && m.id !== newcomer;
      if (away && m.spot) m.spot = null;
      if (!away) { anglers.push(m.id); if (m.spot) keep[m.id] = m.spot; }
    }
    const got = assignSpots(S.venue, anglers, keep);
    for (const id of anglers) { const m = S.members[id]; m.spot = got[id] || null; if (!m.spot && m.role === "angler" && id === newcomer) m.role = "spectator"; }
  }
  async auth(key, now) {
    if (!this.s || typeof key !== "string" || key.length < 20) return null;
    const h = await hashKey(key);
    const m = Object.values(this.s.members).find((x) => x.keyHash === h);
    if (!m || m.kicked) return null;
    if (m.left) { m.left = false; if (m.role !== "spectator") this.placeAnglers(now, m.id); }
    return m;
  }
  ended(now) { return !this.s || this.s.closed || now > this.s.expiresAt; }
  anglerCount() { return Object.values(this.s.members).filter((m) => m.spot && !m.left && !m.kicked).length; }

  /** What someone with the link or the code may see before joining (no names of members other than the host). */
  preview(now, { secret, viaCode }) {
    const S = this.s;
    if (!S) return { ok: false, why: "not_found" };
    const allowed = (secret && secret === S.secret) || (viaCode && S.codeOn);
    if (!allowed) return { ok: false, why: "not_found" };
    if (this.ended(now)) return { ok: false, why: "ended" };
    const host = Object.values(S.members).find((m) => m.role === "host");
    return { ok: true, party: { code: S.code, mode: S.mode, venue: S.venue, place: S.place, host: host?.name || "The host", anglers: this.anglerCount(), maxAnglers: PARTY.maxAnglers, locked: S.locked, anglersOn: S.anglersOn, spotsFree: PARTY.maxAnglers - this.anglerCount(), expiresAt: S.expiresAt } };
  }
  async join({ secret, viaCode, name, role, outfit, look }, now) {
    const pv = this.preview(now, { secret, viaCode });
    if (!pv.ok) return { error: pv.why };
    const S = this.s;
    if (S.locked) return { error: "locked" };
    if (Object.values(S.members).filter((m) => !m.left && !m.kicked).length >= PARTY.maxMembers) return { error: "full" };
    // everyone who ever joined is kept (a removed person's key must keep failing), so joining and leaving over and
    // over can't grow the party's saved record without limit
    if (Object.keys(S.members).length >= PARTY.maxEverMembers) return { error: "full" };
    const wants = role === "angler" && S.anglersOn && this.anglerCount() < PARTY.maxAnglers ? "angler" : "spectator";
    const m = await this.addMember({ name, role: wants, outfit, look }, now);
    return { member: m, role: S.members[m.id].role, notice: this.notice("joined", m.id, now) };
  }
  // ---- a public place's room ----
  initPublic({ code, mark, venue }, now) {
    if (this.s) throw new Error("exists");
    this.s = {
      code, public: true, mode: "virtual", venue: VENUES.includes(venue) ? venue : "pier", place: cleanPlace({ mark }, "virtual"), createdAt: now, expiresAt: now + PUBLIC.days * 86400e3, closed: false,
      light: "now", secret: randomId(12), codeOn: false, locked: false, chatOn: false, voiceOn: false, anglersOn: true,
      members: {}, events: [], seq: 0, chat: [], challenge: null, reports: [], photos: [],
    };
  }
  async joinPublic({ name, outfit, look }, now) {
    const S = this.s;
    if (!S?.public) return { error: "taken" };
    S.expiresAt = now + PUBLIC.days * 86400e3;
    // (nobody's kept for long: anyone not here for two hours is dropped, with their fishing, so the room never fills
    // with people who've gone; coming back, they're simply put in again)
    for (const [id, m] of Object.entries(S.members)) if (!this.online.get(id) && now - m.seenAt > PUBLIC.dropAfterMs) delete S.members[id];
    S.events = S.events.filter((e) => S.members[e.who]); S.chat = S.chat.filter((c) => S.members[c.who]);
    this.placeAnglers(now);
    if (this.anglerCount() >= PARTY.maxAnglers) return { error: "full" };
    const m = await this.addMember({ name, role: "angler", outfit, look }, now);
    if (S.members[m.id].role !== "angler") { delete S.members[m.id]; return { error: "full" }; }
    return { member: m, role: "angler", notice: this.notice("joined", m.id, now) };
  }
  /** A line in the chat saying someone joined, left or was removed; returns the message for everyone. */
  notice(sys, mid, now) {
    const S = this.s, c = { seq: ++S.seq, at: now, who: mid, sys, name: S.members[mid]?.name || "Someone" };
    S.chat.push(c); if (S.chat.length > PARTY.maxChat) S.chat.shift();
    return { t: "chat", c };
  }
  /** Chat's own limit, on top of the general one: a few lines at a time, and not too many a minute. */
  chatLimited(mid, now) {
    const r = this.chatRate.get(mid) || { at: [] };
    r.at = r.at.filter((t) => now - t < 60e3);
    const recent = r.at.filter((t) => now - t < 10e3).length;
    if (recent >= PARTY.chatPer10s || r.at.length >= PARTY.chatPerMinute) { this.chatRate.set(mid, r); return true; }
    r.at.push(now); this.chatRate.set(mid, r);
    return false;
  }

  // ---- what each member sees ----
  memberOut(m) { return { id: m.id, name: m.name, role: m.role, outfit: m.outfit, look: m.look || null, spot: m.spot, presence: m.presence, online: !!this.online.get(m.id), voice: m.voice, left: m.left }; }
  members() { return Object.values(this.s.members).filter((m) => !m.kicked && !m.left).map((m) => this.memberOut(m)); }
  hello(mid, now) {
    const S = this.s, me = S.members[mid];
    return {
      t: "hello", now, you: { id: mid, role: me.role, host: me.role === "host" },
      party: { code: S.code, public: !!S.public, mode: S.mode, venue: S.venue, place: S.place, light: S.light || "now", expiresAt: S.expiresAt, closed: S.closed, locked: S.locked, codeOn: S.codeOn, chatOn: S.chatOn, voiceOn: S.voiceOn, anglersOn: S.anglersOn, challenge: S.challenge, ...(me.role === "host" ? { secret: S.secret } : {}) },
      members: this.members(), events: S.events.slice(-600), chat: (S.chatOn ? S.chat : S.chat.filter((c) => c.sys)).slice(-50),
    };
  }
  settingsOut(forHost = false) { const S = this.s; return { t: "settings", light: S.light || "now", locked: S.locked, codeOn: S.codeOn, chatOn: S.chatOn, voiceOn: S.voiceOn, anglersOn: S.anglersOn, challenge: S.challenge, closed: S.closed, ...(forHost ? { secret: S.secret } : {}) }; }

  /** Where this member's own fishing has got to, from their events (for the virtual rules). */
  lastOf(mid) { for (let i = this.s.events.length - 1; i >= 0; i--) if (this.s.events[i].who === mid) return this.s.events[i]; return null; }
  allowed(mid, type) {
    if (this.s.mode === "real") return true; // a real log: people log what happened, in whatever order they could
    const last = this.lastOf(mid)?.type || null;
    const lineOut = last === "cast" || last === "missed" || last === "bite";
    return ({ cast: last !== "hooked", bite: lineOut && last !== "bite", missed: last === "bite", hooked: last === "bite", lost: last === "hooked", catch: last === "hooked", reelin: last === "cast" || last === "missed" })[type] ?? false;
  }
  cleanEvent(mid, ev) {
    const type = ev?.type, d = ev?.data || {};
    if (!EVENT_TYPES.includes(type)) return null;
    const out = { type, cid: typeof ev.cid === "string" ? ev.cid.slice(0, 40) : null };
    // a virtual cast's distance and aim (where the rig landed in the 3D place), so everyone sees it land there
    if (type === "cast" && this.s.mode === "virtual") {
      const dist = Number(d.dist), aim = Number(d.aim);
      if (Number.isFinite(dist) && dist >= 2 && dist <= 150) out.data = { dist: Math.round(dist * 10) / 10, aim: Number.isFinite(aim) ? Math.max(-0.5, Math.min(0.5, Math.round(aim * 1000) / 1000)) : 0 };
    }
    if (type === "catch") {
      const len = Number(d.lengthCm), kg = Number(d.weightKg);
      out.data = {
        species: typeof d.species === "string" && /^[a-z0-9-]{2,40}$/.test(d.species) ? d.species : null,
        name: cleanLine(d.name, 40) || null,
        lengthCm: Number.isFinite(len) && len > 0 && len <= 300 ? Math.round(len * 10) / 10 : null,
        weightKg: Number.isFinite(kg) && kg > 0 && kg <= 120 ? Math.round(kg * 1000) / 1000 : null,
        released: !!d.released,
        simulated: this.s.mode === "virtual", // virtual catches are always simulated, whatever the phone says
        photo: this.s.mode === "real" && typeof d.photo === "string" && this.s.photos.some((p) => p.id === d.photo && p.who === mid) ? d.photo : null,
      };
    }
    return out;
  }
  limited(mid, now) {
    const r = this.rate.get(mid) || { n: 0, at: now };
    if (now - r.at > 10e3) { r.n = 0; r.at = now; }
    r.n++; this.rate.set(mid, r);
    return r.n > PARTY.msgsPer10s;
  }

  /**
   * One message from a member. Returns { out: [{ to: "*" | "others" | memberId, msg }], save, close: [memberId] }.
   * `to: "others"` is everyone but the sender.
   */
  message(mid, msg, now) {
    const S = this.s, me = S.members[mid], out = [], close = [];
    const res = (o = {}) => ({ out, save: false, close, ...o });
    if (!me || me.kicked) return res({ close: [mid] });
    me.seenAt = now;
    if (msg?.t === "ping") { out.push({ to: mid, msg: { t: "pong", now } }); return res(); }
    if (this.ended(now)) { out.push({ to: mid, msg: { t: "closed", why: S.closed ? "closed" : "ended" } }); return res({ close: [mid] }); }
    // walking about (virtual parties): where an angler is in the 3D place, a few times a second, passed straight on to
    // the others and never saved. Scene coordinates of the shared 3D place, not anyone's real position. Its own limit,
    // so walking never crowds out casts and chat
    if (msg?.t === "pose") {
      if (S.mode !== "virtual" || !me.spot) return res();
      const r = this.poseRate.get(mid) || { n: 0, at: now }; if (now - r.at > 10e3) { r.n = 0; r.at = now; } r.n++; this.poseRate.set(mid, r);
      if (r.n > PARTY.posesPer10s) return res();
      const p = cleanPose(msg.p);
      if (p === undefined) return res();
      // movement has to be possible: nobody covers more than a sprint's worth between two poses (a phone that sends
      // a jump across the place is ignored; the next believable pose carries on). Back at a spot starts afresh
      if (p && !p.emote && !p.fight && !p.spotAt) {
        const lp = this.lastPose.get(mid);
        if (lp) { const dt = Math.max(0.05, (now - lp.at) / 1000), d = Math.hypot(p.x - lp.x, p.z - lp.z); if (dt < 5 && d / dt > PARTY.maxSpeed) return res(); }
        this.lastPose.set(mid, { x: p.x, z: p.z, at: now });
      } else if (!p || p.spotAt) this.lastPose.delete(mid);
      out.push({ to: "others", msg: { t: "pose", who: mid, p } });
      return res();
    }
    if (this.limited(mid, now)) { out.push({ to: mid, msg: { t: "error", code: "slow", message: "That's a lot at once. Give it a moment." } }); return res(); }
    const host = me.role === "host";
    const bcastMembers = () => out.push({ to: "*", msg: { t: "members", members: this.members() } });
    switch (msg?.t) {
      case "event": {
        if (!me.spot) { out.push({ to: mid, msg: { t: "error", code: "not_angler", message: "Only anglers with a spot can fish." } }); return res(); }
        const ev = this.cleanEvent(mid, msg.ev);
        if (!ev) return res();
        if (ev.cid) { const dup = S.events.find((e) => e.who === mid && e.cid === ev.cid); if (dup) { out.push({ to: mid, msg: { t: "event", ev: dup } }); return res(); } }
        if (!this.allowed(mid, ev.type)) { out.push({ to: mid, msg: { t: "error", code: "order", message: "That can't happen yet." } }); return res(); }
        const e = { seq: ++S.seq, t: now, who: mid, type: ev.type, data: ev.data || null, cid: ev.cid };
        S.events.push(e); if (S.events.length > PARTY.maxEvents) S.events.splice(0, S.events.length - PARTY.maxEvents);
        out.push({ to: "*", msg: { t: "event", ev: e } });
        return res({ save: true });
      }
      case "react": {
        const r = REACTIONS[msg.r] ? msg.r : null, target = S.events.find((e) => e.seq === msg.seq);
        if (!r || !target) return res();
        out.push({ to: "*", msg: { t: "react", r, seq: target.seq, from: mid, at: now } });
        return res();
      }
      case "chat": {
        if (!S.chatOn) { out.push({ to: mid, msg: { t: "error", code: "chat_off", message: "The host has turned chat off." } }); return res(); }
        const text = cleanLine(msg.text, PARTY.chatChars);
        if (!text) return res();
        if (this.chatLimited(mid, now)) { out.push({ to: mid, msg: { t: "error", code: "chat_slow", message: "Slow down a little: you can send another message in a moment." } }); return res(); }
        const c = { seq: ++S.seq, at: now, who: mid, text };
        S.chat.push(c); if (S.chat.length > PARTY.maxChat) S.chat.shift();
        out.push({ to: "*", msg: { t: "chat", c } });
        return res({ save: true });
      }
      case "signal": {
        if (!S.voiceOn) return res();
        const to = S.members[msg.to];
        const size = JSON.stringify(msg.data ?? null).length;
        if (!to || to.kicked || to.left || to.id === mid || size > PARTY.signalBytes) return res();
        out.push({ to: to.id, msg: { t: "signal", from: mid, data: msg.data } });
        return res();
      }
      case "voice": {
        if (!S.voiceOn && msg.on) return res();
        me.voice = { on: !!msg.on, muted: !!msg.muted };
        out.push({ to: "*", msg: { t: "voice", who: mid, voice: me.voice, speaking: !!msg.speaking } });
        return res();
      }
      case "presence": {
        if (S.mode === "real" && ["water", "remote"].includes(msg.presence)) { me.presence = msg.presence; bcastMembers(); return res({ save: true }); }
        return res();
      }
      case "spot": {
        if (me.role === "spectator") return res();
        const want = Number(msg.spot), L = layoutFor(S.venue);
        if (!L.spots.some((s) => s.id === want) || Object.values(S.members).some((m) => m.spot === want && m.id !== mid && !m.left && !m.kicked)) return res();
        me.spot = want; bcastMembers();
        return res({ save: true });
      }
      case "leave": {
        me.left = true; me.spot = null; me.voice = { on: false, muted: true };
        out.push({ to: "others", msg: this.notice("left", mid, now) });
        bcastMembers();
        return res({ save: true, close: [mid] });
      }
      case "report": {
        const who = S.members[msg.who];
        if (!who || who.id === mid) return res();
        S.reports.push({ at: now, by: mid, who: who.id, reason: cleanLine(msg.reason, 200) || null });
        if (S.reports.length > PARTY.maxReports) S.reports.splice(0, S.reports.length - PARTY.maxReports);
        out.push({ to: mid, msg: { t: "reported", who: who.id } });
        return res({ save: true });
      }
    }
    // ---- the host's controls ----
    if (!host) return res();
    switch (msg?.t) {
      case "kick": {
        const who = S.members[msg.who];
        if (!who || who.id === mid) return res();
        who.kicked = true; who.spot = null;
        out.push({ to: who.id, msg: { t: "kicked" } });
        out.push({ to: "*", msg: this.notice("removed", who.id, now) });
        bcastMembers();
        return res({ save: true, close: [who.id] });
      }
      case "assign": {
        const who = S.members[msg.who], want = Number(msg.spot), L = layoutFor(S.venue);
        if (!who || who.role === "spectator" || !L.spots.some((s) => s.id === want)) return res();
        const other = Object.values(S.members).find((m) => m.spot === want && m.id !== who.id && !m.left && !m.kicked);
        if (other) other.spot = who.spot; // swap
        who.spot = want; bcastMembers();
        return res({ save: true });
      }
      case "settings": {
        for (const k of ["locked", "codeOn", "chatOn", "voiceOn", "anglersOn"]) if (typeof msg[k] === "boolean") S[k] = msg[k];
        if (["now", "morning", "midday", "dusk", "night"].includes(msg.light)) S.light = msg.light;
        if (!S.voiceOn) for (const m of Object.values(S.members)) m.voice = { on: false, muted: true };
        out.push({ to: "*", msg: this.settingsOut() });
        out.push({ to: mid, msg: this.settingsOut(true) });
        return res({ save: true });
      }
      case "newLink": {
        S.secret = randomId(12);
        out.push({ to: mid, msg: this.settingsOut(true) });
        return res({ save: true });
      }
      case "challenge": {
        if (msg.kind == null) S.challenge = null;
        else if (CHALLENGES[msg.kind]) { const min = Math.max(10, Math.min(240, Number(msg.minutes) || 60)); S.challenge = { kind: msg.kind, startsAt: now, endsAt: now + min * 60e3 }; }
        out.push({ to: "*", msg: this.settingsOut() });
        return res({ save: true });
      }
      case "close": {
        S.closed = true;
        out.push({ to: "*", msg: { t: "closed", why: "closed" } });
        return res({ save: true, close: ["*"] });
      }
    }
    return res();
  }
  connected(mid, now) { this.online.set(mid, (this.online.get(mid) || 0) + 1); const m = this.s.members[mid]; if (m) m.seenAt = now; }
  // someone whose last connection closes is out of voice too (their phone dropped the call), so nobody else keeps
  // waiting to hear them; they turn it back on when they're back
  disconnected(mid, now) { const n = (this.online.get(mid) || 1) - 1; if (n <= 0) this.online.delete(mid); else this.online.set(mid, n); const m = this.s?.members[mid]; if (m) { m.seenAt = now; if (n <= 0) m.voice = { on: false, muted: true }; } }
}

export { standings } from "../src/lib/partyStats.js";

// ---- the glue between the room and its storage and sockets (shared by the Durable Object and the local server) ----
// ---- the public places' board: how many are fishing each mark now ----
// A room's count is kept until it changes, or for three hours (a room with people in tells the board again every half
// hour, so a count that's stopped coming, from a room that's gone, drops off).
export class PublicBoard {
  constructor(s = null) { this.s = s && s.rooms ? s : { rooms: {} }; }
  report({ mark, code, n }, now) {
    if (typeof mark !== "string" || !markFor(mark) || !validCode(code) || !Number.isFinite(n)) return false;
    if (n > 0) this.s.rooms[code] = { mark, n: Math.min(Math.round(n), PARTY.maxAnglers), at: now }; else delete this.s.rooms[code];
    this.tidy(now); return true;
  }
  tidy(now) { for (const [c, r] of Object.entries(this.s.rooms)) if (now - r.at > PUBLIC.boardMs) delete this.s.rooms[c]; }
  /** { mark: anglers connected now } for every mark with someone fishing it. */
  counts(now) { this.tidy(now); const out = {}; for (const r of Object.values(this.s.rooms)) out[r.mark] = (out[r.mark] || 0) + r.n; return out; }
}

export class PartyHost {
  /** store: { get(k), put(k, v), delete(k) }; sockets: { all(): [ws], memberOf(ws), send(ws, text), close(ws, code, why) } */
  // (board: how a public room tells the board its count, async ({ mark, code, n }); none in a private party's tests)
  constructor(store, sockets, board = null) { this.store = store; this.sockets = sockets; this.room = null; this.board = board; this.told = null; }
  /** A public room's count of connected anglers, to the board, when it's changed (or half an hour on). */
  async tell(now) {
    const S = this.room?.s; if (!this.board || !S?.public || !S.place?.mark) return;
    const n = [...this.room.online.keys()].filter((id) => { const m = S.members[id]; return m && m.role === "angler" && !m.left && !m.kicked; }).length;
    if (this.told && this.told.n === n && now - this.told.at < PUBLIC.retellMs) return;
    this.told = { n, at: now };
    try { await this.board({ mark: S.place.mark, code: S.code, n }); } catch { /* the board's a nicety: fishing goes on */ }
  }
  async load() { if (!this.room) { const s = await this.store.get("s"); this.room = new PartyRoom(s || null); for (const ws of this.sockets.all()) { const m = this.sockets.memberOf(ws); if (m) this.room.connected(m, Date.now()); } } return this.room; }
  async save() { await this.store.put("s", this.room.s); }
  /** HTTP inside the party: init, info, join, photo. The socket upgrade is answered by the platform. */
  async fetch(request, now = Date.now()) {
    const url = new URL(request.url), op = url.pathname.split("/").pop();
    // (the board: only ever this object, named BOARD, reached from the rooms and the Worker, never by a code)
    if (op === "board" || op === "counts") {
      const b = new PublicBoard(await this.store.get("board"));
      if (op === "counts") return json({ counts: b.counts(now) });
      if (request.method !== "POST" || !b.report(await request.json(), now)) return json({ error: "bad" }, 400);
      await this.store.put("board", b.s); return json({ ok: true });
    }
    const room = await this.load();
    if (op === "init" && request.method === "POST") {
      // (a code whose party has ended can be given out again: with four digits they would soon run out otherwise)
      if (room.ready && !room.ended(now)) return json({ error: "exists" }, 409);
      const b = await request.json();
      if (room.ready) for (const ws of this.sockets.all()) { try { this.sockets.close(ws, 4001, "ended"); } catch { /* already gone */ } }
      room.s = null;
      const host = await room.init(b, now); await this.save();
      return json({ code: room.s.code, secret: room.s.secret, member: host, expiresAt: room.s.expiresAt });
    }
    if (op === "public" && request.method === "POST") {
      const b = await request.json();
      if (room.ready && !room.s.public && !room.ended(now)) return json({ error: "taken" }, 409);
      if (!room.ready || room.ended(now)) { room.s = null; room.initPublic({ code: b.code, mark: b.mark, venue: b.venue }, now); }
      const r = await room.joinPublic(b, now);
      if (r.error) return json({ error: r.error }, 409);
      await this.save();
      this.broadcast({ t: "members", members: room.members() });
      if (r.notice) this.broadcast(r.notice);
      return json({ code: room.s.code, member: r.member, role: r.role });
    }
    if (op === "info") {
      const pv = room.preview(now, { secret: url.searchParams.get("s"), viaCode: url.searchParams.get("via") === "code" });
      return pv.ok ? json(pv) : json({ error: pv.why }, pv.why === "ended" ? 410 : 404);
    }
    if (op === "join" && request.method === "POST") {
      const b = await request.json();
      const r = await room.join(b, now);
      if (r.error) return json({ error: r.error }, r.error === "not_found" ? 404 : r.error === "ended" ? 410 : 403);
      await this.save();
      this.broadcast({ t: "members", members: room.members() });
      if (r.notice) this.broadcast(r.notice);
      return json({ member: r.member, role: r.role });
    }
    if (op === "auth") { const m = await room.auth(url.searchParams.get("m"), now); if (!m || room.ended(now)) return json({ error: room.ended(now) ? "ended" : "not_member" }, room.ended(now) ? 410 : 403); await this.save(); return json({ member: m.id }); }
    if (op === "photo" && request.method === "POST") {
      const m = await room.auth(url.searchParams.get("m"), now);
      if (!m || room.s.mode !== "real" || !m.spot) return json({ error: "forbidden" }, 403);
      const buf = new Uint8Array(await request.arrayBuffer());
      if (buf.length < 100 || buf.length > PARTY.photoBytes || buf[0] !== 0xff || buf[1] !== 0xd8) return json({ error: "bad_photo" }, 400);
      if (room.s.photos.length >= 60) return json({ error: "too_many" }, 429);
      const id = randomId(9);
      await this.store.put(`p:${id}`, buf); room.s.photos.push({ id, who: m.id, at: now }); await this.save();
      return json({ photo: id });
    }
    if (url.pathname.includes("/photo/") && request.method === "GET") {
      const m = await room.auth(url.searchParams.get("m"), now), id = url.pathname.split("/photo/")[1];
      if (!m || !room.s.photos.some((p) => p.id === id)) return json({ error: "not_found" }, 404);
      const buf = await this.store.get(`p:${id}`);
      return buf ? new Response(buf, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } }) : json({ error: "not_found" }, 404);
    }
    return json({ error: "not_found" }, 404);
  }
  async opened(ws, mid, now = Date.now()) {
    const room = await this.load();
    room.connected(mid, now); room.placeAnglers(now);
    this.sockets.send(ws, JSON.stringify(room.hello(mid, now)));
    this.broadcast({ t: "members", members: room.members() }, ws);
    await this.save();
    await this.tell(now);
  }
  async onMessage(ws, text, now = Date.now()) {
    const room = await this.load(), mid = this.sockets.memberOf(ws);
    if (!mid) return;
    let msg; try { msg = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text)); } catch { return; }
    const r = room.message(mid, msg, now);
    for (const o of r.out) {
      const text2 = JSON.stringify(o.msg);
      for (const s of this.sockets.all()) {
        const m = this.sockets.memberOf(s);
        if (o.to === "*" || (o.to === "others" && m !== mid) || o.to === m) this.sockets.send(s, text2);
      }
    }
    if (r.save) await this.save();
    for (const who of r.close) for (const s of this.sockets.all()) if (who === "*" || this.sockets.memberOf(s) === who) this.sockets.close(s, 4000, "bye");
    await this.tell(now);
  }
  async onClose(ws, now = Date.now()) {
    const room = await this.load(), mid = this.sockets.memberOf(ws);
    if (!mid || !room.ready) return;
    const wasOn = !!room.s.members[mid]?.voice?.on;
    room.disconnected(mid, now);
    this.broadcast({ t: "members", members: room.members() }, ws);
    const m = room.s.members[mid];
    if (wasOn && m && !m.voice.on) this.broadcast({ t: "voice", who: mid, voice: m.voice }, ws);
    await this.save();
    await this.tell(now);
  }
  broadcast(msg, except = null) { const text = JSON.stringify(msg); for (const s of this.sockets.all()) if (s !== except) this.sockets.send(s, text); }
}

// ---- the public routes (the Worker) ----
// POST /api/party                    start a party (the host)
// GET  /api/party/public             how many are fishing each public place now ({ counts: { mark: n } })
// POST /api/party/public             a seat at a public place ({ mark, venue, name, outfit, look })
// GET  /api/party/<code>?s=<secret>  what a link or code is for, before joining (&via=code for the short code)
// POST /api/party/<code>/join        join as an angler or a spectator
// GET  /api/party/<code>/ws?m=<key>  the member's live connection (WebSocket)
// POST /api/party/<code>/photo?m=    a real catch's photo (JPEG, members fishing for real only)
// GET  /api/party/<code>/photo/<id>?m=
export async function handleParty(request, env, now = Date.now()) {
  const path = routePath(request, "party");
  if (!path) return err(400, "bad_path", "That address couldn't be read.");
  const [code, op, sub] = path;
  const upgrade = (request.headers.get("upgrade") || "").toLowerCase() === "websocket";
  // a browser can't add headers to a WebSocket, so the socket is checked by origin and member key instead
  if (upgrade) { if (!sameOrigin(request)) return err(403, "forbidden", "Request blocked."); }
  else { const blocked = guard(request); if (blocked) return blocked; }
  try {
    if (!env?.PARTY) return err(503, "not_configured", "Fish Together isn't switched on for this site yet.");
    const stub = (c) => env.PARTY.get(env.PARTY.idFromName(c));
    const inner = (c, p, init) => stub(c).fetch(new Request(`https://party.internal/${p}`, init));
    const db = await needDb(env, now, "Fish Together");
    const who = await ipKey(db, env, request.headers.get("cf-connecting-ip"), now);
    if (!code && request.method === "POST") {
      await enforce(db, `party:new:${who}`, PARTY.createPerDay, now, { daily: true }, "That's as many parties as can be started from here today.");
      const b = await readJson(request, 4096);
      const body = { mode: b.mode === "real" ? "real" : "virtual", venue: VENUES.includes(b.venue) ? b.venue : "pier", place: cleanPlace(b.place, b.mode), name: nameOf(b.name, "Host"), outfit: Number(b.outfit) || 0, look: cleanLook(b.look), hours: Number(b.hours) || PARTY.defaultHours };
      for (let i = 0; i < 12; i++) {
        const c = makeCode();
        const r = await inner(c, "init", { method: "POST", body: JSON.stringify({ ...body, code: c }) });
        if (r.status === 409) continue;
        return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
      }
      return err(503, "busy", "Couldn't start a party just now. Try again.");
    }
    // how many are fishing each public place now, for the map (GET /api/party/public): numbers by place only
    if (code === "public" && !op && request.method === "GET") {
      await enforce(db, `party:now:${who}`, PARTY.lookupsPerMinute, now, { windowMs: 60e3 }, "That's a lot of looks. Wait a minute and try again.");
      const r = await inner(BOARD, "counts");
      return new Response(r.body, { status: r.ok ? 200 : 502, headers: { "content-type": "application/json", "cache-control": "public, max-age=20" } });
    }
    // a public place: the first of the mark's rooms with a free spot (POST /api/party/public { mark, venue, name, ... })
    if (code === "public" && !op && request.method === "POST") {
      await enforce(db, `party:join:${who}`, PARTY.joinsPerMinute, now, { windowMs: 60e3 }, "That's a lot of tries. Wait a minute and try again.");
      const b = await readJson(request, 4096), mark = typeof b.mark === "string" && markFor(b.mark) ? b.mark : null;
      if (!mark) return err(404, "not_found", "That isn't one of FishDock's places.");
      const body = { mark, venue: VENUES.includes(b.venue) ? b.venue : "pier", name: nameOf(b.name, "Angler"), outfit: Number(b.outfit) || 0, look: cleanLook(b.look) };
      for (let n = 1; n <= PUBLIC.rooms; n++) {
        const c = await publicCode(mark, n);
        const r = await inner(c, "public", { method: "POST", body: JSON.stringify({ ...body, code: c }) });
        if (r.ok) return new Response(r.body, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      return err(503, "full", "Every spot at this place is taken just now. Try again in a little while.");
    }
    if (!validCode(code)) return err(404, "not_found", "There's no party with that code.");
    const url = new URL(request.url), m = url.searchParams.get("m") || "";
    if (upgrade && op === "ws") return stub(code).fetch(new Request(`https://party.internal/ws?m=${encodeURIComponent(m)}`, { headers: request.headers }));
    if (!op && request.method === "GET") {
      await enforce(db, `party:look:${who}`, PARTY.lookupsPerMinute, now, { windowMs: 60e3 }, "That's a lot of codes. Wait a minute and try again.");
      // (wrong guesses at a code, per network: a right one is given back, so only misses use the hour's allowance up)
      await enforce(db, `party:miss:${who}`, PARTY.missesPerHour, now, { windowMs: 3600e3 }, "Too many wrong codes from here. Try again in an hour, or ask the host for their invite link.");
      const s = url.searchParams.get("s") || "", via = url.searchParams.get("via") === "code" ? "code" : "";
      const r = await inner(code, `info?s=${encodeURIComponent(s)}&via=${via}`);
      if (r.ok) await giveBack(db, `party:miss:${who}`);
      return r.ok ? new Response(r.body, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }) : err(r.status, r.status === 410 ? "ended" : "not_found", r.status === 410 ? "That party has ended." : "There's no party with that code, or its invitation has changed.");
    }
    if (op === "join" && request.method === "POST") {
      await enforce(db, `party:join:${who}`, PARTY.joinsPerMinute, now, { windowMs: 60e3 }, "That's a lot of tries. Wait a minute and try again.");
      // (wrong guesses at a code, per network: a right one is given back, so only misses use the hour's allowance up)
      await enforce(db, `party:miss:${who}`, PARTY.missesPerHour, now, { windowMs: 3600e3 }, "Too many wrong codes from here. Try again in an hour, or ask the host for their invite link.");
      const b = await readJson(request, 4096);
      const r = await inner(code, "join", { method: "POST", body: JSON.stringify({ secret: typeof b.secret === "string" ? b.secret.slice(0, 40) : null, viaCode: !!b.viaCode, name: b.name, role: b.role === "spectator" ? "spectator" : "angler", outfit: Number(b.outfit) || 0, look: cleanLook(b.look) }) });
      const out = await r.json();
      if (r.ok || out.error !== "not_found") await giveBack(db, `party:miss:${who}`);
      if (!r.ok) return err(r.status, out.error || "not_found", { not_found: "There's no party with that code, or its invitation has changed.", ended: "That party has ended.", locked: "The host has locked this party.", full: "This party is full." }[out.error] || "Couldn't join.");
      return json(out);
    }
    if (op === "photo") {
      if (request.method === "POST") return stub(code).fetch(new Request(`https://party.internal/photo?m=${encodeURIComponent(m)}`, { method: "POST", body: await request.arrayBuffer() }));
      if (request.method === "GET" && sub) return stub(code).fetch(new Request(`https://party.internal/photo/${encodeURIComponent(sub)}?m=${encodeURIComponent(m)}`));
    }
    return err(404, "not_found", "There's nothing here.");
  } catch (e) {
    return toResponse(e, now, "party");
  }
}
