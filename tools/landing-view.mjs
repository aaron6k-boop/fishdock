// ---- landing-view: is the fish in the picture while you land it? ----
// A 52 cm bass caught at Gorleston and landed with the drop net, in first or third person, every 100 ms on the film
// clock from the bite to the fish on the deck. Each moment: whether the fish, the net and (third person) your head are
// inside the picture, clear of the controls along the bottom, and not hidden behind the pier (window.__fdWorld.blocked).
// Prints the share of each landing stage where each is seen; checks the stages where it must be:
//   first person: the fish brought up, the rod laid on the rail, the net let down, the fish led over it, hauled up;
//   third person: from the rod on the rail to the net set down on the deck, the fish, the net and you.
// (Picking the net up off the deck, you look at the net, not the fish; the fish coming over the rail passes close by.)
// Drawn in software here: right for the framing, not for how smoothly a phone runs it.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &
//   node tools/landing-view.mjs http://localhost:8820 first     (or third)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here"); process.exit(0); }
const base = (process.argv[2] || "http://localhost:8820").replace(/\/$/, ""), cam = process.argv[3] === "third" ? "third" : "first";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 420, height: 760 } });
await ctx.addInitScript((cam) => { window.__fdFilm = true; localStorage.setItem("fishdock.playerName", "Tester"); localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "low", fishCam: cam })); }, cam);
const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/#play/gorleston-south-pier`);
await p.waitForFunction(() => window.__fdWorld && window.__fdWorld.play, null, { timeout: 300000 });
await p.waitForFunction(() => !/Loading /.test(document.body.innerText), null, { timeout: 900000, polling: 2000 });
await p.evaluate(() => { const W = window.__fdWorld; W.freeze(); W.env({ sunAlt: 30, sunAz: 160 }, { cloudPct: 30, windKph: 8 }); W.step(2000);
  W.play([["cast", 0.5], ["bite", 8], ["hooked", 9.2], ["catch", 18, { species: "bass", lengthCm: 52 }]], { species: "bass", lengthCm: 52 }); });
const rows = [];
for (let i = 0; i < 700; i++) {
  const r = await p.evaluate(() => {
    const W = window.__fdWorld, T = W.THREE; W.step(50); W.step(50); const pr = window.__fdProbe; if (!pr) return null;
    const c = W.camera; c.updateMatrixWorld(); const fwd = c.getWorldDirection(new T.Vector3());
    // (seen: inside the picture with a margin, above the bottom 15% where the controls are, in front, not behind the pier)
    const seen = (a) => { if (!a) return null; const q = new T.Vector3(...a); if (q.clone().sub(c.position).dot(fwd) <= 0) return false; const v = q.clone().project(c); return Math.abs(v.x) < 0.92 && v.y < 0.92 && v.y > -0.7 && !W.blocked(a); };
    return { stage: pr.stage, fish: seen(pr.fish), net: seen(pr.net), head: seen(pr.head), card: !!document.querySelector(".walk-prompt") };
  });
  if (!r) continue; rows.push(r);
  if (rows.filter((x) => x.card).length > 30) break;
}
await b.close();
const STAGES = ["up", "rod", "pick", "lower", "lead", "haul", "in", "done"], by = {};
for (const r of rows) { if (!STAGES.includes(r.stage)) continue; const s = (by[r.stage] ||= { n: 0, fish: [0, 0], net: [0, 0], head: [0, 0] }); s.n++;
  for (const k of ["fish", "net", "head"]) if (r[k] != null) { s[k][1]++; if (r[k]) s[k][0]++; } }
const pct = (x) => (x[1] ? Math.round((100 * x[0]) / x[1]) : null);
console.log(`${cam} person, landing a 52 cm bass with the drop net at Gorleston (share of each stage seen):`);
for (const st of STAGES) { const s = by[st]; if (!s) continue; console.log(`  ${st.padEnd(6)} ${String(s.n).padStart(3)} checks   fish ${pct(s.fish) ?? "-"}%   net ${pct(s.net) ?? "-"}%   ${cam === "third" ? `you ${pct(s.head) ?? "-"}%` : ""}`); }
let fails = 0; const check = (pass, msg) => { console.log(`${pass ? "PASS" : "FAIL"}  ${msg}`); if (!pass) fails++; };
const must = cam === "first" ? [["up", "fish"], ["rod", "fish"], ["lower", "net"], ["lead", "fish"], ["lead", "net"], ["haul", "net"]]
  : ["rod", "pick", "lower", "lead", "haul", "in", "done"].flatMap((st) => [[st, "fish"], [st, "net"], [st, "head"]]);
for (const [st, k] of must) { const v = by[st] ? pct(by[st][k]) : null; check(v != null && v >= 85, `${st}: the ${k === "head" ? "angler" : k} in the picture ${v ?? "-"}% of the time (85% or more)`); }
check(!errors.length, errors.length ? `page errors: ${errors.slice(0, 2).join(" | ")}` : "no page errors");
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed"); process.exit(fails ? 1 : 0);
