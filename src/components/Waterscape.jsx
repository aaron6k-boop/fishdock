// ---- Waterscape: the Home hero scene, drawn live from the real sun and moon at the current place ----
// Plays the part of DetectDock's countryside photo hero: day, dusk and night follow the actual sky.
import { useEffect, useRef } from "react";
import ASTRO from "../lib/astro.js";

const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const SKY = {
  night: [[8, 14, 26], [14, 26, 44]],
  dusk: [[38, 46, 86], [228, 132, 92]],
  day: [[86, 150, 206], [190, 222, 240]],
};

export default function Waterscape({ lat, lon, kind = "sea", wind = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const g = cv.getContext("2d");
    let raf = 0, t0 = performance.now(), last = 0, visible = true;
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } }) : null;
    io?.observe(cv);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    function draw(ts) {
      if (!visible || document.hidden) return; // nothing drawn off screen: saves battery at the water
      if (!reduce && ts - last < 42) { raf = requestAnimationFrame(draw); return; } // about 24 fps is plenty for waves
      last = ts;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const now = Date.now();
      const sun = ASTRO.sunPos(now, lat, lon), moon = ASTRO.moonPos(now, lat, lon);
      const a = sun.alt;
      const f = a > 8 ? 1 : a < -10 ? 0 : (a + 10) / 18;
      const duskness = Math.max(0, 1 - Math.abs(a - 1) / 9);
      let top = mix(SKY.night[0], SKY.day[0], f), bot = mix(SKY.night[1], SKY.day[1], f);
      top = mix(top, SKY.dusk[0], duskness * 0.6); bot = mix(bot, SKY.dusk[1], duskness * 0.75);
      const horizon = h * (kind === "sea" ? 0.58 : 0.5);
      const sky = g.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, rgb(top)); sky.addColorStop(1, rgb(bot));
      g.fillStyle = sky; g.fillRect(0, 0, w, horizon + 1);
      // stars
      if (f < 0.35) {
        g.fillStyle = `rgba(255,255,255,${0.7 * (1 - f / 0.35)})`;
        for (let i = 0; i < 60; i++) { const x = (i * 97) % w, y = (i * 53) % (horizon * 0.8); g.fillRect(x, y, 1, 1); }
      }
      // sun and moon by azimuth: south (180) sits in the middle of the scene
      const place = (az, alt) => ({ x: w * (0.5 + ((((az - 180) + 540) % 360) - 180) / 200), y: horizon - (alt / 60) * horizon * 0.95 });
      if (a > -4) { const p = place(sun.az, a); const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40); gr.addColorStop(0, "rgba(255,246,214,0.95)"); gr.addColorStop(0.25, "rgba(255,226,160,0.5)"); gr.addColorStop(1, "rgba(255,210,140,0)"); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, 40, 0, 7); g.fill(); }
      if (moon.alt > -2) {
        const p = place(moon.az, moon.alt), ill = ASTRO.moonIllum(now);
        g.fillStyle = "rgba(235,238,250,0.95)"; g.beginPath(); g.arc(p.x, p.y, 9, 0, 7); g.fill();
        g.fillStyle = rgb(top); g.beginPath(); g.arc(p.x + (ill.phase < 0.5 ? -1 : 1) * 18 * ill.fraction, p.y, 9, 0, 7); g.globalAlpha = 1 - ill.fraction; g.fill(); g.globalAlpha = 1;
      }
      // land / far shore
      g.fillStyle = rgb(mix([10, 18, 20], [58, 84, 74], f));
      g.beginPath(); g.moveTo(0, horizon);
      if (kind === "sea") { g.lineTo(w * 0.18, horizon - 10); g.lineTo(w * 0.3, horizon - 4); g.lineTo(w * 0.36, horizon); }
      else { for (let x = 0; x <= w; x += 20) g.lineTo(x, horizon - 18 - 10 * Math.sin(x / 70) - 6 * Math.sin(x / 23)); }
      g.lineTo(w, horizon); g.closePath(); g.fill();
      // water
      const water = g.createLinearGradient(0, horizon, 0, h);
      water.addColorStop(0, rgb(mix(mix([12, 22, 34], [62, 120, 160], f), [150, 100, 90], duskness * 0.35)));
      water.addColorStop(1, rgb(mix([6, 12, 18], [20, 58, 78], f)));
      g.fillStyle = water; g.fillRect(0, horizon, w, h - horizon);
      const time = reduce ? 0 : (ts - t0) / 1000;
      const amp = kind === "sea" ? 1.6 + Math.min(4, wind / 10) : 0.8;
      g.strokeStyle = `rgba(255,255,255,${0.08 + 0.12 * f})`; g.lineWidth = 1;
      for (let row = 0; row < 9; row++) {
        const y0 = horizon + 6 + row * row * 3.2, k = 1 + row * 0.5;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + Math.sin(x / (18 * k) + time * (0.6 + row * 0.08) + row) * amp * k * 0.4;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      if (kind === "river") { // banks
        g.fillStyle = rgb(mix([8, 14, 12], [40, 64, 44], f));
        g.beginPath(); g.moveTo(0, h); g.lineTo(0, horizon + 10); g.quadraticCurveTo(w * 0.12, horizon + 40, w * 0.08, h); g.fill();
        g.beginPath(); g.moveTo(w, h); g.lineTo(w, horizon + 4); g.quadraticCurveTo(w * 0.82, horizon + 50, w * 0.9, h); g.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    const iv = reduce ? setInterval(() => requestAnimationFrame(draw), 60000) : 0;
    const onVis = () => { if (!document.hidden) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); io?.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [lat, lon, kind, wind]);
  return <canvas ref={ref} aria-hidden="true" />;
}
