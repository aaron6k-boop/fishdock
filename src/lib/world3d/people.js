// ---- people: how each angler looks (pure; tests) ----
// Everyone in the 3D view is a person you can tell apart. Since November 2026 each angler is one of a set of realistic
// people (PEOPLE: licensed 3D models from Microsoft Rocketbox, MIT licence, credited in public/people/CREDITS.txt),
// men and women of different ages and skin tones, dressed for the coast: a jacket and trousers in the colour you like,
// wellies or their own boots, a hat, a life jacket and gloves if you want them. You choose your own (saved on this
// phone, and shared with a party you join); anyone who hasn't chosen gets a steady look from their id, so they look the
// same on every phone and every visit. Nothing here is about the real person: it's a figure in a simulation.
//
// The older fields (skin, hair, beard, build) still describe the simple drawn figure shown while a person's model
// loads, or if it can't; parties keep sharing them so older copies of the app still show something sensible.

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

// ---- the realistic people (public/people/<file>.glb, a portrait in <file>.webp) ----
// sex picks the matching walk (men's and women's motion capture); skin and hair say what the simple stand-in figure
// looks like while the model loads; hem is the height of the jacket's hem as a share of their height (where the jacket
// colour stops and the trousers start)
export const PEOPLE = [
  { file: "gardener", sex: "m", name: "Man, stubble", skin: 1, hair: 2, beard: 1, hem: 0.5 },
  { file: "m05", sex: "m", name: "Man, short hair", skin: 0, hair: 1, beard: 1, hem: 0.5 },
  { file: "m03", sex: "m", name: "Older man, grey hair", skin: 1, hair: 5, beard: 0, hem: 0.47 },
  { file: "m04", sex: "m", name: "Man, curly hair", skin: 5, hair: 0, beard: 1, hem: 0.52 },
  { file: "m18", sex: "m", name: "Man, hoodie", skin: 5, hair: 0, beard: 0, hem: 0.5 },
  { file: "m12", sex: "m", name: "Man, denim jacket", skin: 5, hair: 0, beard: 0, hem: 0.52 },
  { file: "m10", sex: "m", name: "Man, black hair", skin: 2, hair: 0, beard: 0, hem: 0.52 },
  { file: "m17", sex: "m", name: "Man, beard", skin: 3, hair: 0, beard: 2, hem: 0.5 },
  { file: "f04", sex: "f", name: "Woman, fair hair", skin: 0, hair: 3, beard: 0, hem: 0.53 },
  { file: "f07", sex: "f", name: "Woman, dark hair", skin: 1, hair: 1, beard: 0, hem: 0.52 },
  { file: "f09", sex: "f", name: "Woman, hair tied back", skin: 1, hair: 2, beard: 0, hem: 0.5 },
  { file: "f14", sex: "f", name: "Woman, brown hair", skin: 1, hair: 1, beard: 0, hem: 0.52 },
];
// clothing colours: the first keeps the jacket or trousers as they come (the model's own fabric, unrecoloured)
export const COATS = [
  { hex: null, name: "As they come" }, { hex: 0x1d3150, name: "Navy" }, { hex: 0x3d4a2c, name: "Olive" }, { hex: 0x2e5e4e, name: "Bottle green" },
  { hex: 0xb3302a, name: "Red" }, { hex: 0xe0b522, name: "Yellow" }, { hex: 0xd9662a, name: "Orange" }, { hex: 0x2a2c2f, name: "Black" },
];
export const LEGS = [
  { hex: null, name: "As they come" }, { hex: 0x24262a, name: "Black" }, { hex: 0x2b3446, name: "Navy" }, { hex: 0x3f4632, name: "Olive" },
  { hex: 0x5b5e60, name: "Grey" }, { hex: 0x5a4632, name: "Brown" },
];
export const FOOTWEAR = [
  { hex: null, name: "Their own boots" }, { hex: 0x2f4a2c, name: "Green wellies" }, { hex: 0x1d2023, name: "Black wellies" }, { hex: 0x22324d, name: "Navy wellies" },
];
export const LIFE = ["No life jacket", "Life jacket"];
export const GLOVES = ["No gloves", "Gloves"];
export const KIT_KEYS = { person: PEOPLE.length, coat: COATS.length, legs: LEGS.length, boots: FOOTWEAR.length, life: LIFE.length, gloves: GLOVES.length };

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** A look with every field a whole number in range, or null when there's nothing usable. */
export function cleanLook(v) {
  if (!v || typeof v !== "object") return null;
  const out = {};
  for (const [k, n] of Object.entries(LOOK_KEYS)) { const x = Number(v[k]); if (!Number.isInteger(x) || x < 0 || x >= n) return null; out[k] = x; }
  // the person and their kit: each kept if it's valid, left out otherwise (older copies of the app don't send them)
  for (const [k, n] of Object.entries(KIT_KEYS)) { if (v[k] == null) continue; const x = Number(v[k]); if (Number.isInteger(x) && x >= 0 && x < n) out[k] = x; }
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
  // their person and kit: chosen, or steady from the id (no life jacket or gloves unless chosen)
  const h2 = hash(String(id || "angler") + "/kit"), pk = (n, s) => Math.floor(((h2 >>> s) & 1023) / 1024 * n);
  const kit = {
    person: c?.person ?? pk(PEOPLE.length, 0), coat: c?.coat ?? 1 + pk(COATS.length - 1, 5), legs: c?.legs ?? pk(LEGS.length, 10),
    boots: c?.boots ?? pk(FOOTWEAR.length, 15), life: c?.life ?? 0, gloves: c?.gloves ?? 0,
  };
  const P = PEOPLE[kit.person];
  return { ...base, ...kit, chosen: !!c, height, seed: h, skinHex: SKINS[base.skin].hex, hairHex: HAIRS[base.hair].hex, file: P.file, sex: P.sex, hem: P.hem };
}

/** A person's own look for the simple stand-in figure (their skin, hair and beard), keeping everything else. */
export function withPerson(v, person) {
  const P = PEOPLE[person]; if (!P) return v;
  return { ...v, person, skin: P.skin, hair: P.hair, beard: P.beard };
}

// ---- saved on this phone ----
const KEY = "fishdock.look";
/** Your saved look ({ outfit, skin, hair, hat, beard, build, and the person and kit }), or null. */
export function savedLook() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); const l = cleanLook(v); return l ? { ...l, outfit: Number.isInteger(v.outfit) ? ((v.outfit % 5) + 5) % 5 : 0 } : null; } catch { return null; }
}
export function saveLook(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private browsing: just this visit */ } }
