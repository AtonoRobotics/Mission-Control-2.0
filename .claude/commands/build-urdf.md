Build a URDF for robot_id $ARGUMENTS.

Steps:
1. Use DB Agent to fetch all joints and links for robot_id $ARGUMENTS. Note any NULL fields.
2. Think hard about the build plan. If critical fields are NULL, surface them to the operator before proceeding.
3. Create a NOTES.md entry with the build plan and NULL report.
4. Dispatch to URDF Build Agent with robot_id=$ARGUMENTS and the DB data.
5. Send output to Validator Agent (blind — do not include generating agent identity).
6. On PASS or WARN: dispatch to File Agent to register. On FAIL: show failure report and await instruction.
7. Report final status: registered path, validation verdict, NULL fields, drift score.

Do NOT write any URDF content yourself. Do NOT fill NULL fields with estimates.
