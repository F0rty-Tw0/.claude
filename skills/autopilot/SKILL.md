---
name: autopilot
description: Use when the user wants end-to-end autonomous execution from an idea to working code -- says "autopilot", "auto pilot", "autonomous", "build me", "create me", "make me", "full auto", "handle it all", or "I want a/an..."; the task spans multiple phases (planning, coding, testing, validation); or the user wants hands-off execution and is willing to let the system run to completion.
---

# Autopilot (alias -> flow, autonomous mode)

Autopilot is now a thin router. The full idea-to-code lifecycle it used to hand-roll (expand -> plan -> execute -> QA -> validate -> finish) is exactly what `flow` runs in autonomous mode, driven by the native Workflow tool for deterministic phase fan-out, budgets, and resume.

## Route

- Invoke `Skill("flow")` with `--auto` and the user's idea:
  `flow --auto "<the idea>"`
- `flow --auto` runs the whole pipeline hands-off: brainstorm/spec -> plan -> autonomous execution (ralph + parallel agents) -> code-review -> verify (ultraqa) -> finish-branch.
- For plan-only or supervised variants, use `flow --plan-only` / `flow --supervised`.

## Phase gates (already covered by flow)

Autopilot's old Phase_Gates map 1:1 onto flow's **Stage Gates** table (flow/SKILL.md), so they are NOT duplicated here:

- spec exists + testable requirements -> flow IDEATE + PLAN
- plan validated (critic/consensus) -> flow PLAN (`--consensus`)
- subtasks done + worktrees merged -> flow EXECUTE
- build exit 0 + tests 0 failures -> flow EXECUTE + VERIFY
- all reviewers approved -> flow REVIEW + VERIFY

Do not advance a stage until flow's gate observation holds; if a gate can't be met, stop and report -- never fake it.

This skill is an alias; the machinery lives in flow + the Workflow tool.
