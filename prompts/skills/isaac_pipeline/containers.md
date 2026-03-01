# Containers
# Part of: isaac_pipeline skill
# Load when: any question about container responsibilities or exec targets

## Authoritative Container Map

| Container | Contents | Exec target for |
|---|---|---|
| isaac-ros-main | Isaac ROS 4.0, ROS2 Jazzy, rosbridge, nvblox, cuRobo, ZED X nodes | URDF validation, cuRobo runs, ROS2 launch, sensor config |
| isaac-sim | Isaac Sim 5.1, Omniverse | Scene setup, USD stage, simulation control |
| isaac-lab | Isaac Lab 2.3 | RL environment setup, training runs |
| groot | GR00T (future stub) | Neural policy training |
| cosmos | NVIDIA Cosmos (future stub) | World model generation |

## Rules
Container names are exact strings — never abbreviate.
Any container name not in this table = scope violation.
groot and cosmos are stubs — do not generate real exec targets for them.

## Package manifests
Use Container Agent `get_package_manifest()` to verify Python imports before script generation.
Never assume a package is available based on documentation alone.
