# FishDock: your first-person wrists filled out, in public/models/fp_rig.glb (16 November)
# Aaron, from a screenshot on his phone: the wrist "looks too thin". At rest it was 57 by 52 mm, a slight wrist, and
# bent and turned on the reel's crank the skinning pinches it further (a wrist turned about its own length loses
# volume between the forearm's bones and the hand's). Each skin point along the last two fifths of the forearm and the
# first fifth of the hand is pushed out from the forearm's own axis, by its weight on those bones, up to 13% at the
# joint itself and easing to nothing either side, so the wrist comes out about 64 mm across, as a man's is. The jacket's
# cuff, where it reaches that far, is pushed out the same, so the skin never comes through it.
#   python3 thicker_wrists.py <fp_rig.glb in> <fp_rig.glb out>
import sys, json, struct
import numpy as np

GAIN = 0.13

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def main(src, dst):
    buf = bytearray(open(src, "rb").read())
    jl = struct.unpack("<I", buf[12:16])[0]; j = json.loads(buf[20:20 + jl]); bin0 = 20 + jl + 8
    def view(i):
        a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]; off = bin0 + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        dt = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32}[a["componentType"]]; n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        return off, np.frombuffer(bytes(buf[off:off + a["count"] * n * np.dtype(dt).itemsize]), dtype=dt).reshape(a["count"], n)
    skin = j["skins"][0]; names = [j["nodes"][n]["name"] for n in skin["joints"]]
    _, ibm = view(skin["inverseBindMatrices"]); inv = np.linalg.inv(ibm.reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64))
    for mesh in j["meshes"]:
        for prim in mesh["primitives"]:
            at = prim["attributes"]; off, P = view(at["POSITION"]); _, Jt = view(at["JOINTS_0"]); _, Wt = view(at["WEIGHTS_0"])
            P = P.astype(np.float64).copy(); push = np.zeros_like(P)
            for side in ("L", "R"):
                fa, hd = names.index(f"DEF-forearm.{side}.001"), names.index(f"DEF-hand.{side}")
                F = inv[fa]; head = F[:3, 3]; ax = F[:3, 1] / np.linalg.norm(F[:3, 1]); wrist = inv[hd][:3, 3]; L = float((wrist - head) @ ax)
                H = inv[hd]; hax = H[:3, 1] / np.linalg.norm(H[:3, 1])
                w = np.zeros(len(P)); g = np.zeros(len(P))
                for c in range(4):
                    b = Jt[:, c].astype(int); wc = Wt[:, c].astype(np.float64)
                    w += np.where((b == fa) | (b == hd), wc, 0)
                rel = P - head; t = (rel @ ax) / L  # (0 at the forearm's middle, 1 at the wrist)
                th = ((P - wrist) @ hax) / 0.06  # (0 at the wrist, 1 six centimetres into the hand)
                g = np.where(t <= 1, smooth(0.45, 1.0, t), 1 - smooth(0.0, 0.35, th))
                rad = rel - np.outer(rel @ ax, ax)
                push += (w * g * GAIN)[:, None] * rad
            moved = np.linalg.norm(push, axis=1)
            print(mesh["name"], "points moved", int((moved > 1e-6).sum()), "largest move mm", round(float(moved.max() * 1000), 2))
            P2 = P + push; buf[off:off + P2.size * 4] = P2.astype(np.float32).tobytes()
            a = j["accessors"][at["POSITION"]]; a["min"] = P2.min(0).astype(float).tolist(); a["max"] = P2.max(0).astype(float).tolist()
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((4 - len(js) % 4) % 4)
    out = bytearray(buf[:12]) + struct.pack("<I", len(js)) + buf[16:20] + js + buf[20 + jl:]
    struct.pack_into("<I", out, 8, len(out)); open(dst, "wb").write(out); print("written", dst, len(out))

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
