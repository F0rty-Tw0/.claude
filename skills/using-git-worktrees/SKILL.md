---
name: using-git-worktrees
description: Sets up an isolated workspace with EnterWorktree, or reuses an existing linked worktree, then installs deps and records a baseline test run. Use before executing a plan or starting feature work that should not touch the current checkout.
---

# Using Git Worktrees

## 1. Detect existing isolation

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git rev-parse --show-superproject-working-tree 2>/dev/null   # prints a path → submodule, treat as a normal repo
```

- `GIT_DIR != GIT_COMMON` and not a submodule → already in a linked worktree. Don't nest another; go to step 3. Report the path and branch (detached HEAD → "externally managed; branch needed at finish time").
- Otherwise it's a normal checkout. Without a stated worktree preference, ask: "Set up an isolated worktree? It protects your current branch." Declined → work in place, go to step 3.

## 2. Create it

Use `EnterWorktree` (creates `.claude/worktrees/<name>` on a new branch and switches the session there). The harness tracks it, so a manual `git worktree add` next to it creates state the harness can't see. Subagents get the same isolation with `Agent(isolation: "worktree")`.

Fallback only when `EnterWorktree` is unavailable:

```bash
git check-ignore -q .worktrees || echo ".worktrees/" >> .gitignore   # tell the user; commit only if they ask
git worktree add ".worktrees/$BRANCH" -b "$BRANCH" && cd ".worktrees/$BRANCH"
```

Permission error (sandbox) → tell the user and work in place.

## 3. Set up and record a baseline

Install dependencies for what's present (`pnpm install`, `cargo build`, `pip install -r requirements.txt` / `poetry install`, `go mod download`), then run the tests (`pnpm test`, `pnpm exec playwright test`, `cargo test`, `pytest`, `go test ./...`).

Failures → report them and ask whether to proceed; without a baseline you can't tell new bugs from old ones. Passing → "Worktree ready at `<path>`. Tests passing (<N>, 0 failures)."

Cleanup belongs to skill:finishing-a-development-branch.
