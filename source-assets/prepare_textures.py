# ---- prepare_textures: the photographed surfaces in public/textures/, cut down for phones ----
# Poly Haven's CC0 texture sets (see ASSET-LICENCES.json) are downloaded at 1k or 2k; the app uses 512 px JPEGs (and
# 256 px greyscale roughness), which tile seamlessly as the originals do. Run with the downloads folder and the
# repository's public/textures folder:
#   python prepare_textures.py "C:/Users/aaron/Documents/FishDock-assets/downloads/polyhaven" ../public/textures
import sys
from pathlib import Path
from PIL import Image

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])

# (output name, source set, source map, size, kind): kind "rgb", "grey" (one channel), "arm-g" (roughness from ARM), or
# "rgb-white" (painted white: the photograph's grey lifted in linear light to the paint's own white, about 0.78, keeping
# its variation; multiplying a grey photograph up in the material pushed sunlit faces past white, and they glowed)
JOBS = [
  ("deck_worn_diff", "concrete_floor_worn_001", "diff_1k", 512, "rgb"),
  ("wall_rust_diff", "rusty_painted_metal", "diff_2k", 1024, "rgb"),
  ("wall_rust_nor", "rusty_painted_metal", "nor_gl_2k", 1024, "rgb"),
  ("wall_rust_rough", "rusty_painted_metal", "arm_2k", 256, "arm-g"),
  ("wall_moss_diff", "concrete_moss", "diff_2k", 512, "rgb"),
  ("cap_concrete_diff", "concrete_wall_004", "diff_1k", 512, "rgb"),
  ("cap_concrete_nor", "concrete_wall_004", "nor_gl_1k", 512, "rgb"),
  ("cap_concrete_rough", "concrete_wall_004", "rough_1k", 256, "grey"),
  ("brick_red_diff", "red_brick_03", "diff_1k", 1024, "rgb"),
  ("brick_red_nor", "red_brick_03", "nor_gl_1k", 512, "rgb"),
  ("brick_red_rough", "red_brick_03", "rough_1k", 256, "grey"),
  ("plaster_diff", "painted_plaster_wall", "diff_1k", 1024, "rgb-white"),
  ("plaster_nor", "painted_plaster_wall", "nor_gl_1k", 512, "rgb"),
  ("plaster_rough", "painted_plaster_wall", "rough_1k", 256, "grey"),
  ("ground_rough_diff", "coast_sand_rocks_02", "diff_1k", 1024, "rgb"),
  ("ground_rough_nor", "coast_sand_rocks_02", "nor_gl_1k", 512, "rgb"),
]

for name, folder, part, size, kind in JOBS:
  src = SRC / folder / "textures" / f"{folder}_{part}.jpg"
  im = Image.open(src)
  if kind == "arm-g": im = im.convert("RGB").split()[1]
  elif kind == "grey": im = im.convert("L")
  elif kind == "rgb-white":
    import numpy as np
    a = np.asarray(im.convert("RGB")).astype(np.float64) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    lin = np.clip(lin * (np.array([0.8, 0.8, 0.77]) / lin.reshape(-1, 3).mean(0)), 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    im = Image.fromarray((srgb * 255 + 0.5).astype(np.uint8))
  else: im = im.convert("RGB")
  im = im.resize((size, size), Image.LANCZOS)
  dst = OUT / f"{name}.jpg"
  im.save(dst, quality=80 if kind == "rgb" else 85, optimize=True, progressive=False)
  print(f"{dst.name}: {dst.stat().st_size // 1024} KB")
