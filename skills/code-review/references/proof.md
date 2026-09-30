# Proof in the PR — Evidence Over Promises

An AI author saying "fixed", "verified", "all tests pass", or "works end to end" is a **claim**, not proof. LLM authors are sycophantic toward their own work and will confidently ship code that fails at runtime on edge cases.

Proof = an artifact a reviewer can inspect or re-run. No artifact → no proof.

## What counts

| Proof type | Counts when | Does NOT count |
|---|---|---|
| **Tests** | Test file in the diff; reviewer re-ran it; output pasted with pass/fail counts and exit code | "Tests pass" with no output; coverage % alone |
| **Reproduction test** | Test fails on base, passes on head (bug fixes) | A test written after the fix that was never seen failing |
| **Runtime evidence** | Real command/terminal log of the feature running end to end, non-mocked, with timestamps or IDs | Log of a unit test; a mocked run; "I ran it locally" |
| **Visual proof** | Before/after screenshot pair per changed screen (same route, viewport, data), embedded in the PR body, incl. empty/error states | After-only shots; a local path the reviewer can't open; description of what it "should look like" |
| **Invariant assertions** | Tests assert a system rule ("balance never negative", "sum of ledger = balance") | Tests assert a return value is defined |
| **Confidence statement** | Explicit **Verified:** list and **Not verified:** list | "High confidence", "should work" |

## Proof bar by blast radius

- **Leaf:** tests re-run + visual/log proof of the visible change.
- **Branch:** + reproduction test (fails on base) for bug fixes; + one non-mocked runtime log.
- **Trunk:** + invariant assertions, concurrency or boundary tests for the risky hunk, rollback plan, and the telemetry metric that would spike on failure.

## Reviewer procedure (do it, don't read about it)

1. List every claim in the PR description ("fixed X", "verified Y", "no regressions").
2. For each claim, find the artifact. Missing → proof gap.
3. **Re-run** the claimed commands yourself. Paste exit code and pass/fail counts. A claim that does not reproduce is a **proof gap** that blocks the merge, not a nit.
4. **Base-failure check** (bug fixes): run the new test against the base tree. If it passes on base, it does not prove the fix.
   - Isolated copy: `WT=$(mktemp -d <scratch-dir>/review-base.XXXX) && git worktree add --detach "$WT" <base-sha>`, copy the test in, run it, then `git worktree remove --force "$WT"`. Never modify the user's working tree.
5. **Mutation probe** (any change with tests): in a scratch copy, break one line of the code under test (flip a condition, drop an `await`, return early). Re-run tests. Still green → the tests are vanity (see `vanity-tests.md`).
6. Visible change with no before/after pair → take them yourself if a browser tool is available (see Visual pair below), else list it as a proof gap.

## Author side — building the proof bundle

When **you** wrote the change and are preparing the PR, produce this bundle (template: `templates/pr-proof.md`). Every line needs output, not adjectives. `pr-description` decides what reaches the PR body: compact lines there, the rest collapsed.

```markdown
## Proof
**Blast radius:** Trunk 8/10 — changes wallet balance writes on checkout path.
**Gate:** `loyaltyCredits` flag, default OFF, checked in checkout.mjs:4.

### Tests
$ node --test
ℹ tests 9  ℹ pass 9  ℹ fail 0   (exit 0)
New: concurrent credits (2 parallel applyCredit → balance = 10), negative amount rejected.
Base check: `concurrent credits` FAILS on base (balance = 5) — confirms the race existed.

### Runtime
$ node scripts/demo-checkout.mjs   → log excerpt with order id + ledger rows

### Visual
| | Before | After |
|---|---|---|
| Badge, credit | ![Badge credit before](<scratch>/pr-shots/badge-credit-before.png) | ![Badge credit after](<scratch>/pr-shots/badge-credit-after.png) |
| Badge, empty | ![Badge empty before](<scratch>/pr-shots/badge-empty-before.png) | ![Badge empty after](<scratch>/pr-shots/badge-empty-after.png) |

Flag OFF: after is pixel-identical to before (shot omitted).

### Confidence
Verified: race fixed under 50 parallel credits; negative/NaN rejected; flag OFF = old behavior byte-identical.
Not verified: behavior against real Postgres (in-memory store only); p99 latency.
```

The **Not verified** list is mandatory and must not be empty for trunk changes — an empty list on a trunk PR means the author did not look.

### Visual pair (any user-visible change)

Reviewers judge a UI change by comparing it to what was there; an after-only shot hides regressions and makes them diff the code in their head.

1. **After:** run the app from HEAD, Playwright MCP `browser_take_screenshot` of each changed screen and state.
2. **Before:** same route, viewport and seed data from the PR's base (the parent branch for a stacked PR), run from an isolated worktree as in the base-failure check, with dependencies installed there first (skill:using-git-worktrees does both). New screen → shoot the screen it's reached from.
3. Save as `<scratch-dir>/pr-shots/<screen>-{before,after}.png`, reference them in the body by that exact path string, and pass the same string to `gh pr create --attach <path>` (or `gh pr edit`). `gh` uploads them and rewrites the body references to the hosted URLs; `--attach` needs `gh` ≥ 2.99, so check `gh pr create --help | grep -q -- --attach` first. Give each image alt text (`![Badge empty after](…)`); `gh` keeps what the body says. Any later body re-send repeats the same `--attach` flags, or the local paths overwrite the hosted URLs.
4. Some uploads fail → `gh` still creates the PR and exits non-zero. Re-attach the missing ones with `gh pr edit <n> --attach`.

No browser tool, app won't start, or `gh` too old → no pair; the PR doesn't open until the user decides (`pr-description` Step 0).
