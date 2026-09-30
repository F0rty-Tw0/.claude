---
name: finishing-a-development-branch
description: Integrates a finished branch - confirms tests pass, then offers merge locally, open PR, keep, or discard, and cleans up only worktrees it created. Use when implementation is complete and the branch needs integrating.
---

# Finishing a Development Branch

## 1. Tests pass

Reuse this session's test evidence if nothing changed since it ran; otherwise run the suite (`pnpm test`, `cargo test`, `pytest`, `go test ./...`). Failing → show the failures and stop; no merge or PR on a red suite.

## 2. Detect the workspace

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master   # base branch; confirm with the user if unsure
```

| State | Menu |
|---|---|
| Normal repo, or linked worktree on a named branch | 4 options |
| Linked worktree, detached HEAD | 3 options (no local merge; externally managed, no cleanup) |

## 3. Offer the options, without extra commentary

```
Implementation complete. What would you like to do?
1. Merge back to <base> locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work
```

Detached HEAD: "Push as new branch and create a PR", "Keep as-is", "Discard".

## 4. Execute

**1 — Merge locally.** From the main repo root (`MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)`), with a clean `git status --porcelain` (uncommitted changes leak across or block the checkout): `git checkout <base> && git pull && git merge <feature>`, then run the tests on the merged result. Only after the merge succeeds: clean up (step 5), then `git branch -d <feature>`.

**2 — Push and PR.** Pushing is outward-facing, and `hooks/commit-guard.js` blocks it unless `~/.claude/.allow-commit` is set, so confirm the user wants the push, then `git push -u origin <feature>`. Load skill:pr-description for the title and body and run `gh pr create`. Keep the worktree; the user iterates on review feedback there.

**3 — Keep.** Report "Keeping branch `<name>` at `<path>`." No cleanup.

**4 — Discard.** List what will be permanently deleted (branch, commits, worktree path) and require the user to type `discard`. Then from the main repo root: clean up (step 5), `git branch -D <feature>`.

Never force-push unless the user explicitly asked.

## 5. Clean up (options 1 and 4 only)

Remove only worktrees this workflow created:

- Created by `EnterWorktree` this session → `ExitWorktree` with `action: "remove"`.
- Under `.worktrees/` or `worktrees/` (manual fallback) → from the main repo root: `git worktree remove "<path>" && git worktree prune`. Running it from inside the worktree fails.
- Anything else (harness- or user-managed, `GIT_DIR == GIT_COMMON`) → leave it.

Order matters: merge, then remove the worktree, then delete the branch — `git branch -d` fails while a worktree still references it.
