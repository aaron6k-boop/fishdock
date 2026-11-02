// ---- people: how each angler looks (pure; tests) ----
// Everyone in the 3D view is a person you can tell apart: their jacket (the "outfit" parties already share), skin
// tone, hair, hat, beard and build. You choose your own (saved on this phone, and shared with a party you join); anyone
// who hasn't chosen gets a steady look from their id, so they look the same on every phone and every visit. Nothing
// here is about the real person: it's a figure in a simulation.

export const SKINS = [
  { hex: 0xe9bc9c, name: "Very light" }, { hex: 0xd8a682, name: "Light" }, { hex: 0xc99a74, name: "Medium" },
  { hex: 0xa8764f, name: "Tan" }, { hex: 0x7f5336, name: "Brown" }, { hex: 0x553524, name: "Dark brown" },
];
export const HAIRS = [
  { hex: 0x231a15, name: "Black" }, { hex: 0x4a3223, name: "Dark brown" }, { hex: 0x7b5635, name: "Light brown" },
  { hex: 0xb38d55, name: "Fair" }, { hex: 0x8e3f1f, name: "Red" }, { hex: 0x9c9a96, name: "Grey" },
];
export const HATS = ["Beanie", "Cap", "Bucket hat", "No hat"];
export const BEARDS = ["None", "Stubble", "Beard"];
export const BUILDS = ["Slim", "Medium", "Broad"];
export const LOOK_KEYS = { skin: SKINS.length, hair: HAIRS.length, hat: HATS.length, beard: BEARDS.length, build: BUILDS.length };

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** A look with every field a whole number in range, or null when there's nothing usable. */
export function cleanLook(v) {
  if (!v || typeof v !== "object") return null;
  const out = {};
  for (const [k, n] of Object.entries(LOOK_KEYS)) { const x = Number(v[k]); if (!Number.isInteger(x) || x < 0 || x >= n) return null; out[k] = x; }
  return out;
}

/**
 * The look to draw: the chosen one, or a steady one from the id. Adds what the figure needs: colours, a height (1.68 to
 * 1.86 m, steady per person) and a seed for small differences (how often they blink, which way they glance).
 */
export function lookFor(id = "", chosen = null) {
  const c = cleanLook(chosen), h = hash(String(id || "angler")), pick = (n, s) => Math.floor(((h >>> s) & 1023) / 1024 * n);
  const base = c || { skin: pick(SKINS.length, 0), hair: pick(HAIRS.length, 3), hat: pick(3, 6), beard: pick(10, 9) < 6 ? 0 : pick(10, 9) < 8 ? 1 : 2, build: pick(BUILDS.length, 12) };
  const height = 1.68 + (((h >>> 16) & 255) / 255) * 0.18;
  return { ...base, chosen: !!c, height, seed: h, skinHex: SKINS[base.skin].hex, hairHex: HAIRS[base.hair].hex };
}

// ---- saved on this phone ----
const KEY = "fishdock.look";
/** Your saved look ({ outfit, skin, hair, hat, beard, build }), or null. */
export function savedLook() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); const l = cleanLook(v); return l ? { ...l, outfit: Number.isInteger(v.outfit) ? ((v.outfit % 5) + 5) % 5 : 0 } : null; } catch { return null; }
}
export function saveLook(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private browsing: just this visit */ } }
