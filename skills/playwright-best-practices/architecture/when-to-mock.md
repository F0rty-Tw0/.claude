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

**Mock third parties everywhere; mock your own API only in a `.test.ts`.** Third-party services you don't own (payment gateways, email providers, OAuth) are stubbed in any spec. Your own frontend-to-backend calls run real in `.e2e.ts`, which proves the stack works together. Routing your own API is allowed when a test needs a state the backend cannot produce on demand (an error, an empty list, a slow response); that spec is a `.test.ts`, and an `.e2e.ts` over the same flow keeps the mocks honest.

Every route handler is a factory in `test/mocks/<name>.mock.ts`. A fixture or the spec's opening page-object call installs it before navigating: `page.route(pattern, nameMock())`. No step routes. Response bodies are typed constants, never inline literals. The file suffix follows the same boundary: a spec is `<feature>.test.ts` when a test run routes your own origin (`**/api/**`, `**/graphql`, `**/ws/**`, own assets, `routeFromHAR`) through its own `page.route`, a fixture that routes, or an opening-call option it passes. A page object that can route but is called without that option does not count. Every other spec is `<feature>.e2e.ts`, including one that only stubs third-party hosts (payment gateway, analytics, OAuth provider).

## Decision Matrix

| Scenario | Mock? | Strategy |
| --- | --- | --- |
| Your own REST/GraphQL API | `.e2e.ts`: never. `.test.ts`: yes | `.e2e.ts` hits the real API; `.test.ts` routes it with typed stubs for error, empty, and edge states |
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
├── YES → .e2e.ts: do NOT mock. Test the real integration.
│   ├── Need a state it cannot produce on demand (error, empty, slow)? → Route it in a .test.ts.
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

Block third-party scripts that slow tests and add no coverage. The mock aborts; the feature fixture routes it before handing over each page object, so every test starts with tracking blocked and no hook or step mentions it. The blocked hosts are third-party, so a spec that only uses this fixture stays a `.e2e.ts`.

```ts
// e2e/checkout/test/mocks/tracking.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

export const trackingBlockMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.abort();
};
```

```ts
// e2e/checkout/checkout.fixture.ts
import { test as base } from '@playwright/test';

import { DashboardPage } from './pages/dashboard.page';
import { OrderPage } from './pages/order.page';
import { trackingBlockMock } from './test/mocks/tracking.mock';

type CheckoutFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly orderPage: OrderPage;
};

export const test = base.extend<CheckoutFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  orderPage: async ({ page }, use): Promise<void> => {
    await use(new OrderPage(page));
  },
  page: async ({ page }, use): Promise<void> => {
    await page.route('**/{analytics,tracking,segment,hotjar}.{com,io}/**', trackingBlockMock());
    await use(page);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/checkout/dashboard.e2e.ts
import { test } from './checkout.fixture';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN blocked tracking scripts, opening the dashboard still shows its heading', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard opens', (): Promise<void> => dashboardPage.goto());

    await test.step('THEN the dashboard heading is visible', (): Promise<void> => dashboardPage.expectHeading());
  });
});
```

### Full Mock (route.fulfill)

Replace a third-party API response completely. Success and decline are two shapes, so they are two stubs and two factories.

```ts
// e2e/checkout/test/stubs/charge.stub.ts
import type { Charge, ChargeError, ChargeErrorDetail } from '../../common/checkout.type';

const declinedDetail: ChargeErrorDetail = { code: 'insufficient_funds', message: 'Card declined.' };

export const CHARGE_DECLINED_STUB: ChargeError = { error: declinedDetail };

export const CHARGE_STUB: Charge = { status: 'completed', transactionId: 'txn_mock_abc' };
```

```ts
// e2e/checkout/test/mocks/charge.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { Charge, ChargeError } from '../../common/checkout.type';
import { CHARGE_DECLINED_STUB, CHARGE_STUB } from '../stubs/charge.stub';

export const chargeDeclinedMock = (error: ChargeError = CHARGE_DECLINED_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: error, status: 402 });
};

export const chargeMock = (charge: Charge = CHARGE_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: charge });
};
```

`OrderPage.goto(options: OrderOptions = {})` takes `type OrderOptions = { readonly charge?: 'completed' | 'declined' }`. It routes `**/api/charge` to `chargeMock()` for `'completed'`, or to `chargeDeclinedMock()` for `'declined'`, before it navigates, so the first charge request already hits the mock and the spec never routes. Without the option it routes nothing, so a spec that never passes it stays a real-backend `.e2e.ts`; both tests below pass it, so theirs is a `.test.ts`.

```ts
// e2e/checkout/checkout.test.ts
import { test } from './checkout.fixture';

test.describe('FEATURE: checkout', () => {
  test('GIVEN a successful charge, paying confirms the order', async ({ orderPage }): Promise<void> => {
    await test.step('WHEN the order page is opened', (): Promise<void> => orderPage.goto({ charge: 'completed' }));

    await test.step('AND the purchase is completed', (): Promise<void> => orderPage.completePurchase());

    await test.step('THEN the confirmation message is shown', (): Promise<void> => orderPage.expectConfirmed());
  });

  test('GIVEN a declined charge, paying names the decline in the alert', async ({ orderPage }): Promise<void> => {
    await test.step('WHEN the order page is opened', (): Promise<void> => orderPage.goto({ charge: 'declined' }));

    await test.step('AND the purchase is completed', (): Promise<void> => orderPage.completePurchase());

    await test.step('THEN the alert reports the decline', (): Promise<void> => orderPage.expectPaymentError('Card declined'));
  });
});
```

### Partial Mock (Modify Responses)

Let the real call happen with `route.fetch()`, patch the typed body, and fulfil with the original `response` so headers and status carry over.

```ts
// e2e/checkout/test/mocks/inventory.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { Inventory } from '../../common/checkout.type';

export const lowStockMock = (): RouteHandler => {
  return async (route: Route): Promise<void> => {
    const response = await route.fetch();
    const inventory: Inventory = await response.json();
    const patched: Inventory = { ...inventory, lowStock: true, quantity: 1 };

    await route.fulfill({ json: patched, response });
  };
};
```

Wire it the same way as a full mock: `productPage.goto({ lowStock: true })` routes `'**/api/inventory/*'` to `lowStockMock()` before it navigates, then `productPage.expectLowStockWarning('Only 1 remaining')`.

| Variant | Change to the factory |
| --- | --- |
| Force a low-stock state | Spread the body, override `quantity` and `lowStock` (above). |
| Inject an item into a list response | Spread the body and set `items: [...body.items, ALERT_STUB]`, with `ALERT_STUB` typed in `test/stubs/`. |

### Record and Replay (HAR Files)

For complex API sequences (OAuth flows, multi-step wizards), record real traffic once and replay it. The `.har` lives in `test/fixtures/`; the options are named consts so recording and replaying differ by one identifier. The `adminPage` fixture calls `page.routeFromHAR(ADMIN_HAR, HAR_REPLAY)` before `use`, so the spec starts on replayed traffic with no hook.

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
// e2e/admin/admin.test.ts
import { test } from './admin.fixture';

test.describe('FEATURE: admin panel', () => {
  test('GIVEN replayed admin traffic, opening the admin panel shows the reports heading', async ({ adminPage }): Promise<void> => {
    await test.step('WHEN the admin panel opens', (): Promise<void> => adminPage.goto());

    await test.step('THEN the reports heading is visible', (): Promise<void> => adminPage.expectReportsHeading());
  });
});
```

Recording swaps `HAR_REPLAY` for `HAR_RECORD` in that fixture and runs a spec with steps that walk every tab (`adminPage.openReportsTab()`, `adminPage.openSettingsTab()`), run once against staging.

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

export default defineConfig({ testMatch: '**/*.@(e2e|test).ts', use, webServer });
```

### Staging Environment

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { LOCAL_URL, STAGING_URL } from './common/playwright.const';

const baseURL = process.env.CI ? STAGING_URL : LOCAL_URL;

const use = { baseURL } as const;

export default defineConfig({ testMatch: '**/*.@(e2e|test).ts', use });
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

export default defineConfig({ globalTeardown: './global-teardown.ts', testMatch: '**/*.@(e2e|test).ts', webServer });
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

Option fixtures let a spec opt out of a mock with a file-level `test.use`. The `page` fixture override installs every enabled mock before the test starts.

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
// e2e/billing/billing.test.ts
import { test } from './billing.fixture';

test.describe('FEATURE: subscription renewal', () => {
  test('GIVEN a stubbed invoice api, renewing shows the renewal message', async ({ billingPage }): Promise<void> => {
    await test.step('WHEN the billing page is opened', (): Promise<void> => billingPage.goto());

    await test.step('AND the subscription is renewed', (): Promise<void> => billingPage.renew());

    await test.step('THEN the renewal message is shown', (): Promise<void> => billingPage.expectRenewed());
  });
});
```

The real test gateway is the same scenario with `mockPayments` off. The option is read when the `page` fixture is built, before any step runs, so it cannot be an option on the opening call; it is its own spec with a file-level `test.use`.

```ts
// e2e/billing/billing-real-gateway.test.ts
import { test } from './billing.fixture';

test.use({ mockPayments: false });

test.describe('FEATURE: subscription renewal on the real test gateway', () => {
  test('GIVEN the real test gateway, renewing shows the renewal message', async ({ billingPage }): Promise<void> => {
    await test.step('WHEN the billing page is opened', (): Promise<void> => billingPage.goto());

    await test.step('AND the subscription is renewed', (): Promise<void> => billingPage.renew());

    await test.step('THEN the renewal message is shown', (): Promise<void> => billingPage.expectRenewed());
  });
});
```

### Environment-Based Test Projects

The file suffix already encodes the split: `.test.ts` files route your own API and run on every PR against the local server; `.e2e.ts` files hit the real API and run nightly against staging.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { LOCAL_URL, STAGING_URL } from './common/playwright.const';

const ciFastUse = { baseURL: LOCAL_URL } as const;

const nightlyUse = { baseURL: STAGING_URL } as const;

const projects = [
  { name: 'ci-fast', testMatch: '**/*.test.ts', use: ciFastUse },
  { name: 'nightly-full', testMatch: '**/*.e2e.ts', timeout: 120_000, use: nightlyUse }
];

export default defineConfig({ projects });
```

## Validating Mock Accuracy

Guard against mock drift from real APIs. A contract spec charges through the real endpoint and compares key names and value types with the stub the mock serves. The request body is a stub too, so the contract check and the mocked tests send the identical payload; that is what makes the comparison meaningful. The status check comes first, and `expectBodyShape` reads the body inside the check that compares it. The spec uses `request` only, so no `page` route applies and nothing in its run routes your origin: it is a `.e2e.ts` and needs no `test.use`.

```ts
// e2e/billing/test/stubs/charge-request.stub.ts
import type { ChargeRequest } from '../../common/billing.type';

export const CHARGE_REQUEST_STUB: ChargeRequest = { amount: 5000, currency: 'usd' };
```

```ts
// e2e/billing/test/utils/contract.spec.util.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

import type { ChargeRequest } from '../../common/billing.type';
import { CHARGE_REQUEST_STUB } from '../stubs/charge-request.stub';

const shapeOf = (body: Record<string, unknown>): string[] => {
  const keys = Object.keys(body).sort();

  return keys.map((key: string): string => `${key}:${typeof body[key]}`);
};

export const chargeThroughApi = (request: APIRequestContext, charge: ChargeRequest = CHARGE_REQUEST_STUB): Promise<APIResponse> => {
  return request.post('/api/billing/charge', { data: charge });
};

export const expectBodyShape = async (response: APIResponse, stub: Record<string, unknown>): Promise<void> => {
  const body: Record<string, unknown> = await response.json();

  expect(shapeOf(stub)).toEqual(shapeOf(body));
};
```

```ts
// e2e/billing/billing-contract.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expect, test } from './billing.fixture';
import { INVOICE_STUB } from './test/stubs/invoice.stub';
import { chargeThroughApi, expectBodyShape } from './test/utils/contract.spec.util';

test.describe('FEATURE: billing mock contract', () => {
  test('GIVEN the real billing API, a posted charge matches the mock body shape', async ({ request }): Promise<void> => {
    const response = await test.step('WHEN a charge is posted', (): Promise<APIResponse> => chargeThroughApi(request));

    await test.step('THEN the status is ok', (): Promise<void> => expect(response).toBeOK());

    await test.step('AND the mock keys and value types match the real body', (): Promise<void> => expectBodyShape(response, INVOICE_STUB));
  });
});
```

## Anti-Patterns

| Don't Do This | Problem | Do This Instead |
| --- | --- | --- |
| Mock your own API with no `.e2e.ts` over the same flow | Tests pass, app breaks. Zero integration coverage. | Keep an `.e2e.ts` on the real API; route your own API only in `.test.ts` for states the backend cannot produce on demand. |
| Mock everything for speed | You test a fiction. Frontend and backend may be incompatible. | Mock only external boundaries. |
| Never mock anything | Tests are slow, flaky, fail when third parties have outages. | Mock third-party services. |
| Use outdated mocks | Mock returns different shape than real API. | Run contract validation tests. Re-record HAR files regularly. |
| Mock with `page.evaluate()` to stub fetch | Fragile, doesn't survive navigation. | Use `page.route()` which intercepts at network layer. |
| Copy-paste mocks across files | One API change requires updating many files. | One factory per route in `test/mocks/`, installed by fixtures. |
| Block all network and whitelist | Extremely brittle. Every new endpoint requires update. | Allow all by default. Selectively mock third-party services. |
