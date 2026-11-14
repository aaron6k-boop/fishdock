// ---- walk-check: your angler walking about, frame by frame: feet on the deck, never through each other, hands clear ----
// Third person at Gorleston, 60 frames a second on the film clock (the same every run): standing, walking on, a curve,
// a stop, turning, a sprint, turning round to walk back. Every frame: the feet, toes, hands, hips and legs. Checks:
//   - stopping after a curve, the feet come back under you (no standing with the legs 80 cm apart);
//   - the boots' toes never more than 1 cm lower than standing (through the deck);
//   - the feet never nearer than 14 cm along the deck (through each other);
//   - the free left hand inside its thigh's line (9 cm) or the body's (15 cm from the spine) in no more than 3 frames
//     of any part.
// Drawn in software here: right for the motion, not proof of how smoothly a phone runs it.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8830 --dist &
//   node tools/walk-check.mjs http://localhost:8830
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here"); process.exit(0); }
const base = (process.argv[2] || "http://localhost:8830").replace(/\/$/, "");
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 700 } });
await ctx.addInitScript(() => { window.__fdFilm = true; localStorage.setItem("fishdock.playerName", "Tester"); localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "low", fishCam: "third" })); });
const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/#play/gorleston-south-pier`);
await p.waitForFunction(() => window.__fdWorld && window.__fdWorld.play, null, { timeout: 300000 });
await p.waitForFunction(() => !/Loading /.test(document.body.innerText), null, { timeout: 900000, polling: 2000 }); await p.waitForTimeout(4000);
await p.evaluate(() => {
  const W = window.__fdWorld; W.freeze(); window.__rows = [];
  const NAMES = ["Bip01_Pelvis", "Bip01_Spine2", "Bip01_L_Thigh", "Bip01_L_Calf", "Bip01_L_Foot", "Bip01_L_Toe0", "Bip01_R_Thigh", "Bip01_R_Calf", "Bip01_R_Foot", "Bip01_R_Toe0", "Bip01_L_Hand", "Bip01_R_Hand"];
  window.__rec = (tag) => { const g = W.scene.getObjectsByProperty("name", "person")[0]; if (!g) return; const bones = {}; const v = new W.THREE.Vector3();
    g.traverse((o) => { if (o.isBone && NAMES.includes(o.name)) bones[o.name] = o.getWorldPosition(v).toArray(); });
    window.__rows.push({ tag, ground: window.__fdProbe?.feet, b: bones }); };
});
const seq = async (tag, x, y, secs, sprint = false) => { await p.evaluate(([x, y, sprint]) => window.__fdWorld.walkInput(x, y, sprint), [x, y, sprint]);
  for (let s = 0; s < secs * 2; s++) await p.evaluate(([tag]) => window.__fdWorld.frames(30, 1000 / 60, () => window.__rec(tag)), [tag]); };
await seq("stand", 0, 0, 2);
await p.evaluate(() => document.querySelector(".w3d-walkbtn")?.click());
await seq("walkon", 0, 0, 1); await seq("forward", 0, 1, 4); await seq("curve", 0.6, 1, 3); await seq("stop", 0, 0, 2.5);
await seq("turn", 1, 0, 2.5); await seq("stop2", 0, 0, 2); await seq("sprint", 0, 1, 3, true); await seq("stop3", 0, 0, 2.5);
await seq("back", 0, -1, 2.5); await seq("stop4", 0, 0, 2);
const rows = await p.evaluate(() => window.__rows); await b.close();
const P = (r, n) => r.b[n], sub = (a, c) => a.map((v, i) => v - c[i]), hyp = (a) => Math.hypot(a[0], a[2]);
const seg = (h, a, c) => { const ab = sub(c, a), t = Math.max(0, Math.min(1, (sub(h, a)[0] * ab[0] + sub(h, a)[1] * ab[1] + sub(h, a)[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2))); return hyp(sub(h, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]])); };
const stand = rows.filter((r) => r.tag === "stand"), med = (xs) => xs.sort((a, c) => a - c)[xs.length >> 1];
const ref = { L: med(stand.map((r) => P(r, "Bip01_L_Toe0")[1] - r.ground[1])), R: med(stand.map((r) => P(r, "Bip01_R_Toe0")[1] - r.ground[1])) };
let toeLow = 0, toeAt = "", gap = 9, gapAt = "", stopWide = 0; const inside = {};
rows.forEach((r, i) => {
  for (const s of ["L", "R"]) { const h = P(r, `Bip01_${s}_Toe0`)[1] - r.ground[1] - ref[s]; if (h < toeLow) { toeLow = h; toeAt = `${r.tag} frame ${i}`; } }
  if (r.tag !== "stand" && r.tag !== "walkon") { const d = hyp(sub(P(r, "Bip01_L_Foot"), P(r, "Bip01_R_Foot"))); if (d < gap) { gap = d; gapAt = `${r.tag} frame ${i}`; } }
  if (r.tag === "stop" && rows[i + 1]?.tag !== "stop") stopWide = hyp(sub(P(r, "Bip01_L_Foot"), P(r, "Bip01_R_Foot")));
  const h = P(r, "Bip01_L_Hand");
  if (seg(h, P(r, "Bip01_L_Thigh"), P(r, "Bip01_L_Calf")) < 0.09 || seg(h, P(r, "Bip01_Pelvis"), P(r, "Bip01_Spine2")) < 0.15) inside[r.tag] = (inside[r.tag] || 0) + 1;
});
const worstIn = Object.entries(inside).sort((a, c) => c[1] - a[1])[0] || ["none", 0];
let fails = 0; const ok = (c, what) => { console.log(`${c ? "PASS" : "FAIL"}  ${what}`); if (!c) fails++; };
ok(stopWide > 0.1 && stopWide < 0.4, `standing after a curve, the feet ${(stopWide * 100).toFixed(0)} cm apart (they come back under you)`);
ok(toeLow > -0.01, `the boots' toes at most ${(-toeLow * 1000).toFixed(0)} mm lower than standing (${toeAt})`);
ok(gap >= 0.14, `the feet never nearer than ${(gap * 100).toFixed(1)} cm along the deck (${gapAt})`);
ok(worstIn[1] <= 3, `the free hand inside the thigh or the body: ${worstIn[1]} frames at most (${worstIn[0]})`);
ok(rows.length > 1500 && !errors.length, `${rows.length} frames, no page errors${errors.length ? `: ${errors[0]}` : ""}`);
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed"); process.exit(fails ? 1 : 0);
