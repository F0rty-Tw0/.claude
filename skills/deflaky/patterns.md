# Deflaky Patterns — Code Library

One worked example per category. Adapt the structure; the **shape** is what matters, not the exact identifiers.

---

## Category 1 — Test-budget mismatch

**Symptom:** `Test timeout of 30000ms exceeded.` — but the offending `waitForURL` / `expect.poll` inside the test has a 60s+ timeout. The outer test budget bites first.

**Rule:** the outer test budget MUST be larger than the longest inner wait, plus the cumulative time before that wait.

```ts
// BAD — relies on default 30s, but the inner wait alone is 120s
test('long workflow', async ({ page }) => {
    await waitForExpensiveSetup();                  // ~10s
    await page.goto(...);                           // ~3s
    await page.waitForURL(/.../, { timeout: 120_000 });   // ← caps at outer 30s
});

// GOOD — outer budget aligned with longest inner wait + setup overhead
test('long workflow', async ({ page }) => {
    test.setTimeout(150_000);                       // ~10s setup + ~3s nav + 120s wait + slack
    await waitForExpensiveSetup();
    await page.goto(...);
    await page.waitForURL(/.../, { timeout: 120_000 });
});
```

If many tests in the same describe need the bump, scope it once: `test.describe.configure({ timeout: 150_000 })`.

---

## Category 2 — Setup propagation race

**Symptom:** `page.goto(queueUrl)` is immediately 302'd to `/error?er=2` (or analogous error). The trace shows ONE navigation, the inner JS never runs, no expected XHRs fire.

**Cause:** the resource you just created via the management API hasn't propagated to the runtime edge that the browser hits.

**Two-layer fix.** Layer 1 — strengthen the readiness probe to also hit the runtime edge:

```ts
export const waitForResourceReady = async (
    request: APIRequestContext,
    resourceId: string,
    config: { managementUrl: string; runtimeUrl: string },
): Promise<void> => {
    let consecutive = 0;
    const required = 5;
    await expect.poll(async () => {
        const [mgmt, runtime] = await Promise.all([
            request.get(config.managementUrl),
            request.get(config.runtimeUrl, { maxRedirects: 0 }),   // observe raw status
        ]);
        const mgmtOk = mgmt.ok();
        // narrow check: ONLY the propagation signal is "not ready"
        const loc = runtime.headers().location ?? '';
        const isPropagationFailure = runtime.status() >= 300 && runtime.status() < 400 && /\/error\?er=2/.test(loc);
        const runtimeOk = !isPropagationFailure;
        if (mgmtOk && runtimeOk) consecutive++; else consecutive = 0;
        return consecutive;
    }, { intervals: [1000, 700, 500, 200], timeout: 20_000 }).toBeGreaterThanOrEqual(required);
};
```

**Why narrow:** if you reject "any 3xx" or "any 4xx" you'll falsely fail on legitimate states (sticky-session redirects, token-required rooms returning `/error?er=9`, proxy-required accounts returning 4xx without proxy headers). The narrow check rejects ONLY the bad-state signal you're trying to detect.

Layer 2 — per-call retry on the residual race. Helper, used at every navigation:

```ts
export const gotoQueueUrl = async (
    page: Page,
    accountSettings: { baseUrl: string; customerId: string },
    waitingRoomId: string,
    extraQuery?: string,
): Promise<string> => {
    const baseUrl = `${accountSettings.baseUrl}/?c=${accountSettings.customerId}&e=${waitingRoomId}`;
    const url = extraQuery ? `${baseUrl}&${extraQuery}` : baseUrl;
    for (let attempt = 0; attempt < 5; attempt++) {
        await page.goto(url);
        if (!/\/error\?er=2/.test(page.url())) return page.url();
        await page.waitForTimeout(1000);
    }
    return page.url();
};
```

Adopt this everywhere you visit a freshly-created resource: `await gotoQueueUrl(page, account, id)` instead of `await page.goto(getQueueUrl(...))`.

---

## Category 3 — Server / load timing race

**Symptom:** under parallel workers, an assertion that depends on a backend projection settling fails because the projection hasn't caught up. Logic correct, timing wrong.

```ts
// BAD — fixed sleep, simultaneously too long (waste) and too short (still races)
await page.waitForTimeout(3000);
expect(await fetchProjection()).toEqual(expectedState);

// GOOD — condition-based, terminates as soon as state matches
await expect.poll(async () => fetchProjection(), {
    intervals: [500, 750, 1000],
    timeout: 30_000,
}).toEqual(expectedState);

// EVEN BETTER — auto-retrying web-first assertion (built-in retry loop)
await expect(page.getByTestId('projection-state')).toHaveText('Settled', { timeout: 30_000 });
```

`expect.poll` polls the function. `expect(locator).toHaveX` polls the DOM. Both retry until success or timeout. **Never `page.waitForTimeout`.**

---

## Category 4 — Render race

**Symptom:** `locator(x).toBeVisible()` 5s timeout failures intermittently. Default 5s is fine for static HTML but too tight for JS-rendered content, iframes, lazy-loaded modules, or dynamic widgets.

```ts
// BAD — relies on default 5s
await expect(page.frameLocator('#widget iframe').locator('button')).toBeVisible();

// GOOD — bump per-assertion to match actual render time
await expect(page.frameLocator('#widget iframe').locator('button')).toBeVisible({ timeout: 15_000 });
```

Don't bump the global default — that hides legitimately broken tests behind 15s waits everywhere.

---

## Category 5 — Response-body GC race

**Symptom:** `Error: response.json: Protocol error (Network.getResponseBody): No resource with given identifier found`.

**Cause:** the test reads `response.json()` AFTER the page has navigated; Chromium has GC'd the response body.

**Two related fixes:**

```ts
// BAD — promise set up, action fires, response arrives mid-navigation, body GC'd
await page.goto(...);
const responsePromise = page.waitForResponse(/api\/enqueue/);
const result = await responsePromise.then(r => r.json());   // ← race

// GOOD #1 — set the listener BEFORE the action that triggers it
const responsePromise = page.waitForResponse(/api\/enqueue/);
await page.getByRole('button', { name: 'Submit' }).click();
const result = (await responsePromise).json();

// GOOD #2 — capture body in event handler microtask (most robust under navigation)
const captureResponse = <T>(page: Page, predicate: (r: Response) => boolean): Promise<T> =>
    new Promise((resolve, reject) => {
        const handler = async (response: Response) => {
            if (!predicate(response)) return;
            page.off('response', handler);
            try { resolve(JSON.parse(await response.text()) as T); } catch (e) { reject(e); }
        };
        page.on('response', handler);
    });

const enqueueResult = captureResponse<EnqueueResponse>(page, r =>
    r.url().includes('/api/enqueue') && r.request().method() === 'POST');
await page.goto(...);
const result = await enqueueResult;
```

`page.route('**/api/enqueue', ...)` + `route.fetch()` + `route.fulfill(body)` is a third option that buffers the body fully before forwarding to the page.

---

## Category 6 — Environment / credentials

**Symptom:** `AuthFailure: AWS was not able to validate the provided access credentials`, `ENOTFOUND`, missing env var, 100% test failure.

**Not a flake.** Treat as a P0 bug in CI config, not a test problem.

```ts
// In globalSetup, fail fast with a clear message
export default async function globalSetup() {
    if (!process.env.AWS_ACCESS_KEY_ID) {
        throw new Error('AWS_ACCESS_KEY_ID not set — cross-instance tests will fail. Fix CI config.');
    }
    // health-check the EC2 API once before any test runs
    try {
        await new EC2Client({}).send(new DescribeInstancesCommand({ MaxResults: 5 }));
    } catch (err) {
        throw new Error(`AWS credentials invalid: ${(err as Error).message}`);
    }
}
```

Never wrap a credential failure in retries. Surface it.

---

## Category 7 — Test isolation (shared mutable state)

**Symptom:** A test passes in isolation. It fails when run after a sibling in the same `describe`. The "extra" sibling mutates a describe-scope object whose new value persists.

```ts
// BAD — first test mutates shared object; subsequent tests inherit the mutation
describe('Feature: X', () => {
    const item = { id: createId(), config: 'A' };

    test('basic case', () => {
        item.config = 'B';   // ← persists to next test
        expectEnqueueWith(item);
    });

    test('config A case', () => {
        // EXPECTS item.config === 'A' — but it's 'B' now
        expectEnqueueWith(item);
    });
});

// GOOD — local copy via spread, never mutate the shared object
describe('Feature: X', () => {
    const item = { id: createId(), config: 'A' };

    test('basic case', () => {
        const local = { ...item, config: 'B' };
        expectEnqueueWith(local);
    });

    test('config A case', () => {
        expectEnqueueWith(item);   // item.config still 'A'
    });
});
```

Only `beforeAll` should write to describe-scope objects (one-shot setup). Test bodies always work on local copies.

---

## Category 8 — Pre-existing infra variance

**Symptom:** Random fail with no pattern, no error correlation, low rate (typically <2%). Often third-party API quirks, transient network glitches, browser background work.

These ARE legitimate retry candidates. Use sparingly:

```ts
// playwright.config.ts
export default defineConfig({
    failOnFlakyTests: !!process.env.CI,    // re-passing on retry now FAILS CI
    retries: process.env.CI ? 1 : 0,       // ONE retry, never 3+
});
```

Track which tests retry-pass via the HTML report. If the same test retry-passes >5% of the time, it's NOT cat-8 — re-categorize.

---

## Category 9 — Brittle selectors

**Symptom:** A test passes for weeks, then breaks after an unrelated UI refactor. Error: `locator not found` even though the user-visible behavior is unchanged.

```ts
// BAD — implementation-coupled
page.locator('.btn-primary-2:nth-child(3)');
page.locator('div > div.row > button');
page.locator('//div[@id="root"]/div[2]/button');

// GOOD — user-visible / semantic
page.getByRole('button', { name: 'Submit' });
page.getByLabel('Email address');
page.getByText('Continue to checkout');
page.getByTestId('submit-order');             // when content is ambiguous
```

Locator priority (Playwright official): `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > `getByTestId` > CSS/XPath. Reach for CSS/XPath only when nothing semantic exists; if you can't avoid it, add a `data-testid` to the component.

---

## Speedup bonus — `storageState` for auth

Logging in via UI per test is slow AND flaky (rate limits, CAPTCHA, slow SSO). Save once:

```ts
// auth.setup.ts (a Playwright "setup project" that runs first)
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.TEST_USER!);
    await page.getByLabel('Password').fill(process.env.TEST_PASS!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');
    await page.context().storageState({ path: 'playwright/.auth/user.json' });
});

// playwright.config.ts
projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { storageState: 'playwright/.auth/user.json' }, dependencies: ['setup'] },
];
```

Per-test now skips login entirely.

---

## Diagnosis tips

- **Trace viewer (`npx playwright show-trace trace.zip`)** — exact network timing, DOM snapshots per attempt, console errors. Run with `--trace=retain-on-failure`.
- **HAR files** — `await context.routeFromHAR(...)` lets you record + replay. Useful for isolating "is it the network or the test?"
- **Stress mode** — `npx playwright test some.test.ts --repeat-each=20 --workers=10` reproduces parallel-only flakes locally without waiting for CI.
- **Run a single test in headed mode** — `--headed --workers=1 -- some.test.ts` lets you watch the failure.
