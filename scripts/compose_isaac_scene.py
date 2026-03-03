#!/usr/bin/env python3
"""Compose a USD stage from a SceneConfig JSON file.

Takes the SceneConfig produced by the Mission Control scene builder and
creates a USD stage with references to NVIDIA Nucleus assets. The output
can be opened directly in Isaac Sim for photorealistic RTX rendering.

Usage:
    python scripts/compose_isaac_scene.py scene.json output.usd

Requires: pxr (USD) — available via `pip install usd-core` or inside Isaac Sim.
"""

import argparse
import json
import math
import sys
from pathlib import Path

try:
    from pxr import Gf, Sdf, Usd, UsdGeom, UsdLux
except ImportError:
    print("ERROR: pxr (USD) not available.")
    print("Install with: pip install usd-core")
    print("Or run inside Isaac Sim container.")
    sys.exit(1)


# Map asset_id → Nucleus path for NVIDIA assets
NVIDIA_ASSET_PATHS: dict[str, str] = {
    "nvidia_env_simple_warehouse": "/Isaac/Environments/Simple_Warehouse/full_warehouse.usd",
    "nvidia_env_grid_default": "/Isaac/Environments/Grid/default_environment.usd",
    "nvidia_env_simple_room": "/Isaac/Environments/Simple_Room/simple_room.usd",
    "nvidia_env_hospital": "/Isaac/Environments/Hospital/hospital.usd",
    "nvidia_env_office": "/Isaac/Environments/Office/office.usd",
    "nvidia_robot_franka_panda": "/Isaac/Robots/Franka/franka_alt_fingers.usd",
    "nvidia_robot_ur10": "/Isaac/Robots/UniversalRobots/ur10/ur10.usd",
    "nvidia_robot_carter_v2": "/Isaac/Robots/Carter/carter_v2.usd",
    "nvidia_obj_ycb_cracker_box": "/Isaac/Props/YCB/Axis_Aligned/003_cracker_box.usd",
    "nvidia_obj_ycb_mug": "/Isaac/Props/YCB/Axis_Aligned/025_mug.usd",
    "nvidia_obj_ycb_banana": "/Isaac/Props/YCB/Axis_Aligned/011_banana.usd",
    "nvidia_obj_pallet": "/Isaac/Props/Warehouse/Pallets/pallet.usd",
    "nvidia_obj_table": "/Isaac/Props/Furniture/Table/table.usd",
}

# Built-in light types (no USD reference, create native prims)
BUILTIN_LIGHTS = {
    "nvidia_light_dome": "DomeLight",
    "nvidia_light_distant": "DistantLight",
    "nvidia_light_sphere": "SphereLight",
}


def sanitize_prim_name(label: str) -> str:
    """Convert a human label to a valid USD prim name."""
    name = label.replace(" ", "_").replace("-", "_")
    # Remove any non-alphanumeric/underscore characters
    name = "".join(c for c in name if c.isalnum() or c == "_")
    if not name or name[0].isdigit():
        name = "Asset_" + name
    return name


def add_placement(stage: Usd.Stage, placement: dict, index: int) -> None:
    """Add a single placement to the USD stage."""
    asset_id = placement["asset_id"]
    asset_type = placement["asset_type"]
    label = placement.get("label", f"asset_{index}")
    prim_name = sanitize_prim_name(label)

    # Ensure unique prim path
    base_path = f"/World/{prim_name}"
    prim_path = base_path
    suffix = 1
    while stage.GetPrimAtPath(prim_path).IsValid():
        prim_path = f"{base_path}_{suffix}"
        suffix += 1

    pos = placement.get("position", {"x": 0, "y": 0, "z": 0})
    rot = placement.get("rotation", {"x": 0, "y": 0, "z": 0})
    scale = placement.get("scale", {"x": 1, "y": 1, "z": 1})

    # Handle built-in lights
    if asset_id in BUILTIN_LIGHTS:
        light_type = BUILTIN_LIGHTS[asset_id]
        if light_type == "DomeLight":
            light = UsdLux.DomeLight.Define(stage, prim_path)
            light.GetIntensityAttr().Set(1000.0)
        elif light_type == "DistantLight":
            light = UsdLux.DistantLight.Define(stage, prim_path)
            light.GetIntensityAttr().Set(3000.0)
            light.GetAngleAttr().Set(0.53)
        elif light_type == "SphereLight":
            light = UsdLux.SphereLight.Define(stage, prim_path)
            light.GetIntensityAttr().Set(30000.0)
            light.GetRadiusAttr().Set(0.1)

        xform = UsdGeom.Xformable(light.GetPrim())
        _apply_transform(xform, pos, rot, scale)
        return

    # Handle sensors (built-in, create placeholder xform with metadata)
    if asset_type == "sensor":
        xform = UsdGeom.Xform.Define(stage, prim_path)
        xform.GetPrim().SetMetadata("comment", f"Sensor: {asset_id}")
        _apply_transform(xform, pos, rot, scale)
        return

    # Handle referenced assets (environments, robots, objects)
    nucleus_path = NVIDIA_ASSET_PATHS.get(asset_id)
    if not nucleus_path:
        # Not a known NVIDIA asset — create xform placeholder
        xform = UsdGeom.Xform.Define(stage, prim_path)
        xform.GetPrim().SetMetadata("comment", f"Unknown asset: {asset_id}")
        _apply_transform(xform, pos, rot, scale)
        return

    # Create Xform and add reference to Nucleus asset
    xform = UsdGeom.Xform.Define(stage, prim_path)
    xform.GetPrim().GetReferences().AddReference(nucleus_path)
    _apply_transform(xform, pos, rot, scale)


def _apply_transform(
    xform: UsdGeom.Xformable,
    pos: dict,
    rot: dict,
    scale: dict,
) -> None:
    """Apply translate, rotate, scale ops to an Xformable prim.

    SceneConfig uses degrees; USD uses degrees for Euler angles.
    SceneConfig coordinate system: x=right, y=forward, z=up (matches USD Z-up).
    """
    xform.AddTranslateOp().Set(Gf.Vec3d(pos["x"], pos["y"], pos["z"]))

    # Apply rotations as individual XYZ Euler ops (in degrees)
    if rot["x"] != 0:
        xform.AddRotateXOp().Set(float(rot["x"]))
    if rot["y"] != 0:
        xform.AddRotateYOp().Set(float(rot["y"]))
    if rot["z"] != 0:
        xform.AddRotateZOp().Set(float(rot["z"]))

    # Apply non-uniform scale if not identity
    if scale["x"] != 1 or scale["y"] != 1 or scale["z"] != 1:
        xform.AddScaleOp().Set(Gf.Vec3f(scale["x"], scale["y"], scale["z"]))


def has_light_placement(placements: list[dict]) -> bool:
    """Check if any placement is a light."""
    return any(p.get("asset_type") == "light" for p in placements)


def compose_scene(scene_config: dict, output_path: str) -> None:
    """Compose a USD stage from a SceneConfig dictionary."""
    stage = Usd.Stage.CreateNew(output_path)

    # Set stage metadata
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    stage.SetStartTimeCode(0)
    stage.SetEndTimeCode(240)

    # Create world root
    UsdGeom.Xform.Define(stage, "/World")

    placements = scene_config.get("placements", [])

    # Add default lighting if no lights in config
    if not has_light_placement(placements):
        dome = UsdLux.DomeLight.Define(stage, "/World/DefaultDomeLight")
        dome.GetIntensityAttr().Set(1000.0)
        distant = UsdLux.DistantLight.Define(stage, "/World/DefaultDistantLight")
        distant.GetIntensityAttr().Set(3000.0)
        distant.GetAngleAttr().Set(0.53)
        xform = UsdGeom.Xformable(distant.GetPrim())
        xform.AddRotateXOp().Set(-45.0)
        xform.AddRotateYOp().Set(30.0)

    # Add each placement
    for i, placement in enumerate(placements):
        add_placement(stage, placement, i)

    # Set default prim
    world_prim = stage.GetPrimAtPath("/World")
    stage.SetDefaultPrim(world_prim)

    stage.GetRootLayer().Save()
    print(f"Composed USD stage: {output_path}")
    print(f"  Placements: {len(placements)}")
    print(f"  Up axis: Z")
    print(f"  Default prim: /World")


def main():
    parser = argparse.ArgumentParser(
        description="Compose a USD stage from SceneConfig JSON"
    )
    parser.add_argument("scene_json", help="Path to SceneConfig JSON file")
    parser.add_argument("output_usd", help="Output USD file path")
    args = parser.parse_args()

    # Load SceneConfig
    scene_path = Path(args.scene_json)
    if not scene_path.exists():
        print(f"ERROR: {scene_path} not found")
        sys.exit(1)

    with open(scene_path) as f:
        scene_config = json.load(f)

    # Validate minimal structure
    if "placements" not in scene_config:
        print("ERROR: SceneConfig JSON must have a 'placements' array")
        sys.exit(1)

    compose_scene(scene_config, args.output_usd)


if __name__ == "__main__":
    main()
