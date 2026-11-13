# FishDock rig rebuild: the hands' own skin, deformed by the rig's bone matrices (linear blend skinning, as the game
# does), for measuring contact with the equipment without evaluating the whole body mesh (exec'd after riglib.py)
HAND_BONES = lambda S: [f"DEF-hand.{S}", f"DEF-forearm.{S}", f"DEF-forearm.{S}.001"] + [f"DEF-palm.0{i}.{S}" for i in range(1, 5)] + [f"DEF-f_{f}.0{i}.{S}" for f in ("index", "middle", "ring", "pinky") for i in (1, 2, 3)] + [f"DEF-thumb.0{i}.{S}" for i in (1, 2, 3)]
class HandSkin:
    def __init__(self, rig, body, S):
        self.rig = rig; self.S = S; names = [n for n in HAND_BONES(S) if n in rig.data.bones]; self.names = names
        gi = {vg.name: vg.index for vg in body.vertex_groups}; cols = {gi[n]: k for k, n in enumerate(names) if n in gi}
        rows, Ws, own = [], [], []
        for v in body.data.vertices:
            tot = sum(g.weight for g in v.groups if body.vertex_groups[g.group].name.startswith("DEF-"))
            if tot <= 0: continue
            w = np.zeros(len(names)); hit = 0.0
            for g in v.groups:
                if g.group in cols: w[cols[g.group]] += g.weight / tot; hit += g.weight / tot
            if hit < 0.97 or (w[0] + w[3:].sum()) < 0.25: continue   # (the hand's own points: wholly on these bones)
            rows.append(v.index); Ws.append(w); own.append(names[int(np.argmax(w))])
        self.idx = np.array(rows); self.W = np.array(Ws); self.own = np.array(own)
        mw = body.matrix_world; self.V = np.array([tuple(mw @ body.data.vertices[i].co) + (1.0,) for i in rows])
        self.rest_inv = np.array([np.array(rig.data.bones[n].matrix_local.inverted()) for n in names])
        print("hand skin", S, len(rows), "points")
    def sel(self, prefix): return np.array([o.startswith(prefix) for o in self.own])
    def deform(self):
        M = np.array([np.array(self.rig.matrix_world @ self.rig.pose.bones[n].matrix) for n in self.names]) @ self.rest_inv
        return np.einsum("vb,bij,vj->vi", self.W, M, self.V)[:, :3]
def seg_clear(P, cols):
    """least gap from points P (n,3) to capsules [(a, b, r)]"""
    best = np.full(len(P), 9.0)
    for a, b, r in cols:
        a = np.array(a); b = np.array(b); ab = b - a; L2 = max(1e-12, ab @ ab); t = np.clip((P - a) @ ab / L2, 0, 1)
        d = np.linalg.norm(P - (a + np.outer(t, ab)), axis=1) - r; best = np.minimum(best, d)
    return best
