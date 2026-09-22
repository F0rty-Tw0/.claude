# Mocking Strategy: Real vs Mock Services

## Table of Contents

1. [Core Principle](#core-principle)
2. [Decision Matrix](#decision-matrix)
3. [Decision Flowchart](#decision-flowchart)
4. [Mocking Techniques](#mocking-techniques)
5. [Real Service Strategies](#real-service-strategies)
6. [Hybrid Approach: Fixture-Based Mock Control](#hybrid-approach-fixture-based-mock-control)
7. [Validating Mock Accuracy](#validating-mock-accuracy)
8. [Anti-Patterns](#anti-patterns)

> **When to use**: Deciding whether to mock API calls, intercept network requests, or hit real services in Playwright tests.

## Core Principle

**Mock at the boundary, test your stack end-to-end.** Mock third-party services you don't own (payment gateways, email providers, OAuth). Never mock your own frontend-to-backend communication. Tests prove YOUR code works, not that third-party APIs are available.

Every route handler is a factory in `test/mocks/<name>.mock.ts`. A spec installs it inside a step: `page.route(pattern, nameMock())`. Response bodies are typed constants, never inline literals.

## Decision Matrix

| Scenario | Mock? | Strategy |
| --- | --- | --- |
| Your own REST/GraphQL API | Never | Hit real API against staging or local dev |
| Your database (through your API) | Never | Seed via API or fixtures |
| Authentication (your auth system) | Mostly no | Use `storageState` to skip login in most tests |
| Stripe / payment gateway | Always | `route.fulfill()` with expected responses |
| SendGrid / email service | Always | Mock the API call, verify request payload |
| OAuth providers (Google, GitHub) | Always | Mock token exchange, test your callback handler |
| Analytics (Segment, Mixpanel) | Always | `route.abort()` or `route.fulfill()` |
| Maps / geocoding APIs | Always | Mock with static responses |
| Feature flags (LaunchDarkly) | Usually | Mock to force specific flag states |
| CDN / static assets | Never | Let them load normally |
| Flaky external dependency | CI: mock, local: real | Conditional mocking based on environment |
| Slow external dependency | Dev: mock, nightly: real | Separate test projects in config |

## Decision Flowchart

```text
Is this service part of YOUR codebase?
├── YES → Do NOT mock. Test the real integration.
│   ├── Is it slow? → Optimize the service, not the test.
│   └── Is it flaky? → Fix the service. Flaky infra is a bug.
└── NO → It's a third-party service.
    ├── Is it paid per call? → ALWAYS mock.
    ├── Is it rate-limited? → ALWAYS mock.
    ├── Is it slow or unreliable? → ALWAYS mock.
    └── Is it a complex multi-step flow? → Mock with HAR recording.
```

## Mocking Techniques

The samples below share one type file.

```ts
// e2e/checkout/common/checkout.type.ts
export type Charge = {
  readonly status: 'completed' | 'declined';
  readonly transactionId: string;
};

export type ChargeErrorDetail = {
  readonly code: string;
  readonly message: string;
};

export type ChargeError = {
  readonly error: ChargeErrorDetail;
};

export type Inventory = {
  readonly lowStock: boolean;
  readonly quantity: number;
  readonly sku: string;
};
```

### Blocking Unwanted Requests

Block third-party scripts that slow tests and add no coverage. The mock aborts; the `GIVEN` installs it in `beforeEach`.

```ts
// e2e/checkout/test/mocks/tracking.mock.ts
import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

export const trackingBlockMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.abort();
};
```

```ts
// e2e/checkout/dashboard.spec.ts
import { test } from './checkout.fixture';
import { trackingBlockMock } from './test/mocks/tracking.mock';

test.describe('FEATURE: dashboard', () => {
  test.describe('GIVEN tracking hosts are blocked', () => {
    test.beforeEach(async ({ page }): Promise<void> => {
      await test.step('GIVEN tracking hosts are blocked', async (): Promise<void> => {
        await page.route('**/{analytics,tracking,segment,hotjar}.{com,io}/**', trackingBlockMock());
      });
    });

    test('SCENARIO: opening the dashboard shows the heading', async ({ dashboardPage }): Promise<void> => {
      await test.step('WHEN the dashboard opens', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN the dashboard heading is visible', (): Promise<void> => dashboardPage.expectHeading());
    });
  });
});
```

### Full Mock (route.fulfill)

Replace a third-party API response completely. One factory per response shape; `status` defaults to 200.

```ts
// e2e/checkout/test/mocks/charge.mock.ts
import type { Route } from '@playwright/test';

import type { Charge, ChargeError, ChargeErrorDetail } from '../../common/checkout.type';

type RouteHandler = (route: Route) => Promise<void>;

const CHARGE_BODY: Charge = { status: 'completed', transactionId: 'txn_mock_abc' };

const DECLINED_DETAIL: ChargeErrorDetail = { code: 'insufficient_funds', message: 'Card declined.' };

const DECLINED_BODY: ChargeError = { error: DECLINED_DETAIL };

export const chargeMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: CHARGE_BODY });
};

export const chargeDeclinedMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: DECLINED_BODY, status: 402 });
};
```

The route is installed before the page opens, so the first charge request already hits the mock.

```ts
// e2e/checkout/checkout.spec.ts
import { test } from './checkout.fixture';
import { chargeDeclinedMock, chargeMock } from './test/mocks/charge.mock';

test.describe('FEATURE: checkout', () => {
  test.describe('GIVEN the order confirmation page', () => {
    test('SCENARIO: a successful charge confirms the order', async ({ orderPage, page }): Promise<void> => {
      await test.step('GIVEN a successful charge is stubbed', async (): Promise<void> => {
        await page.route('**/api/charge', chargeMock());
      });

      await test.step('AND the confirmation page is open', (): Promise<void> => orderPage.goto());

      await test.step('WHEN the purchase is completed', (): Promise<void> => orderPage.completePurchase());

      await test.step('THEN the confirmation message is shown', (): Promise<void> => orderPage.expectConfirmed());
    });

    test('SCENARIO: a declined charge names the decline in the alert', async ({ orderPage, page }): Promise<void> => {
      await test.step('GIVEN a declined charge is stubbed', async (): Promise<void> => {
        await page.route('**/api/charge', chargeDeclinedMock());
      });

      await test.step('AND the confirmation page is open', (): Promise<void> => orderPage.goto());

      await test.step('WHEN the purchase is completed', (): Promise<void> => orderPage.completePurchase());

      await test.step('THEN the alert reports the decline', (): Promise<void> => orderPage.expectPaymentError('Card declined'));
    });
  });
});
```

### Partial Mock (Modify Responses)

Let the real call happen with `route.fetch()`, patch the typed body, and fulfil with the original `response` so headers and status carry over.

```ts
// e2e/checkout/test/mocks/inventory.mock.ts
import type { Route } from '@playwright/test';

import type { Inventory } from '../../common/checkout.type';

type RouteHandler = (route: Route) => Promise<void>;

export const lowStockMock = (): RouteHandler => {
  return async (route: Route): Promise<void> => {
    const response = await route.fetch();
    const inventory: Inventory = await response.json();
    const patched: Inventory = { ...inventory, lowStock: true, quantity: 1 };

    await route.fulfill({ json: patched, response });
  };
};
```

Wire it the same way as a full mock: `page.route('**/api/inventory/*', lowStockMock())` in a step, then `productPage.expectLowStockWarning('Only 1 remaining')`.

| Variant | Change to the factory |
| --- | --- |
| Force a low-stock state | Spread the body, override `quantity` and `lowStock` (above). |
| Inject an item into a list response | Spread the body and set `items: [...body.items, ALERT_STUB]`, with `ALERT_STUB` typed in `test/stubs/`. |

### Record and Replay (HAR Files)

For complex API sequences (OAuth flows, multi-step wizards), record real traffic once and replay it. The `.har` lives in `test/fixtures/`; the options are named consts so the record and replay specs differ by one identifier.

```ts
// e2e/admin/common/admin.const.ts
type HarOptions = {
  readonly update: boolean;
  readonly url: string;
};

export const ADMIN_HAR = 'e2e/admin/test/fixtures/admin-panel.har';

export const HAR_RECORD: HarOptions = { update: true, url: '**/api/**' };

export const HAR_REPLAY: HarOptions = { update: false, url: '**/api/**' };
```

```ts
// e2e/admin/admin.spec.ts
import { test } from './admin.fixture';
import { ADMIN_HAR, HAR_REPLAY } from './common/admin.const';

test.describe('FEATURE: admin panel', () => {
  test.describe('GIVEN recorded API traffic', () => {
    test.beforeEach(async ({ page }): Promise<void> => {
      await test.step('GIVEN the admin HAR is replayed', async (): Promise<void> => {
        await page.routeFromHAR(ADMIN_HAR, HAR_REPLAY);
      });
    });

    test('SCENARIO: opening the admin panel shows the reports heading', async ({ adminPage }): Promise<void> => {
      await test.step('WHEN the admin panel opens', (): Promise<void> => adminPage.goto());

      await test.step('THEN the reports heading is visible', (): Promise<void> => adminPage.expectReportsHeading());
    });
  });
});
```

Recording is the same spec with `HAR_RECORD` and steps that walk every tab (`adminPage.openReportsTab()`, `adminPage.openSettingsTab()`), run once against staging.

**HAR maintenance:**

- Record against a known-good staging environment
- Commit `.har` files to version control
- Re-record when APIs change
- Scope HAR to specific URL patterns

## Real Service Strategies

URLs live in `common/playwright.const.ts`; the config reads `process.env` once and passes plain values.

```ts
// e2e/common/playwright.const.ts
export const LOCAL_URL = 'http://localhost:3000';

export const STAGING_URL = 'https://staging.example.com';
```

### Local Dev Server

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { LOCAL_URL } from './common/playwright.const';

const use = { baseURL: LOCAL_URL } as const;

const webServer = {
  command: 'npm run dev',
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
  url: LOCAL_URL
};

export default defineConfig({ use, webServer });
```

### Staging Environment

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { LOCAL_URL, STAGING_URL } from './common/playwright.const';

const baseURL = process.env.CI ? STAGING_URL : LOCAL_URL;

const use = { baseURL } as const;

export default defineConfig({ use });
```

### Test Containers

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { LOCAL_URL } from './common/playwright.const';

const webServer = {
  command: 'docker compose -f docker-compose.test.yml up --wait',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  url: `${LOCAL_URL}/health`
};

export default defineConfig({ globalTeardown: './e2e/global-teardown.ts', webServer });
```

```ts
// e2e/global-teardown.ts
import { execSync } from 'node:child_process';

const globalTeardown = (): void => {
  if (!process.env.CI) return;

  execSync('docker compose -f docker-compose.test.yml down -v');
};

export default globalTeardown;
```

## Hybrid Approach: Fixture-Based Mock Control

Option fixtures let a `GIVEN` opt out of a mock with `test.use`. The `page` fixture override installs every enabled mock before the test starts.

```ts
// e2e/billing/billing.fixture.ts
import { test as base } from '@playwright/test';

import { BillingPage } from './pages/billing.page';
import { analyticsBlockMock } from './test/mocks/analytics.mock';
import { invoiceMock } from './test/mocks/invoice.mock';
import { notifyMock } from './test/mocks/notify.mock';

type BillingFixtures = {
  readonly billingPage: BillingPage;
  readonly mockAnalytics: boolean;
  readonly mockNotifications: boolean;
  readonly mockPayments: boolean;
};

export const test = base.extend<BillingFixtures>({
  billingPage: async ({ page }, use): Promise<void> => {
    await use(new BillingPage(page));
  },
  mockAnalytics: [true, { option: true }],
  mockNotifications: [true, { option: true }],
  mockPayments: [true, { option: true }],
  page: async ({ mockAnalytics, mockNotifications, mockPayments, page }, use): Promise<void> => {
    if (mockPayments) {
      await page.route('**/api/billing/**', invoiceMock());
    }

    if (mockNotifications) {
      await page.route('**/api/notify', notifyMock());
    }

    if (mockAnalytics) {
      await page.route('**/{segment,mixpanel,amplitude}.**/**', analyticsBlockMock());
    }

    await use(page);
  }
});

export { expect } from '@playwright/test';
```

`invoiceMock` fulfils with `INVOICE_STUB` from `test/stubs/invoice.stub.ts`; `notifyMock` fulfils `{ delivered: true }`; `analyticsBlockMock` aborts. All three follow the factory shape shown under [Full Mock](#full-mock-routefulfill).

```ts
// e2e/billing/billing.spec.ts
import { test } from './billing.fixture';

test.describe('FEATURE: subscription renewal', () => {
  test.describe('GIVEN the payment gateway is mocked', () => {
    test('SCENARIO: renewing the subscription shows the renewal message', async ({ billingPage }): Promise<void> => {
      await test.step('GIVEN the billing page is open', (): Promise<void> => billingPage.goto());

      await test.step('WHEN the subscription is renewed', (): Promise<void> => billingPage.renew());

      await test.step('THEN the renewal message is shown', (): Promise<void> => billingPage.expectRenewed());
    });
  });

  test.describe('GIVEN the real test gateway', () => {
    test.use({ mockPayments: false });

    test('SCENARIO: renewing the subscription shows the renewal message', async ({ billingPage }): Promise<void> => {
      await test.step('GIVEN the billing page is open', (): Promise<void> => billingPage.goto());

      await test.step('WHEN the subscription is renewed', (): Promise<void> => billingPage.renew());

      await test.step('THEN the renewal message is shown', (): Promise<void> => billingPage.expectRenewed());
    });
  });
});
```

### Environment-Based Test Projects

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { LOCAL_URL, STAGING_URL } from './common/playwright.const';

const ciFastUse = { baseURL: LOCAL_URL } as const;

const nightlyUse = { baseURL: STAGING_URL } as const;

const projects = [
  { name: 'ci-fast', testMatch: '**/*.spec.ts', use: ciFastUse },
  { name: 'nightly-full', testMatch: '**/*.integration.spec.ts', timeout: 120_000, use: nightlyUse }
];

export default defineConfig({ projects });
```

## Validating Mock Accuracy

Guard against mock drift from real APIs. A contract spec charges through the real endpoint and compares key names and value types with the stub the mock serves.

```ts
// e2e/billing/test/utils/contract.spec.util.ts
import type { APIRequestContext } from '@playwright/test';

const CHARGE_DATA = { amount: 5000, currency: 'usd' } as const;

export const chargeThroughApi = async (request: APIRequestContext): Promise<Record<string, unknown>> => {
  const response = await request.post('/api/billing/charge', { data: CHARGE_DATA });

  return response.json();
};

export const shapeOf = (body: Record<string, unknown>): string[] => {
  const keys = Object.keys(body).sort();

  return keys.map((key: string): string => `${key}:${typeof body[key]}`);
};
```

```ts
// e2e/billing/billing-contract.spec.ts
import { expect, test } from './billing.fixture';
import { INVOICE_STUB } from './test/stubs/invoice.stub';
import { chargeThroughApi, shapeOf } from './test/utils/contract.spec.util';

test.describe('FEATURE: billing mock contract', () => {
  test.describe('GIVEN the real billing API', () => {
    test.use({ mockPayments: false });

    test('SCENARIO: posting a charge matches the mock body shape', async ({ request }): Promise<void> => {
      const realBody = await test.step('WHEN a charge is posted through the real API', (): Promise<Record<string, unknown>> => chargeThroughApi(request));

      await test.step('THEN the mock keys and value types match the real body', (): void => expect(shapeOf(INVOICE_STUB)).toEqual(shapeOf(realBody)));
    });
  });
});
```

## Anti-Patterns

| Don't Do This | Problem | Do This Instead |
| --- | --- | --- |
| Mock your own API | Tests pass, app breaks. Zero integration coverage. | Hit your real API. Mock only third-party services. |
| Mock everything for speed | You test a fiction. Frontend and backend may be incompatible. | Mock only external boundaries. |
| Never mock anything | Tests are slow, flaky, fail when third parties have outages. | Mock third-party services. |
| Use outdated mocks | Mock returns different shape than real API. | Run contract validation tests. Re-record HAR files regularly. |
| Mock with `page.evaluate()` to stub fetch | Fragile, doesn't survive navigation. | Use `page.route()` which intercepts at network layer. |
| Copy-paste mocks across files | One API change requires updating many files. | One factory per route in `test/mocks/`, installed by fixtures. |
| Block all network and whitelist | Extremely brittle. Every new endpoint requires update. | Allow all by default. Selectively mock third-party services. |
