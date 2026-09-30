# Flow

The single front door for taking a feature from idea to merged, verified code. Flow doesn't reimplement anything itself — it routes to the right skill at each SDLC (software development lifecycle) stage and lets the caller choose autonomous or supervised execution.

## What It Does

```
IDEATE   ->   PLAN   ->   EXECUTE          ->   REVIEW       ->   FINISH
brainstorm    plan        auto | supervised     code-review      finish-branch
```

| Stage | Routes to |
| --- | --- |
| Ideate | `brainstorming` (skipped if the task is already concrete) |
| Plan | `plan` — produces a plan file under `.claude/local/plans/` |
| Execute | `ralph` + `dispatching-parallel-agents` (autonomous) or `subagent-driven-development` (supervised) |
| Review | `code-review` (proof bundle + acceptance criteria), triaged with `code-review-receiving` |
| Finish | `finishing-a-development-branch` |

Defaults to autonomous execution for well-scoped, low-blast work; switches to supervised when the change touches auth/payments/migrations, spans more than 10 files, or has contested acceptance criteria. `--auto`/`--supervised` override the heuristic.

---

## When to Use

Trigger when you:
- want one command to carry work end-to-end instead of invoking each SDLC skill by hand
- say "flow", "autopilot", "ship this", or "take this from idea to done"
- only need a single stage — invoke that stage's skill directly instead (`plan`, `ralph`, `code-review`, …)
