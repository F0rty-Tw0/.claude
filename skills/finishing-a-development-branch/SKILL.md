---
name: finishing-a-development-branch
description: Integrates a finished branch - confirms tests pass, then offers merge locally, open PR, or keep (discard only on explicit request), and cleans up only worktrees it created. Use when implementation is complete and the branch needs integrating.
---

# Finishing a Development Branch

## 1. Tests pass

Run the suite fresh (`pnpm test`, `cargo test`, `pytest`, `go test ./...`). Failing → show the failures and stop; no merge or PR on a red suite.

## 2. Detect the workspace

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git rev-parse --show-toplevel   # record this path now; later steps cd away, and each Bash call is a fresh shell, so use the recorded path literally wherever $WORKTREE_PATH appears
DEFAULT=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
git merge-base HEAD "origin/$DEFAULT"   # base branch; confirm with the user if empty or unsure
```

Uncommitted work (`git status --porcelain` not empty — the default when commits weren't authorized): say so first. Merge and PR need commits, so offer to commit via skill:meaningful-commits (only with the user's go-ahead) before options 1–2.

| State | Menu |
|---|---|
| Normal repo, or linked worktree on a named branch | 3 options |
| Linked worktree, detached HEAD | 2 options (no local merge; externally managed, no cleanup) |

## 3. Offer the options, without extra commentary

```
Implementation complete. What would you like to do?
1. Merge back to <base> locally
2. Push and create a Pull Request
3. Keep the branch as-is
```

Detached HEAD: "Push as new branch and create a PR", "Keep as-is".

Discard isn't on the menu; it runs only when the user explicitly asks to throw the work away.

## 4. Execute

**1 — Merge locally.** From the main repo root (`MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)`), with a clean `git status --porcelain` (uncommitted changes leak across or block the checkout): `git checkout <base> && git pull && git merge <feature>`, then run the tests on the merged result. Merged result red → stop. Leave the worktree and branch in place and investigate; nothing is pushed, so the merge is local and recoverable. Only after the merge succeeds: clean up (step 5), then `git branch -d <feature>`.

**2 — Push and PR.** Pushing is outward-facing, and `hooks/commit-guard.js` blocks it unless `~/.claude/.allow-commit` is set, so confirm the user wants the push, then `git push -u origin <feature>`. Load skill:pr-description for the title and body and run `gh pr create`. Keep the worktree; the user iterates on review feedback there.

**3 — Keep.** Report "Keeping branch `<name>` at `<path>`." No cleanup.

**Discard (explicit request only).** List what will be permanently deleted (branch, commits, worktree path) and name any uncommitted files, which discard does not remove from a normal checkout, and require the user to type `discard`. Then from the main repo root: clean up (step 5), `git branch -D <feature>`.

Never force-push unless the user explicitly asked.

## 5. Clean up (option 1 and confirmed discards only)

Remove only worktrees this workflow created:

- Created by `EnterWorktree` this session → `ExitWorktree` with `action: "remove"`.
- `$WORKTREE_PATH` under `.worktrees/` or `worktrees/` (manual fallback) → from the main repo root: `git worktree remove "$WORKTREE_PATH" && git worktree prune`. Running it from inside the worktree fails.
- Anything else (harness- or user-managed, `GIT_DIR == GIT_COMMON`) → leave it.

Removal refused (modified or untracked files): those files exist only there. Show `git -C "$WORKTREE_PATH" status --porcelain -uall` and ask: commit them, move them to the main checkout, or delete them. Never `--force` on your own.

Order matters: merge, then remove the worktree, then delete the branch — `git branch -d` fails while a worktree still references it.
