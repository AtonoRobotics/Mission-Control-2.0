# registry/ — File Registry
Loaded when working in registry/. This is where registered artifacts are stored.

## Structure
Each subdirectory is an artifact type:
- urdf/ — registered URDF files
- usd/ — registered USD assets
- launch/ — launch files
- sensor_configs/ — ZED X sensor configs
- curob_configs/ — cuRobo jerk configs
- scene_configs/ — scene configurations
- world_configs/ — world YAML configs
- scripts/ — validated Python scripts

## Rules — IMPORTANT
- NEVER write files here directly — File Agent + register_artifact() only
- Every file here has a SHA256 in the registry DB — manual edits will cause drift alerts
- NEVER delete files here — mark as deprecated in registry DB instead
- Drift detection runs weekly — hash mismatches are CRITICAL violations
