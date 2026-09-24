# Page Object Model (POM)

## Table of Contents

1. [Overview](#overview)
2. [Basic Structure](#basic-structure)
3. [Helper Objects](#helper-objects)
4. [Composition Patterns](#composition-patterns)
5. [Factory Functions](#factory-functions)
6. [Best Practices](#best-practices)

## Overview

Page Object Model encapsulates page structure and interactions, providing:

- **Maintainability**: Change selectors in one place
- **Reusability**: Share page interactions across tests
- **Readability**: Tests express intent, not implementation

## Basic Structure

### Page Class

Locators are `public readonly` fields, alphabetical, assigned in the constructor. `page` is `private readonly` and declared after them. Action methods never assert; assertions live in `expect*` methods wrapped in a boxed step so a failure points at the spec line.

```ts
// e2e/login/pages/login.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { Credentials } from '../common/login.type';

export class LoginPage {
  public readonly emailInput: Locator;
  public readonly errorMessage: Locator;
  public readonly passwordInput: Locator;
  public readonly submitButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.errorMessage = page.getByRole('alert');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  public async login(credentials: Credentials): Promise<void> {
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.submitButton.click();
  }

  public async expectError(message: string): Promise<void> {
    await test.step(`THEN error message contains "${message}"`, (): Promise<void> => expect(this.errorMessage).toContainText(message), { box: true });
  }
}
```

### Usage in Tests

The spec receives `loginPage` from `login.fixture.ts` (see [Using with Fixtures](#using-with-fixtures)) and never constructs a page object or touches a locator.

```ts
// e2e/login/login.e2e.ts
import type { Credentials } from './common/login.type';
import { expect, test } from './login.fixture';
import { USER_STUB } from './test/stubs/login.stub';

test.describe('FEATURE: login', () => {
  test.describe('GIVEN the login page is open', () => {
    test.beforeEach(async ({ loginPage }): Promise<void> => {
      await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());
    });

    test('SCENARIO: valid credentials open the dashboard', async ({ loginPage, page }): Promise<void> => {
      await test.step('WHEN valid credentials are submitted', (): Promise<void> => loginPage.login(USER_STUB));

      await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));
    });

    test('SCENARIO: wrong password shows the error banner', async ({ loginPage }): Promise<void> => {
      const user: Credentials = { ...USER_STUB, password: 'wrong' };

      await test.step('WHEN the wrong password is submitted', (): Promise<void> => loginPage.login(user));

      await test.step('THEN the error reports invalid credentials', (): Promise<void> => loginPage.expectError('Invalid credentials'));
    });
  });
});
```

## Helper Objects

A widget that appears on several pages is a helper object. It takes a `Locator` root, never `page`, so the same class serves any container. Members follow the page-object rules: locators first, root last, assertions boxed.

```ts
// e2e/dashboard/helpers/modal.helper.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ModalHelper {
  public readonly closeButton: Locator;
  public readonly confirmButton: Locator;
  public readonly title: Locator;

  private readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.closeButton = root.getByRole('button', { name: 'Close' });
    this.confirmButton = root.getByRole('button', { name: 'Confirm' });
    this.title = root.getByRole('heading');
  }

  public async close(): Promise<void> {
    await this.closeButton.click();
  }

  public async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  public async expectTitle(title: string): Promise<void> {
    await test.step(`THEN modal title reads "${title}"`, (): Promise<void> => expect(this.title).toHaveText(title), { box: true });
  }

  public async expectOpen(): Promise<void> {
    await test.step('THEN modal is open', (): Promise<void> => expect(this.root).toBeVisible(), { box: true });
  }
}
```

A `NavbarHelper` is built the same way from `page.getByRole('navigation')`: `logo`, `searchInput`, `userMenu` locators scoped to the root, plus `search(query)` (fill, press `Enter`) and `openUserMenu()` actions.

## Composition Patterns

### Page with Helpers

A page object holds helper objects as `public readonly` fields and passes each one its root locator in the constructor. A page never extends another page.

```ts
// e2e/dashboard/pages/dashboard.page.ts
import type { Locator, Page } from '@playwright/test';

import { ModalHelper } from '../helpers/modal.helper';
import { NavbarHelper } from '../helpers/navbar.helper';

export class DashboardPage {
  public readonly navbar: NavbarHelper;
  public readonly newProjectButton: Locator;
  public readonly projectModal: ModalHelper;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.navbar = new NavbarHelper(page.getByRole('navigation'));
    this.newProjectButton = page.getByRole('button', { name: 'New Project' });
    this.projectModal = new ModalHelper(page.getByRole('dialog'));
  }

  public async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  public async openNewProject(): Promise<void> {
    await this.newProjectButton.click();
  }
}
```

The spec reaches the helper through the page: `dashboardPage.projectModal.expectTitle('New Project')`.

### Page Navigation

A navigation method returns `Promise<void>`. The destination page object is a separate fixture, so the next step names it directly instead of receiving it as a return value. No `BasePage`; pages share behaviour through helpers and utils, not inheritance.

| Upstream pattern | House shape |
|---|---|
| `abstract class BasePage` with `goto()` and `getTitle()` | Each page declares its own `goto()`; `expect(page).toHaveTitle(...)` in a spec step covers the title |
| `login()` returns `new DashboardPage(this.page)` | `login()` returns `Promise<void>`; the test destructures `dashboardPage` from the fixture |

## Factory Functions

Not used. A factory returning an object literal of closures cannot follow the member, accessibility, and return-type rules in [house-style.md](house-style.md#page-objects). Every page object is a `class`.

## Best Practices

### Do

- **Keep locators in page objects** - Single source of truth
- **Inject page objects through fixtures** - The spec never calls `new`
- **Expose locators as `public readonly`** - The spec can pass them to `expect(page).toHaveScreenshot` or a mask
- **Use descriptive method names** - `submitOrder()` not `clickButton()`
- **Keep methods focused** - One action per method; a method with an `if` is two methods

### Don't

- **Don't assert in action methods** - Assertions only in `expect*` methods, each a boxed step
- **Don't expose implementation details** - Hide complex interactions
- **Don't make page objects too large** - Over 150 lines, split into a page plus helpers
- **Don't share state** between page object instances
- **Don't extend** another page object

### Directory Structure

```text
e2e/
  login/
    login.e2e.ts
    login.fixture.ts
    pages/
      login.page.ts
  dashboard/
    dashboard.e2e.ts
    dashboard.fixture.ts
    helpers/
      modal.helper.ts
      navbar.helper.ts
      table.helper.ts
    pages/
      dashboard.page.ts
      settings.page.ts
```

### Using with Fixtures

```ts
// e2e/login/login.fixture.ts
import { test as base } from '@playwright/test';

import { DashboardPage } from '../dashboard/pages/dashboard.page';
import { LoginPage } from './pages/login.page';

type LoginFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly loginPage: LoginPage;
};

export const test = base.extend<LoginFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  loginPage: async ({ page }, use): Promise<void> => {
    await use(new LoginPage(page));
  }
});

export { expect } from '@playwright/test';
```

The spec in [Usage in Tests](#usage-in-tests) imports `test` and `expect` from this file.

## Related References

- **Locator strategies**: See [locators.md](locators.md) for selecting elements
- **Fixtures**: See [fixtures-hooks.md](fixtures-hooks.md) for advanced fixture patterns
- **Test organization**: See [test-suite-structure.md](test-suite-structure.md) for structuring test suites
