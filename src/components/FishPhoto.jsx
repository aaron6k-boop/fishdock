// ---- FishPhoto: a real, free-licensed photo of the species (Wikimedia Commons, credited), or the illustration ----
import { useEffect, useState } from "react";
import { getFishInfo } from "../lib/api.js";
import { FishArt } from "./art.jsx";

/** Loads /api/fishinfo once per species. Shows the illustration until (and unless) a free photo arrives. */
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

export default function FishPhoto({ species, info, size = 240 }) {
  const [broken, setBroken] = useState(false);
  const p = info?.photo;
  if (!p?.url || broken) return <FishArt art={species.art} size={size} title={`Illustration of a ${species.name.toLowerCase()}`} />;
  return (
    <figure className="fish-photo">
      <img src={p.url} alt={`Photo of a ${species.name.toLowerCase()}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        width={p.width || undefined} height={p.height || undefined} onError={() => setBroken(true)} />
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
