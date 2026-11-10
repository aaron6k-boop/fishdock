// ---- backdrop3d: a far shore from a photograph of it ----
// Houses a quarter of a mile off that nobody walks to don't need to be buildings. Here they are the real place: a
// photograph of that shore taken from the mark (openly licensed, credited in public/textures/CREDITS.txt and on the
// screen), its sky cut away, hung where the shore is. It is a curved sheet centred on where the photographer stood,
// each column at its own bearing and at that stretch of frontage's own distance, each row at its own height above the
// far waterline, so from the mark the picture lines up with the map; and because it stands at the frontage's real
// distance, the jetties, boats and quay in front of it slide across it as you walk, as they do across the real town.
// It takes the scene's light (the sun and sky of the hour and the weather tint it, the haze fogs it, at night it is a
// dark shape), but it has no lit windows of its own after dark: that would be invented.
// A place lists its backdrops in localDetail.js:
//   { tex, cam: [x, z] (where the photograph was taken, metres round the mark), bearing0 (the picture's left edge,
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
    const dx = x - d.cam[0], dz = z - d.cam[1], b = ((Math.atan2(dx, -dz) / D2R) + 360) % 360, span = d.px[0] / d.pxPerDeg;
    const rel = (b - d.bearing0 + 360) % 360; if (rel > span) continue;
    if (Math.hypot(dx, dz) > distAt(d.dist, d.bearing0 + rel) - margin) return true;
  }
  return false;
}

/** build the sheets into `group`; returns { meshes, update(light) } where light: { sun: Color, sunI, sky: Color, skyI } */
export function buildBackdrops(group, defs) {
  const mats = [], meshes = [];
  for (const d of defs || []) {
    if (typeof document === "undefined") continue;
    const tex = new THREE.TextureLoader().load(TEX_BASE + d.tex);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const [W, H] = d.px, span = W / d.pxPerDeg, cols = Math.max(8, Math.ceil(span / 1.5)), pos = [], uv = [], idx = [];
    for (let i = 0; i <= cols; i++) {
      const f = i / cols, b = d.bearing0 + span * f, r = distAt(d.dist, b), wl = d.waterline[0] + (d.waterline[1] - d.waterline[0]) * f;
      const x = d.cam[0] + Math.sin(b * D2R) * r, z = d.cam[1] - Math.cos(b * D2R) * r;
      // (rows are angles up or down from the far waterline, which stands at the sea's level)
      pos.push(x, r * Math.tan((wl / d.pxPerDeg) * D2R), z, x, r * Math.tan(((wl - H) / d.pxPerDeg) * D2R), z); uv.push(f, 1, f, 0);
      if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    // (unlit by the scene's lamps, tinted here from its sun and sky; cut out by the picture's own skyline; fogged)
    const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(g, m); mesh.name = "fdBackdrop"; mesh.userData.kind = "the far shore (a photograph)"; mesh.renderOrder = -1;
    group.add(mesh); mats.push(m); meshes.push(mesh);
  }
  const c = new THREE.Color();
  return {
    meshes,
    /** the light of the hour on it. The photograph was taken in soft daylight: that is its 1. */
    update({ sun, sunI, sky, skyI }) {
      // (soft daylight in the game: sky about 1, sun about 3. Half from each, so a clear noon is near 1 and an
      // overcast day a little under; dusk and night follow the sky down)
      c.setRGB(sky.r * skyI * 0.9 + sun.r * sunI * 0.2, sky.g * skyI * 0.9 + sun.g * sunI * 0.2, sky.b * skyI * 0.9 + sun.b * sunI * 0.2);
      for (const m of mats) m.color.copy(c);
    },
    dispose() { for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.map?.dispose?.(); mesh.material.dispose(); } },
  };
}
