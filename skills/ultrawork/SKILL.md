---
name: ultrawork
description: Use when multiple independent tasks can run simultaneously, the user says "ulw" or "ultrawork", or work needs to be delegated to several agents at once and the user will manage completion themselves. Not for tasks needing guaranteed completion with verification (use ralph), a full autonomous pipeline (use autopilot), or a single sequential task with no parallelism.
---

# Ultrawork (alias -> parallel fan-out)

Ultrawork is now a thin router. The harness runs parallel Agent calls natively, so there is no separate engine to maintain.

## Route

- **Simple fan-out (a handful of independent tasks, this session):** `Skill("dispatching-parallel-agents")` -- fire all independent Agent calls in ONE message and integrate the returns.
- **Large or deterministic fan-out (many tasks, budgets, phases, resume):** use the **Workflow tool** for structured multi-agent execution instead of hand-managing the batch.

## Ultrawork's distinctions (carry these into whichever route)

- **DO** fire all independent agent calls in ONE message -- never serialize independent work.
- **DO** fan out only for sizeable independent tracks; a few reads or edits are faster done directly than delegated (each agent re-explores and you re-read its report).
- **DO** match agent to task: `explore` for lookups, `executor` for scoped implementation, `deep-executor` for complex or cross-system work. Each agent's model comes from its definition; override `model` only for exceptionally hard tasks.
- **DO** give each agent `isolation: "worktree"` when parallel tasks would touch the same files, then merge after -- don't serialize them.
- **DO** use `run_in_background: true` for operations over ~30s (installs, builds, test suites); keep quick checks foreground.
- **DON'T** spawn `general-purpose` when a specific agent fits.
- **DON'T** expect persistence or verification here -- for guaranteed completion use `ralph`, for the full autonomous pipeline use `autopilot`/`flow`.

This skill is an alias; the machinery lives in dispatching-parallel-agents + the Workflow tool.
