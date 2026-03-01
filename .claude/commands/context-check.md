Check context health and token usage for current session: $ARGUMENTS

Steps:
1. Estimate current context usage based on conversation length and loaded files.
2. Check if NOTES.md exists and is current (if this is a complex task).
3. List which CLAUDE.md files have been loaded this session.
4. Report any large files that were loaded (> 100 lines) and whether they are still needed.
5. Recommend whether to /clear context before the next task.

Context health signals:
- HEALTHY: < 30% of context used, NOTES.md up to date
- WARN: 30-70% used — write state to NOTES.md before next tool-heavy task
- CRITICAL: > 70% used — run /clear after writing NOTES.md, resume from notes

If $ARGUMENTS is a file path, estimate the token cost of loading that file.
