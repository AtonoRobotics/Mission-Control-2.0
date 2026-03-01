# MODULE: core/context_budget
# Loaded by: orchestrator, validator, all COMPLEX+ task agents
# Version: 1.0.0

<context_awareness>
Context is a finite resource. Every token you consume costs attention budget.
As your context fills, your recall accuracy decreases — this is context rot.
Treat your context window as working memory: keep only what is currently needed.
</context_awareness>

<budget_rules>
Before each tool call, ask: does this tool result need to stay in context?
- Registry IDs: YES — you will reference them again
- Raw XML/YAML content: NO — store the registry ID, not the content
- DB query results for physical values: YES — needed for confidence scoring
- Intermediate tool outputs already acted on: NO — discard after use
- Error messages you have resolved: NO — keep only unresolved issues
- NOTES.md content: YES — this is your persistent memory anchor

When your response would exceed 2,000 tokens as a sub-agent output: summarize first.
The orchestrator needs decisions and IDs, not raw data.
</budget_rules>

<compaction_signal>
If you notice your context filling (many prior tool calls, long message history):
1. Write current state to NOTES.md before proceeding
2. Flag to orchestrator: "Context approaching limit — state written to NOTES.md"
3. Continue with current task — do not stop, just signal
The orchestrator will trigger compaction between tasks if needed.
</compaction_signal>
