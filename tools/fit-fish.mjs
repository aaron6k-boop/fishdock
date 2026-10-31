// ---- fit-fish: turns supplied fish pictures into FishDock's two sizes ----
// node tools/fit-fish.mjs <species id> [picture] [--cutout cutout.png] [--y 0.5] [--keep 0.98] [--crop WxH+X+Y]
//   picture   the full picture with its background: becomes public/fish/<id>.webp, 1200 x 800, for the fish's page
//             (and the small one too, cropped in closer, unless a cutout is given)
//   --cutout  the fish cut out on a transparent background: becomes public/fish/<id>-s.webp, 480 x 320, for lists
//   --crop    take only this part of the picture first (for one tile of a sheet)
//   --y       where the fish sits, top to bottom (0 to 1), when the picture is cropped to 3:2
// A picture wider than 3:2 is kept whole over a blurred copy of itself instead of losing its head or tail.
// Needs ImageMagick (convert, identify). Then add the id to ART_IDS in src/data/fishart.js.
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SPECIES } from "../src/data/species.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const cutout = flag("--cutout"), cyArg = flag("--y"), keepArg = flag("--keep"), pre = flag("--crop");
const [id, src] = args;
if (!SPECIES.some((s) => s.id === id) || (!src && !cutout)) { console.error("Usage: node tools/fit-fish.mjs <species id> [picture] [--cutout png] [--y 0.5] [--keep 0.98] [--crop WxH+X+Y]"); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fish");
const made = [];

if (src) {
  const input = pre ? [src, "-crop", pre, "+repage"] : [src];
  const [w, h] = (pre ? pre.split(/[x+]/).slice(0, 2) : execFileSync("identify", ["-format", "%w %h", src]).toString().split(" ")).map(Number);
  const cy = (cyArg ? Number(cyArg) : 0.5) * h;
  const crop = (cw) => {
    const ch = Math.min(h, Math.round((cw * 2) / 3)), cwFit = Math.round((ch * 3) / 2);
    const y = Math.round(Math.max(0, Math.min(h - ch, cy - ch / 2))), x = Math.round((w - cwFit) / 2);
    return `${cwFit}x${ch}+${x}+${y}`;
  };
  const wide = w / h > 1.52;
  const fit = (size, q, file, keep) => {
    const [fw, fh] = size.split("x").map(Number);
    // the sharp picture's top and bottom edges fade into the blur, so there's no hard line
    const ph = Math.round((fw * h) / w), band = Math.round(ph * 0.16);
    const steps = wide
      ? ["(", "-clone", "0", "-resize", `${fw}x${fh}^`, "-gravity", "center", "-extent", size, "-blur", "0x24", "-brightness-contrast", "-18x-10", ")",
        "(", "-clone", "0", "-filter", "Lanczos", "-resize", `${fw}x${ph}!`,
        "(", "-size", `${fw}x${band}`, "gradient:black-white", "-size", `${fw}x${ph - band * 2}`, "xc:white", "-size", `${fw}x${band}`, "gradient:white-black", "-append", ")",
        "-alpha", "off", "-compose", "CopyOpacity", "-composite", ")", "-delete", "0", "-compose", "over", "-gravity", "center", "-composite"]
      : ["-crop", crop(Math.round(w * keep)), "+repage", "-filter", "Lanczos", "-resize", `${size}!`];
    execFileSync("convert", [...input, ...steps, "-strip", "-quality", String(q), join(out, file)]);
    made.push(file);
  };
  fit("1200x800", 86, `${id}.webp`, 1);
  if (!cutout) fit("480x320", 84, `${id}-s.webp`, keepArg ? Number(keepArg) : 0.98);
}
if (cutout) {
  // the cut-out fish, centred with a little room round it, on a transparent 3:2 canvas
  execFileSync("convert", [cutout, "-background", "none", "-gravity", "center", "-filter", "Lanczos", "-resize", "452x292", "-extent", "480x320", "-strip", "-quality", "86", "-define", "webp:alpha-quality=95", join(out, `${id}-s.webp`)]);
  made.push(`${id}-s.webp`);
}
console.log(`public/fish/: ${made.join(", ")}`);
