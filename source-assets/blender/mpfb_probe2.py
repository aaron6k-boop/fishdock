# FishDock: MPFB function signatures and the assets the system pack added
import inspect, json, os
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
from bl_ext.blender_org.mpfb.services import assetservice
out = {}
for cls, names in [(HumanService, ["create_human", "add_builtin_rig", "add_mhclo_asset", "set_character_skin", "refit", "deserialize_from_dict", "get_default_deserialization_settings"]), (TargetService, ["get_default_macro_info_dict", "reapply_macro_details", "set_target_value", "bulk_load_targets", "load_target"])]:
    for n in names:
        try: out[cls.__name__ + "." + n] = str(inspect.signature(getattr(cls, n)))
        except Exception as e: out[cls.__name__ + "." + n] = repr(e)
out["AssetService"] = [n for n in dir(assetservice.AssetService) if not n.startswith("_")]
out["default_macro"] = TargetService.get_default_macro_info_dict()
try: out["deser_settings"] = HumanService.get_default_deserialization_settings()
except Exception as e: out["deser_settings"] = repr(e)
roots = {}
for n in ["get_user_data", "get_mpfb_data", "get_user_home"]:
    try: roots[n] = getattr(LocationService, n)()
    except Exception as e: roots[n] = repr(e)
out["roots"] = roots
found = {}
for r in roots.values():
    if isinstance(r, str) and os.path.isdir(r):
        for d in ["skins", "eyes", "eyebrows", "eyelashes", "teeth", "tongue", "hair", "proxymeshes", "clothes", "rigs"]:
            p = os.path.join(r, d)
            if os.path.isdir(p): found[p] = sorted(os.listdir(p))[:60]
out["assets"] = found
try: out["HumanService.create_human.src"] = inspect.getsource(HumanService.create_human)[:3000]
except Exception as e: out["src"] = repr(e)
json.dump(out, open("C:/Users/aaron/Documents/FishDock-assets/mpfb_api2.json", "w"), indent=1, default=str)
print("PROBE2 DONE")
