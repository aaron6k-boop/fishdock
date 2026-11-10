// ---- post: the picture after the scene is drawn: ambient occlusion, a soft glow on bright light, the final grade ----
// Without this the scene went straight to the screen: every surface lit evenly, so a bucket on the deck, a person's
// boots on the concrete and the gaps between the pier's timbers had no shade where they meet, and a sunlit sea or a
// lamp after dark had no glow. Now, when the graphics setting allows:
//   level 1 (Balanced): antialiased (4x MSAA) HDR buffer, a faint bloom on the brightest light, and a gentle grade
//   level 2 (High quality): also ground-truth ambient occlusion (GTAO), the contact shade where things meet
// The colour pipeline is the same as without: three's Khronos Neutral tone mapping and sRGB output, applied once at
// the end (OutputPass). The sky and the sea (environment.js) write display colours from their own shaders; with
// post they're turned back into the linear light the tone mapping expects (their uPostLin uniform), so they look the
// same either way.
import * as THREE from "three";
import { EffectComposer } from "./vendor/three-post/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/three-post/postprocessing/RenderPass.js";
import { GTAOPass } from "./vendor/three-post/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "./vendor/three-post/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "./vendor/three-post/postprocessing/ShaderPass.js";
import { OutputPass } from "./vendor/three-post/postprocessing/OutputPass.js";

// ---- the grade (display colours, after tone mapping): a touch of contrast and colour, a soft vignette, and a
// little noise so the sky's long gradients don't band ----
export const GradeShader = {
  name: "FishDockGrade",
  uniforms: { tDiffuse: { value: null }, uContrast: { value: 1.22 }, uSat: { value: 0.94 }, uVignette: { value: 0.3 }, uSeed: { value: 0 }, uFade: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, uSharp: { value: 0.5 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uContrast, uSat, uVignette, uSeed, uSharp, uFade; uniform vec2 uTexel; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed)*43758.5453); }
    void main(){
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      // contrast-adaptive sharpening (after AMD's CAS): each pixel pushed away from its four neighbours, less where
      // they already differ a lot (edges stay clean, no halos) and more on soft detail: textures, the town, the rigging,
      // read crisp rather than slightly blurred by the antialiasing and the texture filtering
      if (uSharp > 0.) {
        vec3 a = texture2D(tDiffuse, vUv + vec2(0., -uTexel.y)).rgb, b = texture2D(tDiffuse, vUv + vec2(-uTexel.x, 0.)).rgb;
        vec3 d2 = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.)).rgb, e = texture2D(tDiffuse, vUv + vec2(0., uTexel.y)).rgb;
        vec3 mn = min(c, min(min(a, b), min(d2, e))), mx = max(c, max(max(a, b), max(d2, e)));
        vec3 amp = sqrt(clamp(min(mn, 1. - mx)/max(mx, 1e-4), 0., 1.));
        vec3 w = -amp*mix(.125, .2, uSharp);
        c = clamp((c + (a + b + d2 + e)*w)/(1. + 4.*w), 0., 1.);
      }
      // contrast round mid grey, kept off the ends so nothing clips
      c = mix(c, smoothstep(0., 1., c), uContrast - 1.);
      float l = dot(c, vec3(.2126, .7152, .0722)); c = max(mix(vec3(l), c, uSat), 0.);
      // (a photograph's look on a grey coast: the shadows a touch cool, the highlights a touch warm, a little deeper
      // in the darks; the grade was so gentle the picture read flat and milky next to a real photo)
      c *= mix(vec3(.95, .99, 1.05), vec3(1.03, 1.01, .97), smoothstep(.15, .8, l));
      c = pow(c, vec3(1.06));
      vec2 d = vUv - .5; c *= 1. - uVignette*smoothstep(.35, .95, dot(d, d)*2.2);
      c *= uFade;
      c += (h(gl_FragCoord.xy) - .5)/255.;
      gl_FragColor = vec4(c, t.a);
    }`,
};

/** level 0: none (draw straight to the screen); 1: MSAA, bloom and grade; 2: plus ambient occlusion; 3: finer AO. */
export function createPost(renderer, scene, camera, { level = 1 } = {}) {
  // (the buffer is half-float, for the light brighter than white that the bloom needs: a graphics chip that can't
  // draw into one gets the plain picture rather than a black one)
  const ext = renderer.extensions;
  if (!level || !renderer.capabilities.isWebGL2 || !(ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float"))) return null;
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr); composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  let ao = null, aoLevel = 0;
  // (made when first needed: at level 2 or 3 from the start, or later when Settings → Graphics turns it on)
  function makeAO() {
    ao = new GTAOPass(scene, camera, size.x * pr, size.y * pr);
    ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 16, distanceFallOff: 1 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 0.85;
    // only solid surfaces shade each other: not name labels and other sprites, lines, spray or anything see-through
    // (three's own pass leaves out just points and lines, so a label's square cast a dark box round it)
    const cache = ao._visibilityCache;
    ao.overrideVisibility = function () {
      this.scene.traverse((o) => {
        cache.set(o, o.visible);
        // (nor anything cut out by alpha test: leaves and the far trees' cards. The pass draws depth without the cut, so
        // each card shaded the sky behind it as a dark square)
        const cut = (x) => x.transparent || !x.depthWrite || x.alphaTest > 0;
        const m = o.material, see = m && (Array.isArray(m) ? m.some(cut) : cut(m));
        // (nor what is marked as too far or too small to shade anything: userData.noAO, the far stones and post fittings)
        if (o.isPoints || o.isLine || o.isSprite || see || o.userData.noAO) o.visible = false;
      });
    };
    composer.insertPass(ao, 1); // (straight after the scene is drawn)
  }
  // contact shade at a person's or a bucket's scale (half a metre), fading with distance so the far town isn't dirty.
  // 1: 16 samples; 2 (Ultra, "Fine"): 24, so the shade is smooth rather than a fine grain
  function setAO(n) {
    n = Math.max(0, Math.min(2, n | 0));
    if (n && !ao) makeAO();
    if (ao) {
      ao.enabled = n > 0;
      if (n) { const k = n >= 2 ? 24 : 16; ao.updateGtaoMaterial({ samples: k }); ao.updatePdMaterial({ radius: n >= 2 ? 8 : 6, samples: k }); }
    }
    aoLevel = n;
  }
  // (only the brightest light glows: the sun's glitter on the sea, lamps after dark, the sun low in the sky)
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.35, 1.0);
  // (a pixel that comes out as not-a-number, from any surface's shading, would be spread by the blur into a white
  // blaze across the screen: the glow only takes light that's a real, finite number, capped)
  const hp = bloom.materialHighPassFilter;
  hp.fragmentShader = hp.fragmentShader.replace("vec4 texel = texture2D( tDiffuse, vUv );", "vec4 texel = texture2D( tDiffuse, vUv ); if (any(isnan(texel)) || any(isinf(texel))) texel = vec4(0.0); texel = min(texel, vec4(16.0));");
  hp.needsUpdate = true;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  setAO(level >= 3 ? 2 : level >= 2 ? 1 : 0);
  grade.uniforms.uTexel.value.set(1 / (size.x * pr), 1 / (size.y * pr));
  let seed = 0, samples = 4;
  return {
    level,
    get ao() { return !!ao?.enabled; },
    get aoLevel() { return ao?.enabled ? aoLevel : 0; },
    get bloom() { return bloom.enabled; },
    get samples() { return samples; },
    // ---- Settings → Graphics, while playing ----
    setAO,
    /** the soft glow on the brightest light (sun glitter, lamps after dark) */
    setBloom(on) { bloom.enabled = !!on; },
    /** antialiasing: 0 (off), 2 or 4 samples a pixel (the buffers are made again at the new count) */
    setAA(n) {
      n = n >= 4 ? 4 : n >= 2 ? 2 : 0; if (n === samples) return; samples = n;
      for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = n; t.dispose(); }
    },
    render() { grade.uniforms.uSeed.value = (seed = (seed + 1) % 97); composer.render(); },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); const r = renderer.getPixelRatio(); grade.uniforms.uTexel.value.set(1 / (w * r), 1 / (h * r)); },
    /** sharpening, 0..1 (Settings → Graphics) */
    setSharp(v) { grade.uniforms.uSharp.value = Math.max(0, Math.min(1, +v || 0)); },
    get sharp() { return grade.uniforms.uSharp.value; },
    /** the picture's brightness, 0 (black) to 1: a cut in the landing shot comes up from black over a few frames */
    setFade(v) { grade.uniforms.uFade.value = Math.max(0, Math.min(1, +v || 0)); },
    /** frames running late even at the lowest sharpness: drop the ambient occlusion first */
    dropAO() { if (ao?.enabled) { ao.enabled = false; aoLevel = 0; return true; } return false; },
    dispose() { composer.passes.forEach((p) => p.dispose?.()); composer.dispose(); },
  };
}
