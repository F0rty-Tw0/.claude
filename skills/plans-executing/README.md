# Executing Plans

Load an implementation plan, review it critically, and execute tasks in batches with checkpoints for architect review.

## What It Does

Follows a structured execution process:

1. **Load and Review** - Read plan, identify concerns, raise before starting
2. **Execute Batch** - Default first 3 tasks, follow steps exactly, run verifications
3. **Report** - Show what was implemented and verification output, say "Ready for feedback"
4. **Continue** - Apply feedback, execute next batch, repeat
5. **Complete** - Uses finishing-a-development-branch skill for integration

---

## When to Use

Triggers when you:

- Have a written implementation plan to execute in a separate session
- Need batch execution with review checkpoints between batches
- Want architect review at regular intervals during implementation

---

## Key Rules

- Review plan critically first - raise concerns before starting
- Follow plan steps exactly
- Don't skip verifications
- Stop when blocked - don't guess
- Between batches: just report and wait for feedback

---
