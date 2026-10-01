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

The request is a util the `WHEN` step calls, and the step returns the `APIResponse`. The status check comes first; the body check is an `expect*` util that reads the body it asserts, so no step only reads a value. The run's global seed ([global-setup.md](global-setup.md#database-migration-in-setup)) stores the three users the title names.

```ts
// e2e/users/test/utils/users-api.spec.util.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

import type { User } from '../../common/users.type';

export const fetchUsers = (request: APIRequestContext): Promise<APIResponse> => request.get('/api/users');

export const expectUserCount = async (response: APIResponse, count: number): Promise<void> => {
  const users: User[] = await response.json();

  expect(users).toHaveLength(count);
};
```

```ts
// e2e/users/users-api.e2e.ts
import type { APIResponse } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { expectUserCount, fetchUsers } from './test/utils/users-api.spec.util';

test.describe('FEATURE: users api', () => {
  test('GIVEN three seeded users, requesting users returns all three', async ({ request }): Promise<void> => {
    const response = await test.step('WHEN the users are requested', (): Promise<APIResponse> => fetchUsers(request));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the body lists three users', (): Promise<void> => expectUserCount(response, 3));
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

An option is a fixture declared as `[default, { option: true }]`. Its type, `TodoFixtureOptions`, lives in `common/<feature>.type.ts` because the config imports it too; `TodoOptions` is left for the `TodoPage` opening options. The fixture body drives the UI through a page object, never through `page.getBy*`, and hands the spec a signed-in page object.

```ts
// e2e/todo/todo.fixture.ts
import { test as base } from '@playwright/test';

import type { TodoFixtureOptions } from './common/todo.type';
import { LoginPage } from './pages/login.page';
import { TodoPage } from './pages/todo.page';
import { USER_STUB } from './test/stubs/todo.stub';

type TodoFixtures = {
  readonly todoPage: TodoPage;
};

export const test = base.extend<TodoFixtureOptions & TodoFixtures>({
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

import type { TodoFixtureOptions } from './todo/common/todo.type';
import { ADMIN_STUB } from './todo/test/stubs/todo.stub';

const use: TodoFixtureOptions = { defaultUser: ADMIN_STUB };

export default defineConfig<TodoFixtureOptions>({ testMatch: '**/*.@(e2e|test).ts', use });
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

### Fail Fast with test.abort()

`test.abort(message)` fails the running test at once from a fixture, hook, or route handler. Use it where a misconfigured run would otherwise wait out its timeout and report a misleading locator failure, such as a request no mock answers.

A catch-all mock aborts on any own-origin API call the feature did not mock. Playwright runs the most recently registered matching route first, so the specific mocks a `goto(options)` registers later still answer their own paths.

```ts
// e2e/alerts/test/mocks/unmocked.mock.ts
import type { Route } from '@playwright/test';
import { test } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

export const unmockedMock = (): RouteHandler => {
  return async (route: Route): Promise<void> => {
    const url = route.request().url();

    await route.abort();
    test.abort(`Unmocked request: ${url}`);
  };
};
```

An `auto` fixture installs it for every test in the feature: `await page.route('**/api/**', unmockedMock());`, then `await use();`. Routing the own origin makes every spec of the feature a `.test.ts`.

A fixture body that throws already fails the test, so a dead backend or a non-2xx seed call needs a `throw` with the URL, status, and body, not `test.abort`. A route handler is different: it runs outside the test body, on the browser's request, so `test.abort` is the call that turns an unexpected request into this test's failure.

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

Hooks never open a step: a hook calls its util directly, so the trace holds only the spec's own `WHEN` / `THEN` steps. A hook never opens the page either; each test opens it in its own `WHEN` step, or a fixture hands it over ready. Conditional logic (screenshot only on failure) goes into a util.

### afterEach

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
// e2e/users/users.e2e.ts
import { test } from './users.fixture';
import { captureOnFailure } from './test/utils/failure-screenshot.spec.util';

test.afterEach(async ({ page }, testInfo): Promise<void> => {
  await captureOnFailure(page, testInfo);
});
```

### beforeAll / afterAll

`beforeAll` and `afterAll` run once per worker per file. Only worker-scoped fixtures (`browser`, `browserName`) are available; `page` is not. The body calls the util directly. When a test reads the seeded data back, a worker-scoped fixture (see [Worker Scope](#worker-scope)) is the better home: it seeds, hands over the value, and resets after `use`.

```ts
// e2e/catalog/catalog.e2e.ts
import { test } from './catalog.fixture';
import { resetCatalog, seedCatalog } from './test/utils/catalog.spec.util';

test.beforeAll(async (): Promise<void> => {
  await seedCatalog();
});

test.afterAll(async (): Promise<void> => {
  await resetCatalog();
});
```

### Replacing a Page-Opening beforeEach

A `beforeEach` inside the `FEATURE` describe that only opens the page is deleted. Each test opens the page in its own `WHEN` step, so its step list reads complete on its own. A `beforeEach` that seeds moves into a fixture that seeds and hands over the ready page object, or into an option on the opening call. A hook that stays (cleanup) calls its util directly, with no step.

```ts
// e2e/users/users.e2e.ts
import { test } from './users.fixture';
import { USER_STUB } from './test/stubs/users.stub';

test.describe('FEATURE: user management', () => {
  test('GIVEN existing users, reloading the page still shows the user list', async ({ usersPage }): Promise<void> => {
    await test.step('WHEN the users page is opened', (): Promise<void> => usersPage.goto());

    await test.step('AND the page is reloaded', (): Promise<void> => usersPage.reload());

    await test.step('THEN the user list is shown', (): Promise<void> => usersPage.expectList());
  });

  test('GIVEN a new user, adding it names the user in the list', async ({ usersPage }): Promise<void> => {
    await test.step('WHEN the users page is opened', (): Promise<void> => usersPage.goto());

    await test.step('AND a user is added', (): Promise<void> => usersPage.addUser(USER_STUB));

    await test.step('THEN the list names the new user', (): Promise<void> => usersPage.expectUser(USER_STUB.name));
  });
});
```

## Authentication Patterns

### Global Setup with Storage State

A `setup` project signs in once through the page objects of `login.fixture.ts` and saves the storage state. Credentials come from a stub or a fixture option set in the config `use` block, never from `process.env` in the setup file. A setup file is not a behaviour spec: its body calls the page objects directly, with no steps, and its title names what it produces.

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

setup('saves the default user session', async ({ dashboardPage, loginPage, page }): Promise<void> => {
  await loginPage.goto();
  await loginPage.submit(USER_STUB);
  await dashboardPage.expectHeading();
  await saveStorageState(page, USER_AUTH_FILE);
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

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Multiple Auth States

A second `setup('saves the admin session', …)` in the same file signs in as the admin with `ADMIN_STUB` and saves to `e2e/.auth/admin.json`. Each role becomes a project with its own `storageState` and `testMatch`.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const adminUse = { storageState: 'e2e/.auth/admin.json' };

const userUse = { storageState: 'e2e/.auth/user.json' };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'admin tests', testMatch: '**/*admin*.@(e2e|test).ts', use: adminUse },
  { dependencies: ['setup'], name: 'user tests', testMatch: '**/*user*.@(e2e|test).ts', use: userUse }
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
| Global variables in tests                 | Tests depend on execution order                            | Use fixtures for setup                                                                                                                                                                |
| Not cleaning up test data                 | Tests interfere with each other                            | Use fixtures with teardown or database transactions                                                                                                                                   |
| Shared `page` or `context` in `beforeAll` | State leak between tests; flaky when tests run in parallel | Keep the default one context per test; a fixture seeds the state and hands over the ready page object                                                                              |
| Backend/DB state shared across workers    | Tests in different workers collide on same data            | Use worker-scoped fixture with `workerInfo.workerIndex` to create unique data per worker                                                                                              |

## Related References

- **Page Objects with fixtures**: See [page-object-model.md](page-object-model.md) for POM patterns
- **Test organization**: See [test-suite-structure.md](test-suite-structure.md) for test structure
- **Debugging fixture issues**: See [debugging.md](../debugging/debugging.md) for troubleshooting
