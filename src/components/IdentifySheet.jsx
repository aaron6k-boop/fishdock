// ---- AI fish identification (Beta): photo in, up to three candidates out, always confirmed by the angler ----
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
import { identifyFish, aiAvailable } from "../lib/ai.js";
import { shrinkImage } from "../lib/storage.js";
import { track } from "../lib/api.js";
import { SPECIES } from "../data/species.js";
import { Sheet, Beta, Notice, Icon } from "./ui.jsx";
import { FishThumb } from "./FishPhoto.jsx";

export default function IdentifySheet({ onClose, onPick }) {
  const { place } = useApp();
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [can, setCan] = useState(true);
  const fileRef = useRef(null);
  useEffect(() => { aiAvailable().then(setCan); }, []);

  async function choose(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const s = await shrinkImage(f, 1280);
    setImg(s); setRes(null); setBusy(true);
    track("ai_identify");
    const r = await identifyFish(s.blob, { waterType: place.kind, region: place.region || null }, SPECIES.map((x) => x.id));
    setRes(r); setBusy(false);
  }

  return (
    <Sheet title="Identify a fish" aside={<>AI identification <Beta /></>} onClose={onClose}>
      {!can ? <Notice kind="warn">AI identification isn't available here. In the preview it needs your permission to use Claude; the full app uses FishDock's server.</Notice> : null}
      <p className="small muted">Photograph the whole fish side-on, in good light, on a wet mat. Keep it brief and get the fish back in the water.</p>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={choose} id="id-photo" />
      <button type="button" className="btn primary block" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="camera" />{img ? "Try another photo" : "Take or choose a photo"}</button>
      {img ? <img src={img.dataUrl} alt="Your fish" className="id-photo" /> : null}
      {busy ? <p className="small muted" aria-live="polite">Looking at the photo… this can take up to a minute.</p> : null}
      {res?.error ? <Notice kind="warn">{res.message}</Notice> : null}
      {res && !res.error ? (
        <div className="stack">
          {res.candidates.length ? res.candidates.map((c, i) => {
            const sp = SPECIES.find((s) => s.id === c.id);
            return (
              <div key={i} className="li static">
                <span className="fish-ico">{sp ? <FishThumb species={sp} /> : <Icon name="fish" />}</span>
                <span className="grow"><span className="t">{c.species} <span className={`conf-${c.confidence}`}>{c.confidence} confidence</span></span><span className="s wrap">{c.why}</span></span>
                {sp && onPick ? <button type="button" className="btn small" onClick={() => onPick(sp.id)}>Use</button> : null}
              </div>
            );
          }) : <p className="small">No confident match.</p>}
          {res.lookalikes?.length ? <p className="small muted"><b>Rule out:</b> {res.lookalikes.join("; ")}</p> : null}
          {res.note ? <p className="tiny">{res.note}</p> : null}
          <p className="tiny">AI suggestions can be wrong. Check the ID features in the species profile, especially before keeping a fish.</p>
        </div>
      ) : null}
    </Sheet>
  );
}
