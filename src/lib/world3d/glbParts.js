// ---- glbParts: models made in Blender (source-assets/), loaded once and shared ----
// FishDock's equipment models (the reel, the nets, ...) are modelled, textured and exported from Blender as .glb files
// in public/models/. Each is fetched once, the first time something asks for it, and every angler gets a clone sharing
// its geometry and materials. Until it has loaded, or if it can't (offline, an old phone), the simple model built in
// code stays: nothing waits on a model and nothing breaks without one.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const MODELS_BASE = "/models/";
let loader = null;
const files = new Map();

/** The model's scene (a promise), loaded once. */
export function loadPart(name) {
  if (typeof document === "undefined") return Promise.reject(new Error("no document"));
  if (!files.has(name)) {
    loader ||= new GLTFLoader();
    const p = loader.loadAsync(MODELS_BASE + name + ".glb").then((g) => g.scene);
    p.catch(() => files.delete(name));
    files.set(name, p);
  }
  return files.get(name);
}

/** A named node of a model, cloned (geometry and materials shared), or null. */
export function clonePart(scene, nodeName) {
  const n = scene.getObjectByName(nodeName);
  if (!n) return null;
  const c = n.clone(true);
  c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return c;
}

/**
 * Put the Blender reel in place of the simple one, keeping the reel's own groups (so whatever turns the rotor and the
 * handle, and finds the handle's knob, carries on unchanged): the parts that turn go into those groups, the rest into
 * the reel. The models are built in the same frame as the simple reel (x left of the rod, y up, z towards the tip).
 */
export function fitReel(reel, scene) {
  const src = clonePart(scene, "reel"); if (!src) return false;
  const rotor = reel.userData.rotor, crank = reel.userData.crank;
  // the simple model's meshes go (its groups stay)
  for (const g of [reel, rotor, crank]) for (const c of [...g.children]) if (c.isMesh) { g.remove(c); }
  const move = (from, to) => { for (const c of [...from.children]) { from.remove(c); to.add(c); } };
  for (const c of [...src.children]) {
    if (c.name === "rotor") move(c, rotor);
    else if (c.name === "crank") move(c, crank);
    else if (!c.name.startsWith("att_")) reel.add(c);
  }
  reel.userData.model = "blender";
  return true;
}

/**
 * Put the Blender net (the drop net with its weight ring, or the landing net's frame and spreader) in place of the
 * simple one in `net` (its group: hoop centre at the origin, the bag hanging below). Returns the new bag (a mesh with
 * two shape keys, laden and flat) or null. The landing net's handle stays the angler's own (it's drawn to the hands).
 */
export function fitNet(net, scene, kind = "drop") {
  const src = clonePart(scene, kind === "landing" ? "landingnet" : "dropnet"); if (!src) return null;
  for (const c of [...net.children]) if (c.isMesh) net.remove(c);
  let bag = null;
  for (const c of [...src.children]) {
    if (c.name.startsWith("att_") || /handle|grip/.test(c.name)) continue;
    net.add(c);
    c.traverse((o) => {
      if (!o.isMesh) return;
      // the hoop and its weight ring: a dull, pale galvanised finish that reads against dark water from any angle (as
      // polished metal it mirrored the dark sea and vanished at the surface)
      if (/hoop|weight|ring/i.test(o.name) && !o.morphTargetDictionary) { const m = o.material = o.material.clone(); m.metalness = Math.min(m.metalness ?? 0, 0.35); m.roughness = Math.max(m.roughness ?? 0.5, 0.5); m.color?.setRGB(0.72, 0.74, 0.75); }
      if (/bag/.test(o.name) || o.morphTargetDictionary) {
        bag = o;
        // the mesh's cords are in the texture's alpha: seen from both sides, blended (a hard cut-out loses the fine cords
        // at any distance), the cords' cover boosted a little so the bag still reads as netting from across the deck
        const m = o.material = o.material.clone(); m.transparent = true; m.alphaTest = 0.04; m.side = THREE.DoubleSide; m.depthWrite = false;
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a = clamp(diffuseColor.a * 4.0, 0.0, 1.0); diffuseColor.rgb *= 0.75;"); };
        m.customProgramCacheKey = () => "fdnet2"; o.renderOrder = 2;
      }
    });
  }
  return bag;
}

/** For tests: forget what's loaded. */
export const _resetParts = () => files.clear();
