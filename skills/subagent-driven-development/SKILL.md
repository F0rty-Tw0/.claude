---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Subagent-Driven Development

Execute a plan by dispatching a fresh subagent per task, with two-stage review after each: spec compliance first, then code quality.

**Why subagents:** You delegate tasks to specialized agents with isolated context. By crafting their instructions precisely, you keep them focused and preserve your own context for coordination. They never inherit your session history — you construct exactly what they need.

**Core principle:** Fresh subagent per task + two-stage review (spec then quality) = high quality, fast iteration.

**Continuous execution:** Do not check in with your human partner between tasks. Execute all tasks without stopping. Only stop for: a BLOCKED status you cannot resolve, genuine blocking ambiguity, or all tasks complete. "Should I continue?" prompts waste their time — they asked you to execute the plan.

## When to Use

Use this skill when all three hold:

- You have an implementation plan.
- Tasks are mostly independent (not tightly coupled).
- You want to stay in this session.

Otherwise:

- No plan → manual execution or brainstorm first.
- Tightly coupled tasks → manual execution.
- Want a parallel session → **skill:plans-executing**.

**vs. plans-executing:** same session (no context switch), fresh subagent per task, automatic review checkpoints, no human-in-loop between tasks.

## The Process

1. Read the plan once. Extract every task with full text and context. Create all tasks with `TaskCreate`.
2. For each task, run the per-task loop below.
3. After all tasks: dispatch a final code reviewer over the entire implementation.
4. Finish with **skill:finishing-a-development-branch**.

**Per-task loop:**

1. Dispatch implementer subagent (`./implementer-prompt.md`) with full task text + scene-setting context.
2. If it asks questions, answer completely, then re-dispatch. Never rush it into implementation.
3. Implementer implements, tests, commits, self-reviews.
4. Dispatch spec reviewer (`./spec-reviewer-prompt.md`). If gaps found → implementer fixes → re-review. Loop until ✅.
5. Only then dispatch code quality reviewer (`./code-quality-reviewer-prompt.md`). If issues found → implementer fixes → re-review. Loop until ✅.
6. Mark task complete with `TaskUpdate`. Move to next task.

## Model Selection

Use the least powerful model that can handle each role.

- **1-2 files, complete spec** (mechanical) → cheap, fast model. Most well-specified tasks are here.
- **Multiple files, integration concerns** → standard model.
- **Design judgment or broad codebase understanding, and all reviews** → most capable model.

## Handling Implementer Status

Implementers report one of four statuses:

- **DONE:** proceed to spec review.
- **DONE_WITH_CONCERNS:** read the concerns first. Correctness/scope concerns → address before review. Observations ("file getting large") → note and proceed.
- **NEEDS_CONTEXT:** provide the missing context and re-dispatch.
- **BLOCKED:** assess the blocker — context problem → add context, same model; needs more reasoning → more capable model; too large → break into pieces; plan is wrong → escalate to human.

**Never** ignore an escalation or force the same model to retry without changing something.

## Prompt Templates

- `./implementer-prompt.md` — dispatch implementer subagent
- `./spec-reviewer-prompt.md` — dispatch spec compliance reviewer
- `./code-quality-reviewer-prompt.md` — dispatch code quality reviewer

## Example (one task)

```
Task 1: Hook installation script
[Get Task 1 text + context, already extracted]
[Dispatch implementer with full task text + context]

Implementer: "Should the hook install at user or system level?"
You: "User level (~/.config/worktrees/hooks/)"
Implementer: [implements install-hook, 5/5 tests passing, self-review caught
              missing --force flag and added it, committed]

[Dispatch spec reviewer]
Spec reviewer: ✅ All requirements met, nothing extra

[Dispatch code quality reviewer]
Code reviewer: Clean, good coverage. Approved.

[Mark Task 1 complete, move to Task 2]
```

When a spec reviewer finds issues (e.g. "missing progress reporting; extra --json flag not requested"), the implementer removes the extra and adds the missing, then the reviewer re-reviews before quality review begins.

## Rules — Never

- Start implementation on main/master without explicit user consent.
- Skip either review, or start code quality review before spec compliance is ✅ (wrong order).
- Proceed to the next task with open review issues, or accept "close enough" on spec.
- Dispatch multiple implementer subagents in parallel (conflicts).
- Make a subagent read the plan file — provide full text instead.
- Skip scene-setting context, or ignore subagent questions.
- Let self-review replace actual review — both are needed.
- Fix a failed task manually — dispatch a fix subagent (avoids context pollution).

These gates are the whole point: self-review catches issues before handoff, spec review prevents over/under-building, quality review ensures it's well-built, and re-review loops confirm fixes actually work. The cost (three subagent invocations per task plus loops) buys catching issues early, which is cheaper than debugging later.

## Integration

**Required workflow skills:**

- **skill:using-git-worktrees** — isolated workspace (creates or verifies)
- **skill:plans-writing** — creates the plan this skill executes
- **skill:code-review-requesting** — dispatches `code-reviewer` with scoped diff context
- **skill:finishing-a-development-branch** — complete development after all tasks

**Subagents should use:**

- **skill:test-driven-development** — subagents follow TDD per task

**Alternative:** **skill:plans-executing** for a parallel session instead of same-session execution.
