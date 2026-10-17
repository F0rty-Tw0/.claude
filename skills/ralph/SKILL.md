---
name: ralph
description: Persistence loop that keeps working a task until fresh test and build evidence proves it complete. Use when the user says 'ralph', 'don't stop', 'must complete', or 'keep going until done', or when execution spans many iterations.
---

# Ralph

Keep working the task until fresh evidence shows it is complete. Deliver the full scope: no silent scope reduction, no partial completion, no deleting or weakening tests to get green.

## Loop

1. **Checklist.** Keep the task's parts as `- [ ]` items and tick them as they finish; the files carry progress across compaction and resumed sessions.
   - Plan folder (or its `index.md`): items live in phase files, phase state in index.md's Phases Status. Set a phase `in progress` at its first item; at its last tick, write and apply its Handoff per skill:plan `references/task-format.md` `## Handoff` before the next phase. On resume, read index.md and open the first phase not `done`; if every item there is ticked, do its Handoff first. Done = every phase `done`.
   - Legacy plan (any other `.md` path) or no plan (`.claude/local/ralph-<task>.md`): items live in that file; on resume, read it first and continue from the first open item.
2. **Work directly; delegate only independent, sizeable tracks.** Do lookups, small edits, and checks yourself. Two or more genuinely independent tracks that each need more than a handful of tool calls go to skill:dispatching-parallel-agents (`executor` / `deep-executor`, ≤3 per wave, worktree isolation when files overlap).
3. **Long operations** (installs, builds, test suites) run with `run_in_background: true`; wait for them before treating the task as done.
4. **Verify with fresh evidence.** Name the commands that prove completion (tests, build, typecheck), run them, read the output. Every checklist item is ticked.
5. **Architect review only when warranted** — cross-system, security-sensitive, or architectural changes, or when the user asked for sign-off. Otherwise step 4's evidence is the gate. A rejection means fix and re-verify, not stop.
6. **Finish.** Work on a dedicated branch or worktree → skill:finishing-a-development-branch. Delete any `.claude/local/` state files this run created.

## How turns end

A message with no tool call ends the turn, and the work stops until the user returns. While checklist items are open, these are the wrong ways to end a turn:

1. A summary that announces the next step instead of taking it.
2. An offer to carry on "unless you'd prefer otherwise".
3. A list of decisions for the user when none of them blocks the remaining work.
4. Stopping to report because the turn has been long or a milestone is done.

Put status notes and recommendations in the same message as the next tool call, and carry on with whatever does not depend on the user's answer.

**Stop when:**
- nothing can advance without the user (missing credentials, a requirement only they can decide, an external service down);
- the blocker is deliberately protected from you (commit/push guard, permission prompt);
- a phase Handoff would patch a protected plan section (task-format.md `## Handoff`);
- the user says stop, cancel, or abort;
- the same issue recurs across 3 iterations — report it as a likely fundamental problem.

This loop does not override confirmation for risky or destructive actions.

Original task: $ARGUMENTS
