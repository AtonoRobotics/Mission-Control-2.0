# MODULE: validation/script_imports
# Loaded by: Script Generation Agent, Validator Agent
# Lines: 32 | Version: 1.0.0

## Script Import Verification

Every Python import in a generated script must be confirmed available
in the target container before the script is accepted.

### Known Available Packages by Container

**isaac-ros-main**
`rclpy` | `std_msgs` | `sensor_msgs` | `geometry_msgs` | `tf2_ros`
`numpy` | `structlog` | `yaml` | `json` | `pathlib` | `subprocess`

**isaac-sim**
`omni` | `omni.isaac.core` | `omni.isaac.kit` | `omni.usd`
`numpy` | `structlog` | `carb`

**isaac-lab**
`omni.isaac.lab` | `torch` | `numpy` | `gymnasium`
`structlog` | `json` | `pathlib`

**groot** (future — stub)
Package list not yet verified. All imports must be marked as UNVERIFIED.

**cosmos** (future — stub)
Package list not yet verified. All imports must be marked as UNVERIFIED.

### Validator Check
For each `import` statement in a script:
1. Identify target container from script type
2. Check package against known list above
3. Found → confidence 1.0 for that import
4. Not found, not stub container → FAIL with `IMPORT_UNAVAILABLE` error
5. Not found, stub container (groot/cosmos) → WARN with `IMPORT_UNVERIFIED`

### Script Generation Rule
Never import a package not on the known list for the target container.
If functionality requires an unavailable package, surface it as a WARN
and add a TODO comment in the script.
