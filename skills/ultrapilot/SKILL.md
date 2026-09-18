---
name: ultrapilot
description: Use when a task has 3+ independent components with clear file boundaries (multi-service refactors, parallel feature additions, full-stack builds) and you want them implemented simultaneously by multiple workers instead of sequentially.
---

# Ultrapilot (alias -> team, worktree isolation)

Ultrapilot is now a thin router. Coordinated parallel implementation with per-worker git worktrees, decomposition, and a merge phase is exactly what the `team` skill already provides natively.

## Route

- Invoke `Skill("team")` with worktree isolation:
  `team N:executor "<task>"`  (one worker per independent component)
- team handles the machinery: decompose into file-/module-scoped subtasks, spawn N teammates in parallel, isolate each in a git worktree (`createWorkerWorktree` + `workingDirectory`), then `checkMergeConflicts` -> `mergeWorkerBranch --no-ff` in the merge phase.

## Ultrapilot's partitioning heuristic (apply when routing to team)

- **Trigger:** 3+ genuinely independent components with clear file boundaries (e.g. backend / frontend / db). Fewer than that, or heavy interdependencies -> use `flow --auto` sequentially instead.
- **One worker per component:** assign each an exclusive file set / glob (`src/api/**`, `src/ui/**`); no file owned by two workers.
- **Isolation is physical, not honor-system:** give each worker its own worktree so two cannot corrupt the same working copy -- the ownership map becomes a merge plan, not a lock.
- **Shared/boundary files deferred:** `package.json`, `tsconfig.json`, shared types are updated sequentially in the merge phase, not by parallel workers.
- **Merge phase at the end:** merge each worktree branch, resolving any real overlap once; a conflict there is a decomposition miss to record.
- **Max ~5 concurrent workers;** re-dispatch (don't merge) any worker that contradicts another's boundary assumptions.

This skill is an alias; the machinery lives in team + the Workflow tool.
