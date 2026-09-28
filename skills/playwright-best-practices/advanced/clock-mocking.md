# Date, Time & Clock Mocking

## Table of Contents

1. [Clock API Basics](#clock-api-basics)
2. [Fixed Time Testing](#fixed-time-testing)
3. [Time Advancement](#time-advancement)
4. [Timezone Testing](#timezone-testing)
5. [Timer Mocking](#timer-mocking)
6. [Best Practices](#best-practices)
7. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
8. [Related References](#related-references)

Every spec below imports `test` from its own feature fixture. Each feature fixture merges the clock fixture from [Clock with Fixture](#clock-with-fixture) with the feature's page objects through `mergeTests`; the merge is shown once under `billing`. Page objects follow the shape in `core/house-style.md`; `SearchPage` is shown in full, the rest are listed here. Each `expect*` method is one plain web-first `await expect(…)` with no step around it; only the spec opens steps. `DashboardPage.goto({ time })` takes an optional typed `DashboardOptions` and installs the clock at `time` before it navigates; `PostPage.goto({ post })` routes `postMock(post)` before it opens `/posts/<id>`; `LiveDataPage.goto({ dataHandler })` routes `**/api/data` to that handler before it navigates.

| Page object | File | Members used in this file |
|---|---|---|
| `DashboardPage` | `e2e/dashboard/pages/dashboard.page.ts` | `goto(options?)`, `expectDate(text)`, `expectSessionNotice(text)` |
| `PostPage` | `e2e/posts/pages/post.page.ts` | `goto({ post })`, `expectPostedAgo(text)` |
| `BillingPage` | `e2e/billing/pages/billing.page.ts` | `goto()`, `expectDue(text)` |
| `SearchPage` | `e2e/search/pages/search.page.ts` | shown below |
| `SchedulePage` | `e2e/schedule/pages/schedule.page.ts` | `goto()`, `expectTime(text)` |
| `LiveDataPage` | `e2e/live-data/pages/live-data.page.ts` | `goto({ dataHandler })` |

## Clock API Basics

### Install Clock

`page.clock.install({ time })` before the first `goto`. The opening call does it: `dashboardPage.goto({ time })` installs the clock, then navigates, so no step only installs a clock. `time` accepts an ISO string, a `Date`, or epoch milliseconds; the page then sees that instant as now.

```ts
// e2e/dashboard/dashboard.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard date', () => {
  test('GIVEN 15 January 2025 as now, the dashboard shows that date', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ time: '2025-01-15T09:00:00Z' }));

    await test.step('THEN the date reads January 15, 2025', (): Promise<void> => dashboardPage.expectDate('January 15, 2025'));
  });
});
```

### Clock with Fixture

An option fixture `frozenTime` plus an override of `page` installs the clock before any test code runs, so the install-before-navigate rule is enforced by the fixture rather than remembered per test.

```ts
// e2e/clock/clock.fixture.ts
import { test as base } from '@playwright/test';

type ClockOptions = {
  readonly frozenTime: string;
};

export const test = base.extend<ClockOptions>({
  frozenTime: ['2025-01-15T09:00:00Z', { option: true }],
  page: async ({ frozenTime, page }, use): Promise<void> => {
    await page.clock.install({ time: frozenTime });
    await use(page);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/billing/billing.fixture.ts
import { mergeTests, test as base } from '@playwright/test';

import { test as clockTest } from '../clock/clock.fixture';
import { BillingPage } from './pages/billing.page';

type BillingFixtures = {
  readonly billingPage: BillingPage;
};

const billingTest = base.extend<BillingFixtures>({
  billingPage: async ({ page }, use): Promise<void> => {
    await use(new BillingPage(page));
  }
});

export const test = mergeTests(clockTest, billingTest);

export { expect } from '@playwright/test';
```

`frozenTime` is fixed when the page is created, so a spec sets it once with a file-level `test.use({ frozenTime })`, and a scenario that needs another instant lives in its own spec; see [Fixed Time Testing](#fixed-time-testing).

## Fixed Time Testing

### Test Date-Dependent Features

One spec per frozen date: a file-level `test.use({ frozenTime })` right after the imports, its own `FEATURE:` naming the date, and a test with a `WHEN` (open the page) and a `THEN` step.

```ts
// e2e/billing/billing-month-end.e2e.ts
import { test } from './billing.fixture';

test.use({ frozenTime: '2025-01-31T10:00:00Z' });

test.describe('FEATURE: billing on the last day of the month', () => {
  test('GIVEN the last day of the month, opening the billing page reads payment due today', async ({ billingPage }): Promise<void> => {
    await test.step('WHEN the billing page opens', (): Promise<void> => billingPage.goto());

    await test.step('THEN the due text reads payment due today', (): Promise<void> => billingPage.expectDue('Payment due today'));
  });
});
```

Other date-dependent specs keep the same shape and differ only in these three cells.

| Spec | `frozenTime` | Page object and assertion |
|---|---|---|
| `e2e/billing/billing-mid-month.e2e.ts` | `'2025-01-15T10:00:00Z'` | `BillingPage.expectDue('16 days until payment')` |
| `e2e/subscription/subscription.e2e.ts` | `'2025-12-31T23:59:00Z'` | `SubscriptionPage.expectExpiry('Expires today')` |
| `e2e/home/holiday-banner-december.e2e.ts` | `'2025-12-20T10:00:00Z'` | `HomePage.expectHolidayBanner()` (banner role, name `/holiday/i`) |
| `e2e/home/holiday-banner-january.e2e.ts` | `'2025-01-15T10:00:00Z'` | `HomePage.expectNoHolidayBanner()` |

### Test Relative Time Display

Freeze now at 14:00 and serve a post created at 12:00, so "2 hours ago" is deterministic. The post comes from a stub with `createdAt` overridden for this case, handed to the opening call, which routes it before it navigates.

```ts
// e2e/posts/test/mocks/post.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { Post } from '../../common/post.type';
import { POST_STUB } from '../stubs/post.stub';

export const postMock = (post: Post = POST_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: post });
};
```

```ts
// e2e/posts/relative-time.test.ts
import type { Post } from './common/post.type';
import { test } from './posts.fixture';
import { POST_STUB } from './test/stubs/post.stub';

test.use({ frozenTime: '2025-06-15T14:00:00Z' });

test.describe('FEATURE: relative post time', () => {
  test('GIVEN a post created at 12:00, at 14:00 it reads 2 hours ago', async ({ postPage }): Promise<void> => {
    const post: Post = { ...POST_STUB, createdAt: '2025-06-15T12:00:00Z' };

    await test.step('WHEN the post is opened', (): Promise<void> => postPage.goto({ post }));

    await test.step('THEN the posted time reads 2 hours ago', (): Promise<void> => postPage.expectPostedAgo('2 hours ago'));
  });
});
```

## Time Advancement

### Advance Time Manually

`page.clock.fastForward` accepts `'mm:ss'`, `'hh:mm:ss'`, or milliseconds. Timers due inside the jump fire once, at the end of it. A jump happens after the page is open, so it is an action: an `AND` step after the `WHEN`, and a `THEN` follows it when the outcome changes.

```ts
// e2e/dashboard/session-timeout.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: session timeout notice', () => {
  test('GIVEN a 30 minute session, it warns after 25 minutes and expires after 30', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('AND 25 minutes pass', (): Promise<void> => page.clock.fastForward('25:00'));

    await test.step('THEN the notice reads session expires in 5 minutes', (): Promise<void> => dashboardPage.expectSessionNotice('Session expires in 5 minutes'));

    await test.step('AND 5 more minutes pass', (): Promise<void> => page.clock.fastForward('05:00'));

    await test.step('THEN the notice reads session expired', (): Promise<void> => dashboardPage.expectSessionNotice('Session expired'));
  });
});
```

### Pause and Resume Time

The installed clock is paused; each `fastForward` is an explicit jump, so a countdown, a `setTimeout` chain, or a CSS animation can be checked at exact instants. These specs follow the session-timeout shape above: `WHEN` open, `AND` act, `THEN` assert, then `AND` jump and `THEN` assert per row.

| Spec | Act | Jump | Assertions before and after the jump |
|---|---|---|---|
| `e2e/sale/countdown.e2e.ts` | none | `fastForward('01:00:00')`, then `fastForward('01:00:01')` | `SalePage.expectCountdown('Sale ends in 2:00:00')`, `'Sale ends in 1:00:00'`, `'Sale ended'` |
| `e2e/notifications/queue.e2e.ts` | `NotificationsPage.showAll()` | `fastForward('00:02')` twice | `NotificationsPage.expectNotification('Notification 1')`, `'Notification 2'`, `'Notification 3'` |
| `e2e/animation/fade-in.e2e.ts` | `AnimationPage.animate()` | `fastForward(500)` | `AnimationPage.expectBoxOpacity('0')`, `'1'` (`toHaveCSS('opacity', value)` on `animated-box`) |

### Run Pending Timers

A 300 ms debounce does not fire until the clock moves past it.

```ts
// e2e/search/pages/search.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class SearchPage {
  public readonly results: Locator;
  public readonly searchInput: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.results = page.getByTestId('search-results');
    this.searchInput = page.getByLabel('Search');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/search');
  }

  public async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  public async expectResultsHidden(): Promise<void> {
    await expect(this.results).toBeHidden();
  }

  public async expectResultsVisible(): Promise<void> {
    await expect(this.results).toBeVisible();
  }
}
```

```ts
// e2e/search/debounce.e2e.ts
import { test } from './search.fixture';

test.describe('FEATURE: debounced search', () => {
  test('GIVEN a 300 ms debounce, results appear only after it elapses', async ({ page, searchPage }): Promise<void> => {
    await test.step('WHEN the search page is opened', (): Promise<void> => searchPage.goto());

    await test.step('AND a term is typed', (): Promise<void> => searchPage.search('playwright'));

    await test.step('THEN the results are still hidden', (): Promise<void> => searchPage.expectResultsHidden());

    await test.step('AND 300 ms pass', (): Promise<void> => page.clock.fastForward(300));

    await test.step('THEN the results are visible', (): Promise<void> => searchPage.expectResultsVisible());
  });
});
```

## Timezone Testing

### Test Different Timezones

`timezoneId` is a built-in context option, fixed when the context is created, so the spec sets it with a file-level `test.use` next to `frozenTime`; each timezone is its own spec. 17:00 UTC is 9 AM in Los Angeles and 2 AM the next day in Tokyo.

```ts
// e2e/schedule/timezone-los-angeles.e2e.ts
import { test } from './schedule.fixture';

test.use({ frozenTime: '2025-01-15T17:00:00Z', timezoneId: 'America/Los_Angeles' });

test.describe('FEATURE: schedule time display in los angeles', () => {
  test('GIVEN 17:00 UTC, the schedule reads 9:00 AM', async ({ schedulePage }): Promise<void> => {
    await test.step('WHEN the schedule opens', (): Promise<void> => schedulePage.goto());

    await test.step('THEN the time reads 9:00 AM', (): Promise<void> => schedulePage.expectTime('9:00 AM'));
  });
});
```

### Timezone Fixture

When one test must compare two timezones side by side, a fixture opens a context per call and closes them all after the test.

```ts
// e2e/schedule/timezone.fixture.ts
import type { Page } from '@playwright/test';
import { test as base } from '@playwright/test';

type OpenPageInTimezone = (timezoneId: string) => Promise<Page>;

type TimezoneFixtures = {
  readonly pageInTimezone: OpenPageInTimezone;
};

export const test = base.extend<TimezoneFixtures>({
  pageInTimezone: async ({ browser }, use): Promise<void> => {
    const pages: Page[] = [];
    const pageInTimezone: OpenPageInTimezone = async (timezoneId: string): Promise<Page> => {
      const context = await browser.newContext({ timezoneId });
      const page = await context.newPage();

      pages.push(page);

      return page;
    };

    await use(pageInTimezone);

    for (const page of pages) {
      await page.context().close();
    }
  }
});

export { expect } from '@playwright/test';
```

## Timer Mocking

### Mock setInterval

A recorded mock counts requests; `expect.poll` retries until the count matches, so the assertion tolerates the request landing a tick after `fastForward`.

```ts
// e2e/live-data/test/mocks/data.mock.ts
import type { Request, Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

type DataBody = {
  readonly value: number;
};

type RecordedMock = {
  readonly calls: Request[];
  readonly handler: RouteHandler;
};

export const dataMock = (): RecordedMock => {
  const calls: Request[] = [];
  const handler = (route: Route): Promise<void> => {
    calls.push(route.request());

    const json: DataBody = { value: calls.length };

    return route.fulfill({ json });
  };
  const mock: RecordedMock = { calls, handler };

  return mock;
};
```

```ts
// e2e/live-data/auto-refresh.test.ts
import { expect, test } from './live-data.fixture';
import { dataMock } from './test/mocks/data.mock';

test.describe('FEATURE: live data auto refresh', () => {
  test('GIVEN two 30 second refresh intervals, the data endpoint is called three times', async ({ liveDataPage, page }): Promise<void> => {
    const data = dataMock();

    await test.step('WHEN the live data page is opened', (): Promise<void> => liveDataPage.goto({ dataHandler: data.handler }));

    await test.step('THEN the initial load called the endpoint once', (): Promise<void> => expect.poll((): number => data.calls.length).toBe(1));

    await test.step('AND 30 seconds pass', (): Promise<void> => page.clock.fastForward('00:30'));

    await test.step('THEN the first refresh called the endpoint twice', (): Promise<void> => expect.poll((): number => data.calls.length).toBe(2));

    await test.step('AND another 30 seconds pass', (): Promise<void> => page.clock.fastForward('00:30'));

    await test.step('THEN the second refresh called the endpoint three times', (): Promise<void> => expect.poll((): number => data.calls.length).toBe(3));
  });
});
```

### Mock setTimeout Chains and Animation Frames

A `setTimeout` chain and a `requestAnimationFrame` loop both run on the installed clock; see the notification and animation rows under [Pause and Resume Time](#pause-and-resume-time).

## Best Practices

### Always Install Clock Before Navigation

Avoid: the page has already read the real time by the time the clock is installed.

```ts avoid
test('date test', async ({ page }) => {
  await page.goto('/');
  await page.clock.install({ time: new Date('2025-01-15') });
});
```

Prefer: install inside the opening call before it navigates (`dashboardPage.goto({ time })`), or let the `page` override in [Clock with Fixture](#clock-with-fixture) do it before any test code runs.

### Use ISO Strings for Clarity

Avoid: no zone suffix means the host's local timezone, so the same spec sees a different instant on a CI runner.

```ts avoid
await page.clock.install({ time: new Date('2025-01-15T09:00:00') });
```

Prefer: an explicit `Z` suffix, kept in the feature's const file when more than one spec uses it.

```ts
// e2e/billing/common/billing.const.ts
export const PAYMENT_DUE_TIME = '2025-01-31T10:00:00Z';
```

## Anti-Patterns to Avoid

| Anti-Pattern                             | Problem                         | Solution                               |
| ---------------------------------------- | ------------------------------- | -------------------------------------- |
| Installing clock after navigation        | Page already captured real time | Install clock before `goto()`          |
| Hardcoded relative dates                 | Tests break over time           | Use fixed dates with clock mock        |
| Not accounting for timezone              | Tests fail in different regions | Use explicit UTC times or set timezone |
| Using `waitForTimeout` with mocked clock | Conflicts with mocked timers    | Use `fastForward` instead              |

## Related References

- **Assertions**: See [assertions-waiting.md](../core/assertions-waiting.md) for time-based assertions
- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for clock fixtures
