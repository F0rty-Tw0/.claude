# Scenario: "ok open PRs for this branch"

Repo: TypeScript web app on GitHub. Merge strategy: **squash merge only**. Existing feature-flag mechanism in `src/shared/featureFlags.ts`.
Current branch `feat/loyalty` (one branch, 23 commits, commits interleave all areas) vs `main`: 18 files, ~1,630 changed lines.

| File | Change | Notes |
|---|---|---|
| migrations/004_wallet_ledger.sql | +40 | creates `wallet_ledger` table |
| src/db/ledgerRepo.ts + ledgerRepo.test.ts | +120 / +90 | reads/writes `wallet_ledger` |
| src/shared/money.ts + money.test.ts | +60 −20 / +80 | integer-cents helpers; **changes existing `formatPrice`, imported by 30 files** |
| src/events/types.ts | +10 | adds `wallet.credited` event type |
| src/events/consumer.ts | +30 | handles `wallet.credited` → writes ledger via ledgerRepo |
| src/shared/featureFlags.ts | +2 | adds `loyaltyCredits: false`, `creditBadge: false` |
| src/billing/loyalty.ts + loyalty.test.ts | +200 / +180 | credit logic; uses ledgerRepo + money; emits `wallet.credited`; checks `loyaltyCredits` |
| src/billing/checkout.ts | +15 | calls loyalty (behind `loyaltyCredits`) |
| src/ui/CreditBadge.tsx + test + stories | +150 / +120 / +80 | reads balance from **existing** `/api/wallet` endpoint; checks `creditBadge` |
| src/api/loyaltyReport.ts | +60 | new admin endpoint, reads ledgerRepo |
| src/admin/LoyaltyReport.tsx + test | +220 / +100 | admin page using the new endpoint |
| docs/loyalty.md | +50 | feature docs |

Task: the user said "ok open PRs for this branch". Produce your plan. Do NOT run any commands — this is a written plan only. Include:
1. Whether to split, and into which PRs (contents of each).
2. Each PR's base branch (main or another PR's branch) and the order they are opened/merged.
3. The exact git/gh commands you would run to produce those branches/PRs from the single interleaved branch.
4. What each PR body must contain.
5. What you do when (a) a reviewer requests changes on the bottom PR, and (b) the bottom PR is squash-merged.
6. Anything you need from the user before running.
