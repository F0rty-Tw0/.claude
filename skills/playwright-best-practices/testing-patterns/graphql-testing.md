# GraphQL Testing

## Table of Contents

1. [Patterns](#patterns)
2. [Anti-Patterns](#anti-patterns)
3. [Troubleshooting](#troubleshooting)

> **When to use**: Testing GraphQL APIs — queries, mutations, variables, and error handling.
> **See also**: [api-testing.md](api-testing.md) for the API-object shape this file builds on.

A GraphQL API object is the page object of a schema: it owns the `APIRequestContext`, the endpoint, and the operation documents, and every method posts one operation and returns the `APIResponse`. A GraphQL server answers 200 even when the operation failed, so a spec checks the status first, then `errors` and `data` through the `expect*` utils in [GraphQL Util Functions](#graphql-util-functions), which read the body inside the check. A fixture that needs a value, such as a login token, reads the envelope through `readGraphql`.

## Patterns

### Basic Query with Variables

All GraphQL requests go through `POST` to a single endpoint. The body carries `query`, `variables`, and optionally `operationName`. The envelope types are shared by every feature, so they live at the `e2e/common` root.

```ts
// e2e/common/graphql.type.ts
type GraphqlErrorExtensions = {
  readonly code: string;
};

export type GraphqlError = {
  readonly extensions?: GraphqlErrorExtensions;
  readonly message: string;
};

export type GraphqlVariables = Record<string, unknown>;

export type GraphqlRequest = {
  readonly operationName?: string;
  readonly query: string;
  readonly variables?: GraphqlVariables;
};

export type GraphqlResult<T> = {
  readonly data: T | null;
  readonly errors?: GraphqlError[];
};
```

The feature names the `data` shape of each operation it sends, so the contract lives in one file: the fixture reads `LoginData`, and the specs match partial shapes of the others.

```ts
// e2e/catalog/common/catalog.type.ts
type ItemStatus = 'DRAFT' | 'PUBLISHED';

type Review = {
  readonly id: string;
  readonly rating: number;
};

export type Item = {
  readonly id: string;
  readonly price: number;
  readonly reviews: Review[];
  readonly status: ItemStatus;
  readonly title: string;
};

export type ItemInput = {
  readonly price: number;
  readonly status: ItemStatus;
  readonly title: string;
};

export type Credentials = {
  readonly email: string;
  readonly password: string;
};

type Session = {
  readonly token: string;
};

type AdminMetrics = {
  readonly activeUsers: number;
  readonly revenue: number;
};

export type AddItemData = { readonly addItem: Item };
export type AdminDashboardData = { readonly adminMetrics: AdminMetrics | null };
export type FetchItemData = { readonly item: Item };
export type LoginData = { readonly login: Session | null };
export type UpdateItemData = { readonly updateItem: Item };
```

Operation documents are module constants next to the only class that sends them. `operation` is the single place that builds the request body, so a variable name and its document sit on the same line in every public method.

```ts
// e2e/catalog/api/graphql.api.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { GraphqlRequest, GraphqlVariables } from '../../common/graphql.type';
import type { Credentials, ItemInput } from '../common/catalog.type';

const FETCH_ITEM = 'query FetchItem($id: ID!) { item(id: $id) { id title price reviews { id rating } } }';

const ADD_ITEM = 'mutation AddItem($input: ItemInput!) { addItem(input: $input) { id title status } }';

const UPDATE_ITEM = 'mutation UpdateItem($id: ID!, $title: String!) { updateItem(id: $id, title: $title) { id title } }';

const ADMIN_DASHBOARD = 'query AdminDashboard { adminMetrics { revenue activeUsers } }';

const LOGIN = 'mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { token } }';

export class GraphqlApi {
  private readonly request: APIRequestContext;

  public constructor(request: APIRequestContext) {
    this.request = request;
  }

  public async addItem(input: ItemInput): Promise<APIResponse> {
    return this.operation(ADD_ITEM, { input });
  }

  public async adminDashboard(): Promise<APIResponse> {
    return this.operation(ADMIN_DASHBOARD);
  }

  public async fetchItem(id: string): Promise<APIResponse> {
    return this.operation(FETCH_ITEM, { id });
  }

  public async login(credentials: Credentials): Promise<APIResponse> {
    return this.operation(LOGIN, credentials);
  }

  public async updateItem(id: string, title: string): Promise<APIResponse> {
    return this.operation(UPDATE_ITEM, { id, title });
  }

  private async operation(query: string, variables?: GraphqlVariables): Promise<APIResponse> {
    const data: GraphqlRequest = { query, variables };

    return this.request.post('/graphql', { data });
  }
}
```

The spec posts the query as the `WHEN` step of every test, checks the status, then one outcome per test. `errors` is checked in its own test because a GraphQL error leaves `data` null and every later assertion would fail with a less useful message. Item 101 comes from the database seed.

```ts
// e2e/catalog/item-query.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectGraphqlData, expectNoGraphqlErrors } from '../utils/expect-graphql.util';
import { expect, test } from './catalog.fixture';

const ITEM_SHAPE = { id: '101', price: expect.any(Number), title: expect.any(String) };
const ITEM_DATA = { item: ITEM_SHAPE };
const REVIEW_SHAPE = expect.objectContaining({ id: expect.any(String), rating: expect.any(Number) });
const REVIEWED_ITEM = { reviews: expect.arrayContaining([REVIEW_SHAPE]) };
const REVIEWED_ITEM_DATA = { item: REVIEWED_ITEM };

test.describe('FEATURE: item query', () => {
  test('GIVEN seeded item 101, fetching it reports no errors', async ({ graphqlApi }): Promise<void> => {
    const response = await test.step('WHEN the FetchItem query is posted', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

    await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

    await test.step('AND errors is undefined', (): Promise<void> => expectNoGraphqlErrors(response));
  });

  test('GIVEN seeded item 101, fetching it returns its id, title and price', async ({ graphqlApi }): Promise<void> => {
    const response = await test.step('WHEN the FetchItem query is posted', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

    await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

    await test.step('AND the item matches the shape', (): Promise<void> => expectGraphqlData(response, ITEM_DATA));
  });

  test('GIVEN seeded item 101, fetching it returns reviews with an id and a rating', async ({ graphqlApi }): Promise<void> => {
    const response = await test.step('WHEN the FetchItem query is posted', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

    await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

    await test.step('AND the reviews contain shaped entries', (): Promise<void> => expectGraphqlData(response, REVIEWED_ITEM_DATA));
  });
});
```

### Mutations

A mutation is the same `POST` with a different document. The input is a typed stub so each case overrides only what it asserts on.

```ts
// e2e/catalog/test/stubs/catalog.stub.ts
import type { ItemInput } from '../../common/catalog.type';

export const ITEM_INPUT_STUB: ItemInput = {
  price: 15,
  status: 'DRAFT',
  title: 'New Widget'
};
```

```ts
// e2e/catalog/add-item.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectGraphqlData, expectNoGraphqlErrors } from '../utils/expect-graphql.util';
import { expect, test } from './catalog.fixture';
import { ITEM_INPUT_STUB } from './test/stubs/catalog.stub';

const ADDED_SHAPE = { id: expect.any(String), status: 'DRAFT', title: 'New Widget' };
const ADDED_DATA = { addItem: ADDED_SHAPE };

test.describe('FEATURE: add item mutation', () => {
  test('GIVEN a draft item, adding it returns it with an id', async ({ graphqlApi }): Promise<void> => {
    const response = await test.step('WHEN the AddItem mutation is posted', (): Promise<APIResponse> => graphqlApi.addItem(ITEM_INPUT_STUB));

    await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

    await test.step('AND no errors are reported', (): Promise<void> => expectNoGraphqlErrors(response));

    await test.step('AND the added item echoes the input with an id', (): Promise<void> => expectGraphqlData(response, ADDED_DATA));
  });
});
```

### Validation Errors

Validation failures arrive as `errors` entries with `extensions.code` set to `BAD_USER_INPUT`; the HTTP status is still 200.

```ts
// e2e/catalog/add-item-validation.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectFirstGraphqlError } from '../utils/expect-graphql.util';
import { expect, test } from './catalog.fixture';
import type { ItemInput } from './common/catalog.type';
import { ITEM_INPUT_STUB } from './test/stubs/catalog.stub';

const TITLE_MESSAGE = { message: expect.stringContaining('title') };
const BAD_USER_INPUT_CODE = { code: 'BAD_USER_INPUT' };
const BAD_USER_INPUT = { extensions: BAD_USER_INPUT_CODE };

test.describe('FEATURE: add item validation', () => {
  test('GIVEN an empty title, adding the item returns a BAD_USER_INPUT error naming the title', async ({ graphqlApi }): Promise<void> => {
    const input: ItemInput = { ...ITEM_INPUT_STUB, title: '' };

    const response = await test.step('WHEN the AddItem mutation is posted', (): Promise<APIResponse> => graphqlApi.addItem(input));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the first error message names the title', (): Promise<void> => expectFirstGraphqlError(response, TITLE_MESSAGE));

    await test.step('AND the first error code is BAD_USER_INPUT', (): Promise<void> => expectFirstGraphqlError(response, BAD_USER_INPUT));
  });
});
```

### Authorization Errors

An unauthenticated client is the built-in `request` fixture wrapped in the same API object. The protected field comes back `null` inside `data` and the error carries `UNAUTHORIZED`.

```ts
// e2e/catalog/admin-dashboard.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectFirstGraphqlError, expectGraphqlData } from '../utils/expect-graphql.util';
import { expect, test } from './catalog.fixture';

const UNAUTHORIZED_CODE = { code: 'UNAUTHORIZED' };
const UNAUTHORIZED = { extensions: UNAUTHORIZED_CODE };
const NO_METRICS = { adminMetrics: null };

test.describe('FEATURE: admin dashboard query', () => {
  test('GIVEN a client with no token, the AdminDashboard query returns an UNAUTHORIZED error', async ({ guestGraphqlApi }): Promise<void> => {
    const response = await test.step('WHEN the AdminDashboard query is posted', (): Promise<APIResponse> => guestGraphqlApi.adminDashboard());

    await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

    await test.step('AND the first error code is UNAUTHORIZED', (): Promise<void> => expectFirstGraphqlError(response, UNAUTHORIZED));

    await test.step('AND adminMetrics is null', (): Promise<void> => expectGraphqlData(response, NO_METRICS));
  });
});
```

### Authenticated GraphQL Fixture

Environment values are read once in `common/catalog.const.ts` (`API_BASE_URL`, `API_TOKEN`, `ADMIN_CREDENTIALS`), in the same shape as `admin.const.ts` in [api-testing.md](api-testing.md). `graphqlApi` carries the static token. `adminGraphqlApi` posts the `Login` mutation through a throw-away context, reads the token, and opens the authenticated context; the guard reports the status and the `errors` array when login fails. `guestGraphqlApi` wraps the built-in `request` fixture for unauthenticated cases.

```ts
// e2e/catalog/catalog.fixture.ts
import { test as base } from '@playwright/test';

import { readGraphql } from '../utils/read-graphql.util';
import { GraphqlApi } from './api/graphql.api';
import { ADMIN_CREDENTIALS, API_BASE_URL, API_TOKEN } from './common/catalog.const';
import type { LoginData } from './common/catalog.type';

type CatalogFixtures = {
  readonly adminGraphqlApi: GraphqlApi;
  readonly graphqlApi: GraphqlApi;
  readonly guestGraphqlApi: GraphqlApi;
};

const authHeaders = (token: string): Record<string, string> => {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  return headers;
};

export const test = base.extend<CatalogFixtures>({
  adminGraphqlApi: async ({ playwright }, use): Promise<void> => {
    const loginContext = await playwright.request.newContext({ baseURL: API_BASE_URL });
    const loginApi = new GraphqlApi(loginContext);
    const loginResponse = await loginApi.login(ADMIN_CREDENTIALS);
    const login = await readGraphql<LoginData>(loginResponse);
    const token = login.data?.login?.token;

    if (!token) throw new Error(`Admin login failed: status ${loginResponse.status()}, errors ${JSON.stringify(login.errors)}`);

    await loginContext.dispose();

    const extraHTTPHeaders = authHeaders(token);
    const context = await playwright.request.newContext({ baseURL: API_BASE_URL, extraHTTPHeaders });

    await use(new GraphqlApi(context));
    await context.dispose();
  },
  graphqlApi: async ({ playwright }, use): Promise<void> => {
    const extraHTTPHeaders = authHeaders(API_TOKEN);
    const context = await playwright.request.newContext({ baseURL: API_BASE_URL, extraHTTPHeaders });

    await use(new GraphqlApi(context));
    await context.dispose();
  },
  guestGraphqlApi: async ({ request }, use): Promise<void> => {
    await use(new GraphqlApi(request));
  }
});

export { expect } from '@playwright/test';
```

### GraphQL Util Functions

Each check reads the envelope itself, so no step only reads a body. They serve queries and mutations alike; a separate `gqlMutation` would only forward to them. `expectFirstGraphqlError` fails on a missing first error, so it also proves an error was reported.

```ts
// e2e/utils/expect-graphql.util.ts
import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

import type { GraphqlResult } from '../common/graphql.type';

export const expectFirstGraphqlError = async (response: APIResponse, shape: Record<string, unknown>): Promise<void> => {
  const result: GraphqlResult<unknown> = await response.json();

  expect(result.errors?.[0]).toMatchObject(shape);
};

export const expectGraphqlData = async (response: APIResponse, shape: Record<string, unknown>): Promise<void> => {
  const result: GraphqlResult<unknown> = await response.json();

  expect(result.data).toMatchObject(shape);
};

export const expectNoGraphqlErrors = async (response: APIResponse): Promise<void> => {
  const result: GraphqlResult<unknown> = await response.json();

  expect(result.errors).toBeUndefined();
};
```

A fixture reads a value through `readGraphql`, which throws with the status and raw body when the transport failed, and otherwise returns the envelope untouched so the caller decides what `errors` means.

```ts
// e2e/utils/read-graphql.util.ts
import type { APIResponse } from '@playwright/test';

import type { GraphqlResult } from '../common/graphql.type';

export const readGraphql = async <T>(response: APIResponse): Promise<GraphqlResult<T>> => {
  const isOk = response.ok();

  if (!isOk) throw new Error(`${response.status()} ${await response.text()}`);

  return response.json();
};
```

A chained flow is one phase per operation: the fetch is checked before the update runs, so an update against an item that never loaded fails at the fetch.

```ts
// e2e/catalog/update-item.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectGraphqlData, expectNoGraphqlErrors } from '../utils/expect-graphql.util';
import { expect, test } from './catalog.fixture';

const TITLED = { title: expect.any(String) };
const TITLED_ITEM_DATA = { item: TITLED };
const NEW_TITLE = { title: 'Updated Title' };
const UPDATED_DATA = { updateItem: NEW_TITLE };

test.describe('FEATURE: update item mutation', () => {
  test('GIVEN seeded item 101, updating its title echoes the new title', async ({ graphqlApi }): Promise<void> => {
    const fetchResponse = await test.step('WHEN the item is fetched', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

    await test.step('THEN the fetch status is ok', (): void => expect(fetchResponse.ok()).toBeTruthy());

    await test.step('AND the fetched item has a title', (): Promise<void> => expectGraphqlData(fetchResponse, TITLED_ITEM_DATA));

    const updateResponse = await test.step('WHEN the title is updated', (): Promise<APIResponse> => graphqlApi.updateItem('101', 'Updated Title'));

    await test.step('THEN the update status is ok', (): void => expect(updateResponse.ok()).toBeTruthy());

    await test.step('AND no errors are reported', (): Promise<void> => expectNoGraphqlErrors(updateResponse));

    await test.step('AND the title is the new title', (): Promise<void> => expectGraphqlData(updateResponse, UPDATED_DATA));
  });
});
```

## Anti-Patterns

| Don't Do This | Problem | Do This Instead |
| --- | --- | --- |
| Check only `response.ok()` | GraphQL returns 200 even on errors — `errors` array is the real signal | After the status, check `errors` and `data` with the `expect*` utils, which read the envelope |
| Ignore `errors` array | Validation and auth errors appear in `errors`, not HTTP status | One step: `expectNoGraphqlErrors(response)` |
| Hardcode query strings inline everywhere | Duplicated queries are hard to maintain | Documents are constants in the API object; specs call a named method |
| Skip variable validation | Invalid variables cause cryptic server errors | Type the input (`ItemInput`) so the compiler validates the shape |

## Troubleshooting

### GraphQL returns 200 but data is null

**Cause**: GraphQL servers return HTTP 200 even when the query has errors. The actual error is in the `errors` array.

**Fix**: Assert `errors` in its own step before any step checks `data`. The failing step then prints the full `errors` array, which is the diagnostic upstream code logged with `console.error`. The spec in [Basic Query with Variables](#basic-query-with-variables) shows the order.

### "Cannot query field X on type Y"

**Cause**: The field doesn't exist in the schema, or you're querying the wrong type.

**Fix**: Verify the schema. Use introspection or check your GraphQL IDE for available fields. An introspection call is one more API-object method.

```ts
// e2e/catalog/api/schema.api.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { GraphqlRequest } from '../../common/graphql.type';

const TYPE_FIELDS = 'query TypeFields($name: String!) { __type(name: $name) { fields { name type { name } } } }';

export class SchemaApi {
  private readonly request: APIRequestContext;

  public constructor(request: APIRequestContext) {
    this.request = request;
  }

  public async typeFields(name: string): Promise<APIResponse> {
    const variables = { name };
    const data: GraphqlRequest = { query: TYPE_FIELDS, variables };

    return this.request.post('/graphql', { data });
  }
}
```

### Variables not being applied

**Cause**: Variable names in the query don't match the `variables` object keys, or types don't match.

**Fix**: Ensure variable names match exactly (case-sensitive) and types align with the schema.

Avoid: the document declares `$itemId` but the body sends `id`.

```ts avoid
const data = {
  query: 'query GetItem($itemId: ID!) { item(id: $itemId) { id } }',
  variables: { id: '101' },
};
```

Prefer: the document and its variables sit on one line in the API object, so `fetchItem(id)` posts `FETCH_ITEM` with `{ id }` and a rename touches both together. See `GraphqlApi` in [Basic Query with Variables](#basic-query-with-variables).
