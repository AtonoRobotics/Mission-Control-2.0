#!/usr/bin/env bash
# Stops the Isaac ROS container gracefully
set -euo pipefail

CONTAINER_NAME="isaac-ros-rosbridge"
docker stop -t 10 "$CONTAINER_NAME" 2>/dev/null || true
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
