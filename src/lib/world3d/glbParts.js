// ---- glbParts: models made in Blender (source-assets/), loaded once and shared ----
// FishDock's equipment models (the reel, the nets, ...) are modelled, textured and exported from Blender as .glb files
// in public/models/. Each is fetched once, the first time something asks for it, and every angler gets a clone sharing
// its geometry and materials. Until it has loaded, or if it can't (offline, an old phone), the simple model built in
// code stays: nothing waits on a model and nothing breaks without one.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { weather } from "./textures3d.js";

export const MODELS_BASE = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/models/"; // (__fdAssetBase: set only by a self-contained preview page, its files beside it)
const MODEL_V = typeof __BUILD_ID__ !== "undefined" && !(typeof window !== "undefined" && window.__fdAssetBase) ? "?v=" + __BUILD_ID__ : "";
let loader = null;
const files = new Map();

/** The model's scene (a promise), loaded once. */
export function loadPart(name) {
  if (typeof document === "undefined") return Promise.reject(new Error("no document"));
  if (!files.has(name)) {
    loader ||= new GLTFLoader();
    // (the build's id on the address: the models keep their file names from one build to the next and are kept by
    // the browser for a week, so a phone that had fetched an earlier arms model went on drawing the old hands under new code)
    const p = loader.loadAsync(MODELS_BASE + name + ".glb" + MODEL_V).then((g) => g.scene);
    p.catch(() => files.delete(name));
    files.set(name, p);
  }
  return files.get(name);
}

const whole = new Map();
/** The whole model (its scene and its clips: { scene, animations }), loaded once; for a rigged model whose clips are
 * wanted too (fp_rig.glb). */
export function loadModel(name) {
  if (typeof document === "undefined") return Promise.reject(new Error("no document"));
  if (!whole.has(name)) {
    loader ||= new GLTFLoader();
    const p = loader.loadAsync(MODELS_BASE + name + ".glb" + MODEL_V);
    p.catch(() => whole.delete(name));
    whole.set(name, p);
  }
  return whole.get(name);
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
        // (green knotted nylon, as pier drop nets are sold, with a bigger mesh than a landing net's: the cords were a fine
        // black grid that read as a sieve; cut out more firmly so each cord shows)
        for (const k of ["map", "alphaMap", "normalMap"]) if (m[k]) { m[k] = m[k].clone(); m[k].repeat.multiplyScalar(0.55); m[k].needsUpdate = true; }
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a = clamp(diffuseColor.a * 5.0, 0.0, 1.0); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.15, 0.14), 0.85);\n#ifdef USE_ALPHAMAP\n{ vec2 q = vAlphaMapUv, e = vec2(0.0032); float a2 = texture2D(alphaMap, q).g; a2 = max(a2, max(max(texture2D(alphaMap, q + vec2(e.x, 0.0)).g, texture2D(alphaMap, q - vec2(e.x, 0.0)).g), max(texture2D(alphaMap, q + vec2(0.0, e.y)).g, texture2D(alphaMap, q - vec2(0.0, e.y)).g))); diffuseColor.a = clamp(max(diffuseColor.a, a2 * 3.0), 0.0, 1.0); diffuseColor.rgb *= 0.75 + 0.35 * texture2D(alphaMap, q).g; }\n#endif"); }; // (the cords thickened, each grown by a few texels: thin, they read as wire, not knotted nylon cord; their middles a shade lighter, rounded)
        m.customProgramCacheKey = () => "fdnet4"; o.renderOrder = 2;
      }
    });
  }
  // the weight ring hangs at the bottom of the bag; set down, the bag slumps flat (its "flat" shape) but the weight is a
  // separate part, so it stayed where the hanging bag's bottom had been: 24 cm down through the pavement. Worked out
  // here: how far it has to rise to sit on the flattened bag (angler.js lifts it as the net is set down)
  net.userData.weight = null; net.userData.restDrop = null;
  const w = net.children.find((c) => /weight/i.test(c.name)) || null;
  if (w && bag?.morphTargetDictionary?.flat != null) {
    net.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(net.matrixWorld).invert(), v = new THREE.Vector3();
    const lowest = (o, dAttr) => { let mn = Infinity; o.updateMatrixWorld(true); const p = o.geometry.attributes.position, rel = o.geometry.morphTargetsRelative; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (dAttr) { if (rel) v.x += dAttr.getX(i), v.y += dAttr.getY(i), v.z += dAttr.getZ(i); else v.fromBufferAttribute(dAttr, i); } v.applyMatrix4(o.matrixWorld).applyMatrix4(inv); mn = Math.min(mn, v.y); } return mn; };
    const flatMin = lowest(bag, bag.geometry.morphAttributes.position?.[bag.morphTargetDictionary.flat]), wMin = lowest(w, null);
    const lift = Math.max(0, flatMin - wMin + 0.005); net.userData.restDrop = Math.max(0, -Math.min(flatMin, wMin + lift)) / net.scale.y; // (how far the slumped net reaches below its hoop, at scale 1)
    if (lift > 0) net.userData.weight = { obj: w, y0: w.position.y, lift: lift / (w.parent === net ? 1 : 1) };
  }
  return bag;
}

// ---- the pier furniture's finishes, aged (pierprops.glb's materials, changed once when it loads) ----
// The models carry plain colours; on a pier everything has been painted over and weathered. Each finish gets its own
// wear (textures3d.weather: sampled by position, as the bench and bollard have no uv map): cast iron painted black,
// chipped to rust at the edges and darker at the foot; timber slats silvered with grain and cracks; the lifebuoy
// housing's red paint faded and chalky with a little rust; the galvanised post dull and mottled. `wet` (the rain)
// darkens them and makes them shine.
const PROP_WEAR = {
  cast_iron: { color: [0.05, 0.055, 0.058], roughness: 0.6, metalness: 0.25, o: { scale: 0.25, mottle: 0.45, bump: 0.9, rust: [0.3, 0.14, 0.055, 0.024], grime: [2.2, 2.55, 0.25], rough: [0.8, 1.3] } },
  bench_wood: { color: [0.3, 0.26, 0.2], roughness: 0.85, metalness: 0, o: { wood: "x", scale: 1, mottle: 0.2, bump: 0.35, rough: [0.9, 1.1] } },
  housing_red: { color: [0.46, 0.08, 0.06], roughness: 0.6, metalness: 0.05, o: { scale: 0.3, mottle: 0.4, bump: 0.5, rust: [0.18, 0.14, 0.055, 0.024], grime: [2.2, 2.8, 0.2], rough: [0.85, 1.3] } },
  galvanised: { color: [0.5, 0.52, 0.52], roughness: 0.62, metalness: 0.55, o: { scale: 0.5, mottle: 0.35, bump: 0.5, rust: [0.12, 0.16, 0.065, 0.028], grime: [2.2, 2.6, 0.2], rough: [0.8, 1.25] } },
};
export function weatherPierProps(scene, wet) {
  if (scene.userData.weathered) return; scene.userData.weathered = true;
  const done = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const w = PROP_WEAR[m.name]; if (!w || done.has(m)) continue; done.add(m);
      m.color.setRGB(...w.color); m.roughness = w.roughness; m.metalness = w.metalness;
      weather(m, { ...w.o, wet });
    }
  });
}

/** For tests: forget what's loaded. */
export const _resetParts = () => files.clear();
