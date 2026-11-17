# FishDock: build the skins (skins.py) for the species named (or all), write them to public/fish/skin and a preview of
# each to the folder given (preview: the skin over grey, and lit through its normal map).
#   WRITE=1 python3 run.py <photo folder> <preview folder> [species ...]
# The photo folder holds the photographs as <species>_<n>.jpg (the copies used are kept on Aaron's PC in
# FishDock-assets/downloads/commons-fish, each with its page, author, licence and hash in source-assets/ASSET-LICENCES.json
# and the credits in src/data/fishSkins.js). Needs Python with numpy, OpenCV and Pillow.
import sys, os, numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import skins
HEAD_RIGHT = {"plaice", "dab", "sole"}  # (sceneActors.js headRight: the game turns these pictures to face left)
def main(photo_dir, prev_dir, names, write=True):
  out = os.path.join(skins.REPO, "public/fish/skin"); os.makedirs(out, exist_ok=True); os.makedirs(prev_dir, exist_ok=True)
  for sp in names:
    an = skins.ANAT[sp]; r = skins.build(sp, photo_dir, None, head_right_canvas=sp in HEAD_RIGHT, pic=an.get("pic")); r["anat"] = an
    sk = r["skin"]; n = skins.normal_map(r, scales=0 if an.get("photo_scales") else an.get("scales", 0))
    a = sk[:, :, 3:4] / 255.0; comp = (sk[:, :, :3] * a + 60 * (1 - a)).astype(np.uint8)
    nn = n[:, :, ::-1].astype(np.float32) / 255 * 2 - 1; Lv = np.array([-0.5, -0.5, 0.7]); Lv /= np.linalg.norm(Lv)
    sh = np.clip((nn * Lv).sum(2), 0, 1); lit = (comp.astype(np.float32) * (0.35 + 0.85 * sh[..., None])).clip(0, 255).astype(np.uint8)
    cv2.imwrite(f"{prev_dir}/{sp}.jpg", np.vstack([comp, lit])[::2, ::2], [cv2.IMWRITE_JPEG_QUALITY, 85])
    if write:
      for suf, im, sz in (("", sk, 1), ("-m", sk, 2), ("_n", n, 1), ("_n-m", n, 2)):
        im2 = im if sz == 1 else cv2.resize(im, (im.shape[1] // 2, im.shape[0] // 2), interpolation=cv2.INTER_AREA)
        if im2.shape[2] == 4: im2 = cv2.cvtColor(im2, cv2.COLOR_BGRA2RGBA)
        else: im2 = cv2.cvtColor(im2, cv2.COLOR_BGR2RGB)
        from PIL import Image
        Image.fromarray(im2).save(f"{out}/{sp}{suf}.webp", quality=88 if not suf.startswith("_n") else 92, method=6)
    print(sp, "skin", "angle", round(r["mk"]["angle"], 2), "holes", round(float(r["hole"].mean()), 3), flush=True)
if __name__ == "__main__":
  main(sys.argv[1], sys.argv[2], sys.argv[3:] or list(skins.ANAT), write=os.environ.get("WRITE", "1") == "1")
