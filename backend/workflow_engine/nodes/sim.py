"""
Mission Control — Isaac Sim Workflow Nodes
All simulation operations run inside the isaac-sim container via docker exec.

Each node sends a Python snippet to Isaac Sim's Kit runtime. The container
must be running with SimulationApp initialized (headless or GUI mode).
"""

import json
import textwrap

import docker
import structlog
from typing import Any, TYPE_CHECKING

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)

_SIM_CONTAINER = "isaac-sim"


def _get_docker_client() -> docker.DockerClient:
    return docker.from_env()


def _exec_sim_python(client: docker.DockerClient, script: str, run_id: str) -> dict[str, Any]:
    """Execute a Python snippet inside the isaac-sim container.

    Returns {"status": "ok"|"failed", "stdout": str, "stderr": str, "exit_code": int}.
    """
    try:
        container = client.containers.get(_SIM_CONTAINER)
    except docker.errors.NotFound:
        return {
            "status": "failed",
            "error": f"Container not found: {_SIM_CONTAINER}",
        }

    if container.status != "running":
        return {
            "status": "failed",
            "error": f"Container is not running (status: {container.status})",
        }

    exec_result = container.exec_run(
        cmd=["python3", "-c", script],
        workdir="/workdir",
        demux=True,
    )
    stdout = (exec_result.output[0] or b"").decode("utf-8", errors="replace")
    stderr = (exec_result.output[1] or b"").decode("utf-8", errors="replace")
    exit_code = exec_result.exit_code

    logger.info("sim_exec", exit_code=exit_code, run_id=run_id)

    return {
        "status": "ok" if exit_code == 0 else "failed",
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
    }


def _parse_json_output(result: dict[str, Any]) -> dict[str, Any]:
    """Try to parse JSON from stdout and merge into result."""
    if result["status"] != "ok":
        return result
    try:
        parsed = json.loads(result["stdout"])
        result.update(parsed)
    except (json.JSONDecodeError, KeyError):
        pass
    return result


class SimLoadStageNode(NodeHandler):
    """Load a USD stage into Isaac Sim.

    params:
      usd_path: str — path to USD file (inside container, e.g. /registry/usd/scene.usd)
      nucleus_path: str | None — Nucleus server path (alternative to local)
    output:
      stage_id: str — opened stage identifier
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        usd_path = params.get("usd_path", "")
        nucleus_path = params.get("nucleus_path")
        source = nucleus_path or usd_path

        if not source:
            return {"status": "failed", "error": "No usd_path or nucleus_path provided"}

        script = textwrap.dedent(f"""\
            import json
            import omni.usd
            stage_ref = omni.usd.get_context()
            result = stage_ref.open_stage("{source}")
            stage = stage_ref.get_stage()
            root = str(stage.GetDefaultPrim().GetPath()) if stage.GetDefaultPrim() else "/"
            print(json.dumps({{"stage_id": root, "opened": bool(result)}}))
        """)

        client = _get_docker_client()
        result = _exec_sim_python(client, script, run.run_id)
        result = _parse_json_output(result)

        logger.info("sim_load_stage", source=source, run_id=run.run_id)
        return result


class SimSetLightingNode(NodeHandler):
    """Configure scene lighting.

    params:
      preset: str — "indoor", "outdoor", "studio", or "custom"
      intensity: float | None — light intensity (default varies by preset)
      color_temp: float | None — color temperature in Kelvin
      hdri_path: str | None — path to HDRI dome light texture
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        preset = params.get("preset", "studio")
        intensity = params.get("intensity", 1000.0)
        color_temp = params.get("color_temp", 6500.0)
        hdri_path = params.get("hdri_path")

        if hdri_path:
            script = textwrap.dedent(f"""\
                import json
                from pxr import Sdf, UsdLux
                import omni.usd
                stage = omni.usd.get_context().get_stage()
                light_path = Sdf.Path("/World/DomeLight")
                dome = UsdLux.DomeLight.Define(stage, light_path)
                dome.GetIntensityAttr().Set({intensity})
                dome.GetTextureFileAttr().Set("{hdri_path}")
                print(json.dumps({{"light_type": "dome", "path": str(light_path), "hdri": "{hdri_path}"}}))
            """)
        else:
            script = textwrap.dedent(f"""\
                import json
                from pxr import Sdf, UsdLux
                import omni.usd
                stage = omni.usd.get_context().get_stage()
                light_path = Sdf.Path("/World/DistantLight")
                light = UsdLux.DistantLight.Define(stage, light_path)
                light.GetIntensityAttr().Set({intensity})
                light.GetColorTemperatureAttr().Set({color_temp})
                light.GetEnableColorTemperatureAttr().Set(True)
                print(json.dumps({{"light_type": "distant", "path": str(light_path), "preset": "{preset}"}}))
            """)

        client = _get_docker_client()
        result = _exec_sim_python(client, script, run.run_id)
        result = _parse_json_output(result)

        logger.info("sim_set_lighting", preset=preset, run_id=run.run_id)
        return result


class SimPlaceRobotNode(NodeHandler):
    """Place a robot in the scene from URDF.

    params:
      urdf_path: str — path to URDF file (inside container)
      prim_path: str — USD prim path for the robot (default: /World/Robot)
      position: list[float] — [x, y, z] in meters (default: [0, 0, 0])
      orientation: list[float] — [w, x, y, z] quaternion (default: [1, 0, 0, 0])
      fix_base: bool — fix base link to world (default: true)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        urdf_path = params.get("urdf_path", "")
        prim_path = params.get("prim_path", "/World/Robot")
        position = params.get("position", [0, 0, 0])
        orientation = params.get("orientation", [1, 0, 0, 0])
        fix_base = params.get("fix_base", True)

        if not urdf_path:
            return {"status": "failed", "error": "urdf_path is required"}

        pos_str = str(position)
        orient_str = str(orientation)

        script = textwrap.dedent(f"""\
            import json
            import omni.kit.commands
            _, import_config = omni.kit.commands.execute("URDFCreateImportConfig")
            import_config.set_merge_fixed_joints(False)
            import_config.set_fix_base({fix_base})
            import_config.set_make_default_prim(False)
            import_config.set_create_physics_scene(False)
            import_config.set_distance_scale(1.0)
            import_config.set_collision_from_visuals(True)

            status, prim_path = omni.kit.commands.execute(
                "URDFParseAndImportFile",
                urdf_path="{urdf_path}",
                import_config=import_config,
                dest_path="{prim_path}",
                get_articulation_root=False,
            )

            # Set position and orientation
            from pxr import UsdGeom, Gf
            import omni.usd
            stage = omni.usd.get_context().get_stage()
            prim = stage.GetPrimAtPath("{prim_path}")
            if prim.IsValid():
                xform = UsdGeom.Xformable(prim)
                xform.ClearXformOpOrder()
                pos = {pos_str}
                orient = {orient_str}
                xform.AddTranslateOp().Set(Gf.Vec3d(*pos))
                xform.AddOrientOp().Set(Gf.Quatd(orient[0], orient[1], orient[2], orient[3]))

            print(json.dumps({{
                "prim_path": "{prim_path}",
                "urdf_path": "{urdf_path}",
                "placed": prim.IsValid() if prim else False,
            }}))
        """)

        client = _get_docker_client()
        result = _exec_sim_python(client, script, run.run_id)
        result = _parse_json_output(result)

        logger.info("sim_place_robot", urdf_path=urdf_path, prim_path=prim_path, run_id=run.run_id)
        return result


class SimSetPhysicsNode(NodeHandler):
    """Configure physics simulation parameters.

    params:
      gravity: list[float] — gravity vector (default: [0, 0, -9.81])
      timestep: float — simulation timestep in seconds (default: 1/60)
      solver_type: str — "TGS" or "PGS" (default: "TGS")
      gpu_enabled: bool — use GPU physics (default: true)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        gravity = params.get("gravity", [0, 0, -9.81])
        timestep = params.get("timestep", 1.0 / 60.0)
        solver_type = params.get("solver_type", "TGS")
        gpu_enabled = params.get("gpu_enabled", True)

        grav_str = str(gravity)

        script = textwrap.dedent(f"""\
            import json
            from pxr import UsdPhysics, Gf, PhysxSchema
            import omni.usd
            stage = omni.usd.get_context().get_stage()

            # Find or create physics scene
            physics_scene_path = "/World/PhysicsScene"
            scene_prim = stage.GetPrimAtPath(physics_scene_path)
            if not scene_prim.IsValid():
                scene = UsdPhysics.Scene.Define(stage, physics_scene_path)
            else:
                scene = UsdPhysics.Scene(scene_prim)

            gravity = {grav_str}
            scene.GetGravityDirectionAttr().Set(Gf.Vec3f(0, 0, -1))
            scene.GetGravityMagnitudeAttr().Set(abs(gravity[2]))

            # PhysX-specific settings
            physx = PhysxSchema.PhysxSceneAPI.Apply(scene.GetPrim())
            physx.GetTimeStepsPerSecondAttr().Set(int(1.0 / {timestep}))
            physx.GetEnableGPUDynamicsAttr().Set({gpu_enabled})
            physx.GetBroadphaseTypeAttr().Set("GPU" if {gpu_enabled} else "MBP")

            print(json.dumps({{
                "physics_scene": physics_scene_path,
                "gravity": gravity,
                "timestep": {timestep},
                "solver": "{solver_type}",
                "gpu": {gpu_enabled},
            }}))
        """)

        client = _get_docker_client()
        result = _exec_sim_python(client, script, run.run_id)
        result = _parse_json_output(result)

        logger.info("sim_set_physics", timestep=timestep, gpu=gpu_enabled, run_id=run.run_id)
        return result


class SimResetNode(NodeHandler):
    """Reset simulation to initial state.

    params:
      clear_scene: bool — if true, remove all non-default prims (default: false)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        clear_scene = params.get("clear_scene", False)

        script = textwrap.dedent(f"""\
            import json
            import omni.timeline
            timeline = omni.timeline.get_timeline_interface()
            timeline.stop()
            timeline.set_current_time(0)

            cleared = False
            if {clear_scene}:
                import omni.usd
                stage = omni.usd.get_context().get_stage()
                from pxr import Sdf
                root = stage.GetPseudoRoot()
                for child in root.GetChildren():
                    path = str(child.GetPath())
                    if path not in ["/World"]:
                        stage.RemovePrim(Sdf.Path(path))
                cleared = True

            print(json.dumps({{"reset": True, "cleared": cleared, "time": 0.0}}))
        """)

        client = _get_docker_client()
        result = _exec_sim_python(client, script, run.run_id)
        result = _parse_json_output(result)

        logger.info("sim_reset", clear_scene=clear_scene, run_id=run.run_id)
        return result


class SimPlayNode(NodeHandler):
    """Start simulation playback.

    params:
      duration: float | None — run for N seconds then auto-stop (None = indefinite)
      realtime: bool — run at realtime speed (default: true)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        duration = params.get("duration")
        realtime = params.get("realtime", True)

        if duration:
            script = textwrap.dedent(f"""\
                import json, time
                import omni.timeline
                timeline = omni.timeline.get_timeline_interface()
                timeline.set_play_every_frame(not {realtime})
                timeline.play()
                time.sleep({duration})
                timeline.pause()
                current = timeline.get_current_time()
                print(json.dumps({{"playing": False, "paused_at": current, "ran_for": {duration}}}))
            """)
        else:
            script = textwrap.dedent("""\
                import json
                import omni.timeline
                timeline = omni.timeline.get_timeline_interface()
                timeline.play()
                print(json.dumps({"playing": True}))
            """)

        client = _get_docker_client()
        result = _exec_sim_python(client, script, run.run_id)
        result = _parse_json_output(result)

        logger.info("sim_play", duration=duration, run_id=run.run_id)
        return result


class SimStopNode(NodeHandler):
    """Stop simulation playback.

    params: (none required)
    output:
      stopped_at: float — simulation time when stopped
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        script = textwrap.dedent("""\
            import json
            import omni.timeline
            timeline = omni.timeline.get_timeline_interface()
            current = timeline.get_current_time()
            timeline.stop()
            print(json.dumps({"stopped": True, "stopped_at": current}))
        """)

        client = _get_docker_client()
        result = _exec_sim_python(client, script, run.run_id)
        result = _parse_json_output(result)

        logger.info("sim_stop", run_id=run.run_id)
        return result
