# Advanced Network Interception

## Table of Contents

1. [Request Modification](#request-modification)
2. [GraphQL Mocking](#graphql-mocking)
3. [HAR Recording & Playback](#har-recording--playback)
4. [Conditional Mocking](#conditional-mocking)
5. [Network Throttling](#network-throttling)

Every route handler in this file is a factory in `test/mocks/<name>.mock.ts` returning a `(route: Route) => Promise<void>`. The opening page-object call installs it as an option before it navigates, awaiting `page.route(...)` in its method body (the call returns `Promise<Disposable>` since Playwright 1.63), or a fixture installs it before `use`. Specs never contain a handler body or a step that only routes.

## Request Modification

### Modify Request Headers

`route.continue({ headers })` forwards the request with extra headers merged over the originals.

```ts
// e2e/dashboard/test/stubs/auth-header.stub.ts
import type { RequestHeaders } from '../../common/dashboard.type';

export const TEST_HEADERS_STUB: RequestHeaders = { Authorization: 'Bearer test-token', 'X-Test-Header': 'test-value' };
```

```ts
// e2e/dashboard/test/mocks/auth-header.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { RequestHeaders } from '../../common/dashboard.type';
import { TEST_HEADERS_STUB } from '../stubs/auth-header.stub';

export const authHeaderMock = (extra: RequestHeaders = TEST_HEADERS_STUB): RouteHandler => {
  return (route: Route): Promise<void> => {
    const headers = { ...route.request().headers(), ...extra };

    return route.continue({ headers });
  };
};
```

`RequestHeaders` is `Record<string, string>` in `common/dashboard.type.ts`.

### Modify Request Body

Check the method first; a GET on the same pattern continues untouched. The typed `postDataJSON()` result is spread with the test metadata and re-serialised.

```ts
// e2e/checkout/test/mocks/order-body.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { OrderRequest } from '../../common/checkout.type';

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

import type { RouteHandler } from '../../../common/playwright.type';
import type { Product } from '../../common/products.type';

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

`DashboardOptions` below is the options type of `DashboardPage` (`e2e/dashboard/pages/dashboard.page.ts`). A reference that needs another field adds it in prose instead of declaring the type again: it gains `time?: string` in [clock-mocking.md](clock-mocking.md) and `viewport?: ViewportSize` in [mobile-testing.md](mobile-testing.md).

```ts
// e2e/dashboard/common/dashboard.type.ts
export type DashboardStats = { readonly revenue: number; readonly users: number };

export type User = { readonly id: string; readonly name: string };

export type UserVariables = { readonly id: string };

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

export type DashboardOptions = {
  readonly dataDelayMs?: number;
  readonly graphql?: GraphQLMock[];
  readonly statusFailures?: number;
};
```

```ts
// e2e/dashboard/test/mocks/graphql.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { GraphQLMock, GraphQLRequest } from '../../common/dashboard.type';

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

### GraphQL Mocks on the Opening Call

The mock list is an option on the opening call. `DashboardPage.goto(options: DashboardOptions = {})` routes each mock it is given, then navigates: `graphql` to `graphqlMock(graphql)` on `**/graphql`, `dataDelayMs` to `slowDataMock(dataDelayMs)` on `**/api/data`, `statusFailures` to `statusRetryMock(statusFailures)` on `**/api/status`. Mock lists are stubs, so the spec reads as data plus steps, and the `WHEN` only says the dashboard is opened.

```ts
// e2e/dashboard/test/stubs/graphql.stub.ts
import type { DashboardStats, GraphQLMock, GraphQLResponse, User, UserVariables } from '../../common/dashboard.type';

const stats: DashboardStats = { revenue: 50000, users: 100 };
const statsResponse: GraphQLResponse = { data: { stats } };
const user: User = { id: '1', name: 'John' };
const userResponse: GraphQLResponse = { data: { user } };
const userVariables: UserVariables = { id: '1' };

export const STATS_MOCK_STUB: GraphQLMock = { operation: 'GetDashboardStats', response: statsResponse };

export const USER_MOCK_STUB: GraphQLMock = { operation: 'GetUser', response: userResponse, variables: userVariables };
```

```ts
// e2e/dashboard/dashboard.test.ts
import { test } from './dashboard.fixture';
import { STATS_MOCK_STUB, USER_MOCK_STUB } from './test/stubs/graphql.stub';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN mocked stats and user queries, the dashboard shows the user count', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ graphql: [STATS_MOCK_STUB, USER_MOCK_STUB] }));

    await test.step('THEN stats card shows 100 users', (): Promise<void> => dashboardPage.expectUserCount(100));
  });
});
```

### Mock GraphQL Mutations

A mutation mock reads the typed `variables.input` and echoes it back with computed fields, so the response agrees with what the UI sent. The fixed parts of the response are a stub; only `items` and `total` are derived.

```ts
// e2e/checkout/test/stubs/order.stub.ts
import type { CreatedOrder } from '../../common/checkout.type';

export const CREATED_ORDER_STUB: CreatedOrder = { id: 'order-123', items: [], status: 'PENDING', total: 0 };
```

```ts
// e2e/checkout/test/mocks/create-order.mock.ts
import type { Route } from '@playwright/test';

import type {
  CreateOrderData,
  CreateOrderVariables,
  CreatedOrder,
  GraphQLRequest,
  GraphQLResponse,
  OrderItem
} from '../../common/checkout.type';
import type { RouteHandler } from '../../../common/playwright.type';
import { CREATED_ORDER_STUB } from '../stubs/order.stub';

const addLineTotal = (sum: number, item: OrderItem): number => sum + item.price * item.quantity;

export const createOrderMock = (): RouteHandler => {
  return (route: Route): Promise<void> => {
    const body: GraphQLRequest<CreateOrderVariables> = route.request().postDataJSON();
    const isCreateOrder = body.operationName === 'CreateOrder';

    if (!isCreateOrder) return route.continue();

    const items = body.variables.input.items;
    const createOrder: CreatedOrder = { ...CREATED_ORDER_STUB, items, total: items.reduce(addLineTotal, 0) };
    const data: CreateOrderData = { createOrder };
    const json: GraphQLResponse<CreateOrderData> = { data };

    return route.fulfill({ json });
  };
};
```

`CheckoutOptions` (see [third-party.md](third-party.md#payment-mocks-on-the-opening-call)) gains `graphql?: 'createOrder'`. Given it, `CheckoutPage.goto({ graphql: 'createOrder' })` routes `createOrderMock()` on `**/graphql` before it navigates; without it nothing is routed, so a real-backend checkout spec stays unmocked. The test, `'GIVEN a mocked CreateOrder mutation, placing the order shows its number'` in `checkout.test.ts`, opens the checkout with that option in its `WHEN`, clicks `checkoutPage.placeOrder()` in an `AND` step, and asserts `checkoutPage.expectOrderNumber('order-123')` in its `THEN`.

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
// e2e/search/test/stubs/search.stub.ts
import type { SearchError, SearchResponse, SearchResult } from '../../common/search.type';

export const SEARCH_EMPTY_STUB: SearchResponse = { results: [] };

export const SEARCH_ERROR_STUB: SearchError = { error: 'Search failed' };

export const SEARCH_RESULT_STUB: SearchResult = { id: 1, title: 'Result' };
```

```ts
// e2e/search/test/mocks/search.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { SearchRequest, SearchResponse, SearchResult } from '../../common/search.type';
import { SEARCH_EMPTY_STUB, SEARCH_ERROR_STUB, SEARCH_RESULT_STUB } from '../stubs/search.stub';

export const searchMock = (): RouteHandler => {
  return (route: Route): Promise<void> => {
    const body: SearchRequest = route.request().postDataJSON();

    if (body.query === 'error') return route.fulfill({ json: SEARCH_ERROR_STUB, status: 500 });
    if (body.query === 'empty') return route.fulfill({ json: SEARCH_EMPTY_STUB });

    const match: SearchResult = { ...SEARCH_RESULT_STUB, title: `Result for: ${body.query}` };
    const json: SearchResponse = { results: [match] };

    return route.fulfill({ json });
  };
};
```

```ts
// e2e/search/search.test.ts
import { test } from './search.fixture';

test.describe('FEATURE: search', () => {
  test('GIVEN a mocked search api, searching the error query shows the failure message', async ({ searchPage }): Promise<void> => {
    await test.step('WHEN the search page is opened', (): Promise<void> => searchPage.goto());

    await test.step('AND the error query is searched', (): Promise<void> => searchPage.search('error'));

    await test.step('THEN failure message is shown', (): Promise<void> => searchPage.expectError('Search failed'));
  });
});
```

`searchPage.search(query)` fills the `Search` textbox and presses `Enter`; the `empty` and default queries are two more `test` blocks in the same `FEATURE`, sharing the start state in their titles (`'GIVEN a mocked search api, searching the empty query shows no results'`). Every test in the feature needs the same mock, so the `searchPage` fixture routes `**/api/search` to `searchMock()` before `use`; no hook and no step installs it.

### Mock Nth Request

A counter in the factory closure fails the first two calls with 503 and succeeds afterwards, which exercises the app's retry path. `failuresBeforeSuccess` is the only thing a case varies, so it is the parameter; both bodies stay stubs. `StatusError` and `StatusOk` live in `common/dashboard.type.ts`.

```ts
// e2e/dashboard/test/stubs/status.stub.ts
import type { StatusError, StatusOk } from '../../common/dashboard.type';

export const STATUS_OK_STUB: StatusOk = { status: 'ok' };

export const STATUS_UNAVAILABLE_STUB: StatusError = { error: 'Service unavailable' };
```

```ts
// e2e/dashboard/test/mocks/status-retry.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import { STATUS_OK_STUB, STATUS_UNAVAILABLE_STUB } from '../stubs/status.stub';

export const statusRetryMock = (failuresBeforeSuccess: number): RouteHandler => {
  let callCount = 0;

  return (route: Route): Promise<void> => {
    callCount += 1;

    if (callCount <= failuresBeforeSuccess) return route.fulfill({ json: STATUS_UNAVAILABLE_STUB, status: 503 });

    return route.fulfill({ json: STATUS_OK_STUB });
  };
};
```

The spec opens the dashboard with `dashboardPage.goto({ statusFailures: 2 })`, which routes `**/api/status` to `statusRetryMock(2)` first, and asserts `dashboardPage.expectConnected()`; the web-first `expect` waits through the retries.

### Mock with Delay

A delayed fulfil lets the spec assert the loading state before the data state. The delay uses `setTimeout` from `node:timers/promises`; `waitForTimeout` in the spec is not the tool for this. `DashboardData`, the `/api/data` body, joins the types in `common/dashboard.type.ts`, and `DASHBOARD_DATA_STUB` lives in `test/stubs/dashboard.stub.ts`.

```ts
// e2e/dashboard/test/mocks/slow-data.mock.ts
import { setTimeout as sleep } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { DashboardData } from '../../common/dashboard.type';
import { DASHBOARD_DATA_STUB } from '../stubs/dashboard.stub';

export const slowDataMock = (delayMs: number, data: DashboardData = DASHBOARD_DATA_STUB): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await sleep(delayMs);

    await route.fulfill({ json: data });
  };
};
```

```ts
// e2e/dashboard/dashboard-loading.test.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard loading state', () => {
  test('GIVEN a two second data response, the loader shows before the data', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ dataDelayMs: 2000 }));

    await test.step('THEN loading indicator is shown', (): Promise<void> => dashboardPage.expectLoading());

    await test.step('AND data is shown', (): Promise<void> => dashboardPage.expectData('loaded'));
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

`NetworkProfile` is `{ readonly downloadThroughput: number; readonly latency: number; readonly offline: boolean; readonly uploadThroughput: number }`. The opening call applies it: `HomeOptions` gains `network?: NetworkProfile`, and `homePage.goto({ network: SLOW_3G })` calls `throttle(this.page.context(), this.page, SLOW_3G)` before it navigates; the spec asserts `homePage.expectSkeleton()`.

### Offline Mode

Use `context.setOffline(true/false)` to simulate network connectivity changes.

> **For comprehensive offline testing patterns:**
>
> - **Network failure simulation** (error recovery, graceful degradation): See [error-testing.md](../debugging/error-testing.md#offline-testing)
> - **Offline-first/PWA testing** (service workers, caching, background sync): See [service-workers.md](../browser-apis/service-workers.md#offline-testing)

### Network Throttling Fixture

The fixture opens one CDP session, exposes `setNetworkCondition(condition)`, and resets `setOffline(false)` after `use`. A condition change after the page is open is a user-visible event, so the spec calls it in an action step: an `AND` right after the opening `WHEN`, or, after a check (`'THEN the dashboard is shown'`), a new phase, `'WHEN the network goes offline'`, followed by its own `THEN`. Offline routes through `context.setOffline`; the throttled profiles go through CDP.

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
