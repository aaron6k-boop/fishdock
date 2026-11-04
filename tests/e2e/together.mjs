// ---- together: two people in two browsers, one invite ----
// Proves that a friend who follows the host's invite link (or types the short code) really ends up in the same
// party, at the same place, and that both of them see each other, the join toast and the chat line, and text chat.
// Run against the local e2e server (which mounts the real server/party.js on an in-memory party store):
//   node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &   then   node tests/e2e/together.mjs http://localhost:8820
// Needs Playwright with Chromium (not an npm dependency of FishDock: it's found through NODE_PATH or a global install).
import { createRequire } from "node:module";

const base = (process.argv[2] || "http://localhost:8820").replace(/\/$/, "");
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here (set NODE_PATH to a folder that has it)"); process.exit(0); }

let fails = 0;
const ok = (cond, what, extra) => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}${!cond && extra !== undefined ? `  -> ${String(extra).slice(0, 300)}` : ""}`); if (!cond) fails++; };
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } if (Date.now() > end) return null; await new Promise((r) => setTimeout(r, 200)); } };
const POS = /"(lat|lon|lng|latitude|longitude|gps|coords|position)"\s*:/i;

// ---- one person: a browser context of their own (their own storage, as a separate phone) ----
// (each in a browser of its own, so one phone's 3D drawing in software never starves another's page)
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"];
async function person(label) {
  const browser = await chromium.launch({ args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, permissions: ["clipboard-read", "clipboard-write"] });
  // what the phone receives from the party, so the test can check nobody is ever sent a position
  await ctx.addInitScript(() => {
    window.__partyIn = [];
    const W = window.WebSocket;
    window.WebSocket = class extends W { constructor(...a) { super(...a); this.addEventListener("message", (e) => { if (typeof e.data === "string") window.__partyIn.push(e.data); }); } };
    // haptics: count the buzzes instead (no vibration motor here)
    window.__buzz = [];
    navigator.vibrate = (p) => { window.__buzz.push(p); return true; };
  });
  // only this site: map tiles and photos from elsewhere aren't needed (and may not be reachable)
  const own = new URL(base).host;
  await ctx.route("**/*", (r) => (new URL(r.request().url()).host === own ? r.continue() : r.abort()));
  ctx.setDefaultTimeout(12000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { browser, ctx, page, label, errors };
}
const names = (page) => page.$$eval(".party-person .t", (els) => els.map((e) => e.textContent));
const openSheet = async (page, tab) => {
  if (!(await page.$(".party-sheet.open"))) await page.click("button[aria-label^='Party: people']");
  await page.click(`.party-tabs button:has-text('${tab}')`);
};

async function main() {
  console.log(`Fish Together in two browsers against ${base}\n`);
  const A = await person("host"), B = await person("guest"), C = await person("code guest");
  try {
    // ---- the host starts a party ----
    await A.page.goto(`${base}/#together`);
    await A.page.click("text=Start a private party");
    await A.page.fill("input[placeholder='Shown above your angler']", "Alice");
    await A.page.fill("input[placeholder='e.g. Norfolk coast']", "Norfolk coast");
    await A.page.click("button:has-text('Start the party')");
    const code = await until(() => A.page.evaluate(() => (location.hash.match(/^#party\/([A-Z0-9]{6})/) || [])[1]));
    ok(!!code, "host starts a party and lands in it", await A.page.evaluate(() => location.hash));
    await until(() => A.page.$(".fs-top"));
    ok(!!(await A.page.$(".fs-top")), "host is in the fishing view");

    // ---- the obvious Invite a friend button ----
    const inviteBtn = await until(() => A.page.$("button.invite-btn"));
    ok(!!inviteBtn, "an Invite a friend button is on the fishing screen");
    // no navigator.share in desktop Chromium: the button falls back to copying the link
    await inviteBtn?.click();
    const copied = await until(async () => { const t = await A.page.evaluate(() => navigator.clipboard.readText()); return /#party\/[A-Z0-9]{6}\//.test(t) ? t : null; }, 5000);
    ok(!!copied, "without the share sheet, Invite a friend copies the link", copied);
    const shownCode = await until(() => A.page.$eval(".invite-code", (e) => e.textContent.replace(/\s/g, "")));
    ok(shownCode === code, "the short join code is shown big enough to read out", shownCode);
    // (if the button failed, carry on with the link the host's phone keeps, so the joining checks still run)
    const link = copied || (await A.page.evaluate((c) => { const p = JSON.parse(localStorage.getItem("fishdock.parties.v1") || "{}")[c]; return p ? `${location.origin}/#party/${c}/${p.secret}` : ""; }, code));
    ok(link.startsWith(base), "the link points at this site", link);

    // ---- the guest follows the link ----
    await B.page.goto(link);
    await until(() => B.page.$("text=Alice's party"));
    ok(!!(await B.page.$("text=Alice's party")), "the guest's link opens the host's party, not the start page", `${link} :: ${(await B.page.evaluate(() => document.body.innerText)).slice(0, 200)}`);
    ok(!!(await B.page.$("text=Norfolk coast")), "the guest sees the same place before joining");
    await B.page.fill("input[placeholder='Shown to the others']", "Bob");
    await B.page.click("button:has-text('Join the party')");
    await until(() => B.page.$(".fs-top"));
    ok(!!(await B.page.$(".fs-top")), "the guest is in the fishing view");
    const bHash = await B.page.evaluate(() => location.hash);
    ok(bHash === `#party/${code}`, "the guest is in the same party (and the secret left the address bar)", bHash);

    // ---- both see each other ----
    const joinToast = await until(() => A.page.$eval(".toasts, .fs-toasts, [class*='toast']", () => document.body.innerText.includes("Bob joined")), 8000);
    ok(!!joinToast, "the host is told \"Bob joined\"");
    const buzzed = await A.page.evaluate(() => window.__buzz.length);
    ok(buzzed > 0, "the host's phone gives a light buzz when Bob joins", buzzed);
    await openSheet(A.page, "People"); await openSheet(B.page, "People");
    const aSees = await until(async () => { const n = await names(A.page); return n.some((x) => x.startsWith("Bob")) ? n : null; });
    const bSees = await until(async () => { const n = await names(B.page); return n.some((x) => x.startsWith("Alice")) ? n : null; });
    ok(!!aSees, "the host's people list has Bob", aSees || (await names(A.page)));
    ok(!!bSees, "the guest's people list has Alice", bSees || (await names(B.page)));
    const same = await Promise.all([A.page, B.page].map((p) => p.evaluate(() => JSON.parse(localStorage.getItem("fishdock.parties.v1") || "{}"))));
    ok(Object.keys(same[0])[0] === Object.keys(same[1])[0], "both phones hold a membership of the same party code", JSON.stringify(same.map(Object.keys)));
    const anglers = await A.page.$eval(".fs-top", (e) => e.innerText);
    ok(/\b2\b/.test(anglers), "the host's top bar counts two anglers", anglers);

    // ---- chat: a line for the join, then messages both ways ----
    await openSheet(A.page, "Chat"); await openSheet(B.page, "Chat");
    const joinLine = await until(() => A.page.$eval("ol.chat", (e) => e.innerText.includes("Bob joined")));
    ok(!!joinLine, "the host's chat has a line saying Bob joined");
    await B.page.fill("input[aria-label='Message']", "Hello from Bob");
    await B.page.press("input[aria-label='Message']", "Enter");
    ok(!!(await until(() => A.page.$eval("ol.chat", (e) => e.innerText.includes("Hello from Bob")))), "Bob's message reaches Alice");
    await A.page.fill("input[aria-label='Message']", "Hi Bob, cast by the lamp post");
    await A.page.press("input[aria-label='Message']", "Enter");
    ok(!!(await until(() => B.page.$eval("ol.chat", (e) => e.innerText.includes("Hi Bob")))), "Alice's message reaches Bob");
    const long = "x".repeat(400);
    await B.page.evaluate((t) => { const i = document.querySelector("input[aria-label='Message']"); i.removeAttribute("maxlength"); }, long);
    await B.page.fill("input[aria-label='Message']", long);
    await B.page.press("input[aria-label='Message']", "Enter");
    const longest = await until(() => A.page.$$eval("ol.chat li", (els) => { const l = els.map((e) => (e.innerText.match(/x+/) || [""])[0].length); return Math.max(...l) || null; }));
    ok(longest && longest <= 200, "a long message is cut to 200 characters by the server", longest);

    // ---- a third person types the short code ----
    await C.page.goto(`${base}/#together`);
    await C.page.click("text=Join with an invite code");
    await C.page.fill("input.tg-code", code.toLowerCase());
    await C.page.click("button:has-text('Find the party')");
    await until(() => C.page.$("text=Alice's party"));
    ok(!!(await C.page.$("text=Alice's party")), "typing the code (in lower case) finds the same party");
    await C.page.fill("input[placeholder='Shown to the others']", "Cara");
    await C.page.click("button:has-text('Join the party')");
    ok(!!(await until(() => C.page.$(".fs-top"))), "the code guest is in the fishing view");
    ok(!!(await until(() => B.page.evaluate(() => document.body.innerText.includes("Cara joined")))), "Bob is told Cara joined too");

    // ---- leaving ----
    await openSheet(C.page, "People");
    await C.page.click("button:has-text('Leave the party')");
    ok(!!(await until(() => A.page.evaluate(() => document.body.innerText.includes("Cara left")))), "the host is told Cara left");

    // ---- mic: a refused microphone gets plain words ----
    await B.page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })); });
    await B.page.click("button.mic");
    const refused = await until(() => B.page.evaluate(() => (document.body.innerText.match(/microphone[^.]*(blocked|allow)[^.]*\./i) || [])[0]), 6000);
    ok(!!refused, "a refused microphone is explained in plain words", refused);

    // ---- privacy: nothing either phone received holds a position ----
    const got = (await Promise.all([A, B, C].map((p) => p.page.evaluate(() => window.__partyIn)))).flat();
    ok(got.length > 5 && !got.some((t) => POS.test(t)), `none of the ${got.length} messages the phones received holds a position`);
    for (const p of [A, B, C]) {
      const bad = p.errors.filter((e) => !/WebGL|GPU|swiftshader|favicon|404|Failed to load resource/i.test(e));
      ok(!bad.length, `no script errors on the ${p.label}'s phone`, bad.join(" | "));
    }
  } catch (e) {
    ok(false, "the run finished", e.stack);
  } finally {
    for (const p of [A, B, C]) await p.browser.close();
  }
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
}
main();
