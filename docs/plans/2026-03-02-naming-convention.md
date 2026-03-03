# Robot Builder — Naming Convention

**Date:** 2026-03-02
**Status:** Draft — pending research agent validation
**Author:** Samuel + Claude

---

## 1. URDF Naming

### Link Names
Pattern: `{robot_id}_{component_type}_{instance}_link`

Examples:
- `cr10_base_link` — robot base
- `cr10_link_1` through `cr10_link_6` — arm links (ROS Industrial convention)
- `cr10_camera_plate_link` — payload component
- `cr10_alexa_mini_link` — camera body
- `cr10_signature_35_link` — lens

### Joint Names
Pattern: `{robot_id}_{component_type}_{instance}_joint`

Examples:
- `cr10_joint_1` through `cr10_joint_6` — arm revolute joints
- `cr10_ee_fixed_joint` — end effector attachment (fixed)
- `cr10_camera_plate_joint` — payload attachment (fixed)
- `cr10_lens_joint` — lens mount (fixed)

### Frame Names
- `{robot_id}_base_link` — world-attached base frame
- `{robot_id}_tool0` — tool center point (ROS Industrial convention)
- `{robot_id}_ee_link` — end effector flange

## 2. USD Naming

### Prim Paths
Pattern: `/World/{RobotName}/{ComponentName}`

Examples:
- `/World/CR10` — robot root prim
- `/World/CR10/base_link` — base
- `/World/CR10/link_1` — arm link
- `/World/CR10/camera_plate` — payload
- `/World/CR10/alexa_mini` — camera body

### Articulation
- ArticulationRoot on the robot root prim
- Physics properties on each link prim
- Joint prims nested under child link

## 3. cuRobo Naming

Joint names must exactly match URDF joint names for the robot arm (non-fixed joints only):
- `cr10_joint_1` through `cr10_joint_6`

Payload components with fixed joints are NOT included in cuRobo config (cuRobo only handles actuated joints).

## 4. Guidelines

1. **snake_case everywhere** — URDF links, joints, USD prims, cuRobo references
2. **Robot ID prefix** on arm links/joints to avoid namespace collisions in multi-robot setups
3. **No prefix** on payload/sensor component names within their package scope
4. **`_link` suffix** on all URDF links, `_joint` suffix on all URDF joints
5. **`tool0`** for tool center point (ROS Industrial standard)
6. **Numbered joints** for the arm chain (`joint_1` not `shoulder_joint`) per ROS Industrial
7. **Component names** derived from `component.name` → slugified to snake_case

## 5. Open Questions

- [ ] Validate against NVIDIA Isaac Sim example robots (Franka, UR10, Kuka)
- [ ] Check if cinema industry has any frame naming standards
- [ ] Confirm cuRobo joint name matching requirements

*Research agent dispatch timed out. Manual validation against Isaac Sim examples recommended.*
