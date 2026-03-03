"""
Mission Control — Config Generation Workflow Nodes
Generate robot configuration scaffolds: URDF, sensor YAML, launch files, cuRobo YAML.
"""

import yaml
import structlog
from typing import Any, TYPE_CHECKING

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)


class ConfigUrdfBuildNode(NodeHandler):
    """
    Generate URDF scaffold for a robot.
    params:
      robot_id: str
      name: str
      dof: int (optional)
      manufacturer: str (optional)
      model: str (optional)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        robot_id = params["robot_id"]
        name = params["name"]
        try:
            from services.robot_file_generator import generate_urdf

            content = generate_urdf(
                robot_id=robot_id,
                name=name,
                dof=params.get("dof"),
                manufacturer=params.get("manufacturer"),
                model=params.get("model"),
            )
            logger.info(
                "config_urdf_generated",
                robot_id=robot_id,
                name=name,
                run_id=run.run_id,
            )
            return {
                "status": "ok",
                "content": content,
                "file_type": "urdf",
                "robot_id": robot_id,
            }
        except Exception as e:
            logger.error("config_urdf_failed", robot_id=robot_id, error=str(e))
            return {"status": "failed", "robot_id": robot_id, "error": str(e)}


class ConfigSensorConfigNode(NodeHandler):
    """
    Generate a sensor configuration YAML.
    params:
      sensor_id: str
      sensor_type: str — e.g. "camera", "lidar", "imu"
      robot_id: str
      topics: list[str] — ROS topic names for this sensor
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        sensor_id = params["sensor_id"]
        sensor_type = params["sensor_type"]
        robot_id = params["robot_id"]
        topics = params.get("topics", [])
        try:
            config = {
                "sensor": {
                    "id": sensor_id,
                    "type": sensor_type,
                    "robot_id": robot_id,
                    "enabled": True,
                    "topics": [
                        {"name": t, "enabled": True} for t in topics
                    ],
                    "parameters": {
                        "frame_id": f"{robot_id}/{sensor_id}",
                        "update_rate": 30.0,
                    },
                },
            }
            content = yaml.dump(config, default_flow_style=False, sort_keys=False)
            logger.info(
                "config_sensor_generated",
                sensor_id=sensor_id,
                robot_id=robot_id,
                run_id=run.run_id,
            )
            return {
                "status": "ok",
                "content": content,
                "file_type": "sensor_yaml",
                "sensor_id": sensor_id,
                "robot_id": robot_id,
            }
        except Exception as e:
            logger.error(
                "config_sensor_failed", sensor_id=sensor_id, error=str(e)
            )
            return {
                "status": "failed",
                "sensor_id": sensor_id,
                "robot_id": robot_id,
                "error": str(e),
            }


class ConfigLaunchFileNode(NodeHandler):
    """
    Generate a ROS2 Python launch file scaffold.
    params:
      name: str — launch file name (e.g. "robot_bringup")
      pipeline_type: str — e.g. "bringup", "perception", "recording"
      robot_id: str
      nodes: list[dict] — each with "package", "executable", "params" (dict)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        name = params["name"]
        pipeline_type = params["pipeline_type"]
        robot_id = params["robot_id"]
        nodes = params.get("nodes", [])
        try:
            content = self._build_launch_file(name, pipeline_type, robot_id, nodes)
            logger.info(
                "config_launch_generated",
                name=name,
                robot_id=robot_id,
                node_count=len(nodes),
                run_id=run.run_id,
            )
            return {
                "status": "ok",
                "content": content,
                "file_type": "launch_py",
                "name": name,
                "robot_id": robot_id,
            }
        except Exception as e:
            logger.error("config_launch_failed", name=name, error=str(e))
            return {
                "status": "failed",
                "name": name,
                "robot_id": robot_id,
                "error": str(e),
            }

    @staticmethod
    def _build_launch_file(
        name: str, pipeline_type: str, robot_id: str, nodes: list[dict[str, Any]]
    ) -> str:
        lines = [
            '"""',
            f"Auto-generated ROS2 launch file: {name}",
            f"Pipeline: {pipeline_type} | Robot: {robot_id}",
            f"TODO: review and customise before deploying",
            '"""',
            "",
            "from launch import LaunchDescription",
            "from launch_ros.actions import Node",
            "",
            "",
            "def generate_launch_description() -> LaunchDescription:",
            "    nodes = []",
            "",
        ]

        for i, node_def in enumerate(nodes):
            pkg = node_def["package"]
            exe = node_def["executable"]
            node_params = node_def.get("params", {})
            var = f"node_{i}"
            lines.append(f"    {var} = Node(")
            lines.append(f'        package="{pkg}",')
            lines.append(f'        executable="{exe}",')
            lines.append(f'        name="{exe}_{i}",')
            if node_params:
                lines.append(f"        parameters=[{node_params!r}],")
            lines.append("    )")
            lines.append(f"    nodes.append({var})")
            lines.append("")

        lines.append("    return LaunchDescription(nodes)")
        lines.append("")
        return "\n".join(lines)


class ConfigCuroboConfigNode(NodeHandler):
    """
    Generate cuRobo YAML config for a robot.
    params:
      robot_id: str
      name: str
      dof: int (optional)
      manufacturer: str (optional)
      model: str (optional)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        robot_id = params["robot_id"]
        name = params["name"]
        try:
            from services.robot_file_generator import generate_curobo_yaml

            content = generate_curobo_yaml(
                robot_id=robot_id,
                name=name,
                dof=params.get("dof"),
                manufacturer=params.get("manufacturer"),
                model=params.get("model"),
            )
            logger.info(
                "config_curobo_generated",
                robot_id=robot_id,
                name=name,
                run_id=run.run_id,
            )
            return {
                "status": "ok",
                "content": content,
                "file_type": "curobo_yaml",
                "robot_id": robot_id,
            }
        except Exception as e:
            logger.error("config_curobo_failed", robot_id=robot_id, error=str(e))
            return {"status": "failed", "robot_id": robot_id, "error": str(e)}
