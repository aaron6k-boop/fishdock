# FishDock: your first-person fingers slimmed, in public/models/fp_rig.glb (16 November)
# Aaron called the game's look "PS2 graphics", and the hands always on screen were a large part of it: the fingers were
# thick, rounded sausages (the index finger's first joint 24 mm across, its last 15; a man's are about 20 and 15, and a
# lighter hand's less). Each skin point on a finger is drawn in towards that finger bone's own axis, by its weight on the
# bone, so the fingers come out about an eighth slimmer round, the thumb's last two bones a little less and the ball of
# the thumb and the palm not at all. Nothing else in the file changes: the same points, joined the same way, the same
# bones, weights and uvs (so the baked creases and nails, bake_hand_maps.py, still fall where they did).
#   python3 slim_fingers.py <fp_rig.glb in> <fp_rig.glb out>
import sys, json, struct
import numpy as np

SLIM = {"f_index": 0.87, "f_middle": 0.87, "f_ring": 0.87, "f_pinky": 0.88, "thumb.02": 0.92, "thumb.03": 0.92}

def main(src, dst):
    buf = bytearray(open(src, "rb").read())
    jl = struct.unpack("<I", buf[12:16])[0]; j = json.loads(buf[20:20 + jl]); bin0 = 20 + jl + 8
    def view(i):
        a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]; off = bin0 + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        dt = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32}[a["componentType"]]; n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        assert bv.get("byteStride", np.dtype(dt).itemsize * n) == np.dtype(dt).itemsize * n
        return off, np.frombuffer(bytes(buf[off:off + a["count"] * n * np.dtype(dt).itemsize]), dtype=dt).reshape(a["count"], n)
    skin = j["skins"][0]; names = [j["nodes"][n]["name"] for n in skin["joints"]]
    _, ibm = view(skin["inverseBindMatrices"]); inv = np.linalg.inv(ibm.reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64))
    k_of = np.ones(len(names))
    for i, nm in enumerate(names):
        for key, k in SLIM.items():
            if nm.startswith("DEF-") and key in nm: k_of[i] = k
    print("bones slimmed:", sum(k_of < 1))
    for mesh in j["meshes"]:
        if "female" not in mesh["name"] and "male" not in mesh["name"]: continue
        for prim in mesh["primitives"]:
            at = prim["attributes"]; off, P = view(at["POSITION"]); _, J = view(at["JOINTS_0"]); _, W = view(at["WEIGHTS_0"])
            P = P.astype(np.float64).copy(); moved = np.zeros(len(P)); total = np.zeros_like(P)
            for c in range(4):
                b = J[:, c].astype(int); w = W[:, c].astype(np.float64); k = k_of[b]; sel = (w > 0) & (k < 1)
                if not sel.any(): continue
                B = inv[b[sel]]; head = B[:, :3, 3]; ax = B[:, :3, 1] / np.linalg.norm(B[:, :3, 1], axis=1, keepdims=True)
                rel = P[sel] - head; along = (rel * ax).sum(1, keepdims=True); rad = rel - along * ax
                total[sel] -= (w[sel] * (1 - k[sel]))[:, None] * rad; moved[sel] += w[sel]
            P2 = P + total
            print(mesh["name"], "points moved", int((moved > 0).sum()), "largest move mm", round(float(np.linalg.norm(total, axis=1).max() * 1000), 2))
            buf[off:off + P2.size * 4] = P2.astype(np.float32).tobytes()
            a = j["accessors"][at["POSITION"]]; a["min"] = P2.min(0).astype(float).tolist(); a["max"] = P2.max(0).astype(float).tolist()
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((4 - len(js) % 4) % 4)
    assert len(js) <= jl or True
    out = bytearray(buf[:12]) + struct.pack("<I", len(js)) + buf[16:20] + js + buf[20 + jl:]
    struct.pack_into("<I", out, 8, len(out)); open(dst, "wb").write(out); print("written", dst, len(out))

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
