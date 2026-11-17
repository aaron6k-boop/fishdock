// ---- thinAA: railings, posts and other thin tubes that never shimmer as you look about ----
// A tube further off than its own width shows as less than a pixel: it lands on some pixels' sample points and misses
// others, and as the view moves (and in first person it always moves a little) those change from frame to frame, so a
// railing crawls and flickers along its length. Anti-aliasing smooths an edge in one frame, but can't draw what falls
// between the samples. So here a tube is never drawn thinner than about a pixel and a half: where it would be, it is
// widened to that on the screen (pushed out along its own surface, so it stays round and lit as it was) and made as
// much fainter as it was widened, through alpha to coverage (the multisampled picture's own samples, so no sorting
// and no seams). Close by nothing changes. One shared uniform, the size of a pixel at a metre, set each frame.
// Works for a cylinder along its own y (three's CylinderGeometry), placed with or without instancing and scaled evenly
// across (its radius is read from the geometry and the instance's own scale).

export const THIN = { pix: { value: 0.0012 } }; // radians a pixel covers: 2 tan(fov / 2) / the picture's height

/** Widen this material's thin tubes to a pixel and a half on screen, fading them by as much. `min` in pixels;
 * `radius`: a GLSL expression for the tube's radius here in its own units, where it isn't round its own y (the rod's
 * blank, bent each frame, gives its radius from how far along it is). */
export function thinTubes(mat, min = 1.5, radius = null) {
  const prev = mat.onBeforeCompile;
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.fdThinPix = THIN.pix;
    sh.vertexShader = "uniform float fdThinPix;\nvarying float vFdCov;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
      {
        #ifdef USE_INSTANCING
          float fdS = length(instanceMatrix[0].xyz);
        #else
          float fdS = 1.0;
        #endif
        float fdR = ${radius || "length(position.xz)"} * fdS * length(modelMatrix[0].xyz), fdMin = -mvPosition.z * fdThinPix * ${(min / 2).toFixed(3)};
        vFdCov = 1.0;
        if (fdR > 1e-5 && fdR < fdMin && mvPosition.z < 0.0) { mvPosition.xyz += normalize(transformedNormal) * (fdMin - fdR); gl_Position = projectionMatrix * mvPosition; vFdCov = fdR / fdMin; }
      }`);
    sh.fragmentShader = "varying float vFdCov;\n" + sh.fragmentShader.replace("#include <alphatest_fragment>", "#include <alphatest_fragment>\n  diffuseColor.a *= vFdCov;");
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "|thin" + min + (radius || "");
  return mat;
}

/** The pixel's size for this camera and picture height (call once a frame, or when either changes). */
export function setThinPixel(camera, heightPx) {
  if (!camera?.isPerspectiveCamera || !(heightPx > 0)) return;
  THIN.pix.value = (2 * Math.tan(((camera.fov * Math.PI) / 180) / 2)) / (heightPx * (camera.zoom || 1));
}
