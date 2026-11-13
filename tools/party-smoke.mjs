// ---- party smoke test ----
// Two members against a running FishDock: start, join, sockets, independent fishing, shared catches, reconnecting and
// the privacy and host controls. Point it at local workerd (`npx wrangler dev`), the e2e server, or the live site:
//   node tools/party-smoke.mjs http://localhost:8787
// It starts one real (short, two-hour) party and closes it at the end. Needs Node 22+ (global fetch and WebSocket).
const base = (process.argv[2] || "http://localhost:8787").replace(/\/$/, "");
const origin = new URL(base).origin;
const H = { "content-type": "application/json", "x-fishdock": "1", origin };
let fails = 0;
const ok = (cond, what, extra) => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}${!cond && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init = {}) {
  const r = await fetch(base + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  let body = null; try { body = await r.json(); } catch { /* not json */ }
  return { status: r.status, body };
}

// ---- a socket with an inbox you can wait on ----
function connect(code, key) {
  const url = `${base.replace(/^http/, "ws")}/api/party/${code}/ws?m=${encodeURIComponent(key)}`;
  const ws = new WebSocket(url, { headers: { origin } });
  const inbox = [], waiters = [];
  const take = (m) => { inbox.splice(inbox.indexOf(m), 1); return m; };
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(typeof e.data === "string" ? e.data : Buffer.from(e.data).toString());
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(take(m)); break; }
  });
  const next = (pred, what = "message", ms = 10000) => {
    const have = inbox.find(pred);
    if (have) return Promise.resolve(take(have));
    return new Promise((res, rej) => {
      const w = { pred, res };
      waiters.push(w);
      setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); rej(new Error(`timed out waiting for ${what}`)); } }, ms);
    });
  };
  const log = [];
  ws.addEventListener("open", () => log.push("open")); ws.addEventListener("error", () => log.push("error")); ws.addEventListener("close", (e) => log.push(`close ${e.code}`));
  const opened = new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", () => rej(new Error("socket error"))); });
  const closed = new Promise((res) => ws.addEventListener("close", (e) => res({ code: e.code, reason: e.reason })));
  return { ws, inbox, log, next, opened, closed, send: (o) => ws.send(JSON.stringify(o)) };
}
const isEv = (who, type) => (m) => m.t === "event" && m.ev?.who === who && m.ev?.type === type;
const noPosition = (o) => !/"(lat|lon|lng|latitude|longitude|gps|coords|position)"\s*:/i.test(JSON.stringify(o));

async function main() {
  console.log(`Fish Together smoke test against ${base}\n`);

  // ---- start and preview ----
  const made = await api("/api/party", { method: "POST", body: JSON.stringify({ mode: "virtual", venue: "pier", place: { label: "Smoke test" }, name: "Smoke A", hours: 2 }) });
  ok(made.status === 200 && /^(?:[0-9]{4}|[A-Z0-9]{6})$/.test(made.body?.code || ""), "host starts a party", made);
  if (made.status !== 200) return;
  const { code, secret } = made.body, A = made.body.member;
  ok(noPosition(made.body), "start answer holds no position");
  const wrong = await api(`/api/party/${code}?s=notthesecret1`);
  ok(wrong.status === 404, "a wrong invite secret is refused", wrong);
  const viaLink = await api(`/api/party/${code}?s=${secret}`);
  ok(viaLink.status === 200 && !viaLink.body?.secret && noPosition(viaLink.body), "invite link preview works, shows no secret or position", viaLink);
  const viaCode = await api(`/api/party/${code}?via=code`);
  ok(viaCode.status === 200, "six-letter code preview works", viaCode);
  const noHeader = await fetch(`${base}/api/party/${code}?s=${secret}`);
  ok(noHeader.status === 403, "requests without the app header are refused", noHeader.status);

  // ---- join ----
  const joined = await api(`/api/party/${code}/join`, { method: "POST", body: JSON.stringify({ secret, name: "Smoke B", role: "angler", outfit: 2 }) });
  ok(joined.status === 200 && joined.body?.member?.key && joined.body.role === "angler", "second angler joins with the link", joined);
  const B = joined.body.member;

  // ---- sockets ----
  const a = connect(code, A.key); await a.opened;
  const helloA = await a.next((m) => m.t === "hello", "host hello");
  ok(helloA.you.host === true && !!helloA.party.secret, "host's socket opens; host sees the invite secret");
  const b = connect(code, B.key); await b.opened;
  const helloB = await b.next((m) => m.t === "hello", "guest hello");
  ok(helloB.you.id === B.id && !helloB.you.host && !helloB.party.secret, "guest's socket opens; guest never sees the invite secret", helloB.party);
  ok(noPosition(helloA) && noPosition(helloB), "nothing sent to either member contains a position");
  const spots = helloB.members.map((m) => m.spot);
  ok(helloB.members.length === 2 && spots.every(Boolean) && spots[0] !== spots[1], "two anglers, each on their own spot", helloB.members);
  const seen = await a.next((m) => m.t === "members" && m.members.some((x) => x.id === B.id && x.online), "host sees guest online");
  ok(!!seen, "host is told the guest is online");

  // ---- independent fishing ----
  a.send({ t: "event", ev: { type: "cast", cid: "a1" } });
  const aCastAtB = await b.next(isEv(A.id, "cast"), "host's cast at guest");
  ok(!!aCastAtB, "guest sees the host's cast");
  b.send({ t: "event", ev: { type: "catch", cid: "bx" } });
  const order = await b.next((m) => m.t === "error" && m.code === "order", "order refusal");
  ok(!!order, "a catch before a bite is refused (no skipping ahead)");
  b.send({ t: "event", ev: { type: "cast", cid: "b1" } });
  ok(!!(await a.next(isEv(B.id, "cast"), "guest's cast at host")), "host sees the guest's own cast (each fishes independently)");
  for (const [type, cid] of [["bite", "a2"], ["hooked", "a3"]]) a.send({ t: "event", ev: { type, cid } });
  await b.next(isEv(A.id, "hooked"), "host hooked at guest");
  a.send({ t: "event", ev: { type: "catch", cid: "a4", data: { species: "cod", lengthCm: 61, simulated: false } } });
  const caught = await b.next(isEv(A.id, "catch"), "host's catch at guest");
  ok(caught.ev.data?.species === "cod" && caught.ev.data.lengthCm === 61, "guest sees the host's catch with its details", caught.ev);
  ok(caught.ev.data?.simulated === true, "a virtual catch is marked simulated even when the phone says otherwise", caught.ev.data);
  await a.next(isEv(A.id, "catch"), "host's own catch echo");

  // ---- reconnecting ----
  const t0 = Date.now(); b.ws.close(); await b.closed;
  ok(Date.now() - t0 < 3000, "leaving the party completes quickly", `${Date.now() - t0} ms`);
  const away = await a.next((m) => m.t === "members" && m.members.some((x) => x.id === B.id && !x.online), "guest offline");
  ok(!!away, "host is told when the guest drops out");
  const b2 = connect(code, B.key); await b2.opened;
  const back = await b2.next((m) => m.t === "hello", "guest hello again");
  const types = back.events.map((e) => `${e.who === A.id ? "A" : "B"}:${e.type}`).join(",");
  ok(back.events.some((e) => e.who === A.id && e.type === "catch") && back.events.some((e) => e.who === B.id && e.type === "cast"), "after reconnecting, the guest gets everything that happened", types);
  ok(back.members.find((m) => m.id === B.id)?.spot === helloB.members.find((m) => m.id === B.id)?.spot, "the guest keeps their spot after reconnecting");
  const seqBefore = back.events.length;
  b2.send({ t: "event", ev: { type: "cast", cid: "b1" } });
  const dup = await b2.next(isEv(B.id, "cast"), "duplicate answer");
  ok(dup.ev.cid === "b1" && back.events.some((e) => e.seq === dup.ev.seq), "a resent message after a reconnect isn't counted twice", dup.ev);
  ok(seqBefore === back.events.length, "event count unchanged by the resend");

  // ---- privacy and host controls ----
  b2.send({ t: "kick", who: A.id }); b2.send({ t: "close" });
  await sleep(800);
  a.send({ t: "ping" }); ok(!!(await a.next((m) => m.t === "pong", "pong")), "a guest can't remove the host or close the party");
  a.send({ t: "settings", locked: true });
  const lockedAtB = await b2.next((m) => m.t === "settings" && m.locked === true, "lock at guest");
  ok(!!lockedAtB && !lockedAtB.secret, "host locks the party; the guest is told, without the secret");
  const blocked = await api(`/api/party/${code}/join`, { method: "POST", body: JSON.stringify({ secret, name: "Smoke C", role: "angler" }) });
  ok(blocked.status === 403, "nobody new can join a locked party", blocked);
  a.send({ t: "newLink" });
  const fresh = await a.next((m) => m.t === "settings" && m.secret && m.secret !== secret, "new secret");
  const oldLink = await api(`/api/party/${code}?s=${secret}`);
  ok(!!fresh && oldLink.status === 404, "host replaces the invite link; the old link stops working", oldLink);
  a.send({ t: "settings", codeOn: false });
  await a.next((m) => m.t === "settings" && m.codeOn === false, "code off");
  const codeOff = await api(`/api/party/${code}?via=code`);
  ok(codeOff.status === 404, "host turns the six-letter code off; it stops working", codeOff);
  a.send({ t: "kick", who: B.id });
  ok((await b2.next((m) => m.t === "kicked", "kicked")) && (await b2.closed), "host removes the guest; the guest's socket is closed");
  const b3 = connect(code, B.key);
  // (the Worker refuses before the socket opens, which Node reports as an error with no close; the local e2e server
  // opens and closes it straight away: either way, no hello and the socket ends)
  b3.opened.catch(() => {});
  const refused = await Promise.race([b3.next((m) => m.t === "hello", "hello", 15000).then(() => "let in").catch(() => "timeout"), b3.closed.then(() => "refused"), b3.opened.then(() => new Promise(() => {}), () => "refused")]);
  ok(refused === "refused" && !b3.inbox.some((m) => m.t === "hello"), "a removed guest can't reconnect with their old key", { refused, socket: b3.log, got: b3.inbox.map((m) => m.t) });
  try { b3.ws.close(); } catch { /* never opened */ }

  // ---- closing ----
  a.send({ t: "close" });
  ok(!!(await a.next((m) => m.t === "closed", "closed")), "host closes the party");
  const after = await api(`/api/party/${code}?s=${fresh?.secret || secret}`);
  ok(after.status === 410, "a closed party can't be opened again", after);
  a.ws.close();

  // ---- a public place: two anglers at the same mark see each other, and the map counts them ----
  // (a quiet mark, so a run against the live site barely shows; both leave straight away)
  const mark = "isle-of-whithorn", seat = (name) => api("/api/party/public", { method: "POST", body: JSON.stringify({ mark, venue: "pier", name }) });
  const p1 = await seat("Smoke A"), p2 = await seat("Smoke B");
  ok(p1.status === 200 && p2.status === 200 && p1.body.code === p2.body.code, "two anglers at the same place are put in its room, no invite", [p1, p2]);
  if (p1.status === 200 && p2.status === 200) {
    const s1 = connect(p1.body.code, p1.body.member.key), s2 = connect(p2.body.code, p2.body.member.key);
    const h1 = await s1.next((m) => m.t === "hello", "hello"); await s2.next((m) => m.t === "hello", "hello");
    ok(h1.party.public === true && h1.members.some((m) => m.name === "Smoke B" && m.spot), "each sees the other fishing there", h1.members);
    let n = 0; for (let i = 0; i < 12 && n < 2; i++) { const r = await api("/api/party/public"); n = r.body?.counts?.[mark] || 0; if (n < 2) await sleep(500); }
    ok(n >= 2, "the map's fishing-now count includes them", n);
    s1.send({ t: "leave" }); s2.send({ t: "leave" }); await sleep(300); s1.ws.close(); s2.ws.close();
  }
}

main().catch((e) => { ok(false, `stopped: ${e.message}`); }).finally(() => {
  console.log(`\n${fails ? `${fails} check(s) failed` : "All checks passed"}`);
  process.exit(fails ? 1 : 0);
});
