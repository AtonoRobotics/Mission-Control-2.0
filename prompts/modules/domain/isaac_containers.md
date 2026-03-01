# MODULE: isaac_containers
# Loaded by: Script Generation Agent, Container Agent, Launch File Agent
# Size: 22 lines
# Version: 1.0.0

## Isaac Container Execution Context

### Container Map (authoritative)
| Script Type | Target Container |
|---|---|
| Isaac Sim scene setup | isaac-sim |
| Isaac Lab RL training | isaac-lab |
| Isaac Lab environment definition | isaac-lab |
| GR00T training / fine-tune | groot |
| Cosmos world generation | cosmos |
| cuRobo config generation | isaac-ros-main |
| URDF generation / validation | isaac-ros-main |
| Sensor calibration | isaac-ros-main |
| ROS2 launch files | isaac-ros-main |
| rosbridge | isaac-ros-main |

### Execution Method
All script execution: `docker exec <container> python3 /scripts/<script_name>`
Scripts are mounted at `/scripts` via volume: `${MC_SCRIPT_REGISTRY_PATH}:/scripts:ro`

### ROS2 Constraint (critical)
ROS2 Jazzy is NEVER installed on the host machine.
All ROS2 commands execute inside isaac-ros-main via docker exec.
Never reference host-local ROS2 paths in any script or launch file.

### Path References in Scripts
All paths inside scripts use environment variables, not hardcoded values.
Scripts read env vars at runtime: `os.environ['MC_BAG_STORAGE_PATH']`
