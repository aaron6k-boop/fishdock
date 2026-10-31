// ---- FishPhoto: a picture of the species: FishDock's own where it has one, or a free-licensed photo (credited) ----
import { useEffect, useState } from "react";
import { getFishInfo } from "../lib/api.js";
import { photoFor, photoUrl, photoSrcSet, filePage, licenceUrl } from "../data/photos.js";
import { hasArt, artUrl, artSrcSet } from "../data/fishart.js";
import { FishArt } from "./art.jsx";
import { Seg } from "./ui.jsx";

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

// Photos load with CORS so the service worker can keep a copy for use offline; no referrer is sent to Wikimedia.
const IMG = { loading: "lazy", decoding: "async", crossOrigin: "anonymous", referrerPolicy: "no-referrer" };

// ---- small picture for lists, cards and chips ----
const KINDS = {
  icon: { widths: [120, 250], sizes: "64px", art: 34 },
  chip: { widths: [120, 250], sizes: "80px", art: 58 },
  head: { widths: [250, 330], sizes: "120px", art: 110 },
  card: { widths: [250, 330, 500], sizes: "(max-width: 560px) 46vw, 260px", art: 130 },
};

/** FishDock's own picture of the species, else its Wikimedia photo, else the simple illustration. */
export function FishThumb({ species, kind = "icon" }) {
  const [failed, setFailed] = useState(() => new Set());
  const k = KINDS[kind] || KINDS.icon;
  const id = species?.id;
  const pick = ["art", "photo"].find((src) => !failed.has(`${id}:${src}`) && (src === "art" ? hasArt(id) : !!photoFor(id)));
  if (!pick) return <FishArt art={species?.art} size={k.art} />;
  const fail = () => setFailed((s) => new Set(s).add(`${id}:${pick}`));
  if (pick === "art") return <img className={`fish-thumb is-art ft-${kind}`} src={artUrl(id, "s")} alt="" loading="lazy" decoding="async" onError={fail} />;
  const p = photoFor(id);
  return <img className={`fish-thumb ft-${kind}`} src={photoUrl(p, k.widths[0])} srcSet={photoSrcSet(p, k.widths)} sizes={k.sizes} alt="" {...IMG} onError={fail} />;
}

// ---- the large picture on a fish's page: FishDock's own, with the Wikimedia photo a tap away ----
function chosenPhoto(species, info) {
  const p = photoFor(species.id);
  if (p) {
    return {
      src: photoUrl(p, 500), srcSet: photoSrcSet(p, [330, 500, 960]), width: Math.min(960, p.w), height: Math.round(Math.min(960, p.w) * p.h / p.w),
      author: p.author, licence: p.licence, licenceUrl: licenceUrl(p), filePage: filePage(p),
    };
  }
  return info?.photo?.url ? { src: info.photo.url, width: info.photo.width, height: info.photo.height, ...info.photo } : null;
}

export default function FishPhoto({ species, info, size = 240 }) {
  const [show, setShow] = useState(null); // this page's own choice, if the angler flips it
  const [failed, setFailed] = useState(() => new Set());
  const id = species.id;
  const photo = failed.has(`${id}:photo`) ? null : chosenPhoto(species, info);
  const art = hasArt(id) && !failed.has(`${id}:art`);
  const mode = show === "photo" && photo ? "photo" : art ? "art" : photo ? "photo" : null;
  useEffect(() => { setShow(null); }, [id]);
  const fail = (src) => () => setFailed((s) => new Set(s).add(`${id}:${src}`));
  if (!mode) return <FishArt art={species.art} size={size} title={`Illustration of a ${species.name.toLowerCase()}`} />;
  return (
    <figure className="fish-photo">
      {mode === "art" ? (
        <img src={artUrl(id, "l")} srcSet={artSrcSet(id)} sizes="(max-width: 640px) 100vw, 600px" alt={`Picture of a ${species.name.toLowerCase()}`} width="1200" height="800" decoding="async" onError={fail("art")} />
      ) : (
        <img src={photo.src} srcSet={photo.srcSet} sizes={photo.srcSet ? "(max-width: 640px) 100vw, 600px" : undefined} alt={`Photo of a ${species.name.toLowerCase()}`}
          width={photo.width || undefined} height={photo.height || undefined} {...IMG} loading="eager" onError={fail("photo")} />
      )}
      <figcaption className="tiny">
        {art && photo ? <Seg label="Picture" value={mode} onChange={setShow} options={[{ value: "art", label: "FishDock" }, { value: "photo", label: "Wikimedia photo" }]} /> : null}
        <span className="credit">
          {mode === "art" ? "Picture: FishDock"
            : <>Photo: {photo.filePage ? <a href={photo.filePage} target="_blank" rel="noopener noreferrer">{photo.author}</a> : photo.author}, {photo.licenceUrl ? <a href={photo.licenceUrl} target="_blank" rel="noopener noreferrer">{photo.licence}</a> : photo.licence}, via Wikimedia Commons</>}
        </span>
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
