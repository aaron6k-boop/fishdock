// ---- world: the 3D view (three.js): the place, the anglers, splashes, the camera and the loop ----
// Loaded only when someone opens the 3D view. Camera modes: first person (from your spot, rod in hand), third
// person (behind you), spectator (behind whoever you pick), cinematic (it chooses angles for bites, fights and
// landings) and free look. Looking round never pauses the fishing. Quality: Performance, Balanced or High Quality,
// chosen by Auto from the phone, and stepped down if frames run slow. Nothing is drawn while hidden.
import * as THREE from "three";
import { checkScene } from "./sceneCheck.js";
import { walker, stepWalker, keepApart, roomToFish, stepGait, surfaceFor } from "./walker.js";
import { createEnvironment } from "./environment.js";
import { createAngler } from "./angler.js";
import { createLook, lookAt, wrap, walkFollow, FOLLOW, easeBlend, followDist, WALK_PITCH, walkPitchBack } from "./look.js";
import { layoutFor } from "./spots.js";
import { safeSpots, spawnFor } from "./spawn.js";
import { planCast } from "./castAim.js";
import { addRipple, stepRipples } from "./waterFx.js";
import { shotFor } from "./landCam.js";
import { createPost } from "./post.js";
import { setPeopleDetail } from "./human3d.js";
import { FILM } from "./film.js";

// dpr: the most pixels per screen pixel; ss: the least (a computer's 1x screen is drawn sharper than its pixels and
// scaled down, which smooths the fine edges of railings, rods and lines); floor: the least the frame pacing drops to;
// post: post.js level (1 bloom and grade, 2 plus ambient occlusion)
export const QUALITY3D = {
  performance: { dpr: 1.5, ss: 1, floor: 1, shadows: 0, q: 0.5, post: 0 },
  balanced: { dpr: 2, ss: 1, floor: 1.25, shadows: 1, q: 1, post: 1, late: 0.025, easy: 10 }, // (steps down when frames run under about 40 a second, as landing a fish with the deck filling the view did on a phone, and back up after 20 s of easy frames; never below 1.25)
  // (High also steps down, the same as Balanced, so a phone that can't hold it at a busy moment gets smoother rather than jerky)
  high: { dpr: 2.5, ss: 1.75, floor: 1.25, shadows: 1, q: 2, post: 2, late: 0.025, easy: 10 },
  // a computer with a graphics card: drawn at twice the screen's pixels (or more) and scaled down, finer shade
  // (and kept smooth: a frame slower than about 48 a second counts as late, where the others allow down to 28)
  // (sea: the spectrum sea, fftSea.js: the wind sea simulated from a wave spectrum on the graphics card)
  ultra: { dpr: 3, ss: 2, floor: 1.5, shadows: 1, q: 2, post: 3, late: 0.021, sea: 1 },
};
export function autoQuality3d() {
  try {
    // iPhone Safari reports no memory and only a few cores, which put every iPhone (even the newest) on the lowest
    // setting: no antialiasing, one pixel per three and no shadows, so edges were jagged and everything soft. iPhones
    // from the last several years have strong graphics. A recent one (iOS 18 or later: iPhone XS and newer, and
    // Balanced measured a steady 60 with room to spare on an iPhone 17 Pro) starts on High quality, which steps itself
    // down if frames run late; older ones get Balanced
    const ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios) { const v = +(ua.match(/Version\/(\d+)/) || ua.match(/OS (\d+)_/) || [0, 0])[1]; return v >= 18 ? "high" : "balanced"; }
    // a computer with its own graphics card (NVIDIA, AMD Radeon, Intel Arc) gets the best, whatever it reports
    if (!/Android|Mobile/.test(ua)) { const g = gpuName(); if (/NVIDIA|GeForce|RTX|Radeon RX|Radeon Pro|Intel\(R\) Arc/i.test(g)) return "ultra"; if (/Apple M\d/i.test(g)) return "high"; } // (a Mac with Apple silicon: High)
    const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4; if (mem <= 2 || cores <= 4) return "performance";
    if (mem >= 8 && cores >= 8) return "high";
  } catch { /* ignore */ }
  return "balanced";
}
function gpuName() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2"); if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info"); const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name || "";
  } catch { return ""; }
}
export const HOME_PITCH = -0.09;
const ease01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const CAMERA_MODES = [
  { id: "first", label: "First person" }, { id: "third", label: "Third person" }, { id: "spectator", label: "Spectator" },
  { id: "cinematic", label: "Cinematic" }, { id: "free", label: "Free look" },
];

export function createWorld(canvas, { venue = "pier", quality = "balanced", onSound, onFeel, reduceMotion = false, real = null, pano = null, trackJumps = true } = {}) {
  const Q = QUALITY3D[quality] || QUALITY3D.balanced;
  setPeopleDetail(Q.q >= 2); // (High and Ultra: the people's full-detail textures)
  // (with post-processing the antialiasing is the post buffer's own MSAA, so the screen's would be wasted)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.post, powerPreference: "high-performance" });
  const dprTop = Math.min(Q.dpr, Math.max(window.devicePixelRatio || 1, Q.ss || 1)); let dprMax = dprTop; // (dprMax: lowered by Settings → Graphics → Resolution)
  renderer.setPixelRatio(dprMax);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0; // (see adapt)
  renderer.shadowMap.enabled = !!Q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 5000);
  // ---- post-processing (post.js), and every texture filtered as sharply as the graphics card allows ----
  // (not over a 360° photo: that is the photo as taken, not to be graded)
  let post = null;
  try { post = pano ? null : createPost(renderer, scene, camera, { level: Q.post }); } catch (e) { console.warn("FishDock 3D: post-processing off", e); post = null; }
  const anisoCap = renderer.capabilities.getMaxAnisotropy(); let maxAniso = Q.q >= 1 ? anisoCap : 4;
  let texSeen = -1, sharpenAt = 0;
  function sharpen() {
    // (textures arrive as the models load: look again whenever the count changes, at most once a second or so)
    if (++sharpenAt < 60) return; sharpenAt = 0;
    const n = renderer.info.memory.textures; if (n === texSeen) return; texSeen = n;
    scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null; if (!ms) return;
      for (const m of ms) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "bumpMap", "emissiveMap"]) {
        const t = m[k]; if (t && t.isTexture && !t.isRenderTargetTexture && t.anisotropy !== maxAniso) { t.anisotropy = maxAniso; t.needsUpdate = true; }
      }
    });
  }
  // (the drawing counts are kept for the whole frame, post-processing passes and all, for the FPS display)
  renderer.info.autoReset = false;
  // (the water's mirror is drawn first, without your own first-person hands: environment.js reflect)
  let noRefl = [], noReflAt = 0;
  let simT = 0;
  // the graphics card's own time per frame (what it spends drawing, apart from everything the page does around it):
  // a GPU timer query round each frame where the browser offers one (Chromium on a PC; not Safari). The answer comes
  // back a few frames later; the last 60 are kept for perf()
  const gl = renderer.getContext(), tq = gl.getExtension("EXT_disjoint_timer_query_webgl2"), gpuT = new Float32Array(60); let gpuN = 0, qs = [];
  function drawFrame() {
    sharpen(); renderer.info.reset();
    let q = null; if (tq && qs.length < 8) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
    if (env.fftSea) env.simulate(simT); // (the spectrum sea's passes count in the frame's GPU time)
    if (env.reflections) { if (!noReflAt--) { noRefl = scene.getObjectsByProperty("name", "fdNoReflect"); noReflAt = 120; } env.reflect(renderer, scene, camera, noRefl); }
    if (post) post.render(); else renderer.render(scene, camera);
    if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); qs.push(q); }
    // (collect the answers that are ready, oldest first; a disjoint event, as a change of GPU clock, throws them away)
    while (qs.length && gl.getQueryParameter(qs[0], gl.QUERY_RESULT_AVAILABLE)) { const d = gl.getParameter(tq.GPU_DISJOINT_EXT); const ns = gl.getQueryParameter(qs[0], gl.QUERY_RESULT); gl.deleteQuery(qs.shift()); if (!d) gpuT[gpuN++ % 60] = ns / 1e6; }
  }
  const tBuild = performance.now();
  const env = createEnvironment(scene, { venue, quality: Q.q, real, pano, post: !!post });
  const buildMs = Math.round(performance.now() - tBuild);
  if (Q.sea) env.setFftSea(true, renderer);
  // the real place as built: fit to stand in? (sceneCheck.js; World3D shows the representative place if not)
  let realCheck = real && real.targets ? checkScene(real, real.targets) : null;
  if (realCheck && !realCheck.ok) console.warn("FishDock 3D: the real place failed its scene check", realCheck.why);
  // a real place brings its own fishing spots (on its pier or along its shore); in a 360° photo everyone stands
  // where the photo was taken, side by side, facing the water
  let L = real?.spots?.length === 4 ? { ...layoutFor(venue), spots: real.spots } : layoutFor(venue);
  if (pano) {
    const face = real?.spots?.[0]?.face ?? ((pano.heading || 0) * Math.PI) / 180, sx = Math.cos(face), sz = Math.sin(face);
    L = { ...L, deck: 1, spots: [0, 1, 2, 3].map((k) => { const off = [0, 3.5, -3.5, 7][k]; return { id: k + 1, name: L.spots[k]?.name || `Spot ${k + 1}`, at: [sx * off, 0.9, sz * off], face, cast: 26 }; }) };
  }
  // ---- where anglers arrive: every position checked against this place's ground first (spawn.js) ----
  // a blocked one moves to the nearest safe place; a real place with nowhere safe to stand isn't used
  const spawn = env.ground && !pano ? safeSpots(L.spots, env.ground, { venue }) : { spots: L.spots, report: [] };
  if (spawn.report.some((r) => r.problem)) console.info("FishDock 3D: arrival positions checked", spawn.report);
  if (spawn.spots.length) L = { ...L, spots: spawn.spots };
  else if (realCheck) realCheck = { ok: false, why: ["nowhere safe to stand", ...(realCheck.why || [])] };
  const spotOf = (id, takenIds = []) => spawnFor(L.spots, id, takenIds);
  const world = new THREE.Group(); scene.add(world);
  const look = createLook({ pitch: -0.12 });
  let homeFor = null;
  let mode = "first", focusId = null, localId = null, anglers = new Map(), envState = { swell: 0.3, wind: 0.3, windDir: [0.3, -1], kind: 0 };
  let landShot = null, landShotOn = true, lastFight = null; // the landing shot (see updateCamera); turned to watch your fish go back
  let followId = null, followUntil = 0, steering = false; // watching another angler's catch; the camera steering itself
  const kind = { pier: 0, beach: 0, estuary: 1, river: 2, lake: 3 }[venue] ?? 0;

  // ---- splashes (droplets) and rings on the water ----
  const DROPS = 260, dropPos = new Float32Array(DROPS * 3), dropV = new Float32Array(DROPS * 3), dropLife = new Float32Array(DROPS);
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
  // round, soft droplets (a radial sprite), not square points
  const dropTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.45, "rgba(240,248,252,.85)"); r.addColorStop(1, "rgba(240,248,252,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xf2f6f8, size: 0.09, map: dropTex, transparent: true, opacity: 0.95, depthWrite: false, alphaTest: 0.02 })); drops.frustumCulled = false; scene.add(drops);
  let dropHead = 0;
  /** at: world point; size: how big (a rig .6, a landed fish .9); mult: how many more drops (spray off a wall, seen from further off); up: a direction to throw them (spray goes up and back over the wall, not out in a ring) */
  function splash(at, size = 0.6, mult = 1, up = null) {
    const n = Math.round((30 * size + 10) * mult);
    for (let i = 0; i < n; i++) {
      const k = dropHead++ % DROPS, a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 2.2) * size;
      dropPos.set([at.x, Math.max(at.y, 0) + 0.02, at.z], k * 3);
      if (up) dropV.set([Math.cos(a) * sp * 0.35 + up.x * sp * 0.8, 2.2 + Math.random() * 4 * size, Math.sin(a) * sp * 0.35 + up.z * sp * 0.8], k * 3);
      else dropV.set([Math.cos(a) * sp * 0.6, 1.5 + Math.random() * 3 * size, Math.sin(a) * sp * 0.6], k * 3);
      dropLife[k] = 1;
    }
  }
  const ripples = [];
  // [x, z, age, strength, life]: a big splash's rings last longer than a fish's swirl; with eight already spreading, the
  // faintest goes (dropping the oldest let a fight's small swirls push out the splash it had just made)
  // (waterFx.js: small, short-lived rings, so a fight's swirls don't pile up into wide pale loops round the net)
  const ripple = (at, s = 0.6) => { addRipple(ripples, at.x, at.z, s); };

  // ---- aiming a cast: a ring on the water where it will land, while you hold Cast ----
  const aimMark = new THREE.Group(); aimMark.visible = false; scene.add(aimMark);
  {
    const m = new THREE.MeshBasicMaterial({ color: 0x7ee8de, transparent: true, opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.11, 6, 40), m); ring.rotation.x = Math.PI / 2; aimMark.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), m); dot.rotation.x = -Math.PI / 2; aimMark.add(dot);
    aimMark.renderOrder = 5;
  }
  let aimPower = null;
  function castPlanFor(power) {
    const me = anglers.get(localId); if (!me?.out || W) return null;
    const spot = me.a.spot, ground = env.ground;
    return planCast({ venue, spot: { ...spot, at: me.out.at.toArray(), face: me.out.face }, power, lookYaw: look.yaw, wind: { strength: envState.wind, dir: envState.windDir }, water: ground ? (x, z) => !ground.walkable(x, z) : null });
  }

  // ---- anglers ----
  let script = null, scriptHint = null; // (film only: a scripted event log for your angler, __fdWorld.play)
  function setAnglers(list) {
    const seen = new Set();
    for (const a of list) {
      seen.add(a.id);
      let x = anglers.get(a.id);
      const spot = spotOf(a.spot, list.filter((o) => o.id !== a.id).map((o) => o.spot));
      // a new name (someone going "away" and coming back) only changes the label: rebuilding the angler would make
      // them jump and could play the moment they're in again
      const lookKey = a.look ? JSON.stringify(a.look) : "";
      if (x && x.spotId === a.spot && x.outfit === a.outfit && x.lookKey === lookKey && x.name !== a.name) { x.a.setName(a.name); x.name = a.name; }
      if (!x || x.spotId !== a.spot || x.outfit !== a.outfit || x.lookKey !== lookKey) {
        if (x) x.a.dispose();
        // only your own angler is felt (other people's catches arrive as a party notification instead)
        const made = createAngler(world, { id: a.id, name: a.name, spot, venue, outfit: a.outfit ?? 0, look: a.look || null, local: !!a.local, real: !!a.real, fineHands: Q.q >= 2, rail: !!real && (venue === "pier" || venue === "estuary"), onSound: (n, p, d) => onSound?.(n, p, a.id, d), onFeel: a.local ? (n, d) => onFeel?.(n, d) : null });
        made.onSplash(splash); made.onRipple(ripple);
        x = { a: made, spotId: a.spot, outfit: a.outfit, lookKey, name: a.name, out: null };
        anglers.set(a.id, x);
      }
      x.a.setEvents(a.local && script ? script : a.events); x.a.setHint(a.local && scriptHint ? scriptHint : a.fishHint || null); x.inspect = !!a.inspect && !!a.local;
      if (a.local) localId = a.id;
    }
    for (const [id, x] of anglers) if (!seen.has(id)) { x.a.dispose(); anglers.delete(id); }
    if (!focusId || !anglers.has(focusId)) focusId = localId || [...anglers.keys()][0] || null;
    const me = anglers.get(localId) || anglers.get(focusId);
    // start looking out the way the spot faces, a little down towards where the line goes in
    if (me && homeFor !== me.a.id) { homeFor = me.a.id; const s = me.a.spot || spotOf(me.spotId); look.setHome(s.face, HOME_PITCH); look.aim(s.face, HOME_PITCH); }
  }

  // ---- camera ----
  // nothing the camera may pass through: walls, decks, buildings (thin things like railings are left out) and the
  // ground under it; a ray from the angler's head to where the camera wants to be stops short of the first one
  const ray = new THREE.Raycaster(), solids = env.solids || [];
  for (const m of solids) m.updateMatrixWorld(true);
  const pivot = new THREE.Vector3(), toCam = new THREE.Vector3();
  function unblocked(from, want) {
    toCam.subVectors(want, from); const d = toCam.length(); if (d < 0.01 || !solids.length) return want;
    ray.set(from, toCam.multiplyScalar(1 / d)); ray.far = d + 0.35;
    const hit = ray.intersectObjects(solids, false)[0];
    const out = hit ? from.clone().addScaledVector(toCam, Math.max(0.35, hit.distance - 0.35)) : want.clone();
    out.y = Math.max(out.y, (env.floorAt ? env.floorAt(out.x, out.z) : 0) + 0.6);
    return out;
  }
  // the walking camera: the picture's edges kept clear as well as its middle (a ray a little to each side too), so
  // sliding past a wall, the lighthouse or a shelter never puts the side of the view inside it. How far back is clear
  function clearBack(from, want, yaw) {
    let d = unblocked(from, want).distanceTo(from);
    const side = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.24), dir = new THREE.Vector3();
    if (solids.length) for (const sg of [-1, 1]) {
      const f2 = from.clone().addScaledVector(side, sg), w2 = want.clone().addScaledVector(side, sg); dir.subVectors(w2, f2); const len = dir.length(); if (len < 0.01) continue;
      ray.set(f2, dir.multiplyScalar(1 / len)); ray.far = len + 0.35;
      const hit = ray.intersectObjects(solids, false)[0]; if (hit) d = Math.min(d, Math.max(0.35, hit.distance - 0.35));
    }
    return d;
  }
  let camOverride = null, lookOverride = null, inspectFrom = null;
  // where your fish sits on screen while you look at it (normalised: 0 the middle, 1 the top), above the card that
  // tells you about it along the bottom (Stage3D FishLook, its height capped in livefishing.css)
  const FISH_NDC_Y = 0.32;
  // walking about (walker.js): the walker, the stick, a jump waiting, whether you can fish where you stand
  // auto-walk (keeps walking where you look until you touch the stick) and tap-to-move (walks to a point you tapped)
  let autoWalk = false, walkTarget = null, walkStuck = 0, modeSince = -10, lastMode = "first";
  let crowded = false, aheadN = 0, aheadD = null;
  // where everyone else is standing (their spot, or where they've walked to)
  const othersAt = () => { const o = []; for (const [id, x] of anglers) if (id !== localId && x.out?.at) o.push([x.out.at.x, x.out.at.z]); return o; };
  let W = null, walkIn = { x: 0, y: 0, sprint: false }, walkJump = false, canFish = false, fishTest = 0, modeBeforeWalk = "first", fovBeforeWalk = null, onPose = null;
  // ---- the walking camera's own easing: how far behind you it is (in at once for a wall, out slowly), the height it
  // looks from (eased, so a step up or a jump doesn't jolt it), the footsteps' stride, and a glide between views ----
  let followAt = 0, pivotY = null, pivotXZ = null, gait = { d: 0 }, camBlend = null, clockT = 0; // (clockT: the scene's clock, so a filmed glide is exact)
  const WALK_FOV = 62;
  /** Glide the camera from where it is now to wherever the next frames put it, over `sec` seconds. */
  function blendCamera(sec = 0.7) { camBlend = reduceMotion ? null : { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, t0: clockT, sec }; }
  // (a long way round takes a little longer: the glide back to your spot turns at most about 150° a second)
  const blendFor = (yawTo, far = 0) => blendCamera(0.65 + Math.min(0.6, Math.abs(wrap(yawTo - look.yaw)) / 2.6) + Math.min(0.45, far / 20));
  function applyBlend() {
    if (!camBlend) return 1;
    const u = (clockT - camBlend.t0) / camBlend.sec; if (u >= 1) { camBlend = null; return 1; }
    const k = easeBlend(u), q = camera.quaternion.clone();
    camera.position.lerpVectors(camBlend.pos, camera.position.clone(), k); camera.quaternion.copy(camBlend.quat).slerp(q, k);
    camera.fov = camBlend.fov + (camera.fov - camBlend.fov) * k; camera.updateProjectionMatrix();
    return k;
  }
  // other people walking (Fish Together): their latest pose, eased towards
  const remote = new Map();
  function applyRemote(id, x, dt) {
    const r = remote.get(id); if (!r) return;
    if (!r.pose) { x.a.setWalk(null); remote.delete(id); return; }
    const k = 1 - Math.exp(-dt * 8), c = r.cur || { ...r.pose, phase: 0 };
    const nx = c.x + (r.pose.x - c.x) * k, nz = c.z + (r.pose.z - c.z) * k, moved = Math.hypot(nx - c.x, nz - c.z);
    r.cur = { x: nx, y: c.y + (r.pose.y - c.y) * k, z: nz, face: c.face + Math.atan2(Math.sin(r.pose.face - c.face), Math.cos(r.pose.face - c.face)) * k, speed: moved / dt, air: r.pose.air, phase: (c.phase + moved * 2.2) % (Math.PI * 2) };
    x.a.setWalk(r.cur);
  }
  let camPos = new THREE.Vector3(0, L.deck + 1.65, 0), camTarget = null, cineShot = null, cineSince = 0, lastPhaseKey = "";
  // following jumps (optional, on to start): the camera turns to a leap just before it happens and closes in a little
  // so it reads on a phone, then eases back. Never while you're turning the view yourself, never in Free look, and not
  // with reduced motion on
  let track = trackJumps && !reduceMotion, jumpZoom = 1;
  function updateCamera(t, dt) {
    // (the view has already been turned for this frame, before the anglers were posed: see tick)
    const focus = anglers.get(mode === "spectator" ? focusId : localId) || anglers.get(focusId);
    const out = focus?.out;
    let pos = camPos.clone();
    let yaw = look.yaw, pitch = look.pitch;
    // the camera steers itself (unless you've turned it in the last few seconds): to follow your own fish while it's
    // fought and landed in first or third person, or another angler's catch you chose to watch
    const idle = performance.now() - look.touched > 2500;
    const watched = followId && anglers.get(followId)?.out;
    let steerTo = null, fpDown = false;
    if (watched && t < followUntil) {
      const wo = watched, busy = wo.phase === "hooked" || wo.phase === "landing" || wo.phase === "bite";
      steerTo = busy ? (wo.fishAt || wo.rig || wo.tip) : wo.at.clone().add(new THREE.Vector3(0, 1.2, 0));
      if (wo.phase === "landing" && wo.landed) followUntil = Math.min(followUntil, t + 2.5);
    } else if (followId && t >= followUntil) followId = null;
    else if (out && focus?.a.local && mode === "first" && !landShotOn && (out.land || out.kept === "deck" || out.kept === "inspect" || out.release)) {
      // landing it yourself, through your own eyes: your head turns down over the rail to the net and the fish (the net
      // going down, the fish led in, the net coming up), then to the fish on the deck; drag and you look where you like,
      // and after a moment it carries on with what's happening. (No cut to a camera beside you: that's Cinematic)
      const L = out.land, R2 = out.release;
      steerTo = L ? (L.stage === "rod" ? out.at.clone().add(new THREE.Vector3(0, 1.0, 0)).lerp(out.tip, 0.5) /* (watching your hands lay the rod on the rail, out in front: nearer your feet, the point was almost straight below your eye and the view spun round to wherever that put it) */ : L.stage === "lower" || L.stage === "lead" || L.stage === "haul" ? (L.net || L.fish) : L.stage === "pick" || L.stage === "in" || L.stage === "done" ? (L.net || L.fish) : (L.fish || out.fishAt || out.rig))
        : R2 ? (R2.net || R2.fish || out.keptAt) : out.keptAt;
      if (steerTo) { steerTo = steerTo.clone(); if (L?.water != null && steerTo.y < L.water + 0.3) steerTo.y += 0.25; } // (a little above the net in the water, so the view isn't all dark sea)
      fpDown = true;
    }
    else if (out && focus?.a.local && (mode === "first" || mode === "third") && (out.phase === "hooked" || out.phase === "landing") && !(out.phase === "landing" && out.landed)) {
      steerTo = out.phase === "landing" ? (out.fishAt || out.rig) : (out.rig ? out.tip.clone().lerp(out.rig, 0.55) : null);
      // never swung round to the pier or the town by a fish running sideways: within 25° of the water you face
      if (steerTo) { const l = lookAt(out.eye.toArray(), steerTo.toArray()), off = wrap(l.yaw - out.face), lim = 0.44; if (Math.abs(off) > lim) { const a = out.face + Math.sign(off) * lim, d = Math.hypot(steerTo.x - out.eye.x, steerTo.z - out.eye.z); steerTo = new THREE.Vector3(out.eye.x + Math.sin(a) * d, steerTo.y, out.eye.z - Math.cos(a) * d); } }
    }
    const leap = track && mode !== "free" && idle ? (watched && t < followUntil ? watched.jump : (mode === "first" || mode === "third" || mode === "spectator" || mode === "cinematic") ? out?.jump : null) : null;
    if (leap) steerTo = leap;
    // closer in for a far leap, so a 50 cm fish 40 m out is more than a few pixels (the camera zooms; the fish isn't scaled)
    jumpZoom += ((leap ? Math.max(0.4, Math.min(0.8, 12 / Math.max(1, camPos.distanceTo(leap)))) : 1) - jumpZoom) * (1 - Math.exp(-dt * (leap ? 3 : 1.5)));
    const mk = anglers.get(localId)?.out;
    if (mk?.keptAt && mk.kept === "inspect" && !(mode === "first" && !landShotOn)) {
      // looking at your fish: in front of you, a little to the side, looking back at it as you hold it up
      const [fx, fz] = [Math.sin(mk.face), -Math.cos(mk.face)], c = mk.kept === "inspect" ? mk.keptAt : inspectFrom || mk.keptAt;
      if (!inspectFrom) inspectFrom = mk.keptAt.clone();
      anglers.get(localId)?.a.setFirstPerson(false); // (the camera's in front of you: all of you shows, head and all)
      // (in front of you and a little to the side, looking down at the fish on its mat with you crouched behind it; aimed
      // a little below it, so it sits in the top half of the picture, clear of the card along the bottom)
      // (from beside you on the bank or the deck, never out over the water: a bank's edge between hid the mat. Off to
      // your right, looking down across the mat at the fish)
      // (off to your left: the rod lies on its rest on your right and crossed the picture. At a steady height over the
      // deck or the bank, so it doesn't bob as the fish goes from the net to your hands to the mat)
      const sx = -fz, sz = fx, at0 = c.clone().add(new THREE.Vector3(-sx * 1.75 - fx * 0.45, 0, -sz * 1.75 - fz * 0.45)); at0.y = mk.at.y + 1.45; // (a little back from it, so the railing is behind the fish, not across it)
      { const fl = env.floorAt?.(at0.x, at0.z); if (fl != null && at0.y < fl + 1.0) at0.y = fl + 1.0; }
      const far = camPos.distanceTo(at0), to = at0.clone(); to.y += Math.min(1.2, Math.max(0, far - 0.5) * 0.5); // (over the top on the way, never through you)
      camPos.lerp(to, 1 - Math.exp(-dt * 4)); camera.position.copy(camPos);
      // (the fish a little above the middle, at the height of the clear band between the top bar and the card about it
      // along the bottom: the card never covers it)
      camera.fov = 52; camera.updateProjectionMatrix(); camera.lookAt(c); camera.rotateX(-Math.atan(Math.tan((camera.fov * Math.PI) / 360) * FISH_NDC_Y));
      if (camOverride) { camera.position.copy(camOverride); camera.lookAt(lookOverride || c); } // test hook only
      return { yaw, pitch };
    } else { if (inspectFrom) modeSince = t; inspectFrom = null; } // (and back from it with a glide, not a cut)
    if (W) {
      // behind and a little above you, coming round smoothly as you turn (not while you drag to look round, and not for a
      // moment after: then it eases back behind you as you walk on); closer or further as you pinch; very close is first
      // person. The horizon stays level (the camera never rolls)
      // (the speed it follows at is the walker's eased speed, not a frame's, so it doesn't twitch with uneven frames)
      W.camSpeed = (W.camSpeed || 0) + ((W.speed || 0) - (W.camSpeed || 0)) * (1 - Math.exp(-dt * 6));
      // (the turn eases its own speed up and down; the pitch comes back to its level on its own after a look up or down,
      // walking or standing, and a double tap recentres behind you)
      const sinceTouch = performance.now() - look.touched;
      look.follow(W.face, null, walkFollow({ dragging: look.dragging, sinceTouch, speed: W.camSpeed, off: W.face - look.yaw, dt }), dt);
      look.easePitch(WALK_PITCH.level, walkPitchBack({ dragging: look.dragging, sinceTouch, dt }));
      look.setHome(W.face, WALK_PITCH.level);
      yaw = look.yaw; pitch = look.pitch;
      // the height it looks from eases after you (a step up, a jump, a ramp onto the pier), never jolting
      pivotY = pivotY == null || Math.abs(W.y - pivotY) > 3 ? W.y : pivotY + (W.y - pivotY) * (1 - Math.exp(-dt * (W.air ? 4 : 9)));
      // and where it looks from follows you a touch behind (a few centimetres at a walk), so a stride that comes up
      // short against a railing doesn't shake the whole view; first person stays exactly at your eyes
      const dist = Math.max(0, ((look.fov - 28) / 50) * 9 + 0.4);
      if (!pivotXZ || dist < 1.1 || Math.hypot(W.x - pivotXZ[0], W.z - pivotXZ[1]) > 3) pivotXZ = [W.x, W.z];
      else { const kp = 1 - Math.exp(-dt * 14); pivotXZ = [pivotXZ[0] + (W.x - pivotXZ[0]) * kp, pivotXZ[1] + (W.z - pivotXZ[1]) * kp]; }
      const tgt = new THREE.Vector3(pivotXZ[0], pivotY + 1.55, pivotXZ[1]);
      const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      if (dist < 1.1) {
        // first person: a subtle bob and sway with your steps (none with reduced motion)
        const sp = Math.min(1, (W.speed || 0) / 4), ph = (W.phase || 0) * 2;
        pos.copy(tgt).add(new THREE.Vector3(0, 0.07 + (reduceMotion ? 0 : Math.abs(Math.sin(ph)) * 0.035 * sp - 0.015 * sp), 0));
        if (!reduceMotion) { const sx = Math.cos(yaw), sz = Math.sin(yaw), w = Math.sin(ph * 0.5) * 0.02 * sp; pos.x += sx * w; pos.z += sz * w; }
        anglers.get(localId)?.a.setFirstPerson(true);
      }
      else {
        // (a little higher: you sit lower in the view, with the way ahead above you). Something in the way brings the
        // camera in at once; when it clears, the camera eases back out rather than popping
        const want = tgt.clone().addScaledVector(d, -dist).add(new THREE.Vector3(0, 0.3, 0)); pivot.copy(tgt);
        const wantD = clearBack(pivot, want, yaw);
        followAt = followDist(followAt, wantD, dt);
        pos.copy(pivot).addScaledVector(want.clone().sub(pivot).normalize(), followAt);
        { const fl = env.floorAt ? env.floorAt(pos.x, pos.z) : null; if (fl != null) pos.y = Math.max(pos.y, fl + 0.6); }
        anglers.get(localId)?.a.setFirstPerson(false);
      }
      camPos.copy(pos); camera.position.copy(camPos); camera.fov = WALK_FOV * (camera.aspect < 0.8 ? 1.1 : 1); camera.updateProjectionMatrix();
      camera.lookAt(camera.position.clone().add(d));
      if (camOverride) { camera.position.copy(camOverride); camera.lookAt(tgt.clone().add(new THREE.Vector3(0, -0.6, 0))); } // test hook only
      return { yaw, pitch };
    }
    // landing your fish (first or third person): the camera steps back beside you for a moment, so you see the whole
    // thing (the rod laid on the rail, the net going down, the fish led in, the net hauled up and brought over) instead
    // of an arm filling the view, then glides back. Drag and you look round from there as usual
    // (and after it, while your fish waits in the net on the deck for you to have a look, the camera stays on it, rather
    // than going back to the open water with the fish behind you)
    // (in third person the landing is always shown from these framed outside shots, you and the net and the fish together:
    // from behind you, the wall hid the net and the fish below. In first person only if you chose Cinematic)
    const ownView = out && focus?.a.local && ((landShotOn && mode === "first") || mode === "third");
    const landing = ownView && out.land ? out.land : ownView && out.kept === "deck" && out.keptAt ? { stage: "deck", net: out.keptAt, fish: out.keptAt, edge: out.edge }
      : ownView && out.release ? { stage: out.release.stage, net: out.release.net, fish: out.release.fish || out.keptAt, edge: out.edge, water: out.release.water ?? null } : null; // (putting it back: the same shots)
    if (landShot && !out) landShot = null;
    if (landing || landShot) {
      if (landing) {
        const [fx, fz] = [Math.sin(out.face), -Math.cos(out.face)], side = [-fz, fx];
        // (a point from where you stand: so far to your right, forwards and up)
        const from = (r, f, u) => new THREE.Vector3(out.at.x + side[0] * r + fx * f, out.at.y + u, out.at.z + side[1] * r + fz * f);
        const rail = from(-0.32, landing.edge - 0.22, 1.1), you = out.at.clone().add(new THREE.Vector3(0, 1.1, 0)), st = landing.stage;
        let shot, focusAt;
        // ---- the drop net off a high pier (landing it, and putting it back): one continuous story, framed ----
        // each moment's shot (landCam.js) is chosen by what has to be seen in it (the fish, the net, you), always from
        // out over the water on your left, so the camera eases from one to the next and never cuts or swings round you
        const dropStage = venue === "pier" && (out.tech === "dropnet" || !out.land) ? (out.release ? { deck: "carry", in: "over", lower: "rlower", swim: "swim", swum: "rhaul", haul: "rhaul" }[st] : st) : null;
        const shotFov = (dropStage === "lower" || dropStage === "haul" || dropStage === "rlower" || dropStage === "rhaul" ? 60 : 52) * (camera.aspect < 0.8 ? 1.12 : 1), tanV = Math.tan((shotFov * Math.PI) / 360);
        const arr = (v) => (v ? v.toArray() : null);
        const framed = dropStage ? shotFor(dropStage, { fish: arr(landing.fish), ahead: arr(out.release?.ahead), net: arr(landing.net), head: arr(out.at.clone().add(new THREE.Vector3(0, 1.72, 0))), feet: arr(out.at.clone().add(new THREE.Vector3(0, 0.05, 0))) }, out.face, { tanV, tanH: tanV * camera.aspect, margin: 0.8, lift: camera.aspect < 0.8 ? 0.2 : 0.1 }) : null; // (lift: kept clear of the controls at the bottom)
        if (framed) { shot = new THREE.Vector3(...framed.pos); focusAt = new THREE.Vector3(...framed.at); }
        else if (st === "up" || st === "rod") {
          // over your right shoulder, down to the fish held at the surface beside the pier
          shot = from(0.95, -1.7, 2.25); focusAt = (landing.fish || rail).clone().lerp(rail, 0.35);
        } else if (st === "pick" || st === "in" || st === "done" || st === "deck") {
          // back a little and to the side: you and the net, on the deck or coming over the rail
          shot = from(0.85, -2.2, 2.35); focusAt = (landing.net || rail).clone().lerp(you, 0.45);
        } else if ((st === "lower" || st === "lead" || st === "haul" || st === "swim") && landing.water != null) {
          // the drop net, from out over the water and off to the side, a three-quarter view: the pier's face runs away at
          // an angle instead of filling the picture, and the rail (you, the rope) and the water (the net, the fish) are in
          // the one shot. (It was low and close, looking straight back at the wall: the wall filled the screen and the
          // net was a giant blur in front of it.) Letting it down and hauling it up: wide, rising with the net; the fish
          // led in: nearer, on the hoop; putting it back: on the fish as it swims off
          const wl = landing.water - out.at.y, hgt = Math.max(0.6, 1.1 - wl), net = landing.net || landing.fish || rail;
          if (st === "lead") { shot = from(-2.6, landing.edge + 2.3, wl + 1.35); focusAt = net.clone().lerp(landing.fish || net, 0.4); focusAt.y += 0.08; }
          // (putting it back: from just out over the rail, looking down, as you'd watch it go: the net at the foot of the
          // wall and the fish swimming off below you, out and down)
          else if (st === "swim") { shot = from(-1.6, landing.edge - 0.3, 2.5); focusAt = (landing.fish || net).clone().lerp(net, 0.3); focusAt.y = Math.max(focusAt.y, landing.water - 0.25); } // (from over the rail, watching it go: the focus held near the surface, so the view never stares straight down into the dark)
          else {
            const k = st === "haul" ? Math.max(0, Math.min(1, (net.y - landing.water) / hgt)) : 0;
            shot = from(-3.3, landing.edge + 3.5, wl + 0.42 * hgt + 0.9 + 0.5 * k); focusAt = net.clone().lerp(rail, 0.38 + 0.2 * k);
          }
          // (where the bank runs out further than the spot's edge, that low place is in the ground: stand there instead, at a
          // person's height over it, looking down to the water)
          { const fl = env.floorAt?.(shot.x, shot.z); if (fl != null && fl > landing.water + 0.25) shot.y = Math.max(shot.y, fl + 1.55); }
        } else if (st === "lower" || st === "lead" || st === "haul") {
          shot = from(-4.3, landing.edge + 0.5, 3.0); focusAt = rail.clone().lerp(landing.net || landing.fish || rail, 0.45);
        } else {
          // other ways of landing (swung in, a landing net, up the beach): behind you and a little to the side, the fish
          // and you both ahead
          // (off to your left and a little behind: from straight behind, your body hid the net and the fish in front of you)
          shot = from(-2.1, -0.7, 2.3); focusAt = (landing.net || landing.fish || rail).clone().lerp(you, 0.3);
        }
        if (!landShot) landShot = { since: t };
        // (putting it back is shortened: where it cuts to the fish in the water, the camera cuts too, rather than
        // gliding there across empty sea)
        const low = (x) => (x === "lower" || x === "lead" || x === "haul" || x === "swim") && landing.water != null;
        // (and down to the low shot by the water it cuts as well: gliding down there passed over open water)
        // (and into the first framed shot of a landing it cuts: gliding there from your own eyes, the view was turned down
        // towards the fish beside the wall the whole way, and for a second or two the picture was nothing but dark water
        // with a line across it. The cut lands on a shot already framed round you, the rail and the fish)
        const firstFramed = framed && !landShot.stage && !landShot.framed;
        const cutTo = firstFramed || (!framed && ((out.release && st !== "deck" && landShot.stage === "deck") || (landShot.stage && low(st) !== low(landShot.stage)))); // (and back up from it: climbing the wall it passed close over the deck)
        landShot.stage = st; landShot.framed = !!framed;
        landShot.pos = unblocked(out.at.clone().add(new THREE.Vector3(0, 1.6, 0)), shot); if (landing.water != null) landShot.pos.y = Math.max(landShot.pos.y, landing.water + 0.45); /* (never under the surface as the fish swims off) */ landShot.focus = focusAt; landShot.until = t; landShot.wide = framed ? framed.wide : st === "lower" || st === "haul" || st === "swim";
        anglers.get(localId)?.a.showTag(false);
        if (cutTo) {
          camPos.copy(landShot.pos); landShot.up = true; landShot.clear = true; const l = lookAt(camPos.toArray(), focusAt.toArray()); look.aim(l.yaw, Math.max(-1.15, Math.min(0.2, l.pitch))); for (let i = 0; i < 40; i++) look.step(0.1);
          if (framed) { landShot.fs = focusAt.clone(); landShot.fs0 = focusAt.clone(); landShot.p = 1; landShot.d0 = 0.5; landShot.fov = (framed.wide ? 60 : 52) * (camera.aspect < 0.8 ? 1.12 : 1); }
        }
        // out of your own head by going up first (never back through it), then round to the shot; your head shows once
        // the camera's clear of it
        const above = out.eye.clone().add(new THREE.Vector3(0, 0.95, 0));
        if (!landShot.clear) { landShot.via = above; if (mode !== "first" || camPos.distanceTo(out.eye) > 0.85) landShot.clear = true; }
        anglers.get(localId)?.a.setFirstPerson(mode === "first" && !landShot.clear);
      }
      if (!landing && t - landShot.until > 0.9) { landShot = null; anglers.get(localId)?.a.showTag(true); }
      else {
        if (landing) {
          if (mode === "first" && !landShot.up) { camPos.lerp(landShot.via, 1 - Math.exp(-dt * 4)); if (camPos.distanceTo(landShot.via) < 0.15) landShot.up = true; }
          else {
            // from one shot to the next over the top (a long way to go: higher on the way), never through you
            const far = camPos.distanceTo(landShot.pos), to = landShot.pos.clone(); to.y += Math.min(1.3, Math.max(0, far - 0.6) * (landShot.framed ? 0.15 : 0.45));
            camPos.lerp(to, 1 - Math.exp(-dt * (landShot.framed ? 2.4 : 2.6)));
          }
        }
        else {
          // back to where you were: in an arc over your shoulder (your head's out of the way in first person), facing the
          // water again
          if (!landShot.back) { landShot.back = camPos.clone(); if (mode === "first" || mode === "third") { const h = look.home; look.aim(h.yaw, h.pitch); } if (mode === "first") anglers.get(localId)?.a.setFirstPerson(true); }
          // (over your head and down into it: the body never fills the view on the way)
          const f = ease01((t - landShot.until) / 0.9), to = mode === "first" ? out.eye : camPos, over = to.clone().add(new THREE.Vector3(0, 0.95, 0));
          if (f < 0.6) camPos.copy(landShot.back).lerp(over, ease01(f / 0.6)); else camPos.copy(over).lerp(to, ease01((f - 0.6) / 0.4));
        }
        // (turned to the landing only once out of your head and on the way to the shot, never pitched down into the water
        // from where you stand, and not while you're steering the view yourself)
        // (down to the water when the net's down there: the shot's from beside you, not your own eyes looking down)
        // (a framed shot: what it looks at eases along with the camera, and the view is turned to it at once, so the two
        // never drift apart and leave the fish off the edge)
        // (on the way out from your eyes to the first shot, the view turns to it only as fast as the camera gets there, so
        // it never looks straight down into the water from beside your head)
        if (landing && landShot.framed) {
          // (starting from the fish itself, so it stays in the middle of the picture as the camera rises out of your head
          // and swings out over the water: it started from a point 6 m along your view, under the surface, and the
          // camera stared into the dark water on its way out)
          if (!landShot.fs) { landShot.fs0 = landing.fish ? landing.fish.clone() : landShot.focus.clone(); landShot.fs = landShot.fs0.clone(); landShot.p = 0; }
          if (mode === "first" && !landShot.up) { landShot.d0 = null; if (landing.fish) landShot.fs.copy(landing.fish); landShot.fs0.copy(landShot.fs); }
          else {
            const dNow = camPos.distanceTo(landShot.pos); landShot.d0 = Math.max(landShot.d0 || 0, dNow, 0.5);
            landShot.p = Math.max(landShot.p, 1 - dNow / landShot.d0);
            const want = landShot.p >= 0.97 ? landShot.focus : landShot.fs0.clone().lerp(landShot.focus, ease01(landShot.p / 0.97));
            landShot.fs.lerp(want, 1 - Math.exp(-dt * (landShot.p >= 0.97 ? 4 : 8)));
          }
        }
        if (landing && (mode !== "first" || landShot.up || landShot.framed) && performance.now() - look.touched > 1500) {
          const l = lookAt(camPos.toArray(), (landShot.framed ? landShot.fs : landShot.focus).toArray()); look.aim(l.yaw, Math.max(-1.15, Math.min(0.2, l.pitch)));
          if (landShot.framed) for (let i = 0; i < 6; i++) look.step(0.5);
        }
        // the view widens a little for the shot and narrows back as you return (no jump in zoom)
        const normalFov = look.fov * ((mode === "first" || mode === "free") && camera.aspect < 0.8 ? 1.15 : 1), shotFov = (landShot.wide ? 60 : 52) * (camera.aspect < 0.8 ? 1.12 : 1);
        landShot.fov = landShot.fov ?? normalFov; landShot.fov += ((landing ? shotFov : normalFov) - landShot.fov) * (1 - Math.exp(-dt * 3));
        camera.position.copy(camPos); camera.fov = landShot.fov; camera.updateProjectionMatrix();
        const d2 = new THREE.Vector3(Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), -Math.cos(look.yaw) * Math.cos(look.pitch));
        camera.lookAt(camera.position.clone().add(d2));
        if (camOverride) camera.position.copy(camOverride);
        lastMode = mode; return { yaw: look.yaw, pitch: look.pitch };
      }
    }
    if (!out) { camera.position.copy(pos); }
    else if (mode === "first" || mode === "free") {
      pos.copy(out.eye);
      if (mode === "free" && !reduceMotion) { pos.y += Math.sin(t * 1.4) * 0.008; pos.x += Math.sin(t * 0.7) * 0.004; } // breathing (in first person it's in your eye already, so the rod in your hands moves with it)
    } else if (mode === "third" || mode === "spectator") {
      // behind and a little to the side of the angler, orbiting as you drag; never inside a wall or a building
      const r = 4.2, h = 1.9;
      pos.set(out.at.x - Math.sin(yaw) * r + Math.cos(yaw) * 0.8, out.at.y + h, out.at.z + Math.cos(yaw) * r + Math.sin(yaw) * 0.8);
      pivot.copy(out.at).add(new THREE.Vector3(0, 1.5, 0)); pos = unblocked(pivot, pos);
    } else if (mode === "cinematic") {
      // a shot for the moment: the rod tip at a bite, side on for a fight, down at the water for a landing
      const key = `${out.phase}|${out.info.since}`;
      if (key !== lastPhaseKey) { lastPhaseKey = key; cineSince = t; }
      const [fx, fz] = [Math.sin(out.face), -Math.cos(out.face)], side = [-fz, fx];
      if (out.phase === "bite") { pos.set(out.at.x + side[0] * 1.6 + fx * 0.5, out.at.y + 1.5, out.at.z + side[1] * 1.6 + fz * 0.5); const l = lookAt(pos.toArray(), out.tip.toArray()); yaw = l.yaw; pitch = l.pitch; }
      else if (out.phase === "hooked") { const w = Math.sin((t - cineSince) * 0.15) * 0.8; pos.set(out.at.x - fx * 3.2 + side[0] * (1.6 + w), out.at.y + 2.8, out.at.z - fz * 3.2 + side[1] * (1.6 + w)); const mid = out.at.clone().lerp(out.cast, 0.45); mid.y = 0; const l = lookAt(pos.toArray(), mid.toArray()); yaw = l.yaw; pitch = l.pitch; }
      else if (out.phase === "landing") { const tgt = out.fishAt || out.tip; pos.set(out.at.x - fx * 1.6 + side[0] * 1.4, out.at.y + 2.1, out.at.z - fz * 1.6 + side[1] * 1.4); const l = lookAt(pos.toArray(), tgt.toArray()); yaw = l.yaw; pitch = l.pitch; }
      else { const a = out.face + Math.sin((t - cineSince) * 0.05) * 0.5; pos.set(out.at.x - Math.sin(a) * 6, out.at.y + 2.6, out.at.z + Math.cos(a) * 6); yaw = a; pitch = -0.15; }
      pivot.copy(out.at).add(new THREE.Vector3(0, 1.5, 0)); pos = unblocked(pivot, pos);
      camPos.lerp(pos, 1 - Math.exp(-dt * 1.5)); pos = camPos.clone();
      if (leap) { const l = lookAt(camPos.toArray(), leap.toArray()); yaw = l.yaw; pitch = l.pitch; } // a leap: turn to it, quicker
      if (!cineShot) cineShot = { yaw, pitch };
      const ck = 1 - Math.exp(-dt * (leap ? 5 : 2));
      cineShot.yaw = wrap(cineShot.yaw + wrap(yaw - cineShot.yaw) * ck); cineShot.pitch += (pitch - cineShot.pitch) * ck;
      yaw = cineShot.yaw; pitch = cineShot.pitch;
    }
    // switching who you watch glides the camera across rather than cutting
    if (mode !== lastMode) { lastMode = mode; modeSince = t; }
    // switching between first and third person glides over half a second rather than cutting
    const settling = t - modeSince < 0.6;
    if (mode !== "cinematic") { camPos.lerp(pos, (mode === "first" || mode === "free") && !settling ? 1 : 1 - Math.exp(-dt * (mode === "spectator" ? 2.5 : settling ? 9 : 6))); cineShot = null; }
    // (never steered steeply down: a fish close in under the pier would tip the view down into the water)
    if (steerTo && idle && mode !== "cinematic") { const l = lookAt(camPos.toArray(), steerTo.toArray()); look.aim(l.yaw, Math.max(fpDown ? -1.38 : -0.5, Math.min(fpDown ? -0.3 : 0.6, l.pitch)), fpDown ? (out?.kept === "inspect" ? 3 : 1.6) : 0); steering = fpDown ? "down" : true; } // (lifting the fish up to look at it, your eyes follow it up a little quicker: looking down at the net while it came up, it passed up through the view a hand's length away) // (landing it yourself, your head turns at a head's pace, about 90 degrees a second at most)
    else if (steering && idle && !steerTo) { const was = steering; steering = false; const h = look.home; if (mode === "first" || mode === "third") look.aim(h.yaw, h.pitch, was === "down" ? 1.6 : 0); } // (back up from the deck at the same head's pace: it snapped up in a tenth of a second)
    yaw = mode === "cinematic" ? yaw : look.yaw; pitch = mode === "cinematic" ? pitch : look.pitch;
    if (camOverride) camPos.copy(camOverride); // test hook only: a fixed viewpoint for visual checks
    camera.position.copy(camPos);
    // a portrait phone sees little side to side; first person widens the view a little so the rod and reel fit
    camera.fov = look.fov * ((mode === "first" || mode === "free") && camera.aspect < 0.8 ? 1.15 : 1) * jumpZoom; camera.updateProjectionMatrix();
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(camOverride && lookOverride ? lookOverride : camera.position.clone().add(d));
    for (const [id, x] of anglers) x.a.setFirstPerson((mode === "first" || mode === "free") && id === (focus?.a.id));
    return { yaw, pitch };
  }

  // ---- the loop ----
  let raf = 0, last = 0, visible = true, slow = 0, onFrame = null, clock0 = performance.now(), nowFn = Date.now;
  const vis = () => { visible = document.visibilityState !== "hidden"; };
  document.addEventListener("visibilitychange", vis);
  // steady frame pacing on a phone: if frames keep coming late (the GPU can't keep up at this sharpness), draw at a
  // slightly lower resolution, a step at a time, and back up again once there's room. Better an even 60 (or 30) than
  // a jerky one
  // (late: under about 28 frames a second. It used to count anything under 42 as late, so a steady 40 on a good
  // phone, or a busy moment, sent the picture down to one pixel per pixel for good, which is what made it look blocky.
  // It never goes below the setting's floor; at the floor, the ambient occlusion goes first)
  let dprFloor = Math.min(dprMax, Q.floor || 1), dprNow = dprMax, late = 0, paceAt = 0, easyFor = 0;
  function pace(ts, dt) {
    late = late * 0.96 + (dt > (Q.late || 0.036) ? 1 : 0) * 0.04;
    if (ts - paceAt < 2000) return; paceAt = ts;
    if (late > 0.4 && dprNow > dprFloor) { dprNow = Math.max(dprFloor, dprNow - 0.25); renderer.setPixelRatio(dprNow); resize(); late = 0.2; easyFor = 0; }
    else if (late > 0.4 && post?.dropAO()) { late = 0.2; easyFor = 0; }
    else if (late < 0.05 && dprNow < dprMax) { easyFor += 2; if (easyFor >= (Q.easy || 20)) { dprNow = Math.min(dprMax, dprNow + 0.25); renderer.setPixelRatio(dprNow); resize(); easyFor = 0; } }
    else easyFor = 0;
  }
  // ---- frame-rate limit (Settings → Graphics: 30, 60 or as fast as the screen goes) and the frame-time record ----
  // (the record: the last 240 frame times, for the FPS display's average and its 1% low, the slowest frame in a hundred)
  let fpsCap = 0; const ft = new Float32Array(240); let ftN = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!visible || film) return;
    // (a little early is fine: the screen's own beat decides when it shows, so this only skips every other one at 30)
    if (fpsCap && last && ts - last < 1000 / fpsCap - 3) return;
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts;
    if (dt > 0) ft[ftN++ % 240] = dt * 1000;
    // (the resolution is changed before this frame is drawn, never after: resizing the canvas clears it, and done after
    // drawing, the blank canvas was what the phone showed for that frame, a grey flash mid-fight)
    pace(ts, dt);
    tick((ts - clock0) / 1000, nowFn(), dt);
  }
  // ---- the sky as light and reflection: the sky itself (its gradient, sun glow and clouds; the sea below the horizon,
  // environment.js envSky) made into an environment map whenever the light has changed enough (at most every 90 frames,
  // about one and a half seconds, while it eases: a few milliseconds each on a phone), so glass, wet concrete, puddles, metal railings and the reel catch the sky you see, and the shaded
  // side of a building is lit by it rather than going flat grey ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), env.envSky));
  let envRT = null, envKey = "", envWait = 0;
  function skyLight(s, force = false) {
    if (!s) return;
    const key = [s.day, s.dusk, s.night, s.cloud, s.rain].map((v) => Math.round(v * 6)).join(",");
    if (envWait > 0) envWait--;
    if (key === envKey || (envWait > 0 && !(force && !envRT))) return; envKey = key; envWait = 90;
    const rt = pmrem.fromScene(envScene, 0.02);
    scene.environment = rt.texture;
    envRT?.dispose(); envRT = rt;
  }
  // tone mapping: Khronos PBR Neutral keeps colours true (a dusk sky gold rather than orange, the sea its own colour)
  // and keeps detail in the shadows; exposure follows the light as it eases (the eye adapts: dusk and night aren't black)
  function adapt(force = false) {
    const L2 = env.light; if (!L2) return;
    renderer.toneMappingExposure = L2.exposure; scene.environmentIntensity = L2.envIntensity;
    if (env.waterUniforms.uExpo) env.waterUniforms.uExpo.value = L2.exposure; // (the sky and sea undo it under post)
    skyLight(env.current, force);
  }

  function setEnvAll({ light, cond, facing = 180 } = {}) {
    const s = env.setEnv({ light, cond, facing });
    adapt(true);
    envState = { swell: env.waterUniforms.uSwell.value, wind: s.wind, windDir: [env.waterUniforms.uWindDir.value.x, env.waterUniforms.uWindDir.value.y], kind, rain: s.rain || 0 };
    return s;
  }

  // test hook (never used by the app): a test sets FILM before loading, then freezes the clock and steps it
  // a set time per frame, so an animation can be filmed exactly even where frames are slow (software graphics)
  let film = null;
  if (typeof window !== "undefined" && FILM) {
    window.__fdWorld = { Raycaster: THREE.Raycaster, renderer, environment: env, THREE,
      freeze() { film = { t: (performance.now() - clock0) / 1000, now: nowFn() }; },
      // for visual checks: your angler driven by a scripted event log (its times in seconds from now on the film clock),
      // so every phase plays through the real animation code from a known start, frame for frame the same each run:
      // play([["cast", 0], ["hooked", 4], ["catch", 20, { species, lengthCm }]], { species, lengthCm })
      play(list, hint = null) { if (!film) this.freeze(); const t0 = film.now; script = list ? list.map(([type, s, data]) => ({ type, t: t0 + s * 1000, data: data || null })) : null; scriptHint = hint; const me = anglers.get(localId); me?.a.setEvents(script || []); if (hint) me?.a.setHint(hint); },
      // the fight as the tray would send it: progress 0-1, tension 0-1.4, the handle's turns
      fightIn(f) { anglers.get(localId)?.a.setFight(f); },
      keep(state) { anglers.get(localId)?.a.keepFish(state); },
      // (single: one frame of that length, as a slow phone would draw it, rather than split into short steps)
      step(ms, single = false) { if (!film) return; const n = single ? 1 : Math.max(1, Math.ceil(ms / 50)); for (let i = 0; i < n; i++) { film.t += ms / n / 1000; film.now += ms / n; tick(film.t, film.now, ms / n / 1000, i === n - 1); } },
      get mode() { return mode; },
      // for visual checks: the weather and light as given (eased in: step the clock a few seconds after)
      env(light, cond) { return setEnvAll({ light, cond }); },
      // for visual checks: turn the view to a compass heading (degrees; a real place has north up) and pitch at once
      view(yawDeg, pitch = -0.08) { const s = look.state(); look.aim((yawDeg * Math.PI) / 180, pitch); for (let i = 0; i < 40; i++) look.step(0.1); look.drag(0, 0); look.end(); return { yaw: look.yaw, pitch: look.pitch, was: s.yaw }; },
      get camera() { return camera; },
      buildMs,
      at(x, y, z, look) { camOverride = x == null ? null : new THREE.Vector3(x, y, z); lookOverride = look ? new THREE.Vector3(...look) : null; },
      get walker() { return W ? { x: W.x, y: W.y, z: W.z, face: W.face, speed: W.speed } : null; },
      walkInput(x, y, sprint = false) { walkIn = { x, y, sprint }; },
      get fight() { return lastFight; },
      // for visual checks: a ring on the water, as a fish or the net makes one
      ripple(x, z, s) { ripple({ x, z }, s); },
      get stats() { const r = renderer.info.render, m = renderer.info.memory; return { dpr: dprNow, post: post ? post.level : 0, ao: !!post?.ao, late: +late.toFixed(2), calls: r.calls, triangles: r.triangles, geometries: m.geometries, textures: m.textures, programs: renderer.info.programs?.length }; },
      get yaw() { return look.yaw; },
      get lag() { return film ? nowFn() - film.now : 0; },
      get scene() { return scene; },
      floor(x, z) { return env.floorAt ? env.floorAt(x, z) : null; },
      get me() { const x = anglers.get(localId); return x?.out ? { at: x.out.at.toArray(), face: x.out.face, phase: x.out.phase, land: x.out.land ? { stage: x.out.land.stage, net: x.out.land.net?.toArray().map((v) => +v.toFixed(2)), water: x.out.land.water } : null } : null; },
      ground: env.ground,
      // for framing checks: is a world point hidden from the camera by the pier, a wall or a building?
      blocked(p) { const to = new THREE.Vector3(...p).sub(camera.position), d = to.length(); if (d < 0.05 || !solids.length) return false; const rc = new THREE.Raycaster(camera.position.clone(), to.normalize(), 0.05, d - 0.25); return rc.intersectObjects(solids, false).length > 0; },
    };
  }
  function tick(t, now, dt, draw = true) {
    const t0 = performance.now(); clockT = t;
    const outs = {};
    if (env.waveState) envState = { ...envState, ...env.waveState() }; // the sea as the water shows it (conditions ease in)
    // walking about: the stick moves the walker, the angler follows it
    let walkInfo = null;
    if (W) {
      const me = anglers.get(localId);
      if (!me) { W = null; look.setPitchRange(); look.setBaseFov(null); }
      else {
        // in small steps (never through a railing), however slowly the phone draws
        let rem = Math.min(0.25, dt || 0.016);
        // what moves you: the stick, else auto-walk (straight ahead where you look), else a point you tapped
        let input = walkIn, camYaw = look.yaw;
        const stick = Math.hypot(walkIn.x, walkIn.y) > 0.12;
        if (stick) { autoWalk = false; walkTarget = null; }
        else if (autoWalk) input = { x: 0, y: 1, sprint: walkIn.sprint };
        else if (walkTarget) {
          const dx = walkTarget.x - W.x, dz = walkTarget.z - W.z, d = Math.hypot(dx, dz);
          if (d < 0.45) walkTarget = null;
          else { camYaw = Math.atan2(dx, -dz); input = { x: 0, y: Math.min(1, 0.45 + d * 0.25), sprint: false }; }
        }
        const x0 = W.x, z0 = W.z, wasAir = W.air;
        const ph0 = W.phase;
        while (rem > 1e-4) { const h = Math.min(0.05, rem); W = stepWalker(W, { ...input, camYaw, jump: walkJump }, h, env.ground); walkJump = false; rem -= h; }
        // a footstep each time a foot comes down (quicker as you speed up, softer at a stroll), on this ground; and the
        // landing from a jump
        void ph0;
        const moved = Math.hypot(W.x - x0, W.z - z0); gait = stepGait(gait, moved, W.speed || 0, W.air);
        const under = surfaceFor(venue, env.ground.surfaceAt?.(W.x, W.z), envState.rain || 0);
        if (gait.fall) onSound?.(gait.fall.run ? "stepRun" : "step", new THREE.Vector3(W.x, W.y, W.z), localId, { hard: gait.fall.hard, surface: under.kind, wet: under.wet });
        if (wasAir && !W.air) onSound?.("stepRun", new THREE.Vector3(W.x, W.y, W.z), localId, { hard: 1, surface: under.kind, wet: under.wet, land: true });
        // never through someone else (Fish Together): pushed round them, as long as that's somewhere you can stand
        const near = othersAt();
        if (near.length) { const p = keepApart(W.x, W.z, near); if ((p.x !== W.x || p.z !== W.z) && env.ground.walkable(p.x, p.z)) W = { ...W, x: p.x, z: p.z }; }
        // tapped somewhere you can't get to: give up rather than push against the rail for ever
        if (walkTarget || autoWalk) { walkStuck = Math.hypot(W.x - x0, W.z - z0) < 0.004 ? walkStuck + (dt || 0.016) : 0; if (walkStuck > 0.6) { walkTarget = null; autoWalk = false; walkStuck = 0; } }
        // what's close ahead, up where a carried rod goes (a wall, the lighthouse): the rod is held more upright to clear it
        if (++aheadN % 3 === 0) { if (solids.length) { ray.set(new THREE.Vector3(W.x, W.y + 1.4, W.z), new THREE.Vector3(Math.sin(W.face), 0.4, -Math.cos(W.face)).normalize()); ray.far = 4; const h = ray.intersectObjects(solids, false)[0]; aheadD = h ? h.distance * 0.92 : null; } else aheadD = null; }
        W.ahead = aheadD;
        me.a.setWalk(W);
        if (++fishTest % 8 === 0) { const edge = !!env.ground.fishHere(W.x, W.z); crowded = edge && !roomToFish(W.x, W.z, othersAt()); canFish = edge && !crowded; }
        walkInfo = { on: true, canFish, crowded, sprint: !!walkIn.sprint, auto: autoWalk, going: !!walkTarget };
        onPose?.({ x: W.x, y: W.y, z: W.z, face: W.face, speed: W.speed, air: W.air });
      }
    }
    // the view turns first, then your angler is posed from it: the rod and your hands in first person are placed from the
    // same view the camera then draws (they used to be placed from the frame before, and swam as the view turned)
    look.step(dt || 0.016);
    anglers.get(localId)?.a.setView(look.yaw, look.pitch);
    for (const [id, x] of anglers) { if (remote.has(id)) applyRemote(id, x, dt || 0.016); x.out = x.a.frame(t, now, dt || 0.016, envState); outs[id] = x.out; }
    // your landed fish stays in the net (or on the deck) until you've had a look and decided (Stage3D)
    let kept = null;
    const meK = anglers.get(localId);
    if (meK?.inspect && meK.out) {
      const key = meK.out.info?.since;
      if (meK.out.landed && meK.keptFor !== key) { meK.keptFor = key; meK.a.keepFish("deck"); }
      if (meK.out.kept && meK.out.kept !== "gone") kept = { state: meK.out.kept };
    }
    const view = updateCamera(t, dt || 0.016);
    // (gliding into first person: your body shows until the camera is nearly at your eyes, so no floating hands)
    if (camBlend) { applyBlend(); const me = anglers.get(localId); if (!W && me?.out?.eye && (mode === "first" || mode === "free") && camera.position.distanceTo(me.out.eye) > 0.7) me.a.setFirstPerson(false); }
    if (aimPower != null) { const pl = castPlanFor(aimPower); aimMark.visible = !!pl; if (pl) { aimMark.position.set(pl.point[0], 0.03, pl.point[1]); const k = (1.2 + pl.dist / 40) * (1 + 0.08 * Math.sin(t * 6)); aimMark.scale.set(k, 1, k); } } else aimMark.visible = false;
    // droplets fall back, rings spread
    for (let k = 0; k < DROPS; k++) {
      if (dropLife[k] <= 0) { dropPos[k * 3 + 1] = -50; continue; }
      dropV[k * 3 + 1] -= 9.8 * dt; dropPos[k * 3] += dropV[k * 3] * dt; dropPos[k * 3 + 1] += dropV[k * 3 + 1] * dt; dropPos[k * 3 + 2] += dropV[k * 3 + 2] * dt;
      if (dropPos[k * 3 + 1] < -0.05) dropLife[k] = 0;
    }
    dropGeo.attributes.position.needsUpdate = true;
    env.setRipples(stepRipples(ripples, dt));
    env.update(t, dt, camera); simT = t;
    adapt();
    if (draw) drawFrame();
    const spent = performance.now() - t0;
    if (!film) slow = slow * 0.97 + (spent > 22 ? 1 : 0) * 0.03;
    onFrame?.({ outs, view, slow, mode, focusId, localId, walk: walkInfo, kept });
  }
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1, h = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    post?.setSize(w, h); env?.resizeReflections?.(renderer);
  }
  resize();
  raf = requestAnimationFrame(frame);

  // ---- Settings → Graphics: what can change while playing, with nothing reloaded and the session left as it is ----
  // (the scene's own detail, the sea's mesh, the cloud shading and the people's textures come with the preset: those
  // need the place built again)
  const G = { res: 1, fps: 0, shadows: Q.shadows ? (Q.q >= 2 ? 2 : 1) : 0, shadowDist: 30, // (World3D applies the preset's own straight after: Ultra's far shadows)
    ao: post ? post.aoLevel : 0, bloom: post ? 1 : 0, aa: post ? 4 : 0, sharp: post ? post.sharp : 0, refl: 0, tex: maxAniso, sea: Q.sea ? 1 : 0 };
  function setGfx(o = {}) {
    if (o.res != null) { G.res = Math.max(0.5, Math.min(1, +o.res || 1)); dprMax = Math.max(1, dprTop * G.res); dprFloor = Math.min(dprMax, Q.floor || 1); dprNow = dprMax; renderer.setPixelRatio(dprNow); resize(); late = 0; easyFor = 0; }
    if (o.fps != null) { G.fps = [30, 60].includes(+o.fps) ? +o.fps : 0; fpsCap = G.fps; }
    if (o.tex != null) { G.tex = Math.max(1, Math.min(anisoCap, +o.tex || 1)); maxAniso = G.tex; texSeen = -1; sharpenAt = 60; }
    if (post) {
      if (o.ao != null) { G.ao = Math.max(0, Math.min(2, o.ao | 0)); post.setAO(G.ao); }
      if (o.bloom != null) { G.bloom = o.bloom ? 1 : 0; post.setBloom(!!G.bloom); }
      if (o.aa != null) { G.aa = o.aa >= 4 ? 4 : o.aa >= 2 ? 2 : 0; post.setAA(G.aa); }
      if (o.sharp != null) { G.sharp = Math.max(0, Math.min(1, +o.sharp || 0)); post.setSharp(G.sharp); }
      if (o.refl != null) { G.refl = Math.max(0, Math.min(2, o.refl | 0)); env.setReflections(G.refl, renderer); }
      if (o.sea != null) G.sea = env.setFftSea(!!o.sea, renderer) ? 1 : 0; // (the spectrum sea: Settings, or Ultra's default)
    }
    const sun = env.sun;
    if (sun && (o.shadows != null || o.shadowDist != null)) {
      const was = G.shadows;
      if (o.shadows != null) G.shadows = Math.max(0, Math.min(2, o.shadows | 0));
      if (o.shadowDist != null) G.shadowDist = [20, 30, 45, 80].includes(+o.shadowDist) ? +o.shadowDist : 30;
      const size = [0, 2048, 4096][G.shadows];
      if (size && sun.shadow.mapSize.x !== size) { sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(size, size); }
      const c = sun.shadow.camera, d = G.shadowDist; if (c.right !== d) { Object.assign(c, { left: -d, right: d, top: d, bottom: -d, far: Math.max(160, d * 3) }); c.updateProjectionMatrix(); }
      // (the map's texels grow with the box: the biases grow with them, or the wider boxes show acne on the deck)
      sun.shadow.normalBias = 0.02 * Math.max(1, d / 30) * (G.shadows === 2 ? 0.6 : 1); sun.shadow.bias = -0.0005 * Math.max(1, d / 45);
      if (!!was !== !!G.shadows) {
        renderer.shadowMap.enabled = !!G.shadows; sun.castShadow = !!G.shadows;
        if (G.shadows) Object.assign(sun.shadow, { bias: -0.0005, normalBias: 0.02 });
        // (every material is made again once, for its shadow lookups: a short pause, only when shadows go on or off)
        scene.traverse((x) => { if (x.material) [].concat(x.material).forEach((m) => { m.needsUpdate = true; }); });
      }
    }
    return { ...G };
  }

  return {
    look, camera,
    setGfx,
    get gfx() { return { ...G, post: !!post, anisoCap, dprTop, dpr: dprNow }; },
    /** for the FPS display: the last few seconds' average, 1% low and frame time, and this frame's drawing work */
    perf() {
      const n = Math.min(ftN, 240); if (!n) return null;
      const a = Array.from(ft.subarray(0, n)).sort((x, y) => x - y), mean = a.reduce((s2, v) => s2 + v, 0) / n, worst = a[Math.min(n - 1, Math.floor(n * 0.99))];
      const r = renderer.info.render;
      let gpu = null; if (gpuN) { const m = Math.min(gpuN, 60); let s2 = 0; for (let i = 0; i < m; i++) s2 += gpuT[i]; gpu = +(s2 / m).toFixed(1); }
      // texture memory, estimated from each texture's size (with its mip chain): what the card holds for this scene
      let texMB = 0; try { const seen = new Set(); scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const k in m) { const t = m[k]; if (t && t.isTexture && !seen.has(t)) { seen.add(t); const im = t.image; const w = im?.width || im?.videoWidth || 0, h = im?.height || im?.videoHeight || 0; texMB += (w * h * 4 * (t.generateMipmaps ? 1.333 : 1)) / 1048576; } } }); } catch { texMB = 0; }
      return { fps: Math.round(1000 / mean), low: Math.round(1000 / worst), ms: +mean.toFixed(1), gpu, calls: r.calls, tris: r.triangles, dpr: dprNow, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, texMB: Math.round(texMB), gpuName: gpuName(), preset: Q === QUALITY3D.ultra ? "ultra" : Q === QUALITY3D.high ? "high" : Q === QUALITY3D.performance ? "performance" : "balanced", res: [renderer.domElement.width, renderer.domElement.height] };
    },
    setAnglers,
    realCheck,
    /** The checked arrival positions and what was wrong with any that moved or were left out (spawn.js). */
    spawn: { spots: L.spots.map(({ id, name, at, face, movedBy }) => ({ id, name, at, face, movedBy: movedBy || 0 })), report: spawn.report },
    /** Where your own angler stands now. */
    get mySpot() { const me = anglers.get(localId); const s = me?.a.spot; return s ? { id: s.id, name: s.name, at: s.at, face: s.face } : null; },
    setNow(f) { nowFn = f || Date.now; },
    setEnv: setEnvAll,
    /** Every frame time since frame `since` (ms, oldest first) and the count so far, for percentiles over a whole
     *  benchmark run rather than the last few seconds: callers keep `n` and ask again. (240 frames are kept: ask at
     *  least every two seconds at 120 fps.) */
    frameTimes(since = 0) { const n = ftN, from = Math.max(since, n - 240), out = []; for (let i = from; i < n; i++) out.push(ft[i % 240]); return { n, times: out }; },
    /** For the developer diagnostics panel (dev mode only): where the camera is and looks, the light and weather in
     *  force, how long the place took to build and what has loaded. Numbers only, nothing that identifies a person. */
    diag() {
      const d = new THREE.Vector3(); camera.getWorldDirection(d);
      const yaw = Math.atan2(d.x, -d.z), pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
      const L2 = env.current || {}, me = anglers.get(localId)?.out;
      return {
        cam: camera.position.toArray().map((v) => +v.toFixed(2)), yawDeg: Math.round((yaw * 180) / Math.PI), pitchDeg: Math.round((pitch * 180) / Math.PI), fov: +camera.fov.toFixed(1), mode,
        light: { day: +((L2.day ?? 0).toFixed(2)), dusk: +((L2.dusk ?? 0).toFixed(2)), night: +((L2.night ?? 0).toFixed(2)), cloud: +((L2.cloud ?? 0).toFixed(2)), rain: +((L2.rain ?? 0).toFixed(2)), exposure: +renderer.toneMappingExposure.toFixed(2) },
        sea: { swell: +envState.swell.toFixed(2), wind: +envState.wind.toFixed(2), windDir: envState.windDir.map((v) => +v.toFixed(2)) },
        buildMs, phase: me?.phase || null, at: me ? me.at.toArray().map((v) => +v.toFixed(1)) : null,
        programs: renderer.info.programs?.length || 0,
      };
    },
    /** Walk about (true) or stand at your spot again (false). Returns null when it worked, or why not. */
    walk(on, { dist = "normal" } = {}) {
      const me = anglers.get(localId);
      if (on) {
        if (W) return null;
        if (!env.ground) return "You can't walk about in this view.";
        if (!me) return "Join as an angler to walk about.";
        // free to walk once the line is in; with a fish on, a bite or a cast in the air, finish that first. With the
        // line just sitting in the water the page winds it in for you ("line")
        const ph = me.out?.phase, line = me.a.line;
        if (line === "hooked" || ph === "hooked") return "Land the fish first (or lose it): then walk about.";
        if (ph === "bite") return "Strike or let the bite go first.";
        if (ph === "cast") return "Wait for your cast to land.";
        if (ph === "landing" && !me.out.landed) return "Landing your fish: one moment.";
        if (line === "out") return "line";
        const p = me.a.root.position;
        W = walker(p.x, p.z, me.out?.face ?? 0, p.y); W.floor = (x, z) => env.ground.heightAt(x, z); modeBeforeWalk = mode === "walk" ? "first" : mode; mode = "walk";
        fovBeforeWalk = look.fov; look.setFov?.({ near: 40, far: 56 }[dist] || 47); look.aim(W.face, FOLLOW.pitch); canFish = !!env.ground.fishHere(W.x, W.z);
        // (from your eyes out to behind you as a glide; a drag turns the view by what the walking camera shows)
        followAt = 0; pivotY = null; pivotXZ = null; gait = { d: 0 }; look.setDragFov(WALK_FOV * 1.1); blendCamera(0.8);
        // (a comfortable range to look up and down while walking, no vertical flick; a double tap recentres behind you at
        // this distance rather than at the fishing view's)
        look.setPitchRange(WALK_PITCH.min, WALK_PITCH.max, false); look.setBaseFov(look.fov); look.setHome(W.face, WALK_PITCH.level);
        return null;
      }
      if (!W) return null;
      { const s0 = me?.a.spot, at = s0?.at; blendFor(s0?.face ?? look.yaw, at ? Math.hypot(at[0] - W.x, at[2] - W.z) : 0); } look.setDragFov(null); look.setPitchRange(); look.setBaseFov(null);
      W = null; autoWalk = false; walkTarget = null; me?.a.setWalk(null); onPose?.(null); mode = modeBeforeWalk; if (fovBeforeWalk) look.setFov?.(fovBeforeWalk);
      const s2 = me?.a.spot; if (s2) { look.setHome(s2.face, HOME_PITCH); look.aim(s2.face, HOME_PITCH); }
      return null;
    },
    get walking() { return !!W; },
    /** Someone talking (voice chat): a light above their head. */
    setSpeaking(id, on) { anglers.get(id)?.a.setSpeaking(on); },
    /** Aiming a cast while Cast is held: power 0..1 shows where it would land (null hides it). Returns the plan. */
    aimCast(power) { aimPower = power == null ? null : power; return power == null ? null : castPlanFor(power); },
    /** The cast for this power and where you're looking now: { dist, aim, power }, or null (not fishing here). */
    castParams(power) { const p = castPlanFor(power); return p ? { dist: p.dist, aim: p.aim, power: p.power } : null; },
    /** Your fight's state (tap reeling, reelModel.js): the 3D fish, rod and reel follow it. */
    setFight(f) { lastFight = f; anglers.get(localId)?.a.setFight(f); },
    /** Your own angler waves, cheers or claps. */
    emote(kind) { anglers.get(localId)?.a.emote(kind); },
    /** Your landed fish: hold it up for a look (inspect), keep it, or put it back. */
    inspectFish(on = true) { anglers.get(localId)?.a.keepFish(on ? "inspect" : "deck"); },
    keepFish() { anglers.get(localId)?.a.keepFish("gone"); },
    releaseFish() { anglers.get(localId)?.a.keepFish("release"); },
    /** A tap on the screen (-1..1 each way): was it your landed fish? */
    tapFish(nx, ny) {
      const me = anglers.get(localId); if (!me?.a.kept || me.a.kept === "gone") return false;
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
      if (rc.intersectObject(me.a.fishMesh, false).length) return true;
      // or near it on the screen (a small fish is hard to hit with a finger)
      const p = me.a.fishMesh.position.clone().project(camera); return Math.hypot(p.x - nx, (p.y - ny) * camera.aspect) < 0.16 && p.z < 1;
    },
    setWalkInput(i) { walkIn = { x: i.x || 0, y: i.y || 0, sprint: !!i.sprint }; },
    /** Keep walking ahead (where you look) until you touch the stick or bump into something. */
    autoWalk(on) { autoWalk = !!on && !!W; walkTarget = null; walkStuck = 0; },
    get autoWalking() { return autoWalk; },
    /** A tap while walking about (-1..1 each way): walk to that point on the ground. True if it was somewhere to go. */
    walkTo(nx, ny) {
      if (!W || !env.ground) return false;
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = solids.length ? rc.intersectObjects(solids, false).find((h) => (h.face?.normal ? h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.6 : true)) : null;
      let p = hit?.point;
      if (!p) { const t2 = (W.y - rc.ray.origin.y) / (rc.ray.direction.y || -1e-6); if (t2 > 0 && t2 < 60) p = rc.ray.origin.clone().addScaledVector(rc.ray.direction, t2); }
      if (!p || !env.ground.walkable(p.x, p.z) || Math.hypot(p.x - W.x, p.z - W.z) > 40) return false;
      walkTarget = { x: p.x, z: p.z }; autoWalk = false; walkStuck = 0; return true;
    },
    jump() { if (W) walkJump = true; },
    /** Fish from where you're standing: turns to the water's edge and makes it your spot. Returns the spot, or null. */
    fishHere() {
      const me = anglers.get(localId); if (!W || !me) return null;
      const sp = env.ground.fishHere(W.x, W.z); if (!sp || !roomToFish(W.x, W.z, othersAt())) return null;
      const spot = { ...me.a.spot, ...sp, id: me.a.spot?.id ?? 1, name: "Where you chose" };
      blendFor(spot.face); look.setDragFov(null); look.setPitchRange(); look.setBaseFov(null);
      me.a.place(spot); W = null; autoWalk = false; walkTarget = null; me.a.setWalk(null); onPose?.({ ...spot, spotAt: true }); mode = modeBeforeWalk === "walk" ? "first" : modeBeforeWalk; if (fovBeforeWalk) look.setFov?.(fovBeforeWalk);
      look.setHome(spot.face, HOME_PITCH); look.aim(spot.face, HOME_PITCH);
      return spot;
    },
    onPose(f) { onPose = f; },
    /** Someone else walking about (Fish Together): their pose, or null when they're back at their spot. */
    setRemotePose(id, pose) {
      if (id === localId) return;
      if (pose?.emote) { anglers.get(id)?.a.emote(pose.emote); return; }
      if (pose?.fight) { anglers.get(id)?.a.setFight(pose.fight); return; } // their fight as they reel it
      if (pose?.spotAt) { const x = anglers.get(id); remote.delete(id); if (x) { x.a.setWalk(null); x.a.place({ ...x.a.spot, at: pose.at, face: pose.face, edge: pose.edge, cast: pose.cast }); } return; }
      const r = remote.get(id) || {}; r.pose = pose; remote.set(id, r);
    },
    setTrack(on) { track = !!on && !reduceMotion; },
    /** the landing shot (the camera stepping back beside you to land a fish): on, or stay where you are */
    setLandShot(on) { landShotOn = !!on; },
    get track() { return track; },
    setMode(m) { mode = CAMERA_MODES.some((x) => x.id === m) ? m : "first"; if (mode === "first" || mode === "free") { const me = anglers.get(localId) || anglers.get(focusId); if (me?.out) look.aim(me.out.face, -0.12); } },
    get mode() { return mode; },
    focus(id) { if (anglers.has(id)) focusId = id; },
    get focusId() { return focusId; },
    /** turn to look at the rod tip, another angler, or the landed fish */
    lookAtRod() { const me = anglers.get(localId) || anglers.get(focusId); if (me?.out) { const l = lookAt(camera.position.toArray(), me.out.tip.clone().lerp(me.out.cast, 0.15).toArray()); look.aim(l.yaw, l.pitch); } },
    lookAtAngler(id) { const x = anglers.get(id); if (x?.out) { const tgt = x.out.at.clone(); tgt.y += 1.2; const l = lookAt(camera.position.toArray(), tgt.toArray()); look.aim(l.yaw, l.pitch); } },
    lookAtFish(id) { const x = anglers.get(id); const p = x?.out?.fishAt || x?.out?.tip; if (p) { const l = lookAt(camera.position.toArray(), p.toArray()); look.aim(l.yaw, l.pitch); } },
    /** keep turning to watch another angler (their rod, the fight and the landing) for a while; dragging takes over */
    follow(id, seconds = 60) { if (!anglers.has(id)) return; followId = id; followUntil = (performance.now() - clock0) / 1000 + seconds; },
    get followId() { return followId; },
    onFrame(f) { onFrame = f; },
    resize,
    /** the screen position (0..1) of a world point, or null when behind the camera */
    project(p) { const v = p.clone().project(camera); return v.z > 1 ? null : { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }; },
    snapshot() { drawFrame(); return canvas.toDataURL("image/jpeg", 0.9); },
    dispose() { envRT?.dispose(); pmrem.dispose(); cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); for (const x of anglers.values()) x.a.dispose(); env.dispose(); post?.dispose(); renderer.dispose(); },
  };
}
