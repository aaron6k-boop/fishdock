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

/** The walking camera: "auto" (as you fish: at your eyes if you fish in first person, behind you otherwise), "near",
 *  "normal", "far" or "eyes". Until 18 November there was no "auto" and everyone had "normal" saved, the default then,
 *  so a saved "normal" from before (no walkCam2 mark) counts as "auto"; one chosen since is kept. */
export const WALK_CAMS = ["auto", "near", "normal", "far", "eyes"];
export function walkCamOf(saved = {}) {
  const c = saved.camDist;
  if (!WALK_CAMS.includes(c)) return "auto";
  if (c === "normal" && !saved.walkCam2) return "auto";
  return c;
}
/** what the walk starts at for a walking camera and the camera you fish with */
export function walkDist(cam, fishMode) {
  return cam === "auto" ? (fishMode === "first" ? "eyes" : "normal") : cam;
}
