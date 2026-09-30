---
name: subagent-driven-development
description: Executes a written plan task by task with a fresh implementer subagent per task, a spec check of each diff, and one final code-review. Use for supervised execution of a plan in this session; small or tightly coupled plans run inline.
---

# Subagent-Driven Development

Execute a plan by dispatching a fresh implementer subagent per task. You check each task's diff against its spec yourself; one code review covers the whole implementation at the end.

**Continuous execution:** do not check in with the user between tasks. Stop only for a BLOCKED status you cannot resolve, genuine blocking ambiguity, or all tasks complete. They asked you to execute the plan, so "Should I continue?" wastes their time.

## Before starting

1. Read the plan once and review it critically. Raise real concerns (gaps, unclear steps, wrong assumptions) with the user before any code; don't guess past them.
2. Confirm you are not on main/master, or that the user consented to working there. Isolation: skill:using-git-worktrees.
3. Record the plan's base commit (`git rev-parse HEAD`) for the final review.
4. Track progress with the plan file's `- [ ]` checkboxes.

**Inline mode:** small plans or tightly coupled tasks — execute them yourself in order, same checks, no implementer subagents.

## Per-task loop

1. Record the task base: `BASE=$(git stash create); BASE=${BASE:-$(git rev-parse HEAD)}` (snapshots uncommitted work without touching the tree; falls back to HEAD when there is nothing to snapshot). Dispatch an implementer (`./implementer-prompt.md`) with the full task text and scene-setting context. Don't make it read the plan file.
2. If it asks questions, answer completely, then re-dispatch.
3. Read the task's diff (`git diff $BASE`, after `git add -N <files the task created>` so new files show up) against the task text: missing requirements, unrequested extras. Fix small gaps yourself; re-dispatch the implementer for task-sized ones. Dispatch the spec reviewer (`./spec-reviewer-prompt.md`) only when the diff is too large to check in a handful of reads. For a risky task (shared code, trunk signals) also run a skill:code-review mid-plan checkpoint; otherwise the final review covers it.
4. Tick the task's checkbox. Next task.

Agent frontmatter sets the model; pick the agent, not a model.

## Implementer status

- **DONE:** proceed to the spec check.
- **DONE_WITH_CONCERNS:** read the concerns. Correctness or scope concerns → address before the spec check. Observations ("file getting large") → note and proceed.
- **NEEDS_CONTEXT:** provide it and re-dispatch.
- **BLOCKED:** context problem → add context; needs more reasoning → `deep-executor`; too large → split the task; plan is wrong → escalate to the user.

Never re-dispatch the same prompt to the same agent without changing something.

## After all tasks

1. Run the final review with skill:code-review over `<plan-base>..HEAD` (or the working-tree diff if nothing is committed), passing the plan as requirements and nothing else.
2. Finish with skill:finishing-a-development-branch.

## Rules

- Implementers run one at a time: parallel implementers in one checkout conflict. For truly independent tasks, use skill:dispatching-parallel-agents with per-agent `isolation: "worktree"` instead of this loop (worktrees start from the last commit, so earlier uncommitted tasks are invisible to them).
- Don't move to the next task with open spec gaps or accept "close enough".
- Implementers follow skill:test-driven-development when the task has a test harness.
