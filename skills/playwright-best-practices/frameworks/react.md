# React Application Testing

## Table of Contents

1. [Patterns](#patterns)
2. [Setup](#setup)
3. [Framework Tips](#framework-tips)
4. [Anti-Patterns](#anti-patterns)
5. [Related](#related)

> **When to use**: Testing React apps built with Vite, Create React App, or custom bundlers. Covers E2E testing, component testing, React Router navigation, form libraries, portals, error boundaries, and context/state verification.
> **Prerequisites**: [house-style.md](../core/house-style.md), [configuration.md](../core/configuration.md), [locators.md](../core/locators.md)

## Patterns

### Testing Context and Global State

**Use when**: Verifying React context (theme, auth, locale) and state management (Redux, Zustand) produce correct UI changes.
**Avoid when**: You want to assert on raw state objects. Test the UI, not internal state.

The page object exposes `<html>` as a locator so the theme class is asserted where it lands.

```ts
// e2e/preferences/pages/preferences.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class PreferencesPage {
  public readonly dashboardLink: Locator;
  public readonly darkThemeSwitch: Locator;
  public readonly root: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    this.darkThemeSwitch = page.getByRole('switch', { name: 'Enable dark theme' });
    this.root = page.locator('html');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/preferences');
  }

  public async enableDarkTheme(): Promise<void> {
    await this.darkThemeSwitch.click();
  }

  public async openDashboard(): Promise<void> {
    await this.dashboardLink.click();
  }

  public async expectDarkMode(): Promise<void> {
    await test.step('html carries the dark-mode class', (): Promise<void> => expect(this.root).toHaveClass(/dark-mode/), { box: true });
  }

  public async expectLightMode(): Promise<void> {
    await test.step('html has no dark-mode class', (): Promise<void> => expect(this.root).not.toHaveClass(/dark-mode/), { box: true });
  }
}
```

```ts
// e2e/preferences/preferences.e2e.ts
import { test } from './preferences.fixture';

test.describe('FEATURE: theme context', () => {
  test.describe('GIVEN the preferences page in light mode', () => {
    test.beforeEach(async ({ preferencesPage }): Promise<void> => {
      await test.step('GIVEN the preferences page is open', (): Promise<void> => preferencesPage.goto());

      await test.step('AND light mode is active', (): Promise<void> => preferencesPage.expectLightMode());
    });

    test('SCENARIO: enabling the dark theme applies it across pages', async ({ preferencesPage }): Promise<void> => {
      await test.step('WHEN the dark theme is enabled', (): Promise<void> => preferencesPage.enableDarkTheme());

      await test.step('THEN dark mode is active', (): Promise<void> => preferencesPage.expectDarkMode());

      await test.step('AND the dashboard is opened', (): Promise<void> => preferencesPage.openDashboard());

      await test.step('THEN dark mode is still active', (): Promise<void> => preferencesPage.expectDarkMode());
    });
  });
});
```

| Global state | Action | Assertion |
|---|---|---|
| Cart count (Redux, Zustand) | `catalogPage.addToCart('Wireless Headphones')` then `catalogPage.openContact()` | `expectBadge(1)` before and after navigation |
| Auth context | `loginPage.submit(USER_STUB)` | `headerComponent.expectLoginLinkHidden()` and `headerComponent.expectUserName('testuser')` |

### React Router Navigation

**Use when**: Testing client-side routing with React Router v6+: route transitions, URL parameters, protected routes, browser history.
**Avoid when**: Server-side routing (Next.js App Router, see [nextjs.md](nextjs.md)).

A client-side navigation keeps the document. The page object stamps an attribute on `<html>` before the click and asserts it survives.

```ts
// e2e/navigation/pages/home.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const SPA_MARKER = 'data-spa-session';

export class HomePage {
  public readonly helpLink: Locator;
  public readonly inventoryLink: Locator;
  public readonly root: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.helpLink = page.getByRole('link', { name: 'Help' });
    this.inventoryLink = page.getByRole('link', { name: 'Inventory' });
    this.root = page.locator('html');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/');
  }

  public async markSpaSession(): Promise<void> {
    await this.root.evaluate((html: HTMLElement, marker: string): void => html.setAttribute(marker, 'on'), SPA_MARKER);
  }

  public async openInventory(): Promise<void> {
    await this.inventoryLink.click();
    await this.page.waitForURL('/inventory');
  }

  public async openHelp(): Promise<void> {
    await this.helpLink.click();
    await this.page.waitForURL('/help');
  }

  public async goBack(): Promise<void> {
    await this.page.goBack();
  }

  public async expectSpaSessionKept(): Promise<void> {
    await test.step('spa marker survives navigation', (): Promise<void> => expect(this.root).toHaveAttribute(SPA_MARKER, 'on'), { box: true });
  }
}
```

```ts
// e2e/navigation/navigation.e2e.ts
import { expect, test } from './navigation.fixture';

test.describe('FEATURE: client routing', () => {
  test.describe('GIVEN the home page', () => {
    test.beforeEach(async ({ homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());
    });

    test('SCENARIO: following a router link keeps the document loaded', async ({ homePage }): Promise<void> => {
      await test.step('GIVEN the session is marked', (): Promise<void> => homePage.markSpaSession());

      await test.step('WHEN the inventory link is followed', (): Promise<void> => homePage.openInventory());

      await test.step('THEN the marker is still present', (): Promise<void> => homePage.expectSpaSessionKept());
    });

    test('SCENARIO: going back twice replays the history', async ({ homePage, page }): Promise<void> => {
      await test.step('GIVEN the inventory link was followed', (): Promise<void> => homePage.openInventory());

      await test.step('AND the help link was followed', (): Promise<void> => homePage.openHelp());

      await test.step('WHEN the browser goes back', (): Promise<void> => homePage.goBack());

      await test.step('THEN the url is the inventory', (): Promise<void> => expect(page).toHaveURL(/\/inventory/));

      await test.step('AND the browser goes back again', (): Promise<void> => homePage.goBack());

      await test.step('THEN the url is the root', (): Promise<void> => expect(page).toHaveURL(/\/$/));
    });
  });

  test.describe('GIVEN the account layout', () => {
    test('SCENARIO: changing the nested route keeps the layout', async ({ accountPage }): Promise<void> => {
      await test.step('GIVEN the security section is open', (): Promise<void> => accountPage.gotoSection('security'));

      await test.step('AND the layout heading and section heading are shown', (): Promise<void> => accountPage.expectSection('Security'));

      await test.step('WHEN the privacy link is followed', (): Promise<void> => accountPage.openSection('Privacy'));

      await test.step('THEN the layout heading and section heading are shown', (): Promise<void> => accountPage.expectSection('Privacy'));
    });
  });
});
```

`accountPage.expectSection(name)` asserts the level-1 `Account` heading and the level-2 section heading in one boxed step.

| Case | Page object call | Assertion |
|---|---|---|
| Query params filter content | `itemsPage.gotoType('books')` then `itemsPage.openType('Music')` | `expectHeading('Music')` and `expect(page).toHaveURL('/items?type=music')` |
| Protected route | `adminPage.gotoUsers()` | `expect(page).toHaveURL(/\/login/)` |
| Unknown route | `notFoundPage.goto('/nonexistent-path')` | `expectHeading('Not Found')` |

### Testing Hooks Through UI

**Use when**: Verifying custom hooks produce correct UI behavior. Playwright cannot call hooks directly.
**Avoid when**: Hook logic is pure computation. Use unit tests instead.

A `useDebounce` hook is observed by counting requests. The mock records each URL and lets the request through; the fixture installs it before the test.

```ts
// e2e/search/test/mocks/search-calls.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../common/search.type';

export const searchCallsMock = (calls: string[]): RouteHandler => {
  return (route: Route): Promise<void> => {
    calls.push(route.request().url());

    return route.continue();
  };
};
```

```ts
// e2e/search/search.fixture.ts
import { test as base } from '@playwright/test';

import { SearchPage } from './pages/search.page';
import { searchCallsMock } from './test/mocks/search-calls.mock';

type SearchFixtures = {
  readonly searchCalls: string[];
  readonly searchPage: SearchPage;
};

export const test = base.extend<SearchFixtures>({
  searchCalls: async ({ page }, use): Promise<void> => {
    const calls: string[] = [];

    await page.route('**/api/query*', searchCallsMock(calls));
    await use(calls);
  },
  searchPage: async ({ page }, use): Promise<void> => {
    await use(new SearchPage(page));
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/search/search.test.ts
import { expect, test } from './search.fixture';

test.describe('FEATURE: useDebounce via SearchBox', () => {
  test.describe('GIVEN the search page', () => {
    test('SCENARIO: typing a word quickly batches the requests', async ({ searchCalls, searchPage }): Promise<void> => {
      await test.step('GIVEN the search page is open', (): Promise<void> => searchPage.goto());

      await test.step('WHEN a query is typed with 40ms between keys', (): Promise<void> => searchPage.typeQuery('testing'));

      await test.step('THEN three results are listed', (): Promise<void> => searchPage.expectResultCount(3));

      await test.step('AND at most two requests were sent', (): void => expect(searchCalls.length).toBeLessThanOrEqual(2));
    });
  });
});
```

`searchPage.typeQuery(text)` calls `pressSequentially(text, { delay: 40 })` on the `Search` textbox. A `usePagination` hook is tested the same way: `recordsPage.next()` / `recordsPage.previous()` with `expectPageLabel('Page 2 of 10')` and `expectPreviousDisabled()`.

### Form Libraries (React Hook Form, Formik)

**Use when**: Testing forms built with react-hook-form or Formik. Playwright interacts with DOM; the form library is transparent.

The page object takes a typed `SignupUser` from `common/signup.type.ts`; the stub in `test/stubs/signup.stub.ts` is the valid base each case overrides.

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
    this.confirmInput = page.getByLabel('Confirm');
    this.emailInput = page.getByLabel('Email');
    this.nameInput = page.getByLabel('Name');
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.registerButton = page.getByRole('button', { name: 'Register' });
    this.termsCheckbox = page.getByLabel('Accept terms');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  public async fill(user: SignupUser): Promise<void> {
    await this.nameInput.fill(user.name);
    await this.emailInput.fill(user.email);
    await this.passwordInput.fill(user.password);
    await this.confirmInput.fill(user.password);
    await this.termsCheckbox.check();
  }

  public async submit(): Promise<void> {
    await this.registerButton.click();
  }

  public async blurEmailWith(value: string): Promise<void> {
    await this.emailInput.fill(value);
    await this.emailInput.blur();
  }

  public async expectError(message: string): Promise<void> {
    await test.step(`error "${message}" is shown`, (): Promise<void> => expect(this.page.getByText(message)).toBeVisible(), { box: true });
  }

  public async expectSubmitting(): Promise<void> {
    await test.step('register button is disabled while submitting', (): Promise<void> => expect(this.page.getByRole('button', { name: /Registering|Loading/ })).toBeDisabled(), { box: true });
  }
}
```

The slow-response case needs a mock that holds the request open. `setTimeout` from `node:timers/promises` is the delay.

```ts
// e2e/signup/test/mocks/signup.mock.ts
import { setTimeout as sleep } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { CreatedAccount, RouteHandler } from '../../common/signup.type';
import { CREATED_ACCOUNT_STUB } from '../stubs/signup.stub';

export const slowSignupMock = (delayMs: number, account: CreatedAccount = CREATED_ACCOUNT_STUB): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await sleep(delayMs);
    await route.fulfill({ json: account, status: 201 });
  };
};
```

```ts
// e2e/signup/signup.test.ts
import { expect, test } from './signup.fixture';
import { slowSignupMock } from './test/mocks/signup.mock';
import { SIGNUP_USER_STUB } from './test/stubs/signup.stub';

test.describe('FEATURE: signup form', () => {
  test.describe('GIVEN the signup page', () => {
    test.beforeEach(async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());
    });

    test('SCENARIO: submitting the empty form shows the required errors', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN the form is submitted', (): Promise<void> => signupPage.submit());

      await test.step('THEN the email is required', (): Promise<void> => signupPage.expectError('Email required'));

      await test.step('AND the password is required', (): Promise<void> => signupPage.expectError('Password required'));
    });

    test('SCENARIO: an invalid email losing focus shows the inline error', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN the email field is blurred with an invalid value', (): Promise<void> => signupPage.blurEmailWith('invalid'));

      await test.step('THEN the format error is shown', (): Promise<void> => signupPage.expectError('Invalid email format'));
    });

    test('SCENARIO: submitting a valid form greets the user on the welcome page', async ({ page, signupPage, welcomePage }): Promise<void> => {
      await test.step('GIVEN a valid user is filled in', (): Promise<void> => signupPage.fill(SIGNUP_USER_STUB));

      await test.step('WHEN the form is submitted', (): Promise<void> => signupPage.submit());

      await test.step('THEN the welcome url is shown', (): Promise<void> => expect(page).toHaveURL('/welcome'));

      await test.step('AND the greeting names the user', (): Promise<void> => welcomePage.expectGreeting(SIGNUP_USER_STUB.name));
    });

    test('SCENARIO: a slow request disables the submit button meanwhile', async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN the signup response is held for 800ms', (): Promise<void> => signupPage.routeSignup(slowSignupMock(800)));

      await test.step('AND a valid user is filled in', (): Promise<void> => signupPage.fill(SIGNUP_USER_STUB));

      await test.step('WHEN the form is submitted', (): Promise<void> => signupPage.submit());

      await test.step('THEN the button is disabled while submitting', (): Promise<void> => signupPage.expectSubmitting());
    });
  });
});
```

`signupPage.routeSignup(handler)` wraps `page.route('**/api/signup', handler)`. The password-strength indicator case is `signupPage.fillPassword('weak')` with `expectRule('Minimum 8 characters', /invalid/)`, then `fillPassword('StrongPass1!')` with `expectRule(..., /valid/)`.

### Portals (Modals, Tooltips, Dropdowns)

**Use when**: Testing components rendered via `ReactDOM.createPortal()`: modals, dialogs, tooltips, menus. These render outside the parent DOM but Playwright sees the full document.

```ts
// e2e/items/items.e2e.ts
import { test } from './items.fixture';

test.describe('FEATURE: portal dialog', () => {
  test.describe('GIVEN the items page', () => {
    test.beforeEach(async ({ itemsPage }): Promise<void> => {
      await test.step('GIVEN the items page is open', (): Promise<void> => itemsPage.goto());

      await test.step('AND remove is clicked on the first item', (): Promise<void> => itemsPage.removeFirst());

      await test.step('AND the confirm dialog is open', (): Promise<void> => itemsPage.expectDialogOpen());
    });

    test('SCENARIO: opening the dialog focuses cancel', async ({ itemsPage }): Promise<void> => {
      await test.step('THEN the cancel button is focused', (): Promise<void> => itemsPage.expectCancelFocused());
    });

    test('SCENARIO: confirming the removal closes the dialog', async ({ itemsPage }): Promise<void> => {
      await test.step('WHEN the removal is confirmed', (): Promise<void> => itemsPage.confirmRemoval());

      await test.step('THEN the dialog is closed', (): Promise<void> => itemsPage.expectDialogClosed());
    });

    test('SCENARIO: pressing escape closes the dialog', async ({ itemsPage }): Promise<void> => {
      await test.step('WHEN escape is pressed', (): Promise<void> => itemsPage.pressEscape());

      await test.step('THEN the dialog is closed', (): Promise<void> => itemsPage.expectDialogClosed());
    });
  });
});
```

`ItemsPage` holds `confirmDialog = page.getByRole('dialog', { name: 'Confirm removal' })` and scopes `Cancel` and `Remove` to it; `pressEscape` is `page.keyboard.press('Escape')`.

| Portal | Action | Assertion |
|---|---|---|
| Tooltip | `panelPage.hoverHelp()` then `panelPage.moveMouseAway()` (`page.mouse.move(0, 0)`) | `expect(tooltip).toBeVisible()` then `toBeHidden()` |
| Dropdown menu | `panelPage.openActions()` then `panelPage.chooseAction('Rename')` | `expect(menu).toBeHidden()` |
| Toast | `preferencesPage.save()` | `expect(toast).toBeVisible()` then `toBeHidden({ timeout: 8_000 })` |

### Error Boundaries

**Use when**: Verifying error boundaries catch rendering errors and show fallback UI.
**Avoid when**: Testing error handling in event handlers or async code. Error boundaries only catch render errors.

A `null` payload makes the widget list crash on render. The recovering mock fails once and succeeds after, so the `Retry` path is observable.

```ts
// e2e/panel/test/stubs/widgets.stub.ts
import type { Widget, WidgetsBody } from '../../common/panel.type';

const chart: Widget = { id: 1, name: 'Chart' };

export const WIDGETS_BROKEN_STUB: WidgetsBody = { widgets: null };

export const WIDGETS_HEALTHY_STUB: WidgetsBody = { widgets: [chart] };
```

```ts
// e2e/panel/test/mocks/widgets.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../common/panel.type';
import { WIDGETS_BROKEN_STUB, WIDGETS_HEALTHY_STUB } from '../stubs/widgets.stub';

export const brokenWidgetsMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: WIDGETS_BROKEN_STUB, status: 200 });
};

export const recoveringWidgetsMock = (): RouteHandler => {
  let calls = 0;

  return (route: Route): Promise<void> => {
    calls += 1;

    const json = calls === 1 ? WIDGETS_BROKEN_STUB : WIDGETS_HEALTHY_STUB;

    return route.fulfill({ json, status: 200 });
  };
};
```

```ts
// e2e/panel/panel.test.ts
import { test } from './panel.fixture';
import { brokenWidgetsMock, recoveringWidgetsMock } from './test/mocks/widgets.mock';

test.describe('FEATURE: widget error boundary', () => {
  test.describe('GIVEN the widgets endpoint returns a broken payload', () => {
    test('SCENARIO: rendering the panel shows the fallback and keeps the navigation', async ({ panelPage }): Promise<void> => {
      await test.step('GIVEN widgets are routed to the broken payload', (): Promise<void> => panelPage.routeWidgets(brokenWidgetsMock()));

      await test.step('WHEN the panel is opened', (): Promise<void> => panelPage.goto());

      await test.step('THEN the fallback is shown with a retry button', (): Promise<void> => panelPage.expectFallback());

      await test.step('AND the navigation is still visible', (): Promise<void> => panelPage.expectNavigation());
    });
  });

  test.describe('GIVEN the widgets endpoint fails once', () => {
    test('SCENARIO: clicking retry recovers the widget', async ({ panelPage }): Promise<void> => {
      await test.step('GIVEN widgets are routed to fail once', (): Promise<void> => panelPage.routeWidgets(recoveringWidgetsMock()));

      await test.step('AND the panel is open', (): Promise<void> => panelPage.goto());

      await test.step('AND the fallback is shown', (): Promise<void> => panelPage.expectFallback());

      await test.step('WHEN retry is clicked', (): Promise<void> => panelPage.retry());

      await test.step('THEN the fallback is gone and the chart is shown', (): Promise<void> => panelPage.expectWidget('Chart'));
    });
  });
});
```

### Component Testing (Experimental)

**Use when**: Testing complex interactive components in isolation: data tables, form wizards, rich editors. Needs a real browser but not the full app.
**Avoid when**: Component depends heavily on backend data or routing. Use E2E instead.

```ts
// e2e/playwright-ct.config.ts
import { defineConfig, devices } from '@playwright/experimental-ct-react';

const use = { ctPort: 3100, trace: 'on-first-retry' } as const;

const projects = [{ name: 'chromium', use: devices['Desktop Chrome'] }];

export default defineConfig({
  projects,
  testDir: './e2e',
  testMatch: '**/*.ct.ts',
  use
});
```

The mount util builds the element with `createElement` so it stays a `.ts` file; a `.tsx` util may use JSX instead. `StepperProps` is the component's exported props type.

```ts
// e2e/stepper/test/utils/stepper-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-react';
import { createElement } from 'react';

import type { StepperProps } from '@/components/Stepper';
import { Stepper } from '@/components/Stepper';

import { StepperComponent } from '../../components/stepper.component';

type Mount = ComponentFixtures['mount'];

export const mountStepper = async (mount: Mount, props: StepperProps): Promise<StepperComponent> => {
  const root = await mount(createElement(Stepper, props));

  return new StepperComponent(root);
};
```

```ts
// e2e/stepper/stepper.ct.ts
import { expect, test } from '@playwright/experimental-ct-react';

import type { StepperComponent } from './components/stepper.component';
import { mountStepper } from './test/utils/stepper-mount.spec.util';

test.describe('FEATURE: stepper', () => {
  test.describe('GIVEN a stepper mounted at 0', () => {
    test('SCENARIO: clicking + reads 1', async ({ mount }): Promise<void> => {
      const stepper = await test.step('GIVEN the stepper is mounted at 0', (): Promise<StepperComponent> => mountStepper(mount, { initial: 0 }));

      await test.step('WHEN + is clicked', (): Promise<void> => stepper.increment());

      await test.step('THEN the value reads 1', (): Promise<void> => stepper.expectValue(1));
    });

    test('SCENARIO: clicking + twice passes each value to onChange', async ({ mount }): Promise<void> => {
      const values: number[] = [];
      const onChange = (value: number): number => values.push(value);
      const stepper = await test.step('GIVEN the stepper is mounted at 0 with onChange', (): Promise<StepperComponent> => mountStepper(mount, { initial: 0, onChange }));

      await test.step('WHEN + is clicked', (): Promise<void> => stepper.increment());

      await test.step('AND + is clicked again', (): Promise<void> => stepper.increment());

      await test.step('THEN onChange saw 1 then 2', (): void => expect(values).toEqual([1, 2]));
    });

    test('SCENARIO: a value at min disables -', async ({ mount }): Promise<void> => {
      const stepper = await test.step('GIVEN the stepper is mounted at 0 with min 0', (): Promise<StepperComponent> => mountStepper(mount, { initial: 0, min: 0 }));

      await test.step('THEN - is disabled', (): Promise<void> => stepper.expectDecrementDisabled());
    });
  });
});
```

`StepperComponent` in `components/stepper.component.ts` takes the mounted `Locator` root, exposes `incrementButton` and `decrementButton`, and wraps `expectValue` / `expectDecrementDisabled` in boxed steps. The Vue version in [vue.md](vue.md#component-testing-with-experimental-ct) shows the full class.

## Setup

### E2E Config (Vite)

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);
const BASE_URL = 'http://localhost:5173';

const use = { baseURL: BASE_URL, screenshot: 'only-on-failure', trace: 'on-first-retry' } as const;

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'mobile', use: devices['iPhone 14'] }
];

const webServer = {
  command: IS_CI ? 'npm run build && npx vite preview --port 5173' : 'npm run dev',
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
  use,
  webServer,
  workers: IS_CI ? '50%' : undefined
});
```

### CRA vs Vite Differences

| Aspect | Create React App | Vite |
|---|---|---|
| Default port | `3000` | `5173` |
| Build output | `build/` | `dist/` |
| Serve production | `npx serve -s build -l 3000` | `npx vite preview --port 5173` |
| Env var prefix | `REACT_APP_*` | `VITE_*` |

## Framework Tips

### Strict Mode Double Effects

React Strict Mode runs effects twice in development. Tests should be resilient:

- Do not assert exact API call counts in dev mode
- Run against the production build for call count assertions, or account for double invocations

### Suspense and Lazy Components

A lazy route renders a Suspense fallback, then the chunk. The web-first assertion waits through both.

```ts
// e2e/analytics/analytics.e2e.ts
import { test } from './analytics.fixture';

test.describe('FEATURE: lazy analytics route', () => {
  test.describe('GIVEN the home page', () => {
    test('SCENARIO: following the analytics link renders the lazy chunk', async ({ analyticsPage, homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      await test.step('WHEN the analytics link is followed', (): Promise<void> => homePage.openAnalytics());

      await test.step('THEN the analytics heading is shown', (): Promise<void> => analyticsPage.expectHeading());
    });
  });
});
```

### Detecting Memory Leaks

A fixture collects console warnings that mention `unmounted` and the spec asserts the list is empty after a navigation round-trip.

```ts
// e2e/panel/panel.fixture.ts
import type { ConsoleMessage } from '@playwright/test';
import { test as base } from '@playwright/test';

import { PanelPage } from './pages/panel.page';

type PanelFixtures = {
  readonly panelPage: PanelPage;
  readonly unmountWarnings: string[];
};

const collectUnmountWarning = (warnings: string[], message: ConsoleMessage): void => {
  const isWarning = message.type() === 'warning';
  const isUnmount = message.text().includes('unmounted');

  if (isWarning && isUnmount) warnings.push(message.text());
};

export const test = base.extend<PanelFixtures>({
  panelPage: async ({ page }, use): Promise<void> => {
    await use(new PanelPage(page));
  },
  unmountWarnings: async ({ page }, use): Promise<void> => {
    const warnings: string[] = [];

    page.on('console', (message: ConsoleMessage): void => collectUnmountWarning(warnings, message));
    await use(warnings);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/panel/panel-leaks.e2e.ts
import { expect, test } from './panel.fixture';

test.describe('FEATURE: panel unmount', () => {
  test.describe('GIVEN the panel', () => {
    test('SCENARIO: navigating away and back logs no unmounted-state warning', async ({ panelPage, unmountWarnings }): Promise<void> => {
      await test.step('GIVEN the panel is open', (): Promise<void> => panelPage.goto());

      await test.step('WHEN settings is opened', (): Promise<void> => panelPage.openSettings());

      await test.step('AND the browser goes back', (): Promise<void> => panelPage.goBack());

      await test.step('AND profile is opened', (): Promise<void> => panelPage.openProfile());

      await test.step('THEN no unmount warning was logged', (): void => expect(unmountWarnings).toEqual([]));
    });
  });
});
```

## Anti-Patterns

| Avoid | Problem | Prefer |
|---|---|---|
| `page.evaluate(() => store.getState())` | Couples tests to implementation | Assert on UI: `expect(badge).toHaveText('3')` |
| Import components in E2E tests | E2E runs in Node, not browser | Use `@playwright/experimental-ct-react` for components |
| `page.waitForTimeout(500)` after state changes | Timing varies across machines | `expect(locator).toHaveText('value')` auto-retries |
| `page.locator('.MuiButton-root')` | Class names change between versions | `page.getByRole('button', { name: 'Submit' })` |
| Test every component with CT | Overhead for simple components | CT for complex widgets, unit tests for logic, E2E for flows |
| Skip keyboard navigation tests | Accessibility regressions common | Test Tab, Enter, Escape, Arrow interactions |
| Assert on `__REACT_FIBER__` internals | Not stable across versions | Only interact with rendered DOM |

## Related

- [locators.md](../core/locators.md) — locator strategies for any React component library
- [assertions-waiting.md](../core/assertions-waiting.md) — auto-waiting for React state changes
- [forms-validation.md](../testing-patterns/forms-validation.md) — form testing patterns
- [component-testing.md](../testing-patterns/component-testing.md) — in-depth component testing
- [test-architecture.md](../architecture/test-architecture.md) — E2E vs component vs unit decisions
- [nextjs.md](nextjs.md) — Next.js-specific patterns for SSR
