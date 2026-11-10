// ---- night kit: the rod-tip light and the head torch ----
// The tip light is the small light anglers clip to the rod's tip for fishing in the dark: green while you wait, red
// when a fish is on (flashing for the bite itself, steady while it's hooked). By day the green is off; the red still
// shows, as a bite alarm's light does. The head torch is a lamp on your own head, white, red or green, pointing where
// you look. Neither changes how anything else is drawn.
import * as THREE from "three";

export const TORCHES = ["off", "white", "red", "green"];
export const TORCH_NAMES = { off: "Off", white: "White", red: "Red", green: "Green" };
const TORCH_HEX = { white: 0xfff1dc, red: 0xff2a1a, green: 0x39ff6a };
const GREEN = 0x35ff5e, RED = 0xff2414;

/**
 * What a rod's tip light shows. phase: the angler's phase; dark: 0 (day) to 1 (night); t: seconds; mode: "auto"
 * (green only in the dark), "on" or "off".
 * Returns { hex, level } (level 0: off).
 */
export function tipLightFor(phase, dark, t = 0, mode = "auto") {
  // (the demo's own Tip light setting: "off" is no light at all, "on" is the green by day as well)
  if (mode === "off") return { hex: GREEN, level: 0 };
  if (phase === "bite") return { hex: RED, level: Math.sin(t * 2 * Math.PI * 3) > -0.2 ? 1 : 0.25 }; // (three flashes a second)
  if (phase === "hooked" || phase === "landing") return { hex: RED, level: 1 };
  const d = Math.min(1, Math.max(0, (dark - 0.3) / 0.35));
  return { hex: GREEN, level: mode === "on" ? Math.max(0.7, d) : d };
}

function glowTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / (n / 2), a = Math.max(0, 1 - r), v = Math.pow(a, 2.2) * 0.75 + (r < 0.16 ? 0.25 : 0), i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(Math.min(1, v) * 255);
  }
  const tx = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); tx.needsUpdate = true; tx.magFilter = tx.minFilter = THREE.LinearFilter;
  return tx;
}

/** The lights for one scene. update(list, dark, t): list of { id, tip (world Vector3), phase }. */
export function createTipLights(scene) {
  const tex = glowTexture(), bulbGeo = new THREE.SphereGeometry(0.011, 10, 8), items = new Map();
  const make = () => {
    const bulbMat = new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });
    const glowMat = new THREE.SpriteMaterial({ map: tex, color: GREEN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat), glow = new THREE.Sprite(glowMat);
    bulb.frustumCulled = false; glow.renderOrder = 5; scene.add(bulb, glow);
    return { bulb, glow, bulbMat, glowMat };
  };
  return {
    update(list, dark, t, mode = "auto") {
      const seen = new Set();
      for (const a of list) {
        if (!a?.tip) continue; seen.add(a.id);
        let it = items.get(a.id); if (!it) { it = make(); items.set(a.id, it); }
        const s = tipLightFor(a.phase, dark, t, mode), on = s.level > 0.02;
        it.bulb.visible = it.glow.visible = on; if (!on) continue;
        it.bulb.position.copy(a.tip); it.glow.position.copy(a.tip);
        it.bulbMat.color.setHex(s.hex).multiplyScalar(0.35 + 0.65 * s.level);
        // (the glow round it: wide in the dark, small by day when only the red shows)
        const size = (0.05 + 0.16 * dark) * (0.6 + 0.4 * s.level);
        it.glow.scale.set(size, size, 1); it.glowMat.color.setHex(s.hex); it.glowMat.opacity = (0.35 + 0.5 * dark) * s.level;
      }
      for (const [id, it] of items) if (!seen.has(id)) { scene.remove(it.bulb, it.glow); it.bulbMat.dispose(); it.glowMat.dispose(); items.delete(id); }
    },
    get count() { return items.size; },
    dispose() { for (const it of items.values()) { scene.remove(it.bulb, it.glow); it.bulbMat.dispose(); it.glowMat.dispose(); } items.clear(); tex.dispose(); bulbGeo.dispose(); },
  };
}

/**
 * Your head torch: a spot of light from the camera along the view. set("off" | "white" | "red" | "green").
 * The light is always in the scene (dark when off), so switching it never makes the scene's materials rebuild.
 */
export function createHeadTorch(scene, camera) {
  const light = new THREE.SpotLight(0xffffff, 0, 34, 0.4, 0.75, 1.2), target = new THREE.Object3D();
  light.castShadow = false; scene.add(light, target); light.target = target;
  let colour = "off", level = 0;
  const fwd = new THREE.Vector3();
  return {
    light,
    set(c) { colour = TORCHES.includes(c) ? c : "off"; if (colour !== "off") light.color.setHex(TORCH_HEX[colour]); },
    get colour() { return colour; },
    /** dark: 0 to 1 (a torch does little in daylight, so it's turned down then and nothing is washed out). */
    update(dark, dt) {
      // (a narrow beam with a soft edge, falling off gently: bright on the deck a few metres on, while your own
      // hands, low in the view and half a metre from the lamp, sit in its edge and are not burnt out)
      const want = colour === "off" ? 0 : (colour === "white" ? 8 : 11) * (0.12 + 0.88 * dark);
      level += (want - level) * Math.min(1, (dt || 0.016) * 10); light.intensity = level < 0.01 ? 0 : level;
      camera.getWorldDirection(fwd);
      light.position.copy(camera.position).addScaledVector(camera.up, 0.09);
      target.position.copy(camera.position).addScaledVector(fwd, 6);
    },
    dispose() { scene.remove(light, target); light.dispose(); },
  };
}
