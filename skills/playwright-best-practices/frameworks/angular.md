# Angular Testing with Playwright

## Table of Contents

1. [Configuration](#configuration)
2. [Locator Strategies](#locator-strategies)
3. [Reactive Forms](#reactive-forms)
4. [Angular Material Components](#angular-material-components)
5. [Router Navigation](#router-navigation)
6. [Lazy-Loaded Modules](#lazy-loaded-modules)
7. [Signals and Observables](#signals-and-observables)
8. [Zone.js and Change Detection](#zonejs-and-change-detection)
9. [SSR Testing](#ssr-testing)
10. [Protractor Migration Reference](#protractor-migration-reference)
11. [Build Configurations](#build-configurations)
12. [CDK Overlay Container](#cdk-overlay-container)
13. [Anti-Patterns](#anti-patterns)
14. [Related](#related)

> **When to use**: Testing Angular applications with reactive forms, Angular Material components, Router navigation, lazy-loaded modules, signals, observables, and Zone.js change detection.
> **Prerequisites**: [house-style.md](../core/house-style.md), [core/configuration.md](../core/configuration.md), [core/locators.md](../core/locators.md)

## Configuration

### Playwright Config

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);
const BASE_URL = 'http://localhost:4200';

const use = { baseURL: BASE_URL, screenshot: 'only-on-failure', trace: 'on-first-retry' } as const;

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'mobile', use: devices['iPhone 14'] }
];

const webServer = {
  command: IS_CI ? 'npx ng build && npx http-server dist/my-app/browser -p 4200 -s' : 'npx ng serve',
  reuseExistingServer: !IS_CI,
  timeout: 120_000,
  url: BASE_URL
};

export default defineConfig({
  forbidOnly: IS_CI,
  fullyParallel: true,
  projects,
  retries: IS_CI ? 2 : 0,
  testDir: './e2e',
  testMatch: '**/*.@(e2e|test).ts',
  use,
  webServer,
  workers: IS_CI ? '50%' : undefined
});
```

### Project Structure

```text
my-angular-app/
  src/
  e2e/
    playwright.config.ts
    signup/
      signup.e2e.ts
      signup.fixture.ts
      pages/
        signup.page.ts
    members/
      members.e2e.ts
      members.fixture.ts
      pages/
        members.page.ts
  angular.json
```

### Package Scripts

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:headed": "playwright test --headed",
    "e2e:debug": "playwright test --debug",
    "e2e:report": "playwright show-report"
  }
}
```

## Locator Strategies

Angular generates internal attributes (`_ngcontent-*`, `_nghost-*`, `ng-reflect-*`) that change every build. Always use semantic locators: roles for Angular Material and native HTML, labels for form fields, test IDs for widgets without a role, and a scoped locator for a row inside a table.

```ts
// e2e/projects/pages/projects.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ProjectsPage {
  public readonly activeRow: Locator;
  public readonly chart: Locator;
  public readonly createHeading: Locator;
  public readonly editActiveButton: Locator;
  public readonly newProjectButton: Locator;
  public readonly projectTable: Locator;
  public readonly titleInput: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    const activeCell = page.getByRole('cell', { name: 'Active' });

    this.page = page;
    this.chart = page.getByTestId('metrics-chart');
    this.createHeading = page.getByRole('heading', { name: 'Create Project' });
    this.newProjectButton = page.getByRole('button', { name: 'New project' });
    this.projectTable = page.getByRole('table', { name: 'Projects' });
    this.activeRow = this.projectTable.getByRole('row').filter({ has: activeCell });
    this.editActiveButton = this.activeRow.getByRole('button', { name: 'Edit' });
    this.titleInput = page.getByLabel('Project title');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/projects');
  }

  public async startProject(title: string): Promise<void> {
    await this.newProjectButton.click();
    await this.titleInput.fill(title);
  }

  public async editActiveProject(): Promise<void> {
    await this.editActiveButton.click();
  }

  public async expectCreateForm(): Promise<void> {
    await test.step('THEN create heading is shown', (): Promise<void> => expect(this.createHeading).toBeVisible(), { box: true });
  }

  public async expectChart(): Promise<void> {
    await test.step('THEN metrics chart is shown', (): Promise<void> => expect(this.chart).toBeVisible(), { box: true });
  }
}
```

## Reactive Forms

Playwright interacts with the rendered DOM, so reactive forms (`FormGroup`, `FormControl`, `FormArray`) are transparent. The page object below covers required and format errors on blur, cross-field validation, and the submit button state.

```ts
// e2e/signup/pages/signup.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { SignupUser } from '../common/signup.type';

export class SignupPage {
  public readonly confirmInput: Locator;
  public readonly emailInput: Locator;
  public readonly nameInput: Locator;
  public readonly passwordInput: Locator;
  public readonly registerButton: Locator;
  public readonly termsCheckbox: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.confirmInput = page.getByLabel('Confirm password');
    this.emailInput = page.getByLabel('Email');
    this.nameInput = page.getByLabel('Name');
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.registerButton = page.getByRole('button', { name: 'Register' });
    this.termsCheckbox = page.getByLabel('Accept terms');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  public async blurEmailWith(value: string): Promise<void> {
    await this.emailInput.fill(value);
    await this.emailInput.blur();
  }

  public async fillPasswords(password: string, confirm: string): Promise<void> {
    await this.passwordInput.fill(password);
    await this.confirmInput.fill(confirm);
    await this.confirmInput.blur();
  }

  public async fill(user: SignupUser): Promise<void> {
    await this.nameInput.fill(user.name);
    await this.emailInput.fill(user.email);
    await this.fillPasswords(user.password, user.password);
    await this.termsCheckbox.check();
  }

  public async expectError(message: string): Promise<void> {
    await test.step(`THEN error "${message}" is shown`, (): Promise<void> => expect(this.page.getByText(message)).toBeVisible(), { box: true });
  }

  public async expectRegisterEnabled(enabled: boolean): Promise<void> {
    await test.step(`THEN register button enabled is ${enabled}`, (): Promise<void> => expect(this.registerButton).toBeEnabled({ enabled }), { box: true });
  }
}
```

`expectNoError(message)` mirrors `expectError` with `toBeHidden()`.

```ts
// e2e/signup/signup.e2e.ts
import { test } from './signup.fixture';
import { SIGNUP_USER_STUB } from './test/stubs/signup.stub';

test.describe('FEATURE: signup form validation', () => {
  test.describe('GIVEN the signup page', () => {
    test.beforeEach(async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());
    });

    test('SCENARIO: an empty email losing focus shows the required error', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN the empty email field loses focus', (): Promise<void> => signupPage.blurEmailWith(''));

      await test.step('THEN the required error is shown', (): Promise<void> => signupPage.expectError('Email is required'));
    });

    test('SCENARIO: an invalid email losing focus shows the format error', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN the email field loses focus with an invalid value', (): Promise<void> => signupPage.blurEmailWith('invalid'));

      await test.step('THEN the format error is shown', (): Promise<void> => signupPage.expectError('Invalid email format'));
    });

    test('SCENARIO: mismatched passwords show the mismatch error', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN mismatched passwords are filled', (): Promise<void> => signupPage.fillPasswords('Secret123!', 'Mismatch'));

      await test.step('THEN the mismatch error is shown', (): Promise<void> => signupPage.expectError('Passwords must match'));
    });

    test('SCENARIO: matching passwords clear the mismatch error', async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN mismatched passwords are filled', (): Promise<void> => signupPage.fillPasswords('Secret123!', 'Mismatch'));

      await test.step('WHEN matching passwords are filled', (): Promise<void> => signupPage.fillPasswords('Secret123!', 'Secret123!'));

      await test.step('THEN the mismatch error is gone', (): Promise<void> => signupPage.expectNoError('Passwords must match'));
    });

    test('SCENARIO: a valid form enables register', async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN register is disabled', (): Promise<void> => signupPage.expectRegisterEnabled(false));

      await test.step('WHEN a valid user is filled', (): Promise<void> => signupPage.fill(SIGNUP_USER_STUB));

      await test.step('THEN register is enabled', (): Promise<void> => signupPage.expectRegisterEnabled(true));
    });
  });
});
```

| Case | Page object call | Assertion |
|---|---|---|
| `FormArray` add | `contactsPage.addEmail()` then `contactsPage.fillEmail(1, 'backup@example.com')` | `expectEmailCount(2)` (`getByLabel(/Email address/)` count) |
| `FormArray` remove | `contactsPage.removeEmail(1)` (`Remove email 1` button) | `expectEmailCount(1)` and `expectEmail(0, 'backup@example.com')` |

An async validator shows a loading state while its request is in flight. The mock holds the response with `setTimeout` from `node:timers/promises`.

```ts
// e2e/signup/test/mocks/username-check.mock.ts
import { setTimeout as sleep } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { UsernameCheck } from '../../common/signup.type';
import { USERNAME_AVAILABLE_STUB } from '../stubs/username-check.stub';

export const slowUsernameCheckMock = (delayMs: number, check: UsernameCheck = USERNAME_AVAILABLE_STUB): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await sleep(delayMs);
    await route.fulfill({ json: check });
  };
};
```

```ts
// e2e/signup/signup.test.ts
import { test } from './signup.fixture';
import { slowUsernameCheckMock } from './test/mocks/username-check.mock';

test.describe('FEATURE: async username validator', () => {
  test.describe('GIVEN the username check takes 800ms', () => {
    test('SCENARIO: a username losing focus shows the loading state and resolves', async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN the username check is held for 800ms', (): Promise<void> => signupPage.routeUsernameCheck(slowUsernameCheckMock(800)));

      await test.step('AND the signup page is open', (): Promise<void> => signupPage.goto());

      await test.step('WHEN the username field loses focus', (): Promise<void> => signupPage.blurUsernameWith('alice'));

      await test.step('THEN the loading indicator is shown', (): Promise<void> => signupPage.expectUsernameLoading());

      await test.step('AND the loading indicator is gone and the name is available', (): Promise<void> => signupPage.expectUsernameAvailable());
    });
  });
});
```

`routeUsernameCheck(handler)` wraps `page.route('**/api/username-check*', handler)`; `expectUsernameLoading` asserts `getByTestId('username-loading')` visible; `expectUsernameAvailable` asserts it hidden and `Username available` visible in one boxed step.

## Angular Material Components

Angular Material uses proper ARIA attributes. Use role-based locators instead of CSS classes like `.mat-mdc-button`. A `mat-select` is a `combobox` whose options render in the CDK overlay.

```ts
// e2e/preferences/pages/preferences.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class PreferencesPage {
  public readonly languageSelect: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.languageSelect = page.getByRole('combobox', { name: 'Language' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/preferences');
  }

  public async chooseLanguage(language: string): Promise<void> {
    await this.languageSelect.click();
    await this.page.getByRole('option', { name: language }).click();
  }

  public async expectLanguage(language: string): Promise<void> {
    await test.step(`THEN language select reads ${language}`, (): Promise<void> => expect(this.languageSelect).toContainText(language), { box: true });
  }
}
```

```ts
// e2e/preferences/preferences.e2e.ts
import { test } from './preferences.fixture';

test.describe('FEATURE: material select', () => {
  test.describe('GIVEN the preferences page', () => {
    test('SCENARIO: choosing a language shows it in the select', async ({ preferencesPage }): Promise<void> => {
      await test.step('GIVEN the preferences page is open', (): Promise<void> => preferencesPage.goto());

      await test.step('WHEN Spanish is chosen', (): Promise<void> => preferencesPage.chooseLanguage('Spanish'));

      await test.step('THEN the select reads Spanish', (): Promise<void> => preferencesPage.expectLanguage('Spanish'));
    });
  });
});
```

| Component | Locators | Action | Assertion |
|---|---|---|---|
| `mat-autocomplete` | `combobox` named `Role`, `option` | `membersPage.typeRole('dev')` then `chooseRole('Developer')` | options `Developer` and `DevOps` visible, then `toHaveValue('Developer')` |
| `mat-dialog` | `dialog`, scoped `Cancel` button | `itemsPage.removeFirst()` then `cancelRemoval()` | dialog visible with `Confirm deletion?`, then hidden |
| `mat-table` sort | `columnheader` named `Name` | `membersPage.sortBy('Name')` twice | `toHaveAttribute('aria-sort', 'ascending')` then `'descending'` |
| `mat-paginator` | `Next page` button, `Items per page` combobox | `membersPage.nextPage()`, `setPageSize('50')` | `1 - 10 of 100`, `11 - 20 of 100`, `1 - 50 of 100` |
| `mat-snack-bar` | text `Changes saved`, `Close` button | `preferencesPage.save()` then `dismissToast()` | text visible, then hidden |
| `mat-stepper` | text `Step N of 3`, `Next` button | `wizardPage.completeStep({ Name: 'Bob' })`, `completeStep({ Organization: 'Acme' })` | `Step 3 of 3` shows `Bob` and `Acme` |

## Router Navigation

A router link is a client-side navigation; `waitForURL` after the click keeps the page object honest about where it landed. A route resolver runs before the component renders, so the page object waits for the resolver response as part of `goto`.

```ts
// e2e/items/pages/item.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ItemPage {
  public readonly heading: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
  }

  public async goto(id: number): Promise<void> {
    const resolverPromise = this.page.waitForResponse('**/api/items/*');

    await this.page.goto(`/items/${id}`);
    await resolverPromise;
  }

  public async expectHeading(text: string): Promise<void> {
    await test.step(`THEN heading contains ${text}`, (): Promise<void> => expect(this.heading).toContainText(text), { box: true });
  }
}
```

```ts
// e2e/navigation/navigation.e2e.ts
import { expect, test } from './navigation.fixture';

test.describe('FEATURE: angular router', () => {
  test.describe('GIVEN the home page', () => {
    test('SCENARIO: following the reports link renders the lazy module', async ({ homePage, reportsPage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      await test.step('WHEN the reports link is followed', (): Promise<void> => homePage.openReports());

      await test.step('THEN the reports dashboard heading is shown', (): Promise<void> => reportsPage.expectHeading());
    });
  });

  test.describe('GIVEN a signed-out visitor', () => {
    test('SCENARIO: opening a guarded route redirects to login', async ({ loginPage, page }): Promise<void> => {
      await test.step('WHEN admin settings are opened', async (): Promise<void> => {
        await page.goto('/admin/settings');
      });

      await test.step('THEN the login url is shown', (): Promise<void> => expect(page).toHaveURL(/\/login/));

      await test.step('AND the sign in heading is shown', (): Promise<void> => loginPage.expectHeading());
    });
  });

  test.describe('GIVEN an item with a resolver', () => {
    test('SCENARIO: opening the item renders the resolved data', async ({ itemPage }): Promise<void> => {
      await test.step('WHEN item 42 is opened', (): Promise<void> => itemPage.goto(42));

      await test.step('THEN the heading names the item', (): Promise<void> => itemPage.expectHeading('Item'));
    });
  });
});
```

`homePage.openReports()` clicks the `Reports` link and calls `page.waitForURL('/reports')`.

| Case | Page object call | Assertion |
|---|---|---|
| Nested `router-outlet` | `accountPage.goto('profile')` then `accountPage.openSection('Security')` (`waitForURL('/account/security')`) | `expectSection('Security')`: level-1 `Account` heading and level-2 section heading |
| Query parameters | `productsPage.goto('?type=hardware&page=3')` | `expectHeading('Hardware')` and `expectPage(3)` |
| Browser back | `homePage.openProducts()`, `homePage.openAbout()`, `homePage.goBack()` twice | `expect(page).toHaveURL(/\/products/)` then `/\/$/` |

## Lazy-Loaded Modules

A lazy route downloads its chunk on first navigation. The page object waits for the chunk response before asserting; a console fixture from [console-errors.md](console-errors.md#fail-test-on-any-error) collects errors and the util keeps only chunk failures.

```ts
// e2e/analytics/test/utils/chunk-errors.spec.util.ts
const isChunkError = (error: string): boolean => error.includes('ChunkLoadError') || error.includes('Loading chunk');

export const chunkErrors = (errors: string[]): string[] => errors.filter(isChunkError);
```

```ts
// e2e/analytics/pages/home.page.ts
import type { Locator, Page, Response } from '@playwright/test';

const isChunkResponse = (response: Response): boolean => response.url().includes('.js') && response.status() === 200;

export class HomePage {
  public readonly analyticsLink: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.analyticsLink = page.getByRole('link', { name: 'Analytics' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/');
  }

  public async openAnalytics(): Promise<void> {
    const chunkPromise = this.page.waitForResponse(isChunkResponse);

    await this.analyticsLink.click();
    await chunkPromise;
    await this.page.waitForURL('/analytics');
  }
}
```

```ts
// e2e/analytics/analytics.e2e.ts
import { expect, test } from './analytics.fixture';
import { chunkErrors } from './test/utils/chunk-errors.spec.util';

test.describe('FEATURE: lazy analytics module', () => {
  test.describe('GIVEN the home page', () => {
    test('SCENARIO: following the analytics link loads the chunk without errors', async ({ analyticsPage, consoleErrors, homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      await test.step('WHEN the analytics link is followed', (): Promise<void> => homePage.openAnalytics());

      await test.step('THEN the analytics heading is shown', (): Promise<void> => analyticsPage.expectHeading());

      const failures = await test.step('AND the chunk errors are collected', (): string[] => chunkErrors(consoleErrors));

      await test.step('AND no chunk error was logged', (): void => expect(failures).toEqual([]));
    });
  });
});
```

## Signals and Observables

Playwright cannot subscribe to observables or read signals directly. Test through the rendered output.

```ts
// e2e/counter/pages/counter.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class CounterPage {
  public readonly incrementButton: Locator;
  public readonly resetButton: Locator;
  public readonly value: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.incrementButton = page.getByRole('button', { name: 'Increment' });
    this.resetButton = page.getByRole('button', { name: 'Reset' });
    this.value = page.getByTestId('value');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/counter');
  }

  public async increment(): Promise<void> {
    await this.incrementButton.click();
  }

  public async reset(): Promise<void> {
    await this.resetButton.click();
  }

  public async expectValue(value: number): Promise<void> {
    await test.step(`THEN value reads ${value}`, (): Promise<void> => expect(this.value).toHaveText(String(value)), { box: true });
  }
}
```

```ts
// e2e/counter/counter.e2e.ts
import { test } from './counter.fixture';

test.describe('FEATURE: signal counter', () => {
  test.describe('GIVEN the counter page', () => {
    test.beforeEach(async ({ counterPage }): Promise<void> => {
      await test.step('GIVEN the counter page is open', (): Promise<void> => counterPage.goto());

      await test.step('AND the value reads 0', (): Promise<void> => counterPage.expectValue(0));
    });

    test('SCENARIO: clicking increment raises the value to 1', async ({ counterPage }): Promise<void> => {
      await test.step('WHEN increment is clicked', (): Promise<void> => counterPage.increment());

      await test.step('THEN the value reads 1', (): Promise<void> => counterPage.expectValue(1));
    });

    test('SCENARIO: clicking reset returns the value to 0', async ({ counterPage }): Promise<void> => {
      await test.step('GIVEN increment was clicked', (): Promise<void> => counterPage.increment());

      await test.step('WHEN reset is clicked', (): Promise<void> => counterPage.reset());

      await test.step('THEN the value reads 0', (): Promise<void> => counterPage.expectValue(0));
    });
  });
});
```

| Reactive source | Action | Assertion |
|---|---|---|
| `computed` signal (cart total) | `cartPage.goto()`, `catalogPage.add('$19.99')` (list item filtered by text), `catalogPage.openCart()` | `cartPage.expectTotal('$0.00')` then `'$19.99'` |
| `debounceTime` search | `searchPage.typeQuery('playwright')` (`pressSequentially` with `delay: 50`) with a recording mock, as in [react.md](react.md#testing-hooks-through-ui) | `expectResultCount(5)` and `expect(searchCalls.length).toBeLessThanOrEqual(2)` |
| `switchMap` cancellation | `searchPage.fillQuery('initial')` then `fillQuery('final')` | `expectFirstResult(/final/i)` |

## Zone.js and Change Detection

Angular uses Zone.js for change detection. Playwright does not depend on Zone.js and interacts with the DOM directly.

- **Change detection timing**: After interactions, Angular schedules change detection via Zone.js. Playwright's auto-waiting handles this.
- **Zoneless Angular**: Angular 17+ supports zoneless change detection. Tests work identically since Playwright waits for DOM changes.
- **Long-running async**: `setInterval` or long-running observables keep Angular "not stable." This does not affect Playwright (unlike Protractor).

## SSR Testing

The SSR build serves from `server.mjs`; the dev server takes `--ssr`. Only `webServer` changes.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);
const BASE_URL = 'http://localhost:4200';

const webServer = {
  command: IS_CI ? 'npx ng build --ssr && node dist/my-app/server/server.mjs' : 'npx ng serve --ssr',
  reuseExistingServer: !IS_CI,
  timeout: 180_000,
  url: BASE_URL
};

export default defineConfig({ webServer });
```

A hydration mismatch is logged as a console error mentioning `hydration`. The collector keeps those; the spec asserts the list is empty after the first interaction.

```ts
// e2e/home/test/utils/hydration.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';

export const collectHydrationError = (errors: string[], message: ConsoleMessage): void => {
  const isError = message.type() === 'error';
  const text = message.text();
  const isHydration = text.includes('hydration');

  if (isError && isHydration) errors.push(text);
};
```

```ts
// e2e/home/home.e2e.ts
import { expect, test } from './home.fixture';

test.describe('FEATURE: server-side rendering', () => {
  test.describe('GIVEN the home page', () => {
    test('SCENARIO: clicking the hydrated page logs no hydration error', async ({ homePage, hydrationErrors }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      await test.step('WHEN get started is clicked', (): Promise<void> => homePage.getStarted());

      await test.step('THEN no hydration error was logged', (): void => expect(hydrationErrors).toEqual([]));
    });
  });
});
```

The `hydrationErrors` fixture member registers `collectHydrationError` the same way `consoleErrors` does in [console-errors.md](console-errors.md#fail-test-on-any-error).

## Protractor Migration Reference

| Protractor | Playwright |
|---|---|
| `element(by.css('.btn'))` | `page.getByRole('button', { name: '...' })` |
| `element(by.id('login'))` | `page.getByTestId('login')` |
| `element(by.buttonText('Submit'))` | `page.getByRole('button', { name: 'Submit' })` |
| `element(by.model('user.name'))` | `page.getByLabel('Name')` |
| `element(by.binding('user.name'))` | `page.getByText(expectedValue)` |
| `element(by.repeater('item in items'))` | `page.getByRole('listitem')` |
| `browser.waitForAngular()` | Not needed — Playwright auto-waits |
| `browser.sleep(3000)` | `await expect(locator).toBeVisible()` |
| `browser.get('/path')` | `await page.goto('/path')` |
| `protractor.ExpectedConditions` | `await expect(locator).toBeVisible()` |

## Build Configurations

| Scenario | Command | Notes |
|---|---|---|
| Local dev | `npx ng serve` | Fast rebuild, source maps |
| CI production | `npx ng build && npx http-server dist/app/browser -p 4200 -s` | Tests production bundle |
| CI SSR | `npx ng build --ssr && node dist/app/server/server.mjs` | Tests server-side rendering |
| Staging | No `webServer` | Point `baseURL` to staging URL |

The `-s` flag on `http-server` enables SPA fallback for Angular Router.

## CDK Overlay Container

Angular Material and CDK render overlays (dialogs, menus, selects) in a special container outside the component tree. Playwright sees these as regular DOM elements, so a helper object holds them by role.

```ts
// e2e/preferences/helpers/overlay.helper.ts
import type { Locator, Page } from '@playwright/test';

export class OverlayHelper {
  public readonly dialog: Locator;
  public readonly listbox: Locator;
  public readonly menu: Locator;

  public constructor(page: Page) {
    this.dialog = page.getByRole('dialog');
    this.listbox = page.getByRole('listbox');
    this.menu = page.getByRole('menu');
  }
}
```

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|---|---|---|
| `page.locator('[_ngcontent-xyz]')` | Scoped style attributes change every build | Use `getByRole`, `getByLabel`, `getByTestId` |
| `page.locator('[ng-reflect-model]')` | Only exists in dev mode | Test rendered value: `expect(input).toHaveValue()` |
| `page.locator('app-my-component')` | Component selectors are implementation details | Target rendered content with semantic locators |
| `page.locator('.mat-mdc-button')` | Material classes change between versions | `page.getByRole('button', { name: '...' })` |
| `page.evaluate(() => window.ng)` | Not available in production builds | Test through the DOM |
| `await page.waitForTimeout(500)` | Zone.js timing varies | Use auto-retrying assertions |
| `browser.waitForAngular()` | Does not exist in Playwright | Remove entirely |
| `ng serve` in CI | Slower, includes debug code | Use `ng build && http-server` |

## Related

- [core/locators.md](../core/locators.md) — locator strategies for Angular Material
- [core/assertions-waiting.md](../core/assertions-waiting.md) — auto-waiting assertions
- [core/forms-validation.md](../testing-patterns/forms-validation.md) — form testing patterns
- [architecture/test-architecture.md](../architecture/test-architecture.md) — E2E vs unit tests with TestBed
