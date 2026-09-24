---
name: flow
description: Unified SDLC front-door that drives a feature from idea to merged code — routes through brainstorming, plan, execution (autonomous or supervised), review, verify, and finish, picking the best skill at each stage. Use when you want one command to take work end-to-end, or say "flow", "ship this", "take this from idea to done".
version: 1.0.0
---

# Flow (Unified SDLC Pipeline)

Flow is the single front door for taking work from idea to merged, verified code. It does not reimplement anything — it routes to the best skill at each stage and lets you choose how execution runs: autonomous (fire-and-forget) or supervised (human-checkpointed).

## Pipeline

```
IDEATE   ->   PLAN   ->   EXECUTE          ->   REVIEW    ->   VERIFY        ->   FINISH
brainstorm    plan        auto | supervised     code-review   verify              finish-branch
```

## Usage

```
flow "<idea or task>"          # full pipeline, auto-detect execution mode
flow --auto "<task>"           # force autonomous execution
flow --supervised "<task>"     # force human-checkpointed execution
flow --from plan "<task>"      # skip ideate, start at planning
flow --plan-only "<idea>"      # stop after a plan is produced
```

## Stage Routing

1. **IDEATE** — If the request is a vague idea, an open design question, or "build me X" with unclear shape, invoke `Skill("brainstorming")` to explore approaches and write a spec. Skip when the task is already concrete and scoped.
2. **PLAN** — `Skill("plan")` turns the idea/spec into a work plan (interview by default, or `--consensus` for a Planner -> Architect -> Critic loop on high-stakes work). Produces a plan file under `.claude/local/plans/`.
3. **EXECUTE** — Branch on mode (see Mode Selection):
   - **Autonomous** -> `Skill("ralph")` with the plan path (ralph drives `ultrawork` parallel agents). For native multi-agent use `team`; for conflict-free parallel file ownership use `ultrapilot`.
   - **Supervised** -> `Skill("subagent-driven-development")` with the plan (fresh subagent + review gate per task). For batched checkpoints in a separate session use `plans-executing`.
4. **REVIEW** — `Skill("code-review")` (delegates to the `code-reviewer` agent) after execution. Use `code-review-receiving` discipline to triage feedback — verify before implementing, push back when the reviewer is wrong.
5. **VERIFY** — `Skill("verification-before-completion")` to gather evidence before claiming done.
6. **FINISH** — `Skill("finishing-a-development-branch")` to integrate, merge, and clean up the branch/worktree.

## Mode Selection (EXECUTE stage)

Default to **autonomous** for well-scoped, low-blast work. Switch to **supervised** when ANY of:

- touches auth, payments, data migrations, or other security-sensitive paths
- spans >10 files, or has unclear/contested acceptance criteria
- you want to review each task before the next begins

`--auto` / `--supervised` override the heuristic.

## Stage Gates

Do not advance a stage until its gate holds; if a gate can't be met, stop and report rather than proceed on a weak artifact.

| Stage    | Gate before moving on                                                      |
| -------- | -------------------------------------------------------------------------- |
| IDEATE   | A written spec/approach exists (or task was already concrete -> skip)      |
| PLAN     | Plan file under `.claude/local/plans/` with testable acceptance criteria   |
| EXECUTE  | All plan tasks done; `build` exit 0 and affected tests pass (real output)  |
| REVIEW   | `code-review` findings triaged -- each fixed or explicitly dismissed       |
| VERIFY   | Every acceptance criterion mapped to fresh passing evidence                |
| FINISH   | Branch merged/PR opened and workspace/worktree cleaned up                  |

## Cross-cutting

- **Isolation:** before EXECUTE on non-trivial work, ensure an isolated workspace via `using-git-worktrees`.
- **State:** each underlying skill owns its own state files; flow only sequences them.

## Non-Goals

- Flow does not replace the stage skills — invoke a stage directly (`plan`, `ralph`, `code-review`, ...) when you only need that one.
- Flow does not implement code itself; all work happens in the routed skills.
