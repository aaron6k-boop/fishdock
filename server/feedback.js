// POST /api/feedback { kind, text, ref? }  Bugs, ideas and "this is wrong" reports from the app. Guests allowed.
//
// - Who sent it is not kept: no account id, no network address. Only whether it came from a signed-in account.
// - Rate-limited per network (the day's keyed hash, ipKey.js) and per account: 3 a minute and 20 a UK day.
// - `ref` names what the feedback is about (a spot or species id, a screen name): short, plain, no locations.
// - Text that looks like a location is kept (a wrong spot is often reported with one) but only admins see it.

import { json, err, guard, readJson, toResponse, cleanText, cleanLine, randomId, fail } from "./http.js";
import { needDb, enforce } from "./db.js";
import { accountFrom, noteActive } from "./account.js";
import { networkKey, noteNetwork } from "./throttle.js";

export const FEEDBACK_KINDS = ["bug", "idea", "inaccurate-spot", "inaccurate-forecast", "other"];
export const FEEDBACK_LIMITS = { textMax: 2000, refMax: 80, perMinute: 3, perDay: 20 };

export async function handleFeedback(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/feedback\/?/, "");
    if (path) return err(404, "not_found", "Unknown route.");
    if (request.method !== "POST") return err(405, "method", "Use POST to send feedback.");
    const db = await needDb(env, now, "Feedback");
    const body = await readJson(request, 16 * 1024);
    const kind = FEEDBACK_KINDS.includes(body.kind) ? body.kind : null;
    if (!kind) throw fail(400, "bad_kind", "Choose what kind of feedback this is.");
    const text = cleanText(body.text, FEEDBACK_LIMITS.textMax + 1);
    if (text.length < 3) throw fail(400, "bad_text", "Tell us a little more first.");
    if (text.length > FEEDBACK_LIMITS.textMax) throw fail(400, "too_long", `Keep it under ${FEEDBACK_LIMITS.textMax} characters.`);
    const ref = cleanLine(typeof body.ref === "string" ? body.ref : "", FEEDBACK_LIMITS.refMax) || null;

    const me = await accountFrom(request, env, now, deps);
    const net = await networkKey(db, env, request, now);
    await noteNetwork(db, net, now);
    if (me) await noteActive(db, env, me.uid, now);
    const who = me ? "u:" + me.uid : "g:" + net;
    await enforce(db, "fb-m:" + who, FEEDBACK_LIMITS.perMinute, now, { windowMs: 60e3 }, "Thanks: give it a moment before sending more.");
    await enforce(db, "fb-d:" + who, FEEDBACK_LIMITS.perDay, now, { daily: true }, "Thanks for all your feedback today. You can send more tomorrow.");
    if (me) await enforce(db, "fb-d:g:" + net, FEEDBACK_LIMITS.perDay * 3, now, { daily: true }, "Thanks for all your feedback today. You can send more tomorrow.");

    const id = randomId(12);
    await db.prepare(`INSERT INTO feedback (id, kind, text, ref, from_account, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(id, kind, text, ref, me ? 1 : 0, now).run();
    return json({ ok: true, id }, 201);
  } catch (e) {
    return toResponse(e, now, "feedback");
  }
}
