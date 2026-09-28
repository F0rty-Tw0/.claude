# credits-fixture — answer key

A fake PR (`base/` → `head/`, diff with `git diff --no-index base head`) seeded with 13 items. `head/` tests pass (`node --test` → 2 pass, 0 fail) even though the code is broken. The tests are deliberately bad; they are part of the fixture.

**Caveat:** the new skill's rules were written after seeing the baseline run on this fixture, so it is **tuned** to it. The skill is n=1 here. For a generalization check, see `../untuned-fixture/` (12/12 defects, 2/2 traps).

| # | Item | Where | Baseline (old skill) | New skill |
|---|---|---|---|---|
| 1 | Classify Trunk + blast score | `checkout.mjs:5`, `wallet.mjs:5-7` | ✗ no classification | ✓ Trunk 10/10 |
| 2 | Read-modify-write race on shared store | `wallet.mjs:5-7` | ✓ | ✓ |
| 3 | Un-awaited `applyCredit` (stale balance, unhandled rejection) | `checkout.mjs:5` | ✓ | ✓ |
| 4 | Money behavior ungated, though `flags.mjs` exists | `checkout.mjs:4-5` | ✓ | ✓ |
| 5 | Vanity tests treated as a blocking proof gap, with a mutation probe | `wallet.test.mjs` | ✗ rated MEDIUM, no probe | ✓ 5 mutants, 4 survived |
| 6 | Negative / `NaN` amount not validated | `wallet.mjs:4-6` | ✗ | ✓ |
| 7 | Float money | `checkout.mjs:5` | ✓ | ✓ |
| 8 | Whole `user` (email) logged — PII | `wallet.mjs:8` | ✓ | ✓ |
| 9 | `wallet.credited` dropped by consumer `default: return` (outside diff) | `events/consumer.mjs:7` | ✓ | ✓ |
| 10 | `NOT NULL` column without default on populated table | `migrations/003…sql:1` | ✓ reproduced | ✓ (Inferred) |
| 11 | "Fixed / verified end to end" claims with no artifact | `PR.md` | ✓ | ✓ |
| 12 | Style bait in gated leaf must NOT be a finding | `ui/creditBadge.mjs` | ✗ LOW style finding | ✓ discarded as style |
| 13 | Rollback path + canary metric + human deep-read list | — | ✗ | ✓ |

**Score:** baseline 8/13, new skill 13/13. Raw reports: `results/baseline-old-skill.md`, `results/new-skill.md`.

After item 10 regressed from Confirmed to Inferred, `references/adversarial-inspection.md` gained "run the migration on a scratch DB".

## Re-run

Dispatch a fresh agent with the reviewer prompt (`../../references/reviewer-prompt.md`), with material `git diff --no-index base head` and `head/PR.md`, and the test command `node --test` in `head/`. Score its report against this table.
