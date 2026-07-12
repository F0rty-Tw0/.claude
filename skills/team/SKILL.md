---
name: team
description: Use when a task needs N coordinated agents working a shared task list, when the user invokes "/team" or says "team ralph", or when a task decomposes into independent file-scoped or module-scoped subtasks that benefit from parallel specialist agents with dependency tracking and inter-agent messaging.
---

# Team Skill

Spawn N coordinated agents working on a shared task list using Claude Code's native team tools. Replaces the legacy
`/swarm` skill (SQLite-based) with built-in team management, inter-agent messaging, and task dependencies -- no external
dependencies required.

See `references/runtime-api.md` for full JSON request/response payloads, the state persistence schema, MCP outbox
functions, the git worktree API table, and the Team-vs-Swarm comparison.

## Usage

```
team N:agent-type "task description"
team "task description"
team ralph "task description"
```

### Parameters

- **N** - Number of teammate agents (1-20). Optional; defaults to auto-sizing based on task decomposition.
- **agent-type** - agent to spawn for the `team-exec` stage (e.g., executor, build-fixer, designer). Optional; defaults
  to stage-aware routing (see Stage Agent Routing below).
- **task** - High-level task to decompose and distribute among teammates
- **ralph** - Optional modifier. When present, wraps the team pipeline in Ralph's persistence loop (retry on failure,
  architect verification before completion). See Team + Ralph Composition below.

### Examples

```bash
/team 5:executor "fix all TypeScript errors across the project"
/team 3:build-fixer "fix build errors in src/"
/team 4:designer "implement responsive layouts for all page components"
/team "refactor the auth module with security review"
/team ralph "build a complete REST API for user management"
```

## Architecture

```
User: "/team 3:executor fix all TypeScript errors"
              |
              v
      [TEAM ORCHESTRATOR (Lead)]
              |
              +-- TeamCreate("fix-ts-errors") -> lead becomes team-lead@fix-ts-errors
              +-- Analyze & decompose task into subtasks (explore/architect)
              +-- TaskCreate x N (one per subtask, with dependencies)
              +-- TaskUpdate x N (pre-assign owners)
              +-- Task(team_name="fix-ts-errors", name="worker-1") x N -> spawns teammates
              +-- Monitor loop (SendMessage from teammates + TaskList polling)
              +-- Completion -> shutdown_request/response -> TeamDelete -> clear state
```

**Storage layout (managed by Claude Code):** `~/.claude/teams/{team}/config.json` (metadata + members) and
`~/.claude/tasks/{team}/*.json` (one file per subtask, plus a `.lock` file).

## Staged Pipeline (Canonical Team Runtime)

Team execution follows a staged pipeline:

`team-plan -> team-prd -> team-exec -> team-verify -> team-fix (loop)`

### Stage Agent Routing

Each pipeline stage uses **specialized agents** -- not just executors. The lead selects agents based on the stage and
task characteristics.

| Stage           | Required Agents                     | Optional Agents                                                                                                                              | Selection Criteria                                                                                                                                                                           |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **team-plan**   | `explore` (haiku), `planner` (opus) | `analyst` (opus), `architect` (opus)                                                                                                         | Use `analyst` for unclear requirements. Use `architect` for systems with complex boundaries.                                                                                                 |
| **team-prd**    | `analyst` (opus)                    | `product-manager` (sonnet), `critic` (opus)                                                                                                  | Use `product-manager` for user-facing features. Use `critic` to challenge scope.                                                                                                             |
| **team-exec**   | `executor` (sonnet)                 | `deep-executor` (opus), `build-fixer` (sonnet), `designer` (sonnet), `writer` (haiku), `test-engineer` (sonnet)                              | Match agent to subtask type. Use `deep-executor` for complex autonomous work, `designer` for UI, `build-fixer` for compilation issues, `writer` for docs, `test-engineer` for test creation. |
| **team-verify** | `verifier` (sonnet)                 | `test-engineer` (sonnet), `security-reviewer` (sonnet), `code-reviewer` (opus), `quality-reviewer` (sonnet), `performance-reviewer` (sonnet) | Always run `verifier`. Add `security-reviewer` for auth/crypto changes. Add `code-reviewer` for >20 files or architectural changes. Add `performance-reviewer` for latency-sensitive code.   |
| **team-fix**    | `executor` (sonnet)                 | `build-fixer` (sonnet), `debugger` (sonnet), `deep-executor` (opus)                                                                          | Use `build-fixer` for type/build errors. Use `debugger` for regression isolation. Use `deep-executor` for complex multi-file fixes.                                                          |

**Routing rules:** the lead picks agents per stage -- the user's `N:agent-type` only overrides `team-exec`'s worker
type. Route analysis/review to an external model via agentic-mcp (`mcp__agentic-mcp__ask_codex`) when available; MCP workers are one-shot and don't participate
in team communication. In cost-downgrade mode, drop `opus` to `sonnet` and `sonnet` to `haiku` where quality permits,
but `team-verify` always uses at least `sonnet`. Security-sensitive or >20-file changes must add `security-reviewer` +
`code-reviewer` (opus) to `team-verify`.

Each stage exits when its work reaches a terminal state for the current pass: `team-plan` exits once a runnable task
graph exists; `team-prd` exits once acceptance criteria are explicit; `team-exec` exits once execution tasks are
terminal; `team-verify` exits passing (no follow-up) or failing (generates fix tasks and moves to `team-fix`);
`team-fix` exits once fixes are complete and flow returns to `team-exec`.

### Verify/Fix Loop and Stop Conditions

Continue `team-exec -> team-verify -> team-fix` until:

1. verification passes and no required fix tasks remain, or
2. work reaches an explicit terminal blocked/failed outcome with evidence.

`team-fix` is bounded by max attempts. If fix attempts exceed the configured limit, transition to terminal `failed` (no
infinite loop).

### Resume and Cancel Semantics

- **Resume:** restart from the last non-terminal stage using staged state + live task status.
- **Cancel:** requests teammate shutdown, waits for responses (best effort), marks phase `cancelled` with
  `active=false`, captures cancellation metadata, then deletes team resources and clears/preserves state per policy.
- Terminal states are `complete`, `failed`, and `cancelled`.

## Workflow

### Phase 1: Parse Input

Extract **N** (1-20), **agent-type** (validate against known subagents), and **task** description.

### Phase 2: Analyze & Decompose

Use `explore` or `architect` to analyze the codebase and break the task into N subtasks. Each subtask should be
**file-scoped** or **module-scoped** to avoid conflicts, be independent or have clear dependency ordering, and need a
concise `subject` + detailed `description`. Identify dependencies (e.g., "shared types must be fixed before
consumers").

### Phase 3: Create Team

Call `TeamCreate` with a slug derived from the task. The current session becomes the team lead
(`team-lead@{team_name}`). Write state via `state_write` for resume detection (see `references/runtime-api.md` for the
schema and exact calls). On every stage transition, update `current_phase` and append to `stage_history`.

### Phase 4: Create Tasks

Call `TaskCreate` for each subtask. Set dependencies with `TaskUpdate` using `addBlockedBy`. **Pre-assign owners from
the lead** (`TaskUpdate` with `owner`) to avoid race conditions -- there is no atomic claiming. Full request/response
JSON in `references/runtime-api.md`.

### Phase 5: Spawn Teammates

Spawn N teammates using `Task` with `team_name` and `name` parameters. Each teammate gets the team worker preamble (see
Agent Preamble below) plus their specific assignment.

**Side effects:** the teammate is added to `config.json`'s members array, and an internal task (with
`metadata._internal: true`) is auto-created tracking the agent's lifecycle -- filter these out of `TaskList` when
counting real task progress.

**IMPORTANT:** Spawn all teammates in parallel -- do NOT wait for one to finish before spawning the next.

### Phase 6: Monitor

The lead monitors progress through two channels:

1. **Inbound messages** -- Teammates send `SendMessage` to `team-lead` when they complete tasks or need help. These
   arrive automatically as new conversation turns (no polling needed).
2. **TaskList polling** -- Periodically call `TaskList` to check overall progress (format: `#ID [status] subject
   (owner)`).

**Coordination actions:** unblock via message, reassign early-finishers' work (`TaskUpdate` + `SendMessage`), or
handle failures by reassigning or spawning a replacement.

**Task Watchdog Policy:**

- **Max in-progress age:** task stuck `in_progress` >5 minutes without messages -- send a status check.
- **Suspected dead worker:** no messages + stuck task for 10+ minutes -- reassign.
- **Reassign threshold:** worker fails 2+ tasks -- stop assigning it new work.

### Phase 6.5: Stage Transitions

Update state on every stage transition (`state_write` with `current_phase` and `stage_history`; see
`references/runtime-api.md`). This enables resume after a lead crash, informs `cancel` what cleanup is needed, and lets
a linked Ralph loop know whether the pipeline completed or failed.

### Phase 7: Completion

When all real (non-internal) tasks are `completed` or `failed`: verify via `TaskList`, send `shutdown_request` to each
active teammate, await `shutdown_response(approve: true)` from each, call `TeamDelete`, clear
`.claude/local/state/team-state.json`, and report the summary to the user.

## Agent Preamble

When spawning teammates, include this preamble in the prompt to establish the work protocol. Adapt it per teammate with
their specific task assignments.

```
You are a TEAM WORKER in team "{team_name}". Your name is "{worker_name}".
You report to the team lead ("team-lead").

== WORK PROTOCOL ==

1. CLAIM: Call TaskList to see your assigned tasks (owner = "{worker_name}").
   Pick the first task with status "pending" that is assigned to you.
   Call TaskUpdate to set status "in_progress":
   {"taskId": "ID", "status": "in_progress", "owner": "{worker_name}"}

2. WORK: Execute the task using your tools (Read, Write, Edit, Bash).
   Do NOT spawn sub-agents. Do NOT delegate. Work directly.

3. COMPLETE: When done, mark the task completed:
   {"taskId": "ID", "status": "completed"}

4. REPORT: Notify the lead via SendMessage:
   {"type": "message", "recipient": "team-lead", "content": "Completed task #ID: <summary of what was done>", "summary": "Task #ID complete"}

5. NEXT: Check TaskList for more assigned tasks. If you have more pending tasks, go to step 1.
   If no more tasks are assigned to you, notify the lead:
   {"type": "message", "recipient": "team-lead", "content": "All assigned tasks complete. Standing by.", "summary": "All tasks done, standing by"}

6. SHUTDOWN: When you receive a shutdown_request, respond with:
   {"type": "shutdown_response", "request_id": "<from the request>", "approve": true}

== BLOCKED TASKS ==
If a task has blockedBy dependencies, skip it until those tasks are completed.
Check TaskList periodically to see if blockers have been resolved.

== ERRORS ==
If you cannot complete a task, report the failure to the lead:
{"type": "message", "recipient": "team-lead", "content": "FAILED task #ID: <reason>", "summary": "Task #ID failed"}
Do NOT mark the task as completed. Leave it in_progress so the lead can reassign.

== RULES ==
- NEVER spawn sub-agents or use the Task tool
- ALWAYS use absolute file paths
- ALWAYS report progress via SendMessage to "team-lead"
- Use SendMessage with type "message" only -- never "broadcast"
```

## Communication Patterns

Three message types: **direct message** (`type: "message"`, task completion reports and reassignment/guidance),
**broadcast** (`type: "broadcast"`, team-wide critical alerts only -- it sends N separate messages, use sparingly), and
**shutdown** (`shutdown_request` / `shutdown_response`, see Phase 7). Full JSON examples in
`references/runtime-api.md`.

## MCP Workers (Hybrid Roles)

The team skill supports **hybrid execution** combining Claude agent teammates with external MCP workers via
agentic-mcp (`mcp__agentic-mcp__ask_codex` / `ask_gemini` / `review_codex`). They differ in capabilities and cost.

| Execution Mode  | Provider                               | Capabilities                                                                                                               |
| --------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `claude_worker` | Claude agent                           | Full Claude Code tool access (Read/Write/Edit/Bash/Agent). Best for tasks needing Claude's reasoning + iterative tool use. |
| `mcp_external`  | agentic-mcp (`ask_codex`/`ask_gemini`) | One-shot external model call. Best for second-opinion code review, security analysis, or architecture critique.           |

External MCP workers are one-shot analysts: the lead sends a prompt, reads the response, and folds the findings into
the task list. They cannot use TaskList/TaskUpdate/SendMessage; the lead manages their lifecycle directly. Use a
Claude teammate for iterative multi-step work or anything needing `SendMessage` coordination; use agentic-mcp for
code/security review, architecture analysis, or a cross-provider second opinion. Outbox auto-ingestion functions
(`readNewOutboxMessages`, `getTeamStatus`) are in `references/runtime-api.md`.

## Error Handling

- **Teammate fails a task:** teammate reports via `SendMessage`; lead decides retry (reassign) or skip; reassignment
  uses `TaskUpdate` + `SendMessage`.
- **Teammate stuck (no messages):** detected via `TaskList` (task stuck `in_progress` too long); lead pings for status;
  if no response, treat as dead and reassign via `TaskUpdate`.
- **Dependency blocked:** if a blocker fails, the lead retries the blocker, removes the dependency (`TaskUpdate` with
  modified `blockedBy`), or skips the blocked task -- and communicates the decision to affected teammates.
- **Teammate crashes:** its internal task shows unexpected status and it disappears from `config.json` members; lead
  reassigns orphaned tasks, spawning a replacement if needed.

## Team + Ralph Composition

`/team ralph "task"` (or "team ralph" / both keywords detected) wraps team orchestration in Ralph's persistence loop:
retry on failure, architect verification before completion, iteration tracking. State cross-references between the
two modes are written via `state_write` (see `references/runtime-api.md`).

**Execution flow:** Ralph iteration starts -> team pipeline runs (`team-plan -> team-prd -> team-exec ->
team-verify`) -> if verify passes, Ralph runs architect verification (STANDARD tier minimum) -> if approved, both
complete and run `cancel` -> if verify fails or architect rejects, team enters `team-fix` then loops back -> if fix
attempts exceed `max_fix_loops`, Ralph retries the full pipeline -> if Ralph exceeds `max_iterations`, terminal
`failed`.

Cancelling either mode cancels both: from Ralph, cancel Team first then clear Ralph state; from Team, clear Team then
mark Ralph iteration cancelled.

## Idempotent Recovery and Cancellation

If the lead crashes mid-run, check `~/.claude/teams/` for a team matching the task slug, read `config.json` for
active members, and resume monitor mode via `TaskList` instead of creating a duplicate team.

The `cancel` skill handles cleanup: read team state via `state_read`, send `shutdown_request` to all active
teammates, wait for `shutdown_response` (15s timeout per member), call `TeamDelete`, then `state_clear(mode="team")`
(and `mode="ralph"` if linked). If teammates are unresponsive, `TeamDelete` may fail -- retry, or tell the user to
manually remove `~/.claude/teams/{team_name}/` and `~/.claude/tasks/{team_name}/`.

## Configuration and Cleanup

Optional settings via `.team-config.json`: `maxAgents` (default 20), `defaultAgentType` (default `executor`),
`monitorIntervalMs` (default 30s), `shutdownTimeoutMs` (default 15s). Team members have no hardcoded model default --
each teammate is a separate Claude Code session inheriting the user's configured model.

On successful completion, `TeamDelete` removes `~/.claude/teams/{team_name}/` and `~/.claude/tasks/{team_name}/`, then
call `state_clear(mode="team")` (and `state_clear(mode="ralph")` if linked). Or run `cancel`, which handles all cleanup
automatically. **IMPORTANT:** call `TeamDelete` only AFTER all teammates have been shut down -- it fails if active
members (besides the lead) still exist in the config.

## Git Worktree Integration

MCP workers can operate in isolated git worktrees to prevent file conflicts between concurrent workers. Before spawning
a worker, call `createWorkerWorktree(teamName, workerName, repoRoot)` to create an isolated worktree at
`.claude/local/worktrees/{team}/{worker}` with branch `team/{teamName}/{workerName}`, and pass the worktree path as the
worker's `workingDirectory`. After a worker completes, use `checkMergeConflicts()` then `mergeWorkerBranch()`
(`--no-ff`) to merge. On team shutdown, call `cleanupTeamWorktrees(teamName, repoRoot)`. Full function signatures in
`references/runtime-api.md`.

## Gotchas

1. **Internal tasks pollute TaskList** -- spawning a teammate auto-creates an internal task (`metadata._internal:
   true`) named for the teammate. Filter these out when counting real task progress.
2. **No atomic claiming** -- two teammates could race to claim the same task. Mitigate by pre-assigning owners via
   `TaskUpdate(taskId, owner)` before spawning; teammates only work on tasks assigned to them.
3. **Task IDs are strings**, not integers ("1", "2", "3").
4. **TeamDelete requires empty team** -- all teammates must be shut down first; the lead is excluded from this check.
5. **Messages are auto-delivered** as new conversation turns, no polling needed. If the lead is mid-turn, messages
   queue and deliver when the turn ends.
6. **Teammate prompt stored in config** -- the full prompt text lives in `config.json`'s members array. Do not put
   secrets in teammate prompts.
7. **Members auto-removed on shutdown** -- don't re-read config expecting to find shut-down teammates.
8. **`shutdown_response` needs the real `request_id`** (`shutdown-{timestamp}@{worker-name}`) extracted from the
   incoming request. Fabricating it silently fails the shutdown.
9. **Team name must be a valid slug** -- lowercase letters, numbers, and hyphens, derived from the task description.
10. **Broadcast is expensive** -- sends a separate message to every teammate. Default to `message` (DM); reserve
    broadcast for truly team-wide critical alerts.
11. **MCP workers are one-shot, not persistent** -- external agentic-mcp calls return a single response and cannot use
    TaskList/TaskUpdate/SendMessage; the lead manages their lifecycle directly.
