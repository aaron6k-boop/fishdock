// ---- baitphotos: a real photo of each stock bait, from Wikimedia Commons, with its credit ----
// Chosen by hand and checked on 31 October 2026; every one CC0, public domain, CC BY or CC BY-SA, credited under
// the large photo and in Settings, Bait photo credits. Loaded like the fish photos (photos.js): Wikimedia's
// standard sizes, no referrer, kept offline by the service worker once seen. Casters have no free photo yet, so
// they keep their drawn icon. The sprat is a public-domain 1876 illustration, not a photo.
import { photoUrl, photoSrcSet, filePage, licenceUrl } from "./photos.js";

export const BAIT_PHOTOS_CHECKED = "2026-10-31";
const P = (file, path, w, h, author, licence) => ({ file, path, w, h, author, licence });

export const BAIT_PHOTOS = {
  ragworm: P("Alitta_virens_183680100.jpg", "0/0c", 2048, 1367, "Klaus Kevin Kristensen", "CC BY 4.0"),
  lugworm: P("Arenicola_marina.JPG", "e/eb", 2335, 1316, "Auguste Le Roux", "CC BY 3.0"),
  "peeler-crab": P("Carcinus_maenas.jpg", "1/17", 2563, 1924, "Hans Hillewaert", "CC BY-SA 4.0"),
  squid: P("Loligo_vulgaris.jpg", "d/dd", 2400, 1800, "Hans Hillewaert", "CC BY-SA 4.0"),
  "mackerel-strip": P("Scomber_scombrus_Northern_Ireland.jpg", "e/e8", 640, 479, "Kenneth Allen", "CC BY-SA 2.0"),
  sandeel: P("Sand_eels_-_geograph.org.uk_-_1468894.jpg", "b/b9", 640, 462, "Rod Allday", "CC BY-SA 2.0"),
  "razor-clam": P("Ensis_siliqua-H.jpg", "2/26", 400, 155, "Jan Johan ter Poorten, edited by Tom Meijer", "CC BY-SA 3.0"),
  mussel: P("Miesmuscheln_Mytilus_1.jpg", "0/0c", 800, 731, "Darkone", "CC BY-SA 2.0"),
  prawn: P("Prawn_raw_cleaned_2021b.jpg", "e/e0", 6944, 9248, "Vis M", "CC BY-SA 4.0"),
  maggots: P("Maggots,_London_Zoo,_London.jpg", "b/b1", 4000, 2248, "Cory Doctorow", "CC BY-SA 2.0"),
  worms: P("Lumbricus_terrestris_(26559560801).jpg", "9/9c", 5472, 3648, "Donald Hobern", "CC BY 2.0"),
  sweetcorn: P("Sweet_Corns.jpg", "e/e1", 2481, 1737, "HitroMilanese", "CC BY-SA 3.0"),
  bread: P("White_bread_800.jpg", "f/f3", 800, 500, "Sannse", "CC BY-SA 3.0"),
  boilies: P("Boilies.jpg", "0/09", 443, 332, "Bastet", "CC BY-SA 4.0"),
  pellets: P("Fish_Feed_Pellets.jpg", "a/a1", 3264, 2448, "Narek75", "CC BY-SA 4.0"),
  "luncheon-meat": P("Spam_Treet_and_Great_Value_Luncheon_Meat.jpg", "7/7e", 3414, 1984, "Ll1324", "CC0"),
  deadbait: P("Sprattus_sprattus_Gervais.jpg", "1/1a", 1100, 438, "Gervais and Boulart (1876 illustration)", "Public domain"),
  lures: P("Bluefox_Vibrotail_jig_fishing_lure_29_gr.jpg", "1/1c", 3321, 1326, "R. Henrik Nilsson", "CC BY 4.0"),
  flies: P("Durham_Ranger_salmon_fly.jpg", "6/63", 3504, 2336, "MichaelMaggs", "CC BY-SA 3.0"),
};

// A species' own bait wording, matched to the nearest stock bait's photo (lures, crab, oily fish and so on).
const WORDS = [
  [/fly|flies|nymph|buzzer/i, "flies"], [/lure|plastic|shad|spinner|jig|plug|sabiki|feather|jellyworm|artificial eel/i, "lures"],
  [/crab/i, "peeler-crab"], [/squid|calamari/i, "squid"], [/sandeel/i, "sandeel"], [/mackerel|bluey|herring|oily/i, "mackerel-strip"],
  [/sprat|smelt|sardine|deadbait|roach|trout|lamprey|fish (bait|head)/i, "deadbait"], [/razor|clam/i, "razor-clam"],
  [/mussel|cockle|limpet/i, "mussel"], [/prawn|shrimp/i, "prawn"], [/\brag/i, "ragworm"], [/\blug/i, "lugworm"],
  [/maggot/i, "maggots"], [/corn/i, "sweetcorn"], [/bread|flake|crust/i, "bread"], [/boilie/i, "boilies"], [/pellet/i, "pellets"],
  [/luncheon|meat/i, "luncheon-meat"], [/worm/i, "worms"],
];
/** The photo for a bait: by its stock id, else by its wording; null when nothing fits (beads, sequins, paste). */
export function baitPhotoFor(b) {
  if (b?.id && BAIT_PHOTOS[b.id]) return BAIT_PHOTOS[b.id];
  if (b?.id && !BAIT_PHOTOS[b.id] && !/fly|lure/.test(b.id)) return null;
  const hit = WORDS.find(([re]) => re.test(b?.name || ""));
  return hit ? BAIT_PHOTOS[hit[1]] : null;
}
export { photoUrl, photoSrcSet, filePage, licenceUrl };
