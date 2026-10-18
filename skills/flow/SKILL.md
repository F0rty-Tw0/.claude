---
name: flow
description: Drives a feature from idea to merged code through brainstorm, plan, execute, review, and finish stages with gates. Use for 'flow', 'autopilot', 'full auto', 'ship this', 'build me X end-to-end', or 'take this from idea to done'.
version: 1.0.0
---

# Flow (Unified SDLC Pipeline)

Flow takes work from idea to merged, verified code. It routes to one skill per stage and runs execution either autonomous or supervised (human-checkpointed). `autopilot` means `flow --auto`.

## Pipeline

```
IDEATE   ->   PLAN   ->   EXECUTE          ->   REVIEW       ->   FINISH
brainstorm    plan        auto | supervised     code-review      finish-branch
```

## Usage

```
flow "<idea or task>"          # full pipeline, auto-detect execution mode
flow --auto "<task>"           # force autonomous execution
flow --supervised "<task>"     # force human-checkpointed execution
flow --from plan "<task>"      # skip ideate, start at planning
flow --plan-only "<idea>"      # stop after a plan is produced
flow --stacked "<task>"        # build PR slices in overlap with earlier slices' gates and CI
flow --stacked --resume <plan folder>   # continue a stacked run in a new session
flow --stacked --tick <plan folder>     # internal: the stacked loop's wake prompt (references/stacked.md Waiting)
```

## Stage Routing

1. **IDEATE** — If the request is a vague idea, an open design question, or "build me X" with unclear shape, invoke `Skill("brainstorming")` to explore approaches and write a spec. A concrete, scoped behavior change gets brainstorming's short pass; only typos, config tweaks, version bumps, formatter-only diffs, and bug fixes skip this stage. Under `--auto`, brainstorming's cold-reader and critic checks still run, but step 5's write-back doesn't wait for a reply (only critical unknowns ask) and the spec goes to PLAN without the user-review pause, as the PLAN gate already does.
2. **PLAN** — `Skill("plan")` turns the idea/spec into a work plan (interview by default, or `--consensus` for a Planner -> Architect -> Critic loop on high-stakes work). Produces a plan folder under `.claude/local/plans/`.
3. **EXECUTE** — Branch on mode (see Mode Selection):
   - **Autonomous** -> `Skill("ralph")` with the plan folder path. Independent components run in parallel via `dispatching-parallel-agents`.
   - **Supervised** -> `Skill("subagent-driven-development")` with the plan (fresh subagent + spec check per task).
   - **Stacked** (`--stacked`) -> the per-slice loop in `references/stacked.md`, running either mode above in Slice mode.
4. **REVIEW** — first build the proof bundle (`code-review` `proof` mode) and pass it as the PR text; then `Skill("code-review")`. Triage feedback with `code-review-receiving`.
5. **FINISH** — `Skill("finishing-a-development-branch")` to integrate, merge, and clean up the branch/worktree.

## Mode Selection (EXECUTE stage)

Default to **autonomous** for well-scoped, low-blast work. Switch to **supervised** when ANY of:

- touches auth, payments, data migrations, or other security-sensitive paths
- has several substantial parts of new logic (judge by the logic to write, not files touched: a rename threaded through 30 files is small), or has unclear/contested acceptance criteria
- you want to review each task before the next begins

`--auto` / `--supervised` override the heuristic.

`flow --stacked` needs a PR Slices table in the plan (`plan` `references/task-format.md`, PR Slices) and user-authorized commits; missing either → stop and say which. The launch also counts as the user's consent to per-slice worktrees.

## Stage Gates

Do not advance a stage until its gate holds; if a gate can't be met, stop and report rather than proceed on a weak artifact.

| Stage    | Gate before moving on                                                      |
| -------- | -------------------------------------------------------------------------- |
| IDEATE   | A spec that passed brainstorming's cold-reader and critic checks exists (typo, config, bump, format, or bug fix -> skip); interactive mode waits for the user's spec review, `--auto` continues |
| PLAN     | Plan folder under `.claude/local/plans/` with testable acceptance criteria; interactive mode links the saved plan and waits for the user to review it (approving the idea or scope doesn't approve an unseen plan); `--auto` continues without the pause |
| EXECUTE  | All plan tasks done; `build` exit 0 and the full project test suite passes (real output) |
| REVIEW   | `code-review` verdict is not BLOCK; findings fixed or dismissed; every acceptance criterion mapped to the proof bundle; a TRUNK verdict stops for human sign-off, even in `--auto` |
| FINISH   | Branch merged/PR opened and workspace/worktree cleaned up                  |

Under `flow --stacked`, the EXECUTE, REVIEW and FINISH gates run per slice, as defined in `references/stacked.md`.

## Cross-cutting

- **Isolation:** before EXECUTE on non-trivial work, ensure an isolated workspace via `using-git-worktrees`.

## Non-Goals

- Need only one stage? Invoke it directly (`plan`, `ralph`, `code-review`, ...).
- Flow does not implement code itself.
