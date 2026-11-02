// ---- panorama coverage check ----
// Asks a running FishDock which documented marks have a real Mapillary 360° photo nearby, before the photos are made
// public. It goes through FishDock's own /api/pano (with ?preview=1), so the Mapillary token stays in Cloudflare.
//   node tools/pano-coverage.mjs https://fishdock.aaron6k.workers.dev [ms between marks] [report.md]
// For each mark it reports the photo's distance, date and photographer, the Mapillary page to look at by eye, and
// whether the image can be used by the 3D view (it needs Mapillary's server to allow cross-origin use).
import { SPOTS } from "../src/data/spots.js";
import { EXTRA_MARKS } from "../server/place3d.js";

const base = (process.argv[2] || "http://localhost:8787").replace(/\/$/, "");
const gap = Number(process.argv[3]) || 400; // be gentle: each uncached mark is one Mapillary request
const reportFile = process.argv[4] || null;
const ids = [...new Set([...Object.keys(EXTRA_MARKS), ...SPOTS.map((s) => s.id)])];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
let photoOk = null;

for (const id of ids) {
  const r = await fetch(`${base}/api/pano?spot=${encodeURIComponent(id)}&preview=1`, { headers: { "x-fishdock": "1", accept: "application/json" } });
  const b = await r.json().catch(() => ({}));
  if (b.off === "not_configured") { console.log(`Stopped: ${b.message} (is MAPILLARY_TOKEN set on this site?)`); process.exit(1); }
  if (r.status === 200 && b.pano) {
    const p = b.pano;
    if (photoOk === null) {
      // one image is enough to know whether Mapillary's image server allows the 3D view to use its photos
      const img = await fetch(p.url, { headers: { origin: base } }).catch(() => null);
      photoOk = img ? { status: img.status, cors: img.headers.get("access-control-allow-origin"), type: img.headers.get("content-type") } : { status: "unreachable" };
    }
    rows.push({ id, metres: p.metres, taken: p.capturedAt ? new Date(p.capturedAt).toISOString().slice(0, 10) : "?", by: p.author, page: p.page, heading: p.heading, suitable: p.suitable, problems: p.problems || [] });
    console.log(`${p.suitable ? "GOOD " : "WEAK "}  ${id}: ${p.metres} m away, taken ${rows.at(-1).taken} by ${p.author}, facing ${Math.round(p.heading)}°${p.suitable ? "" : ` (${p.problems.join("; ")})`}  ${p.page}`);
  } else {
    rows.push({ id, metres: null });
    console.log(`none   ${id}: ${b.message || r.status}`);
  }
  await sleep(gap);
}
const have = rows.filter((x) => x.metres != null), good = have.filter((x) => x.suitable);
console.log(`\n${have.length} of ${rows.length} marks have a 360° photo within 250 m; ${good.length} pass every check (within 60 m, corrected position and direction, under 8 years old).`);
if (reportFile) {
  const { writeFileSync } = await import("node:fs");
  const md = [`# Real 360° photo coverage (${new Date().toISOString().slice(0, 10)})`, "", `${good.length} of ${rows.length} marks have a suitable photo. Look at each one before making photos public: the checks can't tell a road from a pier.`, "", "| Mark | Photo | Distance | Taken | Facing | Photographer | Checks |", "|---|---|---|---|---|---|---|",
    ...rows.map((r) => r.metres == null ? `| ${r.id} | none | | | | | |` : `| ${r.id} | [open](${r.page}) | ${r.metres} m | ${r.taken} | ${Math.round(r.heading)}° | ${r.by} | ${r.suitable ? "pass" : r.problems.join("; ")} |`)].join("\n");
  writeFileSync(reportFile, md + "\n"); console.log(`Written to ${reportFile}`);
}
console.log(`Within 60 m (likely taken at the mark itself): ${have.filter((x) => x.metres <= 60).length}.`);
console.log(`Older than five years: ${have.filter((x) => x.taken !== "?" && Date.now() - Date.parse(x.taken) > 5 * 365 * 864e5).length}.`);
if (photoOk) console.log(`Photo server check: HTTP ${photoOk.status}, cross-origin ${photoOk.cors ? `allowed (${photoOk.cors})` : "NOT allowed: the 3D view couldn't use these photos"}, ${photoOk.type || ""}`);
console.log("Look at each photo page before making them public: a 360° photo can be from a road nearby rather than the mark.");
