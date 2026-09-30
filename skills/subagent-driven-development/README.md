# Subagent-Driven Development

Executes an implementation plan in the current session: a fresh implementer subagent per task, the orchestrator checks each task's diff against its spec, and one final `code-review` covers the whole change.

## When to Use

- You have a written plan (see `plan`, `references/task-format.md`) and want supervised execution in this session.
- Small or tightly coupled plans run inline (no implementer subagents), same checks.

## Key Rules

- Implementers run one at a time; truly independent tasks go to `dispatching-parallel-agents` with worktree isolation.
- No check-ins between tasks; stop only when blocked, on a critical unknown or a destructive, security-sensitive, or outward-facing action, or when done. Other ambiguities are decided, logged in the plan, and listed at the end.
- Gaps go back to the implementer (a fresh `deep-executor` after 3 rounds); the orchestrator doesn't patch code itself.
- Implementers commit only if the user authorized commits.
