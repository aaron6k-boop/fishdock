// ---- asset-library: the game's asset library, written out from what's actually in the repo ----
// Reads the licence register (source-assets/ASSET-LICENCES.json: every third-party asset's source, licence, attribution
// and the original files with their hashes) and measures the game-ready files the game loads (public/models/*.glb,
// public/textures/*): bytes, triangles, embedded textures and their sizes. Writes docs/ASSET-LIBRARY.md. Run it after
// adding or changing an asset; the numbers are measured, never typed in.
//   node tools/asset-library.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

// ---- image sizes from their headers (JPEG, PNG, WebP), no decoding ----
export function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i < buf.length - 9;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc3) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), type: "jpeg" };
      i += 2 + len;
    }
    return null;
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const k = buf.toString("ascii", 12, 16);
    if (k === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, type: "webp" };
    if (k === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, type: "webp" }; }
    if (k === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), type: "webp" };
  }
  return null;
}

// ---- a GLB's contents: triangles per mesh, embedded images with their sizes, animations ----
export function glbStats(buf) {
  const jsonLen = buf.readUInt32LE(12), j = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  let tris = 0; const meshes = [];
  for (const m of j.meshes || []) { let t = 0; for (const p of m.primitives) { const a = p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count; t += Math.floor(a / 3); } tris += t; meshes.push({ name: m.name, tris: t }); }
  const images = (j.images || []).map((im) => { if (im.bufferView == null) return { name: im.name || im.uri, size: null }; const bv = j.bufferViews[im.bufferView], s = binStart + (bv.byteOffset || 0); const sz = imageSize(buf.subarray(s, s + bv.byteLength)); return { name: im.name || "", w: sz?.w, h: sz?.h, type: sz?.type || im.mimeType, bytes: bv.byteLength }; });
  return { tris, meshes, images, anims: (j.animations || []).map((a) => a.name), skins: (j.skins || []).length };
}

// what each game file is for, and when it's drawn (the LOD the game uses for it)
const USE = {
  "fp_rig.glb": ["Your arms, hands and jacket in first person, skeleton and clips", "close (first person), one level"],
  "rodkit.glb": ["The rod (handle, seat, guides, blank) and the spinning reel", "close; the 3D view hides it past a few metres"],
  "reel.glb": ["The reel, older single model", "close"],
  "nets.glb": ["Drop net and landing net", "close to mid"],
  "fish.glb": ["Fish bodies, fins and eyes", "close (in the hand) to mid (in the water)"],
  "pierprops.glb": ["Lamps, lifebuoy stations, bollards, benches", "all distances, instanced along the pier"],
};

export function build() {
  const reg = JSON.parse(readFileSync(join(ROOT, "source-assets/ASSET-LICENCES.json"), "utf8"));
  const out = [];
  out.push("# FishDock asset library", "", "Written by `node tools/asset-library.mjs` from the licence register (`source-assets/ASSET-LICENCES.json`) and the game-ready", "files themselves: every number here is measured from the file. Run it again after adding or changing an asset.", "", "Licences are as recorded in the register when each asset was downloaded; anything new is checked asset by asset before", "it goes in (an asset site's other assets may be under other terms).", "");
  out.push("## Game-ready models (`public/models/`)", "", "| File | What | Drawn | Size | Triangles | Textures inside | Animations |", "|---|---|---|---|---|---|---|");
  const md = join(ROOT, "public/models");
  for (const f of readdirSync(md).filter((x) => x.endsWith(".glb")).sort()) {
    const buf = readFileSync(join(md, f)), s = glbStats(buf), [what, lod] = USE[f] || ["", ""];
    const tex = s.images.length ? s.images.map((i) => (i.w ? `${i.w}x${i.h}` : "?")).join(", ") : "none";
    out.push(`| ${f} | ${what} | ${lod} | ${kb(buf.length)} | ${s.tris.toLocaleString("en-GB")} | ${tex} | ${s.anims.length ? s.anims.length : "none"} |`);
  }
  out.push("", "## Game-ready textures (`public/textures/`)", "", "| File | Size | Pixels | Format |", "|---|---|---|---|");
  const td = join(ROOT, "public/textures");
  for (const f of readdirSync(td).filter((x) => /\.(jpe?g|png|webp)$/i.test(x)).sort()) {
    const buf = readFileSync(join(td, f)), sz = imageSize(buf);
    out.push(`| ${f} | ${kb(statSync(join(td, f)).size)} | ${sz ? `${sz.w}x${sz.h}` : "?"} | ${sz?.type || "?"} |`);
  }
  out.push("", "## Third-party sources (the licence register)", "", "| Asset | Author | Source | Licence | Attribution | Used for | Original files kept |", "|---|---|---|---|---|---|---|");
  for (const a of reg.assets) out.push(`| ${a.name} | ${a.author || ""} | ${a.source} | ${a.licence} | ${a.attribution || ""} | ${a.use || ""} | ${(a.files || []).map((x) => `\`${x.file.split("/").pop()}\` (${kb(x.bytes)})`).join(", ")} |`);
  out.push("", "Made for FishDock in Blender (no outside assets): the rod kit, the reel, the nets' frames, the fish bodies, the bench,", "bollard and lifebuoy housing; their scripts and sources are in `source-assets/blender/`. Attribution owed under CC BY-SA", "(the Gorleston photographs) is given in the app and in `public/models/CREDITS.txt`.", "");
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(ROOT, "docs/ASSET-LIBRARY.md"), build() + "\n");
  console.log("docs/ASSET-LIBRARY.md written");
}
