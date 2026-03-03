#!/usr/bin/env bash
# Isaac ROS Container — starts isaac-ros-jazzy with rosbridge
# Used by isaac-ros.service systemd unit
set -euo pipefail

CONTAINER_NAME="isaac-ros-rosbridge"
IMAGE="isaac-ros-jazzy-4.2:latest"
ROSBRIDGE_PORT="${MC_ROSBRIDGE_PORT:-9090}"
ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-0}"

# Remove stale container if exists
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

exec docker run \
  --name "$CONTAINER_NAME" \
  --rm \
  --runtime nvidia \
  --network host \
  --ipc host \
  --entrypoint "" \
  -e NVIDIA_VISIBLE_DEVICES=all \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  -e ROS_DOMAIN_ID="$ROS_DOMAIN_ID" \
  -v /home/samuel/dobot_cr10:/workspace/dobot_cr10:ro \
  -v /home/samuel/mission-control/isaac/ros:/launch:ro \
  "$IMAGE" \
  bash -c "
    source /opt/ros/jazzy/setup.bash &&
    apt-get update -qq && apt-get install -y -qq ros-jazzy-rosbridge-server >/dev/null 2>&1 &&
    echo '[isaac-ros] rosbridge installed, starting on port $ROSBRIDGE_PORT' &&
    ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=$ROSBRIDGE_PORT
  "
