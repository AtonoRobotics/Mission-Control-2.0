# Isaac Sim 5.1 — USD Schema for Robot Prims

**Reference:** Isaac Sim 5.1 Conventions Documentation
**USD version:** USD 22.11+ (UsdLux API updated)

---

## Critical USD API Change (4.x → 5.x)

```python
# OLD (Isaac Sim 4.x) — WILL FAIL in 5.1
prim_utils.create_prim(
    "/World/Light",
    "SphereLight",
    attributes={"intensity": 600.0}   # ← bare attribute, deprecated
)

# NEW (Isaac Sim 5.1) — inputs: prefix required
prim_utils.create_prim(
    "/World/Light",
    "SphereLight",
    attributes={"inputs:intensity": 600.0}  # ← inputs: prefix
)
```

---

## Robot Prim Hierarchy

```
/World/
└── Robot/                              ← ArticulationRoot API applied here
    ├── base_link/                      ← RigidBodyAPI + CollisionAPI
    │   ├── physics:rigidBody           ← RigidBodyAPI schema
    │   ├── physics:mass                ← MassAPI (from URDF <inertial>)
    │   └── visuals/
    │       └── mesh                    ← UsdGeom.Mesh
    │
    ├── joint_1                         ← PhysicsRevoluteJoint or PrismaticJoint
    │   ├── physics:body0               ← rel to parent link
    │   ├── physics:body1               ← rel to child link
    │   ├── physics:axis                ← "X" | "Y" | "Z"
    │   ├── physics:lowerLimit          ← from URDF <limit lower>
    │   ├── physics:upperLimit          ← from URDF <limit upper>
    │   └── DriveAPI:angular            ← for revolute joints
    │       ├── physics:stiffness
    │       ├── physics:damping
    │       └── physics:targetPosition
    │
    └── link_1/
        ├── physics:rigidBody
        ├── physics:mass                ← MassAPI
        │   ├── physics:mass            ← from URDF <mass value>
        │   ├── physics:centerOfMass    ← from URDF <origin>
        │   └── physics:diagonalInertia ← from URDF <inertia> (ixx, iyy, izz)
        └── visuals/
```

---

## ArticulationRoot Setup

Must be set on the root prim (usually base_link or robot root):

```python
from pxr import UsdPhysics, PhysxSchema
import omni.usd

stage = omni.usd.get_context().get_stage()
robot_prim = stage.GetPrimAtPath("/World/Robot")

# Apply ArticulationRoot API
articulation_api = UsdPhysics.ArticulationRootAPI.Apply(robot_prim)

# PhysX articulation settings
physx_articulation = PhysxSchema.PhysxArticulationAPI.Apply(robot_prim)
physx_articulation.CreateEnabledSelfCollisionsAttr(False)
physx_articulation.CreateSolverPositionIterationCountAttr(8)
physx_articulation.CreateSolverVelocityIterationCountAttr(1)
```

---

## Joint Drive Configuration

```python
from pxr import UsdPhysics

joint_prim = stage.GetPrimAtPath("/World/Robot/joint_1")

# Apply DriveAPI (angular for revolute, linear for prismatic)
drive_api = UsdPhysics.DriveAPI.Apply(joint_prim, "angular")

# Position control
drive_api.CreateTypeAttr("force")            # "force" | "acceleration"
drive_api.CreateStiffnessAttr(1000.0)        # position stiffness
drive_api.CreateDampingAttr(50.0)            # velocity damping
drive_api.CreateTargetPositionAttr(0.0)      # initial target (radians)
drive_api.CreateMaxForceAttr(1000.0)         # effort limit (from URDF)
```

**Drive type selection:**
- Position control: set stiffness > 0, damping > 0, leave damping lower
- Velocity control: set stiffness = 0, set damping only
- Effort/torque control: set both = 0, apply forces directly

---

## MassAPI (Inertia Properties)

```python
from pxr import UsdPhysics
from pxr import Gf

link_prim = stage.GetPrimAtPath("/World/Robot/link_1")
mass_api = UsdPhysics.MassAPI.Apply(link_prim)

# From URDF <inertial>
mass_api.CreateMassAttr(2.5)                 # kg
mass_api.CreateCenterOfMassAttr(Gf.Vec3f(0.0, 0.0, 0.1))  # meters

# Diagonal inertia (ixx, iyy, izz from URDF)
mass_api.CreateDiagonalInertiaAttr(Gf.Vec3f(0.01, 0.01, 0.005))  # kg⋅m²

# Full inertia tensor (if off-diagonal terms exist in URDF)
mass_api.CreatePrincipalAxesAttr(Gf.Quatf(1, 0, 0, 0))  # rotation of principal axes
```

**NULL inertia handling (Mission Control policy):**
If inertia values are NULL in empirical DB:
- Do NOT set MassAPI inertia attributes
- Let PhysX auto-compute from mesh geometry
- Declare in null_fields output

---

## Collision Setup

```python
from pxr import UsdPhysics, PhysxSchema

link_prim = stage.GetPrimAtPath("/World/Robot/link_1")

# Apply CollisionAPI to link
collision_api = UsdPhysics.CollisionAPI.Apply(link_prim)

# PhysX collision shape config
physx_collision = PhysxSchema.PhysxCollisionAPI.Apply(link_prim)
physx_collision.CreateContactOffsetAttr(0.02)
physx_collision.CreateRestOffsetAttr(0.001)

# For mesh collision
mesh_prim = stage.GetPrimAtPath("/World/Robot/link_1/collision_mesh")
PhysxSchema.PhysxConvexHullCollisionAPI.Apply(mesh_prim)  # convex hull
# OR
PhysxSchema.PhysxTriangleMeshCollisionAPI.Apply(mesh_prim)  # exact (slower)
```

---

## Simulation Context Setup

```python
from isaacsim.core.api import SimulationContext

sim_context = SimulationContext(
    stage_units_in_meters=1.0,
    physics_dt=1.0/60.0,      # physics timestep
    rendering_dt=1.0/60.0,    # rendering timestep
    sim_params={
        "use_fabric": True,    # ← 5.1: was use_flatcache in 4.x
        "enable_scene_query_support": True,
        "use_gpu_pipeline": True,
    }
)
```

---

## Stage Loading

```python
from isaacsim.simulation_app import SimulationApp
from isaacsim.core.utils.stage import add_reference_to_stage
import omni.usd

simulation_app = SimulationApp({"headless": True})

# Load USD stage
omni.usd.get_context().open_stage("/path/to/scene.usd")

# Add robot reference
add_reference_to_stage(
    usd_path="/path/to/my_robot.usd",
    prim_path="/World/Robot",
)

# Add ground plane
from isaacsim.core.utils.prims import create_prim
create_prim(
    prim_path="/World/GroundPlane",
    prim_type="Plane",
    attributes={"inputs:size": 10.0}  # inputs: prefix required in 5.1
)
```

---

## Sensor Attachment (ZED X / Camera)

```python
from pxr import UsdGeom, Gf
import omni.replicator.core as rep

# Create camera prim
camera_prim = UsdGeom.Camera.Define(stage, "/World/Robot/end_effector/camera")
camera_prim.CreateFocalLengthAttr(24.0)      # mm
camera_prim.CreateHorizontalApertureAttr(36.0)

# Attach RGB annotator (for synthetic data)
render_product = rep.create.render_product("/World/Robot/end_effector/camera", (1280, 720))
rgb_annotator = rep.AnnotatorRegistry.get_annotator("rgb")
rgb_annotator.attach([render_product])

# Get data
simulation_app.update()
rgb_data = rgb_annotator.get_data()  # numpy array (H, W, 4) RGBA
```

---

## Getting/Setting Joint States

```python
from isaacsim.core.robots import Robot

robot = Robot(prim_path="/World/Robot", name="my_robot")
robot.initialize()

# Get joint positions (radians)
joint_positions = robot.get_joint_positions()  # np.ndarray (N_joints,)

# Get joint velocities (rad/s)
joint_velocities = robot.get_joint_velocities()  # np.ndarray (N_joints,)

# Set target positions (position control)
robot.set_joint_position_targets(
    positions=np.zeros(6),  # radians
    joint_indices=[0, 1, 2, 3, 4, 5]
)

# Apply joint efforts (torque control)
robot.apply_action(
    ArticulationAction(
        joint_efforts=np.array([10.0, 10.0, 5.0, 2.0, 2.0, 1.0])
    )
)
```
