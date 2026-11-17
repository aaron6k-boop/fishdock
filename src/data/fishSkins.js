// ---- fishSkins: the photographs the 3D fish's skins are made from, with their credits ----
// Each skin (public/fish/skin/<species>.webp, and its normal map) is made by source-assets/fish-skins/skins.py from one
// photograph of the species from Wikimedia Commons: the fish cut out of it, warped onto the frame of FishDock's own
// picture of the species (whose outline the 3D model follows), the fins redrawn where the photograph shows them folded,
// its own highlights taken down. Chosen by hand and checked on 17 November 2026; every one is CC BY or CC BY-SA. Each
// adapted skin is offered under its photograph's licence (share-alike where that asks). Credited in Settings, 3D fish
// skin credits, in public/models/CREDITS.txt and in source-assets/ASSET-LICENCES.json.
// The gurnard, tope, lesser-spotted dogfish, conger and eel have no photograph good enough (fins spread or a museum
// mount): theirs are made from FishDock's own pictures alone (PROCEDURAL).

// file: the Commons file name; path: its folder on upload.wikimedia.org; w, h: the original's size in pixels
const P = (file, path, w, h, author, licence) => ({ file, path, w, h, author, licence });

export const SKIN_PHOTOS = {
  cod: P("Gadus_morhua.jpg", "8/80", 2400, 1800, "Hans Hillewaert", "CC BY-SA 4.0"),
  bass: P("Dicentrarchus_labrax_(Belgium).jpg", "c/c0", 2400, 1800, "Hans Hillewaert", "CC BY-SA 4.0"),
  mackerel: P("Scomber_scombrus.jpg", "c/c3", 2955, 2216, "Hans Hillewaert", "CC BY-SA 4.0"),
  whiting: P("Ecomare_-_wijting_(wijting-3617-ogb).jpg", "2/25", 3888, 2592, "Ecomare/Oscar Bos", "CC BY-SA 4.0"),
  pollack: P("Lieu_jaune_(Pollachius_pollachius)_(Ifremer_00528-63951_-_6907).jpg", "2/29", 2976, 1958, "Stephane Lesbats (Ifremer)", "CC BY 4.0"),
  pouting: P("Big_pouting_Holland_on_a_white_background.jpg", "7/74", 1600, 1104, "Peter van der Sluijs", "CC BY-SA 3.0"),
  flounder: P("Platichthys_flesus_1.jpg", "2/22", 3400, 2550, "Hans Hillewaert", "CC BY-SA 4.0"),
  plaice: P("Pleuronectes_platessa.jpg", "9/95", 1024, 771, "Hans Hillewaert", "CC BY-SA 4.0"),
  dab: P("Limanda_limanda.jpg", "9/9c", 1024, 771, "Hans Hillewaert", "CC BY-SA 4.0"),
  sole: P("Solea_solea_1.jpg", "c/cd", 3106, 2330, "Hans Hillewaert", "CC BY-SA 4.0"),
  "ballan-wrasse": P("Labrus_bergylta,_North_Sea,_England,_GB_imported_from_iNaturalist_photo_223571571.jpg", "2/2a", 2048, 1536, "rmjb (iNaturalist)", "CC BY 4.0"),
  "black-bream": P("Chopa_(Spondyliosoma_cantharus),_isla_de_Mouro,_Santander,_España,_2019-08-14,_DD_20.jpg", "2/2c", 2634, 1756, "Diego Delso", "CC BY-SA 4.0"),
  garfish: P("Ecomare_-_geep_(geep-4296-ogb).jpg", "2/27", 3888, 2592, "Ecomare/Oscar Bos", "CC BY-SA 4.0"),
  smoothhound: P("Mustelus_asterias.jpg", "f/fb", 3000, 2250, "Hans Hillewaert", "CC BY-SA 4.0"),
  "thick-lipped-mullet": P("Chelon_labrosus_-_dicklippige_meeräsche_-_0336.jpg", "b/b7", 4632, 2131, "Amada44", "CC BY-SA 3.0"),
  coalfish: P("Pollachius_virens,_Tromsø_2007.jpg", "7/70", 2100, 1373, "Arnstein Rønning", "CC BY-SA 3.0"),
  "thornback-ray": P("Raja_clavata_(juv).jpg", "3/36", 3446, 2585, "Hans Hillewaert", "CC BY-SA 4.0"),
};

/** The species whose skins are made from FishDock's own pictures, with no photograph. */
export const PROCEDURAL = ["gurnard", "tope", "lesser-spotted-dogfish", "conger", "eel"];
