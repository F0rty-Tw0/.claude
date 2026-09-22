# API Testing

## Table of Contents

1. [Patterns](#patterns)
2. [Decision Guide](#decision-guide)
3. [Anti-Patterns](#anti-patterns)
4. [Troubleshooting](#troubleshooting)

> **When to use**: Testing REST APIs directly — validating endpoints, seeding test data, or verifying backend behavior without browser overhead.
> **See also**: [graphql-testing.md](graphql-testing.md) for GraphQL-specific patterns.

An API object is the page object of an endpoint group: it owns the `APIRequestContext` and the paths, lives in `e2e/<feature>/api/<name>.api.ts`, and every method returns the `APIResponse`. Specs read the body in a step through `readJson`, so status checks stay in the spec where they are asserted.

```ts
// e2e/utils/read-json.util.ts
import type { APIResponse } from '@playwright/test';

export const readJson = async <T>(response: APIResponse): Promise<T> => {
  const isOk = response.ok();

  if (!isOk) throw new Error(`${response.status()} ${await response.text()}`);

  return response.json();
};
```

The guard prints the real body when the status is not 2xx, which is the answer to most "body is not valid JSON" failures.

## Patterns

### Request Fixtures for Authenticated Clients

**Use when**: Multiple tests need an authenticated API client with shared configuration.
**Avoid when**: A single test makes one-off API calls — use the built-in `request` fixture directly.

Environment values are read once in `common/admin.const.ts` and imported as plain values; the fixture never touches `process.env`.

```ts
// e2e/admin/common/admin.const.ts
import type { Credentials } from './admin.type';

export const API_BASE_URL = 'https://api.myapp.io';

export const API_TOKEN = process.env.API_TOKEN ?? '';

export const ADMIN_CREDENTIALS: Credentials = {
  email: process.env.ADMIN_EMAIL ?? '',
  password: process.env.ADMIN_PASSWORD ?? ''
};
```

`authApi` carries a static token. `adminApi` logs in first, reads the session token, disposes the login context, and opens the authenticated one. Both dispose after `use`.

```ts
// e2e/admin/admin.fixture.ts
import type { APIRequestContext } from '@playwright/test';
import { test as base } from '@playwright/test';

import { readJson } from '../utils/read-json.util';
import { ADMIN_CREDENTIALS, API_BASE_URL, API_TOKEN } from './common/admin.const';
import type { Session } from './common/admin.type';

type AdminFixtures = {
  readonly adminApi: APIRequestContext;
  readonly authApi: APIRequestContext;
};

const authHeaders = (token: string): Record<string, string> => {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

  return headers;
};

export const test = base.extend<AdminFixtures>({
  adminApi: async ({ playwright }, use): Promise<void> => {
    const loginContext = await playwright.request.newContext({ baseURL: API_BASE_URL });
    const loginResponse = await loginContext.post('/auth/login', { data: ADMIN_CREDENTIALS });
    const session = await readJson<Session>(loginResponse);

    await loginContext.dispose();

    const extraHTTPHeaders = authHeaders(session.token);
    const context = await playwright.request.newContext({ baseURL: API_BASE_URL, extraHTTPHeaders });

    await use(context);
    await context.dispose();
  },
  authApi: async ({ playwright }, use): Promise<void> => {
    const extraHTTPHeaders = authHeaders(API_TOKEN);
    const context = await playwright.request.newContext({ baseURL: API_BASE_URL, extraHTTPHeaders });

    await use(context);
    await context.dispose();
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/admin/accounts.api.spec.ts
import type { APIResponse } from '@playwright/test';

import { readJson } from '../utils/read-json.util';
import { expect, test } from './admin.fixture';
import type { AccountList } from './common/admin.type';

test.describe('FEATURE: admin accounts api', () => {
  test('listing accounts as admin returns at least one account', async ({ adminApi }): Promise<void> => {
    const response = await test.step('WHEN accounts are listed as admin', (): Promise<APIResponse> => adminApi.get('/admin/accounts'));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    const body = await test.step('AND the body is read', (): Promise<AccountList> => readJson<AccountList>(response));

    await test.step('AND accounts are present', (): void => expect(body.accounts.length).toBeGreaterThan(0));
  });
});
```

### CRUD Operations

**Use when**: Making HTTP requests — GET, POST, PUT, PATCH, DELETE with headers, query params, and bodies.
**Avoid when**: You need to test browser-rendered responses (redirects, cookies with `HttpOnly`).

The feature's types name every body the API object sends or the spec reads.

```ts
// e2e/items/common/items.type.ts
export type NewItem = {
  readonly category: string;
  readonly price: number;
  readonly title: string;
};

export type Item = {
  readonly category: string;
  readonly id: number;
  readonly price: number;
  readonly title: string;
};

export type ItemPatch = Partial<NewItem>;

export type ItemQuery = {
  readonly category: string;
  readonly limit: number;
  readonly page: number;
};

export type ValidationIssue = {
  readonly field: string;
  readonly message: string;
};

export type ValidationError = {
  readonly details: ValidationIssue[];
  readonly error: string;
};
```

```ts
// e2e/items/api/items.api.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { Item, ItemPatch, ItemQuery, NewItem } from '../common/items.type';

export class ItemsApi {
  private readonly request: APIRequestContext;

  public constructor(request: APIRequestContext) {
    this.request = request;
  }

  public async list(params: ItemQuery): Promise<APIResponse> {
    return this.request.get('/api/items', { params });
  }

  public async create(item: NewItem): Promise<APIResponse> {
    return this.request.post('/api/items', { data: item });
  }

  public async get(id: number): Promise<APIResponse> {
    return this.request.get(`/api/items/${id}`);
  }

  public async replace(id: number, item: NewItem): Promise<APIResponse> {
    return this.request.put(`/api/items/${id}`, { data: item });
  }

  public async update(id: number, patch: ItemPatch): Promise<APIResponse> {
    return this.request.patch(`/api/items/${id}`, { data: patch });
  }

  public async remove(id: number): Promise<APIResponse> {
    return this.request.delete(`/api/items/${id}`);
  }
}
```

| Request option | Sends | Example |
|---|---|---|
| `params` | Query string | `{ params: { page: 1, limit: 10, category: 'tools' } }` |
| `data` | JSON body | `{ data: item }` |
| `form` | `application/x-www-form-urlencoded` body | `post('/oauth/token', { form: { grant_type: 'client_credentials', client_id: 'my-client', client_secret: 'secret-value' } })` |
| `multipart` | `multipart/form-data` body | See [File Upload via API](#file-upload-via-api) |
| `headers` | Per-request headers | `{ headers: { Authorization: '' } }` |

The spec creates its item in a `GIVEN` `beforeEach`, deletes it in `afterEach`, and asserts one outcome per test. `remove` returns the response instead of throwing, so the `afterEach` delete is safe after the delete test.

```ts
// e2e/items/items.api.spec.ts
import type { APIResponse } from '@playwright/test';

import { readJson } from '../utils/read-json.util';
import type { Item, NewItem } from './common/items.type';
import { expect, test } from './items.fixture';
import { ITEM_STUB } from './test/stubs/items.stub';

test.describe('FEATURE: items api', () => {
  test.describe('GIVEN a created item', () => {
    let item: Item;

    test.beforeEach(async ({ itemsApi }): Promise<void> => {
      const response = await test.step('GIVEN the item is created', (): Promise<APIResponse> => itemsApi.create(ITEM_STUB));

      item = await test.step('AND the created item is read', (): Promise<Item> => readJson<Item>(response));
    });

    test.afterEach(async ({ itemsApi }): Promise<void> => {
      await test.step('AND the item is deleted', (): Promise<APIResponse> => itemsApi.remove(item.id));
    });

    test('patching the price returns the new price', async ({ itemsApi }): Promise<void> => {
      const response = await test.step('WHEN the price is patched', (): Promise<APIResponse> => itemsApi.update(item.id, { price: 22.5 }));

      const patched = await test.step('AND the patched item is read', (): Promise<Item> => readJson<Item>(response));

      await test.step('THEN the price is updated', (): void => expect(patched.price).toBe(22.5));
    });

    test('replacing the item succeeds', async ({ itemsApi }): Promise<void> => {
      const replacement: NewItem = { ...ITEM_STUB, price: 24.99, title: 'Claw Hammer' };

      const response = await test.step('WHEN the item is replaced', (): Promise<APIResponse> => itemsApi.replace(item.id, replacement));

      await test.step('THEN the response is ok', (): void => expect(response.ok()).toBeTruthy());
    });

    test('deleting the item makes a later read return 404', async ({ itemsApi }): Promise<void> => {
      const deleted = await test.step('WHEN the item is deleted', (): Promise<APIResponse> => itemsApi.remove(item.id));

      await test.step('THEN the delete returns 204', (): void => expect(deleted.status()).toBe(204));

      const read = await test.step('AND the deleted item is read', (): Promise<APIResponse> => itemsApi.get(item.id));

      await test.step('AND the read returns 404', (): void => expect(read.status()).toBe(404));
    });
  });
});
```

### Dedicated API Project Configuration

**Use when**: Writing dedicated API test suites that do not need a browser.

API specs are named `*.api.spec.ts` and matched by project; `testDir` per project works the same way when API specs live in their own tree.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const apiHeaders = { Accept: 'application/json' };

const apiUse = { baseURL: 'https://api.myapp.io', extraHTTPHeaders: apiHeaders };

const e2eUse = { baseURL: 'https://myapp.io', browserName: 'chromium' } as const;

const projects = [
  { name: 'api', testMatch: /.*\.api\.spec\.ts/, use: apiUse },
  { name: 'e2e', testIgnore: /.*\.api\.spec\.ts/, use: e2eUse }
];

export default defineConfig({ projects });
```

### Response Assertions

**Use when**: Validating response status, headers, and body structure.
**Avoid when**: Never skip these — every API test should assert on status and body.

Status first, then headers, then body. Matcher shapes are module-level consts so each test is one step per assertion.

```ts
// e2e/items/item-shape.api.spec.ts
import type { APIResponse } from '@playwright/test';

import { readJson } from '../utils/read-json.util';
import type { Item } from './common/items.type';
import { expect, test } from './items.fixture';

const KNOWN_FIELDS = { id: 101, status: expect.stringMatching(/^(active|inactive|archived)$/), title: 'Widget' };

const FIELD_TYPES = { createdAt: expect.any(String), id: expect.any(Number), tags: expect.any(Array), title: expect.any(String) };

const METADATA_SHAPE = { rating: expect.any(Number), views: expect.any(Number) };

test.describe('FEATURE: item response shape', () => {
  test.describe('GIVEN item 101 exists', () => {
    test('fetching the item returns 200', async ({ itemsApi }): Promise<void> => {
      const response = await test.step('WHEN item 101 is fetched', (): Promise<APIResponse> => itemsApi.get(101));

      await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));
    });

    test('fetching the item names json and a cache policy in the headers', async ({ itemsApi }): Promise<void> => {
      const response = await test.step('WHEN item 101 is fetched', (): Promise<APIResponse> => itemsApi.get(101));

      await test.step('THEN the content type is json', (): void => expect(response.headers()['content-type']).toContain('application/json'));

      await test.step('AND cache control sets a max age', (): void => expect(response.headers()['cache-control']).toMatch(/max-age=\d+/));
    });

    test('fetching the item matches known fields and every field type', async ({ itemsApi }): Promise<void> => {
      const response = await test.step('WHEN item 101 is fetched', (): Promise<APIResponse> => itemsApi.get(101));

      const item = await test.step('AND the body is read', (): Promise<Item> => readJson<Item>(response));

      await test.step('THEN the known fields match', (): void => expect(item).toMatchObject(KNOWN_FIELDS));

      await test.step('AND the field types match', (): void => expect(item).toMatchObject(FIELD_TYPES));

      await test.step('AND the metadata has views and rating', (): void => expect(item.metadata).toMatchObject(METADATA_SHAPE));
    });

    test('fetching the item tags it featured and not deprecated', async ({ itemsApi }): Promise<void> => {
      const response = await test.step('WHEN item 101 is fetched', (): Promise<APIResponse> => itemsApi.get(101));

      const item = await test.step('AND the body is read', (): Promise<Item> => readJson<Item>(response));

      await test.step('THEN the featured tag is present', (): void => expect(item.tags).toEqual(expect.arrayContaining(['featured'])));

      await test.step('AND the deprecated tag is absent', (): void => expect(item.tags).not.toContain('deprecated'));
    });

    test('fetching the item returns an ISO createdAt', async ({ itemsApi }): Promise<void> => {
      const response = await test.step('WHEN item 101 is fetched', (): Promise<APIResponse> => itemsApi.get(101));

      const item = await test.step('AND the body is read', (): Promise<Item> => readJson<Item>(response));

      await test.step('THEN createdAt round-trips through Date', (): void => expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt));
    });
  });
});
```

| Matcher | Checks |
|---|---|
| `expect(item).toMatchObject(shape)` | Partial match; extra fields ignored. |
| `expect.any(Number)` | Type only. |
| `expect.stringMatching(/regex/)` | String against a pattern. |
| `expect.arrayContaining([...])` | Array holds these members in any order. |
| `expect.objectContaining({...})` | Member of an array or nested value matches partially. |
| `expect(list.pagination).toEqual({ page: 1, limit: 10, total: expect.any(Number), totalPages: expect.any(Number) })` | Exact keys, typed values. |

For a list body, assert `toHaveLength(10)` in one step and pass `body.items` to a `test/utils/items-shape.spec.util.ts` function that loops `toMatchObject(FIELD_TYPES)` in the next.

### API Data Seeding

**Use when**: E2E tests need specific data to exist before running. API seeding is 10-100x faster than UI-based setup.
**Avoid when**: The test specifically validates the creation flow through the UI.

Unique values come from a builder util, never from a stub.

```ts
// e2e/workspace/test/utils/workspace-builder.spec.util.ts
export const uniqueEmail = (): string => `account-${Date.now()}@test.io`;

export const uniqueWorkspaceName = (): string => `Workspace ${Date.now()}`;
```

Each seed fixture creates through `request`, hands the typed value to `use`, and deletes after. `seedWorkspace` depends on `seedAccount`, so Playwright orders setup and teardown.

```ts
// e2e/workspace/workspace.fixture.ts
import { test as base } from '@playwright/test';

import { readJson } from '../utils/read-json.util';
import type { Account, SeededAccount, SeededWorkspace } from './common/workspace.type';
import { DashboardPage } from './pages/dashboard.page';
import { LoginPage } from './pages/login.page';
import { uniqueEmail, uniqueWorkspaceName } from './test/utils/workspace-builder.spec.util';

type WorkspaceFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly loginPage: LoginPage;
  readonly seedAccount: SeededAccount;
  readonly seedWorkspace: SeededWorkspace;
};

const PASSWORD = 'SecurePass123!';

export const test = base.extend<WorkspaceFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  loginPage: async ({ page }, use): Promise<void> => {
    await use(new LoginPage(page));
  },
  seedAccount: async ({ request }, use): Promise<void> => {
    const data = { email: uniqueEmail(), name: 'Test Account', password: PASSWORD };
    const response = await request.post('/api/accounts', { data });
    const created = await readJson<Account>(response);
    const seeded: SeededAccount = { ...created, password: PASSWORD };

    await use(seeded);
    await request.delete(`/api/accounts/${created.id}`);
  },
  seedWorkspace: async ({ request, seedAccount }, use): Promise<void> => {
    const data = { name: uniqueWorkspaceName(), ownerId: seedAccount.id };
    const response = await request.post('/api/workspaces', { data });
    const workspace = await readJson<SeededWorkspace>(response);

    await use(workspace);
    await request.delete(`/api/workspaces/${workspace.id}`);
  }
});

export { expect } from '@playwright/test';
```

`LoginPage` is the one from `core/house-style.md`; `DashboardPage.expectWorkspace(name)` is a boxed step over `page.getByRole('heading', { name })`.

```ts
// e2e/workspace/workspace-dashboard.spec.ts
import { expect, test } from './workspace.fixture';

test.describe('FEATURE: workspace dashboard', () => {
  test('signing in as the seeded account lists the seeded workspace', async ({ dashboardPage, loginPage, page, seedAccount, seedWorkspace }): Promise<void> => {
    await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());

    await test.step('WHEN the seeded account signs in', (): Promise<void> => loginPage.submit(seedAccount));

    await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));

    await test.step('AND the seeded workspace heading is visible', (): Promise<void> => dashboardPage.expectWorkspace(seedWorkspace.name));
  });
});
```

The same seed-then-observe shape covers "API + E2E hybrid" flows: create through the API object, open the page, assert through the page object, delete in teardown.

### Error Response Testing

**Use when**: Every API has error paths — test them. A missing 401 test today is a security hole tomorrow.

One spec per feature holds the error cases. The 400 case reads the body; the 429 case bursts requests through an API-object method and filters in a step.

```ts
// e2e/search/api/search.api.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';

const SEARCH_PARAMS = { q: 'test' };

export class SearchApi {
  private readonly request: APIRequestContext;

  public constructor(request: APIRequestContext) {
    this.request = request;
  }

  public async burst(count: number): Promise<APIResponse[]> {
    const requests = Array.from({ length: count }, (): Promise<APIResponse> => this.request.get('/api/search', { params: SEARCH_PARAMS }));

    return Promise.all(requests);
  }
}
```

```ts
// e2e/items/items-errors.api.spec.ts
import type { APIResponse } from '@playwright/test';

import type { NewItem, ValidationError } from './common/items.type';
import { expect, test } from './items.fixture';

const INVALID_ITEM: NewItem = { category: 'tools', price: -5, title: '' };

const TITLE_ISSUE = expect.objectContaining({ field: 'title', message: expect.any(String) });

const PRICE_ISSUE = expect.objectContaining({ field: 'price', message: expect.any(String) });

test.describe('FEATURE: items api error responses', () => {
  test('posting an invalid item returns 400 with one issue per field', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN an invalid item is posted', (): Promise<APIResponse> => itemsApi.create(INVALID_ITEM));

    await test.step('THEN the status is 400', (): void => expect(response.status()).toBe(400));

    const body = await test.step('AND the body is read', (): Promise<ValidationError> => response.json());

    await test.step('AND the error names a validation error', (): void => expect(body.error).toBe('Validation Error'));

    await test.step('AND the details cover title and price', (): void => expect(body.details).toEqual(expect.arrayContaining([TITLE_ISSUE, PRICE_ISSUE])));
  });

  test('fifty searches at once get rate limited with retry-after', async ({ searchApi }): Promise<void> => {
    const responses = await test.step('WHEN fifty searches are sent', (): Promise<APIResponse[]> => searchApi.burst(50));

    const rateLimited = await test.step('AND the 429 responses are collected', (): APIResponse[] => responses.filter((response: APIResponse): boolean => response.status() === 429));

    await test.step('THEN at least one request was rate limited', (): void => expect(rateLimited.length).toBeGreaterThan(0));

    await test.step('AND the retry-after header is set', (): void => expect(rateLimited[0]?.headers()['retry-after']).toBeDefined());
  });
});
```

| Status | Request | Assert |
|---|---|---|
| 401 | `get('/api/protected/resource', { headers: { Authorization: '' } })` | `expect(body.error).toMatch(/unauthorized\|unauthenticated/i)` |
| 403 | `delete('/api/admin/items/1')` as a non-admin | `expect(body.error).toMatch(/forbidden\|insufficient permissions/i)` |
| 404 | `get('/api/items/999999')` | `expect(body).toMatchObject({ error: expect.stringMatching(/not found/i) })` |
| 409 | `post('/api/items', { data: { title: 'Duplicate', sku } })` after one with the same `sku` | `expect(response.status()).toBe(409)` |
| 422 | `post('/api/orders', { data: { items: [] } })` | `expect(body.error).toContain('at least one item')` |

### File Upload via API

**Use when**: Testing file upload endpoints with multipart form data.
**Avoid when**: You need to test the browser file picker dialog — use `page.setInputFiles()` instead.

`common/documents.type.ts` declares `UploadFile` (`buffer`, `mimeType`, `name`), `UploadMeta` (`category`, `description`), and `UploadedDocument`. The on-disk file lives in `test/fixtures/`.

```ts
// e2e/documents/api/documents.api.ts
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { UploadFile, UploadMeta } from '../common/documents.type';

export class DocumentsApi {
  private readonly request: APIRequestContext;

  public constructor(request: APIRequestContext) {
    this.request = request;
  }

  public async uploadFile(path: string, mimeType: string, meta: UploadMeta): Promise<APIResponse> {
    const file: UploadFile = { buffer: readFileSync(path), mimeType, name: basename(path) };

    return this.uploadBuffer(file, meta);
  }

  public async uploadBuffer(file: UploadFile, meta: UploadMeta): Promise<APIResponse> {
    const multipart = { ...meta, file };

    return this.request.post('/api/documents/upload', { multipart });
  }
}
```

```ts
// e2e/documents/upload.api.spec.ts
import { resolve } from 'node:path';

import type { APIResponse } from '@playwright/test';

import { readJson } from '../utils/read-json.util';
import type { UploadFile, UploadMeta, UploadedDocument } from './common/documents.type';
import { expect, test } from './documents.fixture';

const REPORT_PATH = resolve('e2e/documents/test/fixtures/report.pdf');

const REPORT_META: UploadMeta = { category: 'reports', description: 'Monthly report' };

const UPLOADED_SHAPE = { filename: 'report.pdf', id: expect.any(String), mimeType: 'application/pdf', size: expect.any(Number), url: expect.stringMatching(/^https:\/\//) };

const ELEVEN_MB = 11 * 1024 * 1024;

const OVERSIZED: UploadFile = { buffer: Buffer.alloc(ELEVEN_MB), mimeType: 'application/octet-stream', name: 'large-file.bin' };

test.describe('FEATURE: document upload api', () => {
  test('uploading a pdf as multipart returns 201 describing the stored file', async ({ documentsApi }): Promise<void> => {
    const response = await test.step('WHEN the report is uploaded', (): Promise<APIResponse> => documentsApi.uploadFile(REPORT_PATH, 'application/pdf', REPORT_META));

    await test.step('THEN the status is 201', (): void => expect(response.status()).toBe(201));

    const body = await test.step('AND the body is read', (): Promise<UploadedDocument> => readJson<UploadedDocument>(response));

    await test.step('AND the body describes the stored file', (): void => expect(body).toMatchObject(UPLOADED_SHAPE));
  });

  test('uploading an eleven megabyte file returns 413', async ({ documentsApi }): Promise<void> => {
    const response = await test.step('WHEN an oversized file is uploaded', (): Promise<APIResponse> => documentsApi.uploadBuffer(OVERSIZED, REPORT_META));

    await test.step('THEN the status is 413', (): void => expect(response.status()).toBe(413));
  });
});
```

### Chained API Calls

**Use when**: Testing multi-step workflows — create, read, update, delete sequences; order flows; state machine transitions.
**Avoid when**: You can test each endpoint in isolation and the interactions are trivial.

A chain is a Gherkin tree: the `GIVEN` `beforeEach` performs the arrange links and stores the typed body in a `let`; each `test` performs the action links as `WHEN` / `AND` steps and asserts one outcome; `afterEach` deletes what was created.

```ts
// e2e/orders/api/shop.api.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { CartLine, NewProduct, ShippingAddress } from '../common/orders.type';

export class ShopApi {
  private readonly request: APIRequestContext;

  public constructor(request: APIRequestContext) {
    this.request = request;
  }

  public async createProduct(product: NewProduct): Promise<APIResponse> {
    return this.request.post('/api/products', { data: product });
  }

  public async createCart(items: CartLine[]): Promise<APIResponse> {
    const data = { items };

    return this.request.post('/api/carts', { data });
  }

  public async checkout(cartId: number, shippingAddress: ShippingAddress): Promise<APIResponse> {
    const data = { cartId, shippingAddress };

    return this.request.post('/api/orders', { data });
  }

  public async listOrders(): Promise<APIResponse> {
    return this.request.get('/api/orders');
  }

  public async product(id: number): Promise<APIResponse> {
    return this.request.get(`/api/products/${id}`);
  }

  public async deleteOrder(id: number): Promise<APIResponse> {
    return this.request.delete(`/api/orders/${id}`);
  }

  public async deleteProduct(id: number): Promise<APIResponse> {
    return this.request.delete(`/api/products/${id}`);
  }
}
```

```ts
// e2e/orders/checkout.api.spec.ts
import type { APIResponse } from '@playwright/test';

import { readJson } from '../utils/read-json.util';
import type { Cart, CartLine, Order, OrderList, Product } from './common/orders.type';
import { expect, test } from './orders.fixture';
import { ADDRESS_STUB, PRODUCT_STUB } from './test/stubs/orders.stub';

test.describe('FEATURE: checkout api', () => {
  test.describe('GIVEN a product with stock 50 in a cart of three', () => {
    let lines: CartLine[];
    let order: Order;
    let product: Product;

    test.beforeEach(async ({ shopApi }): Promise<void> => {
      const response = await test.step('GIVEN the product is created', (): Promise<APIResponse> => shopApi.createProduct(PRODUCT_STUB));

      product = await test.step('AND the product is read', (): Promise<Product> => readJson<Product>(response));
      lines = [{ productId: product.id, quantity: 3 }];
    });

    test.afterEach(async ({ shopApi }): Promise<void> => {
      await test.step('AND the order is deleted', (): Promise<APIResponse> => shopApi.deleteOrder(order.id));

      await test.step('AND the product is deleted', (): Promise<APIResponse> => shopApi.deleteProduct(product.id));
    });

    test('checking out the cart totals three times the price', async ({ shopApi }): Promise<void> => {
      const cartResponse = await test.step('WHEN the cart is created', (): Promise<APIResponse> => shopApi.createCart(lines));

      const cart = await test.step('AND the cart is read', (): Promise<Cart> => readJson<Cart>(cartResponse));

      const orderResponse = await test.step('AND the cart is checked out', (): Promise<APIResponse> => shopApi.checkout(cart.id, ADDRESS_STUB));

      order = await test.step('AND the order is read', (): Promise<Order> => readJson<Order>(orderResponse));

      await test.step('THEN the cart total is 149.97', (): void => expect(cart.total).toBe(149.97));
    });

    test('checking out the cart creates a pending order with one line', async ({ shopApi }): Promise<void> => {
      const cartResponse = await test.step('WHEN the cart is created', (): Promise<APIResponse> => shopApi.createCart(lines));

      const cart = await test.step('AND the cart is read', (): Promise<Cart> => readJson<Cart>(cartResponse));

      const orderResponse = await test.step('AND the cart is checked out', (): Promise<APIResponse> => shopApi.checkout(cart.id, ADDRESS_STUB));

      order = await test.step('AND the order is read', (): Promise<Order> => readJson<Order>(orderResponse));

      await test.step('THEN the order status is pending', (): void => expect(order.status).toBe('pending'));

      await test.step('AND the order has one line', (): void => expect(order.items).toHaveLength(1));
    });

    test('checking out the cart lists the order', async ({ shopApi }): Promise<void> => {
      const cartResponse = await test.step('WHEN the cart is created', (): Promise<APIResponse> => shopApi.createCart(lines));

      const cart = await test.step('AND the cart is read', (): Promise<Cart> => readJson<Cart>(cartResponse));

      const orderResponse = await test.step('AND the cart is checked out', (): Promise<APIResponse> => shopApi.checkout(cart.id, ADDRESS_STUB));

      order = await test.step('AND the order is read', (): Promise<Order> => readJson<Order>(orderResponse));

      const response = await test.step('AND the orders are listed', (): Promise<APIResponse> => shopApi.listOrders());

      const list = await test.step('AND the list is read', (): Promise<OrderList> => readJson<OrderList>(response));

      await test.step('THEN the list contains the order', (): void => expect(list.items.map((entry: Order): number => entry.id)).toContain(order.id));
    });

    test('checking out the cart drops the product stock to 47', async ({ shopApi }): Promise<void> => {
      const cartResponse = await test.step('WHEN the cart is created', (): Promise<APIResponse> => shopApi.createCart(lines));

      const cart = await test.step('AND the cart is read', (): Promise<Cart> => readJson<Cart>(cartResponse));

      const orderResponse = await test.step('AND the cart is checked out', (): Promise<APIResponse> => shopApi.checkout(cart.id, ADDRESS_STUB));

      order = await test.step('AND the order is read', (): Promise<Order> => readJson<Order>(orderResponse));

      const response = await test.step('AND the product is fetched', (): Promise<APIResponse> => shopApi.product(product.id));

      const updated = await test.step('AND the product is read', (): Promise<Product> => readJson<Product>(response));

      await test.step('THEN the stock dropped by three', (): void => expect(updated.stock).toBe(47));
    });
  });
});
```

A state machine is the same tree with one `GIVEN` per starting state and one `WHEN` step per transition. For an article publish workflow through `patch('/api/articles/:id/status', { data: { status } })`:

| GIVEN | WHEN status is set to | THEN |
|---|---|---|
| a draft article | `in_review` | response ok, body status `in_review` |
| an article in review | `published` | response ok, body status `published` |
| a published article | `draft` | status 422; publish is not reversible |

### Schema Validation with Zod

**Use when**: Verifying API responses match a contract — field types, required fields, value constraints.
**Avoid when**: You only need to check one or two specific fields — use `toMatchObject` instead.

Schemas are constants; nested `z.object` values are named so the tree reads top-down.

```ts
// e2e/items/common/item-schema.const.ts
import { z } from 'zod';

const METADATA_SCHEMA = z.object({
  rating: z.number().min(0).max(5).nullable(),
  views: z.number().int().nonnegative()
});

export const ITEM_SCHEMA = z.object({
  createdAt: z.string().datetime(),
  id: z.number().positive(),
  metadata: METADATA_SCHEMA,
  price: z.number().nonnegative(),
  status: z.enum(['active', 'inactive', 'archived']),
  title: z.string().min(1)
});

const PAGINATION_SCHEMA = z.object({
  limit: z.number().int().positive(),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative()
});

export const PAGINATED_ITEMS_SCHEMA = z.object({
  items: z.array(ITEM_SCHEMA),
  pagination: PAGINATION_SCHEMA
});
```

`parse` throws a `ZodError` whose message lists every issue with its path, so `not.toThrow()` reports the full diff without a hand-written formatter.

```ts
// e2e/items/items-schema.api.spec.ts
import type { APIResponse } from '@playwright/test';

import { PAGINATED_ITEMS_SCHEMA } from './common/item-schema.const';
import type { ItemQuery } from './common/items.type';
import { expect, test } from './items.fixture';

const LIST_QUERY: ItemQuery = { category: 'tools', limit: 10, page: 1 };

test.describe('FEATURE: items api contract', () => {
  test('fetching the item list matches the paginated items schema', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the item list is fetched', (): Promise<APIResponse> => itemsApi.list(LIST_QUERY));

    await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

    const body = await test.step('AND the body is read', (): Promise<unknown> => response.json());

    await test.step('AND the body matches the schema', (): void => expect((): unknown => PAGINATED_ITEMS_SCHEMA.parse(body)).not.toThrow());
  });
});
```

## Decision Guide

| Scenario                                         | Use API Tests               | Use E2E Tests                  | Why                                                                |
| ------------------------------------------------ | --------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| Validate response status/body/headers            | Yes                         | No                             | No browser needed; 10-100x faster                                  |
| Test business logic (calculations, rules)        | Yes                         | No                             | API tests isolate backend logic from UI                            |
| Verify form submission creates correct data      | Seed via API, submit via UI | Yes                            | UI test validates the form; API check confirms persistence         |
| Test error messages shown to user                | No                          | Yes                            | Error rendering is a UI concern                                    |
| Validate pagination, filtering, sorting          | Yes                         | Maybe both                     | API test for correctness; E2E test only if the UI logic is complex |
| Seed test data for E2E tests                     | Yes (fixture)               | No                             | API seeding is fast and reliable                                   |
| Test auth flows (login/logout/RBAC)              | Yes for token/session logic | Yes for UI flow                | Both matter: API protects resources, UI guides users               |
| Verify file upload processing                    | Yes                         | Only if testing file picker UI | API test validates backend processing                              |
| Contract/schema regression testing               | Yes                         | No                             | Schema tests run in milliseconds                                   |
| Test third-party webhook handling                | Yes                         | No                             | Webhooks are API-to-API; no UI involved                            |
| Verify redirect behavior after action            | No                          | Yes                            | Redirects are browser/navigation concerns                          |
| Test real-time updates (WebSocket + API trigger) | API triggers                | E2E verifies                   | Seed via API, observe in browser                                   |

## Anti-Patterns

| Don't Do This                                        | Problem                                                                                | Do This Instead                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Use E2E tests to validate pure API responses         | Slow, flaky, launches a browser for no reason                                          | Use `request` fixture — no browser, direct HTTP                   |
| Ignore `response.status()`                           | A 500 with a fallback body can pass all body assertions                                | Always assert status first: `expect(response.status()).toBe(200)` |
| Skip response header checks                          | Missing `Content-Type`, `Cache-Control`, CORS headers cause production bugs            | Assert critical headers                                           |
| Only test the happy path                             | Real users trigger 400, 401, 403, 404, 409, 422 — every one needs a test               | Dedicate a spec to error responses                                |
| Hardcode IDs in API tests                            | Tests break when database is reset or IDs are reassigned                               | Create resources in the test, use returned IDs                    |
| Share mutable state between tests                    | Tests that depend on execution order are flaky and cannot run in parallel              | Each test creates and cleans up its own data                      |
| Parse `response.text()` then `JSON.parse()` manually | Playwright's `response.json()` handles this and throws clear errors on non-JSON        | Use `await response.json()`                                       |
| Forget cleanup after creating resources              | Test pollution: subsequent tests may see stale data or hit unique constraints          | Use fixtures with teardown or explicit `delete` calls             |
| Use `page.request` when you don't need a page        | `page.request` shares cookies with the browser context, which may cause auth confusion | Use the standalone `request` fixture for pure API tests           |

## Troubleshooting

### "Request failed: connect ECONNREFUSED 127.0.0.1:3000"

**Cause**: The API server is not running, or `baseURL` points to the wrong host/port.

**Fix**: Verify the server is running before tests. Use `webServer` in config to start it automatically.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const webServer = { command: 'npm run start:api', reuseExistingServer: !process.env.CI, url: 'http://localhost:3000/api/health' };

const use = { baseURL: 'http://localhost:3000' };

export default defineConfig({ use, webServer });
```

### "response.json() failed — body is not valid JSON"

**Cause**: The endpoint returned HTML (error page), plain text, or an empty body instead of JSON.

**Fix**: Check `response.status()` first — a 500 or 302 often returns HTML. `readJson` at the top of this file throws with the status and the raw `response.text()` when the status is not 2xx. Verify the `Accept: application/json` header is set.

### "401 Unauthorized" when using `request` fixture

**Cause**: The built-in `request` fixture does not carry browser cookies or auth tokens automatically.

**Fix**: Pick the option that matches where the token lives.

| Option | Where | How |
|---|---|---|
| Config-level headers | `playwright.config.ts` | `use.extraHTTPHeaders` from a const, below. |
| Per-request headers | API object method | `this.request.get('/api/resource', { headers: { Authorization: `Bearer ${token}` } })` |
| Browser cookies | Page object method | `this.page.request.get('/api/profile')` after a UI login inherits the context cookies. |

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { API_TOKEN } from './common/playwright.const';

const extraHTTPHeaders = { Authorization: `Bearer ${API_TOKEN}` };

const use = { extraHTTPHeaders };

export default defineConfig({ use });
```

### Tests pass locally but fail in CI

**Cause**: Different environments, database state, or missing environment variables.

**Fix**: Read secrets and base URLs from `process.env` once, in `common/*.const.ts` or the config. Run database seeds or migrations in `globalSetup`. Use unique identifiers (timestamps, UUIDs) from a builder util for test data. Check that the CI `baseURL` matches the deployed service.
