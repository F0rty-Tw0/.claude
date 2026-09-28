# Stack Mechanics (squash-merge repos)

Commands for building, updating and landing a PR stack with plain `git` + `gh`. No extensions. Every commit needs the commit-guard flag (`touch ~/.claude/.allow-commit`), and so does each push command. Batch the branches into one `git push` to use one flag.

## Build slices from one interleaved branch

`<stack>` is a prefix **different from the source branch name**: git can't hold both `feat/loyalty` and `feat/loyalty/1-money` (a ref can't be a file and a directory). Source `feat/loyalty` → slices `loyalty/1-money`, `loyalty/2-ledger`, …

```bash
git status                                    # must be clean
git fetch origin
git branch <src>-backup <src>                 # untouched reference copy
git switch -c <stack>/src <src> && git merge origin/main   # sync first, or path-checkout silently reverts newer main edits
<typecheck> && <test>

# slice 1 (base main)
git switch -c <stack>/1-<name> origin/main
git checkout <stack>/src -- <path> <path-test>          # whole files by path
# partial file (e.g. one flag line): apply just that hunk with the Edit tool (no `checkout -p` — interactive)
<typecheck> && <test>                                  # must pass ALONE
git add <paths> && git commit -m "…"                   # per meaningful-commits

# slice 2 (stacked on slice 1)
git switch -c <stack>/2-<name> <stack>/1-<name>
git checkout <stack>/src -- <paths>
<typecheck> && <test> && git add <paths> && git commit -m "…"
```

## Completeness check (before any push)

```bash
git switch --detach <top-of-each-chain>
git merge --no-edit <other independent/sibling slices>   # resolve expected trivial conflicts (e.g. flag file)
git diff --stat <stack>/src HEAD                          # MUST be empty
git switch <stack>/src
```

Any output → a file was dropped or misplaced. Fix before pushing.

## Push + open (bottom-up)

```bash
git push -u origin <stack>/1-<name> <stack>/2-<name> <stack>/3-<name>     # one flag, one command
gh pr create --base main            --head <stack>/1-<name> --title "…" --body-file <scratch>/pr1.md
gh pr create --base <stack>/1-<name> --head <stack>/2-<name> --title "…" --body-file <scratch>/pr2.md
# after all exist: fill real PR numbers into every ## Stack section
gh pr edit <n> --body-file <scratch>/prN.md
```

Old PR already open for the source branch → comment "superseded by #a #b #c". Close it only if the user says so.

## Review changes requested on a lower PR

```bash
git switch <stack>/1-<name>   # new commit, no amend
<fix> && <test> && git add <paths> && git commit -m "…" && git push
git switch <stack>/2-<name> && git merge <stack>/1-<name> && <test> && git push   # repeat up the chain
```

The fix changed an API that upper PRs call → fix those call sites during the restack, and re-run `pr-description` so each `## Proof` is fresh.

## Parent squash-merged

```bash
gh pr edit <child> --base main          # FIRST — deleting a PR's base branch closes the PR
                                        # (repos with deleteBranchOnMerge retarget automatically; verify with gh pr view <child> --json baseRefName)
git fetch origin
git switch <stack>/2-<name> && git merge origin/main && <test> && git push
git diff --stat origin/main...<stack>/2-<name>    # must show only this slice's files
gh pr diff <child> --name-only                   # same check on GitHub
# pass it up: merge <stack>/2-<name> into its children, test, push
git push origin --delete <stack>/1-<name>         # if not auto-deleted
```

Merge conflict on `git merge origin/main`? Content is identical, so conflicts are rare. Resolve, or fall back to:

```bash
git rebase --onto origin/main <old-parent-branch> <stack>/2-<name> --update-refs   # moves the whole chain above too
git push --force-with-lease origin <stack>/2-<name> <stack>/3-<name>                # 🔴 ask the user first, every time
```

Update every `## Stack` section: mark the merged PR, fix bases.
