// ---- CatchList: what's caught at a place, in season now first, each with its season in words and its best months ----
import { LEVELS, seasonWord } from "../lib/catchhere.js";
import { monthsText } from "../lib/time.js";
import { FishArt } from "./art.jsx";

const SEASON_TAG = { peak: "Peak now", present: "In season", out: "Out of season" };

/** rows: catchHere() results (already in season order). onOpen(species) opens its profile. */
export default function CatchList({ rows, onOpen, limit = 100 }) {
  const now = rows.filter((r) => r.inSeason !== "out").slice(0, limit);
  const later = rows.filter((r) => r.inSeason === "out").slice(0, Math.max(0, limit - now.length));
  return (
    <>
      {now.length ? <div className="water-group">In season now</div> : null}
      <div className="list">{now.map((r) => <Row key={r.species.id} r={r} onOpen={onOpen} />)}</div>
      {later.length ? <div className="water-group">Other times of year</div> : null}
      <div className="list">{later.map((r) => <Row key={r.species.id} r={r} onOpen={onOpen} />)}</div>
    </>
  );
}

function Row({ r, onOpen }) {
  const sp = r.species;
  const word = seasonWord(sp);
  const months = sp.peak?.length ? `best ${monthsText(sp.peak)}` : sp.present?.length ? monthsText(sp.present) : "";
  // the source's own note (say "Dover sole in summer"), unless it only repeats the season
  const note = r.note && !/^(summer|winter|spring|autumn)\.?$/i.test(r.note.trim()) ? r.note : r.level === "occasional" || r.level === "possible" ? r.reason : "";
  return (
    <button type="button" className="li" onClick={() => onOpen?.(sp)}>
      <span className={`fish-ico ${sp.type === "sea" ? "" : "fresh"}`}><FishArt art={sp.art} size={40} /></span>
      <span className="grow">
        <span className="t">{sp.name}</span>
        <span className="s">{[word, months].filter(Boolean).join(", ")}</span>
        {note ? <span className="s">{note}</span> : null}
      </span>
      <span className="end">
        <span className={`lvl lvl-${r.level}`}>{LEVELS[r.level].short}</span>
        <span className={`tiny season-${r.inSeason}`}>{SEASON_TAG[r.inSeason]}</span>
      </span>
    </button>
  );
}
