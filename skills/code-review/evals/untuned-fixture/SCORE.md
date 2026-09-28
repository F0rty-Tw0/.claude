# untuned-fixture — score

This fixture was written by a fresh agent that never saw the code-review skill. Its answer key was moved out of the fixture before the review and never pointed at. It was still readable in a sibling scratch directory, so "sealed" means "not shown", not "inaccessible". The reviewer was a fresh `code-reviewer` given the standard `references/reviewer-prompt.md` material. Raw report: `results/new-skill.md`.

| # | Item (see ANSWER_KEY.md) | Result |
|---|---|---|
| 1 | Live store record mutated by the anonymous view (needs unchanged `store.js`) | ✓ Blocker, reproduced |
| 2 | Viewers can mint public links | ✓ Blocker, reproduced |
| 3 | Cross-tenant admin revoke | ✓ Blocker, reproduced |
| 4 | Guessable tokens + token in audit log | ✓ two Blockers, reproduced |
| 5 | ISO expiry never fires | ✓ Blocker, reproduced |
| 6 | Revoke doesn't clear the cache | ✓ Blocker, reproduced |
| 7 | Breaking shares response for pinned clients | ✓ Blocker; base contract test run on head fails |
| 8 | Bulk share: no validation, unbounded | ✓ Blocker, reproduced |
| 9 | Fire-and-forget audit write crashes the process | ✓ Blocker, reproduced |
| 10 | Flawed migration | ◐ partial: NOT NULL (SQLite repro), FK, TEXT expiry, missing tenant_id; ✗ didn't suggest hashing the token PK |
| 11 | Green tests can't catch the bugs | ✓ 5 mutation probes, 3 survived; per-test audit |
| 12 | False / unverifiable PR claims | ✓ every claim checked (15 vs 12 tests, coverage, load test, …) |
| 13 | Style nit must NOT be raised | ✓ `==` discarded as style; banner and ternary not raised |
| 14 | Anonymous route is correct, must NOT be flagged a vuln | ✓ not a finding (listed as a trunk hunk in classification only) |

**Score:** 11.5/12 defects (item 10 partial) and 2/2 traps. Bonus items (README not updated; `link.tenantId` stored but unused) both caught. Verdict: BLOCK — HIGH BLAST RADIUS DEFECT.

Caveats: n=1, and one model family wrote both the fixture and the review.
