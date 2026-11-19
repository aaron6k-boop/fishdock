# glbshrink.py <in.glb> <out.glb> <max px> [quality]: a GLB's embedded images re-encoded as JPEG (PNG kept for images
# with alpha, as PNG) at most <max px> a side; the binary chunk rebuilt with the new image views, 4-byte aligned
import sys, json, struct, io
from PIL import Image
src, dst, mx = sys.argv[1], sys.argv[2], int(sys.argv[3]); q = int(sys.argv[4]) if len(sys.argv) > 4 else 84
b = open(src, "rb").read()
magic, ver, total = struct.unpack_from("<4sII", b, 0); assert magic == b"glTF"
off = 12; chunks = []
while off < len(b):
  ln, typ = struct.unpack_from("<I4s", b, off); chunks.append((typ, b[off + 8: off + 8 + ln])); off += 8 + ln
J = json.loads([c for t, c in chunks if t == b"JSON"][0]); BIN = [c for t, c in chunks if t == b"BIN\x00"][0]
views = J.get("bufferViews", []); imgview = {im["bufferView"]: i for i, im in enumerate(J.get("images", [])) if "bufferView" in im}
out = bytearray(); newviews = []
for vi, v in enumerate(views):
  data = BIN[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]
  if vi in imgview:
    im = Image.open(io.BytesIO(data)); alpha = im.mode in ("RGBA", "LA") and im.getextrema()[-1][0] < 255
    w, h = im.size; s = min(1.0, mx / max(w, h))
    if s < 1: im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    buf = io.BytesIO()
    if alpha: im.save(buf, "PNG", optimize=True); J["images"][imgview[vi]]["mimeType"] = "image/png"
    else: im.convert("RGB").save(buf, "JPEG", quality=q, optimize=True); J["images"][imgview[vi]]["mimeType"] = "image/jpeg"
    data = buf.getvalue()
  while len(out) % 4: out.append(0)
  nv = dict(v); nv["byteOffset"] = len(out); nv["byteLength"] = len(data); nv["buffer"] = 0; newviews.append(nv); out += data
while len(out) % 4: out.append(0)
J["bufferViews"] = newviews; J["buffers"] = [{"byteLength": len(out)}]
js = json.dumps(J, separators=(",", ":")).encode()
while len(js) % 4: js += b" "
glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(out), b"BIN\x00") + bytes(out)
open(dst, "wb").write(glb); print(src.rsplit("/", 1)[-1], len(b) // 1000, "->", len(glb) // 1000, "kB")
