// ---- FishPhoto: a real, free-licensed photo of the species (Wikimedia Commons, credited), or the illustration ----
import { useEffect, useState } from "react";
import { getFishInfo } from "../lib/api.js";
import { photoFor, photoUrl, photoSrcSet, filePage, licenceUrl } from "../data/photos.js";
import { FishArt } from "./art.jsx";

/** Loads /api/fishinfo once per species (the Wikipedia summary, and a photo for any species without a chosen one). */
export function useFishInfo(id) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let gone = false;
    setInfo(null);
    getFishInfo(id).then((d) => { if (!gone) setInfo(d); });
    return () => { gone = true; };
  }, [id]);
  return info;
}

// Loaded with CORS so the service worker can keep a copy for use offline; no referrer is sent to Wikimedia.
const IMG = { loading: "lazy", decoding: "async", crossOrigin: "anonymous", referrerPolicy: "no-referrer" };

// ---- small photo for lists, cards and chips ----
const KINDS = {
  icon: { widths: [120, 250], sizes: "48px", art: 34 },
  chip: { widths: [120, 250], sizes: "80px", art: 58 },
  head: { widths: [250, 330], sizes: "120px", art: 110 },
  card: { widths: [250, 330, 500], sizes: "(max-width: 560px) 46vw, 260px", art: 130 },
};

/** The species' photo cropped to fill its box (set by CSS), or its illustration if there's no photo or it won't load. */
export function FishThumb({ species, kind = "icon" }) {
  const [broken, setBroken] = useState(null); // the id whose photo failed, so a reused row tries the next fish's photo
  const k = KINDS[kind] || KINDS.icon;
  const p = photoFor(species?.id);
  if (!p || broken === species.id) return <FishArt art={species?.art} size={k.art} />;
  return (
    <img className={`fish-thumb ft-${kind}`} src={photoUrl(p, k.widths[0])} srcSet={photoSrcSet(p, k.widths)} sizes={k.sizes} alt=""
      {...IMG} onError={() => setBroken(species.id)} />
  );
}

// ---- large photo with its credit ----
function chosen(species) {
  const p = photoFor(species.id);
  if (!p) return null;
  return {
    src: photoUrl(p, 500), srcSet: photoSrcSet(p, [330, 500, 960]), width: Math.min(960, p.w), height: Math.round(Math.min(960, p.w) * p.h / p.w),
    author: p.author, licence: p.licence, licenceUrl: licenceUrl(p), filePage: filePage(p),
  };
}

export default function FishPhoto({ species, info, size = 240 }) {
  const [broken, setBroken] = useState(null);
  const mine = chosen(species);
  const api = info?.photo?.url ? { src: info.photo.url, width: info.photo.width, height: info.photo.height, ...info.photo } : null;
  const p = broken === species.id ? null : mine || api;
  if (!p) return <FishArt art={species.art} size={size} title={`Illustration of a ${species.name.toLowerCase()}`} />;
  return (
    <figure className="fish-photo">
      <img src={p.src} srcSet={p.srcSet} sizes={p.srcSet ? "(max-width: 640px) 100vw, 600px" : undefined} alt={`Photo of a ${species.name.toLowerCase()}`}
        width={p.width || undefined} height={p.height || undefined} {...IMG} loading="eager" onError={() => setBroken(species.id)} />
      <figcaption className="tiny">
        Photo: {p.filePage ? <a href={p.filePage} target="_blank" rel="noopener noreferrer">{p.author}</a> : p.author}, {p.licenceUrl ? <a href={p.licenceUrl} target="_blank" rel="noopener noreferrer">{p.licence}</a> : p.licence}, via Wikimedia Commons
      </figcaption>
    </figure>
  );
}

/** Wikipedia's summary of the species, kept apart from FishDock's sourced advice. */
export function AboutFish({ info }) {
  if (!info?.extract) return null;
  return (
    <section className="card">
      <div className="card-h"><h2>About this fish</h2><span className="aside">From Wikipedia</span></div>
      <p className="small">{info.extract}</p>
      <p className="tiny">{info.page ? <a href={info.page} target="_blank" rel="noopener noreferrer">Read more on Wikipedia</a> : null} · Text CC BY-SA 4.0. Sizes there are for the species worldwide; UK fish are often smaller.</p>
    </section>
  );
}
