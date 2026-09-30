---
name: deflaky
description: Audits a flaky Playwright e2e or integration suite over repeated runs, sorts each flake into one of nine categories, and applies the matching fix. Use for intermittent timeouts under parallel load, pass-alone-fail-in-suite tests, inconsistent pass rates, or tests over budget.
---

# Deflaky

## Overview

E2E flake is rarely random — it falls into a small set of recurring categories with **category-specific** countermeasures. Treating every flake the same (slap on retries, loosen assertions, bump global timeouts) hides real bugs and creates new ones.

Run a multi-run audit and name a category before fixing, because the audit is what separates flake from broken and later proves the fix worked.

## When to Use

- Tests pass locally, fail in CI
- Tests pass in isolation, fail under `--workers=N` or `--repeat-each=N`
- Tests exceed the default 30s test budget without obvious cause
- New flakes appeared after a refactor or parallelism increase
- "Just retry it" has become the default approach

## When NOT to Use

- A test consistently fails 100% — it's broken, not flaky (use systematic-debugging)
- Single-test flake with clear root cause already identified — just fix it
- Known third-party outage — wait for upstream

## Phase 1 — Audit

```bash
# No retries (raw flake rate) + 5x repetition (statistical signal).
npx playwright test --retries=0 --repeat-each=5 --reporter=list 2>&1 | tee audit.log

# Per-test failure count
grep -E "✘\s+\d+\s+\[" audit.log | sed 's/.*›//' | sort | uniq -c | sort -rn
```

Three buckets emerge per test:

| Result | Meaning | Action |
|---|---|---|
| 0/5 fail | Healthy | Ignore |
| 5/5 fail | **Broken**, not flaky | Treat as a bug — `systematic-debugging` |
| 1–4/5 fail | Real flake | Categorize per Phase 2 |

## Phase 2 — Categorize

Match every flake to one category. The diagnostic signal tells you which.

| # | Diagnostic signal | Category | Countermeasure |
|---|---|---|---|
| 1 | `Test timeout of Nms exceeded`, but inner `waitFor*` calls have larger budgets | **Test-budget mismatch** | `test.setTimeout(N)` aligned with longest inner `waitFor*` |
| 2 | `page.goto(...)` lands on error/blank page; inner JS never runs; trace shows immediate redirect | **Setup propagation race** (resource not yet visible to runtime edge) | Probe runtime endpoint until ready; retry navigation on the bad-state signal only |
| 3 | Pass rate <100% under load; assertion logic correct; expected state never reached | **Server/load timing race** | Replace `waitForTimeout` with `expect.poll(fn, { intervals, timeout })` or auto-retrying assertion |
| 4 | `locator(x).toBeVisible()` 5s timeout failures | **Render race** (default 5s too tight) | Bump per-assertion: `toBeVisible({ timeout: 15000 })` |
| 5 | `response.json: Protocol error: No resource with given identifier found` | **Response-body GC race** (Chromium discards body after navigation) | Set `waitForResponse` promise BEFORE the action; capture body in `page.on('response')`; OR `page.route` + `route.fetch` to buffer |
| 6 | `AuthFailure`, env var missing, network unreachable, 100% fail | **Environment / credentials** | Not a flake. Fail fast with clear message; don't retry |
| 7 | Test fails only when run after sibling in same describe | **Test isolation** (shared mutable state) | Never mutate describe-scope objects from test bodies; use spread / local copies |
| 8 | Random fail, no error correlation, low rate | **Pre-existing infra variance** | Quarantine + log; track separately |
| 9 | Test stops finding elements after a UI refactor | **Brittle selectors** | Replace CSS / XPath with `getByRole`, `getByLabel`, `getByTestId` |

If a flake doesn't fit a category, you haven't traced it deeply enough. Read the full trace + HAR before forcing a category.

## Phase 3 — Fix Per Category

Code for every category: [patterns.md](patterns.md). The most common one:

```ts
// CATEGORY 5 — set waitForResponse BEFORE the action that triggers it
const responsePromise = page.waitForResponse(/api\/queue\/state/);
await page.getByRole('button', { name: 'Refresh' }).click();
const response = await responsePromise;        // body still alive

```

## Anti-patterns

- **Loosening assertions to make tests pass.** If `er=9` is correct and `er=2` happens 5%, don't accept both; er=2 is a different bug.
- **Blanket `retries: 3` as the only mitigation.** The visible flake rate drops while real bugs accumulate. Retries are for known cat-8 only.
- **Bumping the global timeout.** It slows feedback for healthy tests. Bump per test or per assertion.
- **A retry inside the test body without a named category.** A band-aid that never gets cleaned up.

General waiting and locator hygiene (`waitForTimeout`, `networkidle`, CSS selectors, `storageState`): skill:playwright-best-practices.

## Phase 4 — Verify

Re-run the audit. **Goal: pass rate under `--repeat-each=5 --retries=0` reaches the rate predicted by your categorization** — typically 100% for cat 1–7 and 9; the residual rate of cat 8.

One passing run proves nothing; use the full 5x audit. Fix and verify one category at a time, or you can't tell which fix worked. Still flaky → mis-categorized, or a second category is present.

## Make Flake Visible Going Forward

Add to `playwright.config.ts`:

```ts
export default defineConfig({
    failOnFlakyTests: !!process.env.CI,    // v1.52+ — re-passing on retry now fails CI
    retries: process.env.CI ? 1 : 0,       // not 3+. One retry surfaces, doesn't hide.
    use: {
        trace: 'retain-on-failure',         // post-mortem trace per failure
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
});
```

Without `failOnFlakyTests`, a re-passing flake silently turns green and the underlying bug ages.

## See also

- skill:systematic-debugging — for non-flaky bugs (consistent failure)
- skill:test-driven-development — for new tests
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Test retries & flake reporting](https://playwright.dev/docs/test-retries)
- [Web-first assertions](https://playwright.dev/docs/test-assertions)
- [Events & waiting correctly](https://playwright.dev/docs/events#waiting-for-event)
