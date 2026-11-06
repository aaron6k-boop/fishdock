# (needs a sparse checkout of github.com/microsoft/Microsoft-Rocketbox: the avatars' Assets/Avatars/<folder>/Textures/)
# the people at the Rocketbox library's full texture detail: each person's colour maps at 2048 px and normal maps at
# 1024 px (they were 1024 and 512), from the library's own source textures. python3 people_hd.py RB_DIR PEOPLE_DIR OUT_DIR
# (OUT_DIR/<name>.glb is then saved as public/people/<name>_hd.glb)
import sys, io, os, glbio
from PIL import Image, ImageChops, ImageStat
RB, PEOPLE, OUT = sys.argv[1:4]
SRC = {"gardener": "Professions/Gardener_Male_01", "m03": "Adults/Male_Adult_03", "m04": "Adults/Male_Adult_04", "m05": "Adults/Male_Adult_05",
       "m10": "Adults/Male_Adult_10", "m12": "Adults/Male_Adult_12", "m17": "Adults/Male_Adult_17", "m18": "Adults/Male_Adult_18",
       "f04": "Adults/Female_Adult_04", "f07": "Adults/Female_Adult_07", "f09": "Adults/Female_Adult_09", "f14": "Adults/Female_Adult_14"}
SIZE = {"color": 2048, "normal": 1024}
os.makedirs(OUT, exist_ok=True)
for name, folder in SRC.items():
    j, b = glbio.read(f"{PEOPLE}/{name}.glb"); roles = glbio.image_roles(j); rep = {}
    for i, im in enumerate(j["images"]):
        if i not in roles: continue
        mat, kind = roles[i]; src = f"{RB}/Assets/Avatars/{folder}/Textures/{mat}_{kind}.tga"
        if not os.path.exists(src): print(name, "missing", src); continue
        cur = Image.open(io.BytesIO(glbio.view(j, b, im["bufferView"]))).convert("RGB")
        T = Image.open(src).convert("RGB").transpose(Image.FLIP_TOP_BOTTOM)
        d = sum(ImageStat.Stat(ImageChops.difference(cur, T.resize(cur.size, Image.LANCZOS))).mean) / 3
        if d > 8: print(name, mat, kind, "does not match the model's own texture (", round(d, 1), "): kept"); continue
        n = min(SIZE[kind], T.width); T = T.resize((n, n), Image.LANCZOS) if T.width != n else T
        buf = io.BytesIO(); T.save(buf, "JPEG", quality=88 if kind == "color" else 92, optimize=True, subsampling=0 if kind == "normal" else 2)
        rep[im["bufferView"]] = buf.getvalue(); im["mimeType"] = "image/jpeg"
        print(name, mat, kind, cur.size, "->", n, round(d, 1), len(buf.getvalue()) // 1024, "KB")
    glbio.write(f"{OUT}/{name}.glb", j, b, rep)
    print(name, os.path.getsize(f"{PEOPLE}/{name}.glb") // 1024, "->", os.path.getsize(f"{OUT}/{name}.glb") // 1024, "KB")
