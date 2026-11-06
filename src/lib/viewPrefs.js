// ---- viewPrefs: settled values for the 3D view's saved choices ----

/** The landing camera: on for anyone who hasn't chosen; an earlier choice to turn it off (saved as "landCam") stays. */
export function landCamOn(saved = {}) {
  if (saved.landCam2 != null) return saved.landCam2 !== false;
  return saved.landCam !== false;
}

/** The fishing camera: "first" (your own eyes the whole way, landing the fish too), "third" (behind you) or
 *  "cinematic" (your own eyes, with framed shots of the landing). First person for anyone who hasn't chosen; a saved
 *  choice is kept. (The old "Landing camera" switch was on unless turned off, so it says nothing either way.) */
export const FISH_CAMS = ["first", "third", "cinematic"];
export function fishCamOf(saved = {}) {
  return FISH_CAMS.includes(saved.fishCam) ? saved.fishCam : "first";
}
