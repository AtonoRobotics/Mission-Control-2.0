# Isaac Sim 5.1 — URDF Import API Reference

**Version:** Isaac Sim 5.1.0
**Extension:** `isaacsim.asset.importer.urdf` (renamed from `omni.importer.urdf` in 4.x)
**Doc:** https://docs.isaacsim.omniverse.nvidia.com/5.1.0/importer_exporter/ext_isaacsim_asset_importer_urdf.html

---

## CRITICAL: Breaking API Changes from 4.x → 5.x

Qwen models may generate code using the OLD 4.x APIs. These will FAIL in Isaac Sim 5.1.

| Old (4.x) | New (5.1) | Notes |
|---|---|---|
| `from omni.importer.urdf import _urdf` | `from isaacsim.asset.importer.urdf import _urdf` | Extension renamed |
| `from omni.isaac.core.utils.extensions import ...` | `from isaacsim.core.utils.extensions import ...` | Package renamed |
| `from omni.isaac.examples.base_sample import BaseSample` | `from isaacsim.examples.interactive.base_sample import BaseSample` | Path changed |
| `omni.importer.urdf` (extension ID) | `isaacsim.asset.importer.urdf` (extension ID) | Manager search key |
| `from omni.physxflatcache import ...` | `from omni.physxfabric import ...` | Flatcache → Fabric |
| `use_flatcache` (param) | `use_fabric` (param) | SimulationContext param |

---

## Enable Extension

```python
# Isaac Sim 5.1 — extension enabled by default
# If disabled, enable via Extension Manager:
# Search for: isaacsim.asset.importer.urdf

# UI path: File > Import (for URDF)
# Python enable:
import omni.kit.app
# Extension auto-enabled when using standalone python
```

---

## Python API — Correct 5.1 Imports

```python
# CORRECT for Isaac Sim 5.1
from isaacsim import SimulationApp

simulation_app = SimulationApp({"headless": True})

# All omniverse imports MUST come AFTER SimulationApp instantiation
from isaacsim.examples.interactive.base_sample import BaseSample
from isaacsim.core.utils.extensions import get_extension_path_from_name
from isaacsim.asset.importer.urdf import _urdf  # ← correct 5.1 import
import omni.kit.commands
import omni.usd
```

---

## URDF Import — Complete Working Example (5.1)

```python
from isaacsim import SimulationApp
simulation_app = SimulationApp({"headless": True})

from isaacsim.asset.importer.urdf import _urdf
import omni.kit.commands

# Acquire URDF interface
urdf_interface = _urdf.acquire_urdf_interface()

# Configure import settings
import_config = _urdf.ImportConfig()
import_config.merge_fixed_joints = False    # keep all joints
import_config.convex_decomp = False          # use provided collision meshes
import_config.fix_base = True               # fixed-base robot (6-DOF arm)
import_config.make_default_prim = True
import_config.self_collision = False         # disable self-collision (recommended)
import_config.create_physics_scene = True
import_config.import_inertia_tensor = True   # import from URDF if available
import_config.default_drive_strength = 1047.19773  # stiffness
import_config.default_position_drive_damping = 52.35988
import_config.default_drive_type = _urdf.UrdfJointTargetType.JOINT_DRIVE_POSITION

# Import URDF
result, prim_path = omni.kit.commands.execute(
    "URDFParseAndImportFile",
    urdf_path="/path/to/my_robot.urdf",
    import_config=import_config,
    dest_path="/World/MyRobot",  # USD stage path
)

print(f"Imported to: {prim_path}")  # e.g. /World/MyRobot

simulation_app.close()
```

---

## ImportConfig Parameters Reference

```python
import_config = _urdf.ImportConfig()

# Base link
import_config.fix_base = True               # True for arms, False for mobile robots
import_config.root_link_name = ""           # override articulation root link (empty = auto)

# Joints
import_config.merge_fixed_joints = False    # merge fixed joints into parent
import_config.import_inertia_tensor = True  # use URDF inertia (if available)
                                             # False = PhysX auto-computes from mesh

# Collision
import_config.convex_decomp = False         # True = V-HACD decomposition on meshes
import_config.self_collision = False         # enables self-collision detection

# Drive
import_config.default_drive_type = _urdf.UrdfJointTargetType.JOINT_DRIVE_POSITION
import_config.default_drive_strength = 1047.19773     # position stiffness
import_config.default_position_drive_damping = 52.35988
import_config.distance_scale = 1.0          # unit conversion (1.0 = meters)

# Mesh
import_config.make_default_prim = True
import_config.create_physics_scene = True
import_config.default_density = 0.0         # 0.0 = PhysX auto-computes
```

---

## URDF Preprocessing Requirements

Isaac Sim 5.1 does NOT support:
- `<gazebo>` tags — remove before import
- `<transmission>` tags — remove before import
- Special characters in link/joint names — replace with underscore

Recommended preprocessing:
```python
import xml.etree.ElementTree as ET

def preprocess_urdf(input_path, output_path):
    tree = ET.parse(input_path)
    root = tree.getroot()

    # Remove unsupported tags
    for tag in ['gazebo', 'transmission']:
        for elem in root.findall(f'.//{tag}'):
            parent = root.find(f'.//{tag}/..')
            if parent is not None:
                parent.remove(elem)

    # Replace special chars in names
    import re
    for elem in root.iter():
        if 'name' in elem.attrib:
            elem.attrib['name'] = re.sub(r'[^a-zA-Z0-9_]', '_', elem.attrib['name'])

    tree.write(output_path)
```

---

## CLI URDF Conversion (Isaac Lab)

For Isaac Lab workflows, use the standalone converter:

```bash
cd IsaacLab

# Convert URDF to USD (instanceable format for large-scale sim)
./isaaclab.sh -p scripts/tools/convert_urdf.py \
    /path/to/my_robot.urdf \
    /path/to/output/my_robot.usd \
    --fix-base \                   # fixed-base robot
    --merge-joints \               # optional: merge fixed joints
    --make-instanceable \          # required for parallel sim
    --joint-stiffness 1000.0 \
    --joint-damping 50.0

# Result:
# my_robot.usd           — main asset (joints, links, no meshes)
# Props/instanceable_assets.usd  — mesh data (referenced)
```

---

## UrdfConverterCfg (Isaac Lab Python API)

```python
from isaaclab.sim.converters import UrdfConverterCfg, UrdfConverter

cfg = UrdfConverterCfg(
    asset_path="/path/to/my_robot.urdf",
    usd_dir="/path/to/output",
    usd_file_name="my_robot.usd",
    fix_base=True,
    merge_fixed_joints=False,
    self_collision=False,
    default_drive_type="position",   # "position" | "velocity" | "none"
    default_drive_stiffness=1000.0,
    default_drive_damping=50.0,
    make_instanceable=True,          # REQUIRED for parallel training
    override_inertia_from_mesh=False,  # True = ignore URDF inertia, recompute from mesh
)

converter = UrdfConverter(cfg)
# Creates USD at cfg.usd_dir / cfg.usd_file_name
```

---

## ROS2 Bridge URDF Import (Isaac Sim 5.1)

For importing directly from ROS2 robot_description:

```python
# Enable ROS2 bridge extension first
# Extension: omni.isaac.ros2_bridge.robot_description

# Then in URDF importer UI: switch from file to ROS2 Node
# Type node name in "Node" text box
# Click Refresh when settings change

# Supports XACRO (via ROS2 robot_description node)
```

---

## Output USD Prim Structure

After import, robot appears at specified dest_path:

```
/World/MyRobot          ← ArticulationRoot prim
├── base_link           ← RigidBody + Collision
│   └── geometry
├── joint_1             ← PhysicsRevoluteJoint or PrismaticJoint
│   └── DriveAPI
├── link_1              ← RigidBody + MassAPI + Collision
│   ├── geometry
│   └── Looks/          ← Materials
├── joint_2
├── link_2
...
└── end_effector
```

See `isaac_sim_5_1/usd_schema.md` for full prim attribute reference.

---

## Known Issues (Isaac Sim 5.1)

1. **Material name collision:** If multiple URDF meshes share a material name, only one is created.
   Workaround: ensure unique material names in URDF.

2. **USD prim naming:** Names starting with underscore get prefix `a` added.
   Fix: rename in URDF before import.

3. **Physics variant configs:** Isaac Sim 5.x creates configuration subfolders
   (`_base`, `_physics`, `_sensors`). This is expected behavior — not a bug.
   `_sensors` appearing empty is normal if no sensors defined in URDF.
