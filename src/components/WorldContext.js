// ---- WorldContext: the 3D view's handle (World3D's ref), for controls drawn over it (aiming a cast) ----
// Null outside the 3D view (the photo scene), where controls simply do without it.
import { createContext } from "react";
export const WorldCtx = createContext(null);

// ---- SceneCtx: what your own angler is busy with in the scene, for the controls over it ----
// busy: "landing" (the net going down and coming up), "deck" (your fish waiting on the mat), "inspect" (in your hands),
// "release" (going back in the water), or null. While it's set there's no casting: the fishing tray offers nothing
// until the last fish is finished with, whatever the fight's own state says.
export const SceneCtx = createContext({ busy: null });
