---
name: subagent-driven-development
description: Executes a written plan task by task with a fresh implementer subagent per task, a spec check of each diff, and one final code-review. Use for supervised execution of a plan in this session; small or tightly coupled plans run inline.
---

# Subagent-Driven Development

Execute a plan by dispatching a fresh implementer subagent per task. You check each task's diff against its spec yourself; one code review covers the whole implementation at the end.

**Continuous execution:** do not check in with the user between tasks. Stop only for a BLOCKED status you cannot resolve, genuine blocking ambiguity, or all tasks complete. They asked you to execute the plan, so "Should I continue?" wastes their time.

**Decisions:** non-critical plan conflicts or ambiguities: decide, keep going, and note `Decision: <what> — <why> — <cost if wrong>` in the plan file. Critical unknowns (per the AGENTS.md Unknowns gate) and destructive, security-sensitive, or outward-facing actions still stop.

## Before starting

1. Read the plan once and review it critically. Raise real concerns (gaps, unclear steps, wrong assumptions) with the user before any code; don't guess past them.
2. Confirm you are not on main/master, or that the user consented to working there. Isolation: skill:using-git-worktrees.
3. Record the plan's base commit (`git rev-parse HEAD`) for the final review.
4. Track progress with the plan file's `- [ ]` checkboxes. After compaction, trust the checkboxes and `git log` over memory; never re-dispatch a ticked task.

**Inline mode:** small plans or tightly coupled tasks — execute them yourself in order, same checks, no implementer subagents.

## Per-task loop

Batch small same-shape tasks into one dispatch listing every file and its change; check the diff file by file.

1. Record the task base: `BASE=$(git stash create); BASE=${BASE:-$(git rev-parse HEAD)}` (snapshots uncommitted work without touching the tree; falls back to HEAD when there is nothing to snapshot). Dispatch an implementer (`./implementer-prompt.md`) with the full task text and scene-setting context. Don't make it read the plan file. A dispatch carries this task, the interfaces it touches, and the global constraints — never summaries of earlier tasks. Give it a report file path, `.claude/local/sdd/<plan-name>-task-N.md`.
2. If it asks questions, answer completely, then re-dispatch.
3. Read the task's diff (`git diff $BASE`, after `git add -N <files the task created>` so new files show up) against the task text: missing requirements, unrequested extras. DONE but the diff is empty → the implementer worked on another branch or worktree; don't tick the task. Gaps go through fix rounds (below). Dispatch the spec reviewer (`./spec-reviewer-prompt.md`) only when the diff is too large to check in a handful of reads. For a risky task (shared code, trunk signals) also run a skill:code-review mid-plan checkpoint; otherwise the final review covers it.
4. Tick the task's checkbox. Next task.

Agent frontmatter sets the model; pick the agent, not a model.

## Implementer status

- **DONE:** proceed to the spec check.
- **DONE_WITH_CONCERNS:** read the concerns. Correctness or scope concerns → address before the spec check. Observations ("file getting large") → note and proceed.
- **NEEDS_CONTEXT:** provide it and re-dispatch.
- **BLOCKED:** context problem → add context; needs more reasoning → `deep-executor`; too large → split the task; plan is wrong → escalate to the user.

Never re-dispatch the same prompt to the same agent without changing something.

## Fix rounds

Don't patch gaps yourself, however small: controller fixes skip review. Resume the same implementer with `SendMessage`, sending the findings verbatim; its context is intact. After 3 rounds, dispatch a fresh `deep-executor` with the report file, noting a prior implementer tried N times. Escalate the same way at once when a new finding lands in a function an earlier round already fixed: the fixes are chasing each other, and another round on the same approach won't converge. After 5, decide each open finding yourself and record it as a `Decision:`.

## After all tasks

1. Run the final review with skill:code-review over `<plan-base>..HEAD` (or the working-tree diff if nothing is committed), passing the plan as requirements, with its Review Focus lines for the reviewer, and nothing else.
2. Re-grade each finding by its effect on a user, not by whether the spec names the trigger; the reviewer's "Declined to judge" lines get the same re-grade. Blockers and Should-fix go to one `executor` dispatch carrying the full list, not one fixer per finding; each fix gets a test that fails first. Notes go to a "Deferred minors" list in the final message. No second fix wave; anything left goes to the user at finishing.
3. List every decision under "Decisions I made" in the final message.
4. Finish with skill:finishing-a-development-branch.

## Rules

- Implementers run one at a time: parallel implementers in one checkout conflict. For truly independent tasks, use skill:dispatching-parallel-agents with per-agent `isolation: "worktree"` instead of this loop (worktrees start from the last commit, so earlier uncommitted tasks are invisible to them).
- Don't move to the next task with open spec gaps or accept "close enough".
- Implementers follow skill:test-driven-development when the task has a test harness.
