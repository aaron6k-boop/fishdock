// ---- realPlace: the meshes for a real place built from OpenStreetMap (see osmPlace.js) ----
// The ground from the grid, but with its edge snapped exactly onto the water's edge wherever there's a wall, so a deck
// meets its wall cleanly (sampled every few metres, the edge used to slope down below the water inside the wall and the
// sea showed through the walkway). Harbour walls only along real land-to-water edges (osmPlace.shoreEdges), drawn as
// steel sheet piling under a concrete cap; galvanised railings along them near the anglers; jetties on piles; the
// buildings from the architecture library (buildings3d.js). Materials are drawn on the phone (textures3d.js).
import * as THREE from "three";
import { thinTubes } from "./thinAA.js";
import { setTownStyle } from "./architecture.js";
import { unrle, GROUND, PLACE3D, inside } from "./osmPlace.js";
import { concrete, sheetPiling, detail, noise2, photoTex, weather, weatherTex, decalTex, grateTex, asphalt, bricks, woodTex, turf, DECAL } from "./textures3d.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildBuildings } from "./buildings3d.js";
import { loadPart, weatherPierProps } from "./glbParts.js";
import { buildSkyline } from "./skyline.js";
import { localFor } from "./localDetail.js";
import { LANDMARK_BUILDERS } from "./landmarks3d.js";
import { WET_PREP, WET_DARKEN, WET_NORMAL, wetRough, WET_SPOTS } from "./wetLook.js";
import { contactShadows } from "./contactShadow.js";
import { buildTrees } from "./trees3d.js";
import { buildGrassTufts } from "./grassTufts.js";
import { buildGrassField } from "./grassField.js";
import { buildChimneyCaps } from "./chimneys3d.js";
import { buildWindowModules } from "./windows3d.js";
import { buildKit } from "./kit3d.js";
import { buildBackdrops, backdropCovers } from "./backdrop3d.js";
import { columnGeometry, lanternAt, lampPools, shadeFromOwnLantern, COLUMN } from "./lamps3d.js";
import { buildOpenPier } from "./openPier.js";
import { terrainHill, reliefOf } from "./terrain3d.js";
import { deckHeight } from "./pierDeck.js";

const H_OF = [GROUND.water, GROUND.land, GROUND.beach, GROUND.grass];
// colours multiplied over the materials: concrete stays near white (its texture has the colour); sand, grass and the
// beach's wet slope under the water carry their own colour over a neutral detail map
const COL_OF = [[0.42, 0.44, 0.4], [1, 1, 1], [0.62, 0.54, 0.4], [0.26, 0.38, 0.17]];
const WALL_BOTTOM = GROUND.water - 0.8;

// ---- a stone pier's battered walls (Whitby's): each wall leans back as it rises, its foot pushed out ----
// geo: the pier's outline extruded from WALL_BOTTOM up to h (ring anticlockwise in x and -z, as built below); every
// vertex below the top moves out along its corner's outward direction by k metres for each metre below the top
function batter(geo, ring, h, k) {
  const n = ring.length, out = ring.map((q, i) => {
    const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n];
    const e1 = [q[0] - a[0], q[1] - a[1]], e2 = [b[0] - q[0], b[1] - q[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2]; let m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(...m) || 1; m = [m[0] / ml, m[1] / ml];
    const cosH = Math.max(0.5, m[0] * n2[0] + m[1] * n2[1]); // (a mitre, no more than twice as far at a sharp corner)
    const t = [q[0] + m[0] * 0.5, q[1] + m[1] * 0.5], sgn = inside(t, ring) ? -1 : 1;
    return [(m[0] * sgn) / cosH, (m[1] * sgn) / cosH];
  });
  const key = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`, at = new Map(ring.map((q, i) => [key(q[0], q[1]), i]));
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v); if (y > h - 0.01) continue;
    const i = at.get(key(pos.getX(v), pos.getZ(v))); if (i == null) continue;
    const d = (h - y) * k; pos.setX(v, pos.getX(v) + out[i][0] * d); pos.setZ(v, pos.getZ(v) + out[i][1] * d);
  }
  pos.needsUpdate = true; geo.computeVertexNormals();
}

// a hill function that is 0 on the solid piers' decks
function offPiers(hill, piers) {
  if (!hill) return null;
  const rs = (piers || []).filter((p) => p.ring && !p.open).map((p) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of p.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { r: p.ring, x0: x0 - 1, x1: x1 + 1, z0: z0 - 1, z1: z1 + 1 }; });
  return (x, z) => (rs.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inside([x, z], b.r)) ? 0 : hill(x, z));
}

// ---- sandstone ashlar (Whitby's piers): the photographed blocks, honey-brown, darker and weedy towards the sea ----
function stoneWall(st, h, part = "wall") {
  // (st.kit: the stonework modelled block by block in Blender and baked to seamless maps (source-assets/blender/
  // build_whitby_stone.py): <kit>_ashlar for walls, <kit>_flags for decks, each a tile of st.wallTile or st.deckTile
  // metres; their own joints, wear and shading in them. Without one, the photographed blocks)
  if (st.kit) {
    const name = `${st.kit}_${part === "deck" ? "flags" : "ashlar"}`, rep = 1 / (part === "deck" ? st.deckTile ?? 3 : st.wallTile ?? 2.4);
    const d = photoTex(name + "_diff", { repeat: rep }), nn = d && photoTex(name + "_nor", { srgb: false, repeat: rep }), rr = d && photoTex(name + "_rough", { srgb: false, repeat: rep });
    const m = new THREE.MeshStandardMaterial({ map: d, normalMap: nn, normalScale: new THREE.Vector2(1, 1), roughnessMap: rr, roughness: 1, color: part === "deck" ? st.deckTint ?? 0xffffff : st.tint ?? 0xffffff });
    return part === "deck" ? weather(m, { scale: 1.6, mottle: 0.18, rough: [0.92, 1.06] }) : weather(m, { scale: 0.9, mottle: 0.16, grime: [WALL_BOTTOM, 1.1, 0.8], streaks: [h, 3.5, 0.28], rough: [0.94, 1.06] });
  }
  const tile = st.tile ?? 0.4, d = photoTex("sandstone_wall_diff", { repeat: tile }), nn = d && photoTex("sandstone_wall_nor", { srgb: false, repeat: tile });
  const m = new THREE.MeshStandardMaterial({ map: d, normalMap: nn, normalScale: new THREE.Vector2(1.2, 1.2), color: st.tint ?? 0xf0d8ac, roughness: 0.93 });
  return weather(m, { scale: 0.55, mottle: 0.35, grime: [WALL_BOTTOM, 1.1, 0.75], streaks: [h, 3.5, 0.3], rough: [0.9, 1.1] });
}
// a box's faces mapped at world scale, each in its own plane (for a tiling texture laid at its real size)
function worldUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, p.getX(i), p.getZ(i)); else if (nx >= nz) uv.setXY(i, p.getZ(i), p.getY(i)); else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true; return geo;
}
// what's within this distance of a fishing spot is also a solid for the camera (the rest is never close enough)
const NEAR_SOLID = 45;
const RAIL = { within: 260, inset: 0.22, h: 1.1, post: 2.0 };
export const CAP_DEPTH = 0.85; // (the capping beam's face, from the deck's top down: see the harbour walls below)
// ---- the steel piling's pans: a trapezoid every 0.6 m (out, along its face, back, along the back), 9 cm deep, as the
// drawn pans in textures3d.js sheetPiling (their bends at 0, 0.12, 0.5 and 0.62 of the pitch); shaped within 300 m ----
const PAN = { pitch: 0.6, depth: 0.09, bends: [0, 0.12, 0.5, 0.62], within: 300 };
const panOut = (r) => { const f = ((r / PAN.pitch) % 1 + 1) % 1; return PAN.depth * (f < 0.12 ? f / 0.12 : f < 0.5 ? 1 : f < 0.62 ? 1 - (f - 0.5) / 0.12 : 0); };

// nearest wall segment to a point, through a grid of 8 m cells
function segIndex(segs, cell = 8) {
  const m = new Map(), key = (i, j) => i * 100003 + j;
  segs.forEach((s, n) => {
    const i0 = Math.floor(Math.min(s[0], s[2]) / cell) - 1, i1 = Math.floor(Math.max(s[0], s[2]) / cell) + 1, j0 = Math.floor(Math.min(s[1], s[3]) / cell) - 1, j1 = Math.floor(Math.max(s[1], s[3]) / cell) + 1;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!m.has(k)) m.set(k, []); m.get(k).push(n); }
  });
  return (x, z) => {
    const list = m.get(key(Math.floor(x / cell), Math.floor(z / cell))); if (!list) return null;
    let best = null;
    for (const n of list) {
      const [x1, z1, x2, z2] = segs[n], dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2));
      const px = x1 + dx * t, pz = z1 + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, p: [px, pz], s: segs[n] };
    }
    return best;
  };
}

// ---- the deck's concrete: a photographed surface (Poly Haven's concrete_floor_02, CC0, in public/textures/) ----
// The drawn concrete (its joints, stains and the large soft variations in the vertex colours) stays as the large scale;
// the photographed concrete is laid over it at about 2.5 m a tile for the close-up grain, wear and roughness. It is
// sampled twice, at two scales and turned, and blended by the large stains so its repeat doesn't show across a deck.
// Over that, from the shared weathering noise at scales that never line up with the tiles: broad patches of lighter
// and darker concrete, smoother worn concrete (Poly Haven's concrete_floor_worn_001) where feet go, a few old stains,
// and along the walls a ragged band of damp (darker, a little greener, less rough) with dried salt just inside it.
// Wet (rain) darkens it and makes it shine. Until the photographs have loaded (or if they can't) the drawn one shows.
export const PIER_TEX = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/textures/pier_concrete_"; // (__fdAssetBase: only a self-contained preview page sets it, its files beside it; the app leaves it unset)
// (17 November: the deck's photograph is now broom-finished concrete, Poly Haven's concrete_floor_03, as a pier deck and
// a promenade are laid: the brush lines run across the deck, square to the pier, its grit and wear underneath; at 2048
// px on High and Ultra, 1024 elsewhere)
export const DECK_TEX = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/textures/deck_broom_";
const DECK_M = 2.5; // metres the photograph covers (Poly Haven: 2.5 m square)
const PHOTO_TILE = 8 / DECK_M; // the deck's uv runs one unit per 8 m
function pierConcrete(mat, quality = 1, axis = 0, shade = null) {
  const wet = { value: 0, clock: { value: 0 }, rain: { value: 0 } }; // (clock: seconds, and rain: how hard it is raining, for the rain's rings in the puddles; environment.js keeps them)
  if (typeof document === "undefined") return wet;
  const tl = new THREE.TextureLoader(), get = (n, srgb) => tl.loadAsync(DECK_TEX + n + (quality >= 2 ? "_2k" : "") + ".jpg").then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  });
  const worn = photoTex("deck_worn_diff"), noise = weatherTex();
  Promise.all([get("diff", true), get("nor", false), get("rough", false)]).then(([diff, nor, rough]) => {
    mat.normalMap = nor; mat.roughnessMap = rough; mat.normalScale.set(1.0, 1.0); // (sampled on the turned coordinates, fdPU, in the shader)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.pDiff = { value: diff }; sh.uniforms.uWetSpots = WET_SPOTS; sh.uniforms.uWet = wet; sh.uniforms.uWetT = wet.clock; sh.uniforms.uWetRain = wet.rain; sh.uniforms.pWorn = { value: worn }; sh.uniforms.pNoise = { value: noise };
      sh.uniforms.uAxis = { value: new THREE.Vector2(Math.cos(axis), Math.sin(axis)) };
      sh.vertexShader = "attribute float aDamp;\nvarying float vDamp;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDamp = aDamp;");
      sh.fragmentShader = (quality < 1 ? "" : "#define FD_WET_RINGS\n") + "#define FD_WET_SPOTS\nvec2 fdPU;\nuniform vec4 uWetSpots[4];\nuniform sampler2D pDiff;\nuniform sampler2D pWorn;\nuniform sampler2D pNoise;\nuniform float uWet;\nuniform float uWetT;\nuniform float uWetRain;\nuniform vec2 uAxis;\nvarying float vDamp;\nfloat fdDamp = 0.0, fdWorn = 0.0, fdJoint = 0.0;\n" + sh.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>
        fdPU = vec2(dot(vMapUv, uAxis), dot(vMapUv, vec2(-uAxis.y, uAxis.x))) * ${PHOTO_TILE.toFixed(3)}; // (along the pier, across it: the brush lines run across)
        ${WET_PREP}
        {
          vec2 pu = fdPU;
          vec3 a = texture2D(pDiff, pu).rgb, b = ${quality < 2 ? "a" : "texture2D(pDiff, mat2(0.8, -0.6, 0.6, 0.8) * pu * 0.43 + vec2(0.37, 0.61)).rgb"};
          float m = ${quality < 2 ? "0.0" : "smoothstep(0.42, 0.62, texture2D(map, vMapUv * 0.31 + 0.2).g * 1.6)"}; // (the second, turned sample that breaks up the tiling only on High: the deck fills the view while you land a fish, and on a phone those samples halved the frame rate)
          vec3 avg = texture2D(pDiff, vec2(0.5), 12.0).rgb; // its smallest mip: the photograph's own average colour
          vec3 p = mix(a, b, m) / max(avg, vec3(0.02)); // over its average: the drawn colour stays the colour
          p = mix(vec3(dot(p, vec3(0.3, 0.59, 0.11))), p, 0.35);
          // (the broom-finished photograph more strongly than the old one: its brush lines, grit and wear are what make the
          // deck read as a weathered sea pier's rather than a clean floor)
          p = mix(vec3(1.0), p, 0.85);
          diffuseColor.rgb *= mix(vec3(1.0), p, 0.8);
          // ---- the deck as cast: bays about 4.5 m long, square across the pier, with sawn joints between them ----
          // (each joint a dark, sharp line a centimetre or so wide, grime settled a hand's width either side; each bay a
          // shade different from the next, as concrete poured on different days is)
          {
            vec2 wq = vMapUv * 8.0; float al = dot(wq, uAxis), ac = dot(wq, vec2(-uAxis.y, uAxis.x));
            float bay = al / 4.5, f = fract(bay), dj = min(f, 1.0 - f) * 4.5; // metres to the nearest joint
            float px = max(fwidth(al), 1e-4);
            float line = 1.0 - smoothstep(0.006, 0.006 + px * 1.5, dj);
            float wob = (texture2D(pNoise, vec2(ac * 0.21, floor(bay) * 0.37)).r - 0.5) * 0.04; // (a little ragged, chipped)
            float grime = 1.0 - smoothstep(0.0, 0.12 + wob, dj);
            float fade = 1.0 - smoothstep(18.0, 60.0, px * 900.0); // (thin lines far off would shimmer: they fade into the grime)
            fdJoint = line * fade;
            diffuseColor.rgb *= 1.0 - line * 0.55 * fade - grime * 0.12;
            float shade = fract(sin(floor(bay) * 12.9898 + floor(ac / 9.0) * 4.1) * 43758.5453);
            diffuseColor.rgb *= 0.95 + shade * 0.08;
          }
          // broad patches (about 70 m and 15 m across, turned so they never line up with the 8 m tile)
          vec4 nA = texture2D(pNoise, mat2(0.6, 0.8, -0.8, 0.6) * vMapUv * 0.11), nB = texture2D(pNoise, vMapUv * 0.53 + 0.3);
          diffuseColor.rgb *= (0.8 + nA.g * 0.3) * vec3(0.97, 0.955, 0.93); // (darker and a touch browner, with more of the weathered variation a real pier deck has: it read as a clean pale floor)
          // worn, smoother concrete where people walk (its own photograph, over its average)
          fdWorn = smoothstep(0.52, 0.74, nB.g * 0.7 + nA.g * 0.5);
          ${quality < 2 ? "" : `vec3 w = texture2D(pWorn, vMapUv * 2.1).rgb / max(texture2D(pWorn, vec2(0.5), 10.0).rgb, vec3(0.02));
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(dot(w, vec3(0.3, 0.59, 0.11))), w, 0.3), fdWorn * 0.55);`}
          // old stains: a few darker blotches a metre or so across
          float stn = smoothstep(0.74, 0.8, texture2D(pNoise, vMapUv * 1.7 + 0.71).g) * smoothstep(0.4, 0.6, nA.r);
          diffuseColor.rgb *= 1.0 - stn * 0.3;
          // damp along the walls, ragged; dried salt just inside it
          fdDamp = smoothstep(0.35, 0.95, vDamp + (nB.r - 0.5) * 0.6);
          float salt = smoothstep(0.08, 0.35, vDamp) * (1.0 - fdDamp) * smoothstep(0.45, 0.7, texture2D(pNoise, vMapUv * 3.1).r);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.86, 0.83), salt * 0.25);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.74, 0.77, 0.72), fdDamp);
          diffuseColor.rgb *= ${WET_DARKEN};
        }`)
        .replace("#include <roughnessmap_fragment>", `float roughnessFactor = roughness * texture2D(roughnessMap, fdPU).g; // (the photograph's own roughness, on the same turned coordinates as its colour)
        roughnessFactor = ${wetRough("mix(0.62, 1.0, roughnessFactor) * (1.0 - fdWorn * 0.18) * (1.0 - fdDamp * 0.35)")}; // (wetLook.js)`)
        .replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replaceAll("vNormalMapUv", "fdPU"))
        .replace("#include <normal_fragment_maps>", `${THREE.ShaderChunk.normal_fragment_maps.replaceAll("vNormalMapUv", "fdPU")}
        ${WET_NORMAL}`);
      // the contact shade baked round what stands on the deck (contactShade below): the sky's light and its reflection
      // taken down where a building, a bench, a lamp or a post meets the concrete, the sun's a little
      if (shade) {
        sh.uniforms.fdAO = shade.tex; sh.uniforms.fdAOBox = shade.box; sh.uniforms.fdAOK = shade.k;
        sh.fragmentShader = "uniform sampler2D fdAO;\nuniform vec4 fdAOBox;\nuniform float fdAOK;\n" + sh.fragmentShader.replace("#include <aomap_fragment>", `#include <aomap_fragment>
        { vec2 aq = (vMapUv * 8.0 - fdAOBox.xy) / fdAOBox.zw;
          if (fdAOK > 0.0 && aq.x > 0.0 && aq.y > 0.0 && aq.x < 1.0 && aq.y < 1.0) {
            float ao = 1.0 - fdAOK * texture2D(fdAO, aq).r;
            reflectedLight.indirectDiffuse *= ao; reflectedLight.indirectSpecular *= ao; reflectedLight.directDiffuse *= mix(1.0, ao, 0.4);
          } }`);
      }
    };
    mat.customProgramCacheKey = () => "fdpier9" + (quality < 1 ? "p" : quality < 2 ? "b" : "") + (shade ? "s" : "");
    mat.needsUpdate = true;
  }).catch(() => {});
  return wet;
}

// ---- the pier's furniture from Blender: one instanced mesh per piece (a draw call per material for all of them) ----
function placeProps(group, stand, props, glowGlass, wet) {
  loadPart("pierprops").then((scene) => {
    weatherPierProps(scene, wet);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const [name, list] of Object.entries(props)) {
      const src = scene.getObjectByName(name + "_mesh") || scene.getObjectByName(name); if (!src || !list.length) continue;
      // (each piece in its root's frame: where it stands. In the mesh's own frame, as before, every piece came out
      // displaced by where it had stood in Blender's layout: the benches 2.5 m along their length from their places,
      // the lifebuoy stations 2 m, the lamps 4 m, so people could be set down inside a bench)
      const home = scene.getObjectByName(name) || src; home.updateWorldMatrix(true, true);
      const toHome = new THREE.Matrix4().copy(home.matrixWorld).invert();
      const meshes = []; src.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const m of meshes) {
        const geo = m.geometry.clone().applyMatrix4(toHome.clone().multiply(m.matrixWorld));
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mt) => /glass|bulb/i.test(mt.name) ? glowGlass : mt);
        const im = new THREE.InstancedMesh(geo, mats.length > 1 ? mats : mats[0], list.length);
        list.forEach(([x, y, z, ry], k) => { mx.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry), one); im.setMatrixAt(k, mx); });
        im.castShadow = true; im.receiveShadow = true; group.add(im);
      }
      // ---- contact shadows: the dark on the deck right under each one, the size of its footprint ----
      const bb = new THREE.Box3(); for (const m of meshes) { const g = m.geometry.clone().applyMatrix4(toHome.clone().multiply(m.matrixWorld)); g.computeBoundingBox(); bb.union(g.boundingBox); g.dispose(); }
      if (!bb.isEmpty()) {
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, w = (bb.max.x - bb.min.x) * 1.3 + 0.25, d = (bb.max.z - bb.min.z) * 1.3 + 0.25;
        group.add(contactShadows(list.map(([x, y, z, ry]) => [x + cx * Math.cos(ry) + cz * Math.sin(ry), y, z - cx * Math.sin(ry) + cz * Math.cos(ry), ry, w, d]), name === "bench" ? 0.65 : 0.55));
      }
    }
    group.remove(stand); stand.traverse((o) => o.geometry?.dispose?.()); // (and their shapes freed: a hundred-odd boxes and tubes were left on the graphics card for good)
  }).catch(() => {}); // (the simple shapes stay)
}

// ---- the small things along a working wall: stains, drains, rings and ladders ----
// All the stains in one mesh (one draw call, cut from one small texture): a rust ring round each railing post's foot,
// a rust run down the cap's face below each post, a few old stains on the deck round the fishing spots and damp round
// each drain. The drain grates in one mesh; the mooring rings and the ladders instanced (a draw call each).
function wallDetails(group, { posts, grates, rings, ladders, spots, props, capRuns, wet, railH, deckAt = null }) {
  const LAND = GROUND.land, tex = decalTex(); if (!tex) return;
  const P = [], UV = [], I = [];
  // a quad at c, spanning ±a and ±b (3-vectors), from cell k of the 2 x 2 texture
  const quad = (c, a, b, k, flip = false) => {
    const o = P.length / 3, u0 = (k % 2) * 0.5, v0 = k < 2 ? 0.5 : 0; // (the canvas's top row is the texture's top half)
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push(c[0] + a[0] * s + b[0] * t, c[1] + a[1] * s + b[1] * t, c[2] + a[2] * s + b[2] * t);
    UV.push(u0 + 0.01, v0 + 0.01, u0 + 0.49, v0 + 0.01, u0 + 0.49, v0 + 0.49, u0 + 0.01, v0 + 0.49);
    if (flip) I.push(o, o + 2, o + 1, o, o + 3, o + 2); else I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const y = LAND + 0.004;
  posts.forEach(([x, z, nx, nz], i) => {
    const r = 0.16 + rnd() * 0.12, t = rnd() * 6.28, ca = Math.cos(t) * r, sa = Math.sin(t) * r;
    quad([x, y, z], [ca, 0, sa], [-sa, 0, ca], DECAL.rustRing, true);
    // the run down the cap's face, in front of the post (not every post: some have been painted over)
    if (i % 3 !== 1) { const fx = x + nx * (0.22 + 0.12 + 0.004), fz = z + nz * (0.22 + 0.12 + 0.004), w = 0.05 + rnd() * 0.05, h = 0.25 + rnd() * 0.35; quad([fx, LAND + 0.01 - h, fz], [-nz * w, 0, nx * w], [0, h, 0], DECAL.rustRun, true); }
  });
  // (each on the deck, the whole of it, and on the deck's own level: placed anywhere round the spot, half of them were out
  // past the wall over the sea, hanging at the deck's height. From the rail they were the dark blotches on the water
  // below the pier, in every light, that hid from every switch of the sea: Aaron's 18 November recording, found on his
  // PC by hiding each part of the scene in a still view)
  for (const sp of spots) for (let k = 0; k < 5; k++) {
    const t = rnd() * 6.28, d = 0.8 + rnd() * 2.5, x = sp.at[0] + Math.cos(t) * d, z = sp.at[2] + Math.sin(t) * d, r = 0.2 + rnd() * 0.35, a = rnd() * 6.28;
    const dy = deckAt ? deckAt([x, z], r + 0.3) : LAND; if (dy == null) continue;
    quad([x, dy + 0.004, z], [Math.cos(a) * r, 0, Math.sin(a) * r], [-Math.sin(a) * r * 0.8, 0, Math.cos(a) * r * 0.8], DECAL.stain, true);
  }
  for (const [x, by, z] of props.bench) quad([x, by + 0.004, z], [0.9, 0, 0], [0, 0, 0.7], DECAL.damp, true); // (at the bench's own deck: a quay's stands a little above the land's)
  for (const [x, z] of grates) quad([x, y, z], [0.45, 0, 0], [0, 0, 0.45], DECAL.damp, true);
  void capRuns;
  if (I.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.receiveShadow = true; m.renderOrder = 1; group.add(m);
  }
  // drain grates: flush with the deck, turned along the wall
  if (grates.length) {
    const gp = [], gu = [], gi = [];
    for (const [x, z, ry] of grates) {
      const o = gp.length / 3, ax = [Math.cos(ry) * 0.25, Math.sin(-ry) * 0.25], bz = [Math.sin(ry) * 0.17, Math.cos(ry) * 0.17];
      for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gp.push(x + ax[0] * s + bz[0] * t, LAND + 0.006, z + ax[1] * s + bz[1] * t);
      gu.push(0, 0, 1, 0, 1, 1, 0, 1); gi.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(gu, 2)); g.setIndex(gi); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: grateTex(), roughness: 0.75, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
    m.receiveShadow = true; group.add(m);
  }
  const iron = weather(new THREE.MeshStandardMaterial({ color: 0x5a5c5b, roughness: 0.7, metalness: 0.4 }), { scale: 0.3, mottle: 0.35, bump: 0.8, rust: [0.7, 0.15, 0.06, 0.025], grime: [WALL_BOTTOM, 0.75, 0.55], rough: [0.8, 1.2], wet });
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const place = (geo, list) => {
    const m = new THREE.InstancedMesh(geo, iron, list.length);
    list.forEach(([x, z, ry], k) => { mx.compose(v.set(x, 0, z), q.setFromAxisAngle(up, ry), one); m.setMatrixAt(k, mx); });
    m.castShadow = true; m.computeBoundingSphere(); group.add(m);
  };
  // a mooring ring hanging from its eye on the cap's face (local +z faces the water): the eye a loop of round bar
  // standing out from a plate bolted to the wall, the ring (28 mm bar, 200 mm across) hanging through it
  // (a ring of 5 by 14 sides read as a bent strip; the eye was a block)
  if (rings.length) {
    const yc = LAND - 0.3, toYZ = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1); // (x to y, y to z: the eye's arch out from the wall)
    const parts = [new THREE.TorusGeometry(0.093, 0.014, 10, 32).translate(0, yc - 0.077, 0.024),
      new THREE.TorusGeometry(0.026, 0.009, 8, 12, Math.PI).applyMatrix4(toYZ).translate(0, yc, 0.01),
      new THREE.BoxGeometry(0.1, 0.1, 0.014).translate(0, yc, 0.007)];
    for (const [bx, by] of [[-0.034, 0.032], [0.034, 0.032], [-0.034, -0.032], [0.034, -0.032]]) parts.push(new THREE.CylinderGeometry(0.009, 0.01, 0.008, 6).rotateX(Math.PI / 2).translate(bx, yc + by, 0.017));
    place(mergeGeometries(parts.map((g2) => { g2.deleteAttribute("uv"); return g2.toNonIndexed(); })), rings);
  }
  // a steel ladder from below the water up over the cap: two flat-bar stiles, round rungs every 30 cm, brackets back to
  // the wall, and the stiles' tops bent over the cap's edge onto the deck and down into it as hand holds
  // (bent: before, each top was a flat bar laid straight out along the deck from the corner)
  if (ladders.length) {
    const parts = [], top = LAND + 0.06;
    // a flat bar (w wide, t thick) along a path in the y-z plane at x: a box along each step, the corners overlapping
    const bar = (x, path, w, t) => { for (let i = 0; i + 1 < path.length; i++) { const [y0, z0] = path[i], [y1, z1] = path[i + 1], l = Math.hypot(y1 - y0, z1 - z0); parts.push(new THREE.BoxGeometry(w, l + t * 0.9, t).rotateX(Math.atan2(z1 - z0, y1 - y0)).translate(x, (y0 + y1) / 2, (z0 + z1) / 2)); } };
    const R = 0.07, bend = [];
    for (let k = 0; k <= 5; k++) { const a = (k / 5) * Math.PI / 2; bend.push([top - R + Math.sin(a) * R, -R + Math.cos(a) * R]); } // over the edge: up, then back over the deck
    for (const sx of [-0.2, 0.2]) {
      bar(sx, [[WALL_BOTTOM, 0], [top - R, 0]], 0.05, 0.012);
      bar(sx, bend, 0.05, 0.012);
      bar(sx, [[top, -R], [top, -0.34], [top - 0.03, -0.39], [LAND - 0.02, -0.4]], 0.05, 0.012); // along the deck and down into it
      for (const by of [WALL_BOTTOM + 0.4, 0.9, LAND - 0.6]) parts.push(new THREE.BoxGeometry(0.03, 0.03, 0.2).translate(sx, by, -0.1));
    }
    for (let ry2 = WALL_BOTTOM + 0.2; ry2 < LAND - 0.1; ry2 += 0.3) parts.push(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 12, 1, true).rotateZ(Math.PI / 2).translate(0, ry2, 0)); // (round bar: six-sided, up close each rung read as a flat strip)
    place(mergeGeometries(parts.map((g2) => { g2.deleteAttribute("uv"); return g2.toNonIndexed(); })), ladders);
  }
  void railH;
}

// ---- the harbour wall's steel piling: drawn corrugations, photographed paint and rust over them ----
// The drawn piling (its pans, the wet band and the weed) stays the shape and the colour. Over it: Poly Haven's
// rusty_painted_metal (CC0), over its own average so it only adds its rust runs and pitting, strongest on the dry
// steel; below the tide line Poly Haven's concrete_moss (CC0) turned to dark green-brown weed, a band of pale
// barnacles just above the water and a ragged tide line; everything below it wet (dark, shiny).
// v (the wall's uv) runs 0 at the foot (below the water) to 1 at the cap; the water is at about 0.27.
function pilingMaterial(sp, quality) {
  const mat = new THREE.MeshStandardMaterial({ map: sp.map, normalMap: sp.normalMap, roughnessMap: sp.roughnessMap, roughness: 1, metalness: 0.15, vertexColors: true });
  const rust = photoTex("wall_rust_diff"); if (!rust) return mat;
  const rustN = photoTex("wall_rust_nor", { srgb: false }), rustR = photoTex("wall_rust_rough", { srgb: false }), moss = photoTex("wall_moss_diff"), noise = weatherTex();
  const wallH = GROUND.land - WALL_BOTTOM, vWater = (0 - WALL_BOTTOM) / wallH, vTide = (0.62 - WALL_BOTTOM) / wallH;
  const rv = (wallH / 1.2).toFixed(3), mv = (wallH / 1.5).toFixed(3); // (the photographs' tiles kept square: 1.2 m and 1.5 m)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { wRust: { value: rust }, wRustN: { value: rustN }, wRustR: { value: rustR }, wMoss: { value: moss }, wNoise: { value: noise } });
    sh.fragmentShader = "uniform sampler2D wRust;\nuniform sampler2D wRustN;\nuniform sampler2D wRustR;\nuniform sampler2D wMoss;\nuniform sampler2D wNoise;\nfloat fdBelow = 0.0;\nvec2 fdRu = vec2(0.0);\nvec2 fdRu2 = vec2(0.0);\nfloat fdRw = 0.0;\n" + sh.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
      {
        fdRu = vec2(vMapUv.x * 2.0, vMapUv.y * ${rv}); // (u: 2.4 m a unit)
        // (the photograph's rust runs repeated every 1.2 m: from out on the water every other pan of the piling showed the
        // same dark drip, like a row of figures. A second copy, shifted and a little larger, is blended in in slow
        // patches, so no two pans along the wall look the same; no seams, as both are whole tiles)
        fdRu2 = fdRu * vec2(0.71, 0.83) + vec2(0.37, 0.61);
        fdRw = smoothstep(0.4, 0.6, texture2D(wNoise, vec2(vMapUv.x * 0.11, vMapUv.y * 0.17 + 0.3)).g);
        vec3 r = mix(texture2D(wRust, fdRu).rgb, texture2D(wRust, fdRu2).rgb, fdRw) / max(texture2D(wRust, vec2(0.5), 10.0).rgb, vec3(0.02));
        r = mix(vec3(dot(r, vec3(0.3, 0.59, 0.11))), r, 0.25);
        vec4 n = texture2D(wNoise, vec2(vMapUv.x * 0.37, vMapUv.y * 0.9));
        float v = vMapUv.y, tide = ${vTide.toFixed(3)} + (n.g - 0.5) * 0.07;
        fdBelow = 1.0 - smoothstep(tide - 0.015, tide + 0.015, v);
        diffuseColor.rgb *= mix(vec3(1.0), clamp(r, 0.0, 1.6), 0.85 - fdBelow * 0.45);
        // the tide line: a thin pale salty band with a dark stain under it
        diffuseColor.rgb *= 1.0 + 0.16 * (1.0 - smoothstep(0.0, 0.012, abs(v - tide - 0.012))) - 0.12 * (1.0 - smoothstep(0.0, 0.03, abs(v - tide + 0.03)));
        // weed from the water up, thinning out a little above the waterline
        vec3 ms = texture2D(wMoss, vec2(vMapUv.x * 1.6, vMapUv.y * ${mv})).rgb;
        float weed = (1.0 - smoothstep(${(vWater + 0.02).toFixed(3)}, ${(vWater + 0.13).toFixed(3)}, v + (dot(ms, vec3(0.33)) - 0.33) * 0.25 + (n.r - 0.5) * 0.06));
        diffuseColor.rgb = mix(diffuseColor.rgb, ms * vec3(0.45, 0.42, 0.26), weed * 0.85);
        // barnacles: pale speckles in a band just above the water
        float bar = step(0.62, texture2D(wNoise, vMapUv * vec2(9.0, 17.0)).r) * smoothstep(${(vWater - 0.02).toFixed(3)}, ${(vWater + 0.03).toFixed(3)}, v) * (1.0 - smoothstep(${(vWater + 0.06).toFixed(3)}, ${(vWater + 0.12).toFixed(3)}, v));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.55), bar * 0.6 * (1.0 - weed * 0.6));
      }`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = mix(mix(0.6, 1.0, mix(texture2D(wRustR, fdRu).g, texture2D(wRustR, fdRu2).g, fdRw)), 0.62, fdBelow);`)
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n      metalnessFactor *= 1.0 - fdBelow;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      ${quality < 1 ? "" : `{ vec3 rn = mix(texture2D(wRustN, fdRu).xyz, texture2D(wRustN, fdRu2).xyz, fdRw) * 2.0 - 1.0; normal = normalize(normal + tbn * vec3(rn.xy * 0.6, 0.0)); }`}`);
  };
  mat.customProgramCacheKey = () => "fdpile2" + (quality < 1 ? "p" : "");
  return mat;
}

// ---- near and far detail ----
/** How far (m) from your eye a stone can be and still cast a shadow that lands in the sun's shadow map (world.js sets it from the shadow distance). */
export const SHADOW_REACH = { m: 55 };
export const setShadowReach = (shadowDist) => { SHADOW_REACH.m = Math.max(40, shadowDist * 1.42 + 12); };
/** The rock armour's levels of detail by distance from the eye (m): the fine stone within `near`, a middling one to
 * `mid`, the coarse one beyond (realPlace's armour). */
export const ARMOUR_LOD = { near: 20, mid: 60 };
if (typeof window !== "undefined" && window.__fdFilm) window.__fdArmour = { lod: ARMOUR_LOD, reach: SHADOW_REACH }; // (film checks: the bands set by hand)
/** Which band each stone at xz [[x, z], ...] goes in, seen from (ex, ez) with the sun's shadows reaching `reach` m:
 * [near, middling, coarse with shadows, coarse without], each a list of indices into xz. */
export function armourBands(xz, ex, ez, reach) {
  const out = [[], [], [], []], n2 = ARMOUR_LOD.near ** 2, m2 = ARMOUR_LOD.mid ** 2, r2 = reach * reach;
  xz.forEach(([x, z], i) => { const d2 = (x - ex) ** 2 + (z - ez) ** 2; out[d2 < n2 ? 0 : d2 < m2 ? 1 : d2 < r2 ? 2 : 3].push(i); });
  return out;
}
/** How near (m) a railing post has to be to get its full fittings (realPlace's rails). */
export const POST_DETAIL_M = 9;
/** Indices of `points` ([x, z, ...]) within sqrt(near2) of (x, z), and the rest: [near, far]. */
export function splitByDistance(points, x, z, near2) {
  const near = [], far = [];
  points.forEach((p, q) => { const dx = p[0] - x, dz = p[1] - z; (dx * dx + dz * dz < near2 ? near : far).push(q); });
  return [near, far];
}
/** Whether a thing at (x, z) would stand at least `min` metres from every one already in `list` (each [x, z, ...], or
 * [x, y, z, ...] with iz = 2). Things along a wall are tens of metres apart; closer is the same one twice. */
export const PLACED_APART = 3;
export function farFromAll(list, x, z, iz = 1, min = PLACED_APART) { return list.every((p) => Math.hypot(p[0] - x, p[iz] - z) >= min); }

/**
 * The contact shade round what stands on a deck, as a map: 1 where something meets the ground, fading over about 40 cm.
 * rings: footprints ([[x, z]...]); discs: [x, z, radius, weight]; rects: [x, z, turn, half-length, half-width, weight]
 * (turn as a bench's: atan2 of the way it faces). A square `size` metres across round (cx, cz), `mpp` metres a pixel.
 * Returns { tex (a one-channel texture, or null with no three.js canvas), data, n, x0, z0, size } or null.
 */
export function contactShade({ cx, cz, size = 140, mpp = 0.1, rings = [], discs = [], rects = [] }) {
  const n = Math.round(size / mpp), x0 = cx - size / 2, z0 = cz - size / 2, occ = new Float32Array(n * n);
  const px = (x) => (x - x0) / mpp - 0.5, pz = (z) => (z - z0) / mpp - 0.5;
  const put = (i, j, w) => { if (i >= 0 && j >= 0 && i < n && j < n) { const k = j * n + i; if (occ[k] < w) occ[k] = w; } };
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity; for (const [x, z] of ring) { i0 = Math.min(i0, px(x)); i1 = Math.max(i1, px(x)); j0 = Math.min(j0, pz(z)); j1 = Math.max(j1, pz(z)); }
    for (let j = Math.max(0, Math.floor(j0)); j <= Math.min(n - 1, Math.ceil(j1)); j++) for (let i = Math.max(0, Math.floor(i0)); i <= Math.min(n - 1, Math.ceil(i1)); i++) {
      const x = x0 + (i + 0.5) * mpp, z = z0 + (j + 0.5) * mpp; let c = false;
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) { const [xa, za] = ring[a], [xb, zb] = ring[b]; if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) c = !c; }
      if (c) put(i, j, 1);
    }
  }
  for (const [x, z, r, w] of discs) { const R = r / mpp + 0.5; for (let j = Math.floor(pz(z) - R); j <= Math.ceil(pz(z) + R); j++) for (let i = Math.floor(px(x) - R); i <= Math.ceil(px(x) + R); i++) if (Math.hypot(i - px(x), j - pz(z)) <= R) put(i, j, w); }
  for (const [x, z, ry, hl, hw, w] of rects) {
    const tx = Math.cos(ry), tz = -Math.sin(ry), nx = Math.sin(ry), nz = Math.cos(ry), R = Math.hypot(hl, hw) / mpp + 1;
    for (let j = Math.floor(pz(z) - R); j <= Math.ceil(pz(z) + R); j++) for (let i = Math.floor(px(x) - R); i <= Math.ceil(px(x) + R); i++) {
      const dx = x0 + (i + 0.5) * mpp - x, dz = z0 + (j + 0.5) * mpp - z;
      if (Math.abs(dx * tx + dz * tz) <= hl && Math.abs(dx * nx + dz * nz) <= hw) put(i, j, w);
    }
  }
  // spread: three box blurs of 3 pixels each way (about a gaussian of 30 cm), then shaped so the shade is deepest at
  // the foot and fades smoothly
  const tmp = new Float32Array(n * n), R = 3;
  const pass = (src, dst, horiz) => { for (let a = 0; a < n; a++) { let s = 0; const at = (b) => (horiz ? a * n + Math.min(n - 1, Math.max(0, b)) : Math.min(n - 1, Math.max(0, b)) * n + a);
    for (let b = -R; b <= R; b++) s += src[at(b)];
    for (let b = 0; b < n; b++) { dst[horiz ? a * n + b : b * n + a] = s / (2 * R + 1); s += src[at(b + R + 1)] - src[at(b - R)]; } } };
  for (let k = 0; k < 3; k++) { pass(occ, tmp, true); pass(tmp, occ, false); }
  const data = new Uint8Array(n * n); for (let k = 0; k < n * n; k++) { const v = Math.min(1, occ[k] / 0.55); data[k] = Math.round(255 * v * v * (3 - 2 * v)); }
  let tex = null;
  if (typeof document !== "undefined") { tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType); tex.flipY = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true; }
  return { tex, data, n, x0, z0, size };
}

// ---- the worn, muddy patches in the grass (the soft ground's shader, FD_MUD), and the same worked out here so no tuft
// of grass stands on them (grassTufts.js): the shader's own noise, fdDH / fdDN / fdDF, in JavaScript ----
// (lift: how much more of the town's rough ground is worn than a lawn; town, lawn: how far to the mud each goes)
// (lawnLess: how much rarer the worn patches are on a lawn: at the town's rate the Abbey's lawns were blotched brown)
const MUD = { lift: 0.02, town: 0.45, lawn: 0.22, lawnLess: 0.07 }; // (town 0.45: from above, the Abbey's headland was blotched brown)
// (the grass drier and yellower in broad patches: its tint there, the noise's scale in metres, where it starts and is
// full, and how far towards the tint)
const GRASS_DRY = { tint: ["1.14", "1.02", "0.68"], scale: 37, lo: 0.5, hi: 0.78, k: 0.55 };
const fract = (v) => v - Math.floor(v);
function mudDH(x, y) { let qx = fract(x * 0.1031), qy = fract(y * 0.1031), qz = fract(x * 0.1031); const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33); qx += d; qy += d; qz += d; return fract((qx + qy) * qz); }
function mudDN(x, y) { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const a = mudDH(ix, iy), b = mudDH(ix + 1, iy), c = mudDH(ix, iy + 1), d = mudDH(ix + 1, iy + 1); return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy; }
function mudDF(x, y) { let a = 0.5, s = 0; for (let k = 0; k < 4; k++) { s += a * mudDN(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
/** Where the dune's marram grows thick, 0..1, and how dried it is (0 green, 1 straw), as the dune shader draws it close
 * to (face: the point's aFace, 0 the dune's top to 1 its bare face). */
export function marramAt(x, z, face) {
  const field = mudDF(x / 13, z / 13) * 0.62 + mudDF(x / 3.4 + 31, z / 3.4 + 31) * 0.44 + (mudDN(x * 2.3 + 7, z * 2.3 + 7) - 0.5) * 0.16;
  const th = 0.385 + (0.64 - 0.385) * face, c = Math.min(1, Math.max(0, (field - (th - 0.035)) / 0.08)), d = Math.min(1, Math.max(0, (mudDF(x / 8 + 70, z / 8 + 70) - 0.34) / 0.28));
  return { cover: c * c * (3 - 2 * c), dry: d * d * (3 - 2 * d) };
}
/** How dried the grass is here in its broad patches, 0..1 times GRASS_DRY.k, as the ground's shader draws it. */
export function dryAt(x, z) { const t = Math.min(1, Math.max(0, (mudDF(x / GRASS_DRY.scale + 3, z / GRASS_DRY.scale + 3) - GRASS_DRY.lo) / (GRASS_DRY.hi - GRASS_DRY.lo))); return t * t * (3 - 2 * t) * GRASS_DRY.k; }
/** How worn to the mud the grass is here, 0..1, as the ground's shader draws it (town: the town's rough ground). */
export function mudAt(x, z, town) {
  const v = mudDF(x / 9 + 7, z / 9 + 7) + (mudDN(x / 1.7, z / 1.7) - 0.5) * 0.16 + (town ? MUD.lift : -MUD.lawnLess), t = Math.min(1, Math.max(0, (v - 0.6) / 0.12));
  return t * t * (3 - 2 * t) * (town ? MUD.town : MUD.lawn);
}

export function buildRealPlace(group, place, M, solids = [], quality = 1) {
  const local0 = localFor(place.id); // what photographs show at this mark (localDetail.js), or null
  // (and a survey's heights for its ground, where a mark has them (terrain3d.js): never under a pier's deck, which a
  // survey of the bare ground can take for ground)
  const local = local0?.terrain ? { ...local0, hill: offPiers(terrainHill(local0.terrain), place.piers) } : local0;
  const fenceKind = (x, z, nx, nz) => (local?.fence ? local.fence(x, z, nx, nz) : "rail");
  const spots = place.spots || [], nearSpot = (x, z, r = NEAR_SOLID) => spots.some((sp) => Math.hypot(x - sp.at[0], z - sp.at[2]) < r);
  const xs = place.grid.xs, n = xs.length, cls = unrle(place.grid.cls, n * n);
  const inland = place.venue === "river" || place.venue === "lake";
  const LAND = GROUND.land;
  const targets = []; // what the rendered-geometry check casts its rays at (world.js)
  const walls = (place.edges || []).filter((e) => e[6] === "wall");
  const perches = []; // lamp tops (wildlife.js)
  const nearestWall = segIndex(walls);
  // the exact land, for the vertices along a wall (the grid's own answer is only right to a cell)
  // (an open pier on iron legs, localDetail.js, is no part of the land: the sea and the beach run on under its deck)
  const landRings = place.land || [], waterRings = place.water || [], pierRings = (place.piers || []).filter((p) => p.ring && !p.open).map((p) => p.ring);
  const bb = (r) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { r, x0, x1, z0, z1 }; };
  const LR = landRings.map(bb), WR = waterRings.map(bb), PR = pierRings.map(bb), inB = (q, b) => q[0] >= b.x0 && q[0] <= b.x1 && q[1] >= b.z0 && q[1] <= b.z1 && inside(q, b.r);
  const landAt = (q) => (LR.some((b) => inB(q, b)) || PR.some((b) => inB(q, b))) && !WR.some((b) => inB(q, b));

  // ---- the ground ----
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const solid = new Uint8Array(n * n); // 1: land or a vertex moved onto a wall's line
  const h = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) { h[k] = H_OF[cls[k]]; solid[k] = cls[k] !== 0 ? 1 : 0; }
  // ---- a beach mark's own beach (localDetail.js beach): sand rises gently from the water's edge, about 1 in 30, a
  // shingle bank steeply, up to the promenade or the bank's crest. (Drawn level at 0.9 m, a hundred metres of beach read
  // as a table of sand with a step down into the sea.) toWater: metres from the water's edge, on the beach ----
  const BP = local?.beach || (place.venue === "beach" ? {} : null), toWater = new Float32Array(n * n).fill(-1);
  if (BP && BP.shape !== false) { // (shape false: the map's beaches drawn in the photographed sand but left at their own heights, as Whitby's small ones between walls)
    // (steeper for the first few metres, where the waves run up and back, then the beach's own slope: laid at one slope
    // all the way, the last few centimetres above the sea were metres wide and the waves ran over them, and over the anglers)
    const slope = BP.slope ?? 0.032, top = BP.top ?? LAND, foot = BP.foot ?? 0.12, swash = BP.swash ?? 0.075;
    const src = new Int32Array(n * n).fill(-1), queue = [];
    for (let k = 0; k < n * n; k++) if (cls[k] === 0) { src[k] = k; queue.push(k); }
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi], i = k % n, j = (k - i) / n;
      for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const q = jj * n + ii; if (src[q] < 0 && cls[q] === 2) { src[q] = src[k]; queue.push(q); } }
    }
    for (let k = 0; k < n * n; k++) {
      if (cls[k] !== 2 || src[k] < 0) continue;
      const s0 = src[k], d = Math.hypot(xs[k % n] - xs[s0 % n], xs[Math.floor(k / n)] - xs[Math.floor(s0 / n)]);
      toWater[k] = d; h[k] = Math.min(top, foot + Math.min(d, 5) * swash + Math.max(0, d - 5) * slope);
    }
  }
  // beaches slope gently into the water (walls stay upright)
  for (let it = 0; it < 4; it++) {
    const nh = h.slice();
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i, c = cls[k];
      if (c !== 2 && c !== 0) continue;
      if (BP && BP.shape !== false && c === 2) continue; // (a beach mark's beach has its own slope, above: smoothed again it bulged at the water's edge)
      const nb = [k - 1, k + 1, k - n, k + n];
      if (c === 0 && !nb.some((q) => cls[q] === 2)) continue;
      nh[k] = (h[k] * 2 + nb.reduce((s, q) => s + h[q], 0)) / 6;
    }
    h.set(nh);
  }
  // (the anglers stand on the beach as it is now drawn: its height where each stands, from the grid's four corners;
  // and whoever walks on it, groundAt below)
  const cellOf = (v) => { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; } return lo; };
  const hGrid = (x, z) => {
    const i = cellOf(x), j = cellOf(z), fx = Math.max(0, Math.min(1, (x - xs[i]) / (xs[i + 1] - xs[i] || 1))), fz = Math.max(0, Math.min(1, (z - xs[j]) / (xs[j + 1] - xs[j] || 1)));
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };
  if (BP && BP.shape !== false) for (const sp of spots) if (cls[cellOf(sp.at[2]) * n + cellOf(sp.at[0])] === 2 || place.venue === "beach") sp.at[1] = Math.round(hGrid(sp.at[0], sp.at[2]) * 100) / 100; // (only those standing on the sand: a pier's anglers keep its deck)
  // (behind a solid parapet, localDetail.js concrete: the anglers stand its thickness further back, so their tripods and
  // chairs stand clear of it, and the edge in front of them is that much further)
  if (local?.concrete) place.parapet = true;
  if (local?.concrete) for (const sp of spots) { const c = local.concrete(sp.at[0], sp.at[2]); if (!c) continue; const th = c.t ?? 0.45; sp.at[0] = Math.round((sp.at[0] - Math.sin(sp.face) * th) * 10) / 10; sp.at[2] = Math.round((sp.at[2] + Math.cos(sp.face) * th) * 10) / 10; sp.edge = Math.round(((sp.edge ?? 1) + th) * 10) / 10; }
  // a dune (localDetail.js): a beach the photographs show grown over with marram grass rises gently from the water
  const dune = new Float32Array(n * n), duneH = new Float32Array(n * n);
  if (local?.dunes) {
    // the nearest water to each cell, by a breadth-first walk through the grid that carries it along
    const src = new Int32Array(n * n).fill(-1), queue = [];
    for (let k = 0; k < n * n; k++) if (cls[k] === 0) { src[k] = k; queue.push(k); }
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi], i = k % n, j = (k - i) / n;
      for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const q = jj * n + ii; if (src[q] < 0) { src[q] = src[k]; queue.push(q); } }
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; if ((cls[k] !== 1 && cls[k] !== 2) || src[k] < 0 || !local.dunes(xs[i], xs[j])) continue;
      const s0 = src[k], d = Math.hypot(xs[i] - xs[s0 % n], xs[j] - xs[Math.floor(s0 / n)]);
      // behind the sea wall a steep sandy face climbs to a broad, lumpy top about 8 m up, then falls away behind (the pier-head
      // photograph Aaron shared, John Ellis, April 2018, on Google Maps: a tall bank of sand and dry scrub across the harbour mouth, over the
      // boulders and the white wall; local.duneH sets the height)
      const top = local.duneH || 2.5;
      const hum = 0.8 + 0.2 * noise2(xs[i] / 17, xs[j] / 17, 1e6, 7) + 0.18 * (noise2(xs[i] / 5.5, xs[j] / 5.5, 1e6, 8) - 0.5);
      const rise = Math.min(top, Math.max(0, d - 8) * 0.55) * Math.max(0, Math.min(1, (100 - d) / 26)) * Math.max(0.2, hum);
      h[k] += rise; dune[k] = Math.min(1, rise / 1.1); duneH[k] = top > 0 ? rise / top : 0; // (duneH: how far up the dune, 0 at its foot to 1 on the crest)
    }
  }
  // ---- rock armour (localDetail.js rocks): dark granite boulders heaped in the water along the foot of a sea wall ----
  if (local?.rocks) place.rockEdge = buildRocks(group, cls, xs, n, local.rocks, quality); // (rockEdge: where the sea breaks on them, rockSpray.js)
  const X = new Float32Array(n * n), Z = new Float32Array(n * n), wet = new Float32Array(n * n); const faceA = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; X[k] = xs[i]; Z[k] = xs[j]; }
  // the town's rising ground (localDetail.js hill): built-up land and grass climb with it; the grassy face of the slope
  // is drawn as grass, not paving
  const hill = local?.hill || null, bank = new Uint8Array(n * n), steep = new Float32Array(n * n);
  if (hill) for (let k = 0; k < n * n; k++) {
    if (cls[k] !== 1 && cls[k] !== 3) continue;
    const up = hill(X[k], Z[k]); if (up <= 0) continue;
    h[k] += up;
    const dx = Math.abs(hill(X[k] - 2, Z[k]) - hill(X[k] + 2, Z[k])), dz = Math.abs(hill(X[k], Z[k] - 2) - hill(X[k], Z[k] + 2));
    if (Math.max(dx, dz) > 0.3) bank[k] = Math.max(dx, dz) > 2.6 ? 2 : 1; // (2: a cliff's face, steeper than about 33° on the survey's grid: bare rock and earth)
    // (how steep, smoothly: from about 32° (none) to 50° and over (all), where bare rock shows through the grass. Taken
    // across 16 m, two of the survey's steps: across 4 m its slope jumped at every step, and rock and grass ran in
    // stripes along the contours)
    const sx = hill(X[k] + 8, Z[k]) - hill(X[k] - 8, Z[k]), sz = hill(X[k], Z[k] + 8) - hill(X[k], Z[k] - 8);
    const t = Math.min(1, Math.max(0, (Math.hypot(sx, sz) / 16 - 0.62) / 0.58)); steep[k] = t * t * (3 - 2 * t);
  }
  // ---- the town's ground: the map's unmarked land away from the water, the piers and the streets is not the pier's
  // concrete (it was drawn so, slab joints and all, out to the horizon) but yards, gardens, verges and waste ground:
  // worn grass and bare earth, the streets' own tarmac and pavements laid over it. Concrete stays on the piers, within
  // 26 m of a harbour wall (the quays and aprons); the streets lay their own surface over it ----
  const town = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (cls[k] !== 1 || bank[k] || dune[k] > 0.05 || inland) continue;
    const q = [X[k], Z[k]]; if (PR.some((b) => inB(q, b))) continue;
    // (near a harbour wall the land is its quay, concrete; but not where it lies between a beach and a bank, as at the back
    // of Whitby's Tate Hill Sands: drawn as the quay's concrete, its puddles shone white as snow on Aaron's PC)
    const w = nearestWall(X[k], Z[k]);
    if (w && w.d < 26) { const i = k % n; if (w.d < 5 || i < 1 || i > n - 2 || k < n || k >= n * n - n) continue; let soft = 0; for (const q of [k - 1, k + 1, k - n, k + n]) if (cls[q] === 2 || cls[q] === 3 || bank[q]) soft++; if (!soft) continue; }
    town[k] = 1; // (the streets draw their own tarmac and pavements over it, so no margin is kept for them)
  }
  // along every wall: a vertex on the water side within a cell of it moves onto the wall's line, at the deck's height;
  // a land vertex the grid called water is put back. The ground then ends exactly at the wall's top.
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i, cell = Math.max(xs[i + 1] - xs[i], xs[j + 1] - xs[j]);
    if (cell > 7) continue;
    let mixed = false;
    for (const q of [k - 1, k + 1, k - n, k + n, k - n - 1, k - n + 1, k + n - 1, k + n + 1]) if ((cls[q] === 0) !== (cls[k] === 0)) { mixed = true; break; }
    if (!mixed) continue;
    const w = nearestWall(X[k], Z[k]); if (!w || w.d > cell * 1.5) continue;
    if (cls[k] === 2 || cls[k] === 3) continue;
    if (landAt([X[k], Z[k]])) { h[k] = LAND; solid[k] = 1; wet[k] = 1 - w.d / (cell * 1.5); continue; }
    X[k] = w.p[0] - w.s[4] * 0.02; Z[k] = w.p[1] - w.s[5] * 0.02; h[k] = LAND; solid[k] = 1; wet[k] = 1;
  }
  for (let k = 0; k < n * n; k++) {
    const c = COL_OF[bank[k] ? 3 : solid[k] && cls[k] === 0 ? 1 : cls[k]];
    // large, soft variations (no per-vertex checker), and damp concrete near the edge
    const v = 0.9 + noise2(X[k] / 23, Z[k] / 23, 1e6, 3) * 0.14 + noise2(X[k] / 7, Z[k] / 7, 1e6, 4) * 0.06 - wet[k] * 0.12;
    // (the dune: dry, sandy ochre with darker clumps of scrub and marram, the sand showing between, as in the photograph)
    // (the April 2018 photograph from the pier head that Aaron shared: the steep face is bare, bright sand, a few clumps clinging to it; the scrub
    // and marram grow thick along the top. Drawn as one olive tint all over, it read as a grassy hill, not a dune)
    const g2 = Math.min(1, dune[k] * 2.5);
    let GR = c;
    if (g2 > 0) {
      const i = k % n, j = (k - i) / n, i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const sx = (h[j * n + i1] - h[j * n + i0]) / Math.max(0.1, xs[i1] - xs[i0]), sz = (h[j1 * n + i] - h[j0 * n + i]) / Math.max(0.1, xs[j1] - xs[j0]);
      const face = Math.max(0, Math.min(1, (Math.hypot(sx, sz) - 0.18) * 4));
      // (the bare face is the lower part of the dune, under the scrub along its crest: the slope alone read as flat,
      // so the whole dune came out grown over)
      faceA[k] = Math.max(face, 1 - Math.max(0, Math.min(1, (duneH[k] - 0.35) / 0.4)));
      // (the sand's colour only: the scrub is drawn in the shader, clump by clump from the photograph, where it used to
      // be decided a grid point at a time and read as a yellow sponge with dark patches)
      const sand = [0.48, 0.31, 0.14], dry = [0.34, 0.235, 0.11]; // (linear light: on screen a warm ochre and a duller tan)
      GR = [sand[0] + (dry[0] - sand[0]) * (1 - face), sand[1] + (dry[1] - sand[1]) * (1 - face), sand[2] + (dry[2] - sand[2]) * (1 - face)];
    }
    if (town[k]) { // (the town's unmarked ground: worn grass over earth, duller and browner than a park's lawn, bare in patches)
      const s1 = noise2(X[k] / 11, Z[k] / 11, 1e6, 13), s2 = noise2(X[k] / 3.5, Z[k] / 3.5, 1e6, 14), bare = Math.max(0, Math.min(1, (s1 - 0.58) * 3.5)), f = 0.88 + s2 * 0.24;
      const r = 0.23 + bare * 0.08, gg = 0.26 - bare * 0.03, b = 0.13 + bare * 0.02;
      pos.set([X[k], h[k], Z[k]], k * 3); col.set([r * f, gg * f, b * f], k * 3); uv.set([X[k] / 8, Z[k] / 8], k * 2); continue;
    }
    if (bank[k]) { // (the cliff's face: rough grass, darker clumps of scrub and paler worn patches, not a lawn)
      const s1 = noise2(X[k] / 9, Z[k] / 9, 1e6, 11), s2 = noise2(X[k] / 3, Z[k] / 3, 1e6, 12), sc = Math.max(0, Math.min(1, (s1 - 0.55) * 4)), pale = Math.max(0, Math.min(1, (0.35 - s1) * 4)) * 0.5;
      let r = 0.29 - sc * 0.1 + pale * 0.12, gg = 0.36 - sc * 0.1 + pale * 0.08, b = 0.19 - sc * 0.05 + pale * 0.07; const f = 0.9 + s2 * 0.18;
      if (bank[k] === 2) { const t = 0.75 - sc * 0.4; r += (0.27 - r) * t; gg += (0.23 - gg) * t; b += (0.18 - b) * t; } // (the steepest: grey-brown shale and sandstone showing through)
      pos.set([X[k], h[k], Z[k]], k * 3); col.set([r * f, gg * f, b * f], k * 3); uv.set([X[k] / 8, Z[k] / 8], k * 2); continue;
    }
    pos.set([X[k], h[k], Z[k]], k * 3); col.set([(c[0] + (GR[0] - c[0]) * g2) * v, (c[1] + (GR[1] - c[1]) * g2) * v, (c[2] + (GR[2] - c[2]) * g2) * v], k * 3);
    uv.set([X[k] / 8, Z[k] / 8], k * 2); // one concrete tile = 8 m (joints every 4 m)
  }
  const idxDeck = [], idxSoft = [];
  const addTri = (a, b, c) => {
    const sa = solid[a], sb = solid[b], sc = solid[c];
    if (!sa && !sb && !sc && h[a] < -1 && h[b] < -1 && h[c] < -1) return; // open water: nothing to draw
    const soft = [a, b, c].some((q) => cls[q] === 2 || cls[q] === 3 || bank[q] || dune[q] > 0.05) || (town[a] && town[b] && town[c]) || inland; // (the town's ground only where a whole triangle is: its edge triangles stay concrete, tinted, where a white-to-green fade across them stood out as a pale saw-edge) // (the dune too: on dry land it was drawn with the pier's concrete, its joints and all, never the rough ground)
    // a triangle reaching from a wall out into the water would stand above the water in front of the wall: only beaches
    // and banks slope into the water
    if (!(sa && sb && sc) && !soft) return;
    (soft ? idxSoft : idxDeck).push(a, b, c);
  };
  // ---- the fine hillside (Balanced and up): where the place has the survey's 1 m relief (terrain3d.js RELIEF), the soft
  // ground's 3 m cells over it are drawn instead as a 1 m mesh carrying that relief (Whitby's East Cliff, the slope
  // under St Mary's and Henrietta Street: their paths, terraces, walls, slips and gullies, which the 5 m terrain
  // smoothed into one green ramp). Its edges meet the coarse ground exactly (the relief fades in over 6 m from where
  // the fine mesh stops), and it lies smooth along the streets and round the buildings, which stand on it ----
  // (Balanced too, since 19 November: it is one mesh, some 300,000 triangles and nothing more to draw each frame, and
  // without it a phone showed the East Cliff as smooth green ramps, Aaron's screenshots)
  const REL = quality >= 1 && local0?.terrain && hill ? reliefOf(local0.terrain) : null;
  let fineCell = null, F = null;
  if (REL) {
    const fi0 = xs.indexOf(REL.x0), fi1 = xs.indexOf(REL.x0 + REL.nx - 1), fj0 = xs.indexOf(REL.z0), fj1 = xs.indexOf(REL.z0 + REL.nz - 1);
    if (fi0 >= 0 && fi1 > fi0 && fj0 >= 0 && fj1 > fj0) {
      const softQ = (a, b, c) => [a, b, c].some((q) => cls[q] === 3 || bank[q] || dune[q] > 0.05) || (town[a] && town[b] && town[c]);
      fineCell = new Uint8Array((n - 1) * (n - 1)); let any = 0;
      for (let j = fj0; j < fj1; j++) for (let i = fi0; i < fi1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        if ([a, b, c, d].some((q) => cls[q] === 2) || [a, b, c, d].every((q) => cls[q] === 0)) continue; // (not the beaches, nor out in the water; a cliff's foot in the sea, yes)
        if (softQ(a, c, b) && softQ(b, c, d)) { fineCell[j * (n - 1) + i] = 1; any++; }
      }
      if (any) F = { fi0, fj0, fi1, fj1 }; else fineCell = null;
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { if (fineCell && fineCell[j * (n - 1) + i]) continue; const a = j * n + i, b = a + 1, c = a + n, d = c + 1; addTri(a, c, b); addTri(b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("aDamp", new THREE.BufferAttribute(wet, 1)); // (the deck's shader: damp along the walls)
  // rough ground (the cliff's face, the dune): how much of the photographed scrubby ground shows there (soft shader)
  const ruf = new Float32Array(n * n); for (let k = 0; k < n * n; k++) ruf[k] = bank[k] ? 1 : town[k] ? 0.18 : Math.min(1, dune[k] * 1.4);
  g.setAttribute("aRuf", new THREE.BufferAttribute(ruf, 1));
  g.setAttribute("aSteep", new THREE.BufferAttribute(steep, 1)); // (the bank's steepness: where its rock shows, local.cliff)
  // turf: the lawns and the town's ground are grass (drawn turf, textures3d.js) rather than the deck's concrete tinted green
  const grs = new Float32Array(n * n); for (let k = 0; k < n * n; k++) grs[k] = bank[k] || dune[k] > 0.05 ? 0 : cls[k] === 3 || town[k] ? 1 : 0;
  g.setAttribute("aGrass", new THREE.BufferAttribute(grs, 1));
  // (plain land at the edge of the soft ground: a quay's or a promenade's corner that a bank's or a lawn's triangle
  // reaches. Drawn by the soft ground's shader with nothing of its own, it took the concrete's pale grey, and along the
  // foot of Whitby's East Cliff the strip shone white on Aaron's PC. It takes its neighbour's ground instead: rough by a
  // bank, grass by a lawn, its colour most of the way to theirs; the concrete's own triangles only take the tint, a
  // dirty edge where the bank comes down onto it)
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i; if (cls[k] !== 1 || town[k] || bank[k] || dune[k] > 0.05) continue;
    const nb = [k - 1, k + 1, k - n, k + n], bq = nb.find((q) => bank[q]), lq = nb.find((q) => cls[q] === 3 || town[q]), q = bq ?? lq; if (q === undefined) continue;
    if (bq !== undefined) ruf[k] = Math.max(ruf[k], 0.75); else grs[k] = 1;
    // (less of the neighbour's colour where the point is mostly among the concrete's own, so a promenade's edge isn't
    // stained green along every lawn)
    const plain = nb.filter((p) => cls[p] === 1 && !town[p] && !bank[p] && dune[p] <= 0.05).length, f = plain >= 2 ? 0.35 : 0.75;
    for (let ch = 0; ch < 3; ch++) col[k * 3 + ch] += (col[q * 3 + ch] - col[k * 3 + ch]) * f;
  }
  for (let k = 0; k < n * n; k++) if (bank[k] || dune[k] <= 0) faceA[k] = -1; // (-1: not the dune, no scrub drawn)
  // the beach's sand (a beach mark's: localDetail.js beach), drawn from a photograph of sand, wet below the last waves
  const sandA = new Float32Array(n * n); if (BP) for (let k = 0; k < n * n; k++) sandA[k] = (cls[k] === 2 || (cls[k] === 0 && h[k] > GROUND.water + 0.05)) && !dune[k] ? 1 : 0;
  g.setAttribute("aSand", new THREE.BufferAttribute(sandA, 1));
  g.setAttribute("aFace", new THREE.BufferAttribute(faceA, 1));
  const all = idxDeck.concat(idxSoft);
  g.setIndex(n * n > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.addGroup(0, idxDeck.length, 0); g.addGroup(idxDeck.length, idxSoft.length, 1);
  g.computeVertexNormals();
  g.setAttribute("aSoil", new THREE.BufferAttribute(new Float32Array(n * n), 1)); // (bare soil: only on the fine hillside)
  // (the fine hillside's mesh, its heights and the lookups for what stands on it: fineAt(x, z) its height, or null)
  let gF = null, fineAt = () => null, fineInfo = () => null;
  if (F) {
    const nx = REL.nx, nz = REL.nz, X0 = REL.x0, Z0 = REL.z0, NP = nx * nz;
    // which 1 m quads it covers (those inside a replaced cell) and which points
    const qc = new Uint8Array((nx - 1) * (nz - 1)), pc = new Uint8Array(NP);
    for (let j = F.fj0; j < F.fj1; j++) for (let i = F.fi0; i < F.fi1; i++) {
      if (!fineCell[j * (n - 1) + i]) continue;
      for (let zz = xs[j]; zz < xs[j + 1]; zz++) for (let xx = xs[i]; xx < xs[i + 1]; xx++) {
        const qi = xx - X0, qj = zz - Z0; qc[qj * (nx - 1) + qi] = 1;
        pc[qj * nx + qi] = pc[qj * nx + qi + 1] = pc[(qj + 1) * nx + qi] = pc[(qj + 1) * nx + qi + 1] = 1;
      }
    }
    // the coarse cell a point is in (for the coarse ground's own height and attributes there, its triangle as drawn)
    const coarse = (arr, stride, off, x, z) => {
      let i = F.fi0; while (i < n - 2 && xs[i + 1] <= x) i++; let j = F.fj0; while (j < n - 2 && xs[j + 1] <= z) j++;
      const fx = (x - xs[i]) / (xs[i + 1] - xs[i]), fz = (z - xs[j]) / (xs[j + 1] - xs[j]), a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      const A = arr[a * stride + off], B = arr[b * stride + off], C = arr[c * stride + off], D = arr[d * stride + off];
      return fx + fz <= 1 ? A + fx * (B - A) + fz * (C - A) : D + (1 - fx) * (C - D) + (1 - fz) * (B - D);
    };
    // distance (metres, chamfer) from the fine mesh's edge, and from the streets and buildings it lies smooth round
    const chamfer = (seed) => {
      const dd = new Float32Array(NP); for (let p = 0; p < NP; p++) dd[p] = seed[p] ? 0 : 1e4;
      const s2 = Math.SQRT2;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const p = j * nx + i; let v = dd[p]; if (i) v = Math.min(v, dd[p - 1] + 1); if (j) { v = Math.min(v, dd[p - nx] + 1); if (i) v = Math.min(v, dd[p - nx - 1] + s2); if (i < nx - 1) v = Math.min(v, dd[p - nx + 1] + s2); } dd[p] = v; }
      for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const p = j * nx + i; let v = dd[p]; if (i < nx - 1) v = Math.min(v, dd[p + 1] + 1); if (j < nz - 1) { v = Math.min(v, dd[p + nx] + 1); if (i < nx - 1) v = Math.min(v, dd[p + nx + 1] + s2); if (i) v = Math.min(v, dd[p + nx - 1] + s2); } dd[p] = v; }
      return dd;
    };
    const edge = new Uint8Array(NP);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const p = j * nx + i; if (!pc[p]) { edge[p] = 1; continue; }
      const q = (ii, jj) => ii >= 0 && jj >= 0 && ii < nx - 1 && jj < nz - 1 && qc[jj * (nx - 1) + ii];
      if (!(q(i - 1, j - 1) && q(i, j - 1) && q(i - 1, j) && q(i, j))) edge[p] = 1;
    }
    const flat = new Uint8Array(NP);
    const stamp = (x, z) => { const i = Math.round(x - X0), j = Math.round(z - Z0); if (i >= 0 && j >= 0 && i < nx && j < nz) flat[j * nx + i] = 1; };
    for (const r of place.roads || []) for (let s = 0; s + 1 < r.line.length; s++) {
      const [ax, az] = r.line[s], [bx, bz] = r.line[s + 1], L = Math.hypot(bx - ax, bz - az), hw = r.w / 2 + 1.2;
      for (let u = 0; u <= L; u += 0.7) for (let v = -hw; v <= hw; v += 0.7) { const f = L ? u / L : 0; stamp(ax + (bx - ax) * f + (-(bz - az) / (L || 1)) * v, az + (bz - az) * f + ((bx - ax) / (L || 1)) * v); }
    }
    for (const b of place.buildings || []) { const B = bb(b.ring); if (B.x1 < X0 || B.x0 > X0 + nx || B.z1 < Z0 || B.z0 > Z0 + nz) continue; for (let z = Math.floor(B.z0) - 1; z <= B.z1 + 1; z++) for (let x = Math.floor(B.x0) - 1; x <= B.x1 + 1; x++) if (inB([x, z], { ...B, x0: B.x0 - 1.5, x1: B.x1 + 1.5, z0: B.z0 - 1.5, z1: B.z1 + 1.5 }) && (inside([x, z], B.r) || B.r.some((q, k) => segDist([x, z], q, B.r[(k + 1) % B.r.length]) < 1.5))) stamp(x, z); }
    // (the buildings' own footprints, for the shade at their feet: the ground darker within a couple of metres of a wall,
    // where the sky's light is half shut out; without it every house stood on the slope as if pasted on)
    const foot = new Uint8Array(NP);
    for (const b of place.buildings || []) { const B = bb(b.ring); if (B.x1 < X0 || B.x0 > X0 + nx || B.z1 < Z0 || B.z0 > Z0 + nz) continue; for (let z = Math.floor(B.z0); z <= B.z1; z++) for (let x = Math.floor(B.x0); x <= B.x1; x++) if (inside([x, z], B.r)) { const i = Math.round(x - X0), j = Math.round(z - Z0); if (i >= 0 && j >= 0 && i < nx && j < nz) foot[j * nx + i] = 1; } }
    const dFoot = chamfer(foot);
    const dEdge = chamfer(edge), dFlat = chamfer(flat), sm = (e0, e1, v) => { const tt = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return tt * tt * (3 - 2 * tt); };
    // the heights: the coarse ground's own at the edge, the 5 m terrain's smooth surface inside, and the relief on it
    const Y = new Float32Array(NP), base = GROUND.land;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const p = j * nx + i; if (!pc[p]) continue;
      const x = X0 + i, z = Z0 + j, lin = coarse(pos, 3, 1, x, z), w = sm(0, 6, dEdge[p]);
      Y[p] = lin + w * (base + hill(x, z) - lin + REL.D[p] * sm(0, 2.5, dFlat[p]));
    }
    fineAt = (x, z) => {
      const u = x - X0, v = z - Z0; if (u < 0 || v < 0 || u >= nx - 1 || v >= nz - 1) return null;
      const i = Math.floor(u), j = Math.floor(v); if (!qc[j * (nx - 1) + i]) return null;
      const fx = u - i, fz = v - j, a = j * nx + i, A = Y[a], B = Y[a + 1], C = Y[a + nx], D = Y[a + nx + 1];
      return fx + fz <= 1 ? A + fx * (B - A) + fz * (C - A) : D + (1 - fx) * (C - D) + (1 - fz) * (B - D);
    };
    // the mesh: every covered point, its attributes the coarse ground's there; bare soil where the fine slope is steep or
    // runs in a gully, on the banks
    const idx = new Int32Array(NP).fill(-1); let nv = 0; for (let p = 0; p < NP; p++) if (pc[p]) idx[p] = nv++;
    const P3 = new Float32Array(nv * 3), C3 = new Float32Array(nv * 3), UVf = new Float32Array(nv * 2), at = {}, names = { aDamp: wet, aRuf: ruf, aSteep: steep, aGrass: grs, aSand: sandA, aFace: faceA };
    for (const k of Object.keys(names)) at[k] = new Float32Array(nv);
    const soilA = new Float32Array(nv), soilP = new Float32Array(NP), slopeP = new Float32Array(NP);
    const Yat = (i, j) => Y[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const p = j * nx + i, v = idx[p]; if (v < 0) continue;
      const x = X0 + i, z = Z0 + j;
      P3[v * 3] = x; P3[v * 3 + 1] = Y[p]; P3[v * 3 + 2] = z; UVf[v * 2] = x / 8; UVf[v * 2 + 1] = z / 8;
      for (let ch = 0; ch < 3; ch++) C3[v * 3 + ch] = coarse(col, 3, ch, x, z);
      for (const k of Object.keys(names)) at[k][v] = coarse(names[k], 1, 0, x, z);
      // (the fine slope over 2 m, and the hollow or crest over 4 m: steep faces show rock or soil, gullies collect soil)
      const sx = (Yat(i + 1, j) - Yat(i - 1, j)) / 2, sz = (Yat(i, j + 1) - Yat(i, j - 1)) / 2, slope = Math.hypot(sx, sz);
      const lap = (Yat(i + 2, j) + Yat(i - 2, j) + Yat(i, j + 2) + Yat(i, j - 2) - 4 * Y[p]) / 4;
      const w = sm(0, 6, dEdge[p]) * sm(0, 2.5, dFlat[p]);
      at.aSteep[v] = Math.max(at.aSteep[v], sm(0.85, 1.6, slope) * w);
      // (bare where it's steeper than about 38 degrees, and in the gullies' bottoms; the hillside's usual 25 to 35 degrees
      // stay grassed, as the East Cliff's slopes mostly are: from 24 degrees most of the slope came out bare)
      soilA[v] = Math.min(1, sm(0.78, 1.25, slope) * 0.85 + sm(0.18, 0.55, lap) * 0.55) * w * Math.min(1, at.aRuf[v] * 1.6 + at.aGrass[v] * 0.25);
      soilP[p] = soilA[v]; slopeP[p] = slope * w;
      // (the light the ground gets from the sky: less in a hollow and at the foot of a wall, a little more on a crest; the
      // relief read flat in an even light, as if lit from everywhere at once)
      const ao = (1 - 0.32 * (1 - sm(0.5, 2.6, dFoot[p]))) * (1 - 0.22 * sm(0.06, 0.5, lap) * w) * (1 + 0.06 * sm(0.06, 0.4, -lap) * w);
      for (let ch = 0; ch < 3; ch++) C3[v * 3 + ch] *= ao;
    }
    const ix = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (!qc[j * (nx - 1) + i]) continue;
      const a = idx[j * nx + i], b = idx[j * nx + i + 1], c = idx[(j + 1) * nx + i], d = idx[(j + 1) * nx + i + 1];
      ix.push(a, c, b, b, c, d);
    }
    gF = new THREE.BufferGeometry();
    gF.setAttribute("position", new THREE.BufferAttribute(P3, 3)); gF.setAttribute("color", new THREE.BufferAttribute(C3, 3)); gF.setAttribute("uv", new THREE.BufferAttribute(UVf, 2));
    for (const k of Object.keys(names)) gF.setAttribute(k, new THREE.BufferAttribute(at[k], 1));
    gF.setAttribute("aSoil", new THREE.BufferAttribute(soilA, 1));
    gF.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(ix, 1) : new THREE.Uint16BufferAttribute(ix, 1));
    gF.computeVertexNormals(); gF.computeBoundingSphere();
    place.fineGround = { verts: nv, tris: ix.length / 3, at: fineAt };
    fineInfo = (x, z) => { const i = Math.round(x - X0), j = Math.round(z - Z0); if (i < 0 || j < 0 || i >= nx || j >= nz || !pc[j * nx + i]) return null; return { soil: soilP[j * nx + i], slope: slopeP[j * nx + i] }; };
  }
  const cTex = concrete({ seed: 3, joints: false }), dTex = detail(13);
  let concSide = null; // (a mark's concrete pier sides and parapets: localDetail.js concrete)
  let stoneSide = null, stoneTop = null; // (a mark's sandstone pier walls and decks: localDetail.js stone)
  const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: cTex.map, normalMap: cTex.normalMap, roughnessMap: cTex.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.45, 0.45) });
  // the pier's own direction (its longest run of wall near the fishing spots), for the deck's slab joints: square across
  // it, not across the map's north and south
  let axis = 0; { let best = 0; for (const e of walls) { const L = Math.hypot(e[2] - e[0], e[3] - e[1]), mx = (e[0] + e[2]) / 2, mz = (e[1] + e[3]) / 2; const near = spots.length ? Math.min(...spots.map((sp) => Math.hypot(mx - sp.at[0], mz - sp.at[2]))) : 0; const w = L / (1 + near / 60); if (w > best) { best = w; axis = Math.atan2(e[3] - e[1], e[2] - e[0]); } } }
  const deckShade = { tex: { value: null }, box: { value: new THREE.Vector4(0, 0, 1, 1) }, k: { value: 0 } }; // (filled in once everything on the deck is placed: contactShade)
  place.deckWet = pierConcrete(deckMat, quality, axis, deckShade);
  const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: dTex.map, normalMap: dTex.normalMap, roughness: 1 });
  // the cliff's face and the dune: a photographed patch of rough coastal ground (Poly Haven coast_sand_rocks_02, CC0:
  // scrub, bare earth and stones) at about 6 m a tile, coloured by the ground's own tint (green on the cliff, sandy
  // ochre on the dune), and its bumps in the lighting, in place of the plain speckle
  const rufMap = photoTex("ground_rough_diff"), rufNor = photoTex("ground_rough_nor", { srgb: false });
  // (the beach's sand: Poly Haven's Aerial Sand, dry, footprints and all, and Damp Beach Sand where the waves have
  // been, both CC0; their colour the beach's own, BP.tint, their light and dark the photographs')
  const sandName = BP?.tex || "beach_sand", wetName = BP?.texWet || "beach_wet";
  const sandMap = BP ? photoTex(sandName + "_diff") : null, sandNor = BP ? photoTex(sandName + "_nor", { srgb: false }) : null;
  const wetMap = BP ? photoTex(wetName + "_diff") : null, wetNor = BP ? photoTex(wetName + "_nor", { srgb: false }) : null;
  const turfT = turf();
  // ---- a place's own cliffs (localDetail.js cliff): photoscanned grass over the bank at two scales, and on its steep
  // faces photoscanned rock laid from three sides by world position (so it doesn't smear down a face), showing through
  // the grass in ragged outcrops where the slope passes about 30 degrees ----
  // (and every place's grass is photographed (Poly Haven Leafy Grass, CC0) rather than drawn, its lawns, verges and
  // banks; worn, muddy patches on the town's ground and lawns from a photograph of mud and leaves (Brown Mud Leaves 01))
  const CL = local?.cliff || null, GRASS = CL?.grass || "grass_leafy";
  const clG = photoTex(GRASS + "_diff"), clGN = clG && photoTex(GRASS + "_nor", { srgb: false }), grOn = !!clG;
  const clR = CL ? photoTex(CL.rock + "_diff") : null, clRN = clR && photoTex(CL.rock + "_nor", { srgb: false });
  const clOn = !!(CL && grOn && clR), mudT = photoTex("ground_mud_diff"), mudOn = !!mudT;
  if (rufMap) {
    softMat.onBeforeCompile = (sh) => {
      sh.uniforms.uRuf = { value: rufMap }; sh.uniforms.uRufN = { value: rufNor }; sh.uniforms.uTurf = { value: turfT.map }; sh.uniforms.uTurfN = { value: turfT.normalMap };
      sh.uniforms.uSand = { value: sandMap || rufMap }; sh.uniforms.uSandN = { value: sandNor || rufNor }; sh.uniforms.uSandW = { value: wetMap || rufMap }; sh.uniforms.uSandWN = { value: wetNor || rufNor };
      sh.uniforms.uSandK = { value: new THREE.Vector4(...(BP?.tint || [0.56, 0.46, 0.31]), BP?.tile || 3.5) }; sh.uniforms.uSandL = { value: new THREE.Vector3(BP?.lum || 0.283, BP?.lumWet || 0.122, BP?.tileWet || 2.2) };
      sh.uniforms.uClG = { value: clG || rufMap }; sh.uniforms.uClGN = { value: clGN || rufNor }; sh.uniforms.uClR = { value: clR || rufMap }; sh.uniforms.uClRN = { value: clRN || rufNor };
      sh.uniforms.uClK = { value: new THREE.Vector4(CL?.rockTile || 7, CL?.grassTile || 2, CL?.rockFaces?.[0] || 0, CL?.rockFaces?.[1] || 0) }; sh.uniforms.uClRock = { value: new THREE.Color(...(CL?.rockTint || [1, 1, 1])) }; sh.uniforms.uClOn = { value: clOn ? 1 : 0 }; sh.uniforms.uMud = { value: mudT || rufMap };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aRuf; attribute float aFace; attribute float aGrass; attribute float aSand; attribute float aSteep; attribute float aSoil; varying float vSoil; varying float vRuf; varying float vFace; varying float vGrass; varying float vSand; varying float vSteep; varying vec2 vRufUv; varying vec3 vWPos; varying vec3 vWNrm;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvRuf = aRuf; vFace = aFace; vGrass = aGrass; vSand = aSand; vSteep = aSteep; vSoil = aSoil; vRufUv = uv * 1.33; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);");
      // (only the samplers this place uses are declared: with the sand's four, the cliff's four and the turf's two all in
      // one shader it needed seventeen, and a graphics card allowing sixteen (most PCs through Direct3D) failed to build
      // it, and drew none of the soft ground: Whitby's cliffs were missing on the PC)
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
          ${BP ? "#define FD_SAND" : ""}
          ${grOn ? "#define FD_PGRASS" : ""}
          ${clOn ? "#define FD_CLIFF" : ""}
          ${mudOn ? "#define FD_MUD" : ""}
          uniform sampler2D uRuf, uRufN;
          #ifdef FD_PGRASS
            uniform sampler2D uClG, uClGN;
          #else
            uniform sampler2D uTurf, uTurfN;
          #endif
          #ifdef FD_CLIFF
            uniform sampler2D uClR, uClRN;
          #endif
          #ifdef FD_MUD
            uniform sampler2D uMud;
          #endif
          #ifdef FD_SAND
            uniform sampler2D uSand, uSandN, uSandW, uSandWN;
          #endif
          uniform vec4 uSandK, uClK; uniform vec3 uSandL, uClRock; uniform float uClOn; varying float vRuf; varying float vFace; varying float vGrass; varying float vSand; varying float vSteep; varying float vSoil; varying vec2 vRufUv; varying vec3 vWPos; varying vec3 vWNrm;
          float fdDuneH = 0.0, fdWet = 0.0, fdRock = 0.0; vec3 fdTriW = vec3(0.0, 1.0, 0.0);
          float fdDH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
          float fdDN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fdDH(i), fdDH(i + vec2(1.0, 0.0)), f.x), mix(fdDH(i + vec2(0.0, 1.0)), fdDH(i + vec2(1.0, 1.0)), f.x), f.y); }
          float fdDF(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * fdDN(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          #ifdef FD_SAND
          if (vSand > 0.01) {
            // the beach: a photograph of dry sand at two scales (so its tile doesn't show across a hundred metres), its
            // light and dark kept and its colour the beach's own; and where the waves have wet it, from the water's edge
            // up to where the last of them reached (a ragged line, higher where a bigger wave ran up), a photograph of
            // damp sand, darker, browner and smoother
            vec2 wp = vWPos.xz; float sdist = length(vViewPosition), far = smoothstep(20.0, 90.0, sdist);
            // (the second scale turned, so the first's footprints and ripples don't line up into stripes far off)
            vec3 a1 = texture2D(uSand, wp / uSandK.w).rgb, a2 = texture2D(uSand, mat2(0.8, 0.6, -0.6, 0.8) * wp / (uSandK.w * 2.9) + 0.37).rgb;
            float lum = dot(mix(a1, a2, 0.5), vec3(0.3, 0.55, 0.15)) / uSandL.x;
            // (further off the photograph's footprints fade to a soft, slow variation of tone: seen from above at 80 m their
            // tile read as a quilt)
            vec3 dry = uSandK.rgb * mix(clamp(pow(lum, 0.8), 0.55, 1.45), 1.0, far * 0.85) * (0.93 + 0.1 * fdDN(wp / 9.0) + 0.06 * fdDN(wp / 41.0));
            vec3 w1 = texture2D(uSandW, wp / uSandL.z).rgb;
            float lw = dot(w1, vec3(0.3, 0.55, 0.15)) / uSandL.y;
            vec3 wetC = uSandK.rgb * vec3(0.52, 0.48, 0.42) * mix(clamp(pow(lw, 0.7), 0.6, 1.4), 1.0, far * 0.6);
            float reach = 0.42 + 0.14 * fdDN(wp * vec2(0.09, 0.03)) + 0.08 * fdDN(wp * 0.31);
            fdWet = 1.0 - smoothstep(reach - 0.12, reach + 0.04, vWPos.y);
            // (the sand's edge broken up by noise, not the ground grid's 3 m staircase)
            float sW = smoothstep(0.28, 0.72, vSand + (fdDN(wp / 2.3) - 0.5) * 0.55 + (fdDN(wp * 1.7) - 0.5) * 0.15);
            // (never wet against the grass or the bank's foot: in a hollow at the back of the beach the wet film shone white
            // as snow on Aaron's PC, though no wave reaches there)
            fdWet *= 1.0 - smoothstep(0.04, 0.35, vGrass + vRuf);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(dry, wetC, fdWet), sW);
            fdWet *= sW;
          }
          #endif
          if (vGrass > 0.01) {
            #ifdef FD_PGRASS
              // (the photographed grass, at two scales so its tile doesn't show across a lawn, its light and dark kept and its
              // colour the ground's own)
              vec2 wq = vWPos.xz; vec3 q1 = texture2D(uClG, wq / uClK.y).rgb, q2 = texture2D(uClG, mat2(0.8, 0.6, -0.6, 0.8) * wq / (uClK.y * 3.7) + 0.31).rgb;
              float ql = dot(mix(q1, q2, 0.4), vec3(0.3, 0.55, 0.15)) / max(dot(texture2D(uClG, vec2(0.5), 12.0).rgb, vec3(0.3, 0.55, 0.15)), 0.02);
              vec3 grass = vColor.rgb * 0.95 * mix(clamp(ql, 0.35, 2.0), 1.0, smoothstep(60.0, 260.0, length(vViewPosition)) * 0.6) * (0.9 + 0.2 * fdDN(wq / 19.0));
              // (and in broad patches tens of metres across, drier and yellower: GRASS_DRY, the same in the grass layer)
              grass *= mix(vec3(1.0), vec3(${GRASS_DRY.tint.join(", ")}), smoothstep(${GRASS_DRY.lo.toFixed(2)}, ${GRASS_DRY.hi.toFixed(2)}, fdDF(wq / ${GRASS_DRY.scale.toFixed(1)} + 3.0)) * ${GRASS_DRY.k.toFixed(2)});
            #else
              // turf at two scales (2 m and about 7 m) so the blades don't repeat visibly across a lawn; the tint is the ground's
              vec2 tuv = vRufUv * 4.0;
              vec3 t1 = texture2D(uTurf, tuv).rgb, t2 = texture2D(uTurf, tuv * 0.29 + 0.41).rgb;
              vec3 grass = vColor.rgb * mix(t1, t2, 0.45) * 2.05;
            #endif
            #ifdef FD_MUD
              // (worn to the mud in patches: often on the town's rough ground (its vRuf a little above 0), now and then on a
              // lawn; the photograph's own colour, a little darker, its edge ragged)
              vec2 wm = vWPos.xz; float town = step(0.08, vRuf) * step(vRuf, 0.3);
              float worn = smoothstep(0.6, 0.72, fdDF(wm / 9.0 + 7.0) + (fdDN(wm / 1.7) - 0.5) * 0.16 + town * ${MUD.lift.toFixed(3)} - (1.0 - town) * ${MUD.lawnLess.toFixed(3)}) * mix(${MUD.lawn.toFixed(2)}, ${MUD.town.toFixed(2)}, town);
              // (the photograph's orange of fallen leaves taken down by half towards its own grey, so it reads as earth; and
              // only well inside the grass, as at a lawn's edge it faded across the ground's triangles in straight lines)
              vec3 mudP = texture2D(uMud, wm / 2.5).rgb, mudC = mix(mudP, vec3(dot(mudP, vec3(0.3, 0.55, 0.15))) * vec3(1.08, 1.0, 0.86), 0.5) * 0.8 * (0.9 + 0.2 * fdDN(wm / 13.0));
              grass = mix(grass, mudC, worn * smoothstep(0.55, 0.95, vGrass));
            #endif
            // (the lawn's edge broken up by noise as well)
            diffuseColor.rgb = mix(diffuseColor.rgb, grass, smoothstep(0.25, 0.75, vGrass + (fdDN(vWPos.xz / 2.1 + 5.0) - 0.5) * 0.5 + (fdDN(vWPos.xz * 1.9) - 0.5) * 0.14));
          }
          if (vRuf > 0.01) {
            // (two scales of the photograph mixed, so its tile doesn't repeat visibly across a 50 m slope)
            vec3 r1 = texture2D(uRuf, vRufUv).rgb, r2 = texture2D(uRuf, vRufUv * 0.37 + 0.21).rgb;
            vec3 ph = mix(r1, r2, 0.35);
            float lum = dot(ph, vec3(0.3, 0.55, 0.15));
            // keep the photograph's light and dark (stones, hollows, clumps) but take its colour from the ground's tint
            // (the photograph is decoded to linear light, where its average brightness is 0.06, not the 0.45 it looks on screen:
            // scaled by 2.2 the ground came out at an eighth of its colour, and the dune's sand read as dark olive scrub)
            // (its stones' light and dark softened: at full contrast the sand read as a heap of pebbles)
            vec3 tinted = vColor.rgb * clamp(pow(lum / 0.06, 0.55), 0.45, 1.7) + (ph - lum) * 0.12;
            #ifdef FD_PGRASS
            if (vFace < 0.0) {
              // the bank (and a cliff's, local.cliff): grass from a photograph at two scales (the second turned, so neither repeats
              // across the slope), its light and dark kept and its colour the bank's tint; darker patches of scrub
              vec2 wp = vWPos.xz; float dist = length(vViewPosition);
              vec3 g1 = texture2D(uClG, wp / uClK.y).rgb, g2 = texture2D(uClG, mat2(0.8, 0.6, -0.6, 0.8) * wp / (uClK.y * 3.7) + 0.31).rgb;
              float gl = dot(mix(g1, g2, 0.4), vec3(0.3, 0.55, 0.15)) / max(dot(texture2D(uClG, vec2(0.5), 12.0).rgb, vec3(0.3, 0.55, 0.15)), 0.02); // (over the photograph's own average)
              vec3 grassC = vColor.rgb * mix(clamp(gl, 0.35, 2.0), 1.0, smoothstep(60.0, 260.0, dist) * 0.6) * (0.86 + 0.28 * fdDN(wp / 23.0));
              grassC *= mix(vec3(1.0), vec3(${GRASS_DRY.tint.join(", ")}), smoothstep(${GRASS_DRY.lo.toFixed(2)}, ${GRASS_DRY.hi.toFixed(2)}, fdDF(wp / ${GRASS_DRY.scale.toFixed(1)} + 3.0)) * ${GRASS_DRY.k.toFixed(2)});
              // (patches of darker, browner scrub, broken up, not a stain)
              grassC = mix(grassC, grassC * vec3(0.74, 0.72, 0.6), smoothstep(0.62, 0.74, fdDF(wp / 17.0 + 9.0) + (fdDN(wp / 3.1) - 0.5) * 0.18) * 0.6);
              #ifndef FD_CLIFF
              // (no cliff of its own: the photographed rough ground shows through where the bank is steep)
              tinted = mix(grassC, tinted, 0.25 + 0.55 * vSteep);
              #else
              // the rock: the photograph laid from the three sides, each weighted by how squarely the ground faces it
              vec3 an = pow(abs(vWNrm), vec3(4.0)); an /= (an.x + an.y + an.z); fdTriW = an;
              // (at two scales, the second turned and three times the size, so the photograph's tile doesn't show as a
              // chequer across a 50 m face; only its light and dark over its own average are kept, the colour is the
              // cliff's own)
              // (on the faces the photograph is turned a quarter, so its grain runs along the beds, level, as a sedimentary
              // cliff's does: the right way up its cracks ran down the face, and the cliff read as a hanging curtain)
              vec3 rX = texture2D(uClR, vWPos.yz / uClK.x).rgb, rY = texture2D(uClR, vWPos.xz / uClK.x).rgb, rZ = texture2D(uClR, vWPos.yx / uClK.x).rgb;
              mat2 tw = mat2(0.97, 0.24, -0.24, 0.97); float k2 = uClK.x * 3.3;
              vec3 sX = texture2D(uClR, tw * vWPos.yz / k2 + 0.37).rgb, sY = texture2D(uClR, tw * vWPos.xz / k2 + 0.37).rgb, sZ = texture2D(uClR, tw * vWPos.yx / k2 + 0.37).rgb;
              vec3 rk = mix(rX * an.x + rY * an.y + rZ * an.z, sX * an.x + sY * an.y + sZ * an.z, 0.45);
              float rAvg = dot(texture2D(uClR, vec2(0.5), 12.0).rgb, vec3(0.3, 0.55, 0.15));
              float rl = dot(rk, vec3(0.3, 0.55, 0.15)) / max(rAvg, 0.02);
              // (the beds of a sedimentary cliff: paler and darker layers a metre or two thick, wavering along the face,
              // and darker streaks where water runs down it)
              float bedY = vWPos.y + fdDN(wp / 40.0) * 3.0;
              float beds = fdDN(vec2(bedY * 0.62, (wp.x + wp.y) * 0.015)) * 0.65 + fdDN(vec2(bedY * 2.3, (wp.x + wp.y) * 0.05)) * 0.35; // (thick beds and thin ones within them)
              float runs = fdDN(vec2((wp.x - wp.y) * 0.35, vWPos.y * 0.04));
              vec3 rockC = uClRock * clamp(pow(rl, 0.85), 0.35, 1.9) * (0.7 + 0.52 * beds) * (1.0 - 0.1 * smoothstep(0.55, 0.85, runs)) * (0.9 + 0.2 * fdDN(wp / 31.0));
              // (it shows through in ragged outcrops: the slope's steepness, broken up by noise at two scales)
              fdRock = smoothstep(0.4, 0.62, vSteep + (fdDF(wp / 11.0) - 0.5) * 0.6 + (fdDN(wp / 2.7) - 0.5) * 0.12);
              // (local.cliff.rockFaces: the way the sea faces, where the waves have bared the rock; slopes turned away
              // from it, inland or over the harbour, stay grassed: Whitby's bank under St Mary's was a dark blotch)
              if (dot(uClK.zw, uClK.zw) > 0.0) fdRock *= smoothstep(-0.4, 0.05, dot(normalize(vWNrm.xz + vec2(1e-5)), uClK.zw));
              // (and even on the steep faces, scrub and grass hold on in patches and along the ledges)
              fdRock *= 1.0 - 0.7 * smoothstep(0.58, 0.7, fdDF(vec2(wp.x + wp.y, vWPos.y * 2.2) / 9.0 + 3.0));
              tinted = mix(grassC, rockC, fdRock);
              #endif
            }
            #endif
            if (vFace >= 0.0) {
              // the dune, drawn from where each point is on the ground (not from the tiled photograph, whose pebbles
              // read from the pier as an even yellow stipple): pale sand; marram grass in drifts metres across, straw
              // where it has dried and grey-green where it hasn't, thick along the top and thinning to a few clumps
              // on the steep bare face; darker patches of low scrub; the sand slumped in runs down the face. Each
              // layer fades out before it gets smaller than a pixel, so the far dune is smooth, not noisy.
              // (how a marram dune looks in general, and the bare face under a grown-over top that the pier-head
              // photograph shows; the clumps are not surveyed one by one)
              vec2 wp = vWPos.xz; float dist = length(vViewPosition);
              float nearK = 1.0 - smoothstep(25.0, 90.0, dist), midK = 1.0 - smoothstep(120.0, 320.0, dist);
              float drift = fdDF(wp / 13.0), clump = fdDF(wp / 3.4 + 31.0), tuft = fdDN(wp * 2.3 + 7.0);
              float field = drift * 0.62 + clump * 0.44 * (0.35 + 0.65 * midK) + (tuft - 0.5) * 0.16 * nearK;
              float th = mix(0.385, 0.64, vFace);
              float cover = smoothstep(th - 0.035, th + 0.045, field);
              // sand: pale and warm, a little greyer and brighter on the wind-dried top, with slow changes of tone,
              // the photograph's fine relief close to, and darker runs where it has slipped down the face
              vec3 sand = mix(vec3(0.47, 0.37, 0.23), vec3(0.56, 0.47, 0.32), fdDN(wp / 7.0 + 3.0)) * mix(0.92, 1.06, 1.0 - vFace);
              sand *= mix(1.0, clamp(pow(lum / 0.06, 0.22), 0.8, 1.22), 1.0 - smoothstep(8.0, 28.0, dist));
              float run = fdDN(vec2(wp.x * 0.55, vWPos.y * 0.22 + wp.y * 0.03));
              sand *= mix(1.0, 0.8 + 0.34 * run, vFace * 0.8);
              // (the shade at the foot of a clump: the sand darker just outside its edge)
              sand *= 1.0 - 0.22 * smoothstep(th - 0.13, th, field) * (1.0 - cover);
              // marram: straw and grey-green mixed in drifts, streaked finely close to; low scrub darker and greener
              float dry = smoothstep(0.34, 0.62, fdDF(wp / 8.0 + 70.0));
              vec3 marram = mix(vec3(0.115, 0.15, 0.062), vec3(0.34, 0.3, 0.145), dry);
              marram *= 0.78 + 0.44 * mix(0.5, fdDN(wp * vec2(5.0, 1.6) + 11.0), nearK) + 0.25 * (clump - 0.47) * midK;
              float scrubK = smoothstep(0.56, 0.66, fdDF(wp / 19.0 + 5.0)) * (1.0 - vFace);
              vec3 growth = mix(marram, vec3(0.04, 0.052, 0.027) * (0.8 + 0.6 * clump), scrubK * 0.85);
              #ifdef FD_PGRASS
              // (close to, the photographed grass's own light and dark in the marram and scrub, so they read as blades and
              // not as smooth blots of colour)
              { float gq = dot(texture2D(uClG, wp / 1.3).rgb, vec3(0.3, 0.55, 0.15)) / max(dot(texture2D(uClG, vec2(0.5), 12.0).rgb, vec3(0.3, 0.55, 0.15)), 0.02);
                growth *= mix(1.0, clamp(gq, 0.45, 1.7), nearK * 0.85); }
              #endif
              // (thicker growth is darker inside: the stems shade each other)
              growth *= mix(1.0, 0.8, smoothstep(th + 0.03, th + 0.2, field));
              tinted = mix(sand, growth, cover * 0.96);
              fdDuneH = cover * 0.5 + field * 0.25;
            }
            // (bare soil on the fine hillside, where its slope is steep or runs in a gully: Whitby's brown clay and shale,
            // the rough photograph's stones and hollows in it)
            // (on a steep face the photograph is laid on each of the three planes and blended by the slope's facing, so it
            // isn't smeared down the face in streaks; Whitby's earth, from the mud photograph taken towards its own grey)
            if (vSoil > 0.01) {
              vec3 tw = pow(abs(vWNrm), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
              // (its slow changes of tone on the three planes too: taken from above alone they ran down a steep face as stripes)
              float sn3 = fdDN(vWPos.zy / 3.0) * tw.x + fdDN(vWPos.xz / 3.0) * tw.y + fdDN(vWPos.xy / 3.0) * tw.z;
              float sm3 = fdDN(vWPos.zy / 1.3) * tw.x + fdDN(vWPos.xz / 1.3) * tw.y + fdDN(vWPos.xy / 1.3) * tw.z;
              vec3 soilC = mix(vec3(0.15, 0.115, 0.082), vec3(0.235, 0.185, 0.13), sn3);
              #ifdef FD_MUD
                vec3 sp = texture2D(uMud, vWPos.zy / 2.2).rgb * tw.x + texture2D(uMud, vWPos.xz / 2.2).rgb * tw.y + texture2D(uMud, vWPos.xy / 2.2).rgb * tw.z;
                float sl = dot(sp, vec3(0.3, 0.55, 0.15));
                soilC *= clamp(pow(sl / 0.1, 0.75), 0.45, 1.8); // (the photograph averages 0.1 in linear light)
                soilC = mix(soilC, mix(sp, vec3(sl) * vec3(1.1, 0.98, 0.82), 0.6) * 0.95, 0.35);
              #else
                soilC *= clamp(pow(lum / 0.06, 0.6), 0.5, 1.6);
              #endif
              // (its edge ragged and fairly sharp, the grass breaking off at it as on a slip: blended softly over the 1 m
              // mesh it read from the harbour as brown smudges on a green baize)
              float se = (fdDN(vWPos.zy * 1.1) * tw.x + fdDN(vWPos.xz * 1.1) * tw.y + fdDN(vWPos.xy * 1.1) * tw.z) * 0.65 + (fdDN(vWPos.zy * 3.7) * tw.x + fdDN(vWPos.xz * 3.7) * tw.y + fdDN(vWPos.xy * 3.7) * tw.z) * 0.35;
              tinted = mix(tinted, soilC, smoothstep(0.44, 0.68, vSoil * (0.8 + 0.4 * sm3) + (se - 0.5) * 0.36)); // (two scales of noise: one alone left the 1 m mesh's blocks showing)
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, tinted, vRuf);
          }`)
        // (wet sand shines: a film of water over it)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.56, fdWet);")
        .replace("#include <normal_fragment_maps>", `vec3 fdFlatN = normal;
          #include <normal_fragment_maps>
          #ifdef FD_SAND
          if (vSand > 0.01) { vec3 sn = mix(texture2D(uSandN, vWPos.xz / uSandK.w).xyz, texture2D(uSandWN, vWPos.xz / uSandL.z).xyz, fdWet) * 2.0 - 1.0; float sk = 1.0 - smoothstep(12.0, 45.0, length(vViewPosition)); normal = normalize(mix(normal, normalize(fdFlatN + vec3(sn.x, sn.y, 0.0) * 0.6 * sk), vSand)); }
          #endif
          #ifdef FD_PGRASS
            #define FD_GRASS_N texture2D(uClGN, vWPos.xz / uClK.y).xyz
          #else
            #define FD_GRASS_N texture2D(uTurfN, vRufUv * 4.0).xyz
          #endif
          if (vGrass > 0.01) { vec3 gn = FD_GRASS_N * 2.0 - 1.0; float gk = 1.0 - smoothstep(20.0, 70.0, length(vViewPosition)); normal = normalize(mix(normal, normalize(fdFlatN + vec3(gn.x, gn.y, 0.0) * 0.7 * gk), vGrass)); } // (the deck's relief taken out under grass: it read as a weave)
          #ifdef FD_PGRASS
          if (vRuf > 0.01 && vFace < 0.0) {
            // (the cliff's relief, in the world's own axes: the grass photograph's laid flat (across x, along z), the
            // rock's from whichever side it's laid from most; then into the view. The usual shortcut of adding the map's
            // tilt in screen axes lit the grass as crumpled paper)
            float far = smoothstep(30.0, 140.0, length(vViewPosition));
            vec3 gn = texture2D(uClGN, vWPos.xz / uClK.y).xyz * 2.0 - 1.0;
            vec3 nw = vWNrm + vec3(gn.x, 0.0, -gn.y) * 0.55 * (1.0 - fdRock) * (1.0 - far);
            #ifdef FD_CLIFF
            vec3 rz = texture2D(uClRN, vWPos.yx / uClK.x).xyz * 2.0 - 1.0, rx = texture2D(uClRN, vWPos.yz / uClK.x).xyz * 2.0 - 1.0;
            vec3 rw = vec3(rz.y, rz.x, 0.0) * fdTriW.z + vec3(0.0, rx.x, rx.y) * fdTriW.x; // (turned a quarter, as the colour is)
            nw += rw * 0.9 * fdRock * (1.0 - far * 0.6);
            #else
            vec3 rn = texture2D(uRufN, vRufUv).xyz * 2.0 - 1.0; nw += vec3(rn.x, 0.0, -rn.y) * 0.6 * vSteep * (1.0 - far * 0.6);
            #endif
            normal = normalize(mix(normal, normalize(mat3(viewMatrix) * normalize(nw)), vRuf));
          } else
          #endif
          if (vRuf > 0.01) { vec3 rn = texture2D(uRufN, vRufUv).xyz * 2.0 - 1.0; float nk = vFace >= 0.0 ? 1.0 - smoothstep(10.0, 35.0, length(vViewPosition)) : 1.0; normal = normalize(mix(normal, normalize(normal + vec3(rn.x, rn.y, 0.0) * 0.9), vRuf * nk * (vFace >= 0.0 ? 0.3 : 1.0))); }
          if (vFace >= 0.0 && fdDuneH > 0.0) {
            // the clumps stand up from the sand: the light catches their sunward side (their height's slope across the screen)
            vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
            vec3 grad = sign(det) * (dFdx(fdDuneH) * r1 + dFdy(fdDuneH) * r2);
            normal = normalize(mix(normal, normalize(abs(det) * normal - grad * 0.8), vRuf * (1.0 - smoothstep(90.0, 260.0, length(vViewPosition)))));
          }`); // (the dune's fine relief fades with distance too: lit from 100 m it was the stipple)
    };
    softMat.customProgramCacheKey = () => "fdruf18" + (BP ? "s" : "") + (grOn ? "g" : "") + (clOn ? "c" : "") + (mudOn ? "m" : "");
  }
  const ground = new THREE.Mesh(g, [deckMat, softMat]);
  ground.receiveShadow = true; group.add(ground); ground.userData.kind = "the ground"; targets.push(ground);
  if (gF) { const gm = new THREE.Mesh(gF, softMat); gm.receiveShadow = true; gm.castShadow = true; gm.name = "fdFineGround"; gm.userData.kind = "the ground"; group.add(gm); targets.push(gm); }
  place.deckMat = deckMat; // world.js darkens it in the rain

  const hillAt = (x, z, c) => (hill && (c === 1 || c === 3) ? hill(x, z) : 0);
  const groundAt = (x, z) => { const c = cAt(x, z); if (c === 0) return 0; const f = fineAt(x, z); if (f !== null) return f; return BP && BP.shape !== false && c === 2 ? Math.max(0.05, hGrid(x, z)) : H_OF[c] + hillAt(x, z, c); }; // (on the fine hillside, its own height)
  // ---- streets: tarmac with a pale pavement and kerb either side (from the map's roads) ----
  {
    const T = { p: [], uv: [], i: [] }, Pv = { p: [], uv: [], i: [] };
    const ribbon = (Bk, line, w0, w1, y) => {
      // a strip from w0 to w1 metres out from the centre line, on both sides when w0 > 0 (pavements)
      for (const side of w0 > 0 ? [-1, 1] : [1]) {
        let run = 0;
        for (let k = 0; k < line.length - 1; k++) {
          const [x1, z1] = line[k], [x2, z2] = line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
          // (on the town's slope: in pieces of 5 m at most, so the street lies on the ground rather than cutting through it)
          if (hill && len > 6 && (hill(x1, z1) > 0 || hill(x2, z2) > 0)) { const m = Math.ceil(len / 5), sub = []; for (let q = 0; q <= m; q++) sub.push([x1 + ((x2 - x1) * q) / m, z1 + ((z2 - z1) * q) / m]); line = [...line.slice(0, k), ...sub, ...line.slice(k + 2)]; k--; continue; }
          if (groundAt(x1, z1) === 0 && groundAt(x2, z2) === 0) { run += len; continue; }
          const nx = -(z2 - z1) / len, nz = (x2 - x1) / len, a0 = w0 > 0 ? side * w0 : -w1, a1 = w0 > 0 ? side * w1 : w1;
          const ya = groundAt(x1, z1) + y, yb = groundAt(x2, z2) + y, o = Bk.p.length / 3;
          // ends pushed a little past each node so consecutive pieces overlap at bends instead of leaving a notch
          const ex = ((x2 - x1) / len) * Math.min(0.6, w1 * 0.15), ez = ((z2 - z1) / len) * Math.min(0.6, w1 * 0.15); // (a short overlap: at 1.5 m the pavements' ends stuck out as a saw's teeth along a bending street)
          // (each corner on the ground where it is, not at the centre line's height: across a street on the hillside the
          // ground falls, and the strip's downhill edge stood off the slope as a dark shelf seen from below it)
          const gq = (x, z, yc) => { const g = groundAt(x, z); return g > 0 ? g + y : yc; };
          const P0 = [x1 - ex + nx * a0, z1 - ez + nz * a0], P1 = [x2 + ex + nx * a0, z2 + ez + nz * a0], P2 = [x2 + ex + nx * a1, z2 + ez + nz * a1], P3q = [x1 - ex + nx * a1, z1 - ez + nz * a1];
          Bk.p.push(P0[0], gq(...P0, ya), P0[1], P1[0], gq(...P1, yb), P1[1], P2[0], gq(...P2, yb), P2[1], P3q[0], gq(...P3q, ya), P3q[1]);
          Bk.uv.push(run / 6, 0, (run + len) / 6, 0, (run + len) / 6, (a1 - a0) / 6, run / 6, (a1 - a0) / 6);
          if (side > 0 || w0 === 0) Bk.i.push(o, o + 2, o + 1, o, o + 3, o + 2); else Bk.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
          run += len;
        }
      }
    };
    const Pa = { p: [], uv: [], i: [] }; // paths and pedestrian streets: paving, no kerb
    const Kb = { p: [], uv: [], i: [] }, Gl = { p: [], uv: [], i: [] }; // kerb faces; gullies
    // the kerb's face: a vertical strip from the road's level up to the pavement's, along the pavement's road edge,
    // and a gully (a drain grate against the kerb) every 25 m or so
    const kerb = (line, w) => {
      for (const side of [-1, 1]) {
        let run = 0, nextGully = 12 + ((line[0][0] * 7 + line[0][1] * 3) % 10);
        for (let k = 0; k < line.length - 1; k++) {
          const [x1, z1] = line[k], [x2, z2] = line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
          if (groundAt(x1, z1) === 0 && groundAt(x2, z2) === 0) { run += len; continue; }
          const nx = -(z2 - z1) / len, nz = (x2 - x1) / len, a = side * w, ya = groundAt(x1 + nx * a, z1 + nz * a) || groundAt(x1, z1), yb = groundAt(x2 + nx * a, z2 + nz * a) || groundAt(x2, z2), o = Kb.p.length / 3; // (at the kerb's own line, as the strips' edges are)
          Kb.p.push(x1 + nx * a, ya + 0.03, z1 + nz * a, x2 + nx * a, yb + 0.03, z2 + nz * a, x2 + nx * a, yb + 0.125, z2 + nz * a, x1 + nx * a, ya + 0.125, z1 + nz * a);
          Kb.uv.push(run, 0, run + len, 0, run + len, 0.1, run, 0.1);
          if (side > 0) Kb.i.push(o, o + 1, o + 2, o, o + 2, o + 3); else Kb.i.push(o, o + 2, o + 1, o, o + 3, o + 2);
          // gullies along this piece
          while (nextGully < run + len) { const f = (nextGully - run) / len, gx = x1 + (x2 - x1) * f, gz = z1 + (z2 - z1) * f, gy = groundAt(gx, gz) + 0.045, ax = (x2 - x1) / len, az = (z2 - z1) / len, q = Gl.p.length / 3;
            const cx = gx + nx * (a - side * 0.22), cz = gz + nz * (a - side * 0.22); // (0.5 x 0.35 m, long side along the kerb, against it)
            Gl.p.push(cx - ax * 0.25 - nx * 0.175, gy, cz - az * 0.25 - nz * 0.175, cx + ax * 0.25 - nx * 0.175, gy, cz + az * 0.25 - nz * 0.175, cx + ax * 0.25 + nx * 0.175, gy, cz + az * 0.25 + nz * 0.175, cx - ax * 0.25 + nx * 0.175, gy, cz - az * 0.25 + nz * 0.175);
            Gl.uv.push(0, 0, 1, 0, 1, 1, 0, 1); Gl.i.push(q, q + 2, q + 1, q, q + 3, q + 2); nextGully += 22 + ((gx * 13) % 9); }
          run += len;
        }
      }
    };
    // (a footpath across grass or a bank, not a paved way through the town: worn earth and grit, its edges ragged where the
    // grass grows over them (the uv across it 0 to 1, for the shader); drawn as paving, every path on Whitby's East
    // Cliff read as a strip of brown card laid on the slope)
    const Pg = { p: [], uv: [], i: [] };
    const nearV = (x, z) => { let i = 0, j = 0; while (i < n - 1 && xs[i + 1] <= x) i++; while (j < n - 1 && xs[j + 1] <= z) j++; if (i < n - 1 && x - xs[i] > xs[i + 1] - x) i++; if (j < n - 1 && z - xs[j] > xs[j + 1] - z) j++; return j * n + i; };
    const onSoft = (line) => { let s = 0, m = 0; for (let k = 0; k + 1 < line.length; k++) { const x = (line[k][0] + line[k + 1][0]) / 2, z = (line[k][1] + line[k + 1][1]) / 2, c = cAt(x, z), v = nearV(x, z); m++; if (c === 3 || bank[v] || (c === 1 && town[v])) s++; } return m > 0 && s / m > 0.6; };
    for (const r of place.roads || []) {
      if (r.kind !== "path" || r.line.some(([x, z]) => nearSpot(x, z, 25)) || !onSoft(r.line)) continue;
      const half = r.w / 2 + 0.35, v0 = Pg.uv.length; ribbon(Pg, r.line, 0, half, 0.025);
      for (let q = v0 + 1; q < Pg.uv.length; q += 2) Pg.uv[q] /= (2 * half) / 6;
      r.soft = true;
    }
    for (const r of place.roads || []) { if (r.soft || r.line.some(([x, z]) => nearSpot(x, z, 25))) continue; ribbon(r.kind === "tarmac" ? T : Pa, r.line, 0, r.w / 2, r.kind === "tarmac" ? 0.035 : 0.06); if (r.kind === "tarmac") { ribbon(Pv, r.line, r.w / 2, r.w / 2 + 1.8, 0.11); kerb(r.line, r.w / 2); } }
    // car parks (the map's amenity=parking): a sheet of tarmac on the ground, bays painted on it
    for (const ring of place.parking || []) {
      if (ring.length < 3 || ring.some(([x, z]) => nearSpot(x, z, 25))) continue;
      const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, z))), g2 = new THREE.ShapeGeometry(sh), P3 = g2.attributes.position;
      const o = T.p.length / 3; let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; }
      for (let v = 0; v < P3.count; v++) { const x = P3.getX(v), z = P3.getY(v); T.p.push(x, (groundAt(x, z) || LAND) + 0.03, z); T.uv.push((x - cx) / 6, (z - cz) / 6); }
      const idx = g2.index.array; for (let q = 0; q < idx.length; q += 3) T.i.push(o + idx[q], o + idx[q + 2], o + idx[q + 1]);
      g2.dispose();
    }
    const mk = (Bk, mat) => { if (!Bk.i.length) return; const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(Bk.p, 3)); g2.setAttribute("uv", new THREE.Float32BufferAttribute(Bk.uv, 2)); g2.setIndex(Bk.i); g2.computeVertexNormals(); const m = new THREE.Mesh(g2, mat); m.receiveShadow = true; group.add(m); };
    // asphalt (textures3d.js), one tile 6 m, its tiling broken by a large soft mottle (weather: 9 m scale)
    const asp = asphalt({ seed: 23 }); // (the ribbons and the car park give uv in sixths of a metre already: one tile is 6 m)
    mk(T, weather(new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: asp.roughnessMap, color: 0xcfcfcb, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }), { scale: 9, mottle: 0.38, rough: [0.9, 1.1], wet: place.deckWet }));
    mk(Kb, new THREE.MeshStandardMaterial({ map: cTex.map, color: 0xa8a6a0, roughness: 0.8, side: THREE.DoubleSide }));
    mk(Gl, new THREE.MeshStandardMaterial({ map: grateTex(), roughness: 0.75, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    mk(Pv, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xb8b4ac, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
    mk(Pa, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xaaa69c, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
    {
      // (the footpaths' earth: the mud photograph laid by the world's own axes (not along the path, where its tile ran on
      // in lines), taken half to grey and lightened as trodden grit, paler down the middle where most feet go; the edges
      // cut away by noise, so the grass under shows through them)
      const mud = photoTex("ground_mud_diff");
      const pm = new THREE.MeshStandardMaterial({ map: mud || cTex.map, color: 0xffffff, roughness: 0.95, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
      pm.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPgW; varying float vPgA;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvPgA = uv.y; vPgW = (modelMatrix * vec4(position, 1.0)).xyz;");
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
          varying vec3 vPgW; varying float vPgA;
          float pgH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
          float pgN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pgH(i), pgH(i + vec2(1.0, 0.0)), f.x), mix(pgH(i + vec2(0.0, 1.0)), pgH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
          .replace("#include <map_fragment>", `
          vec3 pgP = texture2D(map, vPgW.xz / 2.4).rgb; float pgL = dot(pgP, vec3(0.3, 0.55, 0.15));
          float pgE = abs(vPgA * 2.0 - 1.0), pgR = 0.62 + 0.3 * pgN(vPgW.xz * 1.1) + 0.12 * pgN(vPgW.xz * 4.3) - 0.06;
          if (pgE > pgR) discard;
          vec3 pgC = mix(pgP, vec3(pgL) * vec3(1.08, 1.0, 0.88), 0.55) * 1.8;
          pgC *= mix(1.12, 0.82, smoothstep(0.1, pgR, pgE)) * (0.9 + 0.2 * pgN(vPgW.xz / 7.0));
          diffuseColor.rgb *= pgC;`);
      };
      pm.customProgramCacheKey = () => "fdpath1";
      mk(Pg, pm);
    }
  }

  // ---- garden walls, fences and hedges (the map's barriers): the texture of a town between its streets ----
  {
    const parts = { wall: [], coping: [], fence: [], post: [], hedge: [] };
    // (the walls in a photographed material: where the place's stone is its own (Whitby's sandstone, local.stone kit
    // "whitby"), its baked ashlar; elsewhere the photographed red brick of the house fronts. The drawn brick, red and
    // even, made the Abbey's ruined footings read as new brick walls)
    const stoneWalls = local?.stone?.kit === "whitby", WT = stoneWalls ? 2.4 : 1.5;
    const wallPh = photoTex(stoneWalls ? "whitby_ashlar_diff" : "brick_red_diff"), wallPhN = wallPh && photoTex(stoneWalls ? "whitby_ashlar_nor" : "brick_red_nor", { srgb: false });
    const okHere = (mx, mz) => !(nearSpot(mx, mz, 25) || !landAt([mx, mz]) || PR.some((bx) => inB([mx, mz], bx)));
    for (const b of (local?.generated === false ? [] : place.barriers || [])) {
      for (let k = 0; k + 1 < b.line.length; k++) {
        const [x1, z1] = b.line[k], [x2, z2] = b.line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; if (!okHere(mx, mz)) continue;
        const y1 = groundAt(x1, z1) || LAND, y2 = groundAt(x2, z2) || LAND, y0 = Math.min(y1, y2), top = Math.max(y1, y2) + b.h, ang = -Math.atan2(z2 - z1, x2 - x1);
        const box = (w, h, d, dy, bucket, uvScale) => { const g2 = new THREE.BoxGeometry(w, h, d); if (uvScale) { const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]); } g2.translate(0, dy + h / 2, 0); g2.rotateY(ang); g2.translate(mx, y0 - 0.02, mz); bucket.push(g2); };
        if (b.kind === "hedge") box(len + 0.05, top - y0, 0.8, 0, parts.hedge);
        else if (b.kind === "fence") { // close-boarded panels between posts (the common garden fence)
          box(len + 0.02, top - y0, 0.035, 0.08, parts.fence, [len / 1.8, (top - y0) / 1.8]);
          for (let q = 0; q <= len; q += 1.8) { const f = q / len, px = x1 + (x2 - x1) * f, pz = z1 + (z2 - z1) * f; const g2 = new THREE.BoxGeometry(0.1, top - y0 + 0.08, 0.1); g2.translate(0, (top - y0 + 0.08) / 2, 0); g2.translate(px, y0 - 0.02, pz); parts.post.push(g2); }
        } else { // a brick wall with a coping on top
          box(len + 0.05, top - y0 - 0.06, 0.24, 0, parts.wall, wallPh ? [len / WT, (top - y0) / WT] : [len / 0.9, (top - y0) / 0.6]); // (the drawn brick tile is four bricks by eight courses: 0.9 m by 0.6 m; the photographs' tiles are WT)
          box(len + 0.07, 0.07, 0.3, top - y0 - 0.06, parts.coping);
        }
      }
    }
    const brick = bricks(31, [138, 96, 72]), wood = woodTex();
    const mats = {
      wall: wallPh ? new THREE.MeshStandardMaterial({ map: wallPh, normalMap: wallPhN, roughness: 1, color: stoneWalls ? 0xd8cebd : 0xe8e2dc }) : new THREE.MeshStandardMaterial({ map: brick.map, normalMap: brick.normalMap, roughness: 1, color: 0xb8aa9c }),
      coping: new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.9 }),
      fence: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.95, color: 0xb8ab94 }), // (weathered boards: at 0x9a8468 a fence in shade drew as a black slab across the houses behind)
      post: new THREE.MeshStandardMaterial({ color: 0x5f5244, roughness: 0.95 }),
      hedge: weather(new THREE.MeshStandardMaterial({ color: 0x2d4f22, roughness: 1 }), { scale: 0.6, mottle: 0.5 }),
    };
    for (const kind of Object.keys(parts)) {
      if (!parts[kind].length) continue;
      const g2 = mergeGeometries(parts[kind]); parts[kind].forEach((q) => q.dispose()); if (!g2) continue;
      const m = new THREE.Mesh(g2, mats[kind]); m.castShadow = true; m.receiveShadow = true; m.userData.kind = `a ${kind}`; group.add(m);
    }
  }

  // ---- flights of steps (the map's highway=steps): treads where the ground falls along the line, 17 cm a riser ----
  {
    const treads = [];
    for (const st of place.steps || []) {
      const L = st.line; if (L.length < 2) continue;
      const [xa, za] = L[0], [xb, zb] = L[L.length - 1]; if (!landAt([xa, za]) || !landAt([xb, zb]) || nearSpot(xa, za, 25) || nearSpot(xb, zb, 25)) continue;
      let ya = groundAt(xa, za) || LAND, yb = groundAt(xb, zb) || LAND;
      let from = [xa, za, ya], to = [xb, zb, yb]; if (ya > yb) { from = [xb, zb, yb]; to = [xa, za, ya]; }
      const rise = to[2] - from[2]; if (rise < 0.3) continue; // (steps on the flat: the map says so, the ground here doesn't)
      const n = Math.max(2, Math.round(rise / 0.17)), run = Math.hypot(to[0] - from[0], to[1] - from[1]), tread = Math.max(0.26, Math.min(0.45, run / n));
      const ax = (to[0] - from[0]) / run, az = (to[1] - from[1]) / run, ang = -Math.atan2(az, ax);
      for (let i = 0; i < n; i++) {
        const d = (i + 0.5) * (run / n), cx = from[0] + ax * d, cz = from[1] + az * d, yTop = from[2] + (i + 1) * (rise / n);
        const g2 = new THREE.BoxGeometry(tread, 0.17 + 0.02, st.w); g2.translate(0, -0.095, 0); g2.rotateY(ang); g2.translate(cx, yTop, cz); treads.push(g2);
      }
    }
    if (treads.length) { const g2 = mergeGeometries(treads); treads.forEach((q) => q.dispose()); const m = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xb4b0a8, roughness: 0.9 })); m.castShadow = m.receiveShadow = true; m.userData.kind = "steps"; group.add(m); }
  }

  // ---- harbour walls: steel sheet piling under a concrete cap, along the real water's edge ----
  const sp = sheetPiling({ water: (0 - WALL_BOTTOM) / (LAND - WALL_BOTTOM) });
  const wp = [], wuv = [], wi = [], wcol = [], cp = [], cuv = [], ci = [], ccol = [], cwp = [], cwi = [], capRuns = [];
  // the wall's rows: [height, tint]. Weed and wet steel from below the water up to the tide line, dry above
  const WEED = [0.42, 0.44, 0.3], WET = [0.6, 0.6, 0.52], DRY = [1, 1, 1];
  const WALL_ROWS = [[WALL_BOTTOM, WEED], [-0.05, WEED], [0.55, WET], [Math.min(LAND - 0.3, 1.15), [0.86, 0.86, 0.82]], [LAND, DRY]].filter(([y], i, a) => i === 0 || y > a[i - 1][0] + 0.05);
  let run = 0;
  for (const e of walls) {
    let [x1, z1, x2, z2, nx, nz] = e;
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue;
    // face the water: (b - a) turned left is the face's normal; swap the ends if that points at the land
    if ((-(z2 - z1)) * nx + (x2 - x1) * nz < 0) { [x1, z1, x2, z2] = [x2, z2, x1, z1]; }
    const o = wp.length / 3, u0 = run / 2.4, u1 = (run + len) / 2.4; run += len;
    // (behind the rock armour the sea wall is pale concrete, not steel piling: the white wall in the pier-head photograph;
    // and wherever a mark's photographs show concrete walls, localDetail.js concrete: Lowestoft's South Pier)
    const conc = local?.concrete?.((x1 + x2) / 2, (z1 + z2) / 2) || null;
    if ((local?.rocks && local.rocks((x1 + x2) / 2, (z1 + z2) / 2)) || conc) {
      const c0 = cp.length / 3, T = 2.4, U0 = run / T - len / T, U1 = run / T, vb = (LAND - WALL_BOTTOM) / T;
      cp.push(x1, WALL_BOTTOM, z1, x2, WALL_BOTTOM, z2, x2, LAND + 0.03, z2, x1, LAND + 0.03, z1);
      cuv.push(U0, 0, U1, 0, U1, vb, U0, vb); ccol.push(0.62, 0.62, 0.6, 0.62, 0.62, 0.6, 1.02, 1.02, 1, 1.02, 1.02, 1);
      ci.push(c0, c0 + 1, c0 + 2, c0, c0 + 2, c0 + 3);
      // and a low white parapet along its top (or the mark's own: a solid wall of plain concrete, its height, thickness
      // and tint, its inner face and its top too)
      const pc = cp.length / 3, PH = conc?.h ?? 0.9, th = conc?.t ?? 0.3, px = nx * 0.1, pz = nz * 0.1, ix = -nx * (th - 0.1), iz = -nz * (th - 0.1), tn = conc?.tint ?? 1.08;
      cp.push(x1 + px, LAND, z1 + pz, x2 + px, LAND, z2 + pz, x2 + px, LAND + PH, z2 + pz, x1 + px, LAND + PH, z1 + pz, x1 + ix, LAND + PH, z1 + iz, x2 + ix, LAND + PH, z2 + iz);
      cuv.push(U0, 0.4, U1, 0.4, U1, 0.4 + PH / T, U0, 0.4 + PH / T, U0, 0.8, U1, 0.8); ccol.push(tn - 0.03, tn - 0.03, tn - 0.05, tn - 0.03, tn - 0.03, tn - 0.05, tn + 0.04, tn + 0.04, tn + 0.02, tn + 0.04, tn + 0.04, tn + 0.02, tn, tn, tn - 0.02, tn, tn, tn - 0.02);
      ci.push(pc, pc + 1, pc + 2, pc, pc + 2, pc + 3, pc + 3, pc + 2, pc + 5, pc + 3, pc + 5, pc + 4);
      if (conc) { const q = cp.length / 3; cp.push(x2 + ix, LAND, z2 + iz, x1 + ix, LAND, z1 + iz, x1 + ix, LAND + PH, z1 + iz, x2 + ix, LAND + PH, z2 + iz); cuv.push(U1, 0.4, U0, 0.4, U0, 0.4 + PH / T, U1, 0.4 + PH / T); for (let r = 0; r < 4; r++) ccol.push(tn - 0.1, tn - 0.1, tn - 0.12); ci.push(q, q + 1, q + 2, q, q + 2, q + 3); }
      continue;
    }
    // in rows up the wall, so the tide line shows: dark weed and wet piling up to about a metre above the water, then
    // the dry, paler steel. Near the marks on a computer, the piling's pans are shaped, not only drawn: each 0.6 m a
    // trapezoid 9 cm deep (out, along, back, along; the drawn pans' own places, so the paint and the rust lie on them),
    // with a corner at every bend, so the sun and the shadows find the corrugations and the wall's end shows them
    // edge on. (A flat sheet with corrugations drawn on read as a painted board from out on the water, seen on
    // Aaron's PC, 17 November.) Further off, and on a phone, it stays flat.
    const ax = (x2 - x1) / len, az = (z2 - z1) / len, run0 = u0 * 2.4;
    const shaped = quality >= 2 && Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) < PAN.within;
    const cols = [[0, panOut(run0)]];
    if (shaped) {
      // (the bends inside this stretch: each twice, once for the face before it and once for the one after, so each
      // face of the pan keeps its own flat light)
      for (let k = Math.ceil(run0 / PAN.pitch); k * PAN.pitch < run0 + len; k++) for (const f of PAN.bends) {
        const t = k * PAN.pitch + f * PAN.pitch - run0; if (t <= 0.001 || t >= len - 0.001) continue; const d = panOut(run0 + t); cols.push([t, d], [t, d]);
      }
      cols.sort((a, b) => a[0] - b[0]);
    }
    cols.push([len, shaped ? panOut(run0 + len) : 0]); if (!shaped) cols[0][1] = 0;
    const nc = cols.length;
    WALL_ROWS.forEach(([y, c]) => { const v = (y - WALL_BOTTOM) / (LAND - WALL_BOTTOM); for (const [t, d] of cols) { wp.push(x1 + ax * t + nx * d, y, z1 + az * t + nz * d); wuv.push((run0 + t) / 2.4, v); wcol.push(...c); } });
    for (let r = 0; r < WALL_ROWS.length - 1; r++) for (let j = 0; j < nc - 1; j++) {
      if (cols[j][0] === cols[j + 1][0]) continue; // (the doubled corner: no face between its two)
      const a = o + r * nc + j, b2 = a + nc; wi.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
    }
    // the cap: a concrete capping beam standing 12 cm proud of the piling, its face 0.85 m deep (Gorleston's is a
    // deep beam over the piling, near a metre, in Geograph 1605191 and 2491438; it was 0.45 m), its top falling a
    // little to the water (so the rain runs off), a worn chamfer along the arris and its underside. uv in metres over
    // 2.4 (the photographed concrete's tile), so nothing stretches; the vertex colours carry the wear: the arris paler
    // where it's knocked and scrubbed, the face darker towards its stained foot
    const ox = nx * 0.12, oz = nz * 0.12, c0 = cp.length / 3, yT = LAND + 0.03, yB = LAND - CAP_DEPTH, ch = 0.03, fall = 0.035, T = 2.4;
    const cx = nx * ch, cz = nz * ch, yO = yT - fall;
    cp.push(x1 + ox, yB, z1 + oz, x2 + ox, yB, z2 + oz, x2 + ox, yO - ch, z2 + oz, x1 + ox, yO - ch, z1 + oz); // front
    cp.push(x1 + ox - cx, yO, z1 + oz - cz, x2 + ox - cx, yO, z2 + oz - cz, x2 - ox, yT, z2 - oz, x1 - ox, yT, z1 - oz); // top
    cp.push(x1, yB, z1, x2, yB, z2, x2 + ox, yB, z2 + oz, x1 + ox, yB, z1 + oz); // underside
    cp.push(x1 + ox, yO - ch, z1 + oz, x2 + ox, yO - ch, z2 + oz, x2 + ox - cx, yO, z2 + oz - cz, x1 + ox - cx, yO, z1 + oz - cz); // chamfer
    const U0 = u0 * 2.4 / T, U1 = u1 * 2.4 / T, fv = (yT - yB) / T, tv = 0.24 / T;
    cuv.push(U0, 0, U1, 0, U1, fv, U0, fv, U0, 0.3, U1, 0.3, U1, 0.3 + tv, U0, 0.3 + tv, U0, 0.6, U1, 0.6, U1, 0.65, U0, 0.65, U0, fv, U1, fv, U1, fv + 0.01, U0, fv + 0.01);
    const wear = (0.96 + noise2(x1 / 3, z1 / 3, 1e6, 21) * 0.1), wear2 = (0.96 + noise2(x2 / 3, z2 / 3, 1e6, 21) * 0.1);
    ccol.push(0.66, 0.66, 0.64, 0.66, 0.66, 0.64, wear2, wear2, wear2, wear, wear, wear); // front: stained foot, clean top
    ccol.push(1.08 * wear, 1.08 * wear, 1.06 * wear, 1.08 * wear2, 1.08 * wear2, 1.06 * wear2, 0.9, 0.9, 0.88, 0.9, 0.9, 0.88); // top: worn pale at the arris
    ccol.push(0.5, 0.5, 0.48, 0.5, 0.5, 0.48, 0.55, 0.55, 0.52, 0.55, 0.55, 0.52); // underside
    ccol.push(1.12, 1.12, 1.1, 1.12, 1.12, 1.1, 1.15, 1.15, 1.12, 1.15, 1.15, 1.12); // the knocked arris
    for (let q = 0; q < 4; q++) ci.push(c0 + q * 4, c0 + q * 4 + 1, c0 + q * 4 + 2, c0 + q * 4, c0 + q * 4 + 2, c0 + q * 4 + 3);
    capRuns.push([x1 + ox, z1 + oz, x2 + ox, z2 + oz, nx, nz, len]);
    if (nearSpot((x1 + x2) / 2, (z1 + z2) / 2)) { const c = cwp.length / 3; cwp.push(x1, WALL_BOTTOM, z1, x2, WALL_BOTTOM, z2, x2, LAND + 0.05, z2, x1, LAND + 0.05, z1); cwi.push(c, c + 1, c + 2, c, c + 2, c + 3); }
  }
  if (wp.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2)); wg.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3)); wg.setIndex(wi); wg.computeVertexNormals();
    const wm = new THREE.Mesh(wg, pilingMaterial(sp, quality)); wm.receiveShadow = true; group.add(wm); wm.userData.kind = "a harbour wall"; targets.push(wm);
    const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute("uv", new THREE.Float32BufferAttribute(cuv, 2)); cg.setAttribute("color", new THREE.Float32BufferAttribute(ccol, 3)); cg.setIndex(ci); cg.computeVertexNormals();
    const capPhoto = photoTex("cap_concrete_diff");
    const capMat = capPhoto ? new THREE.MeshStandardMaterial({ map: capPhoto, normalMap: photoTex("cap_concrete_nor", { srgb: false }), roughnessMap: photoTex("cap_concrete_rough", { srgb: false }), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, color: 0xf4efe6, vertexColors: true, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, roughness: 0.9, color: 0xe6e2da, vertexColors: true, side: THREE.DoubleSide });
    // (rain runs down its face from the top, darker streaks; a little rust from the fittings; the foot dark with spray and weed)
    weather(capMat, { scale: 3, mottle: 0.26, grime: [LAND - CAP_DEPTH, LAND - 0.3, 0.32], streaks: [LAND - 0.03, 0.75, 0.35], rust: [0.08, 0.42, 0.24, 0.12], rough: [0.9, 1.1], wet: place.deckWet });
    const cm = new THREE.Mesh(cg, capMat); cm.receiveShadow = true; cm.castShadow = true; group.add(cm);
  }
  if (cwp.length) solids.push(collider(cwp, cwi));

  // ---- railings along the walls near the anglers: posts every 2 m, a top and a middle rail, a brace every few bays ----
  // galvanised steel: dull, mottled zinc gone grey with weather, darker towards the deck where the spray and the dirt
  // reach, not polished chrome. The fittings (caps, ball joints, base plates, the sleeves where rails join, the bolts)
  // are where the zinc wears through first: rust in their crevices and a run of it down from each joint
  // (or gloss white paint where a mark's photographs show it, localDetail.js railPaint: Whitby's piers)
  const railMat = local?.railPaint
    ? thinTubes(weather(new THREE.MeshStandardMaterial({ color: local.railPaint, metalness: 0.1, roughness: 0.42 }), { scale: 0.7, mottle: 0.1, rust: [0.12, 0.4, 0.25, 0.1], grime: [LAND, LAND + 0.4, 0.15], rough: [0.85, 1.15], wet: place.deckWet }))
    : thinTubes(weather(new THREE.MeshStandardMaterial({ color: 0xaeb2b1, metalness: 0.6, roughness: 0.62 }), { scale: 0.7, mottle: 0.35, bump: 0.6, rust: [0.32, 0.16, 0.065, 0.028], grime: [LAND, LAND + 0.5, 0.26], rough: [0.8, 1.25], wet: place.deckWet })); // (rustier: a North Sea pier's railings are brown along their joints and streaked below them)
  // (the jetties' handrails: thin tubes of dull galvanising)
  const jRailMat = thinTubes(new THREE.MeshStandardMaterial({ color: 0x8a8e8c, metalness: 0.3, roughness: 0.8 })); // (no weathering: on tubes this thin it shaded them past white, a row of glowing bars)
  const jointMat = thinTubes(weather(new THREE.MeshStandardMaterial({ color: 0xa2a6a5, metalness: 0.55, roughness: 0.66 }), { scale: 0.35, mottle: 0.4, bump: 0.8, rust: [0.85, 0.15, 0.06, 0.025], grime: [LAND, LAND + 0.4, 0.25], rough: [0.8, 1.2], wet: place.deckWet }));
  const posts = [], rails = [], timberRuns = [], barRuns = [];
  const raisedRings = (place.piers || []).filter((p) => p.ring && !p.open && p.h > LAND + 1).map((p) => p.ring), raisedPierAt = (q) => raisedRings.some((r) => inside(q, r));
  for (const e of walls) {
    const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.5 || Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > RAIL.within) continue;
    const ix = -nx * RAIL.inset, iz = -nz * RAIL.inset, a = [x1 + ix, z1 + iz], b = [x2 + ix, z2 + iz];
    if (!landAt([(a[0] + b[0]) / 2 - nx * 0.6, (a[1] + b[1]) / 2 - nz * 0.6])) continue;
    if (raisedPierAt([(a[0] + b[0]) / 2 - nx * 0.6, (a[1] + b[1]) / 2 - nz * 0.6])) continue; // (inside a pier built higher than the land: its own railings, below)
    const kind = fenceKind((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, nx, nz);
    if (kind === "none") continue; // (a solid parapet instead: localDetail.js concrete)
    if (kind !== "rail") { (kind === "timber" ? timberRuns : barRuns).push([a, b, LAND]); continue; }
    const nPost = Math.max(1, Math.round(len / RAIL.post));
    for (let q = 0; q < nPost; q++) { const f = q / nPost; posts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, nx, nz]); }
    for (const y of [RAIL.h, RAIL.h * 0.5]) rails.push({ a: [a[0], LAND + y, a[1]], b: [b[0], LAND + y, b[1]], r: y === RAIL.h ? 0.026 : 0.018 });
    for (let q = 0; q + 1 < nPost; q += 3) { const f0 = q / nPost, f1 = (q + 1) / nPost; rails.push({ a: [a[0] + (b[0] - a[0]) * f0, LAND + 0.08, a[1] + (b[1] - a[1]) * f0], b: [a[0] + (b[0] - a[0]) * f1, LAND + RAIL.h * 0.5, a[1] + (b[1] - a[1]) * f1], r: 0.014 }); }
  }
  if (posts.length) {
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 24, 1, true), railMat, posts.length), mx = new THREE.Matrix4();
    posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); pm.castShadow = true; group.add(pm);
    // each post's fittings: a domed cap, a ball joint where the middle rail runs through, and a base plate bolted
    // to the deck
    const fit = (geo, y) => { const m = new THREE.InstancedMesh(geo, railMat, posts.length); posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND + y, z); m.setMatrixAt(q, mx); }); m.castShadow = true; group.add(m); };
    // (all the fittings in one mesh: the cap, the ball joint and the base plate with its four bolts)
    const parts = [
      // (round now: they were five to eight sided, and up close every railing read as a bundle of flat strips)
      new THREE.SphereGeometry(0.04, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, RAIL.h + 0.02, 0),
      new THREE.CylinderGeometry(0.041, 0.041, 0.012, 24, 1, true).translate(0, RAIL.h + 0.016, 0), // (the cap's skirt)
      new THREE.SphereGeometry(0.038, 20, 12).translate(0, RAIL.h * 0.5, 0),
      new THREE.CylinderGeometry(0.075, 0.08, 0.018, 28, 1).translate(0, 0.009, 0),
      new THREE.CylinderGeometry(0.036, 0.036, 0.05, 24, 1, true).translate(0, 0.043, 0), // (the post's welded collar)
      new THREE.TorusGeometry(0.034, 0.004, 6, 24).rotateX(Math.PI / 2).translate(0, 0.018, 0), // (the weld bead round its foot)
      ...[0, 1, 2, 3].map((k) => new THREE.CylinderGeometry(0.011, 0.011, 0.014, 6, 1).translate(Math.cos(k * Math.PI / 2 + 0.785) * 0.055, 0.025, Math.sin(k * Math.PI / 2 + 0.785) * 0.055)), // (hex nuts)
      ...[0, 1, 2, 3].map((k) => new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 8, 1).translate(Math.cos(k * Math.PI / 2 + 0.785) * 0.055, 0.037, Math.sin(k * Math.PI / 2 + 0.785) * 0.055)), // (the bolts' ends)
    ].map((g2) => g2.toNonIndexed());
    for (const g2 of parts) g2.deleteAttribute("uv");
    // (near and far: the fittings above are about 1,400 triangles a post, and a long pier has well over a hundred posts,
    // every one drawn again for the shadows and for the water's mirror. Only the posts within a few metres of your
    // eye get them; the rest get the same shapes in about a tenth of the triangles, with no shadow of their own (the
    // post's shadow covers a 4 cm cap's), and neither set is drawn in the mirror, where they were a pixel or two)
    const far = [
      new THREE.SphereGeometry(0.04, 10, 3, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, RAIL.h + 0.02, 0),
      new THREE.SphereGeometry(0.038, 8, 5).translate(0, RAIL.h * 0.5, 0),
      new THREE.CylinderGeometry(0.075, 0.08, 0.018, 10, 1).translate(0, 0.009, 0),
      new THREE.CylinderGeometry(0.036, 0.036, 0.05, 8, 1, true).translate(0, 0.043, 0),
    ].map((g2) => g2.toNonIndexed());
    for (const g2 of far) g2.deleteAttribute("uv");
    const fm = new THREE.InstancedMesh(mergeGeometries(parts), jointMat, posts.length), fl = new THREE.InstancedMesh(mergeGeometries(far), jointMat, posts.length);
    fm.castShadow = true; fl.castShadow = false; fm.noReflect = fl.noReflect = true; fl.userData.noAO = true; group.add(fm, fl); void fit;
    const NEAR2 = POST_DETAIL_M * POST_DETAIL_M, at = new THREE.Vector3(Infinity, 0, 0), eye = new THREE.Vector3();
    const share = (cam) => {
      eye.setFromMatrixPosition(cam.matrixWorld); if (eye.distanceToSquared(at) < 1) return; at.copy(eye);
      const [h, l] = splitByDistance(posts, eye.x, eye.z, NEAR2);
      h.forEach((q, k) => { mx.makeTranslation(posts[q][0], LAND, posts[q][1]); fm.setMatrixAt(k, mx); });
      l.forEach((q, k) => { mx.makeTranslation(posts[q][0], LAND, posts[q][1]); fl.setMatrixAt(k, mx); });
      fm.count = h.length; fl.count = l.length; fm.instanceMatrix.needsUpdate = fl.instanceMatrix.needsUpdate = true;
      fm.computeBoundingSphere(); fl.computeBoundingSphere();
    };
    fm.count = 0; posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND, z); fl.setMatrixAt(q, mx); });
    // (the posts themselves are always drawn, so they do the sharing out as the view moves: at most once a metre)
    pm.onBeforeRender = (_r, _s, cam) => { if (cam.isPerspectiveCamera && !cam.userData.fdMirror) share(cam); };
  }
  if (rails.length) {
    const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), railMat, rails.length), mx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    rails.forEach(({ a, b, r }, q) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length(); const qt = new THREE.Quaternion().setFromUnitVectors(up, d.normalize()); mx.compose(A.clone().add(Bv).multiplyScalar(0.5), qt, new THREE.Vector3(r, L + 0.06, r)); rm.setMatrixAt(q, mx); });
    rm.castShadow = true; group.add(rm);
    // a sleeve at each end of a rail where it meets the next (the joints, a little rustier)
    const sleeve = new THREE.CylinderGeometry(1.35, 1.35, 1, 24, 1, true), sm = new THREE.InstancedMesh(sleeve, jointMat, rails.length * 2);
    rails.forEach(({ a, b, r }, q) => {
      const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length(), qt = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
      for (const [k, f] of [[0, 0.05 / L], [1, 1 - 0.05 / L]]) { mx.compose(A.clone().addScaledVector(d, f), qt, new THREE.Vector3(r, 0.07, r)); sm.setMatrixAt(q * 2 + k, mx); }
    });
    sm.castShadow = true; group.add(sm);
  }
  // ---- the worn yellow safety line painted along the edge, a little in from the railings, and cast-iron bollards ----
  // (chipped and faded paint, worn through where feet go; the bollards squat and rusty, every dozen metres or so)
  { const runs = []; for (const e of walls) { const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.5 || Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > RAIL.within) continue;
      if (!landAt([(x1 + x2) / 2 - nx * 0.9, (z1 + z2) / 2 - nz * 0.9])) continue;
      if (fenceKind((x1 + x2) / 2 - nx * RAIL.inset, (z1 + z2) / 2 - nz * RAIL.inset, nx, nz) !== "rail") continue;
      runs.push({ x1, z1, x2, z2, nx, nz, len }); }
    if (runs.length && typeof document !== "undefined") {
      const c = document.createElement("canvas"); c.width = 512; c.height = 32; const g = c.getContext("2d");
      g.fillStyle = "rgb(214,178,52)"; g.fillRect(0, 4, 512, 24);
      g.globalCompositeOperation = "destination-out"; // (chips and wear)
      for (let i = 0; i < 260; i++) { g.globalAlpha = 0.25 + Math.random() * 0.75; g.beginPath(); g.ellipse(Math.random() * 512, 4 + Math.random() * 24, 1 + Math.random() * 7, 1 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 0.5; for (let i = 0; i < 6; i++) { g.fillRect(Math.random() * 512, 0, 10 + Math.random() * 40, 32); }
      const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const lineMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false });
      const pos = [], uvs = [], idx = []; const IN = RAIL.inset + 0.42, W = 0.1;
      for (const r of runs) { const dx = (r.x2 - r.x1) / r.len, dz = (r.z2 - r.z1) / r.len, b = pos.length / 3;
        for (const [f, side] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const off = IN + side * W; pos.push(r.x1 + dx * r.len * f - r.nx * off, LAND + 0.004, r.z1 + dz * r.len * f - r.nz * off); uvs.push(f * r.len / 1.6, side); }
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); lg.setIndex(idx); lg.computeVertexNormals();
      const lm = new THREE.Mesh(lg, lineMat); lm.receiveShadow = true; lm.material.side = THREE.DoubleSide; group.add(lm);
      // bollards: a squat cast-iron post with a flared head on a base plate, rust through the black paint
      const prof = [[0, 0], [0.13, 0], [0.13, 0.03], [0.1, 0.04], [0.085, 0.07], [0.08, 0.26], [0.1, 0.3], [0.11, 0.34], [0.07, 0.37], [0, 0.375]].map(([x, y]) => new THREE.Vector2(x, y));
      const bGeo = new THREE.LatheGeometry(prof, 24);
      const bMat = weather(new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.5, roughness: 0.72 }), { scale: 0.25, mottle: 0.5, bump: 0.9, rust: [0.9, 0.2, 0.08, 0.03], grime: [LAND, LAND + 0.2, 0.3], rough: [0.8, 1.2], wet: place.deckWet });
      const spots = []; for (const r of runs) { const n = Math.floor(r.len / 12); for (let q = 0; q < n; q++) { const f = (q + 0.5) / n, dx = (r.x2 - r.x1), dz = (r.z2 - r.z1); spots.push([r.x1 + dx * f - r.nx * (RAIL.inset + 0.3), r.z1 + dz * f - r.nz * (RAIL.inset + 0.3)]); } }
      if (spots.length) { const bm = new THREE.InstancedMesh(bGeo, bMat, spots.length), mx = new THREE.Matrix4(); spots.forEach(([x, z], q) => { mx.makeTranslation(x, LAND, z); bm.setMatrixAt(q, mx); }); bm.castShadow = true; bm.receiveShadow = true; group.add(bm); place.bollards = spots.map(([x, z]) => [x, z]); }
    } }
  place.railings = posts.length;

  // ---- on the pier: lamp posts, lifebuoys and benches along the edge (never on a fishing spot) ----
  const glowLamp = new THREE.MeshStandardMaterial({ color: 0xf4efe0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  const mPost = new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.5, metalness: 0.5 });
  const mBuoy = new THREE.MeshStandardMaterial({ color: 0xf06a1a, roughness: 0.6 }), mBox = new THREE.MeshStandardMaterial({ color: 0xb8312b, roughness: 0.55 });
  const mWood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
  // the simple shapes stand in until the Blender furniture (pierprops.glb) has loaded, then go
  const stand = new THREE.Group(); group.add(stand);
  const addAt = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; stand.add(m); return m; };
  const props = { lamp: [], station: [], bollard: [], bench: [] }; // where each goes: [x, y, z, turn]
  // the lamps' lanterns: lit after dark with the rest (environment.js drives buildingGlow)
  const glowGlass = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, emissive: new THREE.Color().setRGB(2.4, 1.75, 0.95), emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.85 });
  let acc = 0; const columns = [], grates = [], rings = [], ladders = [];
  // (each thing is placed where the walk along the walls passes a mark every so many metres. The walk goes a metre at
  // a time along each wall from its start, so at a corner the next wall's first metre goes back over part of the last
  // metre of the one before, and a mark there is passed twice: two of whatever it was, a few centimetres to a metre
  // apart either side of the corner. Two lamp posts stood 11 cm apart at the pier head's bend and two more 27 cm
  // apart, double lanterns lighting each other's poles; two mooring rings and two bollards were doubled the same way.
  // A second try is still made, as the first may have found no room)
  const apart = (list, q, iz = 1) => farFromAll(list, q[0], q[1], iz);
  // (and clear of the buildings, r metres being the piece's own reach from where it stands: a bench stood under the
  // Gorleston lighthouse's spiral stair. A building modelled from photographs keeps more room round its outline, for
  // what stands out from it: the stair, the balcony's slab, a mast)
  const bldgBoxes = (place.buildings || []).map((b) => ({ ...bb(b.ring), pad: local?.landmarks?.[b.id] ? 2.4 : 0.6 }));
  const clearOfBuildings = (q, r) => bldgBoxes.every((b) => q[0] < b.x0 - b.pad - r || q[0] > b.x1 + b.pad + r || q[1] < b.z0 - b.pad - r || q[1] > b.z1 + b.pad + r);
  // (and standing on the deck that's there: inside a pier, quay or breakwater's outline that's its own deck (osmPlace's
  // p.h), raised over the land's. Each piece stood at the land's height wherever it was, so at Whitby the lifebuoy
  // stations stood a metre and more down inside the raised piers, only their name boards showing above the deck. Now
  // each stands on the deck under it; where the piece would reach over the step between two levels, nothing)
  const deckRings = (place.piers || []).filter((p) => p.ring).map((p) => ({ ...bb(p.ring), h: p.h }));
  const deckAt = (q) => deckRings.reduce((y, b) => (inB(q, b) ? Math.max(y, b.h) : y), LAND);
  const standY = (q, r) => { const y = deckAt(q); for (const [a, b] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(deckAt([q[0] + a, q[1] + b]) - y) > 0.05) return null; return y; };
  for (const e of walls) {
    const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
    if (Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > 200) { acc += len; continue; }
    for (let t = 0; t < len; t += 1) {
      const d = acc + t, f = t / len, ex = x1 + (x2 - x1) * f, ez = z1 + (z2 - z1) * f, ry = Math.atan2(nx, nz);
      const inAt = (m) => [ex - nx * m, ez - nz * m];
      const clearOfSpots = (q) => spots.every((sp) => Math.hypot(q[0] - sp.at[0], q[1] - sp.at[2]) > 4);
      if (Math.floor(d / 28) !== Math.floor((d - 1) / 28)) {
        const q = inAt(0.75); if (landAt(q) && landAt(inAt(2)) && clearOfSpots(q) && local?.lamps === "column" && apart(columns, q)) {
          columns.push([q[0], q[1], ry, nx, nz]); { const L = lanternAt(); perches.push([q[0] - nx * L.z, LAND + L.top, q[1] - nz * L.z]); } // (a gull's place: on the lantern)
        } else if (landAt(q) && landAt(inAt(2)) && clearOfSpots(q) && local?.lamps !== "column" && !(local?.pierLamps === false && deckAt(q) > LAND + 1) /* (none on a raised pier whose own lamps the mark models: localDetail.js) */ && apart(props.lamp, q, 2) && clearOfBuildings(q, 0.45) && standY(q, 0.3) != null) {
          const Y = standY(q, 0.3);
          addAt(new THREE.CylinderGeometry(0.06, 0.09, 5, 8), mPost, q[0], Y + 2.5, q[1]);
          const arm = addAt(new THREE.BoxGeometry(0.06, 0.06, 0.8), mPost, q[0] - nx * 0.35, Y + 4.95, q[1] - nz * 0.35, ry);
          addAt(new THREE.BoxGeometry(0.34, 0.22, 0.5), glowLamp, q[0] - nx * 0.7, Y + 4.85, q[1] - nz * 0.7, ry); void arm;
          props.lamp.push([q[0], Y, q[1], ry]);
          perches.push([q[0], Y + 3.9, q[1]]); // somewhere for a gull to sit (the lamp's top)
        }
      }
      if (Math.floor((d + 14) / 55) !== Math.floor((d + 13) / 55)) {
        const q = inAt(0.6); if (landAt(q) && clearOfSpots(q) && apart(props.station, q, 2) && clearOfBuildings(q, 0.5) && standY(q, 0.5) != null) {
          const Y = standY(q, 0.5);
          addAt(new THREE.BoxGeometry(0.62, 0.95, 0.22), mBox, q[0], Y + 0.9, q[1], ry);
          const buoy = addAt(new THREE.TorusGeometry(0.27, 0.07, 8, 18), mBuoy, q[0] + nx * 0.13, Y + 0.95, q[1] + nz * 0.13, ry); void buoy;
          addAt(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mPost, q[0], Y + 0.25, q[1]);
          props.station.push([q[0], Y, q[1], Math.atan2(-nx, -nz)]); // facing the deck
        }
      }
      // the small things a working wall has: a drain grate in the deck now and then, mooring rings on the cap's face,
      // and a steel ladder down the wall to the water every 70 m or so (all kept clear of the fishing spots)
      if (Math.floor((d + 3) / 23) !== Math.floor((d + 2) / 23)) { const q = inAt(1.15); if (landAt(q) && landAt(inAt(2)) && clearOfSpots(q) && apart(grates, q)) grates.push([q[0], q[1], ry]); }
      if (Math.floor((d + 9) / 17) !== Math.floor((d + 8) / 17) && clearOfSpots(inAt(0.5)) && apart(rings, [ex, ez])) rings.push([ex + nx * 0.135, ez + nz * 0.135, ry]);
      if (Math.floor((d + 31) / 71) !== Math.floor((d + 30) / 71) && clearOfSpots(inAt(0.5)) && apart(ladders, [ex, ez])) ladders.push([ex + nx * 0.19, ez + nz * 0.19, ry]);
      // mooring bollards just inside the railing, every 30 m or so
      if (Math.floor((d + 7) / 30) !== Math.floor((d + 6) / 30)) {
        const q = inAt(0.55); if (landAt(q) && clearOfSpots(q) && apart(props.bollard, q, 2) && clearOfBuildings(q, 0.25) && standY(q, 0.25) != null) props.bollard.push([q[0], standY(q, 0.25), q[1], ry]);
      }
      if (Math.floor((d + 20) / 40) !== Math.floor((d + 19) / 40)) {
        const q = inAt(2.6); if (landAt(q) && landAt(inAt(3.4)) && clearOfSpots(q) && apart(props.bench, q, 2) && clearOfBuildings(q, 1.0) && standY(q, 1.0) != null) {
          const ax = -nz, az = nx, Y = standY(q, 1.0); // along the edge
          for (const [h, back, th] of [[0.45, 0, 0.42], [0.8, -0.2, 0.08]]) addAt(new THREE.BoxGeometry(1.8, th === 0.42 ? 0.06 : 0.36, th === 0.42 ? 0.42 : 0.05), mWood, q[0] - nx * back, Y + h, q[1] - nz * back, ry);
          for (const s2 of [-0.8, 0.8]) addAt(new THREE.BoxGeometry(0.06, 0.45, 0.42), mPost, q[0] + ax * s2, Y + 0.22, q[1] + az * s2, ry);
          props.bench.push([q[0], Y, q[1], ry]); // facing the water
        }
      }
    }
    acc += len;
  }
  // plain lighting columns (where photographs show them): a modern LED street light, a tapered galvanised pole rising
  // into a swan-neck bracket over the deck with a slim lantern on it, lit only at its lens (lamps3d.js). It was a plain
  // pole with a glowing grey brick on top
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: new THREE.Color().setRGB(3.2, 2.55, 1.7), emissiveIntensity: 0, roughness: 0.2, side: THREE.DoubleSide }); // (LED white, a little warm; bright enough to bloom)
  const pools = [], heads = []; // (heads: each column's lens, where its light comes from: environment.js)
  if (columns.length) {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), CH = COLUMN.h;
    const { pole, lens } = columnGeometry(), L = lanternAt();
    // galvanised, weathered dull grey, darker and rust-spotted towards its foot, runs down from the head; lit little
    // by its own lantern (lamps3d.js shadeFromOwnLantern)
    const colMat = shadeFromOwnLantern(weather(new THREE.MeshStandardMaterial({ color: 0x969b9c, roughness: 0.6, metalness: 0.45 }), { scale: 0.9, mottle: 0.3, bump: 0.5, rust: [0.22, 0.16, 0.065, 0.028], grime: [LAND, LAND + 0.9, 0.3], streaks: [LAND + CH, 4, 0.12], rough: [0.8, 1.2], wet: place.deckWet }));
    const pm = new THREE.InstancedMesh(pole, colMat, columns.length), lm = new THREE.InstancedMesh(lens, lensMat, columns.length);
    columns.forEach(([x, z, ry, nx, nz], k) => {
      mx.compose(v.set(x, LAND, z), q.setFromAxisAngle(up, ry + Math.PI), one); pm.setMatrixAt(k, mx); lm.setMatrixAt(k, mx); // (the door and the bracket towards the deck)
      pools.push([x - nx * L.z, LAND, z - nz * L.z, 3.6]); heads.push([x - nx * (L.z + 0.35), LAND + L.y - COLUMN.lantern[1] / 2, z - nz * (L.z + 0.35)]); // (the light a little beyond the lens: right under it, 65 cm from the pole, it lit the pole's top as bright as the lens; a lantern's housing keeps its light off its own pole)
    });
    pm.castShadow = true; lm.castShadow = false;
    for (const m of [pm, lm]) { m.computeBoundingSphere(); group.add(m); }
  }
  // and the pools of lamplight on the deck, under every lamp (the modelled pier lamps' too), lit with them after dark
  for (const [x, y, z] of props.lamp) pools.push([x, y, z, 2.6]);
  const pool = lampPools(pools); if (pool.mesh) group.add(pool.mesh);
  place.buildingGlow = [glowLamp, glowGlass, lensMat, pool.material];
  if (heads.length) place.lampHeads = heads;
  if (Object.values(props).some((l) => l.length)) placeProps(group, stand, props, glowGlass, place.deckWet);
  // (where a stain may lie: wholly on the land or a deck, all of it at one level; its height, or null)
  const stainDeck = (q, r) => { for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (!landAt([q[0] + a, q[1] + b])) return null; return standY(q, r); };
  wallDetails(group, { posts, grates, rings, ladders, spots, props, capRuns, wet: place.deckWet, railH: RAIL.h, deckAt: stainDeck });

  // ---- buildings ----

  const aoRings = []; // (every building's footprint, for the contact shade on the deck)
  const backs = (typeof window !== "undefined" && window.__fdNoBackdrop ? null : local?.backdrop) || null /* (__fdNoBackdrop: a measuring switch, for comparing the scene with and without it) */, mid = (b) => { let x = 0, z = 0; for (const [px, pz] of b.ring) { x += px; z += pz; } return [x / b.ring.length, z / b.ring.length]; };
  const behindBackdrop = (b) => { if (!backs) return false; const [x, z] = mid(b); return backdropCovers(backs, x, z); };
  // a mark's own landmark buildings, built from photographs (localDetail.js), in place of the generic style
  // ---- an open pier's deck: its heights first, for what stands on it (its ramps: localDetail.js) ----
  const openPiers = (place.piers || []).filter((p) => p.ring && p.open);
  for (const p of openPiers) {
    const y = (v) => (v === "land" ? LAND : v === "deck" ? p.h : v === "under" ? GROUND.water - 0.6 : v);
    p.ramps = (local?.pier?.ramps || []).map((r) => ({ a: r.a, b: r.b, ya: y(r.ya), yb: y(r.yb) })); p.deckAt = deckHeight(p.h, p.ramps);
  }
  const openDeckAt = (q) => { for (const p of openPiers) if (inside(q, p.ring)) return p.deckAt(q[0], q[1]); return null; };
  const marks = Object.fromEntries(Object.entries(local?.landmarks || {}).filter(([, k]) => LANDMARK_BUILDERS[k])), beacons = [];
  for (const b of (place.buildings || []).filter((b) => marks[b.id] && !behindBackdrop(b))) { // (not one a photograph of the place already shows)
    const od = openDeckAt(mid(b)); // (standing on an open pier's deck: on the deck, not the sea or the beach under it)
    const lm = LANDMARK_BUILDERS[marks[b.id]](group, b.ring, od != null ? od : Math.min(...b.ring.map(([x, z]) => groundAt(x, z) || LAND)));
    for (const m of lm.meshes) { m.userData.kind = "a building"; targets.push(m); }
    place.buildingGlow = [...(place.buildingGlow || []), ...lm.glow];
    if (lm.flash) beacons.push(lm.flash);
    const c = lm.collider, cbp = [], cbi = []; aoRings.push(c.ring);
    for (let k = 0; k < c.ring.length; k++) { const [x1, z1] = c.ring[k], [x2, z2] = c.ring[(k + 1) % c.ring.length], o = cbp.length / 3; cbp.push(x1, c.base, z1, x2, c.base, z2, x2, c.top, z2, x1, c.top, z1); cbi.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    solids.push(collider(cbp, cbi));
  }
  // (and what a mark's photographs show that the map has no outline for: a pier head's light tower, localDetail.js extras)
  const bridges = []; // (the footbridges among them, walked over like a jetty: below)
  for (const ex of local?.extras || []) {
    if (!LANDMARK_BUILDERS[ex.kind]) continue;
    // (its outline: a square round its point, or its own outline where the photographs show its plan, as the Abbey's)
    const r = ex.r || 1.5, ring = ex.ring || [[ex.at[0] - r, ex.at[1] - r], [ex.at[0] + r, ex.at[1] - r], [ex.at[0] + r, ex.at[1] + r], [ex.at[0] - r, ex.at[1] + r]];
    // (on an open deck, on a solid pier's deck (not the ground under it: the pier stands higher), or on the ground)
    const od = openDeckAt(ex.at), onPier = (place.piers || []).find((p) => p.ring && !p.open && inside(ex.at, p.ring));
    const base = ex.base ?? (od != null ? od : onPier ? onPier.h : groundAt(ex.at[0], ex.at[1]) || LAND);
    const lm = LANDMARK_BUILDERS[ex.kind](group, ring, base, ex);
    if (ex.walk && ex.a && ex.b) { const d = Math.hypot(ex.b[0] - ex.a[0], ex.b[1] - ex.a[1]), u = [(ex.b[0] - ex.a[0]) / d, (ex.b[1] - ex.a[1]) / d]; bridges.push({ a: [ex.a[0] - u[0] * 0.6, ex.a[1] - u[1] * 0.6], b: [ex.b[0] + u[0] * 0.6, ex.b[1] + u[1] * 0.6], w: ex.w || 2.4, y: base }); }
    for (const m of lm.meshes) { m.userData.kind = "a building"; targets.push(m); }
    place.buildingGlow = [...(place.buildingGlow || []), ...lm.glow];
    if (lm.flash) beacons.push(lm.flash);
    const c = lm.collider, cbp = [], cbi = []; aoRings.push(c.ring);
    for (let k = 0; k < c.ring.length; k++) { const [x1, z1] = c.ring[k], [x2, z2] = c.ring[(k + 1) % c.ring.length], o = cbp.length / 3; cbp.push(x1, c.base, z1, x2, c.base, z2, x2, c.top, z2, x1, c.top, z1); cbi.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    solids.push(collider(cbp, cbi));
  }
  if (beacons.length) place.beacons = beacons;
  setTownStyle(local?.town || null);
  // (a far shore shown by a photograph of it (backdrop3d.js): the map's buildings behind that sheet aren't built too)
  if (backs) { const bd = buildBackdrops(group, backs); place.backdropUpdate = bd.update; place.backdropCredit = backs.map((d) => d.credit).filter(Boolean); }
  const asBuilt = (b) => { if (local?.sheds && !b.use) { const [x, z] = mid(b); if (local.sheds(x, z)) return { ...b, use: "portshed" }; } return b; };
  // (generated: false in localDetail.js: this place has none of the map's buildings drawn in a generic style at all.
  // What stands there is shown by photographs of it, or not shown)
  const res = buildBuildings(group, (local?.generated === false ? [] : (place.buildings || []).filter((b) => !marks[b.id] && !behindBackdrop(b))).map(asBuilt), {
    groundAt: (x, z) => groundAt(x, z) || LAND,
    // nothing on a fishing spot, the deck round it or in front of it
    avoid: (x, z) => spots.some((s) => Math.hypot(x - s.at[0], z - s.at[2]) < 6),
    near: (x, z) => nearSpot(x, z, NEAR_SOLID + 30),
    modules: quality >= 2 || (typeof window !== "undefined" && !!window.__fdFine), // (the openings in depth near the camera: windows3d.js)
  });
  setTownStyle(null);
  place.buildingGlow = [...(place.buildingGlow || []), ...res.glow]; for (const m of res.meshes) m.userData.kind = "a building"; targets.push(...res.meshes);
  { const caps = buildChimneyCaps(group, res.caps, res.brickMat), wins = buildWindowModules(group, res.mods); place.capsUpdate = (t, cam) => { caps.update(t, cam); wins.update(t, cam); }; if (wins.glass) place.buildingGlow = [...(place.buildingGlow || []), wins.glass]; } // (the chimneys' modelled tops, chimneys3d.js; the openings in depth, windows3d.js)
  for (const c of res.colliders) {
    aoRings.push(c.ring);
    const cbp = [], cbi = [];
    for (let k = 0; k < c.ring.length; k++) { const [x1, z1] = c.ring[k], [x2, z2] = c.ring[(k + 1) % c.ring.length], o = cbp.length / 3; cbp.push(x1, c.base, z1, x2, c.base, z2, x2, c.top, z2, x1, c.top, z1); cbi.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    solids.push(collider(cbp, cbi));
  }

  const jetties = [...bridges], fishEdges = []; // for walking about and fishing from anywhere (below)
  // ---- piers drawn as a line (jetties on piles), outlines (breakwaters), groynes ----
  const pileMat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.95 });
  const deckSlab = new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, roughness: 0.95, color: 0xdedad2 });
  // (all the jetties' decks, piles and rails as three instanced meshes: one draw call each, not one per piece)
  const jDeck = [], jPile = [], jRail = [];
  for (const p of place.piers) {
    if (p.open && p.ring) {
      // ---- an open pier on iron legs (openPier.js): not the solid block a pier's outline is drawn as otherwise ----
      const onDeck = (place.buildings || []).filter((b) => marks[b.id] && openDeckAt(mid(b)) != null).map((b) => b.ring);
      const nearRing = (r, x, z) => { if (inside([x, z], r)) return 0; let d = Infinity; for (let k = 0; k < r.length; k++) d = Math.min(d, segDist([x, z], r[k], r[(k + 1) % r.length])); return d; };
      const op = buildOpenPier(group, p.ring, p.h, {
        ramps: p.ramps, slip: local?.pier?.slip || null, keepOff: (x, z) => onDeck.some((r) => nearRing(r, x, z) < 0.9),
        landAt: (x, z) => landAt([x, z]), landY: LAND, bedAt: () => GROUND.water - 0.2, waterY: -0.25, spots, quality, wet: place.deckWet,
        ...(p.style === "trestle" ? { style: "trestle", benches: false, lamps: false } : {}),
      });
      for (const m of op.meshes) { if (!m.userData.kind) m.userData.kind = "the pier"; }
      targets.push(...op.solids); solids.push(...op.solids); fishEdges.push(...op.fishEdges);
      place.buildingGlow = [...(place.buildingGlow || []), ...op.glow];
      for (const q of op.lamps) perches.push(q);
      continue;
    }
    if (p.line) {
      // the deck at the height and width the anglers' spots use (osmPlace: p.h, and half the width less 60 cm from the middle)
      // (only a jetty someone stands on needs that: the others stay lower and narrower, so they don't block the view)
      const standOn = spots.some((sp) => p.line.some((q, k) => k < p.line.length - 1 && segDist([sp.at[0], sp.at[2]], q, p.line[k + 1]) < p.width / 2 + 0.5));
      const deckY = p.kind === "groyne" ? 1.2 : standOn ? p.h : Math.min(p.h, LAND + 0.6), w = p.kind === "groyne" ? 0.5 : standOn ? p.width : Math.min(p.width, 6);
      for (let k = 0; k < p.line.length - 1; k++) {
        const [x1, z1] = p.line[k], [x2, z2] = p.line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue;
        const ang = Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
        if (p.kind === "groyne") { const m = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, w), M.wood); m.position.set(cx, 0.4, cz); m.rotation.y = -ang; group.add(m); continue; }
        jetties.push({ a: [x1, z1], b: [x2, z2], w, y: deckY });
        for (const side of [-1, 1]) { const ox = Math.sin(ang) * side * (w / 2), oz = -Math.cos(ang) * side * (w / 2); fishEdges.push([x1 + ox, z1 + oz, x2 + ox, z2 + oz, Math.sin(ang) * side, -Math.cos(ang) * side, "jetty", deckY]); }
        jDeck.push({ x: cx, y: deckY - 0.2, z: cz, ang, len: len + 0.05, w });
        if (nearSpot(cx, cz, NEAR_SOLID + len / 2)) { const c = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.4, w)); c.position.set(cx, deckY - 0.2, cz); c.rotation.y = -ang; c.updateMatrixWorld(true); solids.push(c); }
        const sx = Math.sin(ang), sz = -Math.cos(ang);
        for (let t = 0; t <= len; t += 4) for (const side of [-1, 1]) {
          const f = t / len, px = x1 + (x2 - x1) * f + sx * side * (w / 2 - 0.3), pz = z1 + (z2 - z1) * f + sz * side * (w / 2 - 0.3);
          if (landAt([px, pz])) continue;
          jPile.push([px, (deckY + WALL_BOTTOM) / 2 - 0.2, pz, deckY - WALL_BOTTOM]);
        }
        for (const side of [-1, 1]) for (const y of [RAIL.h, RAIL.h * 0.5]) jRail.push([cx + sx * side * (w / 2 - 0.12), deckY + y, cz + sz * side * (w / 2 - 0.12), ang, len]);
      }
    } else if (p.ring && p.ring.length >= 3) {
      const ring = p.ring.slice(); if (THREE.ShapeUtils.isClockWise(ring.map(([x, z]) => new THREE.Vector2(x, z)))) ring.reverse();
      const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: p.h - WALL_BOTTOM, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, WALL_BOTTOM, 0);
      // (its sides: steel sheet piling, or plain concrete where the mark's photographs show it, localDetail.js concrete)
      // (or sandstone blocks, localDetail.js stone: Whitby's piers, their walls battered, leaning back as they rise)
      if (local?.stone) batter(geo, ring, p.h, local.stone.batter ?? 0.14);
      const sideMat = local?.stone ? (stoneSide ||= stoneWall(local.stone, p.h)) : local?.concrete ? (concSide ||= weather(new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xb9b5ad, roughness: 0.95 }), { scale: 0.7, mottle: 0.3, grime: [WALL_BOTTOM, 0.6, 0.45], streaks: [p.h, 2.5, 0.2], rough: [0.9, 1.1] })) : new THREE.MeshStandardMaterial({ map: sp.map, normalMap: sp.normalMap, roughness: 0.9 });
      // (and its top: sandstone flags where the walls are sandstone)
      const m = new THREE.Mesh(geo, [local?.stone ? (stoneTop ||= stoneWall(local.stone.kit ? local.stone : { ...local.stone, tint: local.stone.deckTint ?? 0xc9bfae, tile: 0.25 }, p.h, "deck")) : deckSlab, sideMat]); m.castShadow = m.receiveShadow = true; group.add(m); m.userData.kind = `a ${p.kind}`; targets.push(m);
      // the coping: a course of big squared stones along its edges over the water, a little proud of the wall and of the
      // deck (Whitby's piers: the photographs along them), in the same stone
      if (local?.stone?.coping) {
        const cg = [], C = local.stone.coping;
        for (let k = 0; k < ring.length; k++) {
          const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
          let nx = -(z2 - z1) / len, nz = (x2 - x1) / len; const mid = [(x1 + x2) / 2, (z1 + z2) / 2];
          if (inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], ring)) { nx = -nx; nz = -nz; }
          if (landAt([mid[0] + nx * 1.5, mid[1] + nz * 1.5]) && !inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], ring)) continue;
          const g2 = new THREE.BoxGeometry(len + C.d * 0.9, C.h, C.d); g2.rotateY(-Math.atan2(z2 - z1, x2 - x1));
          g2.translate(mid[0] - nx * (C.d / 2 - C.out), p.h + C.up - C.h / 2, mid[1] - nz * (C.d / 2 - C.out)); cg.push(worldUV(g2));
        }
        if (cg.length) {
          const cm = new THREE.Mesh(mergeGeometries(cg), stoneSide); cg.forEach((q) => q.dispose());
          cm.castShadow = cm.receiveShadow = true; cm.userData.kind = `a ${p.kind}`; group.add(cm); targets.push(cm);
        }
      }
      // a solid concrete parapet along its edges over the water, where the mark's photographs show one (Lowestoft's South
      // Pier: both sides and round its head), its outer face flush with the pier's side
      if (local?.concrete) {
        const pg = [];
        for (let k = 0; k < ring.length; k++) {
          const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
          let nx = -(z2 - z1) / len, nz = (x2 - x1) / len; const mid = [(x1 + x2) / 2, (z1 + z2) / 2];
          if (inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], ring)) { nx = -nx; nz = -nz; }
          if (landAt([mid[0] + nx * 1.5, mid[1] + nz * 1.5]) && !inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], ring)) continue;
          const c = local.concrete(mid[0], mid[1]); if (!c) continue;
          const PH = c.h ?? 1.1, th = c.t ?? 0.45, g2 = new THREE.BoxGeometry(len + 0.06, PH, th);
          g2.rotateY(-Math.atan2(z2 - z1, x2 - x1)); g2.translate(mid[0] - nx * th / 2, p.h + PH / 2, mid[1] - nz * th / 2); pg.push(g2);
        }
        if (pg.length) {
          const pm = new THREE.Mesh(mergeGeometries(pg), concSide); pg.forEach((q) => q.dispose());
          pm.castShadow = pm.receiveShadow = true; pm.userData.kind = "the parapet"; group.add(pm); targets.push(pm); solids.push(pm);
        }
      }
      // railings round its edge where it meets the water, near the anglers
      if (p.kind === "pier" || p.kind === "quay" || (local?.stone && p.kind === "breakwater")) {
        const rp = [], rr = [], own = p.kind === "pier" || p.kind === "quay"; // (a breakwater's edges are fished from as the shore's walls)
        for (let k = 0; k < p.ring.length; k++) {
          const [x1, z1] = p.ring[k], [x2, z2] = p.ring[(k + 1) % p.ring.length], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.5) continue;
          if (Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > RAIL.within) continue;
          let nx = -(z2 - z1) / len, nz = (x2 - x1) / len; const mid = [(x1 + x2) / 2, (z1 + z2) / 2];
          if (inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], p.ring)) { nx = -nx; nz = -nz; } // outward
          if (landAt([mid[0] + nx * 1.5, mid[1] + nz * 1.5]) && !inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], p.ring)) continue; // land, not water, outside
          if (own) fishEdges.push([x1, z1, x2, z2, nx, nz, "pier", p.h]);
          const a2 = [x1 - nx * RAIL.inset, z1 - nz * RAIL.inset], b2 = [x2 - nx * RAIL.inset, z2 - nz * RAIL.inset], np = Math.max(1, Math.round(len / RAIL.post));
          const kind = fenceKind((a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, nx, nz);
          if (kind === "none") continue; // (an open edge: nothing along it, localDetail.js fence)
          if (kind !== "rail") { (kind === "timber" ? timberRuns : barRuns).push([a2, b2, p.h]); continue; }
          for (let q = 0; q < np; q++) rp.push([a2[0] + (b2[0] - a2[0]) * q / np, a2[1] + (b2[1] - a2[1]) * q / np]);
          for (const y of [RAIL.h, RAIL.h * 0.5]) rr.push({ a: [a2[0], p.h + y, a2[1]], b: [b2[0], p.h + y, b2[1]], r: y === RAIL.h ? 0.026 : 0.018 });
        }
        if (rp.length) { const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 8, 1, true), railMat, rp.length) /* (open-topped under the rail, as the pier's own posts: their flat sunlit caps lined up in perspective into bright bars) */, mx = new THREE.Matrix4(); rp.forEach(([x, z], q) => { mx.makeTranslation(x, p.h + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); group.add(pm); }
        if (rr.length) { const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), railMat, rr.length), mx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0); rr.forEach(({ a: A0, b: B0, r }, q) => { const A = new THREE.Vector3(...A0), Bv = new THREE.Vector3(...B0), d = Bv.clone().sub(A), L2 = d.length(); mx.compose(A.clone().add(Bv).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, d.normalize()), new THREE.Vector3(r, L2 + 0.06, r)); rm.setMatrixAt(q, mx); }); group.add(rm); }
      }
      if (ring.some(([x, z]) => nearSpot(x, z, NEAR_SOLID + 60))) solids.push(m);
    }
  }
  buildFences(group, timberRuns, barRuns, dTex, place.deckWet);
  if (jDeck.length) {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), X1 = new THREE.Vector3(1, 0, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 1), deckSlab, jDeck.length);
    jDeck.forEach((d, k) => { mx.compose(v.set(d.x, d.y, d.z), q.setFromAxisAngle(up, -d.ang), sc.set(d.len, 1, d.w)); deck.setMatrixAt(k, mx); });
    deck.castShadow = deck.receiveShadow = true; deck.computeBoundingSphere(); group.add(deck); deck.userData.kind = "a jetty"; targets.push(deck);
    if (jPile.length) {
      const pile = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.2, 1, 7, 1, true), pileMat, jPile.length);
      jPile.forEach(([x, y, z, h], k) => { mx.compose(v.set(x, y, z), q.identity(), sc.set(1, h, 1)); pile.setMatrixAt(k, mx); });
      pile.computeBoundingSphere(); group.add(pile);
    }
    if (jRail.length) {
      const rail = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 20, 1, true), jRailMat, jRail.length), qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      jRail.forEach(([x, y, z, ang, len], k) => { mx.compose(v.set(x, y, z), q.setFromAxisAngle(up, -ang).multiply(qz), sc.set(1, len, 1)); rail.setMatrixAt(k, mx); });
      rail.computeBoundingSphere(); group.add(rail); void X1;
    }
  }
  place.targets = targets;

  // ---- walking about (walker.js) and fishing from where you stand ----
  // You walk on the land, the piers and the jetties people stand on: never into the water, through a railing (kept
  // 45 cm in from a wall's edge) or into a building. Moving between decks of different heights (the promenade and a
  // pier) is taken as a ramp. "Fish here" faces you out over the nearest real water's edge.
  const KEEP = 0.45;
  const drawnB = (place.buildings || []).filter((b) => !spots.some((sp) => b.ring.some(([x, z]) => Math.hypot(x - sp.at[0], z - sp.at[2]) < 6))).map((b) => bb(b.ring));
  const PRh = (place.piers || []).filter((p) => p.ring).map((p) => ({ ...bb(p.ring), h: p.h, deckAt: p.deckAt || null }));
  const jettyAt = (x, z) => jetties.find((j) => segDist([x, z], j.a, j.b) < j.w / 2 - KEEP);
  const allEdges = [...walls.map((e) => [...e.slice(0, 6), "wall", LAND]), ...fishEdges], nearestEdge = segIndex(allEdges);
  const heightAt = (x, z) => { const j = jettyAt(x, z); if (j) return j.y; const pr = PRh.find((b) => inB([x, z], b)); if (pr) return pr.deckAt ? pr.deckAt(x, z) : pr.h; const g = groundAt(x, z); return g || (landAt([x, z]) ? LAND : 0); };
  const walkable = (x, z) => {
    if (local?.walkArea && !local.walkArea(x, z)) return false; // (as far as the mark's photographs hold up: localDetail.js)
    if (openPiers.length && local?.pier?.slip?.(x, z)) return false; // (not down an open pier's lifeboat slipway into the sea)
    if (jettyAt(x, z)) return true;
    const onPier = PRh.some((b) => inB([x, z], b));
    if (!onPier && !landAt([x, z])) return false;
    const e = nearestEdge(x, z); if (e && e.d < KEEP) return false; // the railing
    return !drawnB.some((b) => inB([x, z], b));
  };
  place.ground = {
    heightAt, walkable,
    // the benches, lamps, bollards and lifebuoy stations, as [x, z], so nobody arrives inside one (spawn.js)
    props: Object.values(props).flat().map(([x, , z]) => [x, z]),
    ramp: (x0, z0, x1, z1) => walkable(x1, z1) && Math.abs(heightAt(x1, z1) - heightAt(x0, z0)) < 2.6,
    /** Fishing from here: the water's edge within reach, which way it faces and how far in front it is. */
    fishHere(x, z) {
      const e = nearestEdge(x, z); if (!e || e.d > 1.6) return null;
      const [, , , , nx, nz] = e.s, y = heightAt(x, z);
      if (heightAt(x + nx * 10, z + nz * 10) !== 0 && !jettyAt(x + nx * 10, z + nz * 10)) return null; // not water out there
      if (walkable(x + nx * 12, z + nz * 12) || walkable(x + nx * 20, z + nz * 20)) return null;
      return { at: [x, y, z], face: Math.atan2(nx, -nz), edge: Math.max(0.3, e.d), cast: 26 };
    },
  };
  // ---- the contact shade on the deck: where a building, a bench, a lamp or a post meets the concrete ----
  // (16 November, from "like PS2 graphics": on Medium there was no shade where things meet the ground, so the lookout,
  // the benches and the lamp posts stood on the deck as if pasted on. High's ambient occlusion pass does this every
  // frame; here it is worked out once, as the place is built, into a map 10 cm a pixel over the 140 m round the spots,
  // and the deck's shader reads it: one look-up a pixel)
  if (spots.length) {
    const cx = spots.reduce((a, q) => a + q.at[0], 0) / spots.length, cz = spots.reduce((a, q) => a + q.at[2], 0) / spots.length;
    const discs = [];
    // (a thin post's shade is its base plate's and a little round it: drawn as its own few pixels it all but vanished in
    // the spread)
    for (const [x, , z] of props.lamp) discs.push([x, z, 0.2, 0.9]);
    for (const [x, , z] of props.station) discs.push([x, z, 0.18, 0.8]);
    for (const [x, , z] of props.bollard) discs.push([x, z, 0.26, 0.9]);
    for (const [x, z] of columns) discs.push([x, z, 0.2, 0.9]);
    for (const [x, z] of posts) discs.push([x, z, 0.13, 0.85]);
    const rects = props.bench.map(([x, , z, ry]) => [x, z, ry, 0.85, 0.24, 0.5]);
    const sh = contactShade({ cx, cz, size: 140, mpp: 0.1, rings: aoRings, discs, rects });
    if (sh) { deckShade.tex.value = sh.tex; deckShade.box.value.set(sh.x0, sh.z0, sh.size, sh.size); deckShade.k.value = quality >= 2 ? 0.38 : 0.65; place.deckShade = sh; }
  }
  // ---- trees and scrub on the grass and the cliff's bank (trees3d.js): not on a road, a building or near a spot ----
  {
    const roads = place.roads || [];
    const onRoad = (x, z) => roads.some((r) => { for (let i = 0; i + 1 < r.line.length; i++) if (segDist([x, z], r.line[i], r.line[i + 1]) < r.w / 2 + 2.2) return true; return false; });
    const bankAt = (x, z) => { if (!local?.hill) return 0; const d = Math.abs(local.hill(x - 2, z) - local.hill(x + 2, z)); return d > 0.3 ? Math.min(1, d / 0.8) : 0; };
    const woods = (place.woods || []).map(bb), woodAt = (x, z) => woods.some((b) => inB([x, z], b));
    const backsT = (typeof window !== "undefined" && window.__fdNoBackdrop ? null : local?.backdrop) || null;
    // (nor on an open pier's deck: Whitby's West Pier extension, a timber deck over the sea, had a tree growing out of it
    // beside the footbridge, as its ring isn't among the solid piers')
    const allPiers = (place.piers || []).filter((p) => p.ring).map((p) => bb(p.ring));
    const trees = buildTrees(group, { cls, xs, n, heightAt, avoid: (x, z) => nearSpot(x, z, 20) || !walkable(x, z) || onRoad(x, z) || allPiers.some((b) => inB([x, z], b) || (x > b.x0 - 4 && x < b.x1 + 4 && z > b.z0 - 4 && z < b.z1 + 4 && b.r.some((q, i) => segDist([x, z], q, b.r[(i + 1) % b.r.length]) < 4))) /* (never on a pier, or within 4 m of one: the map's coastline often runs round them, so they count as land) */ || (backsT ? backdropCovers(backsT, x, z, 0) : false), bank: bankAt, bankTrees: local?.bankTrees ?? 1, wood: woodAt, quality, seed: 3 + (place.spots?.length || 0) });
    if (trees) { place.trees = trees.count; place.treesBuilt = trees.built; place.treesUpdate = trees.update; }
    // ---- tufts of grass standing up out of the lawns, verges and banks near the camera (grassTufts.js): where the ground
    // is drawn as grass (aGrass), and on the banks but not where their rock shows; not on a road, a car park, a pier or in
    // a building, nor at your feet where you fish. Their height and colour are the ground's as drawn, read off its grid ----
    const cell = (v) => { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; } return [lo, Math.min(1, Math.max(0, (v - xs[lo]) / Math.max(1e-6, xs[lo + 1] - xs[lo])))]; };
    // (the triangle of the grid's square the point is in, as the ground's triangles are cut (a, c, b) and (b, c, d))
    const onGrid = (arr, stride, off, x, z) => {
      const [i, fx] = cell(x), [j, fz] = cell(z), a = j * n + i, b = a + 1, c = a + n, d = c + 1, A = arr[a * stride + off], B = arr[b * stride + off], C = arr[c * stride + off], D = arr[d * stride + off];
      return fx + fz <= 1 ? A + fx * (B - A) + fz * (C - A) : D + (1 - fx) * (C - D) + (1 - fz) * (B - D);
    };
    const inGrid = (x, z) => x > xs[0] && x < xs[n - 1] && z > xs[0] && z < xs[n - 1];
    const nearestVertex = (x, z) => { const [i, fx] = cell(x), [j, fz] = cell(z); return (fx < 0.5 ? i : i + 1) + (fz < 0.5 ? j : j + 1) * n; };
    const lots = (place.parking || []).filter((r) => r.length >= 3).map(bb);
    const grassOpts = {
      quality, seed: 7 + (place.spots?.length || 0),
      grassAt: (x, z) => {
        if (!inGrid(x, z)) return 0;
        const [i, fx] = cell(x), [j, fz] = cell(z), k = (fx < 0.5 ? i : i + 1) + (fz < 0.5 ? j : j + 1) * n;
        // (the banks: thinning out to none where the rock shows; on the fine hillside, by its own slope and bare soil)
        if (bank[k]) { const fi = fineInfo(x, z); if (fi) return 0.9 * Math.max(0, 1 - fi.soil * 1.4) * (1 - Math.min(1, Math.max(0, (fi.slope - 1.0) / 0.7))); return 0.85 * (1 - Math.min(1, steep[k] * 1.7)); }
        // (a dune: marram where its shader draws it growing thick, thinning on the bare face)
        if (dune[k] > 0.05 && faceA[k] >= 0) return marramAt(x, z, faceA[k]).cover * Math.min(1, dune[k] * 2.5) * (1 - 0.6 * faceA[k]);
        // (not on the worn, muddy patches: the ground's shader draws them, so the tufts keep off them too)
        return onGrid(grs, 1, 0, x, z) * (1 - Math.min(1, mudAt(x, z, town[k]) * 2.2));
      },
      roughAt: (x, z) => { if (!inGrid(x, z)) return 0.5; const [i, fx] = cell(x), [j, fz] = cell(z), k = (fx < 0.5 ? i : i + 1) + (fz < 0.5 ? j : j + 1) * n; return dune[k] > 0.05 && faceA[k] >= 0 && !bank[k] ? 2 : bank[k] ? 1 : town[k] ? 0.6 : 0.15; },
      yAt: (x, z) => { const f = fineAt(x, z); return f !== null ? f : inGrid(x, z) ? onGrid(pos, 3, 1, x, z) : LAND; },
      colourAt: (x, z) => {
        if (!inGrid(x, z)) return null;
        const [i, fx] = cell(x), [j, fz] = cell(z), k = (fx < 0.5 ? i : i + 1) + (fz < 0.5 ? j : j + 1) * n;
        // (on a dune, the marram's own straw and grey-green, as its shader mixes them, not the sand's colour under it)
        if (dune[k] > 0.05 && faceA[k] >= 0 && !bank[k]) { const d = marramAt(x, z, faceA[k]).dry; return [0.115 + (0.34 - 0.115) * d, 0.15 + (0.3 - 0.15) * d, 0.062 + (0.145 - 0.062) * d].map((v) => v * 0.9); }
        const dry = dryAt(x, z);
        return [0, 1, 2].map((ch) => onGrid(col, 3, ch, x, z) * 0.95 * (1 + (+GRASS_DRY.tint[ch] - 1) * dry));
      },
      avoid: (x, z) => nearSpot(x, z, 3) || onRoad(x, z) || lots.some((b) => inB([x, z], b) && inside([x, z], b.r)) || drawnB.some((b) => inB([x, z], b) && inside([x, z], b.r)) || allPiers.some((b) => inB([x, z], b)),
    };
    // (the thick layer of grass blades, grassField.js, and the taller clumps among it, grassTufts.js, from the same
    // lookups)
    const field = buildGrassField(group, grassOpts), tufts = buildGrassTufts(group, { ...grassOpts, sparse: !!field });
    // ---- the ground's clutter from real photoscans (kit3d.js; High and Ultra): along the beaches the tide's wrack, a
    // stray branch of driftwood, stones and pebbles gathered at the back against the walls and the cliff's foot, rocks
    // fallen at the foot of the cliff; on the banks willowherb, docks, grass clumps and ferns, mossy rocks where the soil
    // is bare, nettles where the ground's been disturbed; at the foot of the buildings' walls, docks, nettles, grass and
    // hart's-tongue fern; dandelions and clumps in the rough grass. Each from the place's own ground, never on a road, a
    // pier or a spot ----
    let kit = null;
    if (quality >= 2 || (typeof window !== "undefined" && window.__fdFine)) {
      let hs = (7919 * (3 + (place.spots?.length || 0))) >>> 0; const R = () => { hs ^= hs << 13; hs >>>= 0; hs ^= hs >>> 17; hs ^= hs << 5; hs >>>= 0; return hs / 4294967296; };
      // (plants only above the reach of the tides: never in the water or on the wet foot of a bank)
      const PLANT = /plant|shrub|grass|fern|dandelion/;
      const S = {}; const put = (id, x, z, size, tilt = 0) => { if (grassOpts.avoid(x, z)) return; const y = grassOpts.yAt(x, z); if (PLANT.test(id) && y < 1.4) return; (S[id] ||= []).push([x, y, z, R() * Math.PI * 2, size, tilt]); };
      const nb4 = (k) => [k - 1, k + 1, k - n, k + n];
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const k = j * n + i, cw = xs[i + 1] - xs[i], ch = xs[j + 1] - xs[j]; if (cw > 7 || ch > 7) continue;
        const x0 = xs[i], z0 = xs[j], area = cw * ch;
        if (cls[k] === 2) {
          const atBack = nb4(k).some((q) => cls[q] === 1 || cls[q] === 3 || bank[q]), atSea = nb4(k).some((q) => cls[q] === 0);
          for (let c = 0; c < area * 0.5; c++) {
            const x = x0 + R() * cw, z = z0 + R() * ch, y = grassOpts.yAt(x, z);
            if (y > 0.5 && y < 0.95 && R() < 0.5) put("wrack", x, z, 0.6 + R() * 0.7); // (the strand line: where the last tide left it)
            if (atBack && R() < 0.45) { const fl = R() < 0.55; put(fl ? "rock_09" : "stone_01", x, z, fl ? 0.05 + R() * 0.1 : 0.07 + R() * 0.13, 1); }
            if (atSea && R() < 0.04) put("rock_moss_set_01", x, z, 0.35 + R() * 0.65, 1);
            if (y > 0.5 && R() < 0.0015) put(R() < 0.35 ? "dead_tree_trunk" : "dry_branches_medium_01", x, z, 0.35 + R() * 0.3); // (now and then: at one in 170 Great Yarmouth's wide beach was strewn with sticks)
          }
        } else if (bank[k] && nb4(k).some((q) => cls[q] === 0 || cls[q] === 2)) {
          for (let c = 0; c < area * 0.03; c++) put("rock_moss_set_01", x0 + R() * cw, z0 + R() * ch, 0.5 + R() * 1.1, 1); // (fallen at the cliff's foot)
        }
        if (bank[k] || cls[k] === 3 || town[k]) {
          for (let c = 0; c < area * (bank[k] ? 0.05 : 0.02); c++) {
            const x = x0 + R() * cw, z = z0 + R() * ch, fi = fineInfo(x, z), soil = fi ? fi.soil : 0, slope = fi ? fi.slope : steep[k] * 1.5, r = R();
            if (slope > 1.4) continue;
            if (bank[k]) {
              if (soil > 0.45 && r < 0.2) put("rock_moss_set_01", x, z, 0.3 + R() * 0.6, 1);
              else if (soil > 0.25 && r < 0.42) put("nettle_plant", x, z, 0.5 + R() * 0.5);
              else if (r < 0.52) put("shrub_02", x, z, 0.6 + R() * 0.6);
              else if (r < 0.72) put("grass_medium_01", x, z, 0.35 + R() * 0.3);
              else if (r < 0.8) put("shrub_sorrel_01", x, z, 0.08 + R() * 0.08);
              else if (r < 0.9) put("fern_02", x, z, 0.3 + R() * 0.3);
              else put("weed_plant_02", x, z, 0.2 + R() * 0.15);
            } else if (r < 0.35) put("dandelion_01", x, z, 0.15 + R() * 0.15);
            else if (r < 0.6) put("grass_medium_01", x, z, 0.25 + R() * 0.2);
            else if (r < 0.7) put("weed_plant_02", x, z, 0.18 + R() * 0.15);
          }
        }
      }
      // (along the foot of the buildings' walls on soft ground: weeds and nettles, now and then)
      for (const b of place.buildings || []) {
        const r = b.ring; if (!r || r.length < 3) continue;
        let cx = 0, cz = 0; for (const [x, z] of r) { cx += x / r.length; cz += z / r.length; }
        for (let q = 0; q < r.length; q++) {
          const [x1, z1] = r[q], [x2, z2] = r[(q + 1) % r.length], L = Math.hypot(x2 - x1, z2 - z1); if (L < 1) continue;
          let ox = -(z2 - z1) / L, oz = (x2 - x1) / L; if (ox * ((x1 + x2) / 2 - cx) + oz * ((z1 + z2) / 2 - cz) < 0) { ox = -ox; oz = -oz; }
          for (let u = 0.5; u < L; u += 1.6) {
            if (R() > 0.3) continue;
            const x = x1 + (x2 - x1) * (u / L) + ox * 0.3, z = z1 + (z2 - z1) * (u / L) + oz * 0.3, c = cAt(x, z); if (c !== 1 && c !== 3) continue;
            const kk = nearestVertex(x, z); if (!(bank[kk] || town[kk] || cls[kk] === 3)) continue;
            const w = R(); // (nettles, docks, grass and the hart's-tongue fern that grows from damp wall foots)
            if (w < 0.25) put("nettle_plant", x, z, 0.4 + R() * 0.4); else if (w < 0.55) put("weed_plant_02", x, z, 0.18 + R() * 0.15);
            else if (w < 0.8) put("grass_medium_01", x, z, 0.25 + R() * 0.15); else put("fern_02", x, z, 0.25 + R() * 0.2);
          }
        }
      }
      kit = buildKit(group, Object.entries(S).map(([id, at]) => ({ id, at, flat: id === "wrack", sink: id === "wrack" ? 0 : undefined })));
      place.kitCounts = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.length]));
    }
    if (field || tufts || kit) place.tuftsUpdate = (t, cam, wind, windDir) => { field?.update(t, cam, wind, windDir); tufts?.update(t, cam, wind, windDir); kit?.update(t, cam); };
  }
  // the camera keeps above the ground: the height of land, beach or grass under a point (water is 0)
  function cAt(x, z) { let i = 0, j = 0; while (i < n - 1 && xs[i + 1] <= x) i++; while (j < n - 1 && xs[j + 1] <= z) j++; return cls[j * n + i]; }
  void PLACE3D;
  // open sea only (outside the land and outside any mapped river, lake or harbour water), for boats
  // (whether a point is on a beach's sand or shingle, by the grid: the water's surf breaks along the beaches, environment.js)
  { const near = (v) => { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m; else hi = m; } return v - xs[lo] < xs[hi] - v ? lo : hi; };
    place.beachAt = (x, z) => cls[near(z) * n + near(x)] === 2; }
  place.waterAt = (x, z) => { const q = [x, z]; return !LR.some((bb) => inB(q, bb)) && !PR.some((bb) => inB(q, bb)) && !WR.some((bb) => inB(q, bb)); };
  place.perches = perches;
  // beyond the mapped square: real landmarks where they are, an indicative low town over the land (skyline.js)
  place.skyline = buildSkyline(group, place, { groundY: LAND, quality, industry: local?.industry || null, hill: local?.hill || null, town: local?.generated !== false });
  if (place.skyline?.glow?.length) place.buildingGlow = [...(place.buildingGlow || []), ...place.skyline.glow];
  return (x, z) => { const c = cAt(x, z); if (c !== 0) { const f = fineAt(x, z); return f !== null ? f : H_OF[c] + (local?.hill && (c === 1 || c === 3) ? local.hill(x, z) : 0); } const w = nearestWall(x, z); return w && w.d < 3 && landAt([x, z]) ? LAND : 0; };
}
// ---- the other kinds of fence a photograph shows (localDetail.js): runs of [a, b, deck height] ----
// timber: heavy square posts every 2.4 m with two rails (instanced: two draw calls). bars: a steel railing of upright
// bars between a top and bottom rail, drawn as one see-through panel per run (one draw call, cut out of a texture).
// Each water cell within 7 m of the land (inside the area local.rocks names) gets a few boulders, heaped highest against
// the wall (up to about 3 m above the water) and thinning out into the sea; each boulder a lumpy, flat-faced block, tilted
// and sized at random (1 to 2.2 m), in granite greys. Four instanced meshes (four shapes): four draw calls for all of them.
function buildRocks(group, cls, xs, n, area, quality) {
  // distance from each water cell to the nearest land, by a breadth-first walk carrying the nearest land cell along
  const src = new Int32Array(n * n).fill(-1), queue = [];
  for (let k = 0; k < n * n; k++) if (cls[k] !== 0) { src[k] = k; queue.push(k); }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi], i = k % n, j = (k - i) / n;
    for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const q = jj * n + ii; if (src[q] < 0) { src[q] = src[k]; queue.push(q); } }
  }
  let seed = 1234567; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots = [], edge = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const k = j * n + i; if (cls[k] !== 0 || src[k] < 0) continue;
    const x0 = xs[i], z0 = xs[j], cw = xs[i + 1] - x0, ch = xs[j + 1] - z0; if (cw > 8 || !area(x0, z0)) continue;
    const s0 = src[k], lx = xs[s0 % n], lz = xs[Math.floor(s0 / n)];
    const per = Math.ceil((cw * ch) / 1.3 * (quality < 1 ? 0.5 : 1));
    for (let q = 0; q < per; q++) {
      const x = x0 + rnd() * cw, z = z0 + rnd() * ch, d = Math.hypot(x - lx, z - lz); if (d > 7 + rnd() * 2) continue;
      const t = Math.min(1, d / 8), size = 1.0 + rnd() * 1.2;
      spots.push([x, 3.0 * (1 - t * t) - 0.7 + rnd() * 0.5 - size * 0.15, z, size]);
      // (the seaward fringe, where a crest breaks: a stone 4.5 m and more out from the wall that still shows above the water)
      if (d > 4.5 && d < 7.5) { const l = d || 1; edge.push([x, z, (x - lx) / l, (z - lz) / l]); }
    }
  }
  if (!spots.length) return [];
  // four boulder shapes: a ball pushed about at two scales, then split flat on a few planes, as quarried armour stone
  // is (angular blocks with broken faces, never round pebbles). Each face gets its own projection of the photographed-
  // style granite (made in source-assets/make_granite.py) at about 1.4 m a tile, so nothing stretches
  // (and each shape again from a coarser ball, for the stones beyond the reach of the sun's shadows, 40 m or more
  // away and most of a long breakwater: 80 faces, not 320, where a stone is a few tens of pixels across at most. Its
  // corners are among the fine one's, pushed and split the same, so it is the same stone with fewer facets)
  const shapes = [], farShapes = [];
  const boulder = (detail, v, cuts) => {
    const g = new THREE.IcosahedronGeometry(0.5, detail), p = g.attributes.position, P = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      P.fromBufferAttribute(p, i);
      const f = 1 + 0.22 * (noise2(P.x * 2.1 + v * 7, P.z * 2.1 + P.y * 1.7, 1e6, 21) - 0.5) + 0.07 * (noise2(P.x * 7 + v, P.y * 7 - P.z * 3, 1e6, 22) - 0.5);
      P.multiplyScalar(f);
      for (const [d, k] of cuts) { const t = P.dot(d); if (t > k) P.addScaledVector(d, k - t); }
      p.setXYZ(i, P.x * 1.15, P.y * 0.82, P.z);
    }
    g.deleteAttribute("uv"); g.deleteAttribute("normal");
    const flat = mergeVertices(g).toNonIndexed(); flat.computeVertexNormals();
    const fp = flat.attributes.position, fn = flat.attributes.normal, uvs = new Float32Array(fp.count * 2);
    for (let t = 0; t < fp.count; t += 3) {
      const nx = Math.abs(fn.getX(t)), ny = Math.abs(fn.getY(t)), nz = Math.abs(fn.getZ(t));
      for (let q = t; q < t + 3; q++) { const [u, w] = ny > nx && ny > nz ? [fp.getX(q), fp.getZ(q)] : nx > nz ? [fp.getZ(q), fp.getY(q)] : [fp.getX(q), fp.getY(q)]; uvs[q * 2] = u / 1.4 + v * 0.31; uvs[q * 2 + 1] = w / 1.4 + v * 0.17; }
    }
    flat.setAttribute("uv", new THREE.BufferAttribute(uvs, 2)); return flat;
  };
  for (let v = 0; v < 4; v++) {
    const cuts = Array.from({ length: 4 + v }, () => { const d = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 1.4, rnd() - 0.5).normalize(); return [d, 0.3 + rnd() * 0.14]; });
    shapes.push(boulder(3, v, cuts)); farShapes.push(boulder(1, v, cuts));
  }
  const map = photoTex("rock_granite_diff"), nor = photoTex("rock_granite_nor", { srgb: false }), rough = photoTex("rock_granite_rough", { srgb: false });
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map, normalMap: nor, normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: rough, roughness: 1, metalness: 0 });
  // wet and darker below the tide line, a band of green-black weed at the water, dry and paler above (world height)
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vWY;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vWY;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n float wetK = 1.0 - smoothstep(0.1, 1.1, vWY); diffuseColor.rgb *= mix(1.0, 0.45, wetK); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.04), (1.0 - smoothstep(-0.4, 0.35, vWY)) * 0.7);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.35, 1.0 - smoothstep(0.1, 1.1, vWY));");
  };
  mat.customProgramCacheKey = () => "fdrock1";
  const per = [[], [], [], []]; spots.forEach((sp) => per[Math.floor(rnd() * 4)].push(sp));
  const meshes = []; // (the bands of each shape, nearest first: the photographed stones go into them when they arrive)
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  per.forEach((list, v) => {
    if (!list.length) return;
    // (four meshes of the same stones, by how far they are from you: the fine stone within ARMOUR_LOD.near, a middling
    // one to ARMOUR_LOD.mid, the coarse one beyond. All three cast shadows while inside the reach of the sun's shadow
    // maps; past it, most of a long breakwater, the coarse ones are drawn without being drawn again into those maps.
    // With two bands the photographed stones' 2,000 triangles went to every stone within the shadows' reach, 125 m on
    // Ultra: 6.6 million triangles a frame at Gorleston across the passes, most of them about a pixel each)
    const band = (geo) => new THREE.InstancedMesh(geo, mat, list.length);
    const near = band(shapes[v]), mid = band(shapes[v]), lit = band(farShapes[v]), away = band(farShapes[v]);
    const bands = [near, mid, lit, away];
    const mats = [], cols = [];
    list.forEach(([x, y, z, s]) => {
      e.set((rnd() - 0.5) * 1.2, rnd() * 6.28, (rnd() - 0.5) * 1.2); q4.setFromEuler(e); // (lying roughly flat, as placed stone settles)
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q4, new THREE.Vector3(s * (0.9 + rnd() * 0.4), s * (0.7 + rnd() * 0.35), s)));
      const t = 0.82 + rnd() * 0.3; cols.push(new THREE.Color().setRGB(t * (0.98 + rnd() * 0.06), t, t * (0.97 + rnd() * 0.06)));
    });
    const xz = list.map(([x, , z]) => [x, z]);
    const at = new THREE.Vector3(Infinity, 0, 0), eye = new THREE.Vector3(); let reachWas = 0;
    const share = (cam) => {
      if (cam) eye.setFromMatrixPosition(cam.matrixWorld);
      if (cam && eye.distanceToSquared(at) < 9 && reachWas === SHADOW_REACH.m) return; at.copy(eye); reachWas = SHADOW_REACH.m;
      const into = cam ? armourBands(xz, eye.x, eye.z, SHADOW_REACH.m) : [[], [], [], xz.map((_, i) => i)];
      into.forEach((idx, b) => { const m = bands[b]; idx.forEach((i, k) => { m.setMatrixAt(k, mats[i]); m.setColorAt(k, cols[i]); }); m.count = idx.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
      for (const m of [near, mid, lit]) m.computeBoundingSphere();
    };
    // (each gets every stone once, so each has its colours set up before the first share by distance)
    mats.forEach((m, i) => { for (const b of bands) { b.setMatrixAt(i, m); b.setColorAt(i, cols[i]); } });
    share(null);
    for (const b of bands) { b.castShadow = b !== away; b.receiveShadow = true; group.add(b); }
    away.userData.noAO = true; away.frustumCulled = false;
    meshes[v] = bands;
    away.onBeforeRender = (_r, _s, cam) => { if (cam.isPerspectiveCamera && !cam.userData.fdMirror) share(cam); };
  });
  // ---- the photographed stones (public/models/armour.glb, source-assets/blender/build_armour.py): four scanned
  // boulders (Poly Haven, CC0), turned down to about 2,000 triangles near, 600 middling and 300 far, sized as these,
  // their photographs in one atlas turned to a grey granite's colour. They take the drawn stones' places (the same
  // spots, turns and sizes) once loaded, the wet band and weed kept; until then, or if they can't load, the drawn ones
  // stay ----
  loadPart("armour").then((sc) => {
    let atlas = null;
    const geo = (o) => { let g = null; if (!o) return null; o.updateWorldMatrix(true, true); o.traverse((m) => { if (!g && m.isMesh) { g = m.geometry.clone().applyMatrix4(m.matrixWorld); atlas = atlas || m.material; } }); return g; };
    for (let v = 0; v < 4; v++) {
      if (!meshes[v]) continue;
      const gn = geo(sc.getObjectByName("armour_" + v)), gf = geo(sc.getObjectByName("armour_far_" + v)); if (!gn || !gf) continue;
      const gm = geo(sc.getObjectByName("armour_mid_" + v)) || gf.clone(); // (a file from before the middling stone: the far one)
      const [near, mid, lit, away] = meshes[v];
      for (const m of meshes[v]) m.geometry.dispose();
      // (past the shadows' reach the stones are a few pixels each: their 80-triangle level where the file has one)
      const ga = geo(sc.getObjectByName("armour_away_" + v)) || gf.clone();
      near.geometry = gn; mid.geometry = gm; lit.geometry = gf; away.geometry = ga;
      for (const m of [near, mid, lit]) m.computeBoundingSphere();
    }
    if (atlas?.map) { mat.map = atlas.map; mat.normalMap = atlas.normalMap || null; mat.roughnessMap = atlas.roughnessMap || null; mat.normalScale.set(1, 1); mat.needsUpdate = true; }
  }).catch(() => {});
  return edge;
}

function buildFences(group, timber, bars, dTex, wet) {
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  if (timber.length) {
    const P = [], R = [], H = 1.15;
    for (const [a, b, y] of timber) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 2.4)), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let k = 0; k < n; k++) { const f = k / n; P.push([a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f, ang]); }
      for (const h of [0.55, 1.0]) R.push([(a[0] + b[0]) / 2, y + h, (a[1] + b[1]) / 2, ang, len + 0.1]);
    }
    // weathered softwood: silvered grain with open cracks along it (drawn, textures3d.woodTex), sampled along each
    // piece's own length so a long rail keeps its grain the right size; greener and darker at the foot of the posts
    const timberMat = (grain) => weather(new THREE.MeshStandardMaterial({ color: 0xb3a999, roughness: 0.92 }), { wood: grain, scale: 1, mottle: 0.2, bump: 0.35, grime: [GROUND.land, GROUND.land + 0.35, 0.3], rough: [0.9, 1.1], wet });
    const wood = timberMat("y"), woodX = timberMat("x");
    // (bevelled: sawn timber's edges are rounded off by years of weather and hands, never knife sharp)
    const pm = new THREE.InstancedMesh(roundedBox(0.17, H, 0.17, 0.018), wood, P.length);
    P.forEach(([x, y, z, ang], k) => { mx.compose(v.set(x, y + H / 2, z), q.setFromAxisAngle(up, -ang), sc.set(1, 1, 1)); pm.setMatrixAt(k, mx); });
    const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.07), woodX, R.length);
    R.forEach(([x, y, z, ang, len], k) => { mx.compose(v.set(x, y, z), q.setFromAxisAngle(up, -ang), sc.set(len, 1, 1)); rm.setMatrixAt(k, mx); });
    for (const m of [pm, rm]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
  }
  if (bars.length) {
    // a steel railing of real bars (it was a flat picture of one, which went to a grey smear edge on and showed its
    // trick close to): square posts every 2 m, a top rail, a bottom rail and round bars 12.5 cm apart between them,
    // each piece instanced (four draw calls for every such railing in the place)
    const mat = weather(new THREE.MeshStandardMaterial({ color: 0x9aa0a3, metalness: 0.5, roughness: 0.6 }), { scale: 0.6, mottle: 0.3, bump: 0.5, rust: [0.15, 0.16, 0.065, 0.028], grime: [GROUND.land, GROUND.land + 0.4, 0.2], rough: [0.85, 1.2], wet });
    const H = 1.12, B = [], Pp = [], Rr = [];
    for (const [a, b, y] of bars) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const nb = Math.max(1, Math.round(len / 0.125)), np = Math.max(1, Math.round(len / 2));
      for (let k = 0; k < nb; k++) { const f = (k + 0.5) / nb; B.push([a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f]); }
      for (let k = 0; k <= np; k++) { const f = k / np; Pp.push([a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f, ang]); }
      for (const h of [0.1, H - 0.025]) Rr.push([(a[0] + b[0]) / 2, y + h, (a[1] + b[1]) / 2, ang, len]);
    }
    const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, H - 0.12, 10, 1, true).translate(0, 0.1 + (H - 0.12) / 2, 0), mat, B.length);
    B.forEach(([x, y, z], k) => { mx.makeTranslation(x, y, z); bm.setMatrixAt(k, mx); });
    const pm = new THREE.InstancedMesh(roundedBox(0.05, H + 0.02, 0.05, 0.006), mat, Pp.length);
    Pp.forEach(([x, y, z, ang], k) => { mx.compose(v.set(x, y + (H + 0.02) / 2, z), q.setFromAxisAngle(up, -ang), sc.set(1, 1, 1)); pm.setMatrixAt(k, mx); });
    const rm = new THREE.InstancedMesh(roundedBox(1, 0.04, 0.05, 0.006, "x"), mat, Rr.length);
    Rr.forEach(([x, y, z, ang, len], k) => { mx.compose(v.set(x, y, z), q.setFromAxisAngle(up, -ang), sc.set(len, 1, 1)); rm.setMatrixAt(k, mx); });
    for (const m of [bm, pm, rm]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
  }
}
// a box with its edges rounded (r), centred; "x": long along x and stretched by its instance's scale, so the rounding
// is kept at the ends' size (the corners are built for a unit length and only the middle stretches)
function roundedBox(w, h, d, r, long = "y") {
  const sh = new THREE.Shape(), hw = (long === "x" ? h : w) / 2 - r, hd = d / 2 - r;
  sh.moveTo(-hw, -hd - r); sh.lineTo(hw, -hd - r); sh.absarc(hw, -hd, r, -Math.PI / 2, 0); sh.lineTo(hw + r, hd); sh.absarc(hw, hd, r, 0, Math.PI / 2);
  sh.lineTo(-hw, hd + r); sh.absarc(-hw, hd, r, Math.PI / 2, Math.PI); sh.lineTo(-hw - r, -hd); sh.absarc(-hw, -hd, r, Math.PI, Math.PI * 1.5);
  const L = long === "x" ? w : h;
  // (no bevel on the ends: a bevel of zero size there left corners with no surface, whose normals came out as NaN)
  const g = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -L / 2); // (along z, centred)
  if (long === "x") g.rotateY(Math.PI / 2).rotateX(Math.PI / 2); else g.rotateX(Math.PI / 2);
  // (smooth round the rounded edges: one normal per corner place; the texture coordinates are kept, as a box's)
  g.deleteAttribute("normal"); const uv = g.attributes.uv; g.deleteAttribute("uv");
  const m = mergeVertices(g, 1e-5); m.computeVertexNormals(); g.dispose();
  m.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(m.attributes.position.count * 2), 2)); void uv;
  return m;
}
function segDist(q, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2)); return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t); }
// a mesh only for the camera's ray (never drawn)
function collider(p, i) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}
