// ---- ReelDial: the Reel button drawn as the reel you're winding ----
// The face of a reel with its handle: each tap turns the handle half a turn, round to it smoothly as the reel in your
// hands turns (the same follow, reelHandle.js, from the same count of turns), so the button you press and the reel you
// see move together. Round it, the line's tension: green in the band where the line is tight and safe, amber nearer
// the drag, red when the drag gives (the white mark is where it slips). When a fish takes line, the spool's marks turn
// back the way the line goes out and the handle stops, as on a real fixed-spool reel. The knob goes gold while you tap
// in an even rhythm (which wins a little more line). In the hub, how far out the fish is.
// Drawn every frame from the fight as it is (fightLive), not through React, so it keeps time with the 3D reel.
import { useEffect, useRef } from "react";
import { stepHandle, handleState } from "../lib/reelHandle.js";

const TR = 54, TC = 2 * Math.PI * TR; // (the tension track: radius and length, in the dial's 120 units)
const MAXT = 1.2; // (the track's end: tension past where the line would part)
const SPOOL = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);

export const tensionLevel = (f) => (!f ? "low" : f.slipping ? "slip" : f.tension > (f.drag ?? 0.78) * 0.85 ? "high" : f.tension > 0.22 ? "mid" : "low");
/** The band where the line's tight but safe: from just taut to short of where the drag gives (0..1 of the track). */
export const sweetBand = (drag = 0.78) => [0.22 / MAXT, Math.min(drag * 0.85, MAXT) / MAXT];

export default function ReelDial({ live, fight }) {
  const root = useRef(null), knob = useRef(null), arc = useRef(null), spool = useRef(null), num = useRef(null);
  useEffect(() => {
    let raf = 0, last = performance.now(), hs = null, spin = 0, shown = { d: null, lv: null, st: null, run: null };
    const draw = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const f = live?.current || fight;
      if (f && root.current) {
        hs = stepHandle(hs || handleState(0), f.turns || 0, dt);
        knob.current?.setAttribute("transform", `rotate(${((hs.angle * 180) / Math.PI) % 360} 60 60)`);
        const t = Math.max(0, Math.min(MAXT, f.tension || 0));
        if (arc.current) arc.current.style.strokeDashoffset = String(TC * (1 - t / MAXT));
        // (line going out: the spool turns back, quicker while the drag slips)
        if (f.taking) spin -= dt * (f.slipping ? 7 : 3);
        spool.current?.setAttribute("transform", `rotate(${(spin * 180) / Math.PI} 60 60)`);
        const d = f.near ? null : Math.round(f.dist), lv = tensionLevel(f), st = (f.steady || 0) > 0.6 ? "1" : "0", run = f.taking ? "1" : "0";
        if (d !== shown.d && num.current) { num.current.textContent = d == null ? "" : String(d); shown.d = d; }
        if (lv !== shown.lv) { root.current.dataset.ten = lv; shown.lv = lv; }
        if (st !== shown.st) { root.current.dataset.steady = st; shown.st = st; }
        if (run !== shown.run) { root.current.dataset.run = run; shown.run = run; }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const drag = fight?.drag ?? 0.78, [b0, b1] = sweetBand(drag), dragA = (Math.min(drag, MAXT) / MAXT) * 2 * Math.PI;
  return (
    <svg ref={root} className="reel-dial" viewBox="0 0 120 120" aria-hidden="true" data-ten="low" data-steady="0" data-run="0">
      <defs>
        <radialGradient id="rd-face" cx="42%" cy="36%" r="70%"><stop offset="0" className="rd-face-a" /><stop offset="1" className="rd-face-b" /></radialGradient>
      </defs>
      {/* the tension track, from the top going round clockwise */}
      <g transform="rotate(-90 60 60)">
        <circle cx="60" cy="60" r={TR} className="rd-track" />
        <circle cx="60" cy="60" r={TR} className="rd-band" style={{ strokeDasharray: `${TC * (b1 - b0)} ${TC}`, strokeDashoffset: -TC * b0 }} />
        <circle ref={arc} cx="60" cy="60" r={TR} className="rd-ten" style={{ strokeDasharray: TC, strokeDashoffset: TC }} />
        <line x1={60 + 49 * Math.cos(dragA)} y1={60 + 49 * Math.sin(dragA)} x2={60 + 59 * Math.cos(dragA)} y2={60 + 59 * Math.sin(dragA)} className="rd-drag" />
      </g>
      {/* the reel's face and its spool's marks */}
      <circle cx="60" cy="60" r="46" className="rd-face" fill="url(#rd-face)" />
      <g ref={spool}>{SPOOL.map((a) => <line key={a} x1={60 + 37 * Math.cos(a)} y1={60 + 37 * Math.sin(a)} x2={60 + 42 * Math.cos(a)} y2={60 + 42 * Math.sin(a)} className="rd-mark" />)}</g>
      {/* the handle: its arm from the hub and the knob your fingers turn */}
      <g ref={knob}>
        <rect x="55.75" y="21" width="8.5" height="39" rx="4.25" className="rd-arm" />
        <circle cx="60" cy="22" r="9.5" className="rd-knob" />
        <circle cx="57.4" cy="19.4" r="2.8" className="rd-knob-hi" />
      </g>
      {/* the hub: how far out it is */}
      <circle cx="60" cy="60" r="17" className="rd-hub" />
      <text ref={num} x="60" y="62" className="rd-num" textAnchor="middle" dominantBaseline="middle" />
      <text x="60" y="72.5" className="rd-unit" textAnchor="middle">m</text>
    </svg>
  );
}
