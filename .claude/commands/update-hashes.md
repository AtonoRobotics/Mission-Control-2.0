Regenerate module hashes after editing prompt modules.

Run this after ANY edit to files in prompts/.

Steps:
1. Run: python scripts/integrity/generate_module_hashes.py
2. Confirm the output lists all expected modules.
3. Stage the updated module_hashes.json: git add prompts/module_hashes.json
4. Remind: commit module_hashes.json in the same commit as the module changes.

If the hash generator fails, check that all modules have # Version: at line 3.
