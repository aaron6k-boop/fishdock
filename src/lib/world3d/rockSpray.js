// ---- rockSpray: white water thrown up where a wave meets the rock armour (and off the wall at your feet) ----
// A crest arriving at the seaward edge of the boulders breaks on them: a burst of spray goes up and back over the
// stones, drifts with the wind and falls. Drawn as soft round puffs (one draw call for all of them), big enough to
// see from the pier a hundred metres off, where the 9 cm droplets of a fish's splash (world.js) don't show at all.
// How hard a crest breaks follows the sea that is running: nothing on a flat calm, a low wash in a light breeze,
// plumes a couple of metres high once the sea is up. Nothing here is measured at Gorleston: it is how spray off
// rock armour behaves in general.
import * as THREE from "three";

export const SPRAY = { max: 900, gap: 3.2 };

/** The height (m above the water's rest) a crest has to reach at the rocks before it breaks on them, for this sea's energy. Pure. */
export const breakHeight = (energy) => 0.08 + 0.16 * Math.max(0, energy);

/** How hard a crest breaks (0 nothing to 1): rise is how fast the water is coming up at the rocks as it passes the
 * breaking height (m/s), energy the sea's (swell + half the wind, about 0 to 1.5), r a random 0 to 1 (no two bursts alike). Pure. */
export function burstStrength(rise, energy, r = 0.5) {
  const e = Math.max(0, energy);
  if (!(rise > 0) || e < 0.12) return 0;
  return Math.min(1, (0.15 + 0.85 * Math.min(1, e)) * (0.55 + 0.45 * r) * Math.min(1, 0.35 + rise / (0.3 + 0.5 * e)));
}

/** Thin a list of [x, z, ox, oz] (a point on the rocks' seaward edge and the way out to sea from it) to one every `gap` metres. Pure. */
export function thinEdge(points, gap = 3) {
  const seen = new Set(), out = [];
  for (const p of points) { const k = Math.round(p[0] / gap) + "," + Math.round(p[1] / gap); if (seen.has(k)) continue; seen.add(k); out.push(p); }
  return out;
}

export function createRockSpray(scene, edge = []) {
  const N = SPRAY.max, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), size = new Float32Array(N), fade = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); geo.setAttribute("aFade", new THREE.BufferAttribute(fade, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 600 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSize, aFade; uniform float uScale; varying float vFade;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vFade = aFade; gl_PointSize = clamp(aSize * uScale / max(0.3, -mv.z), 1.0, 220.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight; varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
        // a soft puff, densest in the middle (several overlap into one burst of broken water)
        float a = pow(max(0.0, 1.0 - r), 1.6) * vFade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uLight * (0.92 + 0.08 * (1.0 - r)), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 4; points.name = "fdRockSpray"; points.userData.kind = "spray off the rocks";
  scene.add(points);
  let head = 0;
  /** A burst at (x, y, z): strength 0 to 1; (dx, dz) the way the water was going (the spray carries on that way). */
  function burst(x, y, z, strength, dx = 0, dz = 0, spread = 1.1) {
    const s = Math.max(0.05, Math.min(1, strength)), n = Math.round(6 + 12 * s);
    for (let q = 0; q < n; q++) {
      const i = head++ % N, a = Math.random() * Math.PI * 2, out = Math.random();
      pos[i * 3] = x + (Math.random() - 0.5) * spread * 2; pos[i * 3 + 1] = Math.max(0, y) + Math.random() * 0.3; pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread * 2;
      const up = (2.4 + 6.2 * s) * (0.4 + 0.6 * Math.random()), side = (0.3 + 1.6 * s) * out;
      vel[i * 3] = dx * (0.6 + 1.8 * s) * (0.4 + Math.random()) + Math.cos(a) * side; vel[i * 3 + 1] = up; vel[i * 3 + 2] = dz * (0.6 + 1.8 * s) * (0.4 + Math.random()) + Math.sin(a) * side;
      age[i] = 0; life[i] = (0.7 + 0.9 * Math.random()) * (0.7 + 0.6 * s); size[i] = 0.8 + 1.5 * s * (0.5 + Math.random());
      // (one in four stays low: the white wash boiling round the stone's foot)
      if (q % 4 === 0) { vel[i * 3 + 1] *= 0.25; size[i] *= 1.5; life[i] *= 1.25; }
    }
  }
  const E = thinEdge(edge, SPRAY.gap).map((p) => ({ x: p[0], z: p[1], ox: p[2], oz: p[3], was: 0, last: -9, wait: 2 + Math.random() * 3 }));
  return {
    points, burst, count: E.length,
    /** each frame: t, dt (s); sea { swell, wind, windDir }; heightAt(x, z) the water's height now; light (a Color, the day's) ; view height in px and fov for the puffs' size */
    update(t, dt, sea, heightAt, light, pxH = 800, fovDeg = 60) {
      const energy = (sea.swell || 0) + (sea.wind || 0) * 0.5;
      if (dt > 0 && heightAt) for (const e of E) {
        // (the water a metre and a half out from the stone: the crest about to arrive)
        const h = heightAt(e.x + e.ox * 1.5, e.z + e.oz * 1.5), lim = breakHeight(energy);
        if (h > lim && e.was <= lim && t - e.last > e.wait) {
          const s = burstStrength((h - e.was) / dt, energy, Math.random());
          if (s > 0) { e.last = t; e.wait = 1.2 + Math.random() * 2.2; burst(e.x + e.ox * 1.3, h, e.z + e.oz * 1.3, s, -e.ox, -e.oz); } // (on the stone's seaward face, where it shows)
        }
        e.was = h;
      }
      const wl = Math.hypot(sea.windDir?.[0] || 0, sea.windDir?.[1] || 0) || 1, wx = ((sea.windDir?.[0] || 0) / wl) * (sea.wind || 0) * 4, wz = ((sea.windDir?.[1] || 0) / wl) * (sea.wind || 0) * 4;
      const drag = Math.exp(-1.1 * dt);
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        age[i] += dt;
        if (age[i] >= life[i] || pos[i * 3 + 1] < -0.3) { life[i] = 0; fade[i] = 0; pos[i * 3 + 1] = -50; continue; }
        vel[i * 3] = (vel[i * 3] - wx) * drag + wx; vel[i * 3 + 2] = (vel[i * 3 + 2] - wz) * drag + wz; vel[i * 3 + 1] -= 7.5 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const u = age[i] / life[i];
        size[i] += dt * 1.3; fade[i] = Math.min(1, age[i] * 9) * Math.pow(1 - u, 1.2);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aFade.needsUpdate = true;
      if (light) mat.uniforms.uLight.value.copy(light);
      mat.uniforms.uScale.value = pxH / (2 * Math.tan((fovDeg * Math.PI) / 360));
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}
