# Organizing Reusable Test Code

## Table of Contents

1. [Pattern Comparison](#pattern-comparison)
2. [Selection Flowchart](#selection-flowchart)
3. [Page Objects](#page-objects)
4. [Custom Fixtures](#custom-fixtures)
5. [Helper Functions](#helper-functions)
6. [Combined Project Structure](#combined-project-structure)
7. [Anti-Patterns](#anti-patterns)

Use all three patterns together. Most projects benefit from a hybrid approach:

- **Page objects** for UI interaction (pages/components with 5+ interactions)
- **Custom fixtures** for test infrastructure (auth state, database, API clients, anything with lifecycle)
- **Helper functions** for stateless utilities (generate data, format values, build URLs)

If only using one pattern, choose **custom fixtures**. They handle setup/teardown, compose well, and Playwright is built around them.

Every sample below belongs to the `booking` feature and follows the layout in `core/house-style.md`.

## Pattern Comparison

| Aspect | Page Objects | Custom Fixtures | Helper Functions |
|---|---|---|---|
| **Purpose** | Encapsulate UI interactions | Provide resources with setup/teardown | Stateless utilities |
| **Lifecycle** | Manual (constructor/methods) | Built-in (`use()` with automatic teardown) | None |
| **Composability** | Constructor injection or fixture wiring | Depend on other fixtures | Call other functions |
| **Location** | `pages/`, `components/` | `<feature>.fixture.ts` | `test/utils/*.spec.util.ts`, `utils/*.util.ts` |
| **Best for** | Pages with many reused interactions | Resources needing setup AND teardown | Simple logic with no side effects |

## Selection Flowchart

```text
What kind of reusable code?
|
+-- Interacts with browser page/component?
|   |
|   +-- Has 5+ interactions (fill, click, navigate, assert)?
|   |   +-- YES: Used in 3+ test files?
|   |   |   +-- YES --> PAGE OBJECT
|   |   |   +-- NO --> Inline or small helper
|   |   +-- NO --> HELPER FUNCTION
|   |
|   +-- Needs setup before AND cleanup after test?
|       +-- YES --> CUSTOM FIXTURE
|       +-- NO --> PAGE OBJECT method or HELPER
|
+-- Manages resource with lifecycle (create/destroy)?
|   +-- Examples: auth state, DB connection, API client, test user
|   +-- YES --> CUSTOM FIXTURE (always)
|
+-- Stateless utility? (no browser, no side effects)
|   +-- Examples: random email, format date, build URL, parse response
|   +-- YES --> HELPER FUNCTION
|
+-- Not sure?
    +-- Start with HELPER FUNCTION
    +-- Promote to PAGE OBJECT when interactions grow
    +-- Promote to FIXTURE when lifecycle needed
```

## Page Objects

Best for pages/components with 5+ interactions appearing in 3+ test files. The booking form takes a named `BookingDetails` type, so the method signature has no inline object literal.

```ts
// e2e/booking/common/booking.type.ts
export type BookingDetails = {
  readonly date: string;
  readonly guests: number;
  readonly room: string;
};

export type MemberDraft = {
  readonly email: string;
  readonly name: string;
  readonly password: string;
};

export type Member = MemberDraft & {
  readonly id: string;
};
```

```ts
// e2e/booking/pages/booking.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { BookingDetails } from '../common/booking.type';

export class BookingPage {
  public readonly confirmationText: Locator;
  public readonly dateField: Locator;
  public readonly guestCount: Locator;
  public readonly reserveButton: Locator;
  public readonly roomType: Locator;
  public readonly totalPrice: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.confirmationText = page.getByText('Reservation confirmed');
    this.dateField = page.getByLabel('Check-in date');
    this.guestCount = page.getByLabel('Guests');
    this.reserveButton = page.getByRole('button', { name: 'Reserve' });
    this.roomType = page.getByLabel('Room type');
    this.totalPrice = page.getByTestId('total-price');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/booking');
  }

  public async fillDetails(details: BookingDetails): Promise<void> {
    await this.dateField.fill(details.date);
    await this.guestCount.fill(String(details.guests));
    await this.roomType.selectOption(details.room);
  }

  public async reserve(): Promise<void> {
    await this.reserveButton.click();
    await this.page.waitForURL('**/confirmation');
  }

  public async expectConfirmed(): Promise<void> {
    await test.step('confirmation message is shown', (): Promise<void> => expect(this.confirmationText).toBeVisible(), { box: true });
  }

  public async expectPrice(amount: string): Promise<void> {
    await test.step(`total price reads ${amount}`, (): Promise<void> => expect(this.totalPrice).toHaveText(amount), { box: true });
  }
}
```

The spec receives the page object from the fixture in the next section and never constructs it. `BOOKING_DETAILS_STUB` is a typed base value in `test/stubs/booking.stub.ts`; the case overrides only the field it asserts on.

```ts
// e2e/booking/booking.spec.ts
import type { BookingDetails } from './common/booking.type';
import { test } from './booking.fixture';
import { BOOKING_DETAILS_STUB } from './test/stubs/booking.stub';

test.describe('FEATURE: booking', () => {
  test.describe('GIVEN the booking page is open', () => {
    test.beforeEach(async ({ bookingPage }): Promise<void> => {
      await test.step('GIVEN the booking page is open', (): Promise<void> => bookingPage.goto());
    });

    test('SCENARIO: reserving a standard room shows the confirmation', async ({ bookingPage }): Promise<void> => {
      const details: BookingDetails = { ...BOOKING_DETAILS_STUB, room: 'standard' };

      await test.step('WHEN the booking details are filled', (): Promise<void> => bookingPage.fillDetails(details));

      await test.step('AND the room is reserved', (): Promise<void> => bookingPage.reserve());

      await test.step('THEN the confirmation message is shown', (): Promise<void> => bookingPage.expectConfirmed());
    });
  });
});
```

**Page object principles:**
- One class per logical page/component, not per URL
- `public constructor(page: Page)` assigns every field; `page` is `private readonly`, declared after the locators
- Locators are `public readonly` fields, alphabetical, assigned in the constructor
- Methods represent user intent (`reserve`, `fillDetails`), not low-level clicks
- Navigation methods (`goto`) belong on the page object
- Assertions live only in `expect*` methods, each a boxed `test.step`

## Custom Fixtures

Best for resources needing setup before and teardown after tests: auth state, database connections, API clients, test users. The `member` fixture seeds through `request` and deletes after `use`; `dashboardPage` depends on `member`, logs in through the login page object, and hands the spec a page object already on the dashboard, so no locator appears in the fixture file.

```ts
// e2e/booking/booking.fixture.ts
import { test as base } from '@playwright/test';

import type { Member } from './common/booking.type';
import { AccountPage } from './pages/account.page';
import { BookingPage } from './pages/booking.page';
import { DashboardPage } from './pages/dashboard.page';
import { LoginPage } from './pages/login.page';
import { memberDraft } from './test/utils/member-builder.spec.util';

type BookingFixtures = {
  readonly accountPage: AccountPage;
  readonly bookingPage: BookingPage;
  readonly dashboardPage: DashboardPage;
  readonly member: Member;
};

export const test = base.extend<BookingFixtures>({
  accountPage: async ({ page }, use): Promise<void> => {
    await use(new AccountPage(page));
  },
  bookingPage: async ({ page }, use): Promise<void> => {
    await use(new BookingPage(page));
  },
  dashboardPage: async ({ member, page }, use): Promise<void> => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.submit(member);
    await page.waitForURL('/dashboard');
    await use(new DashboardPage(page));
  },
  member: async ({ request }, use): Promise<void> => {
    const draft = memberDraft();
    const response = await request.post('/api/test/members', { data: draft });
    const member: Member = await response.json();

    await use(member);
    await request.delete(`/api/test/members/${member.id}`);
  }
});

export { expect } from '@playwright/test';
```

`DashboardPage` and `LoginPage` follow the page-object sample above; `DashboardPage` exposes `goto()` plus `expectWidgets()` and `expectWelcome(email)` as boxed steps.

```ts
// e2e/booking/dashboard.spec.ts
import { test } from './booking.fixture';

test.describe('FEATURE: dashboard', () => {
  test.describe('GIVEN a logged-in member', () => {
    test('SCENARIO: opening the dashboard shows the widgets', async ({ dashboardPage }): Promise<void> => {
      await test.step('WHEN the dashboard opens', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN the dashboard widgets are visible', (): Promise<void> => dashboardPage.expectWidgets());
    });

    test('SCENARIO: opening the dashboard greets the member by email', async ({ dashboardPage, member }): Promise<void> => {
      await test.step('WHEN the dashboard opens', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN the welcome prompt shows the member email', (): Promise<void> => dashboardPage.expectWelcome(member.email));
    });
  });
});
```

**Fixture principles:**
- Use `test.extend()`, never module-level variables
- Fixture shape is a named `type <Feature>Fixtures` with `readonly` members, alphabetical
- `use()` separates setup from teardown; teardown runs even if the test fails
- Fixtures compose: one can depend on another
- Fixtures are lazy: created only when requested
- Wrap page objects in fixtures for lifecycle management; a fixture that logs in returns the page object of the landing page, never a raw `Page`
- Re-export `expect` so specs have one import source

## Helper Functions

Best for stateless utilities: generating test data, formatting values, building URLs, parsing responses. Randomised builders live in `test/utils/<feature>-builder.spec.util.ts`; production-grade pure helpers such as a price formatter live in `utils/<behavior>.util.ts`.

```ts
// e2e/booking/test/utils/member-builder.spec.util.ts
import { randomUUID } from 'node:crypto';

import type { MemberDraft } from '../../common/booking.type';

export const generateEmail = (prefix = 'user'): string => {
  const suffix = randomUUID().slice(0, 8);

  return `${prefix}-${Date.now()}-${suffix}@test.local`;
};

export const memberDraft = (overrides: Partial<MemberDraft> = {}): MemberDraft => {
  const draft: MemberDraft = {
    email: generateEmail(),
    name: 'Test Member',
    password: 'SecurePass456!',
    ...overrides
  };

  return draft;
};
```

An assertion helper that takes `page` is a page-object concern in disguise. A notification that appears on several pages becomes a component object scoped to its root locator, exposed by each page as a `public readonly` field.

```ts
// e2e/booking/components/notification.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class NotificationComponent {
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
  }

  public async expectMessage(message: string): Promise<void> {
    const notification = this.root.filter({ hasText: message });

    await test.step(`notification reads "${message}" and dismisses`, async (): Promise<void> => {
      await expect(notification).toBeVisible();
      await expect(notification).toBeHidden({ timeout: 10_000 });
    }, { box: true });
  }
}
```

`AccountPage` wires `this.notification = new NotificationComponent(page.getByRole('alert'))` in its constructor and exposes `updateEmail(email)` and `expectEmail(email)`.

```ts
// e2e/booking/account.spec.ts
import { test } from './booking.fixture';
import { generateEmail } from './test/utils/member-builder.spec.util';

test.describe('FEATURE: account settings', () => {
  test.describe('GIVEN the account page is open', () => {
    test.beforeEach(async ({ accountPage }): Promise<void> => {
      await test.step('GIVEN the account page is open', (): Promise<void> => accountPage.goto());
    });

    test('SCENARIO: updating the email saves the new address', async ({ accountPage }): Promise<void> => {
      const newEmail = generateEmail('updated');

      await test.step('WHEN the new email is saved', (): Promise<void> => accountPage.updateEmail(newEmail));

      await test.step('THEN the notification confirms the update', (): Promise<void> => accountPage.notification.expectMessage('Account updated'));

      await test.step('AND the email field holds the new email', (): Promise<void> => accountPage.expectEmail(newEmail));
    });
  });
});
```

**Helper principles:**
- Pure functions with no side effects
- No browser state; a helper that needs `page` is a page-object or component method
- Promote to fixture if setup/teardown needed
- Promote to page object if many page interactions grow
- Keep small and focused

## Combined Project Structure

```text
e2e/
  playwright.config.ts
  playwright.fixture.ts
  booking/
    booking.spec.ts
    dashboard.spec.ts
    account.spec.ts
    booking.fixture.ts
    common/
      booking.type.ts
    components/
      notification.component.ts
    pages/
      account.page.ts
      booking.page.ts
      dashboard.page.ts
      login.page.ts
    test/
      stubs/
        booking.stub.ts
      utils/
        member-builder.spec.util.ts
    utils/
      price.util.ts
```

**Layer responsibilities:**

| Layer | Pattern | Responsibility |
|---|---|---|
| **Spec file** | `test()` with `test.step` | Describes behavior, orchestrates layers |
| **Fixtures** | `test.extend()` | Resource lifecycle: setup, provide, teardown |
| **Page objects** | Classes in `pages/`, `components/` | UI interaction: navigation, actions, locators, boxed assertions |
| **Helpers** | Functions in `test/utils/`, `utils/` | Utilities: data generation, formatting |

## Anti-Patterns

### Page object managing resources

Avoid a page object that seeds and deletes data:

```ts avoid
class LoginPage {
  async createUser() {}
  async deleteUser() {}
  async signIn(email: string, password: string) {}
}
```

Prefer: resource lifecycle belongs in a fixture such as `member` above, where teardown is guaranteed. Keep only `signIn` in the page object.

### Locator-only page objects

Avoid a class with locators and no intent:

```ts avoid
class LoginPage {
  emailInput = this.page.getByLabel('Email');
  passwordInput = this.page.getByLabel('Password');
  submitBtn = this.page.getByRole('button', { name: 'Sign in' });
  constructor(private page: Page) {}
}
```

Prefer: intent-revealing methods (`submit(credentials)`) plus `expect*` methods, or skip the page object entirely. Parameter properties are banned in every case.

### Monolithic fixtures

Avoid one fixture that seeds everything:

```ts avoid
test.extend({
  everything: async ({ page, request }, use) => {
    const user = await createUser(request);
    const products = await seedProducts(request, 50);
    await setupPayment(request, user.id);
    await page.goto('/dashboard');
    await use({ user, products, page });
  },
});
```

Prefer: small, composable fixtures (`member`, `loggedInPage`, `bookingPage`). Each fixture does one thing and depends on the others by name.

### Helpers with side effects

Avoid module-level state:

```ts avoid
let createdUserId: string;

export async function createTestUser(request: APIRequestContext) {
  const res = await request.post('/api/users', { data: { email: 'test@example.com' } });
  const user = await res.json();
  createdUserId = user.id;
  return user;
}
```

Prefer: module-level state leaks between parallel tests. If it has side effects and needs cleanup, make it a fixture.

### Over-abstracting simple operations

Avoid a helper for a one-liner:

```ts avoid
export async function clickButton(page: Page, name: string) {
  await page.getByRole('button', { name }).click();
}
```

Prefer: only abstract when there is real duplication (3+ usages) or complexity (5+ interactions). A single click belongs on the page object that owns the button.
