# MODULE: urdf_build/link_rules
# Loaded by: URDF Build Agent
# Size: 28 lines
# Version: 1.0.0

## URDF Link Requirements

Source for all values: empirical DB via DB Agent. No exceptions.

### Required per link (missing = structural failure, not NULL)
- `name` — exact string from DB, case-sensitive
- `visual geometry` — mesh filename, referenced by registry path
- `collision geometry` — mesh or primitive

### Critical NULLs (block promotion if NULL)
- `inertial mass` — in kg
- `inertial origin xyz` — center of mass location
- `inertial inertia ixx` — moment of inertia
- `inertial inertia iyy`
- `inertial inertia izz`
- `inertial inertia ixy` — product of inertia
- `inertial inertia ixz`
- `inertial inertia iyz`

### Mesh References
Mesh filenames are paths relative to the URDF package.
Paths come from the asset registry — never constructed from assumptions.
Format: `package://robot_description/meshes/<filename>.stl`
Never use .obj or .dae unless confirmed in asset registry.

### Camera Mount Links
ZED X mount link must have correct frame_id matching sensor config registry.
frame_id sourced from sensor config registry — never assumed or constructed.

### Confidence Scores Required
Mass sourced from DB: 1.0
Inertia tensor sourced from DB: 1.0
Mesh path from registry: 1.0
Any value not from DB: 0.0 → NULL
