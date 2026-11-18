# FishDock people v2: the skeleton's top made the same as the Rocketbox files' (which the game's moves are made for).
#
# Blender writes the skeleton under one node named Bip01 that carries the file's 1/100 scale, its turn and the hips'
# height (0.895 m), with the hips' bone offset by the same height again. The game's moves set Bip01's own position in
# centimetres (the root's travel) and its turn, as the Rocketbox files expect: there Bip01 sits under a node that does
# the 1/100 scale and the hips' bone has no offset. On Blender's layout the moves lifted the whole skeleton 89 m into
# the air, and everything carried by a bone (hats, glasses, the head torch) with it.
#
# This rewrites only the nodes' transforms: a new node above Bip01 with the 1/100 scale; Bip01 with the turn and the
# hips' height in centimetres; the hips' bone with no offset (Blender had added the hips' height to it a second time,
# and bound the mesh to that, so the man stood 0.9 m up in the air). No vertex and no bind matrix is touched.
#   python3 fix_rig.py <in.glb> <out.glb>
import json, struct, sys
import numpy as np

def read(path):
  b = open(path, "rb").read(); n = struct.unpack("<I", b[12:16])[0]
  j = json.loads(b[20:20 + n]); off = 20 + n; bl = struct.unpack("<I", b[off:off + 4])[0]
  return j, bytearray(b[off + 8:off + 8 + bl])
def write(path, j, binc):
  js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((4 - len(js) % 4) % 4)
  bb = bytes(binc) + b"\0" * ((4 - len(binc) % 4) % 4)
  out = b"glTF" + struct.pack("<II", 2, 12 + 8 + len(js) + 8 + len(bb)) + struct.pack("<I", len(js)) + b"JSON" + js + struct.pack("<I", len(bb)) + b"BIN\0" + bb
  open(path, "wb").write(out)
def qmat(q):
  x, y, z, w = q
  return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def local(nd):
  if "matrix" in nd: return np.array(nd["matrix"], float).reshape(4, 4).T
  M = np.eye(4); M[:3, :3] = qmat(nd.get("rotation", [0, 0, 0, 1])) * np.array(nd.get("scale", [1, 1, 1])); M[:3, 3] = nd.get("translation", [0, 0, 0]); return M
def globals_of(j):
  nodes = j["nodes"]; par = {}
  for i, nd in enumerate(nodes):
    for c in nd.get("children", []): par[c] = i
  G = {}
  def g(i):
    if i in G: return G[i]
    M = local(nodes[i]); G[i] = (g(par[i]) @ M) if i in par else M; return G[i]
  for i in range(len(nodes)): g(i)
  return G

def fix(src, dst):
  j, binc = read(src); nodes = j["nodes"]
  bi = next(i for i, nd in enumerate(nodes) if nd.get("name") == "Bip01")
  pi = next(i for i, nd in enumerate(nodes) if nd.get("name") == "Bip01_Pelvis")
  b01 = nodes[bi]
  if "scale" not in b01 or abs(b01["scale"][0] - 0.01) > 1e-4:
    print(src, "already in the Rocketbox layout (Bip01 has no 1/100 scale): unchanged"); write(dst, j, binc); return
  G0 = globals_of(j)
  # the new node above Bip01, carrying the 1/100 scale; Bip01 keeps its turn, its height in centimetres
  s = b01["scale"][0]; t = np.array(b01.get("translation", [0, 0, 0])) / s
  nodes.append({"name": "fdScale", "scale": [s, s, s], "children": [bi]})
  ni = len(nodes) - 1
  for sc in j["scenes"]:
    sc["nodes"] = [ni if k == bi else k for k in sc["nodes"]]
  b01.pop("scale"); b01["translation"] = t.tolist()
  # the hips' bone: its offset (the hips' height again, in Bip01's own axes) taken off
  nodes[pi]["translation"] = [0.0, 0.0, 0.0]
  # (the inverse bind matrices are left as they are: Blender's skeleton stood the hips' height too high, the hips'
  # bone offset by it a second time, and the mesh bound to that, so with the offset taken off the mesh comes down onto
  # the ground with the skeleton, where the moves expect both)
  G2 = globals_of(j)
  print(src, "-> skeleton under fdScale; hips' height", round(float(t[1]), 3), "cm on Bip01; the hips' bone now at", np.round(G2[pi][:3, 3], 3), "m (was", np.round(G0[pi][:3, 3], 3), ")")
  write(dst, j, binc)

if __name__ == "__main__":
  fix(sys.argv[1], sys.argv[2])
