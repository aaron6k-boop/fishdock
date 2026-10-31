// ---- photos: one real photo of each species, from Wikimedia Commons, with its credit ----
// Chosen by hand and checked on 31 October 2026. Most are the species' lead photo on English Wikipedia; the
// smooth-hound (no lead photo), garfish, grayling and zander were swapped for clearer photos of a live fish.
// Every one is CC0, public domain, CC BY or CC BY-SA (the same rule the server's /api/fishinfo uses), and every one
// is credited: under the large photo, and in Settings, Fish photo credits.
// The phone loads them straight from upload.wikimedia.org at Wikimedia's standard sizes, with no referrer, and the
// service worker keeps the ones already seen for use offline. If a photo can't load, the illustration shows instead.
// They are pictures of the species, not identification guides: a fish can look quite different at different sizes.

export const PHOTO_SOURCE = { name: "Wikimedia Commons", url: "https://commons.wikimedia.org/", checked: "2026-10-31" };

// file: the Commons file name; path: its folder on upload.wikimedia.org; w, h: the original's size in pixels
const P = (file, path, w, h, author, licence) => ({ file, path, w, h, author, licence });

export const PHOTOS = {
  bass: P("Sealife,_Bray,_Ireland._(6985874908).jpg", "7/70", 4912, 3264, "Miguel Mendez", "CC BY 2.0"),
  cod: P("Atlantic_Cod,_Atlantischer_Kabeljau_(Gadus_morhua).jpg", "7/77", 3400, 2268, "Wilhelm Thomas Fiege", "CC BY-SA 4.0"),
  whiting: P("Wijting002.jpg", "2/2a", 2196, 1347, "Georges Jansoone (JoJan)", "CC BY 3.0"),
  flounder: P("Platichthys_flesus_1.jpg", "2/22", 3400, 2550, "Hans Hillewaert", "CC BY-SA 4.0"),
  plaice: P("Pleuronectes_platessa.jpg", "9/95", 1024, 771, "Hans Hillewaert", "CC BY-SA 4.0"),
  dab: P("Limanda_limanda.jpg", "9/9c", 1024, 771, "Hans Hillewaert", "CC BY-SA 4.0"),
  sole: P("Solea_solea_1.jpg", "c/cd", 3106, 2330, "Hans Hillewaert", "CC BY-SA 4.0"),
  mackerel: P("Scomber_scombrus_217326414.jpg", "7/7f", 2048, 1366, "Mikael Nyman", "CC BY 4.0"),
  pollack: P("Pollachius_pollachius_aquarium.jpg", "8/8e", 1000, 664, "Citron", "CC BY-SA 3.0"),
  coalfish: P("Pollachius_virens_01.jpg", "a/aa", 3028, 2002, "Tino Strauss", "CC BY-SA 3.0"),
  "ballan-wrasse": P("Maragota_(Labrus_bergylta),_isla_de_Mouro,_Santander,_España,_2019-08-15,_DD_55.jpg", "a/a9", 3825, 2550, "Diego Delso", "CC BY-SA 4.0"),
  "thornback-ray": P("Raja_clavata_(juv).jpg", "3/36", 3446, 2585, "Hans Hillewaert", "CC BY-SA 4.0"),
  smoothhound: P("Mustelus_mustelus.001_-_Aquarium_Finisterrae.jpg", "5/57", 6000, 4000, "Fernando Losada Rodríguez", "CC BY-SA 4.0"),
  "lesser-spotted-dogfish": P("Scyliorhinus_canicula.jpg", "d/d0", 3200, 2400, "Hans Hillewaert", "CC BY-SA 4.0"),
  tope: P("Galeorhinus_galeus_SI3.jpg", "7/7f", 640, 436, "D Ross Robertson", "Public domain"),
  conger: P("European_conger.jpg", "e/e5", 3072, 2304, "West Brom 4ever", "Public domain"),
  "black-bream": P("Chopa_(Spondyliosoma_cantharus),_Parque_natural_de_la_Arrábida,_Portugal,_2020-07-21,_DD_57.jpg", "a/ae", 2849, 1899, "Diego Delso", "CC BY-SA 4.0"),
  "thick-lipped-mullet": P("Chelon_labrosus.jpg", "d/d6", 640, 480, "Roberto Pillon", "CC BY 3.0"),
  garfish: P("Belone_belone_-_Garfish_(cropped).jpg", "0/0c", 2932, 1588, "Zeynel Cebeci", "CC BY-SA 4.0"),
  gurnard: P("Chelidonichthys_lucernus_1_Luc_viatour.jpg", "6/6d", 3528, 2086, "Luc Viatour", "CC BY-SA 3.0"),
  pouting: P("Faneca_(Trisopterus_luscus),_Parque_natural_de_la_Arrábida,_Portugal,_2022-07-29,_DD_43.jpg", "2/2b", 6630, 3245, "Diego Delso", "CC BY-SA 4.0"),
  carp: P("Cyprinus_carpio_2008_G1_(cropped).jpg", "3/3b", 3232, 1600, "George Chernilevsky", "CC BY-SA 3.0"),
  roach: P("Rutilus_rutilus_by_Algirdas_cropped.jpg", "d/dd", 1306, 653, "Algirdas, cropped by George Chernilevsky", "CC BY-SA 3.0"),
  bream: P("Carp_bream1.jpg", "f/fb", 1500, 948, "Natalia Mikova (Микова Наталия)", "Public domain"),
  perch: P("Perca_fluviatilis_-_Perche_commune_-_European_perch_(cropped).jpg", "1/1f", 4060, 2954, "Gilles San Martin", "CC BY-SA 2.0"),
  pike: P("Esox_lucius_ZOO_1.jpg", "9/93", 2048, 1536, "Jik jik", "CC BY-SA 3.0"),
  tench: P("Tinca_tinca_Natural_History_Museum_University_of_Pisa.jpg", "4/42", 4802, 3200, "Mattia Nocciola", "CC BY-SA 4.0"),
  barbel: P("Barbel.jpg", "8/81", 700, 303, "Neil Phillips", "CC BY 2.0"),
  chub: P("Squalius_cephalus_Prague_Vltava_2.jpg", "1/18", 3000, 1827, "Karelj", "Public domain"),
  rudd: P("Scardinius_erythropthalmus_2009_G1.jpg", "4/41", 2400, 1000, "George Chernilevsky", "Public domain"),
  zander: P("Hal_-_Sander_lucioperca_-_1.jpg", "2/28", 3003, 2252, "Emőke Dénes", "CC BY-SA 4.0"),
  "brown-trout": P("Brown_Trout_(Salmo_trutta)_(53678765394).jpg", "2/27", 6256, 2168, "USFWS Mountain Prairie", "Public domain"),
  "rainbow-trout": P("Close_up_of_rainbow_trout_fish_underwater_oncorhynchus_mykiss.jpg", "c/c1", 2100, 1500, "Eric Engbretson, U.S. Fish and Wildlife Service", "Public domain"),
  grayling: P("Thymallus_thymallus2_(cropped).jpg", "b/b1", 2739, 2008, "Gilles San Martin", "CC BY-SA 2.0"),
  eel: P("Anguilla_anguilla.jpg", "5/58", 400, 265, "GerardM", "CC BY-SA 3.0"),
  dace: P("Leuciscus_leuciscus.jpg", "f/f1", 850, 417, "Alexander Suvorov", "Public domain"),
  salmon: P("Wst_atlantischer_lachs_stoer_001.jpg", "8/82", 850, 297, "Wolfgang Striewski", "Public domain"),
  "sea-trout": P("Wst_meerforelle_stoer_001.jpg", "8/8a", 850, 351, "Wolfgang Striewski", "Public domain"),
  "crucian-carp": P("CarassiusCarassius8.JPG", "1/1b", 2044, 1172, "Viridiflavus", "CC BY-SA 3.0"),
  "wels-catfish": P("Silurus_glanis_02.jpg", "d/d3", 1588, 1030, "Dieter Florian", "CC BY-SA 3.0 DE"),
  ide: P("LeuciscusIdusWindeIde56cm_21-4-2009_16-46-58.JPG", "c/cd", 2102, 897, "Viridiflavus", "CC BY-SA 3.0"),
  gudgeon: P("Riviergrondel.jpg", "7/71", 800, 407, "Viridiflavus", "CC BY-SA 3.0"),
};

// Wikimedia only makes thumbnails at standard widths; anything else is refused.
export const PHOTO_WIDTHS = [120, 250, 330, 500, 960];
const enc = (s) => encodeURIComponent(s).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")");

export const photoFor = (id) => PHOTOS[id] || null;

/** The photo at a standard width, or the original file when that's no bigger. */
export function photoUrl(p, width) {
  const base = `https://upload.wikimedia.org/wikipedia/commons/`;
  if (!PHOTO_WIDTHS.includes(width) || width >= p.w) return `${base}${p.path}/${enc(p.file)}`;
  return `${base}thumb/${p.path}/${enc(p.file)}/${width}px-${enc(p.file)}`;
}

/** A srcset from the given standard widths, stopping at the original's own width. */
export function photoSrcSet(p, widths) {
  const seen = new Set(), out = [];
  for (const w of widths) {
    const real = Math.min(w, p.w);
    if (seen.has(real)) continue;
    seen.add(real);
    out.push(`${photoUrl(p, w)} ${real}w`);
  }
  return out.join(", ");
}

export const filePage = (p) => `https://commons.wikimedia.org/wiki/File:${enc(p.file)}`;

/** The licence's own page, or null for public domain (the file page says why). */
export function licenceUrl(p) {
  const m = String(p.licence).match(/^CC (BY(?:-SA)?) (\d\.\d)(?: ([A-Z]{2}))?$/);
  if (m) return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3] ? m[3].toLowerCase() + "/" : ""}`;
  if (/^CC0/.test(p.licence)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  return null;
}
