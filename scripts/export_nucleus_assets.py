#!/usr/bin/env python3
"""Export NVIDIA Isaac Sim Nucleus assets to flat USD files.

Runs INSIDE the Isaac Sim container with access to the Nucleus client.
Resolves each asset path, flattens composition arcs, and writes to /export.

Usage (from host):
    docker run --rm --gpus all -e ACCEPT_EULA=Y \
      -v ~/mission-control/assets/usd_staging:/export \
      -v ~/mission-control/scripts/export_nucleus_assets.py:/export/export_nucleus_assets.py \
      nvcr.io/nvidia/isaac-sim:5.1.0 \
      /isaac-sim/python.sh /export/export_nucleus_assets.py
"""

import os
import sys

# Assets to export: (output_name, nucleus_path)
ASSETS = [
    ("nvidia_env_simple_warehouse", "/Isaac/Environments/Simple_Warehouse/full_warehouse.usd"),
    ("nvidia_env_grid_default", "/Isaac/Environments/Grid/default_environment.usd"),
    ("nvidia_env_simple_room", "/Isaac/Environments/Simple_Room/simple_room.usd"),
    ("nvidia_env_hospital", "/Isaac/Environments/Hospital/hospital.usd"),
    ("nvidia_env_office", "/Isaac/Environments/Office/office.usd"),
    ("nvidia_robot_franka_panda", "/Isaac/Robots/Franka/franka_alt_fingers.usd"),
    ("nvidia_robot_ur10", "/Isaac/Robots/UniversalRobots/ur10/ur10.usd"),
    ("nvidia_robot_carter_v2", "/Isaac/Robots/Carter/carter_v2.usd"),
    ("nvidia_obj_ycb_cracker_box", "/Isaac/Props/YCB/Axis_Aligned/003_cracker_box.usd"),
    ("nvidia_obj_ycb_mug", "/Isaac/Props/YCB/Axis_Aligned/025_mug.usd"),
    ("nvidia_obj_ycb_banana", "/Isaac/Props/YCB/Axis_Aligned/011_banana.usd"),
    ("nvidia_obj_pallet", "/Isaac/Props/Warehouse/Pallets/pallet.usd"),
    ("nvidia_obj_table", "/Isaac/Props/Furniture/Table/table.usd"),
]

EXPORT_DIR = "/export"


def main():
    # Import USD libraries (available inside Isaac Sim container)
    try:
        from pxr import Usd, UsdGeom, UsdUtils  # noqa: F401
    except ImportError:
        print("ERROR: pxr (USD) not available. This script must run inside Isaac Sim container.")
        sys.exit(1)

    # Try to initialize Omniverse for Nucleus access
    try:
        import omni.client  # noqa: F401
        print("Omniverse client available — Nucleus paths will resolve via CDN.")
    except ImportError:
        print("WARNING: omni.client not available. Only local/cached paths will work.")

    os.makedirs(EXPORT_DIR, exist_ok=True)

    succeeded = []
    failed = []

    for asset_name, nucleus_path in ASSETS:
        output_path = os.path.join(EXPORT_DIR, f"{asset_name}.usd")
        print(f"\n--- Exporting: {asset_name} ---")
        print(f"  Source: {nucleus_path}")
        print(f"  Output: {output_path}")

        try:
            # Open the stage from Nucleus
            stage = Usd.Stage.Open(nucleus_path)
            if not stage:
                # Try with omniverse:// prefix
                full_path = f"omniverse://localhost{nucleus_path}"
                print(f"  Retrying with: {full_path}")
                stage = Usd.Stage.Open(full_path)

            if not stage:
                print(f"  FAILED: Could not open stage")
                failed.append(asset_name)
                continue

            # Flatten the stage (resolves all references, sublayers, variants)
            flat_stage = stage.Flatten()

            # Export flattened stage
            flat_stage.Export(output_path)

            file_size = os.path.getsize(output_path)
            print(f"  OK: {file_size / 1024:.1f} KB")
            succeeded.append(asset_name)

        except Exception as e:
            print(f"  FAILED: {e}")
            failed.append(asset_name)

    # Summary
    print(f"\n{'='*60}")
    print(f"Export complete: {len(succeeded)} succeeded, {len(failed)} failed")
    if succeeded:
        print(f"  Succeeded: {', '.join(succeeded)}")
    if failed:
        print(f"  Failed: {', '.join(failed)}")
    print(f"Output directory: {EXPORT_DIR}")

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
