// ---- GearCard: ready-tied rigs, bait and useful kit for a fish, with links to search for each in UK shops ----
import { RIGS } from "../data/rigs.js";
import { BAITS } from "../data/baits.js";
import { SHOPS, rigQuery, baitQuery } from "../data/shops.js";
import { gearFor } from "../data/gear.js";
import { KitIcon } from "./RigScene.jsx";

/** Links that open each shop's own search for these words, in a new tab, with no referrer. */
export function ShopLinks({ q, label }) {
  return (
    <span className="shop-links" aria-label={label ? `Search shops for ${label}` : "Search shops"}>
      {SHOPS.map((s) => (
        <a key={s.id} className="shop-link" href={s.url(q)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={`Search ${s.name} for “${q}”`}>{s.short || s.name}</a>
      ))}
    </span>
  );
}

const baitById = (id) => BAITS.find((b) => b.id === id);

/** advice: from buildAdvice (its rig and baits come first). method: the method in use, for the kit list. */
export default function GearCard({ species, advice, method, title = "Get the gear" }) {
  if (!species) return null;
  const water = species.type === "fresh" ? "fresh" : "sea";
  // rigs: the one advised, its alternatives, then other rigs the guides name for this fish
  const seen = new Set();
  const rigs = [advice?.rig, ...(advice?.rigAlternatives || []), ...RIGS.filter((r) => (r.species || []).includes(species.id) && (r.type === water || r.type === "both" || species.type === "both"))]
    .filter((r) => r && !seen.has(r.id) && seen.add(r.id)).slice(0, 4);
  // baits: the sourced ones for this fish, the advised bait first
  const named = new Set();
  const baits = [advice?.bait?.primary, ...(species.baits?.natural || []), ...(species.baits?.artificial || [])]
    .filter((b) => b && !named.has(b.name) && named.add(b.name)).slice(0, 6);
  const kit = gearFor(species, method || advice?.method);
  return (
    <section className="card gear">
      <div className="card-h"><h2>{title}</h2><span className="aside">Search UK shops</span></div>

      {rigs.length ? <>
        <span className="eyebrow">Ready-tied rigs</span>
        <ul className="gear-list">{rigs.map((r) => (
          <li key={r.id}>
            <span className="kit-ico"><KitIcon text={/float/i.test(r.name) ? "float" : /feeder/i.test(r.name) ? "feeder" : /lure|spinner|plastic|fly/i.test(r.name) ? r.name : "hook"} /></span>
            <span className="grow"><span className="t">{r.name}{r === advice?.rig ? <span className="tag ok">Advised</span> : null}</span>{r.hook ? <span className="s">Hooks: {r.hook}</span> : null}<ShopLinks q={rigQuery(r)} label={r.name} /></span>
          </li>
        ))}</ul>
      </> : null}

      {baits.length ? <>
        <span className="eyebrow">Baits that catch {species.name.toLowerCase()}</span>
        <ul className="gear-list">{baits.map((b) => {
          const stock = b.id ? baitById(b.id) : null;
          return (
            <li key={b.name}>
              <span className="kit-ico"><KitIcon text={/lure|plastic|spinner|fly|flies|jig|shad|feather|sabiki/i.test(b.name) ? "lure" : "bait"} /></span>
              <span className="grow">
                <span className="t">{b.name}</span>
                {b.note ? <span className="s">{b.note}</span> : null}
                {stock?.where ? <span className="s"><b>Get it:</b> {stock.where}</span> : null}
                <ShopLinks q={baitQuery(b, species)} label={b.name} />
              </span>
            </li>
          );
        })}</ul>
      </> : null}

      {kit.length ? <>
        <span className="eyebrow">Useful kit <span className="tag">General kit ideas</span></span>
        <ul className="gear-list">{kit.map((g) => (
          <li key={g.id}>
            <span className="kit-ico"><KitIcon text={g.name} /></span>
            <span className="grow"><span className="t">{g.name}</span><span className="s">{g.why}</span><ShopLinks q={g.q} label={g.name} /></span>
          </li>
        ))}</ul>
      </> : null}

      <p className="tiny">Each link opens that shop's own search. FishDock doesn't sell, check or earn from anything there, and prices change. Match the hook size and line to the advice above, and buy live worms, crab and maggots fresh from a local tackle shop where you can.</p>
    </section>
  );
}
