// ---- sceneCheck: is the real place, as actually built, fit to stand in? (three.js; runs once as the view opens) ----
// The layout check (osmPlace.checkLayout) works on the map's coordinates. This one casts rays at the meshes that were
// really drawn, from where each angler's eyes are: standing on the deck (not floating, not sunk into it), nothing
// round or above them (not inside a building or under something), a clear view down to the water, and water (not
// ground) in front. A real place that fails isn't shown as one: the representative place is used instead.
import * as THREE from "three";

export const SCENE_CHECK = { eye: 1.62, deckTol: 0.3, clear: 0.45, above: 4, view: [8, 14, 20, 26], spread: [-0.26, 0, 0.26] };

export function checkScene(place, targets) {
  const why = [], ray = new THREE.Raycaster(), hit = (o, d, far) => { ray.set(o, d); ray.far = far; const h = ray.intersectObjects(targets, false); return h.length ? h[0] : null; };
  for (const sp of place.spots || []) {
    const [x, y, z] = sp.at, eye = new THREE.Vector3(x, y + SCENE_CHECK.eye, z), f = new THREE.Vector3(Math.sin(sp.face), 0, -Math.cos(sp.face));
    const down = hit(eye, new THREE.Vector3(0, -1, 0), 10);
    if (!down || Math.abs(eye.y - down.distance - y) > SCENE_CHECK.deckTol) why.push(`${sp.name}: not standing on the deck`);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); for (const hgt of [0.4, 1.0, SCENE_CHECK.eye]) { const h = hit(new THREE.Vector3(x, y + hgt, z), d, SCENE_CHECK.clear); if (h) { why.push(`${sp.name}: something within ${SCENE_CHECK.clear} m`); k = 99; break; } } }
    if (hit(eye, new THREE.Vector3(0, 1, 0), SCENE_CHECK.above)) why.push(`${sp.name}: something overhead`);
    let blocked = 0, n = 0;
    // across a river: past the bank (from a 2.2 m bank the water right below it is out of sight), short of the far bank
    const dists = place.venue === "river" || place.venue === "lake" ? [8, 11, 14] : SCENE_CHECK.view;
    for (const m of dists) for (const s of SCENE_CHECK.spread) {
      const dir = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s), target = new THREE.Vector3(x + dir.x * m, 0.05, z + dir.z * m), v = target.clone().sub(eye), L = v.length();
      n++; if (hit(eye, v.normalize(), L - 0.4)) blocked++;
    }
    if (blocked > n * 0.25) why.push(`${sp.name}: the view of the water is blocked (${blocked} of ${n})`);
    const ahead = new THREE.Vector3(x + f.x * 6, y + 3, z + f.z * 6), d2 = hit(ahead, new THREE.Vector3(0, -1, 0), 8);
    if (d2 && ahead.y - d2.distance > 0.3) why.push(`${sp.name}: ground, not water, in front`);
  }
  return { ok: !why.length, why };
}
