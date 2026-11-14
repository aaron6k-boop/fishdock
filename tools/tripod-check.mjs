// ---- tripod-check: does the rod lie in its tripod, and come out of it, without going through it? ----
// The game opened at Gorleston, a cast, 13 s waiting with the rod in its tripod in a 24 km/h breeze, then a bite and
// the rod picked up, every 50 ms on the film clock. Each frame the rod's blank as a tube round its own centre line (the
// probe's points, the blank's radius along it as rodKit.js tapers it) against the tripod's surface (points every 4 mm
// over each triangle within 20 cm of the rod), the reel's own vertices against the same points, and the butt against
// the cup it stands in. Checks:
//   - waiting: no part of the tripod inside the blank, and the blank resting on the cradle (within 2 mm of it);
//   - waiting: the rod lies still (its butt doesn't move; it used to sway 4 cm at the cradle in a breeze);
//   - picked up: no part of the tripod more than 1 mm inside the blank as it comes out;
//   - the butt never through the side of the cup (5 mm round it), and the reel never within 3 mm of the tripod.
// Drawn in software here: right for the shapes and the motion, not proof of how smoothly a phone runs it.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &
//   node tools/tripod-check.mjs http://localhost:8820
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here"); process.exit(0); }
const base = (process.argv[2] || "http://localhost:8820").replace(/\/$/, "");
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 480, height: 480 } });
await ctx.addInitScript(() => { window.__fdFilm = true; localStorage.setItem("fishdock.playerName", "Tester"); localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "low", fishCam: "third" })); });
const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/#play/gorleston-south-pier`);
await p.waitForFunction(() => window.__fdWorld && window.__fdWorld.play, null, { timeout: 300000 });
await p.waitForFunction(() => !/Loading /.test(document.body.innerText), null, { timeout: 900000, polling: 2000 });
await p.evaluate(() => { const W = window.__fdWorld; W.freeze(); W.env({ sunAlt: 30, sunAz: 160 }, { cloudPct: 30, windKph: 24 }); W.step(2000);
  W.play([["cast", 0.5], ["bite", 19]], null); for (let i = 0; i < 80; i++) W.step(100); });
// the tripod's surface near the rod as it lies, and a grid of 2 cm cells over it for the reel
await p.evaluate(() => {
  const W = window.__fdWorld, T = W.THREE, tri = W.scene.getObjectByName("tripod"), S = [], a = new T.Vector3(), bb = new T.Vector3(), c = new T.Vector3();
  const rp = window.__fdProbe.rod.map((q) => new T.Vector3(...q)), ln = new T.Line3(), cq = new T.Vector3();
  const nearRod = (v) => { for (let i = 0; i + 1 < rp.length; i++) { ln.set(rp[i], rp[i + 1]); ln.closestPointToPoint(v, true, cq); if (cq.distanceTo(v) < 0.2) return true; } return false; };
  tri.traverse((o) => { if (!o.isMesh) return; o.updateWorldMatrix(true, false); const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) { a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld); bb.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(o.matrixWorld);
      if (!nearRod(a) && !nearRod(bb) && !nearRod(c)) continue;
      const m = Math.max(1, Math.ceil(Math.max(a.distanceTo(bb), bb.distanceTo(c), c.distanceTo(a)) / 0.004));
      for (let u = 0; u <= m; u++) for (let v = 0; v <= m - u; v++) { const w = m - u - v; S.push([(a.x * u + bb.x * v + c.x * w) / m, (a.y * u + bb.y * v + c.y * w) / m, (a.z * u + bb.z * v + c.z * w) / m]); } } });
  const G = new Map(), cell = (x) => Math.floor(x / 0.02);
  for (const s of S) { const k = `${cell(s[0])},${cell(s[1])},${cell(s[2])}`; if (!G.has(k)) G.set(k, []); G.get(k).push(s); }
  window.__tc = { S, near(v) { let d = 9; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const s of G.get(`${cell(v.x) + i},${cell(v.y) + j},${cell(v.z) + k}`) || []) d = Math.min(d, Math.hypot(s[0] - v.x, s[1] - v.y, s[2] - v.z)); return d; } };
});
const rows = [];
for (let f = 0; f < 300; f++) rows.push(await p.evaluate(() => {
  const W = window.__fdWorld, T = W.THREE, tc = window.__tc; W.step(50); const pr = window.__fdProbe; if (!pr?.rod) return null;
  const pts = pr.rod.map((q) => new T.Vector3(...q)), L = pts.length - 1, cum = [0]; for (let i = 1; i <= L; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const R = { r0: 0.0108, r1: 0.0022 }, seg = new T.Line3(), cp = new T.Vector3(); // (Gorleston: the pier rod, angler.js ROD.pier)
  let deepest = 1;
  for (const s of tc.S) { const v = new T.Vector3(...s);
    for (let i = 0; i < L; i++) { seg.set(pts[i], pts[i + 1]); const t = seg.closestPointToPointParameter(v, true); seg.at(t, cp); const z = cum[i] + t * (cum[i + 1] - cum[i]);
      if (z < 0.97) continue; // (the handle, grips thicker than the blank: the butt in its cup is checked below)
      deepest = Math.min(deepest, cp.distanceTo(v) - (R.r0 + (R.r1 - R.r0) * Math.pow(z / cum[L], 0.8))); } }
  let reel = 1; W.scene.traverse((o) => { if (!o.isMesh || !o.visible || !/reel/.test(`${o.material?.name || ""} ${o.name}`)) return; o.updateWorldMatrix(true, false); const pos = o.geometry.attributes.position, v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) reel = Math.min(reel, tc.near(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld))); });
  if (!window.__b0) { window.__b0 = pts[0].clone(); window.__d0 = pts[1].clone().sub(pts[0]).normalize(); }
  const db = pts[0].clone().sub(window.__b0), along = db.dot(window.__d0), off = db.clone().addScaledVector(window.__d0, -along).length();
  return { stage: pr.stage, deepest, reel, cup: along < 0.07 ? Math.max(0, off - 0.005) : 0, moved: db.length() };
}));
await b.close();
const ok = rows.filter(Boolean), wait = ok.filter((r) => r.stage === "waiting"), lift = ok.filter((r) => r.stage !== "waiting");
const mm = (x) => (x * 1000).toFixed(1) + " mm";
let fails = 0; const check = (pass, msg) => { console.log(`${pass ? "PASS" : "FAIL"}  ${msg}`); if (!pass) fails++; };
const wIn = Math.min(...wait.map((r) => r.deepest)), wMax = Math.max(...wait.map((r) => r.deepest));
check(wait.length > 150 && wIn > -0.0005, `waiting: the tripod ${wIn < 0 ? mm(-wIn) + " inside" : mm(wIn) + " clear of"} the blank at most, in ${wait.length} frames`);
check(wMax < 0.002, `waiting: the blank resting on the cradle (${mm(wMax)} off it at most)`);
check(Math.max(...wait.map((r) => r.moved)) < 0.001, `waiting: the rod lies still (its butt moved ${mm(Math.max(...wait.map((r) => r.moved)))})`);
const lIn = Math.min(...lift.map((r) => r.deepest));
check(lift.length > 20 && lIn > -0.001, `picked up: the tripod ${lIn < 0 ? mm(-lIn) + " inside" : mm(lIn) + " clear of"} the blank at most, in ${lift.length} frames`);
check(Math.max(...ok.map((r) => r.cup)) === 0, `the butt never through the side of its cup (${ok.filter((r) => r.cup > 0).length} frames)`);
{ const n = Math.min(...ok.map((r) => r.reel)); check(n >= 0.003, `the reel never within 3 mm of the tripod (at nearest ${n >= 0.02 ? "more than 2 cm" : mm(n)})`); }
check(!errors.length, errors.length ? `page errors: ${errors.slice(0, 2).join(" | ")}` : "no page errors");
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed"); process.exit(fails ? 1 : 0);
