// ---- AI Cast Advisor (Beta): point the camera at the water, get possible casting targets marked on the picture ----
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
import { castAdvice, aiAvailable } from "../lib/ai.js";
import { shrinkImage } from "../lib/storage.js";
import { track } from "../lib/api.js";
import { ukHour } from "../lib/time.js";
import { autoTarget, catchHere } from "../lib/catchhere.js";
import { SPECIES } from "../data/species.js";
import AdviceSheet from "../components/AdviceSheet.jsx";
import { ukMonth } from "../lib/time.js";
import { Icon, Beta, Notice, Sources } from "../components/ui.jsx";

const READ_WATER = {
  sea: [
    ["Gullies and channels", "Darker, smoother lanes between rocks or sandbars: food collects there and fish patrol them on the flood."],
    ["Surf and white water", "Bass hunt in the first few breakers, where waves churn up crabs and sandeels."],
    ["Rock edges and weed", "Wrasse, pollack and bass hold tight to kelp and ledges. Cast to the edge, not into the middle of the weed."],
    ["Colour changes", "A line where clear water meets coloured often marks a drop-off, a current or a sandbar."],
    ["Pier legs and walls", "Structure gives shelter and food: fish close in, often under your feet."],
    ["Estuary channels", "On the flood, fish follow the main channel up; flounder and bass push onto the flats as they cover."],
  ],
  fresh: [
    ["Creases and seams", "The line where fast water meets slow: fish sit in the slack edge and wait for food."],
    ["Pool tails and glides", "Where a pool shallows and speeds up before a riffle: good for chub, dace and grayling."],
    ["Outside of bends", "Deeper, undercut water where the current pushes in: barbel and chub territory."],
    ["Overhanging trees", "Shade, cover and falling insects. Chub love them."],
    ["Weed beds, reeds and pads", "Tench, rudd, perch and pike patrol the edges. Fish tight to the margin."],
    ["Inflows and features", "Streams, bridges, weirs and fallen trees concentrate food and fish."],
  ],
};

export default function CastAdvisor() {
  const { place, tide, settings, speciesById, preview } = useApp();
  const [can, setCan] = useState(true);
  const [advice, setAdvice] = useState(null); // a fish tapped under a cast marker: its bait, hook and rig here
  const [img, setImg] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState("off"); // off | starting | on | error
  const [camMsg, setCamMsg] = useState("");
  const fileRef = useRef(null), videoRef = useRef(null), streamRef = useRef(null);
  const target = settings.target !== "auto" ? speciesById(settings.target) : autoTarget(place, ukMonth(Date.now()));
  useEffect(() => { aiAvailable().then(setCan); return () => stopCam(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopCam() { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCam("off"); }
  async function startCam() {
    setCam("starting"); setCamMsg("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("nocam");
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      streamRef.current = s; videoRef.current.srcObject = s; await videoRef.current.play(); setCam("on");
    } catch (e) {
      setCam("error");
      setCamMsg(e?.name === "NotAllowedError" ? "Camera permission was refused. Allow it in your browser settings, or take a photo instead." : preview ? "The live camera isn't available in this preview. Take a photo instead: it opens your camera app." : "The live camera couldn't start. Take a photo instead.");
    }
  }
  async function capture() {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas");
    const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    stopCam();
    analyse({ blob, dataUrl: c.toDataURL("image/jpeg", 0.85) });
  }
  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    analyse(await shrinkImage(f, 1280, 0.85));
  }
  async function analyse(s) {
    setImg(s); setRes(null); setBusy(true);
    track("ai_cast");
    const st = tide?.stateAt(Date.now());
    const h = ukHour(Date.now());
    const ctx = {
      waterType: place.kind, spotName: place.verified ? place.name : null, species: target?.name || null,
      tide: st ? (st.flooding ? "flooding" : "ebbing") + (st.phase.includes("High") ? " near high water" : st.phase.includes("Low") ? " near low water" : "") : null,
      timeOfDay: h < 6 || h > 20 ? "dark" : h < 9 ? "morning" : h < 17 ? "day" : "evening",
      verified: place.verified && place.best ? [place.best] : [],
      likely: catchHere(place, ukMonth(Date.now())).filter((r) => r.inSeason !== "out").slice(0, 10).map((r) => r.species.name),
    };
    const r = await castAdvice(s.blob, ctx);
    setRes(r); setBusy(false);
  }
  const guide = READ_WATER[place.kind === "sea" ? "sea" : "fresh"];

  return (
    <main className="col">
      <div className="page-head"><h1>Cast Advisor <Beta /></h1></div>
      <p className="page-sub">Point your camera at the water. FishDock marks features worth a cast. It reads only what the picture shows: it can't see fish, depth or what's under the surface.</p>
      {!can ? <Notice kind="warn">AI analysis isn't available here. {preview ? "In this preview it needs your permission to use Claude." : "Try again later."} The guide below still helps you read the water.</Notice> : null}

      <div className={`viewfinder vf-corners${img ? " has-photo" : ""}`}>
        {cam === "on" || cam === "starting" ? <video ref={videoRef} playsInline muted className="cam" /> : null}
        {img && cam !== "on" ? (
          <div className="photo-wrap">
            <img src={img.dataUrl} alt="The water you photographed" />
            {(res?.features || []).map((f) => (
              <span key={f.n} className={`pin-wrap${f.x > 0.6 ? " left" : ""}`} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}>
                <span className={`pin conf-${f.confidence}`} aria-hidden="true">{f.n}</span>
                <span className="pin-tag">{f.label}{f.for?.length ? <small>{f.for.join(", ")}</small> : null}</span>
              </span>
            ))}
            {(res?.avoid || []).map((a, i) => <span key={"a" + i} className="pin avoid" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}>!</span>)}
            {busy ? <div className="scan-busy"><span className="scanline" /><span>Reading the water… up to a minute</span></div> : null}
          </div>
        ) : null}
        {!img && cam === "off" ? <div className="vf-empty"><Icon name="scan" /><b>Point at the sea, river or lake</b><span className="small">Stand where you'll fish and include the water in front of you.</span></div> : null}
        {cam === "on" ? <div className="vf-guide" aria-hidden="true"><span /><span /></div> : null}
      </div>

      <div className="row">
        {cam === "on" ? <button type="button" className="btn primary" onClick={capture}><Icon name="camera" />Capture and analyse</button>
          : <button type="button" className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="camera" />{img ? "New photo" : "Take a photo"}</button>}
        {cam !== "on" ? <button type="button" className="btn" onClick={startCam} disabled={busy}><Icon name="eye" />Live camera</button> : <button type="button" className="btn" onClick={stopCam}>Cancel</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} id="cast-photo" />
      {camMsg ? <Notice kind="warn">{camMsg}</Notice> : null}
      {res?.error ? <Notice kind="warn">{res.message}</Notice> : null}

      {res && !res.error ? (
        <section className="card">
          <div className="card-h"><h2>What the photo suggests</h2><span className="tag">Unverified · AI</span></div>
          {res.summary ? <p className="small">{res.summary}</p> : null}
          <div>{res.features.map((f) => (
            <div key={f.n} className="cast">
              <span className="n">{f.n}</span>
              <div className="body"><b>{f.label} <span className={`conf conf-${f.confidence}`}>{f.confidence}</span></b><p>{f.why}</p>{f.how ? <p><b>How:</b> {f.how}</p> : null}
                {f.for?.length ? <div className="chips cast-for"><span className="tiny">For:</span>{f.for.map((name) => { const sp = SPECIES.find((x) => x.name === name); return sp ? <button key={name} type="button" className="chip" onClick={() => setAdvice(sp)}>{name}</button> : <span key={name} className="chip">{name}</span>; })}</div> : null}
              </div>
            </div>
          ))}</div>
          {res.avoid?.map((a, i) => <div key={i} className="cast"><span className="n avoid">!</span><div className="body"><b>{a.label}</b><p>{a.why}</p></div></div>)}
          {res.safety?.length ? <Notice kind="danger"><b>Safety:</b> {res.safety.join(" ")}</Notice> : null}
          {!res.features.length ? <p className="small muted">No clear features found. Try a wider shot that includes the water's edge.</p> : null}
          <p className="tiny">These are possible fish-holding features from the picture alone, not confirmed fishing information. {res.model ? `Model: ${res.model}.` : ""}</p>
        </section>
      ) : null}

      {advice ? <AdviceSheet species={advice} spot={place} onClose={() => setAdvice(null)} /> : null}
      {place.verified && place.best ? (
        <section className="card">
          <div className="card-h"><h2>Published notes on {place.name}</h2><span className="tag ok">Sourced</span></div>
          <p className="small">{place.best}</p>
          {place.safety ? <Notice kind="warn">{place.safety}</Notice> : null}
          <Sources list={place.sources} />
        </section>
      ) : null}

      <section className="card">
        <h2 className="h2">Reading the water</h2>
        <div className="ifthen">{guide.map(([t, d]) => <div key={t}><b>{t}</b><span>{d}</span></div>)}</div>
      </section>
    </main>
  );
}
