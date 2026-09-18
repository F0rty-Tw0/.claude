# Writing Plans

Write comprehensive implementation plans assuming the engineer has zero context. Bite-sized tasks with exact file paths, complete code, and exact commands. DRY, YAGNI, TDD, frequent commits.

## What It Does

Creates detailed implementation plans with:

- **Bite-sized steps** - Each step is one action (2-5 minutes): write failing test, run it, implement minimal code, run tests, commit
- **Plan header** - Feature name, Goal, Architecture, Tech Stack
- **Task structure** - Files (create/modify/test with exact paths), steps with complete code, verification commands with expected output
- **Saved to** `docs/plans/YYYY-MM-DD-<feature-name>.md`

After plan completion, offers two execution choices:
1. **Subagent-Driven** (same session) - fresh subagent per task with code review
2. **Parallel Session** - batch execution with checkpoints via plans-executing

---

## When to Use

Triggers when you:

- Have a spec or requirements for a multi-step task
- Need to plan before touching code
- Want a structured implementation roadmap for another engineer or agent

---
