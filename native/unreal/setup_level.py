# ---- setup_level: sun, sky, clouds, fog and a post-process volume for the imported place ----
# Run inside the Unreal editor: Tools > Execute Python Script. NOT YET RUN ANYWHERE: a first draft, written without
# an engine to test it in. If a line fails, the Output Log names it.
import unreal

def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0), label=None):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(*rot))
    if label:
        actor.set_actor_label(label)
    return actor

# the sun: mid-afternoon over the North Sea coast (pitch down 35 degrees, from the south-south-west)
sun = spawn(unreal.DirectionalLight, rot=(0, -35, 200), label="Sun")
sun_c = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun_c.set_editor_property("intensity", 10.0)
sun_c.set_editor_property("atmosphere_sun_light", True)

spawn(unreal.SkyAtmosphere, label="SkyAtmosphere")
spawn(unreal.VolumetricCloud, label="Clouds")
sky = spawn(unreal.SkyLight, label="SkyLight")
sky_c = sky.get_component_by_class(unreal.SkyLightComponent)
sky_c.set_editor_property("real_time_capture", True)

fog = spawn(unreal.ExponentialHeightFog, label="Haze")
fog_c = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
fog_c.set_editor_property("fog_density", 0.01)

# one unbound post-process volume: Lumen for global illumination and reflections
ppv = spawn(unreal.PostProcessVolume, label="Look")
ppv.set_editor_property("unbound", True)

unreal.log("FishDock: sun, sky, clouds, haze and post-process volume added. Add a Water Body Ocean by hand.")
