"""
Robot config file template generators.
Produces syntactically valid scaffolds for URDF, cuRobo YAML, and USD (USDA).
Placeholder values are marked with comments for the user to fill in.
"""

from typing import Optional


def generate_urdf(
    robot_id: str,
    name: str,
    dof: Optional[int] = None,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Generate a valid URDF scaffold for the given robot."""
    n_joints = dof or 6
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        f'<robot name="{name}">',
        f"  <!-- Auto-generated scaffold for {robot_id} -->",
        f"  <!-- Manufacturer: {manufacturer or 'unknown'} | Model: {model or 'unknown'} -->",
        f"  <!-- {n_joints} DOF — fill in real geometry, inertia, and limits -->",
        "",
        '  <link name="base_link">',
        "    <visual>",
        '      <geometry><cylinder length="0.1" radius="0.1"/></geometry>',
        "      <!-- TODO: replace with actual mesh -->",
        "    </visual>",
        "    <collision>",
        '      <geometry><cylinder length="0.1" radius="0.1"/></geometry>',
        "    </collision>",
        "    <inertial>",
        '      <mass value="1.0"/>',
        '      <inertia ixx="0.001" ixy="0" ixz="0" iyy="0.001" iyz="0" izz="0.001"/>',
        "      <!-- TODO: fill from empirical data -->",
        "    </inertial>",
        "  </link>",
        "",
    ]

    for i in range(1, n_joints + 1):
        parent = "base_link" if i == 1 else f"link_{i - 1}"
        child = f"link_{i}"
        lines += [
            f'  <joint name="joint_{i}" type="revolute">',
            f'    <parent link="{parent}"/>',
            f'    <child link="{child}"/>',
            '    <origin xyz="0 0 0.1" rpy="0 0 0"/>',
            '    <axis xyz="0 0 1"/>',
            f"    <!-- TODO: set real axis, origin, and limits for joint {i} -->",
            '    <limit lower="-3.14159" upper="3.14159" effort="100" velocity="2.0"/>',
            "  </joint>",
            "",
            f'  <link name="{child}">',
            "    <visual>",
            '      <geometry><cylinder length="0.15" radius="0.05"/></geometry>',
            "    </visual>",
            "    <collision>",
            '      <geometry><cylinder length="0.15" radius="0.05"/></geometry>',
            "    </collision>",
            "    <inertial>",
            '      <mass value="0.5"/>',
            '      <inertia ixx="0.0005" ixy="0" ixz="0" iyy="0.0005" iyz="0" izz="0.0005"/>',
            "    </inertial>",
            "  </link>",
            "",
        ]

    lines.append("</robot>")
    return "\n".join(lines)


def generate_curobo_yaml(
    robot_id: str,
    name: str,
    dof: Optional[int] = None,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Generate a cuRobo robot config YAML scaffold."""
    n_joints = dof or 6
    lines = [
        f"# cuRobo configuration for {name} ({robot_id})",
        f"# Manufacturer: {manufacturer or 'unknown'} | Model: {model or 'unknown'}",
        "# TODO: fill in real joint limits, link names, and collision spheres",
        "",
        "robot_cfg:",
        "  kinematics:",
        f'    urdf_path: "robots/{robot_id}/{robot_id}.urdf"',
        '    base_link: "base_link"',
        f'    ee_link: "link_{n_joints}"  # TODO: set actual end-effector link',
        "",
        "    cspace:",
        f"      joint_names:",
    ]

    for i in range(1, n_joints + 1):
        lines.append(f'        - "joint_{i}"')

    lines += [
        "",
        "      retract_config:",
    ]
    for i in range(n_joints):
        lines.append(f"        - 0.0  # joint_{i + 1} retract position")

    lines += [
        "",
        "      max_velocity:",
    ]
    for _ in range(n_joints):
        lines.append("        - 2.0  # rad/s — TODO: set from datasheet")

    lines += [
        "",
        "      max_acceleration:",
    ]
    for _ in range(n_joints):
        lines.append("        - 5.0  # rad/s² — TODO: set from datasheet")

    lines += [
        "",
        "      max_jerk:",
    ]
    for _ in range(n_joints):
        lines.append("        - 20.0  # rad/s³ — TODO: set from datasheet")

    lines += [
        "",
        "  collision_spheres: []  # TODO: generate with fit_collision_spheres.py",
        "",
        "  self_collision:",
        "    ignore_pairs: []",
        "",
    ]

    return "\n".join(lines)


def generate_usd(
    robot_id: str,
    name: str,
    dof: Optional[int] = None,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Generate a minimal USDA (ASCII USD) scaffold."""
    n_joints = dof or 6
    lines = [
        "#usda 1.0",
        "(",
        f'    defaultPrim = "{name}"',
        '    upAxis = "Z"',
        "    metersPerUnit = 1.0",
        ")",
        "",
        f'def Xform "{name}" (',
        "    kind = \"component\"",
        ")",
        "{",
        f'    # Auto-generated scaffold for {robot_id}',
        f'    # Manufacturer: {manufacturer or "unknown"} | Model: {model or "unknown"}',
        f'    # {n_joints} DOF — replace geometry with real meshes',
        "",
        '    def Xform "base_link"',
        "    {",
        '        def Cylinder "visual"',
        "        {",
        "            double height = 0.1",
        "            double radius = 0.1",
        "        }",
        "    }",
        "",
    ]

    for i in range(1, n_joints + 1):
        lines += [
            f'    def Xform "link_{i}"',
            "    {",
            f'        # TODO: joint_{i} articulation properties',
            f'        def Cylinder "visual"',
            "        {",
            "            double height = 0.15",
            "            double radius = 0.05",
            "        }",
            "    }",
            "",
        ]

    lines.append("}")
    return "\n".join(lines)
