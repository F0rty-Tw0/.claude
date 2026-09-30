# Using Git Worktrees

Create isolated git workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching. Systematic directory selection + safety verification = reliable isolation.

## What It Does

Sets up isolated worktrees through a structured process:

1. **Detect** an existing linked worktree (with a submodule guard) and reuse it
2. **Create** with `EnterWorktree`; `git worktree add` under a gitignored `.worktrees/` only as a fallback
3. **Project setup**: Auto-detect and run (npm install, cargo build, pip install, go mod download)
4. **Baseline verification**: Run tests to ensure clean starting state

| Situation              | Action                     |
| ---------------------- | -------------------------- |
| Directory not ignored  | Add to .gitignore, tell user |
| Tests fail at baseline | Report failures, ask user  |

---

## When to Use

Triggers when you:

- Start feature work needing isolation from current workspace
- Prepare to execute implementation plans
- Need to work on multiple branches simultaneously

---
