// ---- smoke-play: the whole game loop for the new anglers, before filming on a real graphics card ----
// Walking about, then the scripted catch (cast, bite, playing the fish, the drop net, hauling it up), for the man and
// the woman in third and first person, against the film build served locally (FISHDOCK_FILM=1 node tools/build.mjs,
// then node tests/e2e/server.mjs 8866 --dist). Rendering is SwiftShader and only every 20th tick, so it checks that
// nothing throws and the catch gets all the way through, not how it looks. Exit code 1 if any run fails.
//   node tools/smoke-play.mjs
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright");
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const L = (person, build, beard, hat = 3) => JSON.stringify({ skin: 0, hair: 1, hat, beard, build, person, coat: 0, legs: 0, boots: 0, life: 0, gloves: 0, glasses: 1, torch: 1 });
const runs = [["man third", L(19, 1, 2), "third"], ["woman third", L(20, 0, 0, 1), "third"], ["man first", L(19, 2, 2, 0), "first"], ["woman first", L(20, 2, 0), "first"]];
let bad = 0;
for (const [name, look, cam] of runs) {
  const ctx = await b.newContext({ viewport: { width: 160, height: 120 } });
  await ctx.addInitScript(([look, cam]) => { window.__fdFilm = true; localStorage.setItem("fishdock.playerName", "Aaron"); localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "low", fishCam: cam, fps2: false })); localStorage.setItem("fishdock.look", look); }, [look, cam]);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:8866/#play/gorleston-south-pier");
  await page.waitForFunction(() => window.__fdWorld && window.__fdWorld.play && window.__fdProbe && window.__fdProbe.head, null, { timeout: 600000, polling: 2000 });
  await page.evaluate(() => window.__fdWorld.freeze());
  const walk = await page.evaluate(() => { const W = window.__fdWorld, out = []; const f0 = window.__fdProbe.feet.slice(); const btn = [...document.querySelectorAll("button")].find((x) => /Walk about/.test(x.getAttribute("aria-label") || "")); if (!btn) return ["no walk button"]; btn.click(); return ["clicked", f0]; });
  await page.waitForTimeout(500);
  const w2 = await page.evaluate(() => { const W = window.__fdWorld, out = []; try { for (let i = 0; i < 6; i++) { W.walkInput(0, 1); W.step(500); } W.walkInput(0, 0); W.step(500); } catch (e) { out.push("walk error: " + e.message + " " + (e.stack || "").slice(0, 500)); } out.push("feet " + window.__fdProbe.feet.map((v) => v.toFixed(2)).join(",")); return out; });
  await page.keyboard.press("e"); await page.waitForTimeout(500);
  const r = await page.evaluate(() => { const W = window.__fdWorld; const out = []; try { W.play([["cast", -0.05], ["hooked", 6], ["catch", 24, { species: "bass", lengthCm: 58 }]], { species: "bass", lengthCm: 58 }); } catch (e) { out.push("play: " + e.message); }
    const seen = new Set(); for (let i = 0; i < 34; i++) { try { W.step(1000); seen.add(window.__fdProbe.stage); } catch (e) { out.push("step " + i + ": " + e.message + " " + (e.stack || "").slice(0, 700)); break; } }
    out.push("stages " + [...seen].join(" ")); return out; });
  const ok = !errs.length && !r.some((x) => /error|step \d|play:/.test(x)) && !w2.some((x) => /error/.test(x)) && /haul|in|done/.test(r[r.length - 1]);
  if (!ok) bad++;
  console.log(ok ? "OK  " : "FAIL", name, "|", walk[0], "|", w2.join(" "), "|", r.join(" | "), errs.length ? "| page errors: " + [...new Set(errs)].join("; ").slice(0, 600) : "");
  await ctx.close();
}
await b.close(); process.exit(bad ? 1 : 0);
