# Fixtures & Hooks

## Table of Contents

1. [Built-in Fixtures](#built-in-fixtures)
2. [Custom Fixtures](#custom-fixtures)
3. [Fixture Scopes](#fixture-scopes)
4. [Hooks](#hooks)
5. [Authentication Patterns](#authentication-patterns)
6. [Database Fixtures](#database-fixtures)

## Built-in Fixtures

### Core Fixtures

Each test gets fresh instances. Destructure only what the test uses, alphabetical.

| Fixture | Value |
|---|---|
| `page` | Isolated page instance |
| `context` | Browser context (cookies, localStorage) |
| `browser` | Browser instance, shared by the worker |
| `browserName` | `'chromium'`, `'firefox'`, or `'webkit'` |
| `request` | API request context, no browser |

### Request Fixture

The call and its response check live in a util; the spec keeps one call per step and lets a step return the typed value.

```ts
// e2e/users/test/utils/users-api.spec.util.ts
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

import type { User } from '../../common/users.type';

export const fetchUsers = async (request: APIRequestContext): Promise<User[]> => {
  const response = await request.get('/api/users');

  await expect(response).toBeOK();

  return response.json();
};
```

```ts
// e2e/users/users-api.spec.ts
import { expect, test } from '@playwright/test';

import type { User } from './common/users.type';
import { fetchUsers } from './test/utils/users-api.spec.util';

test.describe('FEATURE: users api', () => {
  test('requesting users returns five users', async ({ request }): Promise<void> => {
    const users = await test.step('WHEN the users are requested', (): Promise<User[]> => fetchUsers(request));

    await test.step('THEN five users are returned', (): void => expect(users).toHaveLength(5));
  });
});
```

## Custom Fixtures

### Basic Custom Fixture

One `test.extend` per feature in `<feature>.fixture.ts`. Setup sits above `use`, teardown below. The file re-exports `expect` so a spec has one import source.

```ts
// e2e/todo/todo.fixture.ts
import { test as base } from '@playwright/test';

import { TodoPage } from './pages/todo.page';
import { ApiClient } from './utils/api-client.util';

type TodoFixtures = {
  readonly apiClient: ApiClient;
  readonly todoPage: TodoPage;
};

export const test = base.extend<TodoFixtures>({
  apiClient: async ({ request }, use): Promise<void> => {
    await use(new ApiClient(request));
  },
  todoPage: async ({ page }, use): Promise<void> => {
    const todoPage = new TodoPage(page);

    await todoPage.goto();
    await use(todoPage);
    await todoPage.clearTodos();
  }
});

export { expect } from '@playwright/test';
```

### Fixture with Options

An option is a fixture declared as `[default, { option: true }]`. Its type lives in `common/<feature>.type.ts` because the config imports it too. The fixture body drives the UI through a page object, never through `page.getBy*`, and hands the spec a signed-in page object.

```ts
// e2e/todo/todo.fixture.ts
import { test as base } from '@playwright/test';

import type { TodoOptions } from './common/todo.type';
import { LoginPage } from './pages/login.page';
import { TodoPage } from './pages/todo.page';
import { USER_STUB } from './test/stubs/todo.stub';

type TodoFixtures = {
  readonly todoPage: TodoPage;
};

export const test = base.extend<TodoOptions & TodoFixtures>({
  defaultUser: [USER_STUB, { option: true }],
  todoPage: async ({ defaultUser, page }, use): Promise<void> => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.submit(defaultUser);
    await use(new TodoPage(page));
  }
});

export { expect } from '@playwright/test';
```

The config overrides the option in `use`:

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import type { TodoOptions } from './todo/common/todo.type';
import { ADMIN_STUB } from './todo/test/stubs/todo.stub';

const use: TodoOptions = { defaultUser: ADMIN_STUB };

export default defineConfig<TodoOptions>({ use });
```

### Automatic Fixtures

An `auto` fixture runs for every test without being destructured. Its value type is `void`.

```ts
// e2e/orders/orders.fixture.ts
import { test as base } from '@playwright/test';

import { cleanDatabase, seedDatabase } from './test/utils/database.spec.util';

type OrdersFixtures = {
  readonly seededDb: void;
};

export const test = base.extend<OrdersFixtures>({
  seededDb: [
    async ({}, use): Promise<void> => {
      await seedDatabase();
      await use();
      await cleanDatabase();
    },
    { auto: true }
  ]
});

export { expect } from '@playwright/test';
```

## Fixture Scopes

### Test Scope (Default)

Created fresh for each test. A built-in fixture is overridden the same way a custom one is declared:

```ts
// e2e/reports/reports.fixture.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ browser }, use): Promise<void> => {
    const page = await browser.newPage();

    await use(page);
    await page.close();
  }
});

export { expect } from '@playwright/test';
```

### Worker Scope

Shared across tests in the same worker; each worker gets its own instance and tests in different workers never share it. Worker fixtures go in the second generic as a separate `type <Feature>WorkerFixtures` and carry `{ scope: 'worker' }`. The third callback argument is `WorkerInfo`.

```ts
// e2e/account/account.fixture.ts
import { test as base } from '@playwright/test';

import type { Account } from './common/account.type';
import { AccountPage } from './pages/account.page';
import { createTestAccount, deleteTestAccount } from './test/utils/account.spec.util';

type AccountFixtures = {
  readonly accountPage: AccountPage;
};

type AccountWorkerFixtures = {
  readonly sharedAccount: Account;
};

export const test = base.extend<AccountFixtures, AccountWorkerFixtures>({
  accountPage: async ({ page, sharedAccount }, use): Promise<void> => {
    await use(new AccountPage(page, sharedAccount));
  },
  sharedAccount: [
    async ({}, use, workerInfo): Promise<void> => {
      const account = await createTestAccount(`user-${workerInfo.workerIndex}`);

      await use(account);
      await deleteTestAccount(account);
    },
    { scope: 'worker' }
  ]
});

export { expect } from '@playwright/test';
```

### Isolate test data between parallel workers

When tests in different workers touch the same backend or DB (same user, same tenant), they collide and fail intermittently. The worker fixture above names its account after `workerInfo.workerIndex` (`process.env.TEST_WORKER_INDEX` holds the same number), so each worker owns `user-0`, `user-1`, and so on and parallel workers never overwrite each other's data.

## Hooks

Hook bodies follow the spec rule: every statement is a step, and a step is one call. Conditional logic (screenshot only on failure) goes into a util.

### beforeEach / afterEach

```ts
// e2e/users/test/utils/failure-screenshot.spec.util.ts
import type { Page, TestInfo } from '@playwright/test';

export const captureOnFailure = async (page: Page, testInfo: TestInfo): Promise<void> => {
  const isPassed = testInfo.status === 'passed';

  if (isPassed) return;

  await page.screenshot({ path: `failed-${testInfo.title}.png` });
};
```

```ts
// e2e/users/users.spec.ts
import { test } from './users.fixture';
import { captureOnFailure } from './test/utils/failure-screenshot.spec.util';

test.beforeEach(async ({ usersPage }): Promise<void> => {
  await test.step('GIVEN the users page is open', (): Promise<void> => usersPage.goto());
});

test.afterEach(async ({ page }, testInfo): Promise<void> => {
  await test.step('THEN a screenshot is captured when the test failed', (): Promise<void> => captureOnFailure(page, testInfo));
});
```

### beforeAll / afterAll

`beforeAll` and `afterAll` run once per worker per file. Only worker-scoped fixtures (`browser`, `browserName`) are available; `page` is not.

```ts
// e2e/catalog/catalog.spec.ts
import { test } from './catalog.fixture';
import { resetCatalog, seedCatalog } from './test/utils/catalog.spec.util';

test.beforeAll(async (): Promise<void> => {
  await test.step('GIVEN the catalog is seeded', (): Promise<void> => seedCatalog());
});

test.afterAll(async (): Promise<void> => {
  await test.step('THEN the catalog is reset', (): Promise<void> => resetCatalog());
});
```

### Describe-Level Hooks

A `beforeEach` inside a `GIVEN` describe is the shared arrange for every test in that state.

```ts
// e2e/users/users.spec.ts
import { test } from './users.fixture';
import { USER_STUB } from './test/stubs/users.stub';

test.describe('FEATURE: user management', () => {
  test.describe('GIVEN the users page is open', () => {
    test.beforeEach(async ({ usersPage }): Promise<void> => {
      await test.step('GIVEN the users page is open', (): Promise<void> => usersPage.goto());
    });

    test('reloading the page shows the user list', async ({ usersPage }): Promise<void> => {
      await test.step('WHEN the page is reloaded', (): Promise<void> => usersPage.reload());

      await test.step('THEN the user list is shown', (): Promise<void> => usersPage.expectList());
    });

    test('adding a user names the user in the list', async ({ usersPage }): Promise<void> => {
      await test.step('WHEN a user is added', (): Promise<void> => usersPage.addUser(USER_STUB));

      await test.step('THEN the list names the new user', (): Promise<void> => usersPage.expectUser(USER_STUB.name));
    });
  });
});
```

## Authentication Patterns

### Global Setup with Storage State

A `setup` project signs in once through the page objects of `login.fixture.ts` and saves the storage state. Credentials come from a stub or a fixture option set in the config `use` block, never from `process.env` in the setup file.

```ts
// e2e/auth/test/utils/storage-state.spec.util.ts
import type { Page } from '@playwright/test';

export const saveStorageState = async (page: Page, path: string): Promise<void> => {
  await page.context().storageState({ path });
};
```

```ts
// e2e/auth/auth.setup.ts
import { test as setup } from '../login/login.fixture';
import { USER_STUB } from './test/stubs/auth.stub';
import { saveStorageState } from './test/utils/storage-state.spec.util';

const USER_AUTH_FILE = 'e2e/.auth/user.json';

setup('authenticate as the default user', async ({ dashboardPage, loginPage, page }): Promise<void> => {
  await setup.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());

  await setup.step('WHEN credentials are submitted', (): Promise<void> => loginPage.submit(USER_STUB));

  await setup.step('THEN the dashboard heading is shown', (): Promise<void> => dashboardPage.expectHeading());

  await setup.step('AND the storage state is saved', (): Promise<void> => saveStorageState(page, USER_AUTH_FILE));
});
```

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium }
];

export default defineConfig({ projects });
```

### Multiple Auth States

A second `setup(...)` call in the same file signs in as the admin with `ADMIN_STUB` and saves to `e2e/.auth/admin.json`. Each role becomes a project with its own `storageState` and `testMatch`.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const adminUse = { storageState: 'e2e/.auth/admin.json' };

const userUse = { storageState: 'e2e/.auth/user.json' };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'admin tests', testMatch: /.*admin.*\.spec\.ts/, use: adminUse },
  { dependencies: ['setup'], name: 'user tests', testMatch: /.*user.*\.spec\.ts/, use: userUse }
];

export default defineConfig({ projects });
```

### Auth Fixture

When one test needs two roles at once, each role is a fixture that opens its own context from a saved storage state, wraps the page in a page object, and closes the context after `use`.

```ts
// e2e/auth/auth.fixture.ts
import type { Browser, Page } from '@playwright/test';
import { test as base } from '@playwright/test';

import { DashboardPage } from '../dashboard/pages/dashboard.page';

type AuthFixtures = {
  readonly adminDashboard: DashboardPage;
  readonly userDashboard: DashboardPage;
};

const ADMIN_AUTH_FILE = 'e2e/.auth/admin.json';
const USER_AUTH_FILE = 'e2e/.auth/user.json';

const openPage = async (browser: Browser, storageState: string): Promise<Page> => {
  const context = await browser.newContext({ storageState });

  return context.newPage();
};

export const test = base.extend<AuthFixtures>({
  adminDashboard: async ({ browser }, use): Promise<void> => {
    const page = await openPage(browser, ADMIN_AUTH_FILE);

    await use(new DashboardPage(page));
    await page.context().close();
  },
  userDashboard: async ({ browser }, use): Promise<void> => {
    const page = await openPage(browser, USER_AUTH_FILE);

    await use(new DashboardPage(page));
    await page.context().close();
  }
});

export { expect } from '@playwright/test';
```

## Database Fixtures

This section covers **per-test database fixtures** (isolation, transaction rollback). For related topics:

- **Test data factories** (builders, Faker): See [test-data.md](test-data.md)
- **One-time database setup** (migrations, snapshots): See [global-setup.md](global-setup.md#database-patterns)

### Transaction Rollback Pattern

The fixture opens a transaction, hands it to the test, and rolls it back afterwards so the next test starts from a clean slate.

```ts
// e2e/orders/orders.fixture.ts
import { test as base } from '@playwright/test';

import type { Transaction } from '../../src/db/common/db.type';
import { db } from '../../src/db/db';

type OrdersFixtures = {
  readonly dbTransaction: Transaction;
};

export const test = base.extend<OrdersFixtures>({
  dbTransaction: async ({}, use): Promise<void> => {
    const transaction = await db.beginTransaction();

    await use(transaction);
    await transaction.rollback();
  }
});

export { expect } from '@playwright/test';
```

### Seed Data Fixture

A fixture may depend on another fixture (`testProducts` needs `testUser`). Rows are built from stubs, spread and overridden per fixture.

```ts
// e2e/products/products.fixture.ts
import { test as base } from '@playwright/test';

import type { Product, ProductDraft, User, UserDraft } from '../../src/db/common/db.type';
import { db } from '../../src/db/db';
import { PRODUCT_STUB, USER_STUB } from './test/stubs/products.stub';

type ProductsFixtures = {
  readonly testProducts: Product[];
  readonly testUser: User;
};

export const test = base.extend<ProductsFixtures>({
  testProducts: async ({ testUser }, use): Promise<void> => {
    const productA: ProductDraft = { ...PRODUCT_STUB, name: 'Product A', ownerId: testUser.id };
    const productB: ProductDraft = { ...PRODUCT_STUB, name: 'Product B', ownerId: testUser.id };
    const products = await db.products.createMany([productA, productB]);

    await use(products);

    const ids = products.map((product) => product.id);

    await db.products.deleteMany(ids);
  },
  testUser: async ({}, use): Promise<void> => {
    const email = `test-${Date.now()}@example.com`;
    const draft: UserDraft = { ...USER_STUB, email };
    const user = await db.users.create(draft);

    await use(user);
    await db.users.delete(user.id);
  }
});

export { expect } from '@playwright/test';
```

## Fixture Tips

| Tip                | Explanation                                 |
| ------------------ | ------------------------------------------- |
| Fixtures are lazy  | Only created when used                      |
| Compose fixtures   | Use other fixtures as dependencies          |
| Keep setup minimal | Do heavy lifting in worker-scoped fixtures  |
| Clean up resources | Use teardown in fixtures, not afterEach     |
| Avoid shared state | Each fixture instance should be independent |

## Anti-Patterns to Avoid

| Anti-Pattern                              | Problem                                                    | Solution                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared mutable state between tests        | Race conditions, order dependencies                        | Use fixtures for isolation                                                                                                                                                            |
| Global variables in tests                 | Tests depend on execution order                            | Use fixtures or beforeEach for setup                                                                                                                                                  |
| Not cleaning up test data                 | Tests interfere with each other                            | Use fixtures with teardown or database transactions                                                                                                                                   |
| Shared `page` or `context` in `beforeAll` | State leak between tests; flaky when tests run in parallel | Use default one-context-per-test, or `beforeEach` + fresh page; if serial is required, prefer `test.describe.configure({ mode: 'serial' })` and document that isolation is sacrificed |
| Backend/DB state shared across workers    | Tests in different workers collide on same data            | Use worker-scoped fixture with `workerInfo.workerIndex` to create unique data per worker                                                                                              |

## Related References

- **Page Objects with fixtures**: See [page-object-model.md](page-object-model.md) for POM patterns
- **Test organization**: See [test-suite-structure.md](test-suite-structure.md) for test structure
- **Debugging fixture issues**: See [debugging.md](../debugging/debugging.md) for troubleshooting
