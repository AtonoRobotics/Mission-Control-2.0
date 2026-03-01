"""
Mission Control — Context Compaction Protocol
Implements Anthropic's recommended strategy for long-horizon agent tasks.

Anthropic: "Compaction is the practice of taking a conversation nearing the
context window limit, summarizing its contents, and reinitiating a new context
window with the summary."

This module provides:
1. NOTES.md writer — structured note-taking for agent state persistence
2. Compaction prompt — what to preserve vs discard during summarization
3. Session resume — how to reconstruct state from NOTES.md

Used by: orchestrator, any agent running multi-hour tasks (full fleet builds, audits)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

NOTES_FILE = Path("NOTES.md")  # Always at project root


# ── Note-taking: structured state persistence ─────────────────────────────────

NOTES_TEMPLATE = """\
# Mission Control — Session Notes
**Started:** {started}
**Task:** {task_description}
**robot_id(s):** {robot_ids}
**Complexity:** {complexity}

## Plan
{plan}

## Completed Steps
(updated as steps complete)

## Current State
(updated continuously — this is the compaction anchor)

## NULL Fields Encountered
(fields that were NULL in DB during this session)

## Decisions Made
(any operator decisions or deviations from standard flow)

## Pending
(what remains to be done)

## Artifacts Registered
(file registry IDs of completed outputs)
"""


def initialize_notes(
    task_description: str,
    robot_ids: list[int],
    complexity: str,
    plan: str,
) -> None:
    """
    Create NOTES.md at session start for any complex task.
    Called by orchestrator for COMPLEX and CRITICAL tasks.
    """
    content = NOTES_TEMPLATE.format(
        started=datetime.now(timezone.utc).isoformat(),
        task_description=task_description,
        robot_ids=", ".join(str(r) for r in robot_ids),
        complexity=complexity,
        plan=plan,
    )
    NOTES_FILE.write_text(content, encoding="utf-8")


def append_completed_step(step: str, result_summary: str) -> None:
    """Append a completed step to NOTES.md."""
    if not NOTES_FILE.exists():
        return
    timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
    entry = f"\n- [{timestamp}] **{step}**: {result_summary}"
    content = NOTES_FILE.read_text()
    content = content.replace(
        "## Completed Steps\n(updated as steps complete)",
        f"## Completed Steps\n(updated as steps complete){entry}",
    )
    NOTES_FILE.write_text(content)


def update_current_state(state_summary: str) -> None:
    """
    Update the 'Current State' section.
    Called frequently during long tasks — this is what survives compaction.
    Anthropic: "The art of compaction lies in selection of what to keep vs discard."
    """
    if not NOTES_FILE.exists():
        return
    content = NOTES_FILE.read_text()
    # Replace current state section entirely (always overwrite, not append)
    lines = content.split("\n")
    start = next((i for i, l in enumerate(lines) if l == "## Current State"), None)
    end = next((i for i, l in enumerate(lines) if i > (start or 0) and l.startswith("## ")), len(lines))
    if start is None:
        return
    new_lines = (
        lines[:start + 1]
        + [state_summary]
        + lines[end:]
    )
    NOTES_FILE.write_text("\n".join(new_lines))


def register_artifact(registry_id: str, artifact_type: str, robot_id: int) -> None:
    """Log a successfully registered artifact to NOTES.md."""
    if not NOTES_FILE.exists():
        return
    timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
    entry = f"\n- [{timestamp}] `{registry_id}` ({artifact_type}, robot_id={robot_id})"
    content = NOTES_FILE.read_text()
    content = content.replace(
        "## Artifacts Registered\n(file registry IDs of completed outputs)",
        f"## Artifacts Registered\n(file registry IDs of completed outputs){entry}",
    )
    NOTES_FILE.write_text(content)


def read_notes() -> str:
    """Read NOTES.md for session resume. Returns empty string if file doesn't exist."""
    if not NOTES_FILE.exists():
        return ""
    return NOTES_FILE.read_text()


# ── Compaction: what to preserve ─────────────────────────────────────────────

COMPACTION_SYSTEM_PROMPT = """\
You are summarizing a Mission Control orchestration session for context compaction.
The summary will replace the full conversation history in the next context window.

Preserve with HIGH FIDELITY (never discard):
- The current task description and robot_id(s) being built
- Every registered artifact registry_id (these cannot be reconstructed)
- All NULL fields discovered — what was NULL and why
- Any operator decisions or deviations from standard workflow
- The current step in the build process (exactly where we are)
- Any FAIL verdicts from the Validator Agent and what they cited
- Unresolved errors or warnings
- The list of pending steps

Discard aggressively:
- Raw tool call outputs (keep summaries, not full payloads)
- Intermediate validation findings that were resolved
- Redundant status messages
- Full URDF or config XML/YAML content (reference by registry_id instead)
- Repeated NULL field warnings for the same field

Output format:
Write a concise session summary in plain prose, then append the current NOTES.md content.
Target: 1,500–2,000 tokens total. This is the agent's working memory.
"""


def build_compaction_prompt(conversation_history: str) -> str:
    """Build the prompt used to compact a long conversation."""
    return (
        f"{COMPACTION_SYSTEM_PROMPT}\n\n"
        f"<conversation_to_compact>\n{conversation_history}\n</conversation_to_compact>\n\n"
        f"<current_notes>\n{read_notes()}\n</current_notes>"
    )


# ── Session resume: reconstruct state ────────────────────────────────────────

SESSION_RESUME_PREFIX = """\
<session_resume>
This is a resumed session. The previous context was compacted.
Read NOTES.md carefully before taking any action — it is your memory of what was done.

NOTES.md content:
{notes}
</session_resume>

"""


def build_resume_context() -> str:
    """
    Prepend to the first message of a resumed session.
    Orchestrator adds this automatically when NOTES.md exists at session start.
    """
    notes = read_notes()
    if not notes:
        return ""
    return SESSION_RESUME_PREFIX.format(notes=notes)
