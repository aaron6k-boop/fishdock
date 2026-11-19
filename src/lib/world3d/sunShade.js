// ---- sunShade: what comes between the sun and what it lights: the clouds' shadows, and a second, finer shadow map close by ----
// The clouds' shadows: on a day of broken cloud, patches of shade a few hundred metres across drift over the pier, the
// sea and the town, as the clouds overhead do (the same speed and way as the sky's own clouds, environment.js). In the
// shade only the sky lights things. three.js has no such thing: this changes its light loop for every built-in
// material, with the numbers shared by all of them through plain value objects (as fogScatter.js does), and the sea's
// shader calls the same function. Where a material has shadow maps, the cloud is found from the sun's shadow
// coordinate, which is the point carried along the sun's rays onto a plane square to them: just what a cloud's shadow
// needs. (With shadows off there are no cloud shadows on the land; the sea, which works them out from its own
// position, keeps them.)
// The near shadow map (PC: Ultra, or High with the shadow distance Far or Furthest): one map can be sharp at your feet
// or reach 80 m, not both (4096 pixels over 160 m is 4 cm a pixel: your rod's shadow was a soft grey bar). A second
// light that gives no light of its own casts a 2048 map over the 26 m round you, and the sun's shadow takes it where it
// covers, blended into the far one over its last few metres. Its box is squared to its own pixels, so its edges don't
// crawl as you turn. Only the sun and this light are directional lights in the game: the patch below counts on that.
import * as THREE from "three";

// x, y: where the sun's shadow map's middle is, on the plane square to the sun, less the cloud's drift (metres); z: the
// map's width (metres); w: how dark the shade is (0: no cloud shadows). b: x the share of the sky that's cloud; y, z the
// cloud's drift on that plane (metres), for the sea
export const CLOUDS = { a: { x: 0, y: 0, z: 60, w: 0 }, b: { x: 0.3, y: 0, z: 0, w: 0 }, camX: { x: 1, y: 0, z: 0 }, camY: { x: 0, y: 1, z: 0 } };
// the clouds' drift (metres a second over the ground): the sky's clouds move by (0.0097, 0.0039) a second in its own
// field's units, on a layer that puts about 800 m of cloud to a unit (environment.js cloudAt), towards -x and -z
export const DRIFT = [-0.0097 * 800, -0.0039 * 800];
export const CLOUD_SCALE = 520; // metres to one unit of the shade's noise: patches a few hundred metres across

/** how dark the clouds' shade is (0 to 0.75) for the share of the sky that's cloud, the light (day, 0 to 1) and how high
 * the sun is (its direction's y). None under a clear sky or a full overcast (the sky's light is even then, and the
 * sun already dimmed: skyLook.js), most under broken cloud; less as the sun gets low, none at night */
export function cloudShadeStrength(cloud, day, sunY) {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return 0.75 * s(0.06, 0.22, cloud) * (1 - s(0.7, 0.92, cloud)) * Math.min(1, Math.max(0, day)) * s(0.02, 0.18, sunY);
}

/** the cut-off in the shade's noise for a share of cloud: about that share of the ground in shade (the three-octave
 * noise below is spread round 0.5; worked out in tests/sunShade.test.js) */
export const cloudCut = (cover) => 0.7 - 0.41 * Math.min(1, Math.max(0, cover));

export const CLOUD_GLSL = `uniform vec4 fdCloudA; uniform vec4 fdCloudB;
float fdCh( vec2 p ) { vec3 p3 = fract( p.xyx * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); } // (a hash without a sine: cheaper on a phone's graphics card)
float fdCn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( fdCh( i ), fdCh( i + vec2( 1.0, 0.0 ) ), f.x ), mix( fdCh( i + vec2( 0.0, 1.0 ) ), fdCh( i + 1.0 ), f.x ), f.y ); }
float fdCloudAt( vec2 u ) {
  u /= ${CLOUD_SCALE.toFixed(1)};
  float n = fdCn( u ) * 0.5 + fdCn( u * 2.13 + vec2( 5.2, 1.3 ) ) * 0.3 + fdCn( u * 4.71 + vec2( 1.7, 8.4 ) ) * 0.2;
  float cut = 0.7 - 0.41 * clamp( fdCloudB.x, 0.0, 1.0 );
  return 1.0 - fdCloudA.w * smoothstep( cut - 0.05, cut + 0.07, n );
}
float fdCloudShade( vec4 sc ) { return fdCloudA.w <= 0.0 ? 1.0 : fdCloudAt( fdCloudA.xy + ( sc.xy / sc.w - 0.5 ) * fdCloudA.z ); }
`;

// the line of three's light loop that shades the directional lights (three.js r170)
const SHADOW_LINE = "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;";
const NEW_LINES = `#if UNROLLED_LOOP_INDEX == 0
		{ float fdS = 1.0;
		  if ( directLight.visible && receiveShadow ) {
		    fdS = getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
		    #if NUM_DIR_LIGHT_SHADOWS > 1
		    vec3 fdNc = vDirectionalShadowCoord[ 1 ].xyz;
		    vec2 fdNe = min( fdNc.xy, 1.0 - fdNc.xy );
		    float fdIn = smoothstep( 0.0, 0.12, min( fdNe.x, fdNe.y ) ) * step( fdNc.z, 1.0 );
		    if ( fdIn > 0.0 ) fdS = mix( fdS, getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ), fdIn );
		    #endif
		  }
		  directLight.color *= fdS * fdCloudShade( vDirectionalShadowCoord[ i ] ); }
		#elif UNROLLED_LOOP_INDEX == 1 && NUM_DIR_LIGHT_SHADOWS > 1
		directLight.color = vec3( 0.0 );
		#else
		${SHADOW_LINE}
		#endif`;

let done = false;
/** Changes three's light loop and gives every lit material the shared numbers. Once, before any material is made
 * (lamps3d.js copies the light loop when a column's material is made). False if three's loop isn't as expected. */
export function installSunShade() {
  if (done) return true;
  const C = THREE.ShaderChunk; if (!C.lights_fragment_begin.includes(SHADOW_LINE)) return false;
  done = true;
  C.lights_pars_begin = CLOUD_GLSL + C.lights_pars_begin;
  C.lights_fragment_begin = C.lights_fragment_begin.replace(SHADOW_LINE, NEW_LINES);
  // (a lamp or a torch that is off, or out of reach of this pixel, is passed over: three.js works its light out in
  // full all the same, and the lamps now stay in the scene by day, at nothing, so no shader is rebuilt when they come
  // on (environment.js). Each lit pixel was paying for every lamp at noon)
  { const at = C.lights_fragment_begin.indexOf("#if ( NUM_DIR_LIGHTS > 0 )"), DIRECT = "\t\tRE_Direct( directLight,";
    if (at > 0) C.lights_fragment_begin = C.lights_fragment_begin.slice(0, at).split(DIRECT).join("\t\tif ( directLight.visible ) RE_Direct( directLight,") + C.lights_fragment_begin.slice(at); }
  for (const k of ["lambert", "phong", "standard", "physical", "toon", "shadow"]) {
    const S = THREE.ShaderLib[k]; if (!S) continue;
    S.uniforms.fdCloudA = { value: CLOUDS.a }; S.uniforms.fdCloudB = { value: CLOUDS.b };
  }
  return true;
}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
/** the plane square to the light (x, y: unit vectors on it), as three's shadow camera has it (lookAt with y up) */
export function lightPlane(lightDir, outX = _x, outY = _y) {
  _z.copy(lightDir).normalize(); outX.crossVectors(UP, _z); if (outX.lengthSq() < 1e-8) outX.set(1, 0, 0); outX.normalize(); outY.crossVectors(_z, outX);
  return [outX, outY];
}

/** Each frame: the shared numbers from the sun's light (its shadow map's middle and width), the time (seconds), the
 * cloud, the light and the sun's height. */
export function updateClouds({ sun, t, cloud, day, sunY }) {
  const [X, Y] = lightPlane(_z.copy(sun.position).sub(sun.target.position), _x, _y);
  const dx = (DRIFT[0] * t) % 40000, dz = (DRIFT[1] * t) % 40000; // (kept short of large numbers, which a phone's shader rounds)
  const ddx = X.x * dx + X.z * dz, ddy = Y.x * dx + Y.z * dz;
  const c = sun.shadow.camera;
  CLOUDS.a.x = X.dot(sun.position) - ddx; CLOUDS.a.y = Y.dot(sun.position) - ddy; CLOUDS.a.z = c.right - c.left; CLOUDS.a.w = cloudShadeStrength(cloud, day, sunY);
  CLOUDS.b.x = cloud; CLOUDS.b.y = ddx; CLOUDS.b.z = ddy;
  CLOUDS.camX.x = X.x; CLOUDS.camX.y = X.y; CLOUDS.camX.z = X.z; CLOUDS.camY.x = Y.x; CLOUDS.camY.y = Y.y; CLOUDS.camY.z = Y.z;
}

// ---- the near shadow map ----
export const NEAR = 13; // metres each way from its middle
export const NEAR_MAP = 2048;
/** the light that casts it: no light of its own (black), hidden until switched on */
export function nearShadowLight() {
  const L = new THREE.DirectionalLight(0x000000, 0);
  L.visible = false; L.castShadow = false;
  L.shadow.mapSize.set(NEAR_MAP, NEAR_MAP);
  Object.assign(L.shadow.camera, { left: -NEAR, right: NEAR, top: NEAR, bottom: -NEAR, near: 1, far: 240 });
  L.shadow.bias = -0.0003; L.shadow.normalBias = 0.012;
  return L;
}
const _c = new THREE.Vector3(), _f = new THREE.Vector3();
/** puts the near map round the camera, its middle 40 per cent of the way ahead of you (behind you it isn't seen),
 * squared to its own pixels on the plane square to the light, so it moves only by whole pixels and its edges don't crawl */
export function placeNear(L, cam, lightDir) {
  cam.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1); _f.normalize();
  _c.copy(cam.position).addScaledVector(_f, NEAR * 0.4); _c.y = cam.position.y - 1.5; // (about your feet)
  const [X, Y] = lightPlane(lightDir, _x, _y), px = (2 * NEAR) / NEAR_MAP;
  const cx = X.dot(_c), cy = Y.dot(_c);
  _c.addScaledVector(X, Math.round(cx / px) * px - cx).addScaledVector(Y, Math.round(cy / px) * px - cy);
  L.target.position.copy(_c); L.position.copy(_c).addScaledVector(lightDir, 120);
}
