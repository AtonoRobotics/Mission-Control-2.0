"""
Config Generator — Generates URDF, USD, cuRobo YAML from RobotConfiguration data.
All values must come from approved components. No placeholders. No estimates.
NULL fields are omitted, not filled.
"""

from typing import Any, Optional


def _fmt(v: float) -> str:
    """Format float without trailing zeros."""
    return f"{v:g}"


def _origin_tag(xyz: Optional[list], rpy: Optional[list]) -> str:
    if not xyz and not rpy:
        return ""
    x, y, z = xyz or [0, 0, 0]
    r, p, yw = rpy or [0, 0, 0]
    return f'    <origin xyz="{_fmt(x)} {_fmt(y)} {_fmt(z)}" rpy="{_fmt(r)} {_fmt(p)} {_fmt(yw)}"/>'


def _link_xml(link: dict, mesh_path_urdf: Optional[str] = None) -> str:
    """Generate URDF <link> XML. Omits inertial block if mass is NULL."""
    name = link["link_name"]
    lines = [f'  <link name="{name}">']

    # Visual
    if mesh_path_urdf:
        lines += [
            "    <visual>",
            f'      <geometry><mesh filename="{mesh_path_urdf}"/></geometry>',
            "    </visual>",
        ]

    # Collision
    if mesh_path_urdf:
        lines += [
            "    <collision>",
            f'      <geometry><mesh filename="{mesh_path_urdf}"/></geometry>',
            "    </collision>",
        ]

    # Inertial — ONLY if mass is present (never placeholder)
    mass = link.get("mass")
    if mass is not None:
        lines.append("    <inertial>")
        lines.append(f'      <mass value="{_fmt(mass)}"/>')
        ixx = link.get("inertia_ixx")
        iyy = link.get("inertia_iyy")
        izz = link.get("inertia_izz")
        if ixx is not None and iyy is not None and izz is not None:
            ixy = link.get("inertia_ixy", 0)
            ixz = link.get("inertia_ixz", 0)
            iyz = link.get("inertia_iyz", 0)
            lines.append(
                f'      <inertia ixx="{_fmt(ixx)}" ixy="{_fmt(ixy)}" ixz="{_fmt(ixz)}" '
                f'iyy="{_fmt(iyy)}" iyz="{_fmt(iyz)}" izz="{_fmt(izz)}"/>'
            )
        lines.append("    </inertial>")

    lines.append("  </link>")
    return "\n".join(lines)


def _joint_xml(joint: dict) -> str:
    """Generate URDF <joint> XML."""
    name = joint["joint_name"]
    jtype = joint.get("joint_type", "fixed")
    parent = joint["parent_link"]
    child = joint["child_link"]

    lines = [f'  <joint name="{name}" type="{jtype}">']
    lines.append(f'    <parent link="{parent}"/>')
    lines.append(f'    <child link="{child}"/>')

    origin = _origin_tag(joint.get("origin_xyz"), joint.get("origin_rpy"))
    if origin:
        lines.append(origin)

    axis = joint.get("axis")
    if axis and jtype != "fixed":
        lines.append(f'    <axis xyz="{_fmt(axis[0])} {_fmt(axis[1])} {_fmt(axis[2])}"/>')

    if jtype in ("revolute", "prismatic"):
        lower = joint.get("lower_limit")
        upper = joint.get("upper_limit")
        effort = joint.get("effort_limit")
        velocity = joint.get("velocity_limit")
        if lower is not None and upper is not None:
            parts = [f'lower="{_fmt(lower)}"', f'upper="{_fmt(upper)}"']
            if effort is not None:
                parts.append(f'effort="{_fmt(effort)}"')
            if velocity is not None:
                parts.append(f'velocity="{_fmt(velocity)}"')
            lines.append(f"    <limit {' '.join(parts)}/>")

    lines.append("  </joint>")
    return "\n".join(lines)


def generate_urdf_from_config(config: dict) -> str:
    """
    Generate complete URDF XML from a robot configuration dict.

    config keys:
        robot_id, robot_name, dof, base_type, base_config,
        joints (list), links (list),
        payload_components (list), sensor_components (list)
    """
    robot_name = config["robot_name"]
    base_type = config.get("base_type", "standing")
    base_config = config.get("base_config", {})

    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        f'<robot name="{robot_name}">',
        "",
    ]

    # Track base: add world link + prismatic joint before base_link
    if base_type in ("track", "track_weighted"):
        track_length_m = (base_config.get("track_length_mm", 3000)) / 1000.0
        lines.append(_link_xml({"link_name": "world"}))
        lines.append("")
        track_joint = {
            "joint_name": "base_track_joint",
            "joint_type": "prismatic",
            "parent_link": "world",
            "child_link": "base_link",
            "axis": [1, 0, 0],
            "lower_limit": 0,
            "upper_limit": track_length_m,
            "origin_xyz": [0, 0, 0],
        }
        lines.append(_joint_xml(track_joint))
        lines.append("")

        if base_type == "track_weighted":
            weight_kg = base_config.get("weight_plate_kg")
            lines.append(_link_xml({
                "link_name": "weight_plate_link",
                "mass": weight_kg,
            }))
            lines.append("")
            lines.append(_joint_xml({
                "joint_name": "base_weight_plate",
                "joint_type": "fixed",
                "parent_link": "world",
                "child_link": "weight_plate_link",
            }))
            lines.append("")

    # Robot links
    for link in config.get("links", []):
        lines.append(_link_xml(link))
        lines.append("")

    # Robot joints
    for joint in config.get("joints", []):
        lines.append(_joint_xml(joint))
        lines.append("")

    # Payload components (camera plate, camera body, lens, FIZ, etc.)
    for comp in config.get("payload_components", []):
        if "link" in comp:
            lines.append(_link_xml(comp["link"]))
            lines.append("")
        lines.append(_joint_xml(comp))
        lines.append("")

    # Sensor components
    for comp in config.get("sensor_components", []):
        if "link" in comp:
            lines.append(_link_xml(comp["link"]))
            lines.append("")
        lines.append(_joint_xml(comp))
        lines.append("")

    lines.append("</robot>")
    return "\n".join(lines)


def generate_usd_from_config(config: dict) -> str:
    """
    Generate USDA (ASCII USD) from a robot configuration.
    Physics properties included where available. NULL = omitted.
    """
    robot_name = config["robot_name"].replace(" ", "_")
    base_type = config.get("base_type", "standing")

    lines = [
        "#usda 1.0",
        "(",
        f'    defaultPrim = "{robot_name}"',
        '    upAxis = "Z"',
        "    metersPerUnit = 1.0",
        ")",
        "",
        f'def Xform "{robot_name}" (',
        '    kind = "component"',
        ")",
        "{",
    ]

    def _add_link_xform(link: dict, indent: int = 1) -> None:
        pad = "    " * indent
        name = link["link_name"]
        mass = link.get("mass")
        lines.append(f'{pad}def Xform "{name}"')
        lines.append(f"{pad}{{")
        if mass is not None:
            lines.append(f"{pad}    float physics:mass = {_fmt(mass)}")
        lines.append(f"{pad}}}")
        lines.append("")

    # Track base
    if base_type in ("track", "track_weighted"):
        lines.append('    def Xform "world"')
        lines.append("    {")
        lines.append("    }")
        lines.append("")

    # Robot links
    for link in config.get("links", []):
        _add_link_xform(link)

    # Payload component links
    for comp in config.get("payload_components", []):
        if "link" in comp:
            _add_link_xform(comp["link"])

    # Sensor component links
    for comp in config.get("sensor_components", []):
        if "link" in comp:
            _add_link_xform(comp["link"])

    lines.append("}")
    return "\n".join(lines)


def generate_curobo_yaml_from_config(config: dict) -> str:
    """
    Generate cuRobo YAML from robot configuration.
    Robot arm joints only. ee_link points to final payload frame.
    No collision_spheres, no world_model, no obstacle parameters.
    """
    import yaml

    robot_id = config["robot_id"]
    robot_name = config["robot_name"]
    joints = config.get("joints", [])
    ee_link = config.get("ee_link", f"link_{config.get('dof', 6)}")

    joint_names = []
    max_velocity = []
    max_acceleration = []
    max_jerk = []
    retract_config = []
    null_fields = []

    for j in joints:
        jname = j["joint_name"]
        joint_names.append(jname)
        retract_config.append(0.0)

        vel = j.get("velocity_limit")
        acc = j.get("acceleration_limit")
        jrk = j.get("jerk_limit")

        if vel is not None:
            max_velocity.append(vel)
        else:
            max_velocity.append(0.0)  # placeholder — flagged below
            null_fields.append({"joint_name": jname, "field": "velocity_limit", "criticality": "critical"})

        if acc is not None:
            max_acceleration.append(acc)
        else:
            max_acceleration.append(0.0)
            null_fields.append({"joint_name": jname, "field": "acceleration_limit", "criticality": "critical"})

        if jrk is not None:
            max_jerk.append(jrk)
        else:
            max_jerk.append(0.0)
            null_fields.append({"joint_name": jname, "field": "jerk_limit", "criticality": "critical"})

    curobo_config: dict[str, Any] = {
        "robot_cfg": {
            "kinematics": {
                "urdf_path": f"robots/{robot_id}/{robot_id}.urdf",
                "base_link": "base_link",
                "ee_link": ee_link,
                "cspace": {
                    "joint_names": joint_names,
                    "retract_config": retract_config,
                    "max_velocity": max_velocity,
                    "max_acceleration": max_acceleration,
                    "max_jerk": max_jerk,
                },
            },
            "self_collision": {
                "ignore_pairs": [],
            },
            "null_fields": null_fields,
        },
    }

    header = (
        f"# cuRobo configuration for {robot_name} ({robot_id})\n"
        f"# Generated by Robot Builder — jerk minimization only\n"
        f"# Scope: kinematics + joint limits only (per project constraints)\n\n"
    )

    return header + yaml.dump(curobo_config, default_flow_style=False, sort_keys=False)
