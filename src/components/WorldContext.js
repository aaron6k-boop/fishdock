// ---- WorldContext: the 3D view's handle (World3D's ref), for controls drawn over it (aiming a cast) ----
// Null outside the 3D view (the photo scene), where controls simply do without it.
import { createContext } from "react";
export const WorldCtx = createContext(null);
