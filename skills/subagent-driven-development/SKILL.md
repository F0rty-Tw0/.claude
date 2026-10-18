---
name: subagent-driven-development
description: Executes a written plan task by task with a fresh implementer subagent per task, a spec check of each diff, and one final code-review. Use for supervised execution of a plan in this session; small or tightly coupled plans run inline.
---

# Subagent-Driven Development

Execute a plan by dispatching a fresh implementer subagent per task. You check each task's diff against its spec yourself; one code review covers the whole implementation at the end.

**Plan shape:** a plan is a folder (index.md + one `NN-<phase>.md` per phase, per skill:plan `references/task-format.md`); a path to its `index.md` means that folder. During execution read only index.md and the current phase file (Phase close also patches later ones). Any other path ending `.md` is a legacy single-file plan: run it as before, with its checkboxes, Log, and Decisions in that file, report paths `<plan-name>-task-N.md`, and no Phase close.

**Slice mode** (`flow --stacked` only, `flow/references/stacked.md`): given a plan folder and slice N, run the Per-task loop over only the tasks tagged `**PR slice:** N`, in plan order. Phase close works as below; a phase that spans slices closes at its last task, in whichever slice. Report files go to `<plan folder>/sdd/task-N.M.md`, with `<plan folder>` the absolute path in the main checkout, not the worktree. "After all tasks" changes as marked there. "Before starting" steps 1 and 5 run once at `flow --stacked` launch, not per slice; a concern found then is a ruling. "Before starting" steps 2-3 and every `git` call use the slice worktree (stacked.md Per slice step 1). A stop below (ruling row, protected Handoff patch, unresolved BLOCKED, critical unknown) never asks or ends the turn: it returns to the stacked loop as `blockedOn: "ruling"` (stacked.md User blocks).

**Continuous execution:** do not check in with the user between tasks. Stop only for a BLOCKED status you cannot resolve, genuine blocking ambiguity, a Handoff patch to a protected section (Phase close), or all tasks complete. They asked you to execute the plan, so "Should I continue?" wastes their time.

**Decisions:** non-critical plan conflicts or ambiguities: decide, keep going, and note `Decision: <what> — <why> — <cost if wrong>` in the current phase file's `## Handoff`. Critical unknowns (per the AGENTS.md Unknowns gate) and destructive, security-sensitive, or outward-facing actions still stop.

## Before starting

1. Read the plan once (index.md and every phase file) and review it critically. Raise real concerns (gaps, unclear steps, wrong assumptions) with the user before any code; don't guess past them.
2. Confirm you are not on main/master, or that the user consented to working there. Isolation: skill:using-git-worktrees.
3. Record the plan's base commit (`git rev-parse HEAD`) for the final review.
4. Track progress with index.md's Phases Status and the current phase file's `- [ ]` checkboxes. After compaction, trust them and `git log` over memory; never re-dispatch a ticked task. Resume opens the first phase not `done`; a phase with every task ticked but not `done` gets its Handoff first (Phase close).
5. Most of the plan's task weight is sonnet but this session runs opus? Say so once and suggest restarting with `claude --model sonnet`, then "execute <plan folder> with subagent-driven-development". Orchestrating only needs sonnet, its context grows the most, and the plan folder carries the state across sessions. The opus tasks still get opus subagents. Continue if the user doesn't switch.

**Inline mode:** small plans or tightly coupled tasks — execute them yourself in order, same checks, no implementer subagents. A task whose Model is above the session's model still goes to a subagent.

**Ruling rows** (`Ruling R1`): ask the user with AskUserQuestion when you reach one (a row in the phase file, or a task whose `**After:**` names an unanswered ruling in index.md), record the answer under it, tick it. Never guess past it.

## Per-task loop

Batch small same-shape tasks into one dispatch listing every file and its change; check the diff file by file. Never batch across a phase boundary.

1. First task of a phase → set its Status in index.md to `in progress`. Record the task base: `BASE=$(git stash create); BASE=${BASE:-$(git rev-parse HEAD)}` (snapshots uncommitted work without touching the tree; falls back to HEAD when there is nothing to snapshot). Dispatch an implementer (`./implementer-prompt.md`) with the full task text and scene-setting context. Don't make it read the plan folder. A dispatch carries this task, the interfaces it touches, and the global constraints — never summaries of earlier tasks. Give it a report file path, `.claude/local/sdd/<plan-folder-name>-task-N.M.md`.
2. If it asks questions, answer completely, then re-dispatch.
3. Read the task's diff (`git diff $BASE`, after `git add -N <files the task created>` so new files show up) against the task text: missing requirements, unrequested extras. DONE but the diff is empty → the implementer worked on another branch or worktree; don't tick the task. Gaps go through fix rounds (below). Dispatch the spec reviewer (`./spec-reviewer-prompt.md`) only when the diff is too large to check in a handful of reads. For a risky task (shared code, trunk signals) also run a skill:code-review mid-plan checkpoint; otherwise the final review covers it.
4. Tick the task's checkbox and append its line to index.md's `## Log`: `<date> · task N.M · <model> · <effort> · <done|blocked> · agent <id, or - inline> · retries <n>`. The log is how tier choices get checked against real outcomes. Next task, or Phase close after the phase's last one.

Pass the task's **Model** line as the Agent call's `model` and `effort`: the plan asks for it, so the override is sanctioned. No Model line → the agent's frontmatter default.

## Phase close

Phase state and the Handoff follow skill:plan `references/task-format.md` `## Handoff`:

- After the phase's last task is ticked, fill the rest of its `## Handoff` (Decisions are already there), then apply it: grep index.md and all later phase files for every changed interface or file, patch each hit where it sits, and list each patch under **Applied to**.
- A hit in Acceptance Criteria, Global Constraints, Review Focus, or a slice boundary stops for the user; other patches proceed as Decisions.
- Execution stops inside the phase (unresolved BLOCKED, unanswered ruling, the stop above) → Status `blocked`.
- Status `done` only after the Handoff is written and applied. Then open the next phase file.

Implementer dispatches don't change: the Handoff reaches them only through patched task text.

## Implementer status

- **DONE:** proceed to the spec check.
- **DONE_WITH_CONCERNS:** read the concerns. Correctness or scope concerns → address before the spec check. Observations ("file getting large") → note and proceed.
- **NEEDS_CONTEXT:** provide it and re-dispatch.
- **BLOCKED:** context problem → add context; needs more reasoning → `deep-executor` one step up the plan's ladder (sonnet · medium → sonnet · high → opus · high); too large → split the task; plan is wrong → escalate to the user.

Never re-dispatch the same prompt to the same agent without changing something.

## Fix rounds

Don't patch gaps yourself, however small: controller fixes skip review. Resume the same implementer with `SendMessage`, sending the findings verbatim; its context is intact. After 3 rounds, dispatch a fresh `deep-executor` one ladder step up with the report file, noting a prior implementer tried N times. Escalate the same way at once when a new finding lands in a function an earlier round already fixed: the fixes are chasing each other, and another round on the same approach won't converge. Escalate at most once per task; after that, a repeat finding goes straight to the round-5 decision. After 5, decide each open finding yourself and record it as a `Decision:`.

## After all tasks

1. Run the final review with skill:code-review over `<plan-base>..HEAD` (or the working-tree diff if nothing is committed), passing the plan folder as requirements (index.md then each `NN-*.md` in order, concatenated into code-review's `plan.md`), with its Review Focus lines for the reviewer, and nothing else. In the same message dispatch `quality-reviewer` (`model: opus`, `effort: high`) on the same diff for house conventions: code-review bans style findings, so drift from cheaper implementers would otherwise reach the user unflagged.
2. Re-grade each finding by its effect on a user, not by whether the spec names the trigger; the reviewer's "Declined to judge" lines get the same re-grade. Blockers, Should-fix, and Conventions findings go to one `executor` dispatch carrying the full list, not one fixer per finding; each behavior fix gets a test that fails first (convention fixes need none). Notes go to a "Deferred minors" list in the final message. No second fix wave; anything left goes to the user at finishing.
3. List every decision under "Decisions I made" in the final message, collected from every phase file's `## Handoff`.
4. Finish with skill:finishing-a-development-branch.

Slice mode: skip step 1's code-review (open-pr Step 0 runs it per slice) but keep its `quality-reviewer` pass, on the slice diff `<parent>...<slice>`. Steps 2-3 apply to that slice; what step 2 leaves "to the user at finishing" goes into the slice's push-approval question instead. Skip step 4.

## Rules

- Implementers run one at a time: parallel implementers in one checkout conflict. For truly independent tasks, use skill:dispatching-parallel-agents with per-agent `isolation: "worktree"` instead of this loop (worktrees start from the last commit, so earlier uncommitted tasks are invisible to them).
- Don't move to the next task with open spec gaps or accept "close enough".
- Implementers follow skill:test-driven-development when the task has a test harness.
