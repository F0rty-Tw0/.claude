# Advanced Network Interception

## Table of Contents

1. [Request Modification](#request-modification)
2. [GraphQL Mocking](#graphql-mocking)
3. [HAR Recording & Playback](#har-recording--playback)
4. [Conditional Mocking](#conditional-mocking)
5. [Network Throttling](#network-throttling)

Every route handler in this file is a factory in `test/mocks/<name>.mock.ts` returning a `(route: Route) => Promise<void>`. A spec installs it in one step whose block body awaits `page.route(...)` (the call returns `Promise<Disposable>` since Playwright 1.63, so an expression body would not type as `Promise<void>`), or a fixture installs it before `use`. Specs never contain a handler body.

## Request Modification

### Modify Request Headers

`route.continue({ headers })` forwards the request with extra headers merged over the originals.

```ts
// e2e/dashboard/test/mocks/auth-header.mock.ts
import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

const TEST_HEADERS = { Authorization: 'Bearer test-token', 'X-Test-Header': 'test-value' };

export const authHeaderMock = (): RouteHandler => {
  return (route: Route): Promise<void> => {
    const headers = { ...route.request().headers(), ...TEST_HEADERS };

    return route.continue({ headers });
  };
};
```

### Modify Request Body

Check the method first; a GET on the same pattern continues untouched. The typed `postDataJSON()` result is spread with the test metadata and re-serialised.

```ts
// e2e/checkout/test/mocks/order-body.mock.ts
import type { Route } from '@playwright/test';

import type { OrderRequest } from '../../common/checkout.type';

type RouteHandler = (route: Route) => Promise<void>;

export const orderTestModeMock = (): RouteHandler => {
  return (route: Route): Promise<void> => {
    const isPost = route.request().method() === 'POST';

    if (!isPost) return route.continue();

    const original: OrderRequest = route.request().postDataJSON();
    const modified: OrderRequest = { ...original, testMode: true, testTimestamp: Date.now() };

    return route.continue({ postData: JSON.stringify(modified) });
  };
};
```

### Transform Response

`route.fetch()` performs the real request; `route.fulfill({ response, json })` keeps its status and headers and swaps the body.

```ts
// e2e/products/test/mocks/discount.mock.ts
import type { Route } from '@playwright/test';

import type { Product } from '../../common/products.type';

type RouteHandler = (route: Route) => Promise<void>;

const discounted = (product: Product): Product => {
  const priced: Product = { ...product, price: product.price * 0.9, testMode: true };

  return priced;
};

export const discountMock = (): RouteHandler => {
  return async (route: Route): Promise<void> => {
    const response = await route.fetch();
    const products: Product[] = await response.json();
    const json = products.map(discounted);

    await route.fulfill({ json, response });
  };
};
```

## GraphQL Mocking

### Mock by Operation Name

Every GraphQL call hits one URL, so the handler dispatches on `operationName` from the POST body. One factory takes a list of mocks; a mock matches on operation name and, when it declares `variables`, on a JSON-equal variables object. Unmatched operations continue to the real server.

```ts
// e2e/dashboard/common/dashboard.type.ts
export type GraphQLError = { readonly message: string };

export type GraphQLRequest<Variables = Record<string, unknown>> = {
  readonly operationName: string;
  readonly variables: Variables;
};

export type GraphQLResponse = {
  readonly data?: unknown;
  readonly errors?: GraphQLError[];
};

export type GraphQLMock = {
  readonly operation: string;
  readonly response: GraphQLResponse;
  readonly variables?: Record<string, unknown>;
};
```

```ts
// e2e/dashboard/test/mocks/graphql.mock.ts
import type { Route } from '@playwright/test';

import type { GraphQLMock, GraphQLRequest } from '../../common/dashboard.type';

type RouteHandler = (route: Route) => Promise<void>;

const matches = (mock: GraphQLMock, body: GraphQLRequest): boolean => {
  const isOperation = mock.operation === body.operationName;

  if (!isOperation) return false;
  if (!mock.variables) return true;

  return JSON.stringify(mock.variables) === JSON.stringify(body.variables);
};

export const graphqlMock = (mocks: GraphQLMock[]): RouteHandler => {
  return (route: Route): Promise<void> => {
    const body: GraphQLRequest = route.request().postDataJSON();
    const mock = mocks.find((candidate: GraphQLMock): boolean => matches(candidate, body));

    if (!mock) return route.continue();

    return route.fulfill({ json: mock.response });
  };
};
```

### GraphQL Mock Fixture

The fixture exposes `mockGraphQL(mocks)`, which routes `**/graphql` to the factory. Mock lists are stubs, so the spec reads as data plus steps.

```ts
// e2e/dashboard/dashboard.fixture.ts
import { test as base } from '@playwright/test';

import type { GraphQLMock } from './common/dashboard.type';
import { DashboardPage } from './pages/dashboard.page';
import { graphqlMock } from './test/mocks/graphql.mock';
import { slowDataMock } from './test/mocks/slow-data.mock';

type MockGraphQL = (mocks: GraphQLMock[]) => Promise<void>;

type MockSlowData = (delayMs: number) => Promise<void>;

type DashboardFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly mockGraphQL: MockGraphQL;
  readonly mockSlowData: MockSlowData;
};

export const test = base.extend<DashboardFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  mockGraphQL: async ({ page }, use): Promise<void> => {
    const mockGraphQL = async (mocks: GraphQLMock[]): Promise<void> => {
      await page.route('**/graphql', graphqlMock(mocks));
    };

    await use(mockGraphQL);
  },
  mockSlowData: async ({ page }, use): Promise<void> => {
    const mockSlowData = async (delayMs: number): Promise<void> => {
      await page.route('**/api/data', slowDataMock(delayMs));
    };

    await use(mockSlowData);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/dashboard/test/stubs/graphql.stub.ts
import type { GraphQLMock, GraphQLResponse } from '../../common/dashboard.type';

const STATS = { revenue: 50000, users: 100 };
const STATS_DATA = { stats: STATS };
const STATS_RESPONSE: GraphQLResponse = { data: STATS_DATA };
const USER = { id: '1', name: 'John' };
const USER_DATA = { user: USER };
const USER_RESPONSE: GraphQLResponse = { data: USER_DATA };
const USER_VARIABLES = { id: '1' };

export const STATS_MOCK_STUB: GraphQLMock = { operation: 'GetDashboardStats', response: STATS_RESPONSE };

export const USER_MOCK_STUB: GraphQLMock = { operation: 'GetUser', response: USER_RESPONSE, variables: USER_VARIABLES };
```

```ts
// e2e/dashboard/dashboard.spec.ts
import { test } from './dashboard.fixture';
import { STATS_MOCK_STUB, USER_MOCK_STUB } from './test/stubs/graphql.stub';

test.describe('FEATURE: dashboard', () => {
  test.describe('GIVEN the stats and user queries are mocked', () => {
    test.beforeEach(async ({ mockGraphQL }): Promise<void> => {
      await test.step('GIVEN the dashboard queries are mocked', (): Promise<void> => mockGraphQL([STATS_MOCK_STUB, USER_MOCK_STUB]));
    });

    test('dashboard shows the mocked user count', async ({ dashboardPage }): Promise<void> => {
      await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN stats card shows 100 users', (): Promise<void> => dashboardPage.expectUserCount(100));
    });
  });
});
```

### Mock GraphQL Mutations

A mutation mock reads the typed `variables.input` and echoes it back with computed fields, so the response agrees with what the UI sent.

```ts
// e2e/checkout/test/mocks/create-order.mock.ts
import type { Route } from '@playwright/test';

import type { CreateOrderVariables, GraphQLRequest, OrderItem } from '../../common/checkout.type';

type RouteHandler = (route: Route) => Promise<void>;

const addLineTotal = (sum: number, item: OrderItem): number => sum + item.price * item.quantity;

export const createOrderMock = (): RouteHandler => {
  return (route: Route): Promise<void> => {
    const body: GraphQLRequest<CreateOrderVariables> = route.request().postDataJSON();
    const isCreateOrder = body.operationName === 'CreateOrder';

    if (!isCreateOrder) return route.continue();

    const items = body.variables.input.items;
    const createOrder = { id: 'order-123', items, status: 'PENDING', total: items.reduce(addLineTotal, 0) };
    const data = { createOrder };
    const json = { data };

    return route.fulfill({ json });
  };
};
```

The spec installs it on `**/graphql`, clicks `checkoutPage.placeOrder()`, and asserts `checkoutPage.expectOrderNumber('order-123')`.

## HAR Recording & Playback

`context.routeFromHAR(path, options)` serves matching requests from a HAR file. The same call records when `update` is true. The HAR lives under `test/fixtures/` because it is an on-disk file the tests read. Install it by overriding `context` in the feature fixture so every page in the test uses it.

```ts
// e2e/checkout/checkout.fixture.ts
import { test as base } from '@playwright/test';

import { CheckoutPage } from './pages/checkout.page';

type CheckoutFixtures = {
  readonly checkoutPage: CheckoutPage;
};

const HAR_PATH = 'e2e/checkout/test/fixtures/checkout.har';

const harOptions = { notFound: 'fallback', update: false, url: '**/api/**' } as const;

export const test = base.extend<CheckoutFixtures>({
  checkoutPage: async ({ page }, use): Promise<void> => {
    await use(new CheckoutPage(page));
  },
  context: async ({ context }, use): Promise<void> => {
    await context.routeFromHAR(HAR_PATH, harOptions);

    await use(context);
  }
});

export { expect } from '@playwright/test';
```

The three modes below differ only in `harOptions`:

| Mode | `update` | `notFound` | Behaviour |
|---|---|---|---|
| Record | `true` | ignored | Requests hit the network; matching entries are written to the HAR on context close. |
| Playback | `false` | `'abort'` (default) | Every matching request is served from the HAR; a request missing from the file fails. |
| Fallback | `false` | `'fallback'` | Missing requests go to the real network instead of failing. |

### Record HAR File

Set `update: true`, run the spec once against the real backend, and commit the file. Keep `url` narrow (`**/api/**`) so static assets never enter it.

### Playback HAR File

Flip `update` to `false`. Every matching request is now answered from the file, so the spec runs offline and deterministic.

### HAR with Fallback

Add `notFound: 'fallback'` when the HAR is partial: recorded requests replay, unrecorded ones reach the network.

## Conditional Mocking

### Mock Based on Request Body

The search mock reads the query and picks the response by guard clauses: an error query returns 500, an empty query returns no results, anything else returns one result echoing the query.

```ts
// e2e/search/test/mocks/search.mock.ts
import type { Route } from '@playwright/test';

import type { SearchRequest } from '../../common/search.type';

type RouteHandler = (route: Route) => Promise<void>;

const ERROR_BODY = { error: 'Search failed' };
const EMPTY_BODY = { results: [] };

export const searchMock = (): RouteHandler => {
  return (route: Route): Promise<void> => {
    const body: SearchRequest = route.request().postDataJSON();

    if (body.query === 'error') return route.fulfill({ json: ERROR_BODY, status: 500 });
    if (body.query === 'empty') return route.fulfill({ json: EMPTY_BODY });

    const results = [{ id: 1, title: `Result for: ${body.query}` }];
    const json = { results };

    return route.fulfill({ json });
  };
};
```

```ts
// e2e/search/search.spec.ts
import { test } from './search.fixture';

test.describe('FEATURE: search', () => {
  test.describe('GIVEN the search endpoint is mocked by query', () => {
    test.beforeEach(async ({ mockSearch }): Promise<void> => {
      await test.step('GIVEN the search endpoint is mocked', (): Promise<void> => mockSearch());
    });

    test('error query shows the failure message', async ({ searchPage }): Promise<void> => {
      await test.step('GIVEN the search page is open', (): Promise<void> => searchPage.goto());

      await test.step('WHEN the error query is searched', (): Promise<void> => searchPage.search('error'));

      await test.step('THEN failure message is shown', (): Promise<void> => searchPage.expectError('Search failed'));
    });
  });
});
```

`searchPage.search(query)` fills the `Search` textbox and presses `Enter`; the `empty` and default queries are two more `test` blocks under the same `GIVEN`.

### Mock Nth Request

A counter in the factory closure fails the first two calls with 503 and succeeds afterwards, which exercises the app's retry path.

```ts
// e2e/dashboard/test/mocks/status-retry.mock.ts
import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

const UNAVAILABLE_BODY = { error: 'Service unavailable' };
const OK_BODY = { status: 'ok' };

export const statusRetryMock = (failuresBeforeSuccess: number): RouteHandler => {
  let callCount = 0;

  return (route: Route): Promise<void> => {
    callCount += 1;

    if (callCount <= failuresBeforeSuccess) return route.fulfill({ json: UNAVAILABLE_BODY, status: 503 });

    return route.fulfill({ json: OK_BODY });
  };
};
```

The spec routes `**/api/status` to `statusRetryMock(2)`, opens the dashboard, and asserts `dashboardPage.expectConnected()`; the web-first `expect` waits through the retries.

### Mock with Delay

A delayed fulfil lets the spec assert the loading state before the data state. The delay uses `setTimeout` from `node:timers/promises`; `waitForTimeout` in the spec is not the tool for this.

```ts
// e2e/dashboard/test/mocks/slow-data.mock.ts
import { setTimeout as sleep } from 'node:timers/promises';

import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

const DATA_BODY = { data: 'loaded' };

export const slowDataMock = (delayMs: number): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await sleep(delayMs);

    await route.fulfill({ json: DATA_BODY });
  };
};
```

```ts
// e2e/dashboard/dashboard-loading.spec.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard loading state', () => {
  test.describe('GIVEN the data endpoint answers after two seconds', () => {
    test.beforeEach(async ({ mockSlowData }): Promise<void> => {
      await test.step('GIVEN the data endpoint is mocked with a delay', (): Promise<void> => mockSlowData(2000));
    });

    test('dashboard shows the loader before the data', async ({ dashboardPage }): Promise<void> => {
      await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN loading indicator is shown', (): Promise<void> => dashboardPage.expectLoading());

      await test.step('AND data is shown', (): Promise<void> => dashboardPage.expectData('loaded'));
    });
  });
});
```

## Network Throttling

### Slow 3G Simulation

Chromium exposes throttling through CDP. `Network.emulateNetworkConditions` takes throughput in bytes per second and latency in milliseconds; the profile is a named const.

```ts
// e2e/home/test/utils/throttle.spec.util.ts
import type { BrowserContext, Page } from '@playwright/test';

import type { NetworkProfile } from '../../common/home.type';

export const SLOW_3G: NetworkProfile = {
  downloadThroughput: (500 * 1024) / 8,
  latency: 400,
  offline: false,
  uploadThroughput: (500 * 1024) / 8
};

export const throttle = async (context: BrowserContext, page: Page, profile: NetworkProfile): Promise<void> => {
  const client = await context.newCDPSession(page);

  await client.send('Network.emulateNetworkConditions', profile);
};
```

`NetworkProfile` is `{ readonly downloadThroughput: number; readonly latency: number; readonly offline: boolean; readonly uploadThroughput: number }`. The spec calls `throttle(context, page, SLOW_3G)` in its first step, opens the page, and asserts `homePage.expectSkeleton()`.

### Offline Mode

Use `context.setOffline(true/false)` to simulate network connectivity changes.

> **For comprehensive offline testing patterns:**
>
> - **Network failure simulation** (error recovery, graceful degradation): See [error-testing.md](error-testing.md#offline-testing)
> - **Offline-first/PWA testing** (service workers, caching, background sync): See [service-workers.md](service-workers.md#offline-testing)

### Network Throttling Fixture

The fixture opens one CDP session, exposes `setNetworkCondition(condition)`, and resets `setOffline(false)` after `use`. Offline routes through `context.setOffline`; the throttled profiles go through CDP.

```ts
// e2e/home/home.fixture.ts
import { test as base } from '@playwright/test';

import type { NetworkCondition, NetworkProfile } from './common/home.type';
import { HomePage } from './pages/home.page';

type SetNetworkCondition = (condition: NetworkCondition) => Promise<void>;

type HomeFixtures = {
  readonly homePage: HomePage;
  readonly setNetworkCondition: SetNetworkCondition;
};

const SLOW_3G: NetworkProfile = { downloadThroughput: 50000, latency: 2000, offline: false, uploadThroughput: 50000 };
const FAST_3G: NetworkProfile = { downloadThroughput: 180000, latency: 150, offline: false, uploadThroughput: 75000 };

const PROFILES = { fast3g: FAST_3G, slow3g: SLOW_3G };

export const test = base.extend<HomeFixtures>({
  homePage: async ({ page }, use): Promise<void> => {
    await use(new HomePage(page));
  },
  setNetworkCondition: async ({ context, page }, use): Promise<void> => {
    const client = await context.newCDPSession(page);
    const setNetworkCondition = async (condition: NetworkCondition): Promise<void> => {
      if (condition === 'offline') return context.setOffline(true);

      await client.send('Network.emulateNetworkConditions', PROFILES[condition]);
    };

    await use(setNetworkCondition);

    await context.setOffline(false);
  }
});

export { expect } from '@playwright/test';
```

`NetworkCondition` is `'fast3g' | 'offline' | 'slow3g'` in `common/home.type.ts`.

## Anti-Patterns to Avoid

| Anti-Pattern             | Problem                        | Solution                         |
| ------------------------ | ------------------------------ | -------------------------------- |
| Mocking all requests     | Tests don't reflect reality    | Mock only what's necessary       |
| No cleanup of routes     | Routes persist across tests    | Use fixtures with cleanup        |
| Ignoring request method  | Mock applies to wrong requests | Check `route.request().method()` |
| Hardcoded mock responses | Brittle, hard to maintain      | Use factories for mock data      |

## Related References

- **Basic Mocking**: See [test-suite-structure.md](../core/test-suite-structure.md) for simple mocking
- **WebSockets**: See [websockets.md](../browser-apis/websockets.md) for real-time mocking
