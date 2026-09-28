**Verdict: split into 5 PRs. Four form a stack (each PR based on the one below it) and one comes off `main`. Nothing runs until the user answers the 3 questions in section 6.**

Strongest objection: stacked PRs with squash-only merging add restack work after every merge. A 3-PR split would be less of that. I still recommend 5, because the `formatPrice` change touches 30 importers and should not be reviewed buried inside 1,400 lines of feature code.

Unknowns: whether commits, pushes and PRs are authorized; whether the `formatPrice` output change is intended; whether the admin surface should be ungated. All three are in section 6. The rest can be answered by reading the repo, so the pre-flight step checks it.

**Numbers in the scenario don't add up.** The table lists 18 files and about 1,630 changed lines. The header says 14 files and about 1,450 lines. `git diff --stat` decides which is right. The completeness check in step 3.9 catches anything the table missed.

---

## 1. Split and contents

| PR | Branch | Contents | ~Lines |
|---|---|---|---|
| **1** | `loyalty/1-money` | `money.ts` + `money.test.ts` | 160 |
| **2** | `loyalty/2-ledger` | `004_wallet_ledger.sql`, `ledgerRepo.ts` + test, `events/types.ts`, `events/consumer.ts` | 290 |
| **3** | `loyalty/3-credits` | `loyalty.ts` + test, `checkout.ts`, the `loyaltyCredits: false` line in `featureFlags.ts`, `docs/loyalty.md` | 450 |
| **4** | `loyalty/4-badge` | `CreditBadge.tsx` + test + stories, the `creditBadge: false` line in `featureFlags.ts` | 350 |
| **5** | `loyalty/5-admin` | `api/loyaltyReport.ts`, `admin/LoyaltyReport.tsx` + test | 380 |

Why this grouping:

1. **PR1 stands alone.** It is the only change to existing behavior that isn't behind a flag, and it reaches 30 files. It needs its own focused review.
   - None of the 30 importers are in the diff. So `formatPrice` must keep its signature, or the branch doesn't type-check (inferred; step 3.1 confirms).
   - Its output can still change, for example rounding or currency symbol. Then all 30 call sites change what they show.
2. **`types.ts` and `consumer.ts` stay together in PR2.** A new event type with no handler can fail an exhaustive-switch type check. The consumer writes through `ledgerRepo`, so it belongs with the ledger code.
3. **Each flag line ships with the code that reads it.** That lets PR4 stay independent of the billing chain.
4. **Docs go in PR3,** the core feature. If `loyalty.md` also documents the badge or admin page, I'd still keep one docs file rather than split it three ways.

---

## 2. Bases and order

```
main ← PR1 money ← PR2 ledger ← PR3 credits
                             ↖ PR5 admin
main ← PR4 badge
```

- **PR1** → base `main`.
- **PR2** → base `loyalty/1-money`. `ledgerRepo` probably uses the cents helpers (inferred). If step 3.1 shows it doesn't import `money`, it can still stay here, because PR3 needs both PR1 and PR2 and a PR can only have one base.
- **PR3** → base `loyalty/2-ledger`.
- **PR5** → base `loyalty/2-ledger`. It only reads the ledger and doesn't need PR3.
- **PR4** → base `main`, but only if `CreditBadge` imports nothing new from `money.ts`. If it does, base it on `loyalty/1-money`.

Open order: 1 → 2 → 3 → 5 → 4, bottom first so each body can link to the real PR number below it.

Merge order: 1 → 2 → then 3 and 5 in either order. PR4 can merge at any time.

- Both flags default to `false`, so each merge ships dark (deployed but switched off).
- Expected conflict: PR3 and PR4 both add a line at the same spot in `featureFlags.ts`. Whichever merges second hits a trivial conflict. Fix it by merging `main` into that branch.

---

## 3. Commands

These need the user's approval first (section 6).

**Why not cherry-pick:** the 23 commits mix all areas, so picking commits can't separate the areas. Instead I copy file contents per PR. Nothing is lost, because squash merge throws away per-commit history anyway.

**3.0 Safety and a clean tree**
```
git status                                   # must be clean
git fetch origin
git branch feat/loyalty-backup feat/loyalty  # untouched reference copy
```

**3.1 Pre-flight checks (read-only; findable facts, not questions)**
```
git log --oneline origin/main..feat/loyalty | wc -l         # expect 23
git diff --stat origin/main...feat/loyalty                  # real file list (14 vs 18?)
git diff origin/main...feat/loyalty -- src/shared/money.ts  # formatPrice signature and output change
git grep -n "shared/money" feat/loyalty -- src/db src/ui src/events src/api src/admin
git grep -l "formatPrice" origin/main -- src | wc -l        # confirm 30 importers
git ls-tree --name-only origin/main migrations/             # another 004_* on main?
gh api repos/{owner}/{repo} --jq '{squash: .allow_squash_merge, autodelete: .delete_branch_on_merge}'
gh pr list --head feat/loyalty --state open                 # is there already a PR for this branch?
cat package.json                                            # real typecheck/test script names
```
- If another `004_*` migration exists on `main`, renumber ours.
- Also check that `api/loyaltyReport.ts` has an admin authorization check, and that the route registers itself (no router file appears in the diff).

**3.2 Bring the source branch up to date with main**

Copying files straight from a stale branch would silently undo later `main` changes to those same files. So first:
```
git switch -c loyalty/src feat/loyalty
git merge origin/main        # resolve conflicts, then run typecheck + tests
```

**3.3 PR1**
```
git switch -c loyalty/1-money origin/main
git checkout loyalty/src -- src/shared/money.ts src/shared/money.test.ts
npm run typecheck && npm test       # all 30 importers must pass here
git commit -m "<via /meaningful-commits>"
```

**3.4 PR2**
```
git switch -c loyalty/2-ledger loyalty/1-money
git checkout loyalty/src -- migrations/004_wallet_ledger.sql src/db/ledgerRepo.ts src/db/ledgerRepo.test.ts src/events/types.ts src/events/consumer.ts
npm run typecheck && npm test && git commit -m "..."
```

**3.5 PR3**
```
git switch -c loyalty/3-credits loyalty/2-ledger
git checkout loyalty/src -- src/billing/loyalty.ts src/billing/loyalty.test.ts src/billing/checkout.ts docs/loyalty.md
# featureFlags.ts: add only the `loyaltyCredits: false` line with the Edit tool
# (git checkout -p is interactive and not available here)
npm run typecheck && npm test && git commit -m "..."
```

**3.6 PR5**
```
git switch -c loyalty/5-admin loyalty/2-ledger
git checkout loyalty/src -- src/api/loyaltyReport.ts src/admin/LoyaltyReport.tsx src/admin/LoyaltyReport.test.tsx
npm run typecheck && npm test && git commit -m "..."
```

**3.7 PR4**
```
git switch -c loyalty/4-badge origin/main   # or loyalty/1-money if it imports new money helpers
git checkout loyalty/src -- src/ui/CreditBadge.tsx src/ui/CreditBadge.test.tsx src/ui/CreditBadge.stories.tsx
# featureFlags.ts: add only `creditBadge: false` with the Edit tool
npm run typecheck && npm test && git commit -m "..."
```
File extensions are guessed from the table; use the real paths from 3.1.

**3.8 Commit gating**

`/meaningful-commits` is loaded first. Before each commit, run `touch ~/.claude/.allow-commit` (the user's one-shot commit-guard flag).

**3.9 Completeness check: the 5 PRs together must equal the branch**
```
git switch --detach loyalty/3-credits
git merge --no-edit loyalty/5-admin
git merge --no-edit loyalty/4-badge          # resolve the featureFlags conflict
git diff --stat loyalty/src HEAD             # must be empty
git switch loyalty/src
```
Any leftover output means a file was dropped or a change was misplaced. Stop and fix before pushing.

**3.10 Push and open PRs**

Load `/pr-description` first (user rule). No attribution lines.
```
git push -u origin loyalty/1-money loyalty/2-ledger loyalty/3-credits loyalty/5-admin loyalty/4-badge
gh pr create --base main              --head loyalty/1-money   --title "..." --body-file <scratch>/pr1.md
gh pr create --base loyalty/1-money   --head loyalty/2-ledger  --title "..." --body-file <scratch>/pr2.md
gh pr create --base loyalty/2-ledger  --head loyalty/3-credits --title "..." --body-file <scratch>/pr3.md
gh pr create --base loyalty/2-ledger  --head loyalty/5-admin   --title "..." --body-file <scratch>/pr5.md
gh pr create --base main              --head loyalty/4-badge   --title "..." --body-file <scratch>/pr4.md
gh pr edit <each> --body-file ...     # fill in the real PR numbers in the Stack section
```
If an open PR already exists for `feat/loyalty`: comment that it is superseded and link the 5 PRs. Close it only if the user says so.

---

## 4. What every PR body must contain

- **Stack section:** an ordered list of all 5 PRs with links, this PR highlighted, and "Depends on #N".
- **Upper PRs (2, 3, 5):** "Base is `loyalty/…`. Do not merge until #N merges and this PR is retargeted to `main`." Merging early would land the code in the parent branch, not `main`.
- **What and why:** scope, and what is deliberately left to other PRs.
- **Real test evidence:** the actual typecheck and test commands with their pass counts. Not just "tests pass".
- **Flag state:** default off, how to turn it on, and what happens when it's off (PR3 and PR4).
- **Rollback:** how to back the change out.

Per-PR additions:

1. **PR1:** the `formatPrice` signature and output before and after, with concrete examples. The 30 importers and the risk to what they display. A note that this change is not behind a flag.
2. **PR2:** the migration DDL (schema SQL) summary, whether it's reversible (is there a down migration?), and the deploy order. It's safe because the consumer only writes when a `wallet.credited` event arrives, and nothing emits that until PR3 with the flag on.
3. **PR3:** proof that checkout behaves exactly as before with the flag off. What emits `wallet.credited`. A pointer to the docs.
4. **PR4:** Storybook screenshots, and a note that it uses the existing `/api/wallet` endpoint and doesn't depend on the ledger chain.
5. **PR5:** the admin authorization check on the new endpoint, and a flag that this surface is not gated.

---

## 5. Follow-ups

**(a) Reviewer requests changes on PR1**

1. On `loyalty/1-money`, add a new commit with the fix (no amend) and push. No force push needed.
2. Restack the PRs above by merging, not rebasing. Squash erases merge commits anyway, so there's no history to rewrite and no force push.
   ```
   git switch loyalty/2-ledger  && git merge loyalty/1-money  && npm test && git push
   git switch loyalty/3-credits && git merge loyalty/2-ledger && npm test && git push
   git switch loyalty/5-admin   && git merge loyalty/2-ledger && npm test && git push
   ```
   Also update PR4 this way if it's based on PR1.
3. If the fix changes an API that the upper PRs call, fix those call sites in each upper branch as part of the restack.
4. `feat/loyalty` and `loyalty/src` are now stale reference copies. Don't keep them in sync.

**(b) PR1 is squash-merged**

`main` now holds one new squash commit. `loyalty/2-ledger` still contains PR1's original commits under different commit IDs, so GitHub would show PR1's diff again inside PR2 until it's fixed.

1. **Retarget first.**
   - If repo auto-delete is on, GitHub retargets PR2 to `main` by itself.
   - Otherwise run `gh pr edit <PR2> --base main`. Do this before deleting `loyalty/1-money`: deleting a PR's base branch manually closes that PR.
2. **Clean up PR2's branch.**
   ```
   git fetch origin
   git switch loyalty/2-ledger && git merge origin/main && npm test && git push
   ```
   - This should apply cleanly, because the content from both sides is identical and PR2 doesn't touch `money.ts`.
   - Fallback: `git rebase --onto origin/main loyalty/1-money loyalty/2-ledger`, then `git push --force-with-lease`. This needs explicit approval for the force push.
3. **Verify.** `git diff --stat origin/main...loyalty/2-ledger` and `gh pr diff <PR2>` must show only PR2's files.
4. **Pass it up the stack.** Merge `loyalty/2-ledger` into PR3 and PR5, test, and push. Their bases don't change. Retarget PR4 to `main` if it was based on PR1.
5. **Tidy up.** Delete `loyalty/1-money` if GitHub didn't already (`git push origin --delete loyalty/1-money`), then mark #1 as merged in every Stack section.

---

## 6. Needed from the user before running

1. **Authorization.** "Open PRs" doesn't cover commits under the user's rules. Confirm:
   - commits on 5 new branches plus `loyalty/src`, then push them;
   - create the 5 PRs;
   - `--force-with-lease` only if a restack by merge fails.
   - Recommended: yes to the first three; ask again before any force push.
2. **Split size.** 5 PRs (recommended) or 3 (money / ledger + credits / badge + admin)? Also: what happens to `feat/loyalty` and any open PR on it? Recommended: keep the branch, and comment on any old PR that it's superseded.
3. **Intent on two ungated changes:**
   - Is changing `formatPrice` output for all 30 callers intended, and okay to ship without a flag? Recommended: yes only if 3.1 shows the output is unchanged or the change is deliberate. Otherwise put it behind a flag or split it further.
   - Should the admin endpoint and page ship without any flag? Recommended: gate them behind `loyaltyCredits`.

Non-critical, assumed: default reviewers from CODEOWNERS, no labels, and the migration runner applies `004` automatically on deploy. That last one I'll confirm in 3.1.

**Most likely to be wrong:** the PR4 base being `main`. It holds only if `CreditBadge` uses no new money helpers.

Next: answer the 3 questions in section 6, then steps 3.0 onward can run.
