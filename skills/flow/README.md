# Flow

The single front door for taking a feature from idea to merged, verified code. Flow doesn't reimplement anything itself — it routes to the right skill at each SDLC (software development lifecycle) stage and lets the caller choose autonomous or supervised execution.

## What It Does

```
IDEATE   ->   PLAN   ->   EXECUTE          ->   REVIEW    ->   VERIFY        ->   FINISH
brainstorm    plan        auto | supervised     code-review   verify              finish-branch
```

| Stage | Routes to |
| --- | --- |
| Ideate | `brainstorming` (skipped if the task is already concrete) |
| Plan | `plan` — produces a plan file under `.claude/local/plans/` |
| Execute | `ralph`/`autopilot`/`team`/`ultrapilot` (autonomous) or `subagent-driven-development`/`plans-executing` (supervised) |
| Review | `code-review`, triaged with `code-review-receiving` discipline |
| Verify | `verification-before-completion` |
| Finish | `finishing-a-development-branch` |

Defaults to autonomous execution for well-scoped, low-blast work; switches to supervised when the change touches auth/payments/migrations, spans more than 10 files, or has contested acceptance criteria. `--auto`/`--supervised` override the heuristic.

---

## When to Use

Trigger when you:
- want one command to carry work end-to-end instead of invoking each SDLC skill by hand
- say "flow", "ship this", or "take this from idea to done"
- only need a single stage — invoke that stage's skill directly instead (`plan`, `ralph`, `code-review`, …)
