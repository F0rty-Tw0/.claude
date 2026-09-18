# Team Runtime API Reference

Detailed JSON schemas, state persistence contracts, and MCP function signatures for the `team` skill. SKILL.md covers when and how to orchestrate; this file covers the exact payloads.

## State Persistence

Write state using the `state_write` MCP tool for proper session-scoped persistence:

```
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "fix-ts-errors",
  "agent_count": 3,
  "agent_types": "executor",
  "task": "fix all TypeScript errors",
  "fix_loop_count": 0,
  "max_fix_loops": 3,
  "linked_ralph": false,
  "stage_history": "team-plan"
})
```

> **Note:** The MCP `state_write` tool transports all values as strings. Consumers must coerce `agent_count`,
> `fix_loop_count`, `max_fix_loops` to numbers and `linked_ralph` to boolean when reading state.

**State schema fields:**

| Field            | Type    | Description                                                                             |
| ---------------- | ------- | --------------------------------------------------------------------------------------- |
| `active`         | boolean | Whether team mode is active                                                             |
| `current_phase`  | string  | Current pipeline stage: `team-plan`, `team-prd`, `team-exec`, `team-verify`, `team-fix` |
| `team_name`      | string  | Slug name for the team                                                                  |
| `agent_count`    | number  | Number of worker agents                                                                 |
| `agent_types`    | string  | Comma-separated agent types used in team-exec                                           |
| `task`           | string  | Original task description                                                               |
| `fix_loop_count` | number  | Current fix iteration count                                                             |
| `max_fix_loops`  | number  | Maximum fix iterations before failing (default: 3)                                      |
| `linked_ralph`   | boolean | Whether team is linked to a ralph persistence loop                                      |
| `stage_history`  | string  | Comma-separated list of stage transitions with timestamps                               |

**Update state on every stage transition:**

```
state_write(mode="team", current_phase="team-exec", state={
  "stage_history": "team-plan:2026-02-07T12:00:00Z,team-prd:2026-02-07T12:01:00Z,team-exec:2026-02-07T12:02:00Z"
})
```

**Read state for resume detection:**

```
state_read(mode="team")
```

If `active=true` and `current_phase` is non-terminal, resume from the last incomplete stage instead of creating a new team.

**Ralph-linked state (Team + Ralph Composition):**

```
// Team state (via state_write)
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "build-rest-api",
  "linked_ralph": true,
  "task": "build a complete REST API"
})

// Ralph state (via state_write)
state_write(mode="ralph", active=true, iteration=1, max_iterations=10, current_phase="execution", state={
  "linked_team": true,
  "team_name": "build-rest-api"
})
```

## Full JSON Payloads

### TeamCreate

```json
// Request
{ "team_name": "fix-ts-errors", "description": "Fix all TypeScript errors across the project" }

// Response
{
  "team_name": "fix-ts-errors",
  "team_file_path": "~/.claude/teams/fix-ts-errors/config.json",
  "lead_agent_id": "team-lead@fix-ts-errors"
}
```

### TaskCreate / TaskUpdate

```json
// TaskCreate for subtask 1
{
  "subject": "Fix type errors in src/auth/",
  "description": "Fix all TypeScript errors in src/auth/login.ts, src/auth/session.ts, and src/auth/types.ts. Run tsc --noEmit to verify.",
  "activeForm": "Fixing auth type errors"
}
```

**Response stores a task file (e.g. `1.json`):**

```json
{
  "id": "1",
  "subject": "Fix type errors in src/auth/",
  "description": "Fix all TypeScript errors in src/auth/login.ts...",
  "activeForm": "Fixing auth type errors",
  "owner": "",
  "status": "pending",
  "blocks": [],
  "blockedBy": []
}
```

```json
// Task #3 depends on task #1 (shared types must be fixed first)
{ "taskId": "3", "addBlockedBy": ["1"] }

// Pre-assign owner from the lead (no atomic claiming exists)
{ "taskId": "1", "owner": "worker-1" }
```

### Spawn Teammate

```json
// Request
{
  "subagent_type": "executor",
  "team_name": "fix-ts-errors",
  "name": "worker-1",
  "prompt": "<worker-preamble + assigned tasks>"
}

// Response
{ "agent_id": "worker-1@fix-ts-errors", "name": "worker-1", "team_name": "fix-ts-errors" }
```

### Shutdown Protocol

**Lead sends:**

```json
{ "type": "shutdown_request", "recipient": "worker-1", "content": "All work complete, shutting down team" }
```

**Teammate receives and responds:**

```json
{ "type": "shutdown_response", "request_id": "shutdown-1770428632375@worker-1", "approve": true }
```

The `request_id` is provided in the shutdown request message the teammate receives -- extract and pass it back. Do NOT fabricate request IDs.

**TeamDelete:**

```json
// Request
{ "team_name": "fix-ts-errors" }

// Response
{
  "success": true,
  "message": "Cleaned up directories and worktrees for team \"fix-ts-errors\"",
  "team_name": "fix-ts-errors"
}
```

### Communication Message Examples

```json
// Teammate to Lead (task completion report)
{
  "type": "message",
  "recipient": "team-lead",
  "content": "Completed task #1: Fixed 3 type errors in src/auth/login.ts and 2 in src/auth/session.ts. All files pass tsc --noEmit.",
  "summary": "Task #1 complete"
}

// Lead to Teammate (reassignment or guidance)
{
  "type": "message",
  "recipient": "worker-2",
  "content": "Task #3 is now unblocked. Also pick up task #5 which was originally assigned to worker-1.",
  "summary": "New task assignment"
}

// Broadcast (sends N separate messages -- use sparingly)
{
  "type": "broadcast",
  "content": "STOP: shared types in src/types/index.ts have changed. Pull latest before continuing.",
  "summary": "Shared types changed"
}
```

## MCP Outbox Auto-Ingestion

The lead can proactively ingest outbox messages from MCP workers using the outbox reader utilities, enabling event-driven monitoring without relying solely on `SendMessage` delivery.

**`readNewOutboxMessages(teamName, workerName)`** -- Read new outbox messages for a single worker using a byte-offset cursor. Each call advances the cursor, so subsequent calls only return messages written since the last read. Mirrors the inbox cursor pattern from `readNewInboxMessages()`.

**`readAllTeamOutboxMessages(teamName)`** -- Read new outbox messages from ALL workers in a team. Returns an array of `{ workerName, messages }` entries, skipping workers with no new messages. Useful for batch polling in the monitor loop.

**`resetOutboxCursor(teamName, workerName)`** -- Reset the outbox cursor for a worker back to byte 0. Useful when re-reading historical messages after a lead restart or for debugging.

### `getTeamStatus()`

`getTeamStatus(teamName, workingDirectory, heartbeatMaxAgeMs?)` provides a unified snapshot combining:

- **Worker registration** -- Which MCP workers are registered (from shadow registry / config.json)
- **Heartbeat freshness** -- Whether each worker is alive based on heartbeat age
- **Task progress** -- Per-worker and team-wide task counts (pending, in_progress, completed)
- **Current task** -- Which task each worker is actively executing
- **Recent outbox messages** -- New messages since the last status check

```typescript
const status = getTeamStatus("fix-ts-errors", workingDirectory);

for (const worker of status.workers) {
  if (!worker.isAlive) {
    // Worker is dead -- reassign its in-progress tasks
  }
  for (const msg of worker.recentMessages) {
    if (msg.type === "task_complete") {
      // Mark task complete, unblock dependents
    } else if (msg.type === "task_failed") {
      // Handle failure, possibly retry or reassign
    } else if (msg.type === "error") {
      // Log error, check if worker needs intervention
    }
  }
}

if (status.taskSummary.pending === 0 && status.taskSummary.inProgress === 0) {
  // All work done -- proceed to shutdown
}
```

### Event-Based Actions from Outbox Messages

| Message Type    | Action                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------- |
| `task_complete` | Mark task completed, check if blocked tasks are now unblocked, notify dependent workers     |
| `task_failed`   | Increment failure sidecar, decide retry vs reassign vs skip                                 |
| `idle`          | Worker has no assigned tasks -- assign pending work or begin shutdown                       |
| `error`         | Log the error, check `consecutiveErrors` in heartbeat for quarantine threshold              |
| `shutdown_ack`  | Worker acknowledged shutdown -- safe to remove from team                                    |
| `heartbeat`     | Update liveness tracking (redundant with heartbeat files but useful for latency monitoring) |

This complements `SendMessage`-based communication by providing a pull-based mechanism for MCP workers that cannot use Claude Code's team messaging tools.

## Git Worktree API Reference

| Function                                                            | Description                    |
| -------------------------------------------------------------------- | ------------------------------- |
| `createWorkerWorktree(teamName, workerName, repoRoot, baseBranch?)` | Create isolated worktree       |
| `removeWorkerWorktree(teamName, workerName, repoRoot)`              | Remove worktree and branch     |
| `listTeamWorktrees(teamName, repoRoot)`                             | List all team worktrees        |
| `cleanupTeamWorktrees(teamName, repoRoot)`                          | Remove all team worktrees      |
| `checkMergeConflicts(workerBranch, baseBranch, repoRoot)`           | Non-destructive conflict check |
| `mergeWorkerBranch(workerBranch, baseBranch, repoRoot)`             | Merge worker branch (--no-ff)  |
| `mergeAllWorkerBranches(teamName, repoRoot, baseBranch?)`           | Merge all completed workers    |

**Notes:**

- `createSession()` in `tmux-session.ts` does NOT handle worktree creation -- worktree lifecycle is managed separately via `git-worktree.ts`
- Worktrees are NOT cleaned up on individual worker shutdown -- only on team shutdown, to allow post-mortem inspection
- Branch names are sanitized via `sanitizeName()` to prevent injection
- All paths are validated against directory traversal

## Comparison: Team vs Legacy Swarm

| Aspect                  | Team (Native)                                                      | Swarm (Legacy SQLite)                    |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| **Storage**             | JSON files in `~/.claude/teams/` and `~/.claude/tasks/`            | SQLite in `.claude/local/state/swarm.db` |
| **Dependencies**        | `better-sqlite3` not needed                                        | Requires `better-sqlite3` npm package    |
| **Task claiming**       | `TaskUpdate(owner + in_progress)` -- lead pre-assigns              | SQLite IMMEDIATE transaction -- atomic   |
| **Race conditions**     | Possible if two agents claim same task (mitigate by pre-assigning) | None (SQLite transactions)               |
| **Communication**       | `SendMessage` (DM, broadcast, shutdown)                            | None (fire-and-forget agents)            |
| **Task dependencies**   | Built-in `blocks` / `blockedBy` arrays                             | Not supported                            |
| **Heartbeat**           | Automatic idle notifications from Claude Code                      | Manual heartbeat table + polling         |
| **Shutdown**            | Graceful request/response protocol                                 | Signal-based termination                 |
| **Agent lifecycle**     | Auto-tracked via internal tasks + config members                   | Manual tracking via heartbeat table      |
| **Progress visibility** | `TaskList` shows live status with owner                            | SQL queries on tasks table               |
| **Conflict prevention** | Owner field (lead-assigned)                                        | Lease-based claiming with timeout        |
| **Crash recovery**      | Lead detects via missing messages, reassigns                       | Auto-release after 5-min lease timeout   |
| **State cleanup**       | `TeamDelete` removes everything                                    | Manual `rm` of SQLite database           |

**When to use Team over Swarm:** Always prefer `/team` for new work. It uses Claude Code's built-in infrastructure, requires no external dependencies, supports inter-agent communication, and has task dependency management.
