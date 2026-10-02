# Debugging and Managing Flaky Tests

## Table of Contents

1. [Understanding Flakiness Types](#understanding-flakiness-types)
2. [Detection and Reproduction](#detection-and-reproduction)
3. [Root Cause Analysis](#root-cause-analysis)
4. [Fixing Strategies by Type](#fixing-strategies-by-type)
5. [CI-Specific Flakiness](#ci-specific-flakiness)
6. [Quarantine and Management](#quarantine-and-management)
7. [Prevention Strategies](#prevention-strategies)

For a multi-run flake audit (repeat runs, categorising each failure), use skill:deflaky; this file owns the Playwright fixes it points to.

## Understanding Flakiness Types

### Categories of Flakiness

Most flaky tests fall into distinct categories requiring different remediation:

| Category                    | Symptoms                        | Common Causes                                          |
| --------------------------- | ------------------------------- | ------------------------------------------------------ |
| **UI-driven**               | Element not found, click missed | Missing waits, animations, dynamic rendering           |
| **Environment-driven**      | CI-only failures                | Slower CPU, memory limits, cold browser starts         |
| **Data/parallelism-driven** | Fails with multiple workers     | Shared backend data, reused accounts, state collisions |
| **Test-suite-driven**       | Fails when run with other tests | Leaked state, shared fixtures, order dependencies      |

### Flakiness Decision Tree

```text
Test fails intermittently
├─ Fails locally too?
│  ├─ YES → Timing/async issue → Check waits and assertions
│  └─ NO → CI-specific → Check environment differences
│
├─ Fails only with multiple workers?
│  └─ YES → Parallelism issue → Check data isolation
│
├─ Fails only when run after specific tests?
│  └─ YES → State leak → Check fixtures and cleanup
│
└─ Fails randomly regardless of conditions?
   └─ External dependency → Check network/API stability
```

## Detection and Reproduction

### Confirming Flakiness

```bash
# Run test multiple times to confirm instability
npx playwright test e2e/checkout/checkout.test.ts --repeat-each=20

# Run with single worker to isolate parallelism issues
npx playwright test --workers=1

# Run in CI-like conditions locally
CI=true npx playwright test --repeat-each=10
```

### Reproduction Strategies

Enable artifacts so a retry captures a trace, a video, and a screenshot of the failing run.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const use = { screenshot: 'only-on-failure', trace: 'on-first-retry', video: 'retain-on-failure' } as const;

export default defineConfig({
  retries: process.env.CI ? 2 : 0,
  testMatch: '**/*.@(e2e|test).ts',
  use
});
```

### Identify Flaky Tests Programmatically

A test that fails, then passes on retry, is flaky. `testInfo.retry` and `testInfo.status` expose both facts in `afterEach`. The util logs the case; replace `console.warn` with a call to your tracking system.

```ts
// e2e/checkout/test/utils/flaky-report.spec.util.ts
import type { TestInfo } from '@playwright/test';

export const reportPassOnRetry = (testInfo: TestInfo): void => {
  const isPassOnRetry = testInfo.retry > 0 && testInfo.status === 'passed';

  if (isPassOnRetry) console.warn(`FLAKY: ${testInfo.title} passed on retry ${testInfo.retry}`);
};
```

```ts
// e2e/checkout/checkout.test.ts
import { test } from './checkout.fixture';
import { reportPassOnRetry } from './test/utils/flaky-report.spec.util';

test.afterEach((): void => reportPassOnRetry(test.info()));
```

## Root Cause Analysis

### Event Logging for Race Conditions

Log console output, page errors, and failed requests to expose timing issues. Register it in a fixture above `use`, so it runs before the test's `WHEN` opens the page: `logPageEvents(page);`. No hook step wraps it.

```ts
// e2e/checkout/test/utils/page-events.spec.util.ts
import type { ConsoleMessage, Page, Request } from '@playwright/test';

const logConsole = (message: ConsoleMessage): void => console.log(`CONSOLE [${message.type()}]:`, message.text());
const logPageError = (error: Error): void => console.error('PAGE ERROR:', error.message);
const logRequestFailed = (request: Request): void => console.error(`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`);

export const logPageEvents = (page: Page): void => {
  page.on('console', logConsole);
  page.on('pageerror', logPageError);
  page.on('requestfailed', logRequestFailed);
};
```

> **For comprehensive console error handling** (fail on errors, allowed patterns, fixtures), see [console-errors.md](console-errors.md).

### Network Timing Analysis

`request.timing()` gives per-request timestamps. Collect requests slower than a threshold and inspect the list when the test fails.

```ts
// e2e/checkout/test/utils/slow-requests.spec.util.ts
import type { Page, Request } from '@playwright/test';

const SLOW_MS = 2000;

export const collectSlowRequests = (page: Page): string[] => {
  const slowRequests: string[] = [];
  const recordSlow = (request: Request): void => {
    const timing = request.timing();
    const duration = timing.responseEnd - timing.requestStart;

    if (duration > SLOW_MS) slowRequests.push(`${request.url()} took ${duration}ms`);
  };

  page.on('requestfinished', recordSlow);

  return slowRequests;
};
```

### Trace Analysis

```bash
# View trace from failed CI run
npx playwright show-trace path/to/trace.zip

# Generate trace for specific test
npx playwright test e2e/checkout/checkout.test.ts --trace on

# Keep the failed attempt and every retry, so a fail and a pass of one test sit side by side
npx playwright test e2e/checkout/checkout.test.ts --retries=2 --trace retain-on-failure-and-retries
```

Diff the failing and the passing attempt with `npx playwright trace actions` and `trace snapshot` on each ([Terminal Trace Analysis](debugging.md#terminal-trace-analysis-agents)); the first action whose timing, call log, or snapshot differs is where the race is. A failed `expect` also carries `errorContext` on `test.info().errors` (1.60): the aria snapshot of the receiver when it failed, which shows what the page held instead of the expected state.

## Fixing Strategies by Type

### UI-Driven Flakiness

Avoid CSS selectors and raw `page.click` / `page.fill` with no follow-up assertion. The element may not be ready, an animation may swallow the click, and a CSS chain breaks on the next markup change.

```ts avoid
await page.click('#submit');
await page.fill('#username', 'test');
await page.click('div.container > div:nth-child(2) > button.btn-primary');
```

Prefer semantic locators on a page object. Locator actions auto-wait for actionability; a web-first `expect` after the action confirms the outcome and retries until it holds.

```ts
// e2e/checkout/pages/checkout.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class CheckoutPage {
  public readonly continueButton: Locator;
  public readonly dashboardHeading: Locator;
  public readonly emailInput: Locator;
  public readonly settingsItem: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.dashboardHeading = page.getByRole('heading', { name: 'Dashboard' });
    this.emailInput = page.getByLabel('Email address');
    this.settingsItem = page.getByRole('menuitem', { name: 'Settings' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/checkout');
  }

  public async continue(): Promise<void> {
    await this.continueButton.click();
  }

  public async expectDashboard(): Promise<void> {
    await expect(this.dashboardHeading).toBeVisible();
  }
}
```

| Problem | Fix |
| --- | --- |
| Element not ready when the action runs | Locator actions auto-wait. Follow the action with a web-first `expect` on the resulting state. |
| Animation or transition swallows the click | Assert the state the click produces (`expect(dialog).toBeVisible()`). Disable motion with `reducedMotion: 'reduce'` in config `use` or `page.emulateMedia({ reducedMotion: 'reduce' })`. |
| Brittle selectors | `getByRole`, `getByLabel`, `getByTestId`. Never a CSS chain. |

### Async/Timing Flakiness

Avoid an arbitrary sleep between the action and the assertion. It hides the race and fails as soon as the backend is slower than the sleep.

```ts avoid
await page.click('#load-data');
await page.waitForTimeout(3000);
```

Prefer waiting for the response the action triggers, then asserting. `waitForResponse` starts before the click so the response cannot be missed.

```ts
// e2e/dashboard/pages/dashboard.po.ts
import type { Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

const isDataResponse = (response: Response): boolean => {
  const isDataUrl = response.url().includes('/api/data');
  const isGet = response.request().method() === 'GET';

  return isDataUrl && isGet && response.ok();
};

export class DashboardPage {
  public readonly dataRows: Locator;
  public readonly loadButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.dataRows = page.getByRole('row');
    this.loadButton = page.getByRole('button', { name: 'Load data' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  public async loadData(): Promise<void> {
    await Promise.all([this.page.waitForResponse(isDataResponse), this.loadButton.click()]);
  }

  public async expectRows(count: number): Promise<void> {
    await expect(this.dataRows).toHaveCount(count);
  }
}
```

```ts
// e2e/dashboard/dashboard.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard data', () => {
  test('GIVEN ten stored rows, loading the data shows all ten in the table', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the data is loaded', (): Promise<void> => dashboardPage.loadData());

    await test.step('THEN ten rows are shown', (): Promise<void> => dashboardPage.expectRows(10));
  });
});
```

| Variant | Use |
| --- | --- |
| Slow but deterministic backend | `expect(rows).toHaveCount(10, { timeout: 10000 })` on that one assertion, never a global timeout bump. |
| Several requests behind one click | `Promise.all([page.waitForResponse('**/api/user'), page.waitForResponse('**/api/settings'), button.click()])` inside the page-object method. |
| App-specific readiness the DOM does not expose | `page.waitForFunction((): boolean => document.documentElement.dataset.appState === 'ready')` inside the page-object method. |

> **For comprehensive waiting strategies** (navigation, element state, network, polling with `toPass()`), see [assertions-waiting.md](../core/assertions-waiting.md#waiting-strategies).

### Data/Parallelism-Driven Flakiness

Avoid one account shared by every worker. Two workers editing the same user collide.

```ts avoid
const testUser = { email: 'test@example.com', password: 'pass123' };
```

Prefer a worker-scoped fixture that creates a unique user per worker and deletes it after the worker finishes. `workerInfo.workerIndex` makes the email unique.

```ts
// e2e/profile/profile.fixture.ts
import { test as base } from '@playwright/test';

import type { TestUser } from './common/profile.type';
import { ProfilePage } from './pages/profile.po';
import { createTestUser, deleteTestUser } from './test/utils/test-user.spec.util';

type ProfileFixtures = {
  readonly profilePage: ProfilePage;
};

type ProfileWorkerFixtures = {
  readonly testUser: TestUser;
};

export const test = base.extend<ProfileFixtures, ProfileWorkerFixtures>({
  profilePage: async ({ page }, use): Promise<void> => {
    await use(new ProfilePage(page));
  },
  testUser: [
    async ({}, use, workerInfo): Promise<void> => {
      const email = `test-${workerInfo.workerIndex}-${Date.now()}@example.com`;
      const user = await createTestUser(email);

      await use(user);
      await deleteTestUser(user.id);
    },
    { scope: 'worker' }
  ]
});

export { expect } from '@playwright/test';
```

Avoid one `storageState` file for every worker; each worker then shares one session.

```ts avoid
const use = { storageState: '.auth/user.json' };
```

Prefer a per-worker state file. The worker fixture authenticates once per worker and caches the file; the `storageState` override feeds it to every test in that worker.

```ts
// e2e/auth/auth.fixture.ts
import { existsSync } from 'node:fs';

import { test as base } from '@playwright/test';

import { authenticateUser } from './test/utils/authenticate.spec.util';

type AuthFixtures = {
  readonly storageState: string;
};

type AuthWorkerFixtures = {
  readonly workerStorageState: string;
};

export const test = base.extend<AuthFixtures, AuthWorkerFixtures>({
  storageState: async ({ workerStorageState }, use): Promise<void> => {
    await use(workerStorageState);
  },
  workerStorageState: [
    async ({ browser }, use, workerInfo): Promise<void> => {
      const id = workerInfo.workerIndex;
      const fileName = `.auth/user-${id}.json`;
      const isCached = existsSync(fileName);

      if (!isCached) {
        const page = await browser.newPage({ storageState: undefined });

        await authenticateUser(page, `worker${id}@test.com`);
        await page.context().storageState({ path: fileName });
        await page.close();
      }

      await use(fileName);
    },
    { scope: 'worker' }
  ]
});

export { expect } from '@playwright/test';
```

### Test-Suite-Driven Flakiness (State Leaks)

Avoid module-level state and a page shared through `beforeAll`. Every test then sees what the previous one left behind.

```ts avoid
let sharedPage: Page;

test.beforeAll(async ({ browser }) => {
  sharedPage = await browser.newPage();
});
```

Prefer Playwright's default isolation. Each test receives a fresh context and page and opens it in its own `WHEN` step; no hook carries shared arrange.

```ts
// e2e/profile/profile.e2e.ts
import { test } from './profile.fixture';

test.describe('FEATURE: profile', () => {
  test('GIVEN a saved profile, renaming it shows the new name in the header', async ({ profilePage }): Promise<void> => {
    await test.step('WHEN the profile page is opened', (): Promise<void> => profilePage.goto());

    await test.step('AND the name is updated', (): Promise<void> => profilePage.updateName('Ada'));

    await test.step('THEN header shows the new name', (): Promise<void> => profilePage.expectHeaderName('Ada'));
  });

  test('GIVEN a saved profile, changing the email shows it on the account', async ({ profilePage }): Promise<void> => {
    await test.step('WHEN the profile page is opened', (): Promise<void> => profilePage.goto());

    await test.step('AND the email is updated', (): Promise<void> => profilePage.updateEmail('ada@example.com'));

    await test.step('THEN account shows the new email', (): Promise<void> => profilePage.expectEmail('ada@example.com'));
  });
});
```

Fixture teardown runs after `use` even when the test fails, so cleanup belongs there, never at the end of a test body.

```ts
// e2e/export/export.fixture.ts
import { rmSync, writeFileSync } from 'node:fs';

import { test as base } from '@playwright/test';

type ExportFixtures = {
  readonly tempFile: string;
};

export const test = base.extend<ExportFixtures>({
  tempFile: async ({}, use): Promise<void> => {
    const file = `/tmp/test-${Date.now()}.json`;

    writeFileSync(file, '{}');

    await use(file);

    rmSync(file, { force: true });
  }
});

export { expect } from '@playwright/test';
```

## CI-Specific Flakiness

### Why Tests Fail Only in CI

| CI Condition       | Impact                                | Solution                                             |
| ------------------ | ------------------------------------- | ---------------------------------------------------- |
| Slower CPU         | Actions complete later than expected  | Use auto-waiting, not timeouts                       |
| Cold browser start | No cached assets, slower initial load | Add explicit waits for first navigation              |
| Headless mode      | Different rendering behavior          | Test locally in headless mode                        |
| Shared runners     | Resource contention                   | Reduce parallelism or use dedicated runners          |
| Network latency    | API calls slower                      | Mock external APIs, increase timeouts for real calls |

### Simulating CI Locally

```bash
# Run headless with CI environment variable
CI=true npx playwright test

# Limit CPU (Linux/Mac)
cpulimit -l 50 -- npx playwright test

# Run in Docker matching CI environment
docker run -it --rm \
  -v $(pwd):/work \
  -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test
```

### Consistent Viewport and Scale

Pin the viewport and scale factor so local and CI render identically.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const viewport = { height: 720, width: 1280 };

const use = { deviceScaleFactor: 1, viewport };

export default defineConfig({ testMatch: '**/*.@(e2e|test).ts', use });
```

### Network Stubbing for External APIs

Stub third-party endpoints so their latency and outages never reach the test. Each handler is a factory in `test/mocks/`, and the body it serves is a typed stub in `test/stubs/`. Determinism is the point here: a payload written inline per spec drifts, and a drifting payload is a flake source of its own.

```ts
// e2e/checkout/test/stubs/payment.stub.ts
import type { PaymentResult } from '../../common/checkout.type';

export const PAYMENT_RESULT_STUB: PaymentResult = { success: true, transactionId: 'test-123' };
```

```ts
// e2e/checkout/test/mocks/payment.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { PaymentResult } from '../../common/checkout.type';
import { PAYMENT_RESULT_STUB } from '../stubs/payment.stub';

export const paymentMock = (result: PaymentResult = PAYMENT_RESULT_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: result });
};
```

Every test in the feature needs the same two stubs, so the `checkoutPage` fixture routes `**/api.analytics.com/**` to `analyticsMock()` and `**/api/payment` to `paymentMock()` before `use`. No hook and no step installs them. `**/api/payment` is your own origin, so every checkout spec that uses this fixture is a `.test.ts`, the quarantined one included.

```ts
// e2e/checkout/checkout.test.ts
import { test } from './checkout.fixture';

test.describe('FEATURE: checkout', () => {
  test('GIVEN stubbed payment and analytics apis, paying opens the confirmation', async ({ checkoutPage }): Promise<void> => {
    await test.step('WHEN the checkout page is opened', (): Promise<void> => checkoutPage.goto());

    await test.step('AND the order is paid', (): Promise<void> => checkoutPage.pay());

    await test.step('THEN confirmation page is shown', (): Promise<void> => checkoutPage.expectConfirmation());
  });
});
```

| Mock | Handler body | Stub |
| --- | --- | --- |
| `analyticsMock()` | `route.fulfill({ body: '' })` for `**/api.analytics.com/**` | None; an empty body has no shape |
| `paymentProviderMock()` | `route.fulfill({ json: PROVIDER_OK_STUB })` for `**/api.payment-provider.com/**` | `PROVIDER_OK_STUB: ProviderStatus` |
| `paymentMock()` | `route.fulfill({ json: result })` for the app's own `**/api/payment` | `PAYMENT_RESULT_STUB: PaymentResult` |

## Quarantine and Management

### Quarantine Pattern

Move known-flaky specs to a `*.flaky.e2e.ts` or `*.flaky.test.ts` name and run them in their own project with more retries. The stable project ignores them so one flake never blocks the pipeline.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const FLAKY_SPECS = ['**/*.flaky.@(e2e|test).ts'];

const projects = [
  { name: 'stable', testIgnore: FLAKY_SPECS },
  { name: 'quarantine', retries: 3, testMatch: FLAKY_SPECS }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Annotation-Based Quarantine

An annotation records why a test is under investigation and appears in the report. `test.skip(condition, reason)` skips only where the flake reproduces. `IS_CI` is a plain value exported from `common/playwright.const.ts`; specs never read `process.env`. At runtime `test.info().annotations.push(...)` adds the same annotation.

```ts
// e2e/checkout/checkout.flaky.test.ts
import { IS_CI } from '../common/playwright.const';
import { test } from './checkout.fixture';

const FLAKY_ANNOTATION = { description: 'Investigating payment API timing - JIRA-1234', type: 'flaky' };

test.describe('FEATURE: checkout', () => {
  test('GIVEN stubbed payment and analytics apis, paying opens the confirmation', { annotation: FLAKY_ANNOTATION }, async ({ checkoutPage }): Promise<void> => {
    await test.step('WHEN the checkout page is opened', (): Promise<void> => checkoutPage.goto());

    await test.step('AND the order is paid', (): Promise<void> => checkoutPage.pay());

    await test.step('THEN confirmation page is shown', (): Promise<void> => checkoutPage.expectConfirmation());
  });

  test('GIVEN a cart totalling 100, the TEN coupon drops the total to 90', async ({ checkoutPage }): Promise<void> => {
    test.skip(IS_CI, 'Flaky in CI - investigating JIRA-5678');

    await test.step('WHEN the checkout page is opened', (): Promise<void> => checkoutPage.goto());

    await test.step('AND the TEN coupon is applied', (): Promise<void> => checkoutPage.applyCoupon('TEN'));

    await test.step('THEN the total drops to 90', (): Promise<void> => checkoutPage.expectTotal(90));
  });
});
```

### Reporter-Based Quarantine

`reporter.preprocess()` (1.62) runs after the config resolves and before any test starts, and marks tests through `testRun`. A quarantine reporter reads the flaky list from your tracker and marks each listed test `fixme`, so the spec files stay untouched and leaving quarantine is a data change. The list is keyed on `titlePath()` joined with ` › `. A failed fetch falls back to an empty set, so an outage runs everything instead of skipping everything. A test tagged `@critical` is never quarantined. `QUARANTINE_URL` lives in `common/playwright.const.ts`.

```ts
// e2e/reporters/quarantine.reporter.ts
import type { Reporter, TestCase } from '@playwright/test/reporter';

import { QUARANTINE_URL } from '../common/playwright.const';

type PreprocessParams = Parameters<NonNullable<Reporter['preprocess']>>[0];

const isString = (value: unknown): value is string => typeof value === 'string';

const toKey = (test: TestCase): string => test.titlePath().join(' › ');

const isCritical = (test: TestCase): boolean => test.tags.includes('@critical');

const toKeys = (body: unknown): string[] => {
  if (!Array.isArray(body)) return [];

  return body.filter(isString);
};

const fetchQuarantined = async (): Promise<Set<string>> => {
  try {
    const response = await fetch(QUARANTINE_URL, { signal: AbortSignal.timeout(5_000) });
    const body: unknown = response.ok ? await response.json() : [];
    const keys = toKeys(body);

    return new Set(keys);
  } catch {
    return new Set();
  }
};

export default class QuarantineReporter implements Reporter {
  public async preprocess({ suite, testRun }: PreprocessParams): Promise<void> {
    const quarantined = await fetchQuarantined();
    const tests = suite.allTests();

    for (const test of tests) {
      const isQuarantined = quarantined.has(toKey(test)) && !isCritical(test);

      if (isQuarantined) testRun.fixme(test, 'quarantined: flaky');
    }
  }

  public printsToStdio(): boolean {
    return false;
  }
}
```

Register it next to the normal reporter: `const reporter: ReporterDescription[] = [['list'], ['./reporters/quarantine.reporter.ts']];` above `defineConfig`. `testRun` also offers `skip`, `fail`, and `exclude`; `fixme` keeps the test visible in the report as skipped-to-fix.

## Prevention Strategies

### Test Burn-In

```bash
# Run new tests many times before merging
npx playwright test e2e/new-feature/new-feature.e2e.ts --repeat-each=50

# Run in parallel to expose race conditions
npx playwright test e2e/new-feature/new-feature.e2e.ts --repeat-each=20 --workers=4
```

### Isolation Checklist

The profile spec under [State Leaks](#test-suite-driven-flakiness-state-leaks) passes every row.

| Check | How |
| --- | --- |
| Own data | Each test receives `testUser` from a worker fixture; no test reads another test's rows. |
| Own page | The `page` fixture is fresh per test; no `beforeAll` page. |
| No order dependency | Each test opens its page in its own `WHEN` step; running one test alone passes. |
| Cleanup by fixture | Teardown after `use`, never at the end of the test body. |

### Defensive Assertions

Avoid one assertion on the final state. When it fails, the report says only that the count is wrong.

```ts avoid
await expect(page.locator('.items')).toHaveCount(5);
```

Prefer a page-object `expect*` method that asserts the container rendered, loading finished, then the count. The first failing line names the stage that broke.

```ts
// e2e/catalog/pages/catalog.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class CatalogPage {
  public readonly items: Locator;
  public readonly itemsContainer: Locator;
  public readonly loading: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.items = page.getByRole('listitem');
    this.itemsContainer = page.getByRole('list', { name: 'Items' });
    this.loading = page.getByRole('progressbar');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/catalog');
  }

  public async expectItems(count: number): Promise<void> {
    await expect(this.itemsContainer).toBeVisible();
    await expect(this.loading).toBeHidden();
    await expect(this.items).toHaveCount(count);
  }
}
```

### Retry Budget

Retry only in CI and keep timeouts modest, so retries diagnose flakes instead of masking them. `retryStrategy: 'isolated'` (1.62) runs every retry at the end of the run, one at a time in a single worker. A test that failed in the parallel run and passes in isolation is a concurrency flake (shared data, load, state leak); one that fails again alone is flaky on its own (race in the test or app).

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const expectOptions = { timeout: 10000 };

export default defineConfig({
  expect: expectOptions,
  retries: process.env.CI ? 2 : 0,
  retryStrategy: 'isolated',
  testMatch: '**/*.@(e2e|test).ts',
  timeout: 60000
});
```

### Static Checks

A missing `await` is the most common flake source: the call races the next step or outlives the test, and fails as `Target page, context or browser has been closed` or a stray timeout. Lint catches it before any run.

| Rule | Catches |
|---|---|
| `@typescript-eslint/no-floating-promises` | Any unhandled promise, including page-object and util calls the Playwright plugin cannot see; needs type-aware linting |
| `playwright/missing-playwright-await` | An un-awaited `expect` matcher, `test.step`, or Playwright API call |
| `playwright/no-wait-for-timeout` | `page.waitForTimeout()` |
| `playwright/prefer-web-first-assertions` | `expect(await locator.isVisible()).toBe(true)` and similar one-shot checks that do not retry |

Extend `playwright.configs['flat/recommended']` from `eslint-plugin-playwright` for the `e2e/` files; it enables the three plugin rules.

## Anti-Patterns to Avoid

| Anti-Pattern                              | Problem                             | Solution                                       |
| ----------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| `waitForTimeout()` as primary wait        | Arbitrary, hides real timing issues | Use auto-waiting assertions                    |
| Increasing global timeout to "fix" flakes | Masks root cause, slows all tests   | Find and fix actual timing issue               |
| Retrying until pass                       | Hides systemic problems             | Fix root cause, use retries for diagnosis only |
| Shared test data across workers           | Race conditions, collisions         | Isolate data per worker                        |
| Testing real external APIs                | Network variability                 | Mock external dependencies                     |
| Module-level mutable state                | Leaks between tests                 | Use fixtures with proper cleanup               |
| Ignoring flaky tests                      | Problem compounds over time         | Quarantine and track for fixing                |

## Related References

- **Debugging**: See [debugging.md](debugging.md) for trace viewer and inspector
- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for worker-scoped isolation
- **Performance**: See [performance.md](../infrastructure-ci-cd/performance.md) for parallel execution patterns
- **Assertions**: See [assertions-waiting.md](../core/assertions-waiting.md) for auto-waiting patterns
- **Global Setup**: See [global-setup.md](../core/global-setup.md) for setup vs fixtures decision
