# MODULE: ros2_constraints
# Loaded by: Sensor Config, Launch File agents
# Size: 10 lines
# Version: 1.0.0

## ROS2 Constraints

ROS2 Jazzy is NEVER installed on the host machine.
All ROS2 lives exclusively inside the isaac-ros-main container.
Never reference host-local ROS2 installation paths in any output.
All ROS2 topic names must be confirmed against the active rosbridge topic list.
Never construct topic names from conventions or assumptions.
Namespace and ROS_DOMAIN_ID come from environment variables only.
