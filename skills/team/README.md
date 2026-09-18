# Team

Spawns N coordinated agents that work a shared task list using Claude Code's native team tools (TeamCreate,
TaskCreate/TaskUpdate, SendMessage). Runs a staged pipeline (`team-plan -> team-prd -> team-exec -> team-verify ->
team-fix`) with stage-appropriate specialist agents, dependency tracking between subtasks, and graceful shutdown.
Replaces the legacy SQLite-based `/swarm` skill.

## When to Use

- A task needs multiple agents working independent, file-scoped or module-scoped subtasks in parallel
- The user invokes `/team`, `team N:agent-type "..."`, or `team ralph "..."`
- Work benefits from dependency tracking between subtasks and inter-agent messaging for coordination
- The task needs verification and fix loops, not just fire-and-forget parallel execution

See `SKILL.md` for the full workflow and `references/runtime-api.md` for JSON payloads and state schema.

---
