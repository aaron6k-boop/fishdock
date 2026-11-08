// ---- rodKit: the rod and reel modelled in Blender (public/models/rodkit.glb), put together and bent in the game ----
// source-assets/blender/build_rodkit.py makes them. The game:
//   - bends the blank: a unit tube whose rings are laid along the rod's curve each frame (angler.js works out the curve
//     from the line's pull), tapered from the butt to the tip, its normals straight out from the curve;
//   - sets the handle (grips, reel seat) rigid on the stiff butt section, scaled to each rod's length and thickness;
//   - hangs a guide at each ring position under the bending blank, square to it, with its thread whippings either side,
//     and the tip ring on the tip (instanced: one draw per material however many guides);
//   - fits the reel's moving parts: the rotor and its bail, the spool, the handle on its axle.
// The line (fishLine.js) runs from the spool over the line roller and through each ring (ringCentres, ringAxes,
// ringRadii: it bears on whichever side of a ring the bent rod pulls it to) and the tip ring.
// Materials are physically based, with small drawn maps (a fine carbon scrim, EVA foam, brushed metal, braid), and take
// the scene's environment map for their reflections, so they follow the light, rain, dusk and night like everything else.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const GUIDE_DROP = 1.85; // (the guide's ring centre below its feet, in ring radii: build_rodkit.py)
const HANDLE_SEAT = 0.45, HANDLE_R = 0.0152; // (the modelled handle's seat position and rear grip radius: a pier rod's)

// ---- materials: shared by every rod (made once) ----
let MATS = null;
function canvasTex(n, draw, srgb = false) {
  const c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d"); draw(g, n);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// a normal map from a height function h(x, y) in 0..1 over an n x n tile
function normalTex(n, h, k = 2) {
  return canvasTex(n, (g) => {
    const img = g.createImageData(n, n), H = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) H[y * n + x] = h(x, y);
    const at = (x, y) => H[((y + n) % n) * n + ((x + n) % n)];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function rodMaterials() {
  if (MATS) return MATS;
  const doc = typeof document !== "undefined";
  // carbon: a fine diagonal scrim (the blank's outer wrap) under a glossy finish
  const scrim = doc ? normalTex(64, (x, y) => { const a = ((x + y) % 16) / 16, b = ((x - y + 64) % 16) / 16; return 0.5 + 0.25 * Math.sin(a * Math.PI * 2) * (((x >> 3) + (y >> 3)) % 2 ? 1 : 0.4) + 0.1 * Math.sin(b * Math.PI * 2); }, 1.2) : null;
  // EVA foam: small pores and a soft grain
  const foam = doc ? normalTex(128, (x, y) => { let v = 0.6; for (let k = 0; k < 3; k++) { const s = 4 << k, fx = Math.floor(x / s), fy = Math.floor(y / s); v -= hash(fx + k * 17, fy) > 0.82 ? 0.3 / (k + 1) : 0; } return v + hash(x, y) * 0.08; }, 3) : null;
  // brushed metal: streaks round a part (its roughness varying along them)
  const brushed = doc ? canvasTex(64, (g, n) => { for (let y = 0; y < n; y++) { const v = 150 + hash(1, y) * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, n, 1); } }) : null;
  // braid: the line on the spool, fine crossing strands
  const braid = doc ? normalTex(32, (x, y) => 0.5 + 0.5 * Math.sin(((x + y * 2) % 8) / 8 * Math.PI * 2), 1.5) : null;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    // (carbon and epoxy are not metals: a satin finish over the weave, not a mirror; the blue accents held back)
    // (a lacquered blank: the carbon weave satin under a thin glossy coat, a crisp highlight running along the rod as a
    // real one shows. One clearcoat lobe on a few small meshes: cheap enough for phones)
    rod_carbon: new THREE.MeshPhysicalMaterial({ color: 0x171a1f, metalness: 0.05, roughness: 0.42, normalMap: scrim, normalScale: new THREE.Vector2(0.22, 0.22), clearcoat: 0.85, clearcoatRoughness: 0.12 }),
    rod_eva: std({ color: 0x1a1a1b, roughness: 0.94, metalness: 0, normalMap: foam, normalScale: new THREE.Vector2(0.7, 0.7) }),
    gunmetal: std({ color: 0x4a4f56, metalness: 0.9, roughness: 0.34, roughnessMap: brushed }),
    chrome: std({ color: 0xc9ccd0, metalness: 1, roughness: 0.22 }),
    blue_anodised: new THREE.MeshPhysicalMaterial({ color: 0x2b4f96, metalness: 0.8, roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.18 }), // (anodised under a clear lacquer)
    ceramic: std({ color: 0x2b2d31, metalness: 0.1, roughness: 0.18 }),
    reel_graphite: new THREE.MeshPhysicalMaterial({ color: 0x1e2024, metalness: 0.05, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.3 }), // (moulded graphite body, a little gloss)
    reel_brushed: std({ color: 0x9a9fa6, metalness: 1, roughness: 0.3, roughnessMap: brushed }),
    rubber: std({ color: 0x18181a, metalness: 0, roughness: 0.82, normalMap: foam, normalScale: new THREE.Vector2(0.3, 0.3) }),
    // (the spool full of blue line: many turns of it read a deep blue, though a single strand in the air is pale)
    braid_blue: std({ color: 0x2a63c4, metalness: 0, roughness: 0.42, normalMap: braid, normalScale: new THREE.Vector2(0.5, 0.5) }),
    thread_blue: std({ color: 0x24499a, metalness: 0.1, roughness: 0.28 }),
    // (the reel as Aaron's reference: piano-black body, polished silver side plates, chrome trim)
    reel_black: new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, metalness: 0.1, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    reel_silver: std({ color: 0xc0c5cb, metalness: 1, roughness: 0.2, roughnessMap: brushed }),
    // (the reel seat's threaded barrel and lock nut: black, a little sheen)
    seat_black: std({ color: 0x141517, metalness: 0.35, roughness: 0.42, roughnessMap: brushed }),
  };
  if (scrim) { MATS.rod_carbon.normalMap.repeat.set(2, 1); }
  return MATS;
}

// ---- which finish each modelled part takes (by its name in rodkit.glb), where it isn't the model's own: the rod and
// reel as Aaron's reference photo has them. Silver guide frames round dark ceramic rings; a chrome-hooded black screw
// seat; a gloss black reel with polished silver side plates, chrome trim, a chrome crank and a black barrel knob ----
const FINISH = [
  [/^(guide_frame|guide_foot|guide_leg|tiptop_frame|tiptop_tube)/, "chrome"],
  [/^(reel_body|reel_back|reel_nose|reel_foot|reel_stem|rotor_cup|spool_body|spool_skirt|drag_knob)/, "reel_black"],
  [/^reel_cover/, "reel_silver"],
  [/^(reel_trim|rotor_arm|rotor_trim|spool_trim|drag_trim|crank_arm|crank_hub|crank_cap|winding_check)/, "chrome"],
  [/^(seat_barrel|seat_locknut|seat_slot)/, "seat_black"],
];
const finishOf = (node, mat) => { for (const [re, m] of FINISH) if (re.test(node)) return m; return mat; };

// ---- a node's meshes merged, one mesh per material, in the node's own frame (children named in `skip` left out) ----
function mergeOwn(node, skip = new Set()) {
  const M = rodMaterials(), by = new Map();
  node.updateMatrixWorld(true);
  const inv = node.matrixWorld.clone().invert();
  const visit = (o) => {
    if (o !== node && skip.has(o.name)) return;
    if (o.isMesh) {
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      src.applyMatrix4(inv.clone().multiply(o.matrixWorld));
      const g = new THREE.BufferGeometry(); g.setAttribute("position", src.attributes.position);
      if (src.attributes.normal) g.setAttribute("normal", src.attributes.normal); else { g.computeVertexNormals(); }
      if (!g.attributes.normal) g.setAttribute("normal", src.attributes.normal);
      // texture coordinates round the part's own axis where the model has none (for the foam and the brushing)
      if (src.attributes.uv) g.setAttribute("uv", src.attributes.uv);
      else { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getY(i), p.getX(i)) / (Math.PI * 2) + 0.5; uv[i * 2 + 1] = p.getZ(i) * 25; } g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); }
      const name = finishOf(o.name || "", (o.material?.name || "chrome").replace(/\.\d+$/, ""));
      if (!by.has(name)) by.set(name, []); by.get(name).push(g);
    }
    for (const c of o.children) visit(c);
  };
  visit(node);
  const out = new THREE.Group();
  for (const [name, list] of by) { const m = new THREE.Mesh(mergeGeometries(list), M[name] || M.chrome); m.castShadow = true; m.receiveShadow = true; m.name = name; out.add(m); }
  return out;
}

/**
 * Fit the modelled reel into the angler's reel group, keeping its rotor and crank groups (whatever turns them carries
 * on), and adding the spool and the bail. reel.userData then has: rotor, crank, spool, bail, knob (the knob's centre,
 * in the crank's frame), roller (in the bail's frame), spoolZ.
 */
export function fitRodReel(reel, scene) {
  const src = scene.getObjectByName("reel"); if (!src) return false;
  const u = reel.userData, rotor = u.rotor, crank = u.crank;
  for (const g of [reel, rotor, crank]) for (const c of [...g.children]) if (c.isMesh || c.isGroup && c !== rotor && c !== crank) g.remove(c);
  const R0 = src.getObjectByName("rotor"), B0 = src.getObjectByName("bail"), S0 = src.getObjectByName("spool"), C0 = src.getObjectByName("crank");
  reel.add(mergeOwn(src, new Set(["rotor", "spool", "crank"])));
  rotor.position.copy(R0.position); rotor.rotation.set(0, 0, 0); rotor.add(mergeOwn(R0, new Set(["bail"])));
  const bail = new THREE.Group(); bail.position.copy(B0.position); bail.add(mergeOwn(B0)); rotor.add(bail);
  const spool = new THREE.Group(); spool.position.copy(S0.position); spool.add(mergeOwn(S0)); reel.add(spool);
  crank.position.copy(C0.position); crank.rotation.set(0, 0, 0); crank.add(mergeOwn(C0));
  u.spool = spool; u.bail = bail; u.spoolZ = S0.position.z;
  u.knob = src.getObjectByName("att_knob").position.clone(); u.roller = src.getObjectByName("att_roller").position.clone();
  u.model = "rodkit";
  return true;
}

/**
 * The rod's own parts for one rod (R: angler.js's rod: len, r0, r1, seat, g0, guides, handle). Returns
 * { update(pts, frameOf), ringCentres, tipRing, group } or null. pts: the rod's curve from butt to tip (equal steps);
 * frameOf(t): a quaternion for a tangent (x across, y up, z along the rod).
 */
export function buildRod(scene, R) {
  const M = rodMaterials();
  const H = scene.getObjectByName("rodhandle"), B = scene.getObjectByName("blank"), G = scene.getObjectByName("guide"), W = scene.getObjectByName("wrap"), T = scene.getObjectByName("tiptop");
  if (!H || !B || !G || !W || !T) return null;
  const group = new THREE.Group();
  // the handle: scaled along to this rod's seat and round to its grip
  const handle = mergeOwn(H); const gripR = (R.handle[1] && R.handle[1][2]) || HANDLE_R;
  handle.scale.set(gripR / HANDLE_R, gripR / HANDLE_R, R.seat / HANDLE_SEAT); group.add(handle);
  // the blank: its own copy of the tube to bend
  const bm = B.isMesh ? B : B.getObjectByProperty("isMesh", true);
  const geo = bm.geometry.clone();
  const base = geo.attributes.position.array.slice(); // (unit tube: x, y on the unit circle, z = s from 0 to 1)
  // each vertex's ring (by its s): the rings' frames are worked out once a frame, then every vertex placed from its ring's
  const zs = [...new Set(Array.from({ length: base.length / 3 }, (_, i) => +base[i * 3 + 2].toFixed(5)))].sort((a, b) => a - b);
  const ringOf = new Uint16Array(base.length / 3).map((_, i) => zs.indexOf(+base[i * 3 + 2].toFixed(5)));
  const RP = zs.map(() => new THREE.Vector3()), RX = zs.map(() => new THREE.Vector3()), RY = zs.map(() => new THREE.Vector3()), RR = zs.map((z) => 0);
  geo.attributes.position.setUsage(THREE.DynamicDrawUsage); geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  const mat = M.rod_carbon.clone(); if (mat.normalMap) { mat.normalMap = mat.normalMap.clone(); mat.normalMap.repeat.set(2, R.len / 0.02); mat.normalMap.needsUpdate = true; }
  // the maker's print on the blank just above the fore grip, as every real rod has: its name and rating in fine pale
  // letters along the top of the blank (a made-up maker: no real brand). Drawn in the blank's own shader from where each
  // point of the tube is (how far along, which way round), so it bends with the rod and costs one lookup
  { const lab = new Float32Array(base.length / 3 * 2); for (let i = 0; i < lab.length / 2; i++) { lab[i * 2] = base[i * 3 + 2]; lab[i * 2 + 1] = Math.atan2(base[i * 3 + 1], base[i * 3]); } geo.setAttribute("aLab", new THREE.BufferAttribute(lab, 2)); }
  const hEnd = R.handle[R.handle.length - 1][1], S0 = (hEnd + 0.05) / R.len, S1 = (hEnd + 0.26) / R.len, TW0 = R.whiteTip ?? 2;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 96; const g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, 1024, 96);
    g.fillStyle = "rgba(49,88,159,0.95)"; g.fillRect(0, 40, 64, 16); // (a band in the rod's trim colour)
    g.fillStyle = "rgba(225,229,233,0.92)"; g.font = "bold 46px Arial, sans-serif"; g.textBaseline = "middle"; g.fillText("SEAFORM", 86, 50);
    g.font = "38px Arial, sans-serif"; g.fillStyle = "rgba(200,206,212,0.85)"; g.fillText("PIER PRO  12'0\"  4-8 oz  113-227 g", 330, 50);
    const lt = new THREE.CanvasTexture(c); lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 8;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLab = { value: lt };
      sh.vertexShader = "attribute vec2 aLab;\nvarying vec2 vLab;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLab = aLab;");
      sh.fragmentShader = "uniform sampler2D uLab;\nvarying vec2 vLab;\n" + sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
        { float u = (vLab.x - ${S0.toFixed(5)})/${(S1 - S0).toFixed(5)}, a = (vLab.y - 1.5708)/0.85;
          if (u > 0. && u < 1. && abs(a) < 1.) { vec4 t = texture2D(uLab, vec2(u, .5 - a*.5)); diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, t.a); } }
        // the top of the tip painted white, with an orange band just under the tip ring (to see bites against the sea
        // or the sky, as Aaron's rod has)
        { float s = vLab.x, w = smoothstep(${TW0.toFixed(4)}, ${(TW0 + 0.003).toFixed(4)}, s)*(1. - smoothstep(.9955, .9975, s)), o = smoothstep(.976, .978, s)*(1. - smoothstep(.991, .993, s))*${TW0 < 1 ? "1." : "0."};
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .64, .66), w); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95, .16, .02), o); }`);
    };
    mat.customProgramCacheKey = () => "fdblank2";
  }
  const blank = new THREE.Mesh(geo, mat); blank.castShadow = true; blank.frustumCulled = false; group.add(blank);
  const radius = (s) => R.r0 + (R.r1 - R.r0) * Math.pow(s, 0.8);
  // guides (and the tip ring) and whippings, instanced: one mesh per material for all of them
  const inst = (node, n) => mergeOwn(node).children.map((m) => { const im = new THREE.InstancedMesh(m.geometry, m.material, n); im.castShadow = true; im.frustumCulled = false; group.add(im); return im; });
  const nG = R.guides.length, guides = inst(G, nG), tip = mergeOwn(T); tip.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); group.add(tip);
  // whippings: one either side of each guide's feet, and trim bands on the blank above the fore grip and at the joint
  const bands = [R.handle[R.handle.length - 1][1] + 0.012, R.handle[R.handle.length - 1][1] + 0.03, R.len * 0.48];
  const wraps = inst(W, nG * 2 + bands.length);
  // (the rings' radii: the butt guide's (g0: a 25 to 40 mm ring as on real rods) down to about 6 mm at the top guide,
  // shrinking fastest near the butt, as a real guide train does (each ring a set fraction of the one before). They were
  // half as big again, and the first rings looked like hoops in first person)
  const gMin = Math.min(R.g0, 0.003), ringSize = R.guides.map((s, i) => R.g0 * (gMin / R.g0) ** (i / Math.max(1, nG - 1)) ** 0.8);
  const ringCentres = R.guides.map(() => new THREE.Vector3()), tipRing = new THREE.Vector3();
  // (for the line: which way each ring faces, square to the blank, and its size; the line passes inside the ceramic)
  const ringAxes = R.guides.map(() => new THREE.Vector3()), tipAxis = new THREE.Vector3(), ringRadii = ringSize.slice(), tipSize = { r: 0.002 };
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(), Xv = new THREE.Vector3();
  const n = pts0 => pts0.length - 1;
  // a point and tangent at s (0..1) along the curve
  const P = new THREE.Vector3(), Tn = new THREE.Vector3();
  const at = (pts, s) => { const N = n(pts), x = Math.min(N - 1e-6, Math.max(0, s * N)), i = Math.floor(x), f = x - i; P.copy(pts[i]).lerp(pts[i + 1], f); Tn.copy(pts[i + 1]).sub(pts[i]).normalize(); return P; };
  const ringPos = [], ringN = [];
  return {
    group, blank, handle,
    ringCentres, tipRing, ringAxes, ringRadii, tipAxis, tipSize,
    update(pts, frameOf) {
      // the handle: on the butt, square to the first stretch of the rod (the stiff section: the bend starts above it)
      at(pts, 0); handle.position.copy(P); handle.quaternion.copy(frameOf(Tn));
      // the blank: each ring of the tube laid round the curve at its own s, at the rod's radius there
      const pos = geo.attributes.position, nor = geo.attributes.normal, arr = pos.array, nar = nor.array;
      zs.forEach((z, j) => { at(pts, z); const fq = frameOf(Tn); RP[j].copy(P); RX[j].set(1, 0, 0).applyQuaternion(fq); RY[j].set(0, 1, 0).applyQuaternion(fq); RR[j] = radius(z); });
      for (let i = 0, k = 0; k < arr.length; i++, k += 3) {
        const j = ringOf[i], x = base[k], y = base[k + 1], X = RX[j], Yr = RY[j], c = RP[j], r = RR[j];
        const nx = X.x * x + Yr.x * y, ny = X.y * x + Yr.y * y, nz = X.z * x + Yr.z * y;
        arr[k] = c.x + nx * r; arr[k + 1] = c.y + ny * r; arr[k + 2] = c.z + nz * r; nar[k] = nx; nar[k + 1] = ny; nar[k + 2] = nz;
      }
      pos.needsUpdate = true; nor.needsUpdate = true;
      // the guides: hung from the underside of the blank, square to it; the line's path through each ring's centre
      for (let i = 0; i < nG; i++) {
        const s = R.guides[i], g = ringSize[i]; at(pts, s); const fq = frameOf(Tn), down = Y.set(0, -1, 0).applyQuaternion(fq), rb = radius(s);
        v.copy(P).addScaledVector(down, rb);
        mx.compose(v, fq, sc.set(g, g, g)); for (const im of guides) im.setMatrixAt(i, mx);
        ringCentres[i].copy(v).addScaledVector(down, GUIDE_DROP * g); ringAxes[i].copy(Tn);
        // its whippings: over each foot, a little thicker than the blank
        const along = Xv.copy(Tn);
        for (const side of [-1, 1]) {
          mx.compose(v.copy(P).addScaledVector(along, side * 1.8 * g), fq, sc.set(rb * 1.12, rb * 1.12, 1.3 * g)); for (const im of wraps) im.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), mx);
        }
      }
      bands.forEach((m, j) => { const s = m / R.len; at(pts, s); const fq = frameOf(Tn), rb = radius(s); mx.compose(P, fq, sc.set(rb * 1.1, rb * 1.1, j === 2 ? 0.03 : 0.008)); for (const im of wraps) im.setMatrixAt(nG * 2 + j, mx); });
      for (const im of [...guides, ...wraps]) im.instanceMatrix.needsUpdate = true;
      // the tip ring, square to the tip
      at(pts, 1); const tq = frameOf(Tn), ts = Math.max(R.r1, 0.0018) * 1.1; tip.position.copy(P); tip.quaternion.copy(tq); tip.scale.setScalar(ts);
      tipRing.copy(P).addScaledVector(Y.set(0, -1, 0).applyQuaternion(tq), 1.6 * ts).addScaledVector(Tn, 0.3 * ts);
      tipAxis.copy(Tn); tipSize.r = 0.95 * ts; // (its ceramic: 0.8 of the frame's size across inside)
      void ringPos; void ringN;
    },
  };
}
