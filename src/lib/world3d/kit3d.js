// FishDock: the ground's clutter from real photoscans (High and Ultra): rocks and stones, driftwood, the tide's wrack,
// nettles, docks and weeds at the foot of walls, grass clumps, willowherb and ferns on the banks. The models are Poly
// Haven's (CC0): each set split in Blender into its separate plants or rocks (variants), each cut down to a near and a
// far level (source h207: exports/kit2/<id>.glb, objects <id>_v<k>_near and _far, shipped as public/models/kit/<id>.glb
// with their pictures at 512 px); the wrack is modelled there. Each placement is one of its model's variants, sized by
// the set's tallest. Each variant is one instanced mesh per level and material:
// rocks and wood within NEAR metres of the camera at their near level, out to farD() their far one, none beyond; a plant
// near within PLANT_NEAR, and out only as far as its size can be seen in the grass (PLANT_PER_M metres for each metre
// it stands, plantFarD() at most: on Aaron's PC every plant out to 170 m took Whitby from 3.7 to 13.9 million triangles a
// frame and from 94 to 64 frames a second); looked at again as the camera moves. Where each goes is the place's
// (realPlace.js): this only draws them, each at its spot, turned and sized.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MODELS_BASE } from "./glbParts.js";
import { DETAIL } from "./detail.js";

const NEAR = 45, PLANT_NEAR = 22, PLANT_PER_M = 120;
const farD = () => (DETAIL.ultra ? 170 : 120), plantFarD = () => (DETAIL.ultra ? 90 : 60); // (Ultra further out, detail.js)
const PLANTS = /plant|shrub|grass|fern|dandelion|wrack/, SHADE = /nettle|shrub_02|fern/; // (the plants tall enough for their shadows to tell)
let loader = null;
const kits = new Map();
function loadKit(id) {
  if (!kits.has(id)) {
    loader ||= new GLTFLoader();
    kits.set(id, loader.loadAsync(MODELS_BASE + "kit/" + id + ".glb").then((g) => {
      // (its variants: objects named <id>_v<k>_near and _far; a model without them is one variant)
      const V = new Map();
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const nm = o.name + " " + (o.parent?.name || ""), vm = nm.match(/_v(\d+)_/), v = vm ? +vm[1] : 0, l = /_far/.test(nm) ? "far" : "near";
        const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
        const m = o.material.clone(); if (m.map) m.map.anisotropy = 4;
        // (plants' leaves are cut out of their pictures: drawn from both sides, cut at half)
        if (m.transparent || m.alphaTest > 0 || /plant|grass|fern|nettle|weed|shrub|sorrel|dandelion/i.test(id)) { m.transparent = false; m.alphaTest = Math.max(0.5, m.alphaTest || 0); m.side = THREE.DoubleSide; }
        // (the wrack's olive-brown lifted: modelled in its colour as a dark heap it drew as black scribbles on the sand)
        if (id === "wrack") m.color.multiplyScalar(1.7);
        if (!V.has(v)) V.set(v, { near: [], far: [] });
        V.get(v)[l].push({ geo, mat: m });
      });
      const variants = [...V.values()].filter((x) => x.near.length || x.far.length);
      for (const x of variants) {
        if (!x.far.length) x.far = x.near; if (!x.near.length) x.near = x.far;
        // (how big it is as modelled, for sizing it: its height and its widest)
        const bb = new THREE.Box3(); for (const q of x.near) { q.geo.computeBoundingBox(); bb.union(q.geo.boundingBox); }
        x.size = bb.getSize(new THREE.Vector3()); x.base = bb.min.y;
      }
      // (sized by the tallest: a set's seedlings and low rosettes stay that much smaller than its tall plants)
      const top = Math.max(...variants.map((x) => x.size.y));
      for (const x of variants) x.top = top;
      return variants.length ? variants : null;
    }).catch(() => null));
  }
  return kits.get(id);
}

/**
 * @param {THREE.Group} group
 * @param {{ id: string, at: number[][] }[]} sets  each kind and where it goes: [x, y, z, turn (radians), size (metres
 *   tall, or across for flat things), tilt (0..1, how far it leans to the slope)]
 * @returns {{ update(t, cam), ready: Promise }}
 */
export function buildKit(group, sets) {
  if (typeof document === "undefined" || !sets?.length) return { update() {}, ready: Promise.resolve() };
  const live = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const ready = Promise.all(sets.filter((S) => S.at.length).map((S) => loadKit(S.id).then((vars) => {
    if (!vars) return;
    // (each placement one of the model's variants, by its place, the same every time)
    const byV = vars.map(() => []);
    S.at.forEach((a, i) => { byV[Math.abs(Math.floor(a[0] * 7.31 + a[2] * 3.17 + i)) % vars.length].push(a); });
    vars.forEach((lv, vi) => {
      const at = byV[vi]; if (!at.length) return;
      // (shadows from rocks and wood, and from the taller plants' near level; a small or far plant's is lost in the grass)
      const solid = !PLANTS.test(S.id);
      const cap = at.length, mk = (parts, near) => parts.map(({ geo, mat }) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.castShadow = solid || (near && SHADE.test(S.id)); m.receiveShadow = true; m.frustumCulled = false; m.name = "fdKit_" + S.id; m.noReflect = true; m.userData.at = at; group.add(m); return m; }); // (not in the water's reflection: small things on the ground, drawn again for nothing)
      // (each one's matrix once: its spot, its turn and size; set into the levels as the camera moves)
      const k = S.flat ? 1 : 1 / Math.max(1e-3, lv.top);
      const mats = at.map(([x, y, z, turn = 0, size = 1, tilt = 0]) => {
        const sc = size * k; e.set(tilt * 0.12, turn, tilt * 0.08); q.setFromEuler(e);
        return m4.compose(p.set(x, y - lv.base * sc - (S.sink ?? 0.03) * (S.flat ? sc * lv.size.y : size), z), q, s.set(sc, sc, sc)).clone();
      });
      const near = mk(lv.near, true), far = lv.far === lv.near ? near : mk(lv.far, false);
      // (how far each is drawn, its near level and its last, squared)
      const reach = at.map(([, , , , size = 1]) => { const f = solid ? farD() : Math.min(plantFarD(), Math.max(30, size * PLANT_PER_M)); return [Math.min(solid ? NEAR : PLANT_NEAR, f) ** 2, f * f]; });
      live.push({ S: { ...S, at }, near, far, mats, reach, at: new THREE.Vector3(1e9, 0, 1e9) });
    });
  })));
  function update(t, cam) {
    if (!cam) return;
    for (const L of live) {
      if (cam.position.distanceToSquared(L.at) < 25) continue; // (looked at again every 5 m)
      L.at.copy(cam.position);
      let kn = 0, kf = 0; const cx = cam.position.x, cz = cam.position.z;
      for (let i = 0; i < L.mats.length; i++) {
        const a = L.S.at[i], d2 = (a[0] - cx) ** 2 + (a[2] - cz) ** 2, [rn, rf] = L.reach[i];
        if (d2 >= rf) continue;
        if (d2 < rn || L.far === L.near) { for (const m of L.near) m.setMatrixAt(kn, L.mats[i]); kn++; }
        else { for (const m of L.far) m.setMatrixAt(kf, L.mats[i]); kf++; }
      }
      for (const m of L.near) { m.count = kn; m.instanceMatrix.needsUpdate = true; }
      if (L.far !== L.near) for (const m of L.far) { m.count = kf; m.instanceMatrix.needsUpdate = true; }
    }
  }
  return { update, ready };
}
