# FishDock: the pier furniture's own textures (run with Python 3 and Pillow; no Blender needed)
#   bench_slat_diff/nor/orm.jpg  Poly Haven's brown_planks_03 (CC0), four of its boards cut out (x 135-647 of the 1k
#                                maps), the ORM's metal channel cleared; build_pierprops2.py maps each slat along one board
#   station_sign.jpg             the lifebuoy station's name board (top quarter) and its 999 notice (left half below),
#                                lettered in Inter (SIL Open Font License 1.1)
# python make_textures.py <polyhaven downloads folder> <out folder> [Inter-Bold.otf] [Inter-SemiBold.otf]
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
SRC, DST = sys.argv[1], sys.argv[2]
BOLD = sys.argv[3] if len(sys.argv) > 3 else "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
SEMI = sys.argv[4] if len(sys.argv) > 4 else "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
os.makedirs(DST, exist_ok=True)

# ---- the slats: the boards between the planks' joints (the joints found where the columns run darkest: 125, 247,
# 358, 469, 573 px), so the boards in the cut sit at 0-102, 122-213, 233-324 and 344-428 px ----
x0 = 135
for src, dst, size, q in (("diff", "bench_slat_diff", (512, 1024), 88), ("nor_gl", "bench_slat_nor", (512, 1024), 90), ("arm", "bench_slat_orm", (256, 512), 88)):
  im = Image.open(f"{SRC}/brown_planks_03/textures/brown_planks_03_{src}_1k.jpg").convert("RGB").crop((x0, 0, x0 + 512, 1024))
  if size != (512, 1024): im = im.resize(size, Image.LANCZOS)
  if src == "arm": a = np.asarray(im).copy(); a[..., 2] = 0; im = Image.fromarray(a)
  im.save(f"{DST}/{dst}.jpg", quality=q)

# ---- the signs ----
W = 1024; im = Image.new("RGB", (W, 1024), (236, 236, 232)); d = ImageDraw.Draw(im)
red, white, ink = (196, 30, 36), (244, 244, 240), (24, 26, 30)
# the name board, 1024 x 256 (0.58 x 0.145 m on the fascia): white letters on red, a ring either side
d.rectangle((0, 0, W, 256), fill=red); d.rounded_rectangle((12, 12, W - 12, 244), radius=18, outline=white, width=6)
f = ImageFont.truetype(BOLD, 122); t = "LIFEBUOY"; bb = d.textbbox((0, 0), t, font=f)
d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], 128 - (bb[3] + bb[1]) / 2), t, font=f, fill=white)
def ring(cx, cy, r0, r1):
  for k in range(4):
    a0 = k * 90 + 45; d.pieslice((cx - r1, cy - r1, cx + r1, cy + r1), a0, a0 + 90, fill=white if k % 2 == 0 else (250, 180, 170))
  d.ellipse((cx - r0, cy - r0, cx + r0, cy + r0), fill=red)
for cx in (112, W - 112): ring(cx, 128, 30, 64)
# the notice, 512 x 640 (0.2 x 0.25 m on the back panel, seen through the buoy): the UK's own advice
y0 = 320; d.rectangle((0, y0, 512, y0 + 640), fill=white); d.rectangle((0, y0, 512, y0 + 150), fill=red); d.rectangle((6, y0 + 6, 506, y0 + 634), outline=red, width=8)
f1 = ImageFont.truetype(BOLD, 78); t = "999"; bb = d.textbbox((0, 0), t, font=f1); d.text(((512 - (bb[2] - bb[0])) / 2 - bb[0], y0 + 75 - (bb[3] + bb[1]) / 2), t, font=f1, fill=white)
f2 = ImageFont.truetype(BOLD, 52); y = y0 + 185
for line in ("In an emergency", "call 999 and", "ask for the", "Coastguard"):
  bb = d.textbbox((0, 0), line, font=f2); d.text(((512 - (bb[2] - bb[0])) / 2 - bb[0], y - bb[1]), line, font=f2, fill=ink); y += 70
f3 = ImageFont.truetype(SEMI, 30); y += 24
for line in ("Throw the lifebuoy,", "do not go in the water."):
  bb = d.textbbox((0, 0), line, font=f3); d.text(((512 - (bb[2] - bb[0])) / 2 - bb[0], y - bb[1]), line, font=f3, fill=ink); y += 42
im.save(f"{DST}/station_sign.jpg", quality=88)
print("textures written to", DST)
