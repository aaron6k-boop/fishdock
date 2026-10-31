// ---- BaitPhoto: a real photo of a bait (Wikimedia Commons, credited), or its drawn icon ----
import { useState } from "react";
import { baitPhotoFor, photoUrl, photoSrcSet, filePage, licenceUrl } from "../data/baitphotos.js";
import { KitIcon } from "./RigScene.jsx";

const IMG = { decoding: "async", crossOrigin: "anonymous", referrerPolicy: "no-referrer" };
const iconFor = (b) => (/lure|plastic|spinner|fly|flies|jig|shad|feather|sabiki|bead|sequin|spoon/i.test(b?.name || "") ? "lure" : "bait");

/** Small square photo for lists. */
export function BaitThumb({ bait }) {
  const [broken, setBroken] = useState(false);
  const p = baitPhotoFor(bait);
  if (!p || broken) return <span className="kit-ico"><KitIcon text={iconFor(bait)} /></span>;
  return <img className="bait-thumb" src={photoUrl(p, 120)} srcSet={photoSrcSet(p, [120, 250])} sizes="48px" alt="" loading="lazy" {...IMG} onError={() => setBroken(true)} />;
}

/** The large photo on a bait's own page, with its credit. */
export default function BaitPhoto({ bait }) {
  const [broken, setBroken] = useState(false);
  const p = baitPhotoFor(bait);
  if (!p || broken) return null;
  const lic = licenceUrl(p);
  return (
    <figure className="fish-photo bait-photo">
      <img src={photoUrl(p, 500)} srcSet={photoSrcSet(p, [330, 500, 960])} sizes="(max-width: 640px) 100vw, 600px" alt={`Photo of ${bait.name.toLowerCase()}`} loading="eager" {...IMG} onError={() => setBroken(true)} />
      <figcaption className="tiny"><span className="credit">Photo: <a href={filePage(p)} target="_blank" rel="noopener noreferrer">{p.author}</a>, {lic ? <a href={lic} target="_blank" rel="noopener noreferrer">{p.licence}</a> : p.licence}, via Wikimedia Commons</span></figcaption>
    </figure>
  );
}
