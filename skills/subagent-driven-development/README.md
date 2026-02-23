# Subagent-Driven Development

Execute implementation plans by dispatching a fresh subagent per task with two-stage review after each: spec compliance first, then code quality.

## What It Does

Orchestrates plan execution with quality gates:

1. **Read plan** and extract all tasks with full text and context
2. **Per task:**
   - Dispatch implementer subagent (answers questions, implements, tests, commits)
   - Dispatch spec reviewer (does code match the plan?)
   - If issues found: implementer fixes, reviewer re-reviews
   - Dispatch code quality reviewer (is it well-built?)
   - If issues found: implementer fixes, reviewer re-reviews
   - Mark task complete
3. **After all tasks:** Final code review, then finishing-a-development-branch

Fresh subagent per task prevents context pollution. Review loops ensure fixes actually work.

---

## When to Use

Triggers when you:

- Have an implementation plan with independent tasks
- Want to execute in the current session (vs plans-executing for parallel sessions)
- Need two-stage review (spec compliance + code quality) after each task

---

## Key Rules

- Never skip either review stage
- Never start code quality before spec compliance passes
- Never dispatch parallel implementation subagents (conflicts)
- If reviewer finds issues, implementer fixes and reviewer re-reviews until approved

---
