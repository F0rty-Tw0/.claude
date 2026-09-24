---
name: deflaky
description: Use when a Playwright e2e or integration test suite has flaky tests, intermittent timeouts under parallel load, tests that pass in isolation but fail in the full suite, inconsistent pass rates between runs, or tests exceeding default test budget.
---

# Deflaky

## Overview

E2E flake is rarely random — it falls into a small set of recurring categories with **category-specific** countermeasures. Treating every flake the same (slap on retries, loosen assertions, bump global timeouts) hides real bugs and creates new ones.

**Core principle:** ALWAYS run a multi-run audit and categorize a flake before fixing it. The fix must match the category. No one-size-fits-all.

## The Iron Law

```
NO FLAKE FIX WITHOUT A MULTI-RUN AUDIT FIRST
NO FIX WITHOUT A NAMED CATEGORY
```

Skipping the audit means you can't tell flake from broken, can't prove a fix worked, and can't categorize correctly.

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

## Phase 1 — Audit (REQUIRED, never skip)

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
| 6 | `AuthFailure`, env var missing, network unreachable, 100% fail | **Environment / credentials** | NOT a flake. Fail fast with clear message; don't retry |
| 7 | Test fails ONLY when run after sibling in same describe | **Test isolation** (shared mutable state) | Never mutate describe-scope objects from test bodies; use spread / local copies |
| 8 | Random fail, no error correlation, low rate | **Pre-existing infra variance** | Quarantine + log; track separately |
| 9 | Test stops finding elements after a UI refactor | **Brittle selectors** | Replace CSS / XPath with `getByRole`, `getByLabel`, `getByTestId` |

If a flake doesn't fit a category, you haven't traced it deeply enough. Read the full trace + HAR before forcing a category.

## Phase 3 — Fix Per Category

See [patterns.md](patterns.md) for the full code library. Two hero patterns:

```ts
// CATEGORY 5 — set waitForResponse BEFORE the action that triggers it
const responsePromise = page.waitForResponse(/api\/queue\/state/);
await page.getByRole('button', { name: 'Refresh' }).click();
const response = await responsePromise;        // body still alive

// CATEGORY 2 — narrow propagation probe + per-call retry
const isPropagationFailure = (res) => {
    const loc = res.headers().location ?? '';
    return res.status() >= 300 && res.status() < 400 && /\/error\?er=2/.test(loc);
};
await expect.poll(async () => !isPropagationFailure(await request.get(runtimeUrl, { maxRedirects: 0 })),
    { timeout: 20_000 }).toBe(true);
async function gotoWithRetry(page, url, isBadState, attempts = 5) {
    for (let i = 0; i < attempts; i++) {
        await page.goto(url);
        if (!isBadState(page.url())) return;
        await page.waitForTimeout(1000);
    }
}
```

## Anti-patterns to AVOID

- **Loosening assertions to make tests pass.** If `er=9` is correct and `er=2` happens 5%, don't accept both — er=2 is a different bug. Loosening lets the test "pass" without verifying intent.
- **Blanket `retries: 3` as the only mitigation.** Hides categories. Visible flake rate drops, real bugs accumulate. Use retries only for known cat-8.
- **`page.waitForTimeout(ms)`.** Almost never correct. Use `expect.poll`, web-first auto-retrying assertions (`toBeVisible`, `toHaveURL`, `toHaveText`), `waitForResponse`, or `waitForURL`.
- **`waitForLoadState('networkidle')`.** Officially discouraged — flaky on apps with long-poll, analytics, or background fetches. Use specific waits.
- **Bumping the global timeout to "fix" everything.** Slows feedback for healthy tests. Bump per-test or per-assertion only.
- **Adding retry inside test body without naming the category.** Band-aid that never gets cleaned up.
- **CSS / XPath selectors tied to implementation details.** `.btn-primary-2`, `nth-child` break on refactor. Use `getByRole`, `getByLabel`, `getByTestId`.
- **`waitForSelector` + manual assert.** Replace with a single auto-retrying `expect(locator).toBeVisible()`.
- **Logging in via UI in every test.** Use `storageState` saved once in `globalSetup` and reused per worker.

## Phase 4 — Verify

Re-run the audit. **Goal: pass rate under `--repeat-each=5 --retries=0` reaches the rate predicted by your categorization** — typically 100% for cat 1–7 and 9; the residual rate of cat 8.

If still flaky: you mis-categorized OR there's a second category present.

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

## Common Mistakes

- **Audit skipped.** "I know which test is flaky" — you don't. Run it.
- **Single-fix verification.** Re-running once and seeing it pass means nothing. Re-run 5×.
- **Mixing categories in one PR.** Fix one category at a time and verify; otherwise you can't tell which fix worked.
- **Category 6 mistaken as flake.** AuthFailure / missing creds is a 100%-fail bug, not a flake. Don't retry it.
- **Treating `expect.poll` and `page.waitForTimeout` as interchangeable.** They are opposites — one is condition-based, the other is wall-clock.

## See also

- skill:systematic-debugging — for non-flaky bugs (consistent failure)
- skill:test-driven-development — for new tests
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Test retries & flake reporting](https://playwright.dev/docs/test-retries)
- [Web-first assertions](https://playwright.dev/docs/test-assertions)
- [Events & waiting correctly](https://playwright.dev/docs/events#waiting-for-event)
