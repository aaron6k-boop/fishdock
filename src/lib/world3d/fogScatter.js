// ---- fogScatter: the haze glows towards the sun ----
// three's fog is one flat colour whichever way you look. Real air scatters sunlight forwards: looking towards the
// sun the haze is bright and warm (gold at dusk), away from it cooler and plainer, and that glow is much of what makes
// a distant shore look far away and lit by the day. This changes three's fog chunks for every built-in material (one
// dot product a pixel, no extra pass), with the sun's direction and colour shared by all of them through one uniform
// value object (three copies Vector3s into each material, but passes a plain object through as it is, so changing
// it here reaches every material at once). environment.js sets them as the light changes.
import * as THREE from "three";

export const SCATTER = { dir: { x: 0, y: 0.5, z: -0.86 }, col: { x: 0, y: 0, z: 0 } };
let done = false;
export function installFogScatter() {
  if (done) return; done = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth; varying vec3 vFdView;");
  C.fog_vertex = C.fog_vertex.replace("vFogDepth = - mvPosition.z;", "vFogDepth = - mvPosition.z; vFdView = mvPosition.xyz;");
  C.fog_pars_fragment = C.fog_pars_fragment.replace("varying float vFogDepth;", "varying float vFogDepth; varying vec3 vFdView; uniform vec3 fdSunDir; uniform vec3 fdSunCol;");
  C.fog_fragment = C.fog_fragment.replace("gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );", `
    vec3 fdSv = normalize((viewMatrix * vec4(fdSunDir, 0.0)).xyz);
    float fdCos = max(dot(normalize(vFdView), fdSv), 0.0);
    vec3 fdFog = fogColor + fdSunCol * (pow(fdCos, 6.0) * 0.55 + pow(fdCos, 40.0) * 0.6);
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fdFog, fogFactor );`);
  for (const k of ["basic", "lambert", "phong", "standard", "physical", "toon", "matcap"]) {
    const S = THREE.ShaderLib[k]; if (!S) continue;
    S.uniforms.fdSunDir = { value: SCATTER.dir }; S.uniforms.fdSunCol = { value: SCATTER.col };
  }
}
