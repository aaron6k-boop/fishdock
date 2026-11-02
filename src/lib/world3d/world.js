// ---- world: the 3D view (three.js): the place, the anglers, splashes, the camera and the loop ----
// Loaded only when someone opens the 3D view. Camera modes: first person (from your spot, rod in hand), third
// person (behind you), spectator (behind whoever you pick), cinematic (it chooses angles for bites, fights and
// landings) and free look. Looking round never pauses the fishing. Quality: Performance, Balanced or High Quality,
// chosen by Auto from the phone, and stepped down if frames run slow. Nothing is drawn while hidden.
import * as THREE from "three";
import { checkScene } from "./sceneCheck.js";
import { walker, stepWalker } from "./walker.js";
import { createEnvironment } from "./environment.js";
import { createAngler } from "./angler.js";
import { createLook, lookAt, wrap } from "./look.js";
import { layoutFor } from "./spots.js";

export const QUALITY3D = { performance: { dpr: 1.25, shadows: 0, q: 0.5 }, balanced: { dpr: 2, shadows: 1, q: 1 }, high: { dpr: 2, shadows: 1, q: 2 } };
export function autoQuality3d() {
  try {
    // iPhone Safari reports no memory and only a few cores, which put every iPhone (even the newest) on the lowest
    // setting: no antialiasing, one pixel per three and no shadows, so edges were jagged and everything soft. iPhones
    // from the last several years have strong graphics; they get the balanced setting
    const ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios) return "balanced";
    const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4; if (mem <= 2 || cores <= 4) return "performance"; if (mem >= 8 && cores >= 8) return "high";
  } catch { /* ignore */ }
  return "balanced";
}
export const HOME_PITCH = -0.09;
export const CAMERA_MODES = [
  { id: "first", label: "First person" }, { id: "third", label: "Third person" }, { id: "spectator", label: "Spectator" },
  { id: "cinematic", label: "Cinematic" }, { id: "free", label: "Free look" },
];

export function createWorld(canvas, { venue = "pier", quality = "balanced", onSound, onFeel, reduceMotion = false, real = null, pano = null, trackJumps = true } = {}) {
  const Q = QUALITY3D[quality] || QUALITY3D.balanced;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.q >= 1, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !!Q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 5000);
  const tBuild = performance.now();
  const env = createEnvironment(scene, { venue, quality: Q.q, real, pano });
  const buildMs = Math.round(performance.now() - tBuild);
  // the real place as built: fit to stand in? (sceneCheck.js; World3D shows the representative place if not)
  const realCheck = real && real.targets ? checkScene(real, real.targets) : null;
  if (realCheck && !realCheck.ok) console.warn("FishDock 3D: the real place failed its scene check", realCheck.why);
  // a real place brings its own fishing spots (on its pier or along its shore); in a 360° photo everyone stands
  // where the photo was taken, side by side, facing the water
  let L = real?.spots?.length === 4 ? { ...layoutFor(venue), spots: real.spots } : layoutFor(venue);
  if (pano) {
    const face = real?.spots?.[0]?.face ?? ((pano.heading || 0) * Math.PI) / 180, sx = Math.cos(face), sz = Math.sin(face);
    L = { ...L, deck: 1, spots: [0, 1, 2, 3].map((k) => { const off = [0, 3.5, -3.5, 7][k]; return { id: k + 1, name: L.spots[k]?.name || `Spot ${k + 1}`, at: [sx * off, 0.9, sz * off], face, cast: 26 }; }) };
  }
  const spotOf = (id) => L.spots.find((s) => s.id === id) || L.spots[0];
  const world = new THREE.Group(); scene.add(world);
  const look = createLook({ pitch: -0.12 });
  let homeFor = null;
  let mode = "first", focusId = null, localId = null, anglers = new Map(), envState = { swell: 0.3, wind: 0.3, windDir: [0.3, -1], kind: 0 };
  let followId = null, followUntil = 0, steering = false; // watching another angler's catch; the camera steering itself
  const kind = { pier: 0, beach: 0, estuary: 1, river: 2, lake: 3 }[venue] ?? 0;

  // ---- splashes (droplets) and rings on the water ----
  const DROPS = 260, dropPos = new Float32Array(DROPS * 3), dropV = new Float32Array(DROPS * 3), dropLife = new Float32Array(DROPS);
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
  // round, soft droplets (a radial sprite), not square points
  const dropTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.45, "rgba(240,248,252,.85)"); r.addColorStop(1, "rgba(240,248,252,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xf2f6f8, size: 0.09, map: dropTex, transparent: true, opacity: 0.95, depthWrite: false, alphaTest: 0.02 })); drops.frustumCulled = false; scene.add(drops);
  let dropHead = 0;
  function splash(at, size = 0.6) {
    const n = Math.round(30 * size + 10);
    for (let i = 0; i < n; i++) {
      const k = dropHead++ % DROPS, a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 2.2) * size;
      dropPos.set([at.x, Math.max(at.y, 0) + 0.02, at.z], k * 3); dropV.set([Math.cos(a) * sp * 0.6, 1.5 + Math.random() * 3 * size, Math.sin(a) * sp * 0.6], k * 3); dropLife[k] = 1;
    }
  }
  const ripples = [];
  const ripple = (at, s = 0.6) => { ripples.push([at.x, at.z, 0, s]); if (ripples.length > 8) ripples.shift(); };

  // ---- anglers ----
  function setAnglers(list) {
    const seen = new Set();
    for (const a of list) {
      seen.add(a.id);
      let x = anglers.get(a.id);
      const spot = spotOf(a.spot);
      // a new name (someone going "away" and coming back) only changes the label: rebuilding the angler would make
      // them jump and could play the moment they're in again
      if (x && x.spotId === a.spot && x.outfit === a.outfit && x.name !== a.name) { x.a.setName(a.name); x.name = a.name; }
      if (!x || x.spotId !== a.spot || x.outfit !== a.outfit) {
        if (x) x.a.dispose();
        // only your own angler is felt (other people's catches arrive as a party notification instead)
        const made = createAngler(world, { id: a.id, name: a.name, spot, venue, outfit: a.outfit ?? 0, local: !!a.local, real: !!a.real, rail: !!real && (venue === "pier" || venue === "estuary"), onSound: (n, p) => onSound?.(n, p, a.id), onFeel: a.local ? (n, d) => onFeel?.(n, d) : null });
        made.onSplash(splash); made.onRipple(ripple);
        x = { a: made, spotId: a.spot, outfit: a.outfit, name: a.name, out: null };
        anglers.set(a.id, x);
      }
      x.a.setEvents(a.events); x.a.setHint(a.fishHint || null); x.inspect = !!a.inspect && !!a.local;
      if (a.local) localId = a.id;
    }
    for (const [id, x] of anglers) if (!seen.has(id)) { x.a.dispose(); anglers.delete(id); }
    if (!focusId || !anglers.has(focusId)) focusId = localId || [...anglers.keys()][0] || null;
    const me = anglers.get(localId) || anglers.get(focusId);
    // start looking out the way the spot faces, a little down towards where the line goes in
    if (me && homeFor !== me.a.id) { homeFor = me.a.id; const s = spotOf(me.spotId); look.setHome(s.face, HOME_PITCH); look.aim(s.face, HOME_PITCH); }
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
  let camOverride = null, inspectFrom = null;
  // walking about (walker.js): the walker, the stick, a jump waiting, whether you can fish where you stand
  let W = null, walkIn = { x: 0, y: 0, sprint: false }, walkJump = false, canFish = false, fishTest = 0, modeBeforeWalk = "first", fovBeforeWalk = null, onPose = null;
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
    look.step(dt);
    const focus = anglers.get(mode === "spectator" ? focusId : localId) || anglers.get(focusId);
    const out = focus?.out;
    let pos = camPos.clone();
    let yaw = look.yaw, pitch = look.pitch;
    // the camera steers itself (unless you've turned it in the last few seconds): to follow your own fish while it's
    // fought and landed in first or third person, or another angler's catch you chose to watch
    const idle = performance.now() - look.touched > 2500;
    const watched = followId && anglers.get(followId)?.out;
    let steerTo = null;
    if (watched && t < followUntil) {
      const wo = watched, busy = wo.phase === "hooked" || wo.phase === "landing" || wo.phase === "bite";
      steerTo = busy ? (wo.fishAt || wo.rig || wo.tip) : wo.at.clone().add(new THREE.Vector3(0, 1.2, 0));
      if (wo.phase === "landing" && wo.landed) followUntil = Math.min(followUntil, t + 2.5);
    } else if (followId && t >= followUntil) followId = null;
    else if (out && focus?.a.local && (mode === "first" || mode === "third") && (out.phase === "hooked" || out.phase === "landing") && !(out.phase === "landing" && out.landed)) {
      steerTo = out.phase === "landing" ? (out.fishAt || out.rig) : (out.rig ? out.tip.clone().lerp(out.rig, 0.55) : null);
    }
    const leap = track && mode !== "free" && idle ? (watched && t < followUntil ? watched.jump : (mode === "first" || mode === "third" || mode === "spectator" || mode === "cinematic") ? out?.jump : null) : null;
    if (leap) steerTo = leap;
    // closer in for a far leap, so a 50 cm fish 40 m out is more than a few pixels (the camera zooms; the fish isn't scaled)
    jumpZoom += ((leap ? Math.max(0.4, Math.min(0.8, 12 / Math.max(1, camPos.distanceTo(leap)))) : 1) - jumpZoom) * (1 - Math.exp(-dt * (leap ? 3 : 1.5)));
    const mk = anglers.get(localId)?.out;
    if (mk?.keptAt && (mk.kept === "inspect" || mk.kept === "release")) {
      // looking at your fish: in front of you, a little to the side, looking back at it as you hold it up
      const [fx, fz] = [Math.sin(mk.face), -Math.cos(mk.face)], c = mk.kept === "inspect" ? mk.keptAt : inspectFrom || mk.keptAt;
      if (!inspectFrom) inspectFrom = mk.keptAt.clone();
      // (far enough back that you see the fish held up against you, like a catch photo, not your arm)
      const at0 = mk.at.clone().add(new THREE.Vector3(fx * 2.1 - fz * 0.45, 1.22, fz * 2.1 + fx * 0.45));
      camPos.lerp(at0, 1 - Math.exp(-dt * 4)); camera.position.copy(camPos);
      camera.fov = 44; camera.updateProjectionMatrix(); camera.lookAt(mk.kept === "release" ? mk.keptAt : c);
      return { yaw, pitch };
    } else inspectFrom = null;
    if (W) {
      // Roblox-style: the camera orbits behind you as you drag, closer or further as you pinch; very close is first person
      const dist = Math.max(0, ((look.fov - 28) / 50) * 9 + 0.4), tgt = new THREE.Vector3(W.x, W.y + 1.55, W.z);
      const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      if (dist < 1.1) { pos.copy(tgt).add(new THREE.Vector3(0, 0.07, 0)); anglers.get(localId)?.a.setFirstPerson(true); }
      else { pos.copy(tgt).addScaledVector(d, -dist); pivot.copy(tgt); pos = unblocked(pivot, pos); anglers.get(localId)?.a.setFirstPerson(false); }
      camPos.copy(pos); camera.position.copy(camPos); camera.fov = 62 * (camera.aspect < 0.8 ? 1.1 : 1); camera.updateProjectionMatrix();
      camera.lookAt(camera.position.clone().add(d));
      return { yaw, pitch };
    }
    if (!out) { camera.position.copy(pos); }
    else if (mode === "first" || mode === "free") {
      pos.copy(out.eye);
      if (!reduceMotion) { pos.y += Math.sin(t * 1.4) * 0.008; pos.x += Math.sin(t * 0.7) * 0.004; } // breathing
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
    if (mode !== "cinematic") { camPos.lerp(pos, mode === "first" || mode === "free" ? 1 : 1 - Math.exp(-dt * (mode === "spectator" ? 2.5 : 6))); cineShot = null; }
    if (steerTo && idle && mode !== "cinematic") { const l = lookAt(camPos.toArray(), steerTo.toArray()); look.aim(l.yaw, Math.max(-1.2, Math.min(0.6, l.pitch))); steering = true; }
    else if (steering && idle && !steerTo) { steering = false; const h = look.home; if (mode === "first" || mode === "third") look.aim(h.yaw, h.pitch); }
    yaw = mode === "cinematic" ? yaw : look.yaw; pitch = mode === "cinematic" ? pitch : look.pitch;
    if (camOverride) camPos.copy(camOverride); // test hook only: a fixed viewpoint for visual checks
    camera.position.copy(camPos);
    // a portrait phone sees little side to side; first person widens the view a little so the rod and reel fit
    camera.fov = look.fov * ((mode === "first" || mode === "free") && camera.aspect < 0.8 ? 1.15 : 1) * jumpZoom; camera.updateProjectionMatrix();
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(camera.position.clone().add(d));
    for (const [id, x] of anglers) x.a.setFirstPerson((mode === "first" || mode === "free") && id === (focus?.a.id));
    return { yaw, pitch };
  }

  // ---- the loop ----
  let raf = 0, last = 0, visible = true, slow = 0, onFrame = null, clock0 = performance.now(), nowFn = Date.now;
  const vis = () => { visible = document.visibilityState !== "hidden"; };
  document.addEventListener("visibilitychange", vis);
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!visible || film) return;
    const dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts;
    tick((ts - clock0) / 1000, nowFn(), dt);
  }
  // ---- the sky as light and reflection: a soft gradient (sky above, haze at the horizon, the ground below) made into
  // an environment map once per change of light, so glass, wet concrete, metal railings and the reel catch the sky,
  // and the shaded side of a building is lit by it rather than going flat grey ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(), envGeo = new THREE.SphereGeometry(50, 32, 16), envCol = new Float32Array(envGeo.attributes.position.count * 3);
  envGeo.setAttribute("color", new THREE.BufferAttribute(envCol, 3));
  envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  let envRT = null, envKey = "";
  function skyLight(s) {
    const key = [s.day, s.dusk, s.night, s.cloud].map((v) => Math.round(v * 10)).join(",");
    if (key === envKey) return; envKey = key;
    const top = new THREE.Color(0.32, 0.5, 0.82).multiplyScalar(s.day).add(new THREE.Color(0.32, 0.3, 0.48).multiplyScalar(s.dusk)).add(new THREE.Color(0.02, 0.025, 0.05).multiplyScalar(s.night)).lerp(new THREE.Color(0.55, 0.57, 0.6).multiplyScalar(s.day + s.dusk * 0.5 + s.night * 0.05), s.cloud * 0.7);
    const hz = new THREE.Color(0.78, 0.84, 0.9).multiplyScalar(s.day).add(new THREE.Color(0.95, 0.62, 0.42).multiplyScalar(s.dusk)).add(new THREE.Color(0.05, 0.05, 0.08).multiplyScalar(s.night));
    const low = new THREE.Color(0.3, 0.3, 0.29).multiplyScalar(s.day + s.dusk * 0.5 + s.night * 0.05);
    const p = envGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 50, c = y > 0 ? hz.clone().lerp(top, Math.pow(y, 0.6)) : hz.clone().lerp(low, Math.min(1, -y * 3)); envCol.set([c.r, c.g, c.b], i * 3); }
    envGeo.attributes.color.needsUpdate = true;
    const rt = pmrem.fromScene(envScene, 0.02);
    scene.environment = rt.texture; scene.environmentIntensity = 0.55;
    envRT?.dispose(); envRT = rt;
  }

  // test hook (never used by the app): a test sets window.__fdFilm before loading, then freezes the clock and steps it
  // a set time per frame, so an animation can be filmed exactly even where frames are slow (software graphics)
  let film = null;
  if (typeof window !== "undefined" && window.__fdFilm) {
    window.__fdWorld = {
      freeze() { film = { t: (performance.now() - clock0) / 1000, now: nowFn() }; },
      step(ms) { if (!film) return; const n = Math.max(1, Math.ceil(ms / 50)); for (let i = 0; i < n; i++) { film.t += ms / n / 1000; film.now += ms / n; tick(film.t, film.now, ms / n / 1000, i === n - 1); } },
      get mode() { return mode; },
      // for visual checks: turn the view to a compass heading (degrees; a real place has north up) and pitch at once
      view(yawDeg, pitch = -0.08) { const s = look.state(); look.aim((yawDeg * Math.PI) / 180, pitch); for (let i = 0; i < 40; i++) look.step(0.1); look.end(); return { yaw: look.yaw, pitch: look.pitch, was: s.yaw }; },
      get camera() { return camera; },
      buildMs,
      at(x, y, z) { camOverride = x == null ? null : new THREE.Vector3(x, y, z); },
    };
  }
  function tick(t, now, dt, draw = true) {
    const t0 = performance.now();
    const outs = {};
    if (env.waveState) envState = { ...envState, ...env.waveState() }; // the sea as the water shows it (conditions ease in)
    // walking about: the stick moves the walker, the angler follows it
    let walkInfo = null;
    if (W) {
      const me = anglers.get(localId);
      if (!me) W = null;
      else {
        W = stepWalker(W, { ...walkIn, camYaw: look.yaw, jump: walkJump }, Math.min(0.05, dt || 0.016), env.ground); walkJump = false;
        me.a.setWalk(W);
        if (++fishTest % 8 === 0) canFish = !!env.ground.fishHere(W.x, W.z);
        walkInfo = { on: true, canFish, sprint: !!walkIn.sprint };
        onPose?.({ x: W.x, y: W.y, z: W.z, face: W.face, speed: W.speed, air: W.air });
      }
    }
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
    // droplets fall back, rings spread
    for (let k = 0; k < DROPS; k++) {
      if (dropLife[k] <= 0) { dropPos[k * 3 + 1] = -50; continue; }
      dropV[k * 3 + 1] -= 9.8 * dt; dropPos[k * 3] += dropV[k * 3] * dt; dropPos[k * 3 + 1] += dropV[k * 3 + 1] * dt; dropPos[k * 3 + 2] += dropV[k * 3 + 2] * dt;
      if (dropPos[k * 3 + 1] < -0.05) dropLife[k] = 0;
    }
    dropGeo.attributes.position.needsUpdate = true;
    for (const r of ripples) r[2] += dt;
    while (ripples.length && ripples[0][2] > 6) ripples.shift();
    env.setRipples(ripples.map((r) => [r[0], r[1], r[2], r[3] * Math.max(0, 1 - r[2] / 6)]));
    env.update(t, dt, camera);
    if (draw) renderer.render(scene, camera);
    const spent = performance.now() - t0;
    if (!film) slow = slow * 0.97 + (spent > 22 ? 1 : 0) * 0.03;
    onFrame?.({ outs, view, slow, mode, focusId, localId, walk: walkInfo, kept });
  }
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1, h = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  raf = requestAnimationFrame(frame);

  return {
    look, camera,
    setAnglers,
    realCheck,
    setNow(f) { nowFn = f || Date.now; },
    setEnv({ light, cond, facing = 180 } = {}) {
      const s = env.setEnv({ light, cond, facing });
      skyLight(s);
      renderer.toneMappingExposure = 1 + 0.3 * s.dusk + 0.45 * s.night; // eyes adapt: dusk and night aren't black
      envState = { swell: env.waterUniforms.uSwell.value, wind: s.wind, windDir: [env.waterUniforms.uWindDir.value.x, env.waterUniforms.uWindDir.value.y], kind };
      return s;
    },
    /** Walk about (true) or stand at your spot again (false). Returns null when it worked, or why not. */
    walk(on) {
      const me = anglers.get(localId);
      if (on) {
        if (W) return null;
        if (!env.ground) return "You can't walk about in this view.";
        if (!me) return "Join as an angler to walk about.";
        const ph = me.out?.phase;
        if (ph && !["idle", "ended", "missed", "paused", "lost"].includes(ph) && !(ph === "landing" && me.out.landed)) return "Reel in first: you can walk about between casts.";
        const p = me.a.root.position;
        W = walker(p.x, p.z, me.out?.face ?? 0, p.y); modeBeforeWalk = mode === "walk" ? "first" : mode; mode = "walk";
        fovBeforeWalk = look.fov; look.setFov?.(47); look.aim(W.face, -0.22); canFish = !!env.ground.fishHere(W.x, W.z);
        return null;
      }
      if (!W) return null;
      W = null; me?.a.setWalk(null); mode = modeBeforeWalk; if (fovBeforeWalk) look.setFov?.(fovBeforeWalk);
      const s2 = me?.a.spot; if (s2) { look.setHome(s2.face, HOME_PITCH); look.aim(s2.face, HOME_PITCH); }
      return null;
    },
    get walking() { return !!W; },
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
    jump() { if (W) walkJump = true; },
    /** Fish from where you're standing: turns to the water's edge and makes it your spot. Returns the spot, or null. */
    fishHere() {
      const me = anglers.get(localId); if (!W || !me) return null;
      const sp = env.ground.fishHere(W.x, W.z); if (!sp) return null;
      const spot = { ...me.a.spot, ...sp, id: me.a.spot?.id ?? 1, name: "Where you chose" };
      me.a.place(spot); W = null; me.a.setWalk(null); mode = modeBeforeWalk === "walk" ? "first" : modeBeforeWalk; if (fovBeforeWalk) look.setFov?.(fovBeforeWalk);
      look.setHome(spot.face, HOME_PITCH); look.aim(spot.face, HOME_PITCH);
      return spot;
    },
    onPose(f) { onPose = f; },
    /** Someone else walking about (Fish Together): their pose, or null when they're back at their spot. */
    setRemotePose(id, pose) { if (id === localId) return; const r = remote.get(id) || {}; r.pose = pose; remote.set(id, r); },
    setTrack(on) { track = !!on && !reduceMotion; },
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
    snapshot() { renderer.render(scene, camera); return canvas.toDataURL("image/jpeg", 0.9); },
    dispose() { envRT?.dispose(); pmrem.dispose(); cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); for (const x of anglers.values()) x.a.dispose(); env.dispose(); renderer.dispose(); },
  };
}
