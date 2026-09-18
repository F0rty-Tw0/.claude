# Ultrapilot

Thin router. Coordinated parallel implementation with per-worker git worktrees, decomposition, and a merge phase is what the `team` skill provides — this skill routes there and keeps only its file-ownership partitioning heuristic (3+ independent components with clear file boundaries → one worker per component).

## When to Use

- A task splits into 3+ independent components with clear file boundaries (multi-service refactors, parallel feature additions, full-stack builds)

Not for: single-component tasks (use `executor`/`flow`) or tasks needing shared-file coordination (use `team` directly).

---
