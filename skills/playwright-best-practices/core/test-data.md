# Test Data Factories & Generators

This file covers **reusable test data builders** (stubs, builders, Faker, data sources). For related topics:

- **Per-test database fixtures** (isolation, transaction rollback): See [fixtures-hooks.md](fixtures-hooks.md#database-fixtures)
- **One-time database setup** (migrations, snapshots): See [global-setup.md](global-setup.md#database-patterns)

Under the house layout a "factory" is two files: a typed base value `<TYPE>_STUB` in `test/stubs/` and a builder function in `test/utils/<x>-builder.spec.util.ts` that spreads the stub, applies sequence or random values, then applies overrides. Types live in `common/<feature>.type.ts`.

## Table of Contents

1. [Factory Pattern](#factory-pattern)
2. [Faker Integration](#faker-integration)
3. [Data-Driven Testing](#data-driven-testing)
4. [Test Data Fixtures](#test-data-fixtures)
5. [Database Seeding](#database-seeding)

## Factory Pattern

### Basic Factory

```ts
// e2e/users/common/users.type.ts
export type Role = 'admin' | 'guest' | 'user';

export type User = {
  readonly createdAt: Date;
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly role: Role;
};
```

```ts
// e2e/users/test/stubs/user.stub.ts
import type { User } from '../../common/users.type';

export const USER_STUB: User = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  email: 'user@test.com',
  id: 'user-1',
  name: 'Test User',
  role: 'user'
};
```

The builder owns the counter so every call yields a unique id and email. `buildUser()` returns a plain user; `buildUser({ name: 'Admin User', role: 'admin' })` overrides two fields.

```ts
// e2e/users/test/utils/user-builder.spec.util.ts
import type { User } from '../../common/users.type';
import { USER_STUB } from '../stubs/user.stub';

let userIdCounter = 0;

export const buildUser = (overrides: Partial<User> = {}): User => {
  userIdCounter += 1;

  const user: User = {
    ...USER_STUB,
    createdAt: new Date(),
    email: `user${userIdCounter}@test.com`,
    id: `user-${userIdCounter}`,
    name: `Test User ${userIdCounter}`,
    ...overrides
  };

  return user;
};
```

### Factory with Traits

A trait is a named `Partial<Product>` applied before the overrides. `buildProduct({}, 'featured')`, `buildProduct({ name: 'Sale Item' }, 'sale', 'featured')`, and `buildProduct({}, 'outOfStock')` all go through the same function. `PRODUCT_STUB` in `test/stubs/product.stub.ts` follows the user stub shape.

```ts
// e2e/catalog/common/catalog.type.ts
export type Product = {
  readonly category: string;
  readonly featured: boolean;
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly stock: number;
};

export type ProductTrait = 'expensive' | 'featured' | 'outOfStock' | 'sale';
```

```ts
// e2e/catalog/test/utils/product-builder.spec.util.ts
import type { Product, ProductTrait } from '../../common/catalog.type';
import { PRODUCT_STUB } from '../stubs/product.stub';

const EXPENSIVE_TRAIT: Partial<Product> = { price: 999.99 };
const FEATURED_TRAIT: Partial<Product> = { featured: true };
const OUT_OF_STOCK_TRAIT: Partial<Product> = { stock: 0 };
const SALE_TRAIT: Partial<Product> = { price: 9.99 };

const TRAITS: Record<ProductTrait, Partial<Product>> = {
  expensive: EXPENSIVE_TRAIT,
  featured: FEATURED_TRAIT,
  outOfStock: OUT_OF_STOCK_TRAIT,
  sale: SALE_TRAIT
};

let productIdCounter = 0;

const mergeTrait = (product: Partial<Product>, trait: ProductTrait): Partial<Product> => {
  const merged: Partial<Product> = { ...product, ...TRAITS[trait] };

  return merged;
};

export const buildProduct = (overrides: Partial<Product> = {}, ...traitNames: ProductTrait[]): Product => {
  productIdCounter += 1;

  const appliedTraits = traitNames.reduce(mergeTrait, {});
  const product: Product = {
    ...PRODUCT_STUB,
    id: `prod-${productIdCounter}`,
    name: `Product ${productIdCounter}`,
    ...appliedTraits,
    ...overrides
  };

  return product;
};
```

### Factory with Relationships

A builder composes other builders for its defaults and derives computed fields. `buildOrder()` gets a fresh user and one line; `buildOrder({ items: [buildOrderItem({ product: buildProduct({ price: 100 }), quantity: 5 })] })` overrides the lines and the total follows.

```ts
// e2e/orders/common/orders.type.ts
import type { Product } from '../../catalog/common/catalog.type';
import type { User } from '../../users/common/users.type';

export type OrderItem = {
  readonly product: Product;
  readonly quantity: number;
};

export type OrderStatus = 'delivered' | 'paid' | 'pending' | 'shipped';

export type Order = {
  readonly id: string;
  readonly items: OrderItem[];
  readonly status: OrderStatus;
  readonly total: number;
  readonly user: User;
};
```

```ts
// e2e/orders/test/utils/order-builder.spec.util.ts
import { buildProduct } from '../../../catalog/test/utils/product-builder.spec.util';
import { buildUser } from '../../../users/test/utils/user-builder.spec.util';
import type { Order, OrderItem } from '../../common/orders.type';

let orderIdCounter = 0;

const addLineTotal = (sum: number, item: OrderItem): number => sum + item.product.price * item.quantity;

export const buildOrderItem = (overrides: Partial<OrderItem> = {}): OrderItem => {
  const item: OrderItem = { product: buildProduct(), quantity: 1, ...overrides };

  return item;
};

export const buildOrder = (overrides: Partial<Order> = {}): Order => {
  orderIdCounter += 1;

  const user = overrides.user ?? buildUser();
  const items = overrides.items ?? [buildOrderItem()];
  const total = items.reduce(addLineTotal, 0);
  const order: Order = {
    id: `order-${orderIdCounter}`,
    items,
    status: 'pending',
    total,
    user,
    ...overrides
  };

  return order;
};
```

## Faker Integration

### Setup Faker

```bash
npm install -D @faker-js/faker
```

A Faker builder is a builder like any other; it lives in `test/utils/` and never in `stubs/`.

```ts
// e2e/signup/common/signup.type.ts
export type Address = {
  readonly city: string;
  readonly country: string;
  readonly street: string;
  readonly zipCode: string;
};

export type Applicant = {
  readonly address: Address;
  readonly avatar: string;
  readonly email: string;
  readonly id: string;
  readonly name: string;
};
```

```ts
// e2e/signup/test/utils/applicant-builder.spec.util.ts
import { faker } from '@faker-js/faker';

import type { Address, Applicant } from '../../common/signup.type';

const buildAddress = (): Address => {
  const address: Address = {
    city: faker.location.city(),
    country: faker.location.country(),
    street: faker.location.streetAddress(),
    zipCode: faker.location.zipCode()
  };

  return address;
};

export const buildApplicant = (overrides: Partial<Applicant> = {}): Applicant => {
  const applicant: Applicant = {
    address: buildAddress(),
    avatar: faker.image.avatar(),
    email: faker.internet.email(),
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    ...overrides
  };

  return applicant;
};
```

### Seeded Faker for Reproducibility

`faker.seed(n)` makes every later call deterministic. Same seed, same data.

| Where | Call | Effect |
|---|---|---|
| Top of the builder module | `faker.seed(12345)` | Whole run is reproducible; every worker starts the same sequence |
| Fixture, before `use` | `faker.seed(testInfo.title.length)` | Each test gets its own stable sequence (next section) |
| Above the first step of one test | `faker.seed(42)` | One test pinned while the rest stay random |

### Faker Fixture

The fixture seeds per test and exposes the instance, so a spec that needs a one-off value asks the fixture instead of importing Faker.

```ts
// e2e/signup/signup.fixture.ts
import type { Faker } from '@faker-js/faker';
import { faker } from '@faker-js/faker';
import { test as base } from '@playwright/test';

import { SignupPage } from './pages/signup.page';

type SignupFixtures = {
  readonly fake: Faker;
  readonly signupPage: SignupPage;
};

export const test = base.extend<SignupFixtures>({
  fake: async ({}, use, testInfo): Promise<void> => {
    faker.seed(testInfo.title.length);
    await use(faker);
  },
  signupPage: async ({ page }, use): Promise<void> => {
    await use(new SignupPage(page));
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/signup/signup.spec.ts
import { test } from './signup.fixture';
import { buildApplicant } from './test/utils/applicant-builder.spec.util';

test.describe('FEATURE: signup', () => {
  test.describe('GIVEN a new visitor', () => {
    test('submitting the form with generated data opens the welcome page', async ({ fake, signupPage }): Promise<void> => {
      const applicant = buildApplicant({ name: fake.person.fullName() });

      await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());

      await test.step('WHEN the form is submitted', (): Promise<void> => signupPage.submit(applicant));

      await test.step('THEN the welcome page is shown', (): Promise<void> => signupPage.expectWelcome());
    });
  });
});
```

## Data-Driven Testing

### test.each with Arrays

Playwright has no `test.each`; a `for` loop over a typed array registers one test per row. The rows are a stub because they are fixed values.

```ts
// e2e/login/test/stubs/login-scenario.stub.ts
import type { LoginScenario } from '../../common/login.type';

export const LOGIN_SCENARIOS: LoginScenario[] = [
  { email: 'user@example.com', expected: 'Dashboard', password: 'pass123' },
  { email: 'admin@example.com', expected: 'Admin Panel', password: 'admin123' },
  { email: 'invalid@example.com', expected: 'Invalid credentials', password: 'wrong' }
];
```

```ts
// e2e/login/login.spec.ts
import { test } from './login.fixture';
import { LOGIN_SCENARIOS } from './test/stubs/login-scenario.stub';

test.describe('FEATURE: login', () => {
  test.describe('GIVEN the login page is open', () => {
    test.beforeEach(async ({ loginPage }): Promise<void> => {
      await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());
    });

    for (const scenario of LOGIN_SCENARIOS) {
      test(`${scenario.email} signing in shows "${scenario.expected}"`, async ({ loginPage }): Promise<void> => {
        await test.step('WHEN the credentials are submitted', (): Promise<void> => loginPage.submit(scenario));

        await test.step('THEN the expected text is visible', (): Promise<void> => loginPage.expectText(scenario.expected));
      });
    }
  });
});
```

### Parameterized Tests

Larger scenario tables keep the same loop; only the stub grows. Give each row a `name` so the generated title reads as a sentence: `` test(`choosing ${scenario.name} shows the cost and ETA`, …) ``.

```ts
// e2e/checkout/test/stubs/shipping-scenario.stub.ts
import type { ShippingScenario } from '../../common/checkout.type';

export const SHIPPING_SCENARIOS: ShippingScenario[] = [
  { expectedCost: '$5.99', expectedDays: '5-7 business days', name: 'standard shipping', shipping: 'standard' },
  { expectedCost: '$14.99', expectedDays: '2-3 business days', name: 'express shipping', shipping: 'express' },
  { expectedCost: '$29.99', expectedDays: 'Next business day', name: 'overnight shipping', shipping: 'overnight' }
];
```

### CSV/JSON Data Source

Rows that come from a file are read once by a util; the file is an on-disk fixture under `test/fixtures/`. `JSON.parse` returns `any`, so the result is assigned to a typed `const` at the boundary. The spec loops over `readSearchCases()` exactly like the login loop above.

```ts
// e2e/search/test/utils/search-cases.spec.util.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { SearchCase } from '../../common/search.type';

const CASES_PATH = resolve(__dirname, '../fixtures/search-tests.json');

export const readSearchCases = (): SearchCase[] => {
  const raw = readFileSync(CASES_PATH, 'utf-8');
  const cases: SearchCase[] = JSON.parse(raw);

  return cases;
};
```

## Test Data Fixtures

### Fixture with Factory

A data fixture builds the values and installs the route mock before `use`, so the spec receives data that the app already serves. The route handler is a factory in `test/mocks/`.

```ts
// e2e/catalog/test/mocks/products.mock.ts
import type { Route } from '@playwright/test';

import type { Product } from '../../common/catalog.type';

type RouteHandler = (route: Route) => Promise<void>;

export const productsMock = (products: Product[]): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: products });
};
```

```ts
// e2e/catalog/catalog.fixture.ts
import { test as base } from '@playwright/test';

import type { User } from '../users/common/users.type';
import { buildUser } from '../users/test/utils/user-builder.spec.util';
import type { Product } from './common/catalog.type';
import { CatalogPage } from './pages/catalog.page';
import { productsMock } from './test/mocks/products.mock';
import { userMock } from './test/mocks/user.mock';
import { buildProduct } from './test/utils/product-builder.spec.util';

type CatalogFixtures = {
  readonly catalogPage: CatalogPage;
  readonly testProducts: Product[];
  readonly testUser: User;
};

export const test = base.extend<CatalogFixtures>({
  catalogPage: async ({ page }, use): Promise<void> => {
    await use(new CatalogPage(page));
  },
  testProducts: async ({ page }, use): Promise<void> => {
    const products = [
      buildProduct({ name: 'Test Product 1' }),
      buildProduct({ name: 'Test Product 2' }),
      buildProduct({ name: 'Test Product 3' })
    ];

    await page.route('**/api/products', productsMock(products));
    await use(products);
  },
  testUser: async ({ page }, use): Promise<void> => {
    const user = buildUser({ name: 'E2E Test User' });

    await page.route('**/api/user', userMock(user));
    await use(user);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/catalog/catalog.spec.ts
import { test } from './catalog.fixture';

test.describe('FEATURE: catalog', () => {
  test.describe('GIVEN stubbed products and a stubbed user', () => {
    test('opening the catalog lists the first product', async ({ catalogPage, testProducts, testUser }): Promise<void> => {
      await test.step('WHEN the catalog is opened', (): Promise<void> => catalogPage.goto());

      await test.step('THEN the greeting names the user', (): Promise<void> => catalogPage.expectGreeting(testUser.name));

      await test.step('AND the first product is listed', (): Promise<void> => catalogPage.expectProductListed(testProducts[0].name));
    });
  });
});
```

## Database Seeding

### API-Based Seeding

`seedUser` posts a built user to a test-only endpoint and records the id. The `createdUserIds` fixture deletes every recorded id after the test, so cleanup runs even when the test fails.

```ts
// e2e/users/users.fixture.ts
import type { APIRequestContext } from '@playwright/test';
import { test as base } from '@playwright/test';

import type { User } from './common/users.type';
import { ProfilePage } from './pages/profile.page';
import { buildUser } from './test/utils/user-builder.spec.util';

type SeedUser = (overrides?: Partial<User>) => Promise<User>;

type UsersFixtures = {
  readonly createdUserIds: string[];
  readonly profilePage: ProfilePage;
  readonly seedUser: SeedUser;
};

const seedUserWith = (request: APIRequestContext, createdUserIds: string[]): SeedUser => {
  return async (overrides: Partial<User> = {}): Promise<User> => {
    const response = await request.post('/api/test/users', { data: buildUser(overrides) });
    const user: User = await response.json();

    createdUserIds.push(user.id);

    return user;
  };
};

export const test = base.extend<UsersFixtures>({
  createdUserIds: async ({ request }, use): Promise<void> => {
    const ids: string[] = [];

    await use(ids);

    for (const id of ids) {
      await request.delete(`/api/test/users/${id}`);
    }
  },
  profilePage: async ({ page }, use): Promise<void> => {
    await use(new ProfilePage(page));
  },
  seedUser: async ({ createdUserIds, request }, use): Promise<void> => {
    await use(seedUserWith(request, createdUserIds));
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/users/users.spec.ts
import type { User } from './common/users.type';
import { test } from './users.fixture';

test.describe('FEATURE: user profile', () => {
  test.describe('GIVEN a seeded user', () => {
    test('opening the profile shows the name', async ({ profilePage, seedUser }): Promise<void> => {
      const user = await test.step('GIVEN a user is seeded', (): Promise<User> => seedUser({ name: 'John Doe' }));

      await test.step('WHEN the profile page is opened', (): Promise<void> => profilePage.goto(user.id));

      await test.step('THEN the profile names the user', (): Promise<void> => profilePage.expectName(user.name));
    });
  });
});
```

### Transaction Rollback Seeding

Each test runs inside one transaction that is rolled back after `use`, so nothing it inserts survives. `DATABASE_URL` comes from `common/playwright.const.ts`.

```ts
// e2e/db/common/db.type.ts
import type { QueryResult } from 'pg';

export type Row = Record<string, unknown>;

export type DbTransaction = {
  readonly query: (sql: string, params?: unknown[]) => Promise<QueryResult<Row>>;
  readonly seed: (table: string, data: Row) => Promise<Row>;
};
```

```ts
// e2e/db/db.fixture.ts
import { test as base } from '@playwright/test';
import type { PoolClient, QueryResult } from 'pg';
import { Pool } from 'pg';

import { DATABASE_URL } from '../common/playwright.const';
import type { DbTransaction, Row } from './common/db.type';

type DbFixtures = {
  readonly db: DbTransaction;
};

const pool = new Pool({ connectionString: DATABASE_URL });

const insertSql = (table: string, keys: string[]): string => {
  const placeholders = Array.from(keys.keys(), (index: number): string => `$${index + 1}`);

  return `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
};

const transactionFor = (client: PoolClient): DbTransaction => {
  const transaction: DbTransaction = {
    query: (sql: string, params: unknown[] = []): Promise<QueryResult<Row>> => client.query(sql, params),
    seed: async (table: string, data: Row): Promise<Row> => {
      const result = await client.query(insertSql(table, Object.keys(data)), Object.values(data));

      return result.rows[0];
    }
  };

  return transaction;
};

export const test = base.extend<DbFixtures>({
  db: async ({}, use): Promise<void> => {
    const client = await pool.connect();

    await client.query('BEGIN');
    await use(transactionFor(client));
    await client.query('ROLLBACK');
    client.release();
  }
});

export { expect } from '@playwright/test';
```

## Anti-Patterns to Avoid

| Anti-Pattern                    | Problem                         | Solution                   |
| ------------------------------- | ------------------------------- | -------------------------- |
| Hardcoded test data             | Brittle, repetitive             | Stub plus builder          |
| Random data without seed        | Non-reproducible failures       | Seed faker per test        |
| Shared mutable test data        | Tests interfere with each other | Create fresh data per test |
| Manual data creation everywhere | Duplication, maintenance burden | Centralize in `test/utils/` builders |

## Related References

- **Fixtures**: See [fixtures-hooks.md](fixtures-hooks.md) for fixture patterns
- **API Testing**: See [test-suite-structure.md](test-suite-structure.md) for API mocking
