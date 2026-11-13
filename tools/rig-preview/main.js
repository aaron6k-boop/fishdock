// ---- the rig test page: the first-person arms (fpRig.js) on their own, outside the game ----
// The same rig, data and IK the game uses, posed the way angler.js poses it: holding the rod, winding the reel, the
// cast, the other grips, and looking about. Seen from first person, the front, the side, over the shoulder or freely,
// with the skeleton, the IK targets and the attachment points drawn over it, and the joints' numbers read out live.
// Built into one page by tools/build-rig-preview.mjs.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createFpRig, castAt, holdView, rodFrame, bodyUp, rigP0, setRigView } from "../../src/lib/world3d/fpRig.js";
import { RIG } from "../../src/lib/world3d/fpRigData.js";
import { wristAngles } from "../../src/lib/world3d/fpIk.js";

const $ = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const stage = $("stage"), canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x40382f, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-1.5, 3, 1.2); scene.add(sun);
const grid = new THREE.GridHelper(6, 30, 0x6f7f8c, 0x9aa7b1); grid.position.y = 0.03; scene.add(grid);
const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 60);
// (the free view: drag to go round the arms, scroll or pinch to come closer)
const orbit = { enabled: false, target: V(0, 1.2, -0.35), az: 0.9, el: 0.35, dist: 1.6, update() { camera.position.copy(this.target).add(V(Math.sin(this.az) * Math.cos(this.el), Math.sin(this.el), Math.cos(this.az) * Math.cos(this.el)).multiplyScalar(this.dist)); camera.lookAt(this.target); } };
{ const pts = new Map(); let pinch = 0;
  canvas.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!orbit.enabled || !pts.has(e.pointerId)) return; const [x0, y0] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) orbit.dist = Math.min(5, Math.max(0.3, orbit.dist * pinch / d)); pinch = d; return; }
    orbit.az -= (e.clientX - x0) * 0.008; orbit.el = Math.min(1.4, Math.max(-1.2, orbit.el + (e.clientY - y0) * 0.006)); });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; }; canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { if (!orbit.enabled) return; e.preventDefault(); orbit.dist = Math.min(5, Math.max(0.3, orbit.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false }); }

// ---- the equipment, drawn simply: the 12 ft pier rod, its handle, the reel and its knob ----
const mBlank = new THREE.MeshStandardMaterial({ color: 0x2870ec, roughness: 0.35 }), mHandle = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6 }), mReel = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.35, metalness: 0.5 });
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 18); unitCyl.translate(0, 0.5, 0);
const rodLen = 3.66, seatAt = 0.45;
const rod = new THREE.Group(); scene.add(rod);
const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0108, rodLen - 0.66, 12).translate(0, (rodLen - 0.66) / 2 + 0.66, 0), mBlank), handle = new THREE.Mesh(unitCyl, mHandle);
handle.scale.set(0.0168, 0.66, 0.0168); rod.add(blank, handle); // (the rod's own frame: butt at the origin, up its y)
const reel = new THREE.Group(); scene.add(reel); // (the reel's frame as the game's: x left, y up, z to the tip)
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.055, 24), mReel); body.rotation.x = Math.PI / 2; body.position.set(0, -0.076, 0.012);
const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 24), mBlank); spool.rotation.x = Math.PI / 2; spool.position.set(0, -0.076, 0.052);
const stem = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.016), mReel); stem.position.set(0, -0.032, 0.004);
const arm = new THREE.Mesh(unitCyl, mReel), knob = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.026, 16), mHandle); knob.rotation.z = Math.PI / 2;
reel.add(body, spool, stem, arm, knob);
const knobAt = (th) => { const r = (th * Math.PI) / 180; return V(...RIG.reel.hub).add(V(0, -RIG.reel.r * Math.cos(r), -RIG.reel.r * Math.sin(r))); };
function setKnob(th) { const k = knobAt(th), h = V(...RIG.reel.hub).setX(0.03); knob.position.copy(k); arm.position.copy(h); const d = k.clone().sub(h); arm.scale.set(0.0045, d.length(), 0.0045); arm.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); }
// props for the other grips
const mProp = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.8 }), prop = new THREE.Group(); scene.add(prop);

// ---- overlays ----
const overlay = new THREE.Group(); scene.add(overlay);
const dot = (c, r = 0.012) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); m.renderOrder = 10; overlay.add(m); return m; };
const marks = { tL: dot(0xff5a36), tR: dot(0xff5a36), eL: dot(0x2fb5a8, 0.014), eR: dot(0x2fb5a8, 0.014), sL: dot(0xf2c14e, 0.014), sR: dot(0xf2c14e, 0.014) };
const axes = [0, 1, 2].map(() => { const a = new THREE.AxesHelper(0.06); a.material.depthTest = false; a.renderOrder = 11; scene.add(a); return a; });
let skel = null;

// ---- the rig ----
const status = $("status");
const src = window.__fdRigGlb || "models/fp_rig.glb";
const rigP = fetch(src).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => new GLTFLoader().parse(ab, "", res, rej)));
let rig = null, R = null;
rigP.then((gltf) => {
  rig = createFpRig({ model: gltf, skinHex: 0xc99a74, coatHex: 0x2b3a4f }); scene.add(rig.group); rig.show(true); R = rig.internals;
  skel = new THREE.SkeletonHelper(R.scene); skel.material.depthTest = false; skel.renderOrder = 9; scene.add(skel);
  status.textContent = "Rig loaded: " + gltf.animations.map((a) => a.name).join(", ") + " clips";
}).catch((e) => { status.textContent = "The rig didn't load: " + (e?.message || e); });

// ---- state ----
const S = { mode: "hold", view: "fp", play: true, speed: 1, t: 0, pitch: null, yaw: 0, skel: true, ik: true, att: true };
const CYCLE = { hold: 4, reel: 4, cast: 3.2, grips: 8, look: 8 };
function place(pitch, yaw, key) {
  const eye = V(0, 1.6, 0), vf = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), vr = V(Math.cos(yaw), 0, Math.sin(yaw)), vu = V().crossVectors(vr, vf);
  const dir = vf.clone().multiplyScalar(Math.cos(key.e) * Math.cos(key.sw)).addScaledVector(vu, Math.sin(key.e)).addScaledVector(vr, Math.cos(key.e) * Math.sin(key.sw)).normalize();
  const h = holdView(), rest = vf.clone().multiplyScalar(Math.cos(h.e) * Math.cos(h.sw)).addScaledVector(vu, Math.sin(h.e)).addScaledVector(vr, Math.cos(h.e) * Math.sin(h.sw)).normalize(), up = bodyUp(vf, vu);
  return { eye, vf, vr, vu, dir, rest, up, reel: eye.clone().addScaledVector(vr, key.x).addScaledVector(vu, key.y).addScaledVector(vf, key.z), rq: rodFrame(dir, rest, up) };
}
const GRIPS = [["rope", "Drop net's rope"], ["hoop", "Drop net's ring"], ["pole", "Landing net's pole"], ["fish", "A fish in the hand"]];
let gripName = "";
function specsFor(P, th) {
  const k = knobAt(th).applyQuaternion(P.rq).add(P.reel), hub = V(...RIG.reel.hub).applyQuaternion(P.rq).add(P.reel);
  const seat = { at: P.reel.clone(), axis: P.dir.clone(), kind: "seat", sock: { pos: P.reel.clone(), quat: P.rq.clone() } };
  const crank = { at: k, axis: V(1, 0, 0).applyQuaternion(P.rq), kind: "crank", hub, spin: (th * Math.PI) / 180, sock: { pos: k.clone(), quat: P.rq.clone() } };
  return { seat, crank };
}
function propFor(name, P) {
  prop.clear(); const f = P.vf.clone().setY(0).normalize(), r = V(-f.z, 0, f.x), base = P.eye.clone().addScaledVector(f, 0.42).addScaledVector(r, -0.12).add(V(0, -0.42, 0));
  if (name === "rope") { const m = new THREE.Mesh(unitCyl, mProp); m.scale.set(0.006, 1.4, 0.006); m.position.copy(base).add(V(0, -0.9, 0)); prop.add(m); return { at: base.clone(), axis: V(0, 1, 0), palm: f.clone().negate().addScaledVector(r, 0.3), kind: "rope" }; }
  if (name === "hoop") { const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.008, 8, 48), mProp); m.rotation.x = Math.PI / 2; const c = base.clone().addScaledVector(r, 0.3).add(V(0, -0.05, 0)); m.position.copy(c); prop.add(m); const at = c.clone().addScaledVector(r, -0.3); return { at, axis: f.clone(), palm: V(0, -1, 0), kind: "hoop" }; }
  if (name === "pole") { const d = f.clone().multiplyScalar(-1).add(V(0, -0.5, 0)).normalize(), m = new THREE.Mesh(unitCyl, mProp); m.scale.set(0.014, 2.0, 0.014); const at = base.clone().add(V(0, 0.05, 0)); m.position.copy(at).addScaledVector(d, 0.6); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().negate()); prop.add(m); return { at, axis: d.clone().negate(), palm: V(0, 1, 0), kind: "pole" }; }
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: 0x8b8f6a, roughness: 0.5 })); m.scale.set(0.3, 0.045, 0.03); const at = base.clone().addScaledVector(r, 0.06).add(V(0, 0.02, 0)); m.position.copy(at).add(V(0, 0.045, 0)); m.lookAt(at.clone().add(r).add(V(0, 0.045, 0))); m.rotateY(Math.PI / 2); prop.add(m);
  return { at, axis: r.clone(), palm: V(0, 1, 0), kind: "fish" };
}

// ---- each frame ----
const readout = $("readout");
function fmt(v, d = 0) { return (v >= 0 ? " " : "") + v.toFixed(d); }
function tick(dt) {
  const cyc = CYCLE[S.mode]; if (S.play) S.t = (S.t + dt * S.speed) % cyc; $("scrub").value = String(Math.round((S.t / cyc) * 1000));
  let pitch = S.pitch ?? -0.12, yaw = S.yaw;
  if (S.mode === "look") { const u = (S.t / cyc) * Math.PI * 2; pitch = -0.12 - 0.5 * Math.sin(u); yaw = 0.5 * Math.sin(u * 2); }
  const vfov = S.view === "fp" && stage.clientWidth < stage.clientHeight ? 62 * 1.27 : 62; setRigView(vfov);
  let key = holdView(), castT = null, th = 30, specs;
  if (S.mode === "cast") { castT = Math.min(S.t, 2.4); key = castAt(castT); }
  if (S.mode === "reel") th = (S.t * 360) % 360;
  const P = place(pitch, yaw, key), sp = specsFor(P, th);
  rod.position.copy(P.reel).addScaledVector(P.dir, -seatAt); rod.quaternion.setFromUnitVectors(V(0, 1, 0), P.dir);
  reel.position.copy(P.reel); reel.quaternion.copy(P.rq); setKnob(th);
  prop.visible = S.mode === "grips"; gripName = "";
  if (S.mode === "cast" && castT < 1.95) { const a = P.reel.clone().addScaledVector(P.dir, -seatAt + 0.065); specs = [{ at: a, axis: P.dir.clone(), palm: V(1, 0.2, 0), kind: "butt", sock: { pos: a.clone(), quat: rodFrame(P.dir, P.rest, P.up) } }, sp.seat]; }
  else if (S.mode === "grips") { const i = Math.floor((S.t / cyc) * GRIPS.length) % GRIPS.length; gripName = GRIPS[i][1]; specs = [propFor(GRIPS[i][0], P), sp.seat]; }
  else specs = [sp.crank, sp.seat];
  if (rig) {
    rig.pose({ hands: specs, eye: P.eye, vr: P.vr, vu: P.vu, vf: P.vf, dt: S.play ? dt * S.speed : 1 / 60, castT });
    const dbg = rig.debug, rows = [];
    ["L", "R"].forEach((side, i) => {
      const A = R.arm[side], sh = A.U.getWorldPosition(V()), el = A.F.getWorldPosition(V()), wr = A.H.getWorldPosition(V());
      const loc = { k: V(...RIG.loc[side].k), palm: V(...RIG.loc[side].palm), along: V(...RIG.loc[side].along) };
      const w = wristAngles(sh, el, wr, A.H.getWorldQuaternion(new THREE.Quaternion()), loc, side);
      marks["s" + side].position.copy(sh); marks["e" + side].position.copy(el); if (dbg[i].target) marks["t" + side].position.copy(dbg[i].target.pos);
      rows.push(`<tr><th scope="row">${side === "L" ? "Left" : "Right"}</th><td>${dbg[i].kind || "free"}</td><td>${fmt(w.flex)}</td><td>${fmt(w.rad)}</td><td>${fmt(w.pron)}</td><td>${w.elbow.toFixed(0)}</td><td>${(el.distanceTo(sh) / A.L1).toFixed(3)} / ${(wr.distanceTo(el) / A.L2).toFixed(3)}</td><td class="${dbg[i].short > 0.005 ? "warn" : ""}">${(dbg[i].short * 1000).toFixed(0)}</td></tr>`);
    });
    readout.innerHTML = rows.join("");
    axes[0].position.copy(P.reel); axes[0].quaternion.copy(P.rq);
    axes[1].position.copy(sp.crank.at); axes[1].quaternion.copy(P.rq);
    const b = P.reel.clone().addScaledVector(P.dir, -seatAt + 0.065); axes[2].position.copy(b); axes[2].quaternion.copy(rodFrame(P.dir, P.rest, P.up));
  }
  overlay.visible = S.ik; for (const a of axes) a.visible = S.att; if (skel) skel.visible = S.skel;
  $("moment").textContent = S.mode === "cast" ? `${castT.toFixed(2)} s into the cast${castT < 0.6 ? ": winding up" : castT < 0.85 ? ": driving forwards" : castT < 1.25 ? ": the release and follow-through" : castT < 1.95 ? ": following through" : ": the left hand back to the knob"}` : S.mode === "reel" ? `Knob at ${th.toFixed(0)}° round the reel (0 at the bottom, 90 back towards you)` : S.mode === "grips" ? gripName : S.mode === "look" ? `Looking ${(pitch * 57.3).toFixed(0)}° up or down, ${(yaw * 57.3).toFixed(0)}° round` : "The hold (Gate 1)";
  // the camera
  const w = stage.clientWidth, h = stage.clientHeight; if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); }
  camera.aspect = w / h; orbit.enabled = S.view === "free";
  if (S.view === "fp") { camera.fov = vfov; camera.near = 0.03; camera.position.copy(P.eye); camera.lookAt(P.eye.clone().add(P.vf)); }
  else if (S.view !== "free") { camera.fov = 40; const V3 = { front: [V(0.15, 1.45, -2.3), V(0, 1.2, -0.3)], side: [V(-2.0, 1.45, -0.55), V(0, 1.2, -0.35)], over: [V(0.55, 1.95, 0.75), V(0, 1.15, -0.55)] }[S.view]; camera.position.copy(V3[0]); camera.lookAt(V3[1]); }
  else orbit.update();
  camera.updateProjectionMatrix();
  renderer.setClearColor(new THREE.Color(css("--stage") || "#cfd8de"));
  renderer.render(scene, camera);
}
let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; tick(dt); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// ---- controls ----
function seg(id, key, after) {
  const el = $(id);
  el.addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; S[key] = b.dataset.v; for (const x of el.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b)); if (after) after(); });
}
seg("modes", "mode", () => { S.t = 0; }); seg("views", "view");
$("play").addEventListener("click", () => { S.play = !S.play; $("play").textContent = S.play ? "Pause" : "Play"; $("play").setAttribute("aria-pressed", String(!S.play)); });
$("speed").addEventListener("change", (e) => { S.speed = +e.target.value; });
$("scrub").addEventListener("input", (e) => { S.play = false; $("play").textContent = "Play"; S.t = (+e.target.value / 1000) * CYCLE[S.mode]; });
$("pitch").addEventListener("input", (e) => { S.pitch = (+e.target.value * Math.PI) / 180; $("pitchv").textContent = e.target.value + "°"; });
$("yaw").addEventListener("input", (e) => { S.yaw = (+e.target.value * Math.PI) / 180; $("yawv").textContent = e.target.value + "°"; });
for (const k of ["skel", "ik", "att"]) $(k).addEventListener("change", (e) => { S[k] = e.target.checked; });
$("pitch").value = String(Math.round((RIG.p0 * 180) / Math.PI)); $("pitchv").textContent = $("pitch").value + "°";
