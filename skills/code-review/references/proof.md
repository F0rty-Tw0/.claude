# Proof in the PR — Evidence Over Promises

An AI author saying "fixed", "verified", "all tests pass", or "works end to end" is a **claim**, not proof. LLM authors are sycophantic toward their own work and will confidently ship code that fails at runtime on edge cases.

Proof = an artifact a reviewer can inspect or re-run. No artifact → no proof.

## What counts

| Proof type | Counts when | Does NOT count |
|---|---|---|
| **Tests** | Test file in the diff; reviewer re-ran it; output pasted with pass/fail counts and exit code | "Tests pass" with no output; coverage % alone |
| **Reproduction test** | Test fails on base, passes on head (bug fixes) | A test written after the fix that was never seen failing |
| **Before/after pair** (every PR) | The real thing run on base and on head, non-mocked, output embedded in the PR body: screenshot per changed screen (same route, viewport, data, incl. empty/error states), or terminal / console / HTTP output of the same command | Test-runner output; a diff or list of code added; after-only; a mocked run; "I ran it locally"; a local path the reviewer can't open; what it "should look like" |
| **Invariant assertions** | Tests assert a system rule ("balance never negative", "sum of ledger = balance") | Tests assert a return value is defined |
| **Confidence statement** | Explicit **Verified:** list and **Not verified:** list | "High confidence", "should work" |

## Proof bar by blast radius

- **Every class:** a before/after pair showing the change running (Before/after pair below). Tests are a separate line and never stand in for it.
- **Leaf:** tests re-run + the pair.
- **Branch:** + reproduction test (fails on base) for bug fixes.
- **Trunk:** + invariant assertions, concurrency or boundary tests for the risky hunk, rollback plan, and the telemetry metric that would spike on failure.

## Reviewer procedure (do it, don't read about it)

1. List every claim in the PR description ("fixed X", "verified Y", "no regressions").
2. For each claim, find the artifact. Missing → proof gap.
3. **Re-run** the claimed commands yourself. Paste exit code and pass/fail counts. A claim that does not reproduce is a **proof gap** that blocks the merge, not a nit.
4. **Base-failure check** (bug fixes): run the new test against the base tree. If it passes on base, it does not prove the fix.
   - Isolated copy: `WT=$(mktemp -d <scratch-dir>/review-base.XXXX) && git worktree add --detach "$WT" <base-sha>`, copy the test in, run it, then `git worktree remove --force "$WT"`. Never modify the user's working tree.
5. **Mutation probe** (any change with tests): in a scratch copy, break one line of the code under test (flip a condition, drop an `await`, return early). Re-run tests. Still green → the tests are vanity (see `vanity-tests.md`).
6. No before/after pair → capture it yourself (browser tool for UI, the same command on base and head otherwise; see Before/after pair below), else list it as a proof gap.

## Author side — building the proof bundle

When **you** wrote the change and are preparing the PR, produce this bundle (template: `templates/pr-proof.md`). Every line needs output, not adjectives. `open-pr` decides what reaches the PR body: compact lines there, the rest collapsed.

```markdown
## Proof
**Blast radius:** Trunk 8/10 — changes wallet balance writes on checkout path.
**Gate:** `loyaltyCredits` flag, default OFF, checked in checkout.mjs:4.

### Tests
$ node --test
ℹ tests 9  ℹ pass 9  ℹ fail 0   (exit 0)
New: concurrent credits (2 parallel applyCredit → balance = 10), negative amount rejected.
Base check: `concurrent credits` FAILS on base (balance = 5) — confirms the race existed.

### Before / After
Before (base a1b2c3d):
$ node scripts/demo-checkout.mjs --credit 5 --parallel 2
order 8812 balance=5   ← second credit lost

After (head d4e5f6a):
$ node scripts/demo-checkout.mjs --credit 5 --parallel 2
order 8813 balance=10

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

### Before/after pair (every PR)

Reviewers judge a change by comparing it to what was there. Proof that code was added is not proof it works; show the behavior.

Pick the form by what changed:

| Change | Before (base) | After (head) |
|---|---|---|
| UI | screenshot of the screen/state | same route, viewport, data |
| CLI, script, API, backend | the command or `curl` and its output | the same command and its output |
| Bug fix | the bug reproducing (error, wrong value, console error) | the same steps, bug gone |
| Feature added | the feature absent (404, unknown flag, missing button) | the feature working |
| Feature removed | the feature working | absent, or the intended error |
| Refactor, no behavior change | output of the affected path | identical output (`diff` empty) |

1. **After:** run HEAD for real. UI → Playwright MCP `browser_take_screenshot` of each changed screen and state. Everything else → run the command and keep the exact command plus its output (trim to the lines that show the change; keep ids/timestamps).
2. **Before:** the same steps on the PR's base (the parent branch for a stacked PR), run from an isolated worktree as in the base-failure check, with dependencies installed there first (skill:using-git-worktrees does both). New screen → shoot the screen it's reached from.
3. **In the body:** text pairs go in as `Before:` / `After:` lines (a parenthetical like `Before (base a1b2c3d):` is fine), long output in a code block under each line; screenshots as a `| Before | After |` table. `hooks/pr-proof-guard.js` blocks a `## Proof` with neither.
4. **Can't capture before** (new repo, base won't build, external service gone) → write `Before: not captured — <why>`, list it under Not verified, and let the user decide (`open-pr` Step 0).

Screenshots:

1. Save as `<scratch-dir>/pr-shots/<screen>-{before,after}.png`, reference them in the body by that exact path string, and pass the same string to `gh pr create --attach <path>` (or `gh pr edit`). `gh` uploads them and rewrites the body references to the hosted URLs; `--attach` needs `gh` ≥ 2.99, so check `gh pr create --help | grep -q -- --attach` first. Give each image alt text (`![Badge empty after](…)`); `gh` keeps what the body says. Any later body re-send repeats the same `--attach` flags, or the local paths overwrite the hosted URLs.
2. Some uploads fail → `gh` still creates the PR and exits non-zero. Re-attach the missing ones with `gh pr edit <n> --attach`.

No browser tool, app won't start, or `gh` too old → no screenshot pair; the PR doesn't open until the user decides (`open-pr` Step 0).
