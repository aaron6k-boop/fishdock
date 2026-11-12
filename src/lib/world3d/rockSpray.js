// ---- rockSpray: broken water in the air: spray off the rock armour and the wall, and every splash on the water ----
// A crest arriving at the seaward edge of the boulders breaks on them: a burst of spray goes up and back over the
// stones, drifts with the wind and falls. A rig, a fish or a net going into the water throws a crown of drops out
// and up, a few straight up from the middle, and a puff of white where it went in.
// Two kinds of point in one draw call: mist (soft, ragged puffs that grow, hang and thin out) and drops (small and
// bright, thrown further, falling as a stone falls until they meet the water). Both take the light of the hour, so
// spray is white at noon, grey at dusk and dark at night like everything round it.
// How hard a crest breaks follows the sea that is running: nothing on a flat calm, a low wash in a light breeze,
// plumes a couple of metres high once the sea is up. Nothing here is measured at Gorleston: it is how spray and
// splashes behave in general.
import * as THREE from "three";

export const SPRAY = { max: 1600, gap: 3.2 };

/** The height (m above the water's rest) a crest has to reach at the rocks before it breaks on them, for this sea's energy. Pure. */
export const breakHeight = (energy) => 0.08 + 0.16 * Math.max(0, energy);

/** How hard a crest breaks (0 nothing to 1): rise is how fast the water is coming up at the rocks as it passes the
 * breaking height (m/s), energy the sea's (swell + half the wind, about 0 to 1.5), r a random 0 to 1 (no two bursts alike). Pure. */
export function burstStrength(rise, energy, r = 0.5) {
  const e = Math.max(0, energy);
  if (!(rise > 0) || e < 0.12) return 0;
  return Math.min(1, (0.15 + 0.85 * Math.min(1, e)) * (0.55 + 0.45 * r) * Math.min(1, 0.35 + rise / (0.3 + 0.5 * e)));
}

/** What a splash of this size throws: how many drops in its crown, how many up the middle, how many puffs of white,
 * and how fast the crown leaves (m/s). size: a rig about .6, a landed fish .9, a big one 1.4; mult: more of it. Pure. */
export function splashPlan(size = 0.6, mult = 1) {
  const s = Math.max(0.1, Math.min(2, size)), m = Math.max(0.2, Math.min(4, mult));
  // (13 November: about twice the water. From the rail a splash was a few dots and a faint puff; a lead going in throws
  // a crown you can see from 30 m, a fine sheet of spray inside it, and leaves a patch of white on the water)
  return { crown: Math.min(360, Math.round((30 + 52 * s) * m)), jet: Math.round((4 + 8 * s) * Math.min(m, 2)), mist: Math.round((6 + 9 * s) * Math.min(m, 2)), foam: Math.round((4 + 6 * s) * Math.min(m, 2)), speed: 1.7 + 2.2 * Math.sqrt(s) };
}

/** Thin a list of [x, z, ox, oz] (a point on the rocks' seaward edge and the way out to sea from it) to one every `gap` metres. Pure. */
export function thinEdge(points, gap = 3) {
  const seen = new Set(), out = [];
  for (const p of points) { const k = Math.round(p[0] / gap) + "," + Math.round(p[1] / gap); if (seen.has(k)) continue; seen.add(k); out.push(p); }
  return out;
}

export function createRockSpray(scene, edge = []) {
  const N = SPRAY.max, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), size = new Float32Array(N), fade = new Float32Array(N), seed = new Float32Array(N), kind = new Uint8Array(N), grow = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); geo.setAttribute("aFade", new THREE.BufferAttribute(fade, 1)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 600 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSize, aFade, aSeed; uniform float uScale; varying float vFade, vSeed;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vSeed = aSeed;
        float px = aSize * uScale / max(0.3, -mv.z);
        // (a drop too far off to cover a pixel is drawn as one pixel, fainter by as much: a far splash still glitters)
        vFade = aFade * min(1.0, px / 1.5); gl_PointSize = clamp(px, 1.5, 240.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight; varying float vFade, vSeed;
      float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0, a, shade;
        if (vSeed >= 2.0) {
          // a drop: small and bright, a touch brighter on its upper side where the sky is
          a = (1.0 - smoothstep(0.45, 1.0, r)) * vFade * 0.92; shade = 1.0 + 0.12 * (0.5 - gl_PointCoord.y);
        } else {
          // mist: a puff densest in the middle, broken up by its own pattern (no two alike) so a burst reads as torn
          // water and not a row of discs; lit from above, a little shaded underneath
          vec2 q = gl_PointCoord * 3.2 + vSeed * 37.0; float n = vn(q) * 0.62 + vn(q * 2.3 + 9.0) * 0.38;
          a = pow(max(0.0, 1.0 - r), 1.25) * smoothstep(0.16, 0.66, n * 0.85 + (1.0 - r) * 0.5) * vFade;
          shade = mix(0.74, 1.0, smoothstep(0.85, 0.2, gl_PointCoord.y)) * (0.93 + 0.14 * n);
        }
        if (a < 0.012) discard;
        gl_FragColor = vec4(uLight * shade, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 4; points.name = "fdRockSpray"; points.userData.kind = "spray and splashes";
  scene.add(points);
  let head = 0;
  const afloat = new Uint8Array(N); // (white left lying on the water: it rides the surface and does not fall)
  const put = (k, x, y, z, vx, vy, vz, sz, lf, gr = 0, fl = 0) => { const i = head++ % N; afloat[i] = fl; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; age[i] = 0; life[i] = lf; size[i] = sz; kind[i] = k; grow[i] = gr; seed[i] = Math.random() + (k ? 2 : 0); fade[i] = 0; };
  /** A burst at (x, y, z): strength 0 to 1; (dx, dz) the way the water was going (the spray carries on that way). */
  function burst(x, y, z, strength, dx = 0, dz = 0, spread = 1.1) {
    const s = Math.max(0.05, Math.min(1, strength)), n = Math.round(6 + 12 * s), y0 = Math.max(0, y);
    for (let q = 0; q < n; q++) {
      const a = Math.random() * Math.PI * 2, out = Math.random();
      let up = (2.4 + 6.2 * s) * (0.4 + 0.6 * Math.random()), sz = (0.8 + 1.5 * s * (0.5 + Math.random())) * Math.min(1, spread / 1.1 + 0.25), lf = (0.7 + 0.9 * Math.random()) * (0.7 + 0.6 * s);
      const side = (0.3 + 1.6 * s) * out;
      // (one in four stays low: the white wash boiling round the stone's foot)
      if (q % 4 === 0) { up *= 0.25; sz *= 1.5; lf *= 1.25; }
      put(0, x + (Math.random() - 0.5) * spread * 2, y0 + Math.random() * 0.3, z + (Math.random() - 0.5) * spread * 2, dx * (0.6 + 1.8 * s) * (0.4 + Math.random()) + Math.cos(a) * side, up, dz * (0.6 + 1.8 * s) * (0.4 + Math.random()) + Math.sin(a) * side, sz, lf, 1.3);
    }
    // the heavier water: drops flung higher and further than the mist, coming down round it
    const nd = Math.round((5 + 16 * s) * Math.min(1, spread / 1.1 + 0.3));
    for (let q = 0; q < nd; q++) {
      const a = Math.random() * Math.PI * 2, side = (0.5 + 2.4 * s) * Math.random(), up = (3 + 7 * s) * (0.35 + 0.65 * Math.random()), fwd = (0.8 + 2.4 * s) * Math.random();
      put(1, x + (Math.random() - 0.5) * spread * 1.6, y0 + Math.random() * 0.2, z + (Math.random() - 0.5) * spread * 1.6, dx * fwd + Math.cos(a) * side, up, dz * fwd + Math.sin(a) * side, 0.05 + 0.09 * Math.random() * (0.5 + s), 4);
    }
  }
  /** A splash on the water at (x, y, z): a crown of drops out and up, a few straight up the middle, a puff of white where it went in.
   * size: a rig about .6, a landed fish .9; mult: more of it; up: { x, z } to throw it one way (spray over a wall) instead of all round. */
  function splash(x, y, z, sizeS = 0.6, mult = 1, up = null) {
    const P = splashPlan(sizeS, mult), s = Math.max(0.1, Math.min(2, sizeS)), y0 = y + 0.03, k = 0.7 + 0.5 * s;
    for (let q = 0; q < P.crown; q++) {
      // (the crown leaves steeply, 55 to 80 degrees up, from a ring a hand's breadth out: not a flat spray of dots)
      const a = Math.random() * Math.PI * 2, el = (55 + 25 * Math.random()) * Math.PI / 180, sp = P.speed * (0.45 + 0.75 * Math.random()), r0 = 0.05 + 0.12 * s * Math.random();
      let vx = Math.cos(a) * Math.cos(el) * sp, vz = Math.sin(a) * Math.cos(el) * sp; const vy = Math.sin(el) * sp;
      if (up) { vx = vx * 0.45 + up.x * sp * 0.75; vz = vz * 0.45 + up.z * sp * 0.75; }
      put(1, x + Math.cos(a) * r0, y0, z + Math.sin(a) * r0, vx, vy * (up ? 1.25 : 1), vz, (0.03 + 0.075 * Math.random() * Math.random()) * k, 3);
    }
    for (let q = 0; q < P.jet; q++) put(1, x + (Math.random() - 0.5) * 0.06, y0, z + (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.35 + (up ? up.x * 0.8 : 0), P.speed * (1.15 + 0.5 * Math.random()), (Math.random() - 0.5) * 0.35 + (up ? up.z * 0.8 : 0), (0.035 + 0.04 * Math.random()) * k, 3);
    // the sheet inside the crown: fine spray going up and a little out, that hangs a moment
    for (let q = 0; q < P.mist; q++) { const a = Math.random() * Math.PI * 2, sp = 0.5 + 0.9 * Math.random(); put(0, x + Math.cos(a) * 0.12 * s, y0 + 0.05, z + Math.sin(a) * 0.12 * s, Math.cos(a) * sp + (up ? up.x * 1.2 : 0), (1.6 + 2.6 * Math.random()) * Math.sqrt(s), Math.sin(a) * sp + (up ? up.z * 1.2 : 0), (0.2 + 0.22 * Math.random()) * Math.sqrt(s), 0.35 + 0.3 * Math.random(), 1.6 * s); }
    // the white it leaves on the water: low puffs spreading out from where it went in, lasting a second or two
    if (!up) for (let q = 0; q < (P.foam || 0); q++) { const a = Math.random() * Math.PI * 2, r1 = (0.1 + 0.35 * Math.random()) * s, sp = 0.15 + 0.3 * Math.random(); put(0, x + Math.cos(a) * r1, y0 + 0.06, z + Math.sin(a) * r1, Math.cos(a) * sp, 0.35, Math.sin(a) * sp, (0.3 + 0.3 * Math.random()) * Math.sqrt(s), 1.4 + 1.2 * Math.random(), 0.45 * s, 1); }
    for (let q = 0; q < P.mist; q++) { const a = Math.random() * Math.PI * 2, sp = 0.25 + 0.5 * Math.random(); put(0, x + Math.cos(a) * 0.1 * s, y0 + 0.03, z + Math.sin(a) * 0.1 * s, Math.cos(a) * sp + (up ? up.x * 1.2 : 0), 0.5 + 1.1 * Math.random() * Math.sqrt(s), Math.sin(a) * sp + (up ? up.z * 1.2 : 0), (0.24 + 0.26 * Math.random()) * s, 0.3 + 0.35 * Math.random(), 1.3 * s); }
  }
  let E = [];
  const setEdge = (list) => { E = thinEdge(list || [], SPRAY.gap).map((p) => ({ x: p[0], z: p[1], ox: p[2], oz: p[3], was: 0, last: -9, wait: 2 + Math.random() * 3 })); };
  setEdge(edge);
  return {
    points, burst, splash, setEdge, get count() { return E.length; },
    /** how many points are in the air now (checks) */
    get live() { let n = 0; for (let i = 0; i < N; i++) if (life[i] > 0) n++; return n; },
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
      const dragM = Math.exp(-1.6 * dt), dragD = Math.exp(-0.18 * dt);
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        age[i] += dt;
        // (a drop is gone when it meets the water; mist when it has thinned away)
        // (the water where the drop is, waves and all, once it is low enough and coming down to be near it)
        const floor = kind[i] ? (heightAt && vel[i * 3 + 1] < 0 && pos[i * 3 + 1] < 1.2 ? heightAt(pos[i * 3], pos[i * 3 + 2]) - 0.03 : -1.5) : -0.3;
        if (age[i] >= life[i] || pos[i * 3 + 1] < floor) { life[i] = 0; fade[i] = 0; pos[i * 3 + 1] = -50; continue; }
        if (kind[i]) {
          // a drop: a stone's fall, hardly slowed, pushed a little by the wind
          vel[i * 3] = (vel[i * 3] - wx * 0.25) * dragD + wx * 0.25; vel[i * 3 + 2] = (vel[i * 3 + 2] - wz * 0.25) * dragD + wz * 0.25; vel[i * 3 + 1] -= 9.81 * dt;
          fade[i] = Math.min(1, age[i] * 30) * Math.min(1, (life[i] - age[i]) * 4);
        } else {
          // mist: soon stopped by the air, then sinking slowly and going with the wind as it spreads and thins
          if (afloat[i]) { vel[i * 3] *= dragM; vel[i * 3 + 2] *= dragM; vel[i * 3 + 1] = 0; pos[i * 3 + 1] = (heightAt ? heightAt(pos[i * 3], pos[i * 3 + 2]) : 0) + 0.06; }
          else { vel[i * 3] = (vel[i * 3] - wx) * dragM + wx; vel[i * 3 + 2] = (vel[i * 3 + 2] - wz) * dragM + wz; vel[i * 3 + 1] = vel[i * 3 + 1] * dragM - 4.2 * dt; }
          const u = age[i] / life[i];
          size[i] += dt * grow[i]; fade[i] = Math.min(1, age[i] * 10) * Math.pow(1 - u, 1.35) * (afloat[i] ? 0.55 : 0.9);
        }
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aFade.needsUpdate = true; geo.attributes.aSeed.needsUpdate = true;
      if (light) mat.uniforms.uLight.value.copy(light);
      mat.uniforms.uScale.value = pxH / (2 * Math.tan((fovDeg * Math.PI) / 360));
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}
