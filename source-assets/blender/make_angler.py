# FishDock: a believable adult British angler, made with MPFB (CC0 output): body, skin, eyes, brows, lashes, teeth,
# short hair, the game-engine rig (with full finger bones), saved as a .blend and exported as a skinned .glb
import bpy, os, json, glob, traceback
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
OUT = "C:/Users/aaron/Documents/FishDock-assets"; DATA = LocationService.get_user_data()
WHO = globals().get("ANGLER", "man")
SPEC = {
    # MakeHuman's macros: age 0.5 is 25 and 1.0 is 90 (so 0.65 is about 45); height and weight 0.5 are average
    "man": {"macro": {"gender": 1.0, "age": 0.66, "muscle": 0.56, "weight": 0.6, "proportions": 0.6, "height": 0.56, "cupsize": 0.5, "firmness": 0.5, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}, "skin": "middleage_caucasian_male", "hair": ["short02", "short04", "short01"], "brows": ["eyebrow001", "eyebrow007"]},
    "woman": {"macro": {"gender": 0.0, "age": 0.62, "muscle": 0.5, "weight": 0.55, "proportions": 0.6, "height": 0.5, "cupsize": 0.45, "firmness": 0.5, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}, "skin": "middleage_caucasian_female", "hair": ["bob02", "ponytail01", "bob01"], "brows": ["eyebrow010", "eyebrow001"]},
}[WHO]
log = []
def L(*a): log.append(" ".join(map(str, a))); print(*a)
def first(pattern_dirs):
    for d in pattern_dirs:
        hits = sorted(glob.glob(os.path.join(DATA, d)))
        if hits: return hits[0]
    return None
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
try:
    base = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=SPEC["macro"])
    base.name = f"angler_{WHO}"; L("basemesh", len(base.data.vertices), "verts")
    skin = first([f"skins/{SPEC['skin']}/*.mhmat"]); L("skin", skin)
    if skin: HumanService.set_character_skin(skin, base, skin_type="MAKESKIN", material_instances=False)
    for kind, pats in [("Eyes", ["eyes/low-poly/*.mhclo"]), ("Eyebrows", [f"eyebrows/{b}/*.mhclo" for b in SPEC["brows"]] + ["eyebrows/*/*.mhclo"]), ("Eyelashes", ["eyelashes/*/*.mhclo"]), ("Teeth", ["teeth/*/*.mhclo"]), ("Tongue", ["tongue/*/*.mhclo"]), ("Hair", [f"hair/{h}/*.mhclo" for h in SPEC["hair"]] + ["hair/*/*.mhclo"])]:
        f = first(pats); L(kind, f)
        if f:
            try: HumanService.add_mhclo_asset(f, base, asset_type=kind, subdiv_levels=0, material_type="MAKESKIN")
            except Exception as e: L("  failed", kind, repr(e)[:200])
    rig = HumanService.add_builtin_rig(base, "game_engine"); L("rig", rig.name if rig else None, len(rig.data.bones) if rig else 0)
    L("bones", [b.name for b in rig.data.bones][:80])
    os.makedirs(OUT + "/source/people", exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/source/people/angler_{WHO}.blend")
    bpy.ops.export_scene.gltf(filepath=f"{OUT}/exports/angler_{WHO}.glb", export_format="GLB", export_apply=True, export_skins=True, export_morph=False, export_image_format="WEBP", export_jpeg_quality=82, export_cameras=False, export_lights=False)
    L("exported", os.path.getsize(f"{OUT}/exports/angler_{WHO}.glb") // 1000, "kB")
    L("objects", [(o.name, o.type, len(o.data.vertices) if o.type == "MESH" else "") for o in bpy.data.objects])
except Exception:
    L("ERROR", traceback.format_exc())
open(f"{OUT}/make_angler_{WHO}.log", "w").write("\n".join(log))
print("ANGLER DONE", WHO)
