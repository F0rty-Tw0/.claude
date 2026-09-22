# GraphQL Testing

## Table of Contents

1. [Patterns](#patterns)
2. [Anti-Patterns](#anti-patterns)
3. [Troubleshooting](#troubleshooting)

> **When to use**: Testing GraphQL APIs — queries, mutations, variables, and error handling.
> **See also**: [api-testing.md](api-testing.md) for the API-object shape this file builds on.

A GraphQL API object is the page object of a schema: it owns the `APIRequestContext`, the endpoint, and the operation documents, and every method posts one operation and returns the `APIResponse`. Specs read the body through `readGraphql` ([GraphQL Helper Function](#graphql-helper-function)), which returns `data` and `errors` together because a GraphQL server answers 200 even when the operation failed.

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

The feature names the `data` shape of each operation it reads.

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

The spec posts the query as the `WHEN` step of every test and asserts one outcome per test. `errors` is checked in its own test because a GraphQL error leaves `data` null and every later assertion would fail with a less useful message.

```ts
// e2e/catalog/item-query.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import type { GraphqlResult } from '../common/graphql.type';
import { readGraphql } from '../utils/read-graphql.util';
import { expect, test } from './catalog.fixture';
import type { FetchItemData } from './common/catalog.type';

const ITEM_SHAPE = { id: '101', price: expect.any(Number), title: expect.any(String) };

const REVIEW_SHAPE = expect.objectContaining({ id: expect.any(String), rating: expect.any(Number) });

test.describe('FEATURE: item query', () => {
  test.describe('GIVEN item 101 exists', () => {
    test('SCENARIO: fetching by id reports no errors', async ({ graphqlApi }): Promise<void> => {
      const response = await test.step('WHEN the FetchItem query is posted', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

      const result = await test.step('AND the body is read', (): Promise<GraphqlResult<FetchItemData>> => readGraphql<FetchItemData>(response));

      await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

      await test.step('AND errors is undefined', (): void => expect(result.errors).toBeUndefined());
    });

    test('SCENARIO: fetching by id returns the item with id, title and price', async ({ graphqlApi }): Promise<void> => {
      const response = await test.step('WHEN the FetchItem query is posted', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

      const result = await test.step('AND the body is read', (): Promise<GraphqlResult<FetchItemData>> => readGraphql<FetchItemData>(response));

      await test.step('THEN the item matches the shape', (): void => expect(result.data?.item).toMatchObject(ITEM_SHAPE));
    });

    test('SCENARIO: fetching by id returns reviews with an id and a rating', async ({ graphqlApi }): Promise<void> => {
      const response = await test.step('WHEN the FetchItem query is posted', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

      const result = await test.step('AND the body is read', (): Promise<GraphqlResult<FetchItemData>> => readGraphql<FetchItemData>(response));

      await test.step('THEN the reviews contain shaped entries', (): void => expect(result.data?.item.reviews).toEqual(expect.arrayContaining([REVIEW_SHAPE])));
    });
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

import type { GraphqlResult } from '../common/graphql.type';
import { readGraphql } from '../utils/read-graphql.util';
import { expect, test } from './catalog.fixture';
import type { AddItemData } from './common/catalog.type';
import { ITEM_INPUT_STUB } from './test/stubs/catalog.stub';

const ADDED_SHAPE = { id: expect.any(String), status: 'DRAFT', title: 'New Widget' };

test.describe('FEATURE: add item mutation', () => {
  test('SCENARIO: adding a draft item returns it with an id', async ({ graphqlApi }): Promise<void> => {
    const response = await test.step('WHEN the AddItem mutation is posted', (): Promise<APIResponse> => graphqlApi.addItem(ITEM_INPUT_STUB));

    const result = await test.step('AND the body is read', (): Promise<GraphqlResult<AddItemData>> => readGraphql<AddItemData>(response));

    await test.step('THEN no errors are reported', (): void => expect(result.errors).toBeUndefined());

    await test.step('AND the added item echoes the input with an id', (): void => expect(result.data?.addItem).toMatchObject(ADDED_SHAPE));
  });
});
```

### Validation Errors

Validation failures arrive as `errors` entries with `extensions.code` set to `BAD_USER_INPUT`; the HTTP status is still 200.

```ts
// e2e/catalog/add-item-validation.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import type { GraphqlResult } from '../common/graphql.type';
import { readGraphql } from '../utils/read-graphql.util';
import { expect, test } from './catalog.fixture';
import type { AddItemData, ItemInput } from './common/catalog.type';
import { ITEM_INPUT_STUB } from './test/stubs/catalog.stub';

test.describe('FEATURE: add item validation', () => {
  test.describe('GIVEN an item input with an empty title', () => {
    const input: ItemInput = { ...ITEM_INPUT_STUB, title: '' };

    test('SCENARIO: posting the mutation returns a BAD_USER_INPUT error naming the title', async ({ graphqlApi }): Promise<void> => {
      const response = await test.step('WHEN the AddItem mutation is posted', (): Promise<APIResponse> => graphqlApi.addItem(input));

      const result = await test.step('AND the body is read', (): Promise<GraphqlResult<AddItemData>> => readGraphql<AddItemData>(response));

      await test.step('THEN at least one error is reported', (): void => expect(result.errors?.length).toBeGreaterThan(0));

      await test.step('AND the first error message names the title', (): void => expect(result.errors?.[0]?.message).toContain('title'));

      await test.step('AND the first error code is BAD_USER_INPUT', (): void => expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT'));
    });
  });
});
```

### Authorization Errors

An unauthenticated client is the built-in `request` fixture wrapped in the same API object. The protected field comes back `null` inside `data` and the error carries `UNAUTHORIZED`.

```ts
// e2e/catalog/admin-dashboard.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import type { GraphqlResult } from '../common/graphql.type';
import { readGraphql } from '../utils/read-graphql.util';
import { expect, test } from './catalog.fixture';
import type { AdminDashboardData } from './common/catalog.type';

test.describe('FEATURE: admin dashboard query', () => {
  test.describe('GIVEN a client with no token', () => {
    test('SCENARIO: posting the AdminDashboard query returns an UNAUTHORIZED error', async ({ guestGraphqlApi }): Promise<void> => {
      const response = await test.step('WHEN the AdminDashboard query is posted', (): Promise<APIResponse> => guestGraphqlApi.adminDashboard());

      const result = await test.step('AND the body is read', (): Promise<GraphqlResult<AdminDashboardData>> => readGraphql<AdminDashboardData>(response));

      await test.step('THEN the first error code is UNAUTHORIZED', (): void => expect(result.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED'));

      await test.step('AND adminMetrics is null', (): void => expect(result.data?.adminMetrics).toBeNull());
    });
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

### GraphQL Helper Function

One reader serves queries and mutations alike; a separate `gqlMutation` would only forward to it. `readGraphql` throws with the status and raw body when the transport failed, and otherwise returns the envelope untouched so the spec decides what `errors` means for the case.

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

A chained flow reads one operation, then posts the next with a value from the first.

```ts
// e2e/catalog/update-item.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import type { GraphqlResult } from '../common/graphql.type';
import { readGraphql } from '../utils/read-graphql.util';
import { expect, test } from './catalog.fixture';
import type { FetchItemData, UpdateItemData } from './common/catalog.type';

test.describe('FEATURE: update item mutation', () => {
  test.describe('GIVEN item 101 exists', () => {
    test('SCENARIO: updating the title echoes the new title', async ({ graphqlApi }): Promise<void> => {
      const fetchResponse = await test.step('GIVEN item 101 is fetched', (): Promise<APIResponse> => graphqlApi.fetchItem('101'));

      const fetched = await test.step('AND the fetched item is read', (): Promise<GraphqlResult<FetchItemData>> => readGraphql<FetchItemData>(fetchResponse));

      await test.step('AND the fetched item has a title', (): void => expect(fetched.data?.item.title).toBeDefined());

      const updateResponse = await test.step('WHEN the title is updated', (): Promise<APIResponse> => graphqlApi.updateItem('101', 'Updated Title'));

      const updated = await test.step('AND the updated item is read', (): Promise<GraphqlResult<UpdateItemData>> => readGraphql<UpdateItemData>(updateResponse));

      await test.step('THEN no errors are reported', (): void => expect(updated.errors).toBeUndefined());

      await test.step('AND the title is updated', (): void => expect(updated.data?.updateItem.title).toBe('Updated Title'));
    });
  });
});
```

## Anti-Patterns

| Don't Do This | Problem | Do This Instead |
| --- | --- | --- |
| Check only `response.ok()` | GraphQL returns 200 even on errors — `errors` array is the real signal | Read the envelope with `readGraphql` and assert both `data` and `errors` |
| Ignore `errors` array | Validation and auth errors appear in `errors`, not HTTP status | One step: `expect(result.errors).toBeUndefined()` |
| Hardcode query strings inline everywhere | Duplicated queries are hard to maintain | Documents are constants in the API object; specs call a named method |
| Skip variable validation | Invalid variables cause cryptic server errors | Type the input (`ItemInput`) so the compiler validates the shape |

## Troubleshooting

### GraphQL returns 200 but data is null

**Cause**: GraphQL servers return HTTP 200 even when the query has errors. The actual error is in the `errors` array.

**Fix**: Assert `errors` in its own step before any step reads `data`. The failing step then prints the full `errors` array, which is the diagnostic upstream code logged with `console.error`. The spec in [Basic Query with Variables](#basic-query-with-variables) shows the order.

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
