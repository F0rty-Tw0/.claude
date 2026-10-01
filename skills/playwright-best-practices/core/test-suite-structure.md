# Test Suite Structure

## Table of Contents

1. [Configuration](#configuration)
2. [E2E Tests](#e2e-tests)
3. [Component Tests](#component-tests)
4. [API Tests](#api-tests)
5. [Visual Regression Tests](#visual-regression-tests)
6. [Directory Structure](#directory-structure)
7. [Tagging & Filtering](#tagging--filtering)

### Project Setup

```bash
npm init playwright@latest
```

## Configuration

### Essential Configuration

Every nested object (`use`, `projects`, `reporter`, `webServer`) is a named const above `defineConfig`. Environment reads happen here once; specs never read `process.env`.

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'] };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium }
];

const reporter: ReporterDescription[] = [['html'], ['list']];

const use = {
  baseURL: 'http://localhost:3000',
  screenshot: 'only-on-failure',
  trace: 'on-first-retry'
} as const;

const webServer = {
  command: 'npm run dev',
  reuseExistingServer: !process.env.CI,
  url: 'http://localhost:3000'
};

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  projects,
  reporter,
  retries: process.env.CI ? 2 : 0,
  testMatch: '**/*.@(e2e|test).ts',
  use,
  webServer
});
```

## E2E Tests

Full user journey tests through the browser.

### Structure

The spec is flat: one `FEATURE`, then `GIVEN <state>, <outcome>` tests made of steps. There are no arrange steps and no `beforeEach` steps: the title names the state, and a fixture or the opening call builds it. Every locator and multi-action flow lives in a page object (`ProductsPage`, `CartPage`, `CheckoutPage`) injected by `checkout.fixture.ts`; see [page-object-model.md](page-object-model.md) and [fixtures-hooks.md](fixtures-hooks.md).

`guestCartPage` is a fixture that seeds one product into a cart with no session through `request`, opens the cart, and hands over the `CartPage`. Its 'Checkout as guest' button (`checkoutAsGuest()`) opens the shipping form; plain `startCheckout()` without a session asks for sign-in instead (CHK-3 in [annotations.md](annotations.md#requirement-annotation)). `CheckoutPage.payWith(cardNumber: string)` takes the card number only.

```ts
// e2e/checkout/checkout.e2e.ts
import { test } from './checkout.fixture';
import { GUEST_STUB } from './test/stubs/checkout.stub';

test.describe('FEATURE: checkout', () => {
  test('GIVEN a guest cart, paying through guest checkout confirms the order', async ({ checkoutPage, guestCartPage }): Promise<void> => {
    await test.step('WHEN guest checkout is chosen', (): Promise<void> => guestCartPage.checkoutAsGuest());

    await test.step('AND the shipping details are filled', (): Promise<void> => checkoutPage.fillShipping(GUEST_STUB));

    await test.step('AND the test card pays', (): Promise<void> => checkoutPage.payWith(GUEST_STUB.cardNumber));

    await test.step('THEN the confirmation heading is shown', (): Promise<void> => checkoutPage.expectConfirmed());
  });

  test('GIVEN a guest cart, applying a discount code shows the discount banner', async ({ guestCartPage }): Promise<void> => {
    await test.step('WHEN the discount code is applied', (): Promise<void> => guestCartPage.applyDiscount('SAVE10'));

    await test.step('THEN the banner reports the ten percent discount', (): Promise<void> => guestCartPage.expectDiscount('10% discount applied'));
  });
});
```

### Journey

A `test.describe('JOURNEY: <user path>')` directly inside the `FEATURE` groups 2+ tests that follow one user path in order, so the report reads the path leg by leg. Each leg is still an independent test: its title names where it starts, and the opening call or a fixture seeds that state instead of the leg before it. The first leg opens the products page in its `WHEN`. `guestCartPage` seeds one product through `request` and opens the cart. `paymentCheckoutPage` seeds the cart and the guest shipping details through `request`, opens the payment step, and hands over the `CheckoutPage`. The legs run in parallel and in any order, and a failure names the leg that broke, so the journey needs no `mode: 'serial'`.

```ts
// e2e/checkout/guest-checkout.e2e.ts
import { test } from './checkout.fixture';
import { GUEST_STUB } from './test/stubs/checkout.stub';

test.describe('FEATURE: guest checkout', () => {
  test.describe('JOURNEY: a guest buys one item', () => {
    test('GIVEN an empty cart, adding a product shows one item in the badge', async ({ productsPage }): Promise<void> => {
      await test.step('WHEN the products page is opened', (): Promise<void> => productsPage.goto());

      await test.step('AND the first product is added to the cart', (): Promise<void> => productsPage.addFirstToCart());

      await test.step('THEN the cart badge shows one item', (): Promise<void> => productsPage.expectCartCount(1));
    });

    test('GIVEN one item in the cart, choosing guest checkout asks for shipping details', async ({ checkoutPage, guestCartPage }): Promise<void> => {
      await test.step('WHEN guest checkout is chosen', (): Promise<void> => guestCartPage.checkoutAsGuest());

      await test.step('THEN the shipping form is shown', (): Promise<void> => checkoutPage.expectShippingForm());
    });

    test('GIVEN a guest order with shipping details, paying confirms the order', async ({ paymentCheckoutPage }): Promise<void> => {
      await test.step('WHEN the test card pays', (): Promise<void> => paymentCheckoutPage.payWith(GUEST_STUB.cardNumber));

      await test.step('THEN the confirmation heading is shown', (): Promise<void> => paymentCheckoutPage.expectConfirmed());
    });
  });
});
```

### Best Practices

- Test critical user journeys
- Keep tests independent
- Use realistic data from `test/stubs/`
- Clean up test data in fixture teardown

## Component Tests

Test individual components in isolation through stories, a gallery, and the built-in `mount` fixture. There is no template package; stories, gallery contract, config, and framework notes are in **[component-testing.md](../testing-patterns/component-testing.md)**.

## API Tests

Test backend APIs without browser.

### API Mocking Patterns

For E2E tests that need to mock API responses, the route handler is a factory in `test/mocks/`. The spec never installs it in a step and never builds a handler inline: `usersPage.goto(options)` takes a `UsersOptions` (`{ readonly failOn?: 'list'; readonly listDelayMs?: number; readonly readOnly?: boolean; readonly users?: User[] }`, named in `common/users.type.ts`) and routes `**/api/users` with the matching factory before it navigates. Every body it serves comes from `test/stubs/users.stub.ts`, which exports `USER_STUB: User`, `USERS_STUB: User[]`, and `SERVER_ERROR_STUB: ErrorBody`, with `ErrorBody` declared in `test/common/users.type.ts`; the mock file declares no data and no type of its own. Each factory takes its payload first, defaulting to the stub, and the delay after it. `route.fulfill` has no `delay` option; a slow response awaits `node:timers/promises` before fulfilling.

```ts
// e2e/users/test/mocks/users.mock.ts
import { setTimeout } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { User } from '../../common/users.type';
import type { ErrorBody } from '../common/users.type';
import { SERVER_ERROR_STUB, USERS_STUB } from '../stubs/users.stub';

export const usersMock = (users: User[] = USERS_STUB, delayMs = 0): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await setTimeout(delayMs);
    await route.fulfill({ json: users, status: 200 });
  };
};

export const usersErrorMock = (error: ErrorBody = SERVER_ERROR_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: error, status: 500 });
};

export const usersGetOnlyMock = (users: User[] = USERS_STUB): RouteHandler => {
  return (route: Route): Promise<void> => {
    const isGet = route.request().method() === 'GET';

    if (!isGet) return route.continue();

    return route.fulfill({ json: users });
  };
};
```

```ts
// e2e/users/users.test.ts
import type { User } from './common/users.type';
import { USER_STUB } from './test/stubs/users.stub';
import { test } from './users.fixture';

test.describe('FEATURE: users list', () => {
  test('GIVEN a stubbed user, opening the users page lists the user', async ({ usersPage }): Promise<void> => {
    const users: User[] = [USER_STUB];

    await test.step('WHEN the users page is opened', (): Promise<void> => usersPage.goto({ users }));

    await test.step('THEN the stubbed user is listed', (): Promise<void> => usersPage.expectUser(USER_STUB.name));
  });
});
```

| Scenario | Handler | Opening call | Assertion step |
|---|---|---|---|
| Error response | `usersErrorMock()` | `usersPage.goto({ failOn: 'list' })` | `usersPage.expectError('Server error')` |
| Conditional by method | `usersGetOnlyMock()` | `usersPage.goto({ readOnly: true })` | `usersPage.expectUser(...)` after a `POST` passed through |
| Slow network | `usersMock(USERS_STUB, 2000)` | `usersPage.goto({ listDelayMs: 2000 })` | `usersPage.expectLoading()` then `usersPage.expectUser(...)` |

The title names the condition, `'GIVEN a failing users api, opening the page shows the server error'`, and the step stays `'WHEN the users page is opened'`.

For advanced patterns (GraphQL mocking, HAR recording, request modification, network throttling), see **[network-advanced.md](../advanced/network-advanced.md)**.

## Visual Regression Tests

Compare screenshots to detect visual changes.

### Basic Visual Test

`expect(page).toHaveScreenshot` may sit in a spec step because it takes `page`. A screenshot of one element uses a page-object locator, never `page.getBy*` in the spec. The first two tests open the dashboard with its default content; the third passes `hideDynamic: true` to the opening call, so its title names the hidden content and no step builds it.

```ts
// e2e/dashboard/dashboard-visual.e2e.ts
import { expect, test } from './dashboard.fixture';

test.describe('FEATURE: dashboard visuals', () => {
  test('GIVEN the default content, the rendered page matches the stored screenshot', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('THEN the page matches dashboard.png', (): Promise<void> => expect(page).toHaveScreenshot('dashboard.png'));
  });

  test('GIVEN the default content, the primary button matches its stored screenshot', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('THEN the button matches primary-button.png', (): Promise<void> => expect(dashboardPage.primaryButton).toHaveScreenshot('primary-button.png'));
  });

  test('GIVEN hidden dynamic content, the page matches the masked screenshot', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ hideDynamic: true }));

    await test.step('THEN the masked page matches dashboard-stable.png', (): Promise<void> => dashboardPage.expectScreenshot('dashboard-stable.png'));
  });
});
```

### Visual Test Options

Options that need a locator (`mask`) belong in a page-object `expect*` method. Static options are a typed module const, spread and extended per call. `DashboardOptions` ([network-advanced.md](../advanced/network-advanced.md)) gains `hideDynamic?: boolean`: `goto` adds a style tag that hides the dynamic regions. It runs after the navigation, because a style tag added to `about:blank` is lost.

```ts
// e2e/dashboard/pages/dashboard.page.ts
import type { Locator, Page, PageAssertionsToHaveScreenshotOptions } from '@playwright/test';
import { expect } from '@playwright/test';

import type { DashboardOptions } from '../common/dashboard.type';

const SCREENSHOT_OPTIONS: PageAssertionsToHaveScreenshotOptions = {
  animations: 'disabled',
  fullPage: true,
  maxDiffPixelRatio: 0.01,
  maxDiffPixels: 100,
  threshold: 0.2
};

const HIDE_DYNAMIC_CSS = '.dynamic-content { visibility: hidden !important; } [data-testid="ad-banner"] { display: none !important; }';

export class DashboardPage {
  public readonly avatar: Locator;
  public readonly primaryButton: Locator;
  public readonly timestamp: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.avatar = page.getByTestId('avatar');
    this.primaryButton = page.getByRole('button', { name: 'Primary' });
    this.timestamp = page.getByTestId('timestamp');
  }

  public async goto(options: DashboardOptions = {}): Promise<void> {
    await this.page.goto('/dashboard');

    if (options.hideDynamic) await this.page.addStyleTag({ content: HIDE_DYNAMIC_CSS });
  }

  public async expectScreenshot(name: string): Promise<void> {
    const mask = [this.avatar, this.timestamp];
    const options: PageAssertionsToHaveScreenshotOptions = { ...SCREENSHOT_OPTIONS, mask };

    await expect(this.page).toHaveScreenshot(name, options);
  }
}
```

| Option | Effect |
|---|---|
| `fullPage: true` | Capture the entire scrollable page |
| `maxDiffPixels: 100` | Allow up to 100 differing pixels |
| `maxDiffPixelRatio: 0.01` | Or allow 1% of pixels to differ |
| `threshold: 0.2` | Per-pixel colour distance tolerance |
| `animations: 'disabled'` | Freeze CSS animations and transitions |
| `mask: [locator]` | Paint listed elements over before comparing |

### Handling Dynamic Content

Two tools, both shown above: `mask` hides elements by locator at compare time; the `hideDynamic` opening option injects CSS through `page.addStyleTag` so the elements never render. Prefer `mask` for a few elements; prefer CSS when a class marks many.

### Visual Test Configuration

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const toHaveScreenshot = { animations: 'disabled', maxDiffPixels: 50 } as const;

const expectOptions = { toHaveScreenshot };

const viewport = { height: 720, width: 1280 };

const visualChrome = { ...devices['Desktop Chrome'], viewport };

const projects = [{ name: 'visual-chrome', testMatch: '**/*-visual.@(e2e|test).ts', use: visualChrome }];

export default defineConfig({ expect: expectOptions, projects });
```

### Update Snapshots

```bash
# Update all snapshots
npx playwright test --update-snapshots

# Update specific test
npx playwright test homepage.e2e.ts --update-snapshots
```

## Directory Structure

Tests group by feature, not by test kind. Each feature folder owns its spec, fixture, page objects, and test data; see the full layout in [house-style.md](house-style.md#layout). The spec suffix states the backend: `.e2e.ts` hits your real API, `.test.ts` routes it. Stubbing only third-party hosts keeps `.e2e.ts`.

```text
e2e/
  playwright.config.ts
  playwright.fixture.ts             mergeTests of every feature fixture
  checkout/
    checkout.e2e.ts                real backend
    checkout.fixture.ts
    pages/
      cart.page.ts
      checkout.page.ts
    test/
      stubs/
        checkout.stub.ts
  users/
    users.test.ts                  own api routed via test/mocks
    users-api.e2e.ts               API cases, request fixture only
    users.fixture.ts
    test/
      mocks/
        users.mock.ts
  dashboard/
    dashboard-visual.e2e.ts        visual cases
    dashboard.fixture.ts
    pages/
      dashboard.page.ts
  button/
    button.test.tsx                 component cases
```

## Anti-Patterns to Avoid

| Anti-Pattern                          | Problem                            | Solution                  |
| ------------------------------------- | ---------------------------------- | ------------------------- |
| Long test files                       | Hard to maintain, slow to navigate | Split by feature, use POM |
| Tests depend on execution order       | Flaky, hard to debug               | Keep tests independent    |
| Testing multiple features in one test | Hard to debug failures             | One feature per test      |

## Related References

- **Component Testing**: See [component-testing.md](../testing-patterns/component-testing.md) for comprehensive CT patterns
- **Projects**: See [projects-dependencies.md](projects-dependencies.md) for project-based filtering
- **Page Objects**: See [page-object-model.md](page-object-model.md) for organizing page interactions
- **Test Data**: See [fixtures-hooks.md](fixtures-hooks.md) for managing test data

## Tagging & Filtering

### Using Tags

Tags are the second argument of `test` or `test.describe`, never part of the title.

```ts
// e2e/login/login.e2e.ts
import { test } from './login.fixture';
import { USER_STUB } from './test/stubs/login.stub';

test.describe('FEATURE: login', { tag: '@auth' }, () => {
  test('GIVEN valid credentials, submitting opens the dashboard', { tag: ['@critical', '@smoke'] }, async ({ dashboardPage, loginPage }): Promise<void> => {
    await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto());

    await test.step('AND valid credentials are submitted', (): Promise<void> => loginPage.submit(USER_STUB));

    await test.step('THEN the dashboard heading is shown', (): Promise<void> => dashboardPage.expectHeading());
  });
});
```

### Running Tagged Tests

```bash
# Run smoke tests
npx playwright test --grep @smoke

# Run all except slow tests
npx playwright test --grep-invert @slow

# Combine tags
npx playwright test --grep "@smoke|@critical"
```

For project-based filtering and advanced project configuration, see **[projects-dependencies.md](projects-dependencies.md)**.
