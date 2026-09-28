**Verdict: split `feat/loyalty` into 5 PRs. Three sit in one line (money ← ledger ← credits), the admin report stacks on ledger, and the badge goes off `main` on its own.**

Unknowns: 4 things change the plan, so they go to the user first (section 6). Admin report has no flag. Deploy order of migrations. Whether `formatPrice` output changes. Where the docs go. Non-critical assumptions: npm script names are `typecheck` and `test` (the real names are found in pre-flight), and there is no ticket number in the branch name, so no `Closes #`.

Strongest objection: putting ledger on top of money is forced by the "one base" rule, not by a real import. If ledger doesn't import money, ledger waits for money to merge for no code reason. The rule wins anyway, because credits needs both parents and depth 3 is the limit.

---

## 0. Pre-flight (read-only)

```bash
git status                                   # must be clean
git fetch origin
git diff --stat origin/main...feat/loyalty   # confirm the 18 files and ~1,630 lines; catch stray files (router, lockfile) missing from the table
git log --oneline origin/main..feat/loyalty  # commit style for meaningful-commits
gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge
gh pr list --head feat/loyalty               # existing PR to supersede?
git ls-tree --name-only origin/main migrations/ | grep '/004'   # migration number collision
git diff --name-only feat/loyalty...origin/main -- migrations/  # migrations landed on main since fork
jq .scripts package.json                     # real typecheck/test names
grep -n "^import" src/db/ledgerRepo.ts src/events/consumer.ts src/billing/loyalty.ts src/api/loyaltyReport.ts src/admin/LoyaltyReport.tsx src/ui/CreditBadge.tsx   # REAL dependency graph; the table is only a lead
grep -rln "shared/money" src | wc -l         # formatPrice fan-in (~30)
git diff origin/main...feat/loyalty -- src/shared/money.ts      # does formatPrice change output for existing inputs?
grep -rn "loyaltyCredits\|creditBadge" src   # every entry point gated?
```

- The source branch is `feat/loyalty`.
- So slice branches use the `loyalty/*` prefix, not `feat/loyalty/*`.
- Reason: git cannot hold both refs `feat/loyalty` and `feat/loyalty/x`.

---

## 1. The split (≈1,630 lines is over 400, and trunk and leaf are mixed, so split)

| # | Slice | Branch | Base | Blast class | Files | ~Lines |
|---|---|---|---|---|---|---|
| 1 | Integer-cents helpers | `loyalty/1-money` | `main` | **Trunk** 8/10: `formatPrice` has ~30 importers, ungated, money | `src/shared/money.ts`, `money.test.ts` | 160 |
| 2 | Ledger table, repo, `wallet.credited` event type and consumer | `loyalty/2-ledger` | `loyalty/1-money` | **Trunk** 9/10: migration plus async consumer, not flag-gateable | `migrations/004_wallet_ledger.sql`, `src/db/ledgerRepo.ts` + test, `src/events/types.ts`, `src/events/consumer.ts` | 290 |
| 3 | Loyalty credits, gated | `loyalty/3-credits` | `loyalty/2-ledger` | **Trunk** 8/10: billing, checkout hot path; gated OFF | `src/billing/loyalty.ts` + test, `src/billing/checkout.ts`, the **`loyaltyCredits: false` line only** of `featureFlags.ts`, `docs/loyalty.md` | 446 (396 code + 50 docs) |
| 4 | Admin loyalty report | `loyalty/4-report` | `loyalty/2-ledger` | **Branch** 5/10: new endpoint over financial data, authz must be checked; ungated (see Q2) | `src/api/loyaltyReport.ts`, `src/admin/LoyaltyReport.tsx` + test | 380 |
| 5 | Credit badge | `loyalty/badge` | `main` | **Leaf** 2/10: gated OFF, reads the **existing** `/api/wallet` | `src/ui/CreditBadge.tsx` + test + stories, the **`creditBadge: false` line only** of `featureFlags.ts` | 351 |

Why it is shaped this way:

- **Event type plus consumer stay together** in PR2 (the consumer lands before the producer). The producer (`loyalty.ts` emits the event) comes in PR3.
- Until then the consumer sits idle, because nothing emits `wallet.credited`.
- **Each flag line ships with the code that reads it.**
  - `featureFlags.ts` is split with Edit.
  - `loyaltyCredits` goes in PR3, `creditBadge` in PR5.
- **Badge has no dependency on the new code**, so it stays off `main` and can merge in parallel. This holds only if the pre-flight import grep confirms it doesn't import the new money helpers. If it does, it stacks on `loyalty/1-money`.
- **Report reads `ledgerRepo`**, so it stacks on ledger. It is a sibling of credits, not its child.
- Depth: money ← ledger ← credits/report is depth 3, the maximum allowed.
- **Migration inside PR2** is acceptable only if deploys run migrations before app code (Q3):
  - It is expand-only: a new table, and old code ignores it.
  - Its only writer (the consumer) has no producer yet.
- **Not in this stack:** the flag-flip PRs (after `code-review` `launch` and canary) and the flag-cleanup PRs.

---

## 2. Order

- **Open (bottom-up):** #1 money → #2 ledger → #3 credits → #4 report. #5 badge can open any time.
- **Merge:**
  1. #1 money, first, after a deep human read.
  2. #2 ledger, retargeted to `main`.
  3. #3 and #4, in either order, after retargeting to `main`.
  4. #5 is independent and can merge whenever.

---

## 3. Commands

**🟡 Build the slices.** Load `meaningful-commits` before any commit. `touch ~/.claude/.allow-commit` (the one-shot commit-guard flag) goes before every commit, merge commit and push.

```bash
git status && git fetch origin
git branch feat/loyalty-backup feat/loyalty                 # untouched reference
git switch -c loyalty/src feat/loyalty
touch ~/.claude/.allow-commit && git merge origin/main      # sync first, or path-checkout reverts newer main edits
npm run typecheck && npm test

# PR1 money (base main)
git switch --no-track -c loyalty/1-money origin/main
git checkout loyalty/src -- src/shared/money.ts src/shared/money.test.ts
npm run typecheck && npm test                               # full suite: the 30 formatPrice callers' tests must stay green
git add src/shared/money.ts src/shared/money.test.ts
touch ~/.claude/.allow-commit && git commit -m "feat(money): add integer-cents helpers"

# PR2 ledger (base 1-money)
git switch -c loyalty/2-ledger loyalty/1-money
git checkout loyalty/src -- migrations/004_wallet_ledger.sql src/db/ledgerRepo.ts src/db/ledgerRepo.test.ts
npm run typecheck && npm test
git add migrations/004_wallet_ledger.sql src/db/ledgerRepo.ts src/db/ledgerRepo.test.ts
touch ~/.claude/.allow-commit && git commit -m "feat(db): add wallet_ledger table and repo"
git checkout loyalty/src -- src/events/types.ts src/events/consumer.ts
npm run typecheck && npm test
git add src/events/types.ts src/events/consumer.ts
touch ~/.claude/.allow-commit && git commit -m "feat(events): handle wallet.credited into ledger"

# PR3 credits (base 2-ledger)
git switch -c loyalty/3-credits loyalty/2-ledger
git checkout loyalty/src -- src/billing/loyalty.ts src/billing/loyalty.test.ts src/billing/checkout.ts docs/loyalty.md
# Edit tool: add ONLY `loyaltyCredits: false,` to src/shared/featureFlags.ts (same position as in loyalty/src)
npm run typecheck && npm test
git add src/shared/featureFlags.ts src/billing/loyalty.ts src/billing/loyalty.test.ts src/billing/checkout.ts
touch ~/.claude/.allow-commit && git commit -m "feat(billing): add loyalty credits behind loyaltyCredits flag"
git add docs/loyalty.md
touch ~/.claude/.allow-commit && git commit -m "docs(loyalty): document loyalty credits"

# PR4 report (base 2-ledger)
git switch -c loyalty/4-report loyalty/2-ledger
git checkout loyalty/src -- src/api/loyaltyReport.ts src/admin/LoyaltyReport.tsx src/admin/LoyaltyReport.test.tsx
npm run typecheck && npm test
git add src/api/loyaltyReport.ts src/admin/LoyaltyReport.tsx src/admin/LoyaltyReport.test.tsx
touch ~/.claude/.allow-commit && git commit -m "feat(admin): add loyalty report endpoint and page"

# PR5 badge (base main)
git switch --no-track -c loyalty/badge origin/main
git checkout loyalty/src -- src/ui/CreditBadge.tsx src/ui/CreditBadge.test.tsx src/ui/CreditBadge.stories.tsx
# Edit tool: add ONLY `creditBadge: false,` to src/shared/featureFlags.ts
npm run typecheck && npm test
git add src/shared/featureFlags.ts src/ui/CreditBadge.tsx src/ui/CreditBadge.test.tsx src/ui/CreditBadge.stories.tsx
touch ~/.claude/.allow-commit && git commit -m "feat(ui): add credit badge behind creditBadge flag"
```

- Commit messages above are placeholders. Match them to the real `git log` style.
- Exact test-file names come from the pre-flight `diff --stat`.

**🟢 Completeness check (before any push)**

```bash
git switch --detach loyalty/3-credits
touch ~/.claude/.allow-commit && git merge --no-edit loyalty/4-report
touch ~/.claude/.allow-commit && git merge --no-edit loyalty/badge
# expected conflict: featureFlags.ts. Resolve by hand to both lines in source order.
# Do NOT copy the file from loyalty/src, that would hide a bad split.
git diff --stat loyalty/src HEAD        # MUST be empty, else stop
git switch loyalty/src
```

- Order matters if Q2 = add a report flag.
- Run this check on the source-identical slices first.
- Then add the flag as a separate commit on `loyalty/4-report`.

**🟢 Proof and review per slice, bottom-up, local, before pushing**

- Run `pr-description` once per slice.
- Step 0 builds `## Proof`.
- A fresh independent `code-review` then reviews the diff **against the parent**, together with the stack map, so symbols used only by later PRs aren't flagged as dead code:
  - #1 `origin/main...loyalty/1-money`
  - #2 `loyalty/1-money...loyalty/2-ledger`
  - #3 and #4 `loyalty/2-ledger...<slice>`
  - #5 `origin/main...loyalty/badge`
- **BLOCK on a lower PR:** stop, open nothing above it, and ask the user (fix first, or open as draft).

**🔴 Push and open**

```bash
touch ~/.claude/.allow-commit && git push -u origin loyalty/1-money loyalty/2-ledger loyalty/3-credits loyalty/4-report loyalty/badge
gh pr create --base main             --head loyalty/1-money   --title "feat(money): add integer-cents helpers"        --body-file $SCRATCH/pr1.md
gh pr create --base loyalty/1-money  --head loyalty/2-ledger  --title "feat(ledger): add wallet ledger and consumer"   --body-file $SCRATCH/pr2.md
gh pr create --base loyalty/2-ledger --head loyalty/3-credits --title "feat(billing): add gated loyalty credits"       --body-file $SCRATCH/pr3.md
gh pr create --base loyalty/2-ledger --head loyalty/4-report  --title "feat(admin): add loyalty report"                --body-file $SCRATCH/pr4.md
gh pr create --base main             --head loyalty/badge     --title "feat(ui): add gated credit badge"               --body-file $SCRATCH/pr5.md
# fill real PR numbers into every ## Stack, then:
gh pr edit <n> --body-file $SCRATCH/prN.md      # x5
# old PR on feat/loyalty exists? → gh pr comment <old> --body "superseded by #a #b #c #d #e"  (close only if user says)
```

- **Watch** the whole stack with `/loop 1h /code-review babysit <n1> <n2> <n3> <n4> <n5>`.

---

## 4. Each PR body

Common to all five:

- **Title:** under 60 characters, lowercase, conventional prefix if the repo uses one.
- **Format:** medium, meaning a short bullet list and at most 2 prose sections (each PR is 2–5 files).
- **No `Closes #`:** the branch name has no ticket number.
- **Humanizer:** run it on the prose only. Leave `## Proof` verbatim.
- **`## Stack`:** placed **before** `## Proof`. Example for #2:

```markdown
## Stack
1. #12 money: integer-cents helpers (Trunk)
2. **#13 ledger table + repo + consumer ← this PR** (base `loyalty/1-money`) (Trunk)
3. #14 loyalty credits (flag `loyaltyCredits`) (Trunk, gated)
3. #15 admin loyalty report (base `loyalty/2-ledger`) (Branch)
Independent: #16 credit badge (flag `creditBadge`, base `main`) (Leaf)
Do not merge until #12 is merged and this PR is retargeted to `main`.
```

- **`## Proof`:** required, because the `pr-proof-guard` hook blocks `gh pr create` without it. It is scaled to the PR's class:

| PR | What `## Proof` must hold |
|---|---|
| #1 money | Full `templates/pr-proof.md` (the proof template). Gate: **none**, because a shared helper can't be gated. Rollback: revert deploy. Invariant test: `formatPrice` output identical for existing inputs (golden cases). Full-suite counts, which cover all 30 callers. Human must deep-read the `formatPrice` hunk. Non-empty **Not verified** list. |
| #2 ledger | Full template. Gate: none; the migration can't be gated, and the consumer is idle with no producer. Migration works with the **currently deployed** code. Rollback: code revert; the table stays (dropping it needs a contract migration). Idempotency or duplicate-delivery test for the consumer. Human must deep-read the migration and `consumer.ts`. |
| #3 credits | Full template. Gate: `loyaltyCredits` default OFF, checked at `checkout.ts:<line>` and in `loyalty.ts`. Test that with the flag OFF checkout behaves exactly like base. Concurrency test (parallel credits). Invariant: ledger sum = balance. One non-mocked runtime log. Rollback: flag OFF. Not covered by rollback: ledger rows already written and events already emitted. |
| #4 report | Branch level. Test counts. Authz test (non-admin gets 403). Screenshots: normal, empty, error. One non-mocked runtime log of the endpoint. The gate line depends on Q2. |
| #5 badge | Leaf, about 4 lines. Test counts. Screenshots: with credit, empty, flag OFF. **Not verified** line. Review verdict. |

---

## 5. After review or merge (squash-only repo)

**(a) Changes requested on #1 money.** Add a new commit, never amend. Merge upward, then one normal push.

```bash
git switch loyalty/1-money
<fix>; npm run typecheck && npm test
git add <paths> && touch ~/.claude/.allow-commit && git commit -m "fix(money): …"
git switch loyalty/2-ledger  && touch ~/.claude/.allow-commit && git merge loyalty/1-money  && npm test
git switch loyalty/3-credits && touch ~/.claude/.allow-commit && git merge loyalty/2-ledger && npm test
git switch loyalty/4-report  && touch ~/.claude/.allow-commit && git merge loyalty/2-ledger && npm test
touch ~/.claude/.allow-commit && git push origin loyalty/1-money loyalty/2-ledger loyalty/3-credits loyalty/4-report
```

- If the fix changed an API that upper PRs call, fix those call sites during the merge-up.
- Re-run `pr-description` step 0 on every PR that got new commits, and replace each `## Proof`. Stale proof is no proof.
- Badge is untouched unless it imports money.
- **No force-push.**

**(b) #1 squash-merged**

```bash
gh pr edit <#2> --base main                          # FIRST: deleting a PR's base branch closes that PR
gh pr view <#2> --json baseRefName                   # confirm main (auto-retarget happens if deleteBranchOnMerge is on)
git fetch origin
git switch loyalty/2-ledger && touch ~/.claude/.allow-commit && git merge origin/main && npm run typecheck && npm test
git diff --stat origin/main...loyalty/2-ledger       # only the ledger files
git switch loyalty/3-credits && touch ~/.claude/.allow-commit && git merge loyalty/2-ledger && npm test
git switch loyalty/4-report  && touch ~/.claude/.allow-commit && git merge loyalty/2-ledger && npm test
touch ~/.claude/.allow-commit && git push origin loyalty/2-ledger loyalty/3-credits loyalty/4-report
gh pr diff <#2> --name-only                          # same check on GitHub
git push origin --delete loyalty/1-money             # 🔴 only if not auto-deleted, and only with approval
```

- Then update every `## Stack`: mark #1 merged, set #2's base to `main`, rewrite the "do not merge until" lines.
- If `git merge origin/main` conflicts (rare, since the content is identical), resolve by hand.
- Fallback: `git rebase --onto origin/main loyalty/1-money loyalty/2-ledger --update-refs`, then `git push --force-with-lease`. That is 🔴 and needs a **separate user ask every time**.

---

## 6. Needed from the user before running (one AskUserQuestion)

1. **Approval** of the listed actions:
   - the main-sync merge commit
   - the 7 slice commits
   - the one 5-branch push
   - 5 `gh pr create` and 5 `gh pr edit`
   - the "superseded" comment on an old PR, if one exists

   Force-push and remote branch delete are **excluded** and asked separately.
2. **The admin report has no flag.** A new endpoint over ledger data with no gate is a finding.
   - Recommended: add `loyaltyReport: false`, checked in the endpoint and the page. This is new code, added after the completeness check.
   - Alternative: ship it ungated behind admin authz only.
   - Alternative: hold #4 until credits launch.
3. **Deploy order.** Do migrations run before app code?
   - Yes (default): the migration stays in PR2.
   - No: it needs its own PR off `main`, merged and deployed first, and the ledger slice is rebuilt on top of it.
4. **`formatPrice` behavior.** Asked only if the pre-flight diff shows its output changes.
   - The 30 callers are not in the branch, so a changed output means silently wrong prices.
   - Options: confirm the change is intended and add the caller updates, or keep `formatPrice` unchanged.
5. **Docs placement.** Default is `docs/loyalty.md` in #3, which puts it about 46 lines over the 400 guideline. Alternative: #4.

---

**Most likely wrong:** the dependency edges. They come from the scenario table, not from real imports. The pre-flight import grep can move the badge or report onto a different base.

Next: run pre-flight, then send the one AskUserQuestion covering items 1–5.
