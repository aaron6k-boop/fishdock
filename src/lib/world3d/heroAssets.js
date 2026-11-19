// ---- heroAssets: a landmark modelled in Blender, swapped in for the shape drawn in code ----
// A place's best-known buildings (Whitby's lighthouses, ...) are modelled properly in Blender from photographs and real
// dimensions (source-assets/blender/build_*.py), textured with photoscans and shaded by ambient occlusion baked into
// their vertices, and exported as .glb files with three levels of detail each (<name>_LOD0, _LOD1, _LOD2). The shapes
// drawn in code stand in until the model has loaded (and stay if it can't load); then they're hidden and the model is
// shown in their place, the level of detail chosen by distance as the camera moves.
import * as THREE from "three";
import { loadPart } from "./glbParts.js";

/**
 * Swaps the model in. standIns: the meshes drawn in code (hidden once it's loaded). file: the .glb in public/models.
 * node: the model's name in it. at: [x, z]; base: the height it stands on; ry: its turn about the vertical.
 * look(material): changes a material once when it loads (the game's own weathering and tint); dist: the distances at
 * which LOD1 and LOD2 take over.
 */
export function heroSwap(group, standIns, file, node, { at, base, ry = 0, look = null, dist = [70, 220] } = {}) {
  return loadPart(file).then((scene) => {
    const lod = new THREE.LOD(); lod.name = node;
    // (each swap its own copies of the model's materials: two lighthouses from one file shared them, and the second's
    // weathering was compiled into the first's shader again, which then failed and drew nothing)
    const own = new Map(), mine = (mt) => { if (!own.has(mt)) { const c = mt.clone(); if (look) look(c); own.set(mt, c); } return own.get(mt); };
    for (let i = 0; i < 3; i++) {
      const src = scene.getObjectByName(`${node}_LOD${i}`); if (!src) continue;
      const o = src.clone(true); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = i < 2; m.receiveShadow = true; m.userData.kind = "a building";
        m.material = Array.isArray(m.material) ? m.material.map(mine) : mine(m.material);
      });
      lod.addLevel(o, i === 0 ? 0 : dist[i - 1]);
    }
    if (!lod.levels.length) return null;
    lod.position.set(at[0], base, at[1]); lod.rotation.y = ry; lod.updateMatrixWorld(true);
    group.add(lod);
    for (const m of standIns) m.visible = false;
    return lod;
  }).catch(() => null); // (the shapes drawn in code stay)
}
