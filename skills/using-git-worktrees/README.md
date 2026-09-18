# Using Git Worktrees

Create isolated git workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching. Systematic directory selection + safety verification = reliable isolation.

## What It Does

Sets up isolated worktrees through a structured process:

1. **Directory selection** (priority order): Check existing (.worktrees/worktrees) > Check CLAUDE.md > Ask user
2. **Safety verification**: Verify directory is gitignored before creating project-local worktree
3. **Creation**: `git worktree add <path> -b <branch-name>`
4. **Project setup**: Auto-detect and run (npm install, cargo build, pip install, go mod download)
5. **Baseline verification**: Run tests to ensure clean starting state

| Situation              | Action                     |
| ---------------------- | -------------------------- |
| Directory not ignored  | Add to .gitignore + commit |
| Tests fail at baseline | Report failures, ask user  |
| Both dirs exist        | Use `.worktrees/`          |

---

## When to Use

Triggers when you:

- Start feature work needing isolation from current workspace
- Prepare to execute implementation plans
- Need to work on multiple branches simultaneously

---
