Run drift detection for a robot configuration bundle.

Usage: /project:audit-drift <robot_id>
Example: /project:audit-drift 7

Steps:
1. Fetch robot_id=$ARGUMENTS from DB Agent.
2. List all registered artifacts for this robot from File Agent.
3. For each artifact, check file hash against registry.
4. Check all joint/link names against current DB.
5. Check version tags against current system constants.
6. Compute drift score and report: CLEAN / INFO / WARN / CRITICAL.
7. For CRITICAL: list specific actions needed to restore integrity.

Do NOT modify any files during this audit — read only.
