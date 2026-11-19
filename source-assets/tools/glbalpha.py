# glbalpha.py <in.glb> <alpha image> <out.glb>: a GLB's base colour picture given the alpha of a separate alpha map
# (Poly Haven's plants: their glTF colour is a JPEG with none), saved as PNG; the material cut out at half
import sys, json, struct, io
from PIL import Image
src, al, dst = sys.argv[1:4]
b = open(src, "rb").read(); off = 12; chunks = []
while off < len(b):
  ln, typ = struct.unpack_from("<I4s", b, off); chunks.append((typ, b[off + 8: off + 8 + ln])); off += 8 + ln
J = json.loads([c for t, c in chunks if t == b"JSON"][0]); BIN = [c for t, c in chunks if t == b"BIN\x00"][0]
A = Image.open(al).convert("L")
base = set()
for m in J["materials"]:
  bt = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
  if bt: base.add(J["textures"][bt["index"]]["source"])
  m["alphaMode"] = "MASK"; m["alphaCutoff"] = 0.5; m["doubleSided"] = True
views = J["bufferViews"]; out = bytearray(); nv = []
imgview = {im["bufferView"]: i for i, im in enumerate(J["images"])}
for vi, v in enumerate(views):
  data = BIN[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]
  if vi in imgview and imgview[vi] in base:
    im = Image.open(io.BytesIO(data)).convert("RGB"); a = A.resize(im.size, Image.LANCZOS)
    im.putalpha(a); buf = io.BytesIO(); im.save(buf, "PNG", optimize=True); data = buf.getvalue(); J["images"][imgview[vi]]["mimeType"] = "image/png"
  while len(out) % 4: out.append(0)
  d = dict(v); d["byteOffset"] = len(out); d["byteLength"] = len(data); d["buffer"] = 0; nv.append(d); out += data
while len(out) % 4: out.append(0)
J["bufferViews"] = nv; J["buffers"] = [{"byteLength": len(out)}]
js = json.dumps(J, separators=(",", ":")).encode()
while len(js) % 4: js += b" "
open(dst, "wb").write(struct.pack("<4sII", b"glTF", 2, 28 + len(js) + len(out)) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(out), b"BIN\x00") + bytes(out))
print(src.rsplit("/", 1)[-1], "alpha from", al.rsplit("/", 1)[-1], len(b) // 1000, "->", (28 + len(js) + len(out)) // 1000, "kB")
