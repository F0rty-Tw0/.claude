---
name: meaningful-prs
description: Use when opening PRs for a branch that is large (roughly 400+ changed lines), mixes trunk and leaf changes, bundles a migration or widely-imported shared change with feature code, or holds several independent concerns — or when the user asks to split a PR, stack PRs, create stacked or dependent PRs, or restack after a parent PR merged.
---

# Meaningful PRs

## Overview

This is the PR twin of `meaningful-commits`: **one reviewable unit per PR**.

- Split by **blast radius** first, then by module or feature. Trunk lines must not hide inside leaf volume, so the review knob can do its job.
- Every PR stands alone: it builds, its tests pass, it's safe to merge, and it ships dark.

**REQUIRED SUB-SKILL:** Use skill:pr-description for every PR. It adds `## Proof` and a fresh `code-review`, and a hook blocks PRs without proof.

## Split or not

| One PR | Split |
|---|---|
| ≤ ~400 changed lines (lockfiles, generated files, snapshots and eval fixtures excluded) | > ~400 lines |
| One blast class, one concern | Trunk + leaf mixed (e.g. an ungated change to a widely-imported helper + a feature) |
| Hotfix | Migration/schema that has a deploy order relative to code |
| Pieces don't build apart | Independent concerns (a badge that doesn't need the ledger) |

## Slice order

1. **Trunk prep** (deep human read), one concern per PR:
   - expand-only migration
   - shared helper or type changes
   - event types together with their consumer branch (consumer before producer)
2. **Gated core**, per module: logic behind a flag that defaults OFF, with the flag line in the same PR.
3. **Leaf**: UI and admin views, each with its own flag.
4. **Later, never inside the stack**: the flag-flip PR (after `code-review` `launch` / canary) and the cleanup PR (remove the flag and the dead branch).

## Topology

- **Independent PRs off the default branch by default.** They merge in parallel. Exception: siblings that share a partial file (a flag registry) — the second one needs `git merge origin/<default>` after the first lands.
- **Stack only on a real dependency.** The child imports or migrates on top of the parent.
- A PR has **one** base. If a PR needs two parents, put them in a line: `money ← ledger ← credits`.
  - This creates a fake edge: `ledger` now waits on `money` without importing it. If that wait hurts, open both parents off `main` and open the child after one merges. Say which option you picked in the split plan.
- Maximum depth is 3. Past 3, merge the bottom PR before stacking more.

## Procedure

1. **Pre-flight (read-only):**
   - `gh repo view --json defaultBranchRef,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge` — use `defaultBranchRef` as `<default>` everywhere, never assume `main`
   - `git diff --stat origin/<default>...HEAD`
   - `gh pr list --head <branch>`
   - migration number collisions on `origin/<default>`
   - the real typecheck/test script names
2. **Split plan** as a table: Slice, Branch, Base, Blast (`code-review` `references/blast-radius.md`), Tasks/Files, ~Lines. If the plan has a **PR Slices** table (`plans-writing`), start from it and fill Files and ~Lines from `git diff --stat`.
3. **One approval:** ask with AskUserQuestion, together with `pr-description`'s audience question (for us / for someone else) asked **once for the whole stack**. The approval covers the listed commits, the first push and the PRs. Force-push and remote branch deletes are **never** part of it; ask separately every time. Restacks in later turns need a new user request.
4. **Build the slices.** Details and commands: `references/mechanics.md`.
   - Sync the source branch with `origin/<default>` first.
   - Take files **by path** from the source branch (`git restore --source`, which also carries deletions).
   - Partial files (a flag line): Edit, or stage a prepared version into the index.
   - Each slice must pass typecheck and tests before its commits, which follow `meaningful-commits`.
5. **Completeness check:** the union of all slices must equal the source branch. `git diff --stat` must be empty. If not, stop.
6. **Open PRs bottom-up**, one `pr-description` run per PR. **Skip its "one PR or several?" routing**: the split is already decided, so don't loop back here. Its review gets:
   - the diff **against the parent** (`<parent>...<slice>`), not `<default>`; the description's Step 1 `BASE` is the parent too
   - the stack map, so that symbols consumed by a later PR are not flagged as dead code

   BLOCK on a lower PR → stop. Don't open the PRs above it.
7. **Stack map** in every body, placed before `## Proof`:

   ```markdown
   ## Stack
   1. #12 money: integer-cents helpers — Trunk
   2. **#13 ledger table + repo + consumer ← this PR** (base `loyalty/1-money`) — Trunk
   3. #14 loyalty credits (flag `loyaltyCredits`) — Branch
   Independent: #16 credit badge (base `main`) — Leaf
   Do not merge until #12 is merged and this PR is retargeted to `main`.
   ```

8. **Watch** with `code-review` `babysit`, run over the whole stack.

## After review or merge (squash repos)

The default is a **merge-based restack**: merge the parent into the child, then a normal push. There's no force-push, and squash throws the merge commits away anyway.

After a squash, merge in this order: `<default>` as it was just before the squash, then `-s ours` the squash commit, then `<default>`. Skipping the first step silently reverts unrelated `<default>` changes. Retarget the child first; it's always safe. Commands and reasons: `references/mechanics.md`.

## Common mistakes

| Mistake | Fix |
|---|---|
| Cherry-picking interleaved commits | Slice by path from the synced source branch |
| Stacking everything in one line | Independent off `main` unless a real import/migration dependency exists |
| Flag line shipped in a different PR than the code that reads it | Flag line goes with its reader |
| Reviewing a child PR against `main` | Diff against the parent, and give the reviewer the stack map |
| `git merge -s ours <squash>` straight away | Merge `<squash>^` first, or unrelated default-branch drift is lost |
| Assuming the default branch is `main` | `defaultBranchRef` from `gh repo view` |
| Rebase + force-push after every review fix | Merge the parent into the child; push normally |
| Flag flip bundled into the feature stack | Separate PR after canary (`code-review` `launch`) |
