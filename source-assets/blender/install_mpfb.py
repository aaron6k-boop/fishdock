# FishDock: install MPFB (MakeHuman for Blender) from Blender's official extensions platform (approved by Aaron)
import bpy, addon_utils
P = bpy.context.preferences
print("online access was", P.system.use_online_access)
P.system.use_online_access = True
repos = list(P.extensions.repos)
for i, r in enumerate(repos): print(i, r.module, r.remote_url, r.enabled)
idx = next(i for i, r in enumerate(repos) if r.module == "blender_org")
print("sync", bpy.ops.extensions.repo_sync_all())
print("install", bpy.ops.extensions.package_install(repo_index=idx, pkg_id="mpfb"))
print("MPFB modules:", [m.__name__ for m in addon_utils.modules() if "mpfb" in m.__name__])
