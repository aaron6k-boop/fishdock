// ---- backdrop3d: a far shore from a photograph of it ----
// Houses a quarter of a mile off that nobody walks to don't need to be buildings. Here they are the real place: a
// photograph of that shore taken from the mark (openly licensed, credited in public/textures/CREDITS.txt and on the
// screen), its sky cut away, hung where the shore is. It is a curved sheet centred on where the photographer stood,
// each column at its own bearing and at that stretch of frontage's own distance, each row at its own height above the
// far waterline, so from the mark the picture lines up with the map; and because it stands at the frontage's real
// distance, the jetties, boats and quay in front of it slide across it as you walk, as they do across the real town.
// It takes the scene's light (the sun and sky of the hour and the weather tint it, the haze fogs it, at night it is a
// dark shape), and after dark it shows the lamps and windows that were lit in a photograph of the same shore taken at dusk
// (`lights`): the real ones, not made-up ones.
// A place lists its backdrops in localDetail.js:
//   { tex (left out for a sheet of lamps only), lights (the dusk photograph's bright points on black), cam: [x, z] (where the photograph was taken, metres round the mark), bearing0 (the picture's left edge,
//     degrees from north), pxPerDeg, px: [width, rows], waterline: [row at the left, row at the right],
//     dist: [[bearing, metres], ...] (the frontage's distance from cam), credit }
import * as THREE from "three";
import { TEX_BASE } from "./textures3d.js";

const D2R = Math.PI / 180;
const distAt = (dist, b) => { if (b <= dist[0][0]) return dist[0][1]; for (let i = 1; i < dist.length; i++) if (b <= dist[i][0]) { const f = (b - dist[i - 1][0]) / (dist[i][0] - dist[i - 1][0]); return dist[i - 1][1] + (dist[i][1] - dist[i - 1][1]) * f; } return dist[dist.length - 1][1]; };

/** where a backdrop stands: is (x, z) inside the wedge it shows and at or beyond its sheet (so the map's own
 *  buildings there are not built as well)? */
export function backdropCovers(defs, x, z, margin = 12) {
  for (const d of defs || []) {
    if (!d.tex) continue; // (a sheet of lamps only hides nothing)
    const dx = x - d.cam[0], dz = z - d.cam[1], b = ((Math.atan2(dx, -dz) / D2R) + 360) % 360, span = d.px[0] / d.pxPerDeg;
    const rel = (b - d.bearing0 + 360) % 360; if (rel > span) continue;
    if (Math.hypot(dx, dz) > distAt(d.dist, d.bearing0 + rel) - margin) return true;
  }
  return false;
}

/** build the sheets into `group`; returns { meshes, update(light) } where light: { sun: Color, sunI, sky: Color, skyI } */
export function buildBackdrops(group, defs) {
  const mats = [], lamps = [], meshes = [];
  const load = (name) => { const t = new THREE.TextureLoader().load(TEX_BASE + name); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  for (const d of defs || []) {
    if (typeof document === "undefined") continue;
    const [W, H] = d.px, span = W / d.pxPerDeg, cols = Math.max(8, Math.ceil(span / 1.5)), pos = [], posL = [], uv = [], idx = [];
    for (let i = 0; i <= cols; i++) {
      const f = i / cols, b = d.bearing0 + span * f, r = distAt(d.dist, b), wl = d.waterline[0] + (d.waterline[1] - d.waterline[0]) * f;
      const x = d.cam[0] + Math.sin(b * D2R) * r, z = d.cam[1] - Math.cos(b * D2R) * r;
      // (rows are angles up or down from the far waterline, which stands at the sea's level)
      pos.push(x, r * Math.tan((wl / d.pxPerDeg) * D2R), z, x, r * Math.tan(((wl - H) / d.pxPerDeg) * D2R), z); uv.push(f, 1, f, 0);
      // (the lamps' sheet: the same, a few metres nearer the photographer so it lies on the picture)
      const rl = r - 3; posL.push(d.cam[0] + Math.sin(b * D2R) * rl, rl * Math.tan((wl / d.pxPerDeg) * D2R), d.cam[1] - Math.cos(b * D2R) * rl, d.cam[0] + Math.sin(b * D2R) * rl, rl * Math.tan(((wl - H) / d.pxPerDeg) * D2R), d.cam[1] - Math.cos(b * D2R) * rl);
      if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    }
    const geo = (p) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere(); return g; };
    if (d.tex) {
      // (unlit by the scene's lamps, tinted here from its sun and sky; cut out by the picture's own skyline; fogged)
      const m = new THREE.MeshBasicMaterial({ map: load(d.tex), alphaTest: 0.5, side: THREE.DoubleSide, fog: true });
      const mesh = new THREE.Mesh(geo(pos), m); mesh.name = "fdBackdrop"; mesh.userData.kind = "the far shore (a photograph)"; mesh.renderOrder = -1;
      group.add(mesh); mats.push(m); meshes.push(mesh);
    }
    if (d.lights) {
      // the lamps and lit windows of a photograph of the same shore taken at dusk: only its bright points, on black,
      // added over the dark shape after sunset. They are the lights that were really on in that photograph, no more
      const m = new THREE.MeshBasicMaterial({ map: load(d.lights), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }); // (no fog: added light, the haze's colour would be added over the whole sheet)
      m.color.setScalar(0);
      const mesh = new THREE.Mesh(geo(posL), m); mesh.name = "fdBackdropLamps"; mesh.userData.kind = "the far shore's lamps (from a photograph at dusk)"; mesh.visible = false;
      group.add(mesh); lamps.push(m); meshes.push(mesh); m.userData.mesh = mesh;
    }
  }
  const c = new THREE.Color();
  return {
    meshes,
    /** the light of the hour on it. The photograph was taken in soft daylight: that is its 1. */
    update({ sun, sunI, sky, skyI }) {
      // (soft daylight in the game: sky about 1, sun about 3. Half from each, so a clear noon is near 1 and an
      // overcast day a little under; dusk and night follow the sky down)
      c.setRGB(sky.r * skyI * 1.2 + sun.r * sunI * 0.3, sky.g * skyI * 1.2 + sun.g * sunI * 0.3, sky.b * skyI * 1.2 + sun.b * sunI * 0.3);
      for (const m of mats) m.color.copy(c);
      // (the lamps come on as the light goes: nothing in daylight, full once the sheet is a dark shape)
      const lum = c.r * 0.3 + c.g * 0.5 + c.b * 0.2, t = Math.min(1, Math.max(0, (0.5 - lum) / 0.35)), on = t * t * (3 - 2 * t);
      for (const m of lamps) { m.color.setScalar(on * 2.2); m.userData.mesh.visible = on > 0.01; }
    },
    dispose() { for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.map?.dispose?.(); mesh.material.dispose(); } },
  };
}
