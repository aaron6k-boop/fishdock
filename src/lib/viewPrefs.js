// ---- viewPrefs: settled values for the 3D view's saved choices ----

/** The landing camera: on for anyone who hasn't chosen; an earlier choice to turn it off (saved as "landCam") stays. */
export function landCamOn(saved = {}) {
  if (saved.landCam2 != null) return saved.landCam2 !== false;
  return saved.landCam !== false;
}
