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

Every spec below imports `test` from its own feature fixture. Each feature fixture merges the clock fixture from [Clock with Fixture](#clock-with-fixture) with the feature's page objects through `mergeTests`; the merge is shown once under `billing`. Page objects follow the shape in `core/house-style.md`; `SearchPage` is shown in full, the rest are listed here. Each `expect*` method wraps one web-first assertion in a boxed step.

| Page object | File | Members used in this file |
|---|---|---|
| `DashboardPage` | `e2e/dashboard/pages/dashboard.page.ts` | `goto()`, `expectDate(text)`, `expectSessionNotice(text)` |
| `PostPage` | `e2e/posts/pages/post.page.ts` | `goto(id)`, `expectPostedAgo(text)` |
| `BillingPage` | `e2e/billing/pages/billing.page.ts` | `goto()`, `expectDue(text)` |
| `SearchPage` | `e2e/search/pages/search.page.ts` | shown below |
| `SchedulePage` | `e2e/schedule/pages/schedule.page.ts` | `goto()`, `expectTime(text)` |
| `LiveDataPage` | `e2e/live-data/pages/live-data.page.ts` | `goto()` |

## Clock API Basics

### Install Clock

`page.clock.install({ time })` before the first `goto`. `time` accepts an ISO string, a `Date`, or epoch milliseconds; the page then sees that instant as now.

```ts
// e2e/dashboard/dashboard.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard date', () => {
  test.describe('GIVEN the real clock', () => {
    test('SCENARIO: installing the clock before navigation shows the installed date', async ({ dashboardPage, page }): Promise<void> => {
      await test.step('GIVEN the clock is installed on 15 January 2025', (): Promise<void> => page.clock.install({ time: '2025-01-15T09:00:00Z' }));

      await test.step('WHEN the dashboard opens', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN the date reads January 15, 2025', (): Promise<void> => dashboardPage.expectDate('January 15, 2025'));
    });
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

A `GIVEN` sets its time through `test.use({ frozenTime })`; see [Fixed Time Testing](#fixed-time-testing).

## Fixed Time Testing

### Test Date-Dependent Features

One `GIVEN` per frozen date. Each holds one test with a `WHEN` (open the page) and a `THEN` step.

```ts
// e2e/billing/billing.e2e.ts
import { test } from './billing.fixture';

test.describe('FEATURE: end of month billing', () => {
  test.describe('GIVEN the clock is frozen on the last day of the month', () => {
    test.use({ frozenTime: '2025-01-31T10:00:00Z' });

    test('SCENARIO: opening the billing page reads payment due today', async ({ billingPage }): Promise<void> => {
      await test.step('WHEN the billing page opens', (): Promise<void> => billingPage.goto());

      await test.step('THEN the due text reads payment due today', (): Promise<void> => billingPage.expectDue('Payment due today'));
    });
  });

  test.describe('GIVEN the clock is frozen mid-month', () => {
    test.use({ frozenTime: '2025-01-15T10:00:00Z' });

    test('SCENARIO: opening the billing page shows the days remaining', async ({ billingPage }): Promise<void> => {
      await test.step('WHEN the billing page opens', (): Promise<void> => billingPage.goto());

      await test.step('THEN the due text reads 16 days until payment', (): Promise<void> => billingPage.expectDue('16 days until payment'));
    });
  });
});
```

Other date-dependent specs keep the same shape and differ only in these three cells.

| Spec | `frozenTime` | Page object and assertion |
|---|---|---|
| `e2e/subscription/subscription.e2e.ts` | `'2025-12-31T23:59:00Z'` | `SubscriptionPage.expectExpiry('Expires today')` |
| `e2e/home/holiday-banner.e2e.ts` | `'2025-12-20T10:00:00Z'` | `HomePage.expectHolidayBanner()` (banner role, name `/holiday/i`) |
| `e2e/home/holiday-banner.e2e.ts` | `'2025-01-15T10:00:00Z'` | `HomePage.expectNoHolidayBanner()` |

### Test Relative Time Display

Freeze now at 14:00 and serve a post created at 12:00, so "2 hours ago" is deterministic. The post comes from a stub with `createdAt` overridden for this case.

```ts
// e2e/posts/test/mocks/post.mock.ts
import type { Route } from '@playwright/test';

import type { Post } from '../../common/post.type';

type RouteHandler = (route: Route) => Promise<void>;

export const postMock = (post: Post): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: post });
};
```

```ts
// e2e/posts/relative-time.test.ts
import type { Post } from './common/post.type';
import { test } from './posts.fixture';
import { postMock } from './test/mocks/post.mock';
import { POST_STUB } from './test/stubs/post.stub';

test.describe('FEATURE: relative post time', () => {
  test.describe('GIVEN the clock is frozen on 15 June 2025 at 14:00', () => {
    test.use({ frozenTime: '2025-06-15T14:00:00Z' });

    test('SCENARIO: a post created at 12:00 reads 2 hours ago', async ({ page, postPage }): Promise<void> => {
      const post: Post = { ...POST_STUB, createdAt: '2025-06-15T12:00:00Z' };

      await test.step('GIVEN the post is served', async (): Promise<void> => {
        await page.route('**/api/posts/1', postMock(post));
      });

      await test.step('WHEN the post opens', (): Promise<void> => postPage.goto(post.id));

      await test.step('THEN the posted time reads 2 hours ago', (): Promise<void> => postPage.expectPostedAgo('2 hours ago'));
    });
  });
});
```

## Time Advancement

### Advance Time Manually

`page.clock.fastForward` accepts `'mm:ss'`, `'hh:mm:ss'`, or milliseconds. Timers due inside the jump fire once, at the end of it.

```ts
// e2e/dashboard/session-timeout.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: session timeout notice', () => {
  test.describe('GIVEN the clock is frozen at 09:00 and the session lasts 30 minutes', () => {
    test('SCENARIO: the notice warns after 25 minutes and expires after 30', async ({ dashboardPage, page }): Promise<void> => {
      await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());

      await test.step('WHEN 25 minutes pass', (): Promise<void> => page.clock.fastForward('25:00'));

      await test.step('THEN the notice reads session expires in 5 minutes', (): Promise<void> => dashboardPage.expectSessionNotice('Session expires in 5 minutes'));

      await test.step('AND 5 more minutes pass', (): Promise<void> => page.clock.fastForward('05:00'));

      await test.step('THEN the notice reads session expired', (): Promise<void> => dashboardPage.expectSessionNotice('Session expired'));
    });
  });
});
```

### Pause and Resume Time

The installed clock is paused; each `fastForward` is an explicit jump, so a countdown, a `setTimeout` chain, or a CSS animation can be checked at exact instants. These specs follow the session-timeout shape above: `GIVEN` open, `WHEN` act, `THEN` assert, then `WHEN` jump and `THEN` assert per row.

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
import { expect, test } from '@playwright/test';

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
    await test.step('results are hidden', (): Promise<void> => expect(this.results).toBeHidden(), { box: true });
  }

  public async expectResultsVisible(): Promise<void> {
    await test.step('results are visible', (): Promise<void> => expect(this.results).toBeVisible(), { box: true });
  }
}
```

```ts
// e2e/search/debounce.e2e.ts
import { test } from './search.fixture';

test.describe('FEATURE: debounced search', () => {
  test.describe('GIVEN a 300 ms debounce', () => {
    test('SCENARIO: results appear only after the 300 ms debounce', async ({ page, searchPage }): Promise<void> => {
      await test.step('GIVEN the search page is open', (): Promise<void> => searchPage.goto());

      await test.step('WHEN a term is typed', (): Promise<void> => searchPage.search('playwright'));

      await test.step('THEN the results are still hidden', (): Promise<void> => searchPage.expectResultsHidden());

      await test.step('AND 300 ms pass', (): Promise<void> => page.clock.fastForward(300));

      await test.step('THEN the results are visible', (): Promise<void> => searchPage.expectResultsVisible());
    });
  });
});
```

## Timezone Testing

### Test Different Timezones

`timezoneId` is a built-in context option, so a `GIVEN` sets it with `test.use` next to `frozenTime`. 17:00 UTC is 9 AM in Los Angeles and 2 AM the next day in Tokyo.

```ts
// e2e/schedule/timezone.e2e.ts
import { test } from './schedule.fixture';

test.describe('FEATURE: schedule time display', () => {
  test.describe('GIVEN the clock is frozen at 17:00 UTC in Los Angeles', () => {
    test.use({ frozenTime: '2025-01-15T17:00:00Z', timezoneId: 'America/Los_Angeles' });

    test('SCENARIO: opening the schedule reads 9:00 AM', async ({ schedulePage }): Promise<void> => {
      await test.step('WHEN the schedule opens', (): Promise<void> => schedulePage.goto());

      await test.step('THEN the time reads 9:00 AM', (): Promise<void> => schedulePage.expectTime('9:00 AM'));
    });
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

type RouteHandler = (route: Route) => Promise<void>;

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
  test.describe('GIVEN a 30 second refresh interval', () => {
    test('SCENARIO: two refresh intervals call the data endpoint three times', async ({ liveDataPage, page }): Promise<void> => {
      const data = dataMock();

      await test.step('GIVEN the data endpoint is served and recorded', async (): Promise<void> => {
        await page.route('**/api/data', data.handler);
      });

      await test.step('AND the live data page is open', (): Promise<void> => liveDataPage.goto());

      await test.step('AND the initial load called the endpoint once', (): Promise<void> => expect.poll((): number => data.calls.length).toBe(1));

      await test.step('WHEN 30 seconds pass', (): Promise<void> => page.clock.fastForward('00:30'));

      await test.step('THEN the first refresh called the endpoint twice', (): Promise<void> => expect.poll((): number => data.calls.length).toBe(2));

      await test.step('AND another 30 seconds pass', (): Promise<void> => page.clock.fastForward('00:30'));

      await test.step('THEN the second refresh called the endpoint three times', (): Promise<void> => expect.poll((): number => data.calls.length).toBe(3));
    });
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

Prefer: install as the first step, or let the `page` override in [Clock with Fixture](#clock-with-fixture) do it before any test code runs.

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
