# Performance & Parallelization

## Table of Contents

1. [Parallel Execution](#parallel-execution)
2. [Sharding](#sharding)
3. [Test Optimization](#test-optimization)
4. [Network Optimization](#network-optimization)
5. [Isolation and Parallel Execution](#isolation-and-parallel-execution)
6. [Resource Management](#resource-management)
7. [Benchmarking](#benchmarking)

## Parallel Execution

### Configuration

`fullyParallel` runs tests inside one file in parallel. `workers` is a fixed count, a percentage of CPU cores (`'50%'`), or `undefined` for auto-detect (half the cores).

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined
});
```

### Serial Execution When Needed

`test.describe.configure({ mode: 'serial' })` at the top of a file runs every test in order on one worker and skips the rest after a failure. The same call inside a `describe` scopes the mode to that block; `test.describe.serial('GIVEN …', …)` is the shorthand. Blocks without the call stay parallel.

```ts
// e2e/onboarding/onboarding.e2e.ts
import { test } from './onboarding.fixture';
import { PROFILE_STUB } from './test/stubs/onboarding.stub';

test.describe.configure({ mode: 'serial' });

test.describe('FEATURE: onboarding', () => {
  test.describe('GIVEN a new account', () => {
    test('SCENARIO: completed profile opens the plan step', async ({ onboardingPage }): Promise<void> => {
      await test.step('WHEN the profile is filled in', (): Promise<void> => onboardingPage.completeProfile(PROFILE_STUB));

      await test.step('THEN plan step is shown', (): Promise<void> => onboardingPage.expectStep('plan'));
    });

    test('SCENARIO: picked plan opens the summary step', async ({ onboardingPage }): Promise<void> => {
      await test.step('WHEN the free plan is picked', (): Promise<void> => onboardingPage.pickPlan('free'));

      await test.step('THEN summary step is shown', (): Promise<void> => onboardingPage.expectStep('summary'));
    });
  });
});
```

| Call | Scope | Effect |
|---|---|---|
| `test.describe.configure({ mode: 'serial' })` at file top | Whole file | Ordered, one worker, stop on first failure |
| `test.describe.configure({ mode: 'serial' })` inside a describe | That block | Same, block only |
| `test.describe.serial('GIVEN …', () => {})` | That block | Shorthand for the above |
| `test.describe.configure({ mode: 'parallel' })` | That block | Tests in the block run in parallel even with `fullyParallel: false` |

### Parallel Projects

Each project is a named const; `projects` lists them. Projects run in parallel across the worker pool.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'] };
const firefox = { ...devices['Desktop Firefox'] };
const webkit = { ...devices['Desktop Safari'] };

const projects = [
  { name: 'chromium', use: chromium },
  { name: 'firefox', use: firefox },
  { name: 'webkit', use: webkit }
];

export default defineConfig({ projects });
```

```bash
# Run all projects in parallel
npx playwright test

# Run specific project
npx playwright test --project=chromium
```

## Sharding

### Basic Sharding

```bash
# Split tests across 4 machines
# Machine 1:
npx playwright test --shard=1/4

# Machine 2:
npx playwright test --shard=2/4

# Machine 3:
npx playwright test --shard=3/4

# Machine 4:
npx playwright test --shard=4/4
```

### Sharding Strategy

Tests are distributed evenly by file. For optimal sharding:

- Keep test files similar in size
- Use `fullyParallel: true` for even distribution
- Balance slow tests across files

### CI Sharding Pattern

```yaml
# GitHub Actions
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/4
```

> **For comprehensive CI sharding** (blob reports, merging sharded results, full workflows), see [ci-cd.md](ci-cd.md#sharding).

## Test Optimization

### Reuse Authentication

Avoid logging in for every test. Use setup projects with storage state to authenticate once and reuse the session.

> **For authentication patterns** (storage state, multiple auth states, setup projects), see [fixtures-hooks.md](../core/fixtures-hooks.md#authentication-patterns).

### Reuse Page State (serial only — trade-off with isolation)

Sharing a single page/context across tests with `beforeAll`/`afterAll` is **not recommended** for most suites: it breaks test isolation, causes state leak between tests, and makes failures harder to debug. Prefer a fresh `page` per test (Playwright default). Use a shared page only when you explicitly need serial execution and accept no isolation.

Avoid a page created in `beforeAll` and reused by every test; state from one test leaks into the next:

```ts avoid
test.describe.configure({ mode: 'serial' });
test.describe('Dashboard', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: '.auth/user.json' });
    page = await context.newPage();
    await page.goto('/dashboard');
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('shows stats', async () => {
    await expect(page.getByTestId('stats')).toBeVisible();
  });
});
```

Prefer storage state from a setup project (see [Reuse Authentication](#reuse-authentication)) and one navigation step in the `GIVEN`'s `beforeEach`. Each test gets a fresh page; the navigation cost is one `goto`:

```ts
// e2e/dashboard/dashboard.test.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard', () => {
  test.describe('GIVEN a signed-in user', () => {
    test.beforeEach(async ({ dashboardPage }): Promise<void> => {
      await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());
    });

    test('SCENARIO: page load shows the stats panel', async ({ dashboardPage }): Promise<void> => {
      await test.step('THEN stats panel is visible', (): Promise<void> => dashboardPage.expectStatsVisible());
    });

    test('SCENARIO: page load shows the chart', async ({ dashboardPage }): Promise<void> => {
      await test.step('THEN chart is visible', (): Promise<void> => dashboardPage.expectChartVisible());
    });
  });
});
```

### Lazy Navigation

Avoid a `goto` repeated at the top of every test:

```ts avoid
test('check header', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading')).toBeVisible();
});

test('check footer', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('contentinfo')).toBeVisible();
});
```

Prefer the shape in [Reuse Page State](#reuse-page-state-serial-only--trade-off-with-isolation): the shared navigation is one step in the `GIVEN`'s `beforeEach`, and each test holds only its own assertion step.

### Skip Unnecessary Setup

`test.skip(condition, reason)` inside the body skips before any step runs. The condition reads a const from `common/<feature>.const.ts`, never `process.env` in the spec.

```ts
// e2e/admin/admin.e2e.ts
import { ADMIN_ENABLED } from './common/admin.const';
import { test } from './admin.fixture';

test.describe('FEATURE: admin panel', () => {
  test.describe('GIVEN an admin user', () => {
    test('SCENARIO: opened admin panel shows the user list', async ({ adminPage }): Promise<void> => {
      test.skip(!ADMIN_ENABLED, 'admin features disabled in this environment');

      await test.step('WHEN the admin panel is opened', (): Promise<void> => adminPage.goto());

      await test.step('THEN user list is shown', (): Promise<void> => adminPage.expectUserList());
    });
  });
});
```

| Annotation | Use |
|---|---|
| `test.skip(condition, reason)` | Skip when the environment lacks the feature |
| `test.fixme(condition, reason)` | Known broken; skipped but tracked in the report |
| `test.fixme('SCENARIO: <flow>', body)` | Declaration form for a test that is not ready |

## Network Optimization

### Mock APIs

Slow or heavy endpoints get a route handler factory in `test/mocks/`; an auto fixture installs them for every test in the feature.

```ts
// e2e/dashboard/test/stubs/analytics.stub.ts
import type { Analytics } from '../../common/dashboard.type';

export const ANALYTICS_STUB: Analytics = { views: 1000 };
```

```ts
// e2e/dashboard/test/mocks/analytics.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { Analytics } from '../../common/dashboard.type';
import { ANALYTICS_STUB } from '../stubs/analytics.stub';

export const analyticsMock = (analytics: Analytics = ANALYTICS_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: analytics });
};
```

`recommendationsMock` follows the same shape and fulfills with `RECOMMENDATIONS_EMPTY_STUB`, a `Recommendation[]` in `test/stubs/recommendations.stub.ts`.

```ts
// e2e/dashboard/dashboard.fixture.ts
import { test as base } from '@playwright/test';

import { DashboardPage } from './pages/dashboard.page';
import { analyticsMock } from './test/mocks/analytics.mock';
import { recommendationsMock } from './test/mocks/recommendations.mock';

type DashboardFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly mockedHeavyEndpoints: void;
};

export const test = base.extend<DashboardFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  mockedHeavyEndpoints: [
    async ({ page }, use): Promise<void> => {
      await page.route('**/api/analytics', analyticsMock());
      await page.route('**/api/recommendations', recommendationsMock());
      await use();
    },
    { auto: true }
  ]
});

export { expect } from '@playwright/test';
```

### Block Unnecessary Resources

One catch-all route aborts requests to tracking hosts and continues everything else. Install it with `page.route('**/*', trackingBlockMock())` in an auto fixture as above. The host list is data, so it lives in `test/common/`, not in the mock.

```ts
// e2e/dashboard/test/common/dashboard.const.ts
export const TRACKING_HOSTS: string[] = ['google-analytics', 'facebook', 'hotjar'];
```

```ts
// e2e/dashboard/test/mocks/tracking-block.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import { TRACKING_HOSTS } from '../common/dashboard.const';

const isTrackingUrl = (url: string): boolean => {
  return TRACKING_HOSTS.some((host: string): boolean => url.includes(host));
};

export const trackingBlockMock = (): RouteHandler => {
  return (route: Route): Promise<void> => {
    const url = route.request().url();
    const isTracking = isTrackingUrl(url);

    if (isTracking) return route.abort();

    return route.continue();
  };
};
```

### Block Resource Types

Same factory shape, keyed on `route.request().resourceType()` instead of the URL:

| Variant | Predicate | Typical list |
|---|---|---|
| By host | `route.request().url()` includes a host | `['google-analytics', 'facebook', 'hotjar']` |
| By resource type | `route.request().resourceType()` is in the list | `['image', 'font', 'stylesheet']` |

### Cache API Responses

A module-level `Map` caches JSON per URL for the life of the worker. First hit fetches through `route.fetch()`; later hits fulfill from the map.

```ts
// e2e/dashboard/test/mocks/api-cache.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

const apiCache = new Map<string, unknown>();

export const apiCacheMock = (): RouteHandler => {
  return async (route: Route): Promise<void> => {
    const url = route.request().url();
    const cached = apiCache.get(url);

    if (cached !== undefined) return route.fulfill({ json: cached });

    const response = await route.fetch();
    const json: unknown = await response.json();

    apiCache.set(url, json);

    return route.fulfill({ json });
  };
};
```

Install with `page.route('**/api/**', apiCacheMock())`.

## Isolation and Parallel Execution

### Default: one context per test

Playwright gives each test its own browser context (and page). That gives isolation: no shared cookies, storage, or DOM between tests, so failures don’t carry over and you can run tests in any order or in parallel. Keep this default unless you have a clear reason to share state.

### Avoiding state leak in parallel runs

- **Do not** rely on shared mutable state (e.g. a single `page` or `context` in `beforeAll`) when tests can run in parallel. State from one test can leak into another and cause flaky, order-dependent failures.
- Use **fixtures** for setup/teardown and **`beforeEach`** for per-test navigation so each test gets a fresh page or a clean slate.
- For **backend or DB state** shared across tests, isolate per worker so parallel workers don’t collide. Use a worker-scoped fixture and `testInfo.workerIndex` (or `process.env.TEST_WORKER_INDEX`) to create unique data per worker (e.g. unique user or DB prefix). See [fixtures-hooks.md](../core/fixtures-hooks.md) for worker-scoped fixtures and [debugging.md](../debugging/debugging.md) for debugging flaky parallel runs.

### Debugging flaky parallel runs

If a test is flaky only with multiple workers:

1. **Reproduce**: Run with default workers and `--repeat-each=10` (or `--repeat-each=100 --max-failures=1`).
2. **Confirm parallel-specific**: Run with `--workers=1`. If the failure disappears, the cause is likely shared state or non-isolated backend/DB data.
3. **Fix**: Remove shared page/context; use per-test fixtures and `beforeEach`; isolate test data per worker with `workerIndex` in a worker-scoped fixture.

Workers are restarted after a test failure so subsequent tests in that worker get a clean environment; fixing isolation still prevents the initial flakiness.

## Resource Management

### Browser Contexts

The default `page` fixture is a fresh context per test. When a test needs a second context (a second tab or a second user), a fixture owns it: create before `use`, wrap the page in a page object, close after.

```ts
// e2e/chat/chat.fixture.ts
import { test as base } from '@playwright/test';

import { ChatPage } from './pages/chat.page';

type ChatFixtures = {
  readonly chatPage: ChatPage;
  readonly guestChatPage: ChatPage;
};

export const test = base.extend<ChatFixtures>({
  chatPage: async ({ page }, use): Promise<void> => {
    await use(new ChatPage(page));
  },
  guestChatPage: async ({ browser }, use): Promise<void> => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await use(new ChatPage(page));
    await context.close();
  }
});

export { expect } from '@playwright/test';
```

### Memory Management

Fewer workers and `--disable-dev-shm-usage` lower memory pressure in containers.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const launchOptions = { args: ['--disable-dev-shm-usage'] };

const use = { launchOptions };

export default defineConfig({
  use,
  workers: 2
});
```

### Timeouts

`timeout` bounds one test, `expect.timeout` bounds one assertion, `navigationTimeout` and `actionTimeout` bound one `goto` and one action.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const expect = { timeout: 5000 };

const use = { actionTimeout: 10000, navigationTimeout: 15000 };

export default defineConfig({
  expect,
  timeout: 30000,
  use
});
```

## Benchmarking

### Measure Test Duration

The page object times its own navigation and returns the milliseconds; a `test/utils` helper pushes the number onto `testInfo.annotations` so it appears in the report.

```ts
// e2e/home/pages/home.page.ts
import type { Page } from '@playwright/test';

import type { PageMetrics } from '../common/home.type';

const readMetrics = (): PageMetrics => {
  const timing = performance.timing;
  const metrics: PageMetrics = {
    domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
    loadTime: timing.loadEventEnd - timing.navigationStart,
    resources: performance.getEntriesByType('resource').length
  };

  return metrics;
};

export class HomePage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async goto(): Promise<void> {
    await this.page.goto('/');
  }

  public async gotoTimed(): Promise<number> {
    const start = Date.now();

    await this.page.goto('/');

    return Date.now() - start;
  }

  public async metrics(): Promise<PageMetrics> {
    return this.page.evaluate<PageMetrics>(readMetrics);
  }
}
```

```ts
// e2e/home/test/utils/annotate.spec.util.ts
import type { TestInfo } from '@playwright/test';

export const annotateLoadTime = (testInfo: TestInfo, loadTime: number): void => {
  const annotation = { description: `Load time: ${loadTime}ms`, type: 'performance' };

  testInfo.annotations.push(annotation);
};
```

```ts
// e2e/home/home.e2e.ts
import type { PageMetrics } from './common/home.type';
import { expect, test } from './home.fixture';
import { annotateLoadTime } from './test/utils/annotate.spec.util';

test.describe('FEATURE: home page performance', () => {
  test.describe('GIVEN a cold visitor', () => {
    test('SCENARIO: home page load time is recorded on the report', async ({ homePage }, testInfo): Promise<void> => {
      const loadTime = await test.step('GIVEN the home page is opened and timed', (): Promise<number> => homePage.gotoTimed());

      await test.step('WHEN the load time is recorded on the report', (): void => annotateLoadTime(testInfo, loadTime));
    });

    test('SCENARIO: home page loads under three seconds', async ({ homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      const metrics = await test.step('WHEN navigation timing is read', (): Promise<PageMetrics> => homePage.metrics());

      await test.step('THEN load time is under budget', (): void => expect(metrics.loadTime).toBeLessThan(3000));
    });
  });
});
```

### Performance Metrics

`readMetrics` above runs inside the browser through `page.evaluate<PageMetrics>(...)`; the generic types the result, so no cast is needed. `PageMetrics` lives in `common/home.type.ts`:

```ts
// e2e/home/common/home.type.ts
export type PageMetrics = {
  readonly domContentLoaded: number;
  readonly loadTime: number;
  readonly resources: number;
};
```

`performance.memory.usedJSHeapSize` (Chrome only) is not in the DOM typings; reading it needs its own typed accessor, so it is left out of `readMetrics`.

### Lighthouse Integration

`playAudit` from `playwright-lighthouse` audits the current page over the Chrome DevTools port. Chromium must be launched with `--remote-debugging-port=9222` for the `port` option to connect. Thresholds are a named const; the helper returns the performance score as a percentage.

```ts
// e2e/home/test/utils/lighthouse.spec.util.ts
import type { Page } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';

const THRESHOLDS = { accessibility: 90, 'best-practices': 80, performance: 80, seo: 80 };

export const auditHome = async (page: Page): Promise<number> => {
  const audit = await playAudit({ page, port: 9222, thresholds: THRESHOLDS });
  const score = audit.lhr.categories.performance.score ?? 0;

  return score * 100;
};
```

```ts
// e2e/home/lighthouse.e2e.ts
import { expect, test } from './home.fixture';
import { auditHome } from './test/utils/lighthouse.spec.util';

test.describe('FEATURE: home page lighthouse audit', () => {
  test.describe('GIVEN a cold visitor', () => {
    test('SCENARIO: home page audit scores at least 80', async ({ homePage, page }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      const score = await test.step('WHEN the lighthouse audit is run', (): Promise<number> => auditHome(page));

      await test.step('THEN performance score meets the budget', (): void => expect(score).toBeGreaterThanOrEqual(80));
    });
  });
});
```

## Performance Checklist

| Optimization                   | Impact     |
| ------------------------------ | ---------- |
| Enable `fullyParallel`         | High       |
| Reuse authentication           | High       |
| Mock heavy APIs                | High       |
| Block tracking scripts         | Medium     |
| Use sharding in CI             | High       |
| Reduce workers if memory-bound | Medium     |
| Cache API responses            | Medium     |
| Skip unnecessary tests         | Low-Medium |

## Related References

- **CI/CD sharding**: See [ci-cd.md](ci-cd.md) for CI configuration
- **Test organization**: See [test-suite-structure.md](../core/test-suite-structure.md) for structuring tests
- **Fixtures for reuse**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for authentication patterns
