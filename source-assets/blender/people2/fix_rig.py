# FishDock people v2: the skeleton's top made the same as the Rocketbox files' (which the game's moves are made for).
#
# Blender writes the skeleton under one node named Bip01 that carries the file's 1/100 scale, its turn and the hips'
# height (0.895 m), with the hips' bone offset by the same height again. The game's moves set Bip01's own position in
# centimetres (the root's travel) and its turn, as the Rocketbox files expect: there Bip01 sits under a node that does
# the 1/100 scale and the hips' bone has no offset. On Blender's layout the moves lifted the whole skeleton 89 m into
# the air, and everything carried by a bone (hats, glasses, the head torch) with it.
#
# This rewrites only the nodes' transforms and the skin's inverse bind matrices (so the mesh at rest is exactly where
# it was): a new node above Bip01 with the 1/100 scale; Bip01 with the turn and the hips' height in centimetres; the
# hips' bone with no offset. No vertex is touched.
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
  G1 = globals_of(j)
  # the skin's inverse bind matrices, so each joint at rest maps the mesh exactly as before
  for sk in j["skins"]:
    a = j["accessors"][sk["inverseBindMatrices"]]; bv = j["bufferViews"][a["bufferView"]]; o = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    ibm = np.frombuffer(bytes(binc[o:o + a["count"] * 64]), np.float32).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    for k, jn in enumerate(sk["joints"]):
      ibm[k] = np.linalg.inv(G1[jn]) @ G0[jn] @ ibm[k]
    binc[o:o + a["count"] * 64] = ibm.transpose(0, 2, 1).astype(np.float32).tobytes()
  # check: every mesh node and every joint's rest mapping unchanged
  G2 = globals_of(j); worst = 0.0
  for i, nd in enumerate(nodes):
    if "mesh" in nd and i in G0: worst = max(worst, float(np.abs(G2[i] - G0[i]).max()))
  print(src, "-> skeleton under fdScale; hips' height", round(float(t[1]), 3), "cm on Bip01; mesh nodes moved by at most", worst)
  write(dst, j, binc)

if __name__ == "__main__":
  fix(sys.argv[1], sys.argv[2])
