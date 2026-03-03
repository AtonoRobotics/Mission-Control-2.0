#!/usr/bin/env python3
"""Register cinema equipment as ConfigurationPackages in the robot-builder API."""
import requests
import sys

BASE = "http://localhost:8000"

PACKAGES = [
    {
        "name": "ARRI Alexa Mini",
        "package_type": "cinema_camera",
        "description": "Super 35 cinema camera, 4K ARRIRAW/ProRes, 120fps max",
        "component_tree": {
            "manufacturer": "ARRI",
            "sensor_size": "Super 35",
            "resolution": "4096x2160",
            "fps_max": 120,
            "recording_formats": ["ARRIRAW", "ProRes"],
            "weight_kg": 2.3,
            "dimensions_mm": [184.75, 124.83, 140.0],
            "lens_mount": "PL",
            "flange_distance_mm": 52.0,
            "mesh_visual": "meshes/alexa_mini.obj",
            "mesh_collision": "meshes/alexa_mini_collision.obj",
        },
    },
    {
        "name": "Zeiss CP.3 21mm T2.1",
        "package_type": "cinema_lens",
        "description": "PL-mount cinema prime, 21mm focal length",
        "component_tree": {
            "manufacturer": "Zeiss",
            "focal_length_mm": 21,
            "max_aperture": "T2.1",
            "min_focus_m": 0.3,
            "mount": "PL",
            "weight_kg": 0.98,
        },
    },
    {
        "name": "Zeiss CP.3 35mm T2.1",
        "package_type": "cinema_lens",
        "description": "PL-mount cinema prime, 35mm focal length",
        "component_tree": {
            "manufacturer": "Zeiss",
            "focal_length_mm": 35,
            "max_aperture": "T2.1",
            "min_focus_m": 0.3,
            "mount": "PL",
            "weight_kg": 1.0,
        },
    },
    {
        "name": "Zeiss CP.3 50mm T2.1",
        "package_type": "cinema_lens",
        "description": "PL-mount cinema prime, 50mm focal length",
        "component_tree": {
            "manufacturer": "Zeiss",
            "focal_length_mm": 50,
            "max_aperture": "T2.1",
            "min_focus_m": 0.45,
            "mount": "PL",
            "weight_kg": 1.0,
        },
    },
    {
        "name": "cmotion cPRO FIZ",
        "package_type": "fiz_motor",
        "description": "3-axis FIZ motor system, Ethernet/RS-485 control",
        "component_tree": {
            "manufacturer": "cmotion",
            "axes": ["Focus", "Iris", "Zoom"],
            "interface": "Ethernet/RS-485",
        },
    },
    {
        "name": "cmotion cforce mini RF",
        "package_type": "fiz_motor",
        "description": "Compact RF wireless lens motor",
        "component_tree": {
            "manufacturer": "cmotion",
            "axes": ["Focus"],
            "interface": "RF 2.4GHz",
        },
    },
    {
        "name": "O'Connor 2575 Fluid Head",
        "package_type": "camera_mount",
        "description": "Hydrostatic fluid head, 22.7kg payload, 75mm ball",
        "total_mass_kg": 6.2,
        "component_tree": {
            "manufacturer": "O'Connor",
            "payload_capacity_kg": 22.7,
            "ball_size_mm": 75,
        },
    },
    {
        "name": "Dovetail Baseplate",
        "package_type": "camera_mount",
        "description": "Generic dovetail baseplate for camera/robot mounting",
        "total_mass_kg": 0.8,
        "component_tree": {
            "manufacturer": "Generic",
            "type": "dovetail",
        },
    },
]


def main():
    login = requests.post(f"{BASE}/api/auth/login", json={
        "email": "admin@mc.local", "password": "admin"
    }, timeout=10)
    if login.status_code != 200:
        print(f"FAIL: Login {login.status_code}")
        return 1

    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    ok = 0
    for pkg in PACKAGES:
        r = requests.post(f"{BASE}/api/robot-builder/packages", json=pkg,
                          headers=headers, timeout=10)
        if r.status_code == 201:
            pid = r.json()["package_id"]
            print(f"  [OK] {pkg['name']:30s} -> {pid}")
            ok += 1
        else:
            print(f"  [FAIL] {pkg['name']:30s} -> {r.status_code}: {r.text[:100]}")

    print(f"\n{ok}/{len(PACKAGES)} packages registered")
    return 0 if ok == len(PACKAGES) else 1


if __name__ == "__main__":
    sys.exit(main())
