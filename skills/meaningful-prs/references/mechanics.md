# Stack Mechanics (squash-merge repos)

Commands for building, updating and landing a PR stack with plain `git` + `gh`. No extensions.

- `<default>` = the repo's default branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`). Never assume `main`.
- `<stack>` = a branch prefix **different from the source branch name**. Git can't hold both `feat/loyalty` and `feat/loyalty/1-money`, because a ref can't be both a file and a directory. Source `feat/loyalty` → slices `loyalty/1-money`, `loyalty/2-ledger`, …
- Commit-guard: every Bash call containing `git commit` or `git push` needs the one-shot flag, set in a **separate, earlier** Bash call (`touch ~/.claude/.allow-commit`). The hook runs before the command, so `touch … && git commit` in one call is blocked. Batch branches into one `git push`. Run `git push` and `gh pr create` as **separate** Bash calls. If `pr-proof-guard` blocks the call, the push never runs, but commit-guard has already used up the flag.
- **Authorization:** the split approval covers building, the first push and opening the PRs. Restacks in later turns (after review fixes or merges) need a **new explicit user request**. The same applies to `git merge`, which creates commits that commit-guard does not catch.

## Build slices from one interleaved branch

```bash
git status                                    # must be clean
git fetch origin
git branch <src>-backup <src>                 # untouched reference copy
git switch -c <stack>/src <src> && git merge origin/<default>   # sync first, or taking files by path silently reverts newer <default> edits
<typecheck> && <test>

# slice 1 (base <default>)
git switch -c <stack>/1-<name> origin/<default>
git restore --source=<stack>/src --staged --worktree -- <path> <path-test>   # whole files by path; also carries deletions
# partial file (e.g. one flag line): apply just that hunk with the Edit tool, or stage a prepared version:
#   git update-index --add --cacheinfo 100644,$(git hash-object -w <prepared-file>),<path>
<typecheck> && <test>                          # must pass ALONE
git add <paths> && git commit -m "…"           # per meaningful-commits

# slice 2 (stacked on slice 1)
git switch -c <stack>/2-<name> <stack>/1-<name>
git restore --source=<stack>/src --staged --worktree -- <paths>
<typecheck> && <test> && git add <paths> && git commit -m "…"
```

Renames: restore both the old path (records the deletion) and the new path, in the same slice.

## Completeness check (before any push)

```bash
git switch --detach <top of the longest chain>           # one ref
git merge --no-edit <every other chain top / independent slice>
# expected conflicts (e.g. a shared flag file): resolve BY HAND from the slices' own content,
# then `git add <files> && git merge --continue`. Never copy the file from <stack>/src here; that would hide a bad split.
git diff --stat <stack>/src HEAD                         # MUST be empty
git switch <stack>/src
```

Any output means a file was dropped or misplaced. Fix it before pushing.

## Push + open (bottom-up)

```bash
git push -u origin <stack>/1-<name> <stack>/2-<name> <stack>/3-<name>     # one call, one flag
```
```bash
gh pr create --base <default>         --head <stack>/1-<name> --title "…" --body-file <scratch>/pr1.md   # separate call
gh pr create --base <stack>/1-<name>  --head <stack>/2-<name> --title "…" --body-file <scratch>/pr2.md
# after all exist: fill real PR numbers into every ## Stack section
gh pr edit <n> --body-file <scratch>/prN.md
```

An old PR is already open for the source branch → comment "superseded by #a #b #c". Close it only if the user says so.

## Review changes requested on a lower PR (new user request needed)

```bash
git switch <stack>/1-<name>                   # new commit, no amend
<fix> && <test> && git add <paths> && git commit -m "…"
git switch <stack>/2-<name> && git merge <stack>/1-<name> && <test>   # repeat up the chain
git push origin <stack>/1-<name> <stack>/2-<name>                      # normal push, no force
```

If the fix changed an API that upper PRs call, fix those call sites during the restack. Re-run `pr-description` Step 0 so each `## Proof` is fresh.

## Parent merged (new user request needed)

Which merge method was used: `git rev-list --parents -n1 $(gh pr view <parent> --json mergeCommit -q .mergeCommit.oid)`. Two parents = merge commit: retarget, then a plain `git merge origin/<default>` into the child is the whole restack. One parent = squash or rebase: follow the rest of this section. For a **rebase** merge of an N-commit parent PR (`gh pr view <parent> --json commits -q '.commits | length'`), use `$SQUASH~N` wherever it says `$SQUASH^`.

### Squash

GitHub retargets open child PRs automatically when the merged parent's head branch is deleted. Deleting an **unmerged** base branch closes its PRs instead. Retargeting first is always safe:

```bash
gh pr edit <child> --base <default>
gh pr view <child> --json baseRefName          # confirm
git fetch origin
SQUASH=$(gh pr view <parent> --json mergeCommit -q .mergeCommit.oid)
PARENT_TIP=$(gh pr view <parent> --json headRefOid -q .headRefOid)
git cat-file -e "$PARENT_TIP" 2>/dev/null || git fetch origin "pull/<parent>/head"   # the local parent branch may be stale or deleted
git switch <stack>/2-<name>                    # FIRST: every merge below must land on the child
git merge-base --is-ancestor "$PARENT_TIP" HEAD || git merge "$PARENT_TIP"   # child must hold the parent's final state
git merge "$SQUASH^"                           # 1. <default> as it was just BEFORE the squash: brings unrelated drift
git merge -s ours "$SQUASH"                    # 2. mark the squash merged; content is already in the child
git merge origin/<default>                     # 3. anything after the squash
<test>
git diff --stat origin/<default>...<stack>/2-<name>   # must show only this slice's files
git diff origin/<default> HEAD -- $(git diff --name-only "$SQUASH^" "$SQUASH")   # content check on the parent's files: empty, or only this slice's intended edits (--stat can't see a revert inside a shared file)
git push origin <stack>/2-<name>
gh pr diff <child> --name-only                  # same check on GitHub
# pass it up: merge <stack>/2-<name> into its children, test, push
```

**Why step 1 comes first:** `-s ours` on the squash commit also marks every older `<default>` commit as merged, while keeping the child's tree. Any unrelated `<default>` change the child hadn't merged yet would be silently reverted. (Verified in a scratch clone: without step 1 the drift was lost; with it the drift survived and the diff was exactly the child's files.)

A plain `git merge origin/<default>` is enough when the child never touched the parent's files. It conflicts when the child edited a file the parent added, or appended next to the parent's line in a shared file. Use the 3-step sequence in those cases.

Remote branch delete, if GitHub didn't auto-delete: `git push origin --delete <stack>/1-<name>`. 🔴 Ask the user first, every time.

### Last-resort fallback: rebase (🔴 force-push)

```bash
git rebase --onto origin/<default> <old-parent-tip-sha> <stack>/<TOP-of-chain> --update-refs   # --update-refs moves branches BELOW the rebased one, so rebase the top
# <expected-sha> = `git rev-parse origin/<branch>` recorded BEFORE the rebase
git push --force-with-lease=<stack>/2-<name>:<expected-sha> --force-with-lease=<stack>/3-<name>:<expected-sha> origin <stack>/2-<name> <stack>/3-<name>
```

🔴 Ask the user first, every time. The rebase drops earlier restack merge commits and their conflict resolutions, so expect to resolve the same conflicts again. Use the parent's final tip **SHA**, not a local branch that may be stale.

Update every `## Stack` section afterwards: mark the merged PR and fix the bases.
