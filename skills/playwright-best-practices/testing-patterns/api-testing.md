# API Testing

## Table of Contents

1. [Patterns](#patterns)
2. [Decision Guide](#decision-guide)
3. [Anti-Patterns](#anti-patterns)
4. [Troubleshooting](#troubleshooting)

> **When to use**: Testing REST APIs directly — validating endpoints, seeding test data, or verifying backend behavior without browser overhead.
> **See also**: [graphql-testing.md](graphql-testing.md) for GraphQL-specific patterns.

An API object is the page object of an endpoint group: it owns the `APIRequestContext` and the paths, lives in `e2e/<feature>/api/<name>.api.ts`, and every method returns the `APIResponse`. A spec checks the status first, in a `THEN` step, then the body in an `AND` step through `expectBody`, which reads the body inside the check and matches it partially. No step only reads a body.

```ts
// e2e/common/expect-body.spec.util.ts
import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

export const expectBody = async (response: APIResponse, shape: Record<string, unknown>): Promise<void> => {
  const body: unknown = await response.json();

  expect(body).toMatchObject(shape);
};
```

A fixture that needs a value from a response, such as a session token or a seeded id, reads it through `readJson`.

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
// e2e/admin/accounts.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectBody } from '../common/expect-body.spec.util';
import { expect, test } from './admin.fixture';

const AT_LEAST_ONE_ACCOUNT = { accounts: expect.arrayContaining([expect.anything()]) };

test.describe('FEATURE: admin accounts api', () => {
  test('GIVEN an admin client, listing accounts returns at least one account', async ({ adminApi }): Promise<void> => {
    const response = await test.step('WHEN the accounts are listed', (): Promise<APIResponse> => adminApi.get('/admin/accounts'));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the body lists at least one account', (): Promise<void> => expectBody(response, AT_LEAST_ONE_ACCOUNT));
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

type ItemMetadata = {
  readonly rating: number | null;
  readonly views: number;
};

export type Item = {
  readonly category: string;
  readonly createdAt: string;
  readonly id: number;
  readonly metadata: ItemMetadata;
  readonly price: number;
  readonly tags: string[];
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

import type { ItemPatch, ItemQuery, NewItem } from '../common/items.type';

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

The `item` fixture in `items.fixture.ts` stores `ITEM_STUB`, a `Hammer` in `tools`, through `itemsApi.create`, reads it with `readJson<Item>`, hands it to `use`, and calls `itemsApi.remove(item.id)` after. The spec has no hooks. `remove` returns the response instead of throwing, so the teardown delete is safe after the delete test. The delete test checks the delete before it reads again, so the 404 is only asserted once the delete is proven.

```ts
// e2e/items/items.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectBody } from '../common/expect-body.spec.util';
import type { ItemPatch, NewItem } from './common/items.type';
import { expect, test } from './items.fixture';
import { ITEM_STUB } from './test/stubs/items.stub';

const PRICE_PATCH: ItemPatch = { price: 22.5 };

test.describe('FEATURE: items api', () => {
  test('GIVEN a stored hammer, patching its price returns the new price', async ({ item, itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the price is patched to 22.5', (): Promise<APIResponse> => itemsApi.update(item.id, PRICE_PATCH));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the body carries the new price', (): Promise<void> => expectBody(response, PRICE_PATCH));
  });

  test('GIVEN a stored hammer, replacing it with a claw hammer succeeds', async ({ item, itemsApi }): Promise<void> => {
    const replacement: NewItem = { ...ITEM_STUB, price: 24.99, title: 'Claw Hammer' };

    const response = await test.step('WHEN the item is replaced', (): Promise<APIResponse> => itemsApi.replace(item.id, replacement));

    await test.step('THEN the response is ok', (): void => expect(response.ok()).toBeTruthy());
  });

  test('GIVEN a stored hammer, deleting it makes a later read return 404', async ({ item, itemsApi }): Promise<void> => {
    const deleted = await test.step('WHEN the item is deleted', (): Promise<APIResponse> => itemsApi.remove(item.id));

    await test.step('THEN the delete returns 204', (): void => expect(deleted.status()).toBe(204));

    const read = await test.step('WHEN the deleted item is read', (): Promise<APIResponse> => itemsApi.get(item.id));

    await test.step('THEN the read returns 404', (): void => expect(read.status()).toBe(404));
  });
});
```

### Dedicated API Project Configuration

**Use when**: Writing dedicated API test suites that do not need a browser.

API specs are named `*.api.e2e.ts` and matched by project; the `e2e` project inherits the top-level `testMatch` and ignores them. `testDir` per project works the same way when API specs live in their own tree.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const apiHeaders = { Accept: 'application/json' };

const apiUse = { baseURL: 'https://api.myapp.io', extraHTTPHeaders: apiHeaders };

const e2eUse = { baseURL: 'https://myapp.io', browserName: 'chromium' } as const;

const projects = [
  { name: 'api', testMatch: /.*\.api\.e2e\.ts/, use: apiUse },
  { name: 'e2e', testIgnore: /.*\.api\.e2e\.ts/, use: e2eUse }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Response Assertions

**Use when**: Validating response status, headers, and body structure.
**Avoid when**: Never skip these — every API test should assert on status and body.

Status first, then headers, then body, each check reading what it asserts. Matcher shapes are module-level consts, so each body check is one `expectBody` step. The item is widget 101 from the database seed. The two checks a partial shape cannot express, a tag that must be absent and a date that must round-trip, are `expect*` utils that read the body themselves.

```ts
// e2e/items/test/utils/item-body.spec.util.ts
import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

import type { Item } from '../../common/items.type';

export const expectFeaturedTags = async (response: APIResponse): Promise<void> => {
  const item: Item = await response.json();

  expect(item.tags).toContain('featured');
  expect(item.tags).not.toContain('deprecated');
};

export const expectIsoCreatedAt = async (response: APIResponse): Promise<void> => {
  const item: Item = await response.json();
  const roundTrip = new Date(item.createdAt).toISOString();

  expect(roundTrip).toBe(item.createdAt);
};
```

```ts
// e2e/items/item-shape.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectBody } from '../common/expect-body.spec.util';
import { expect, test } from './items.fixture';
import { expectFeaturedTags, expectIsoCreatedAt } from './test/utils/item-body.spec.util';

const WIDGET_ID = 101;
const KNOWN_FIELDS = { id: WIDGET_ID, status: expect.stringMatching(/^(active|inactive|archived)$/), title: 'Widget' };
const FIELD_TYPES = { createdAt: expect.any(String), id: expect.any(Number), tags: expect.any(Array), title: expect.any(String) };
const METADATA_SHAPE = { rating: expect.any(Number), views: expect.any(Number) };
const METADATA = { metadata: METADATA_SHAPE };

test.describe('FEATURE: item response shape', () => {
  test('GIVEN seeded widget 101, fetching it returns 200 with json and a cache policy', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the widget is fetched', (): Promise<APIResponse> => itemsApi.get(WIDGET_ID));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the content type is json', (): void => expect(response.headers()['content-type']).toContain('application/json'));

    await test.step('AND cache control sets a max age', (): void => expect(response.headers()['cache-control']).toMatch(/max-age=\d+/));
  });

  test('GIVEN seeded widget 101, fetching it matches known fields and every field type', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the widget is fetched', (): Promise<APIResponse> => itemsApi.get(WIDGET_ID));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the known fields match', (): Promise<void> => expectBody(response, KNOWN_FIELDS));

    await test.step('AND the field types match', (): Promise<void> => expectBody(response, FIELD_TYPES));

    await test.step('AND the metadata has views and rating', (): Promise<void> => expectBody(response, METADATA));
  });

  test('GIVEN seeded widget 101, fetching it tags it featured and not deprecated', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the widget is fetched', (): Promise<APIResponse> => itemsApi.get(WIDGET_ID));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the tags include featured and not deprecated', (): Promise<void> => expectFeaturedTags(response));
  });

  test('GIVEN seeded widget 101, fetching it returns an ISO createdAt', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the widget is fetched', (): Promise<APIResponse> => itemsApi.get(WIDGET_ID));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND createdAt round-trips through Date', (): Promise<void> => expectIsoCreatedAt(response));
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

For a list body, `THEN the status is 200` comes first, then one `AND` step calls an `expect*` util in `test/utils/items-shape.spec.util.ts` that reads the body, asserts `toHaveLength(10)` on `items`, and loops `toMatchObject(FIELD_TYPES)` over them.

### Typed Requests and Latency

`request.get<Item>('/api/items/101')` (and `post`, `put`, `patch`, `delete`, `fetch`) takes a type argument that types `response.json()` as `Item`. It replaces the `const item: Item = await response.json()` annotation and nothing more: it is compile-time only, so a server that renames a field still compiles and still parses. Keep the runtime contract check in [Schema Validation with Zod](#schema-validation-with-zod).

`response.timing()` returns resource timing for the call, the same shape as `request.timing()`: `startTime` is epoch milliseconds, every other field is milliseconds relative to it, and `-1` means unavailable. `responseEnd` is the full round trip. A latency ceiling reads it inside its own check:

```ts
// e2e/items/test/utils/item-latency.spec.util.ts
import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

export const expectRespondedWithin = (response: APIResponse, ceilingMs: number): void => {
  const { responseEnd } = response.timing();

  expect(responseEnd).toBeGreaterThanOrEqual(0);
  expect(responseEnd).toBeLessThan(ceilingMs);
};
```

The spec calls it after the status check: `'AND the widget arrives within 500 ms'` → `(): void => expectRespondedWithin(response, 500)`. The `>= 0` line fails loudly when timing is unavailable (a response replayed from HAR reports `-1` everywhere) instead of passing every ceiling. Set the ceiling for order-of-magnitude regressions, well above CI noise; load and percentile budgets belong in [performance-testing.md](performance-testing.md).

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
import { DashboardPage } from './pages/dashboard.po';
import { LoginPage } from './pages/login.po';
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

`LoginPage` is the one from `core/house-style.md`; `DashboardPage.expectWorkspace(name)` is a plain `await expect(…).toBeVisible()` on `page.getByRole('heading', { name })`.

```ts
// e2e/workspace/workspace-dashboard.e2e.ts
import { expect, test } from './workspace.fixture';

test.describe('FEATURE: workspace dashboard', () => {
  test('GIVEN a seeded account and workspace, signing in lists the seeded workspace', async ({ dashboardPage, loginPage, page, seedAccount, seedWorkspace }): Promise<void> => {
    await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto());

    await test.step('AND the seeded account signs in', (): Promise<void> => loginPage.submit(seedAccount));

    await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));

    await test.step('AND the seeded workspace heading is visible', (): Promise<void> => dashboardPage.expectWorkspace(seedWorkspace.name));
  });
});
```

The same seed-then-observe shape covers "API + E2E hybrid" flows: create through the API object, open the page, assert through the page object, delete in teardown.

### Error Response Testing

**Use when**: Every API has error paths — test them. A missing 401 test today is a security hole tomorrow.

One spec per feature holds the error cases. The 400 case checks the status, then the body through `expectBody`; the 429 case bursts requests through an API-object method, and `expectRateLimited` filters the 429s inside the check.

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
// e2e/items/test/utils/rate-limit.spec.util.ts
import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

const isRateLimited = (response: APIResponse): boolean => response.status() === 429;

export const expectRateLimited = (responses: APIResponse[]): void => {
  const limited = responses.filter(isRateLimited);

  expect(limited.length).toBeGreaterThan(0);
  expect(limited[0]?.headers()['retry-after']).toBeDefined();
};
```

```ts
// e2e/items/items-errors.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectBody } from '../common/expect-body.spec.util';
import type { NewItem } from './common/items.type';
import { expect, test } from './items.fixture';
import { expectRateLimited } from './test/utils/rate-limit.spec.util';

const INVALID_ITEM: NewItem = { category: 'tools', price: -5, title: '' };
const TITLE_ISSUE = expect.objectContaining({ field: 'title', message: expect.any(String) });
const PRICE_ISSUE = expect.objectContaining({ field: 'price', message: expect.any(String) });
const VALIDATION_ERROR = { error: 'Validation Error' };
const TITLE_AND_PRICE_ISSUES = { details: expect.arrayContaining([TITLE_ISSUE, PRICE_ISSUE]) };

test.describe('FEATURE: items api error responses', () => {
  test('GIVEN an invalid item, posting it returns 400 with one issue per field', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the item is posted', (): Promise<APIResponse> => itemsApi.create(INVALID_ITEM));

    await test.step('THEN the status is 400', (): void => expect(response.status()).toBe(400));

    await test.step('AND the error names a validation error', (): Promise<void> => expectBody(response, VALIDATION_ERROR));

    await test.step('AND the details cover title and price', (): Promise<void> => expectBody(response, TITLE_AND_PRICE_ISSUES));
  });

  test('GIVEN a rate-limited search endpoint, fifty searches at once get a 429 with retry-after', async ({ searchApi }): Promise<void> => {
    const responses = await test.step('WHEN fifty searches are sent at once', (): Promise<APIResponse[]> => searchApi.burst(50));

    await test.step('THEN at least one search gets a 429 with retry-after', (): void => expectRateLimited(responses));
  });
});
```

Every other error status is the same test with its own request. The body shape is a named const in the spec, shown inline here.

| Status | Request | `AND` body check after `THEN the status is <code>` |
|---|---|---|
| 401 | `get('/api/protected/resource', { headers: { Authorization: '' } })` | `expectBody(response, { error: expect.stringMatching(/unauthorized\|unauthenticated/i) })` |
| 403 | `delete('/api/admin/items/1')` as a non-admin | `expectBody(response, { error: expect.stringMatching(/forbidden\|insufficient permissions/i) })` |
| 404 | `get('/api/items/999999')` | `expectBody(response, { error: expect.stringMatching(/not found/i) })` |
| 409 | `post('/api/items', { data: { title: 'Duplicate', sku } })` after one with the same `sku` | None; the status is the check |
| 422 | `post('/api/orders', { data: { items: [] } })` | `expectBody(response, { error: expect.stringContaining('at least one item') })` |

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
// e2e/documents/upload.api.e2e.ts
import { resolve } from 'node:path';

import type { APIResponse } from '@playwright/test';

import { expectBody } from '../common/expect-body.spec.util';
import type { UploadFile, UploadMeta } from './common/documents.type';
import { expect, test } from './documents.fixture';

const REPORT_PATH = resolve('e2e/documents/test/fixtures/report.pdf');

const REPORT_META: UploadMeta = { category: 'reports', description: 'Monthly report' };

const UPLOADED_SHAPE = { filename: 'report.pdf', id: expect.any(String), mimeType: 'application/pdf', size: expect.any(Number), url: expect.stringMatching(/^https:\/\//) };

const ELEVEN_MB = 11 * 1024 * 1024;

const OVERSIZED: UploadFile = { buffer: Buffer.alloc(ELEVEN_MB), mimeType: 'application/octet-stream', name: 'large-file.bin' };

test.describe('FEATURE: document upload api', () => {
  test('GIVEN a pdf report, uploading it as multipart returns 201 describing the stored file', async ({ documentsApi }): Promise<void> => {
    const response = await test.step('WHEN the report is uploaded', (): Promise<APIResponse> => documentsApi.uploadFile(REPORT_PATH, 'application/pdf', REPORT_META));

    await test.step('THEN the status is 201', (): void => expect(response.status()).toBe(201));

    await test.step('AND the body describes the stored file', (): Promise<void> => expectBody(response, UPLOADED_SHAPE));
  });

  test('GIVEN an eleven megabyte file, uploading it returns 413', async ({ documentsApi }): Promise<void> => {
    const response = await test.step('WHEN the file is uploaded', (): Promise<APIResponse> => documentsApi.uploadBuffer(OVERSIZED, REPORT_META));

    await test.step('THEN the status is 413', (): void => expect(response.status()).toBe(413));
  });
});
```

### Chained API Calls

**Use when**: Testing multi-step workflows — create, read, update, delete sequences; order flows; state machine transitions.
**Avoid when**: You can test each endpoint in isolation and the interactions are trivial.

A chain is a flat spec of independent links. The fixtures in `orders.fixture.ts` seed every link before the one under test, so no test depends on another test, and cleanup never depends on a test reaching its end:

| Fixture | Seeds | After `use` |
|---|---|---|
| `product` | `shopApi.createProduct(PRODUCT_STUB)`, a product priced 49.99 with 50 in stock, read with `readJson<Product>` | `shopApi.deleteProduct(product.id)` |
| `order` | `shopApi.createCart` with `ORDER_QUANTITY` (3) of `product`, then `shopApi.checkout(cart.id, ADDRESS_STUB)`, each read with `readJson` | `shopApi.deleteOrder(order.id)` |

Each test runs one call as its `WHEN` and checks what it returns; reading the placed order back checks what checkout stored. The order body carries `items`, `status`, and `total`. The numbers in the titles are the stub's: three at 49.99 total 149.97.

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

  public async order(id: number): Promise<APIResponse> {
    return this.request.get(`/api/orders/${id}`);
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
// e2e/orders/checkout.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectBody } from '../common/expect-body.spec.util';
import { expect, test } from './orders.fixture';

const ORDER_TOTAL = { total: 149.97 };
const PENDING = { status: 'pending' };
const ONE_LINE = [expect.anything()];
const ONE_LINE_ORDER = { items: ONE_LINE };

test.describe('FEATURE: checkout api', () => {
  test('GIVEN an order of three 49.99 products, reading it shows the 149.97 total', async ({ order, shopApi }): Promise<void> => {
    const response = await test.step('WHEN the order is read', (): Promise<APIResponse> => shopApi.order(order.id));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the total is 149.97', (): Promise<void> => expectBody(response, ORDER_TOTAL));
  });

  test('GIVEN an order of three 49.99 products, reading it shows one pending line', async ({ order, shopApi }): Promise<void> => {
    const response = await test.step('WHEN the order is read', (): Promise<APIResponse> => shopApi.order(order.id));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the order status is pending', (): Promise<void> => expectBody(response, PENDING));

    await test.step('AND the order has one line', (): Promise<void> => expectBody(response, ONE_LINE_ORDER));
  });
});
```

Two more links read what the checkout changed, with the same fixtures and `THEN the status is 200` first. A shape that needs a fixture value, such as `order.id`, is a `const` above the steps.

| Title | `WHEN` | `AND` body check |
|---|---|---|
| GIVEN a placed order, listing orders includes it | `shopApi.listOrders()` | `expectBody(response, listed)`, where `listed` holds `orders: expect.arrayContaining([expect.objectContaining({ id: order.id })])` |
| GIVEN an order of three from a stock of 50, reading the product shows 47 left | `shopApi.product(product.id)` | `expectBody(response, { stock: 47 })` |

A state machine is the same flat spec with one test per starting state: a fixture seeds the state through the API, one `WHEN` step runs the transition, and the title names both (`'GIVEN an article in review, publishing it succeeds'`). For an article publish workflow through `patch('/api/articles/:id/status', { data: { status } })`:

| GIVEN | WHEN status is set to | THEN, then AND |
|---|---|---|
| a draft article | `in_review` | status 200, then body status `in_review` |
| an article in review | `published` | status 200, then body status `published` |
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

`expectSchema` reads the body inside the check. `parse` throws a `ZodError` whose message lists every issue with its path, so `not.toThrow()` reports the full diff without a hand-written formatter.

```ts
// e2e/utils/expect-schema.util.ts
import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import type { ZodType } from 'zod';

export const expectSchema = async (response: APIResponse, schema: ZodType): Promise<void> => {
  const body: unknown = await response.json();
  const parse = (): unknown => schema.parse(body);

  expect(parse).not.toThrow();
};
```

```ts
// e2e/items/items-schema.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expectSchema } from '../utils/expect-schema.util';
import { PAGINATED_ITEMS_SCHEMA } from './common/item-schema.const';
import type { ItemQuery } from './common/items.type';
import { expect, test } from './items.fixture';

const LIST_QUERY: ItemQuery = { category: 'tools', limit: 10, page: 1 };

test.describe('FEATURE: items api contract', () => {
  test('GIVEN a tools query, fetching the item list matches the paginated items schema', async ({ itemsApi }): Promise<void> => {
    const response = await test.step('WHEN the item list is fetched', (): Promise<APIResponse> => itemsApi.list(LIST_QUERY));

    await test.step('THEN the status is ok', (): void => expect(response.ok()).toBeTruthy());

    await test.step('AND the body matches the schema', (): Promise<void> => expectSchema(response, PAGINATED_ITEMS_SCHEMA));
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

export default defineConfig({ testMatch: '**/*.@(e2e|test).ts', use, webServer });
```

### "response.json() failed — body is not valid JSON"

**Cause**: The endpoint returned HTML (error page), plain text, or an empty body instead of JSON.

**Fix**: Check `response.status()` first — a 500 or 302 often returns HTML. A spec whose `THEN the status is 200` step runs before its body check fails on the status, not on the parse. `readJson` at the top of this file throws with the status and the raw `response.text()` when the status is not 2xx. Verify the `Accept: application/json` header is set.

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

export default defineConfig({ testMatch: '**/*.@(e2e|test).ts', use });
```

### Tests pass locally but fail in CI

**Cause**: Different environments, database state, or missing environment variables.

**Fix**: Read secrets and base URLs from `process.env` once, in `common/*.const.ts` or the config. Run database seeds or migrations in `globalSetup`. Use unique identifiers (timestamps, UUIDs) from a builder util for test data. Check that the CI `baseURL` matches the deployed service.
