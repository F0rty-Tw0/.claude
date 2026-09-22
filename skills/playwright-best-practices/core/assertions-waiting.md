# Assertions & Waiting

## Table of Contents

1. [Web-First Assertions](#web-first-assertions)
2. [Generic Assertions](#generic-assertions)
3. [Soft Assertions](#soft-assertions)
4. [Waiting Strategies](#waiting-strategies)
5. [Polling & Retrying](#polling--retrying)
6. [Custom Matchers](#custom-matchers)

## Web-First Assertions

Auto-retry until condition is met or timeout. Always prefer these over generic assertions.

### Locator Assertions

A locator assertion lives in a page-object `expect*` method, one matcher per boxed step, so the failure points at the spec line. The page object shows the shape; the table lists every matcher.

```ts
// e2e/profile/pages/profile.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ProfilePage {
  public readonly emailInput: Locator;
  public readonly heading: Locator;
  public readonly homeLink: Locator;
  public readonly newsletterCheckbox: Locator;
  public readonly saveButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.heading = page.getByRole('heading');
    this.homeLink = page.getByRole('link', { name: 'Home' });
    this.newsletterCheckbox = page.getByRole('checkbox', { name: 'Newsletter' });
    this.saveButton = page.getByRole('button', { name: 'Save' });
  }

  public async expectHeading(text: string): Promise<void> {
    await test.step(`heading reads "${text}"`, (): Promise<void> => expect(this.heading).toHaveText(text), { box: true });
  }

  public async expectEmail(email: string): Promise<void> {
    await test.step(`email field holds ${email}`, (): Promise<void> => expect(this.emailInput).toHaveValue(email), { box: true });
  }

  public async expectSaveEnabled(): Promise<void> {
    await test.step('save button is enabled', (): Promise<void> => expect(this.saveButton).toBeEnabled(), { box: true });
  }

  public async expectNewsletterChecked(): Promise<void> {
    await test.step('newsletter box is checked', (): Promise<void> => expect(this.newsletterCheckbox).toBeChecked(), { box: true });
  }

  public async expectHomeLink(): Promise<void> {
    await test.step('home link points at /home', (): Promise<void> => expect(this.homeLink).toHaveAttribute('href', '/home'), { box: true });
  }
}
```

| Concern | Matchers |
|---|---|
| Visibility | `toBeVisible()`, `toBeHidden()`, `not.toBeVisible()` |
| Enabled state | `toBeEnabled()`, `toBeDisabled()` |
| Text | `toHaveText('Welcome')`, `toHaveText(/welcome/i)`, `toContainText('Welcome')` |
| Count | `toHaveCount(5)` |
| Attributes | `toHaveAttribute('href', '/home')`, `toHaveAttribute('alt', /logo/i)` |
| CSS | `toHaveClass(/primary/)`, `toHaveCSS('color', 'rgb(0, 0, 255)')` |
| Input value | `toHaveValue('user@example.com')`, `toBeEmpty()` |
| Focus | `toBeFocused()` |
| Checked state | `toBeChecked()`, `not.toBeChecked()` |
| Editable state | `toBeEditable()` |

### Page Assertions

`expect(page)` takes the `page` fixture, so it may sit in a spec step directly.

```ts
// e2e/dashboard/dashboard.spec.ts
import { expect, test } from './dashboard.fixture';

test.describe('FEATURE: dashboard', () => {
  test('SCENARIO: dashboard url and title match', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('THEN url is /dashboard', (): Promise<void> => expect(page).toHaveURL('/dashboard'));

    await test.step('AND title names the app', (): Promise<void> => expect(page).toHaveTitle('Dashboard - MyApp'));
  });
});
```

| Matcher | Accepts |
|---|---|
| `toHaveURL('/dashboard')` | String, resolved against `baseURL` |
| `toHaveURL(/\/dashboard/)` | Regex |
| `toHaveTitle('Dashboard - MyApp')` | String |
| `toHaveTitle(/dashboard/i)` | Regex |

### Response Assertions

An API call and its status check live in a util so the spec keeps one call per step.

```ts
// e2e/users/test/utils/users-api.spec.util.ts
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

import type { User } from '../../common/users.type';

export const expectUsersOk = async (request: APIRequestContext): Promise<void> => {
  const response = await request.get('/api/users');

  await expect(response).toBeOK();
};

export const fetchUsers = async (request: APIRequestContext): Promise<User[]> => {
  const response = await request.get('/api/users');
  const users: User[] = await response.json();

  return users;
};
```

`not.toBeOK()` asserts a non-2xx status.

## Generic Assertions

Use for non-UI values. Do NOT retry - execute immediately. A step returns the value; the next step asserts on it with a `(): void =>` callback.

```ts
// e2e/users/users-api.spec.ts
import { expect, test } from '@playwright/test';

import type { User } from './common/users.type';
import { fetchUsers } from './test/utils/users-api.spec.util';

test.describe('FEATURE: users api', () => {
  test('SCENARIO: users request returns three users', async ({ request }): Promise<void> => {
    const users = await test.step('WHEN the users are requested', (): Promise<User[]> => fetchUsers(request));

    await test.step('THEN three users are returned', (): void => expect(users).toHaveLength(3));

    await test.step('AND first user is Ada', (): void => expect(users[0]).toHaveProperty('name', 'Ada'));
  });
});
```

| Concern | Matchers |
|---|---|
| Equality | `toBe(5)`, `toEqual({ name: 'Test' })`, `toContain('item')` |
| Truthiness | `toBeTruthy()`, `toBeFalsy()`, `toBeNull()`, `toBeUndefined()`, `toBeDefined()` |
| Numbers | `toBeGreaterThan(5)`, `toBeLessThanOrEqual(10)`, `toBeCloseTo(5.5, 1)` |
| Strings | `toMatch(/pattern/)`, `toContain('substring')` |
| Arrays and objects | `toHaveLength(3)`, `toHaveProperty('key', 'value')` |
| Exceptions | `expect(() => fn()).toThrow()`, `toThrow('error message')`, `await expect(asyncFn()).rejects.toThrow()` |

## Soft Assertions

Continue test execution after failure, report all failures at end. Each `expect.soft` is its own boxed step inside one page-object method, so the report names every failed check.

```ts
// e2e/dashboard/pages/dashboard.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class DashboardPage {
  public readonly dataContainer: Locator;
  public readonly heading: Locator;
  public readonly saveButton: Locator;
  public readonly welcomeText: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.dataContainer = page.getByTestId('data-container');
    this.heading = page.getByRole('heading');
    this.saveButton = page.getByRole('button', { name: 'Save' });
    this.welcomeText = page.getByText('Welcome');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  public async expectHeaderSoft(): Promise<void> {
    await test.step('heading reads Dashboard', (): Promise<void> => expect.soft(this.heading).toHaveText('Dashboard'), { box: true });

    await test.step('save button is enabled', (): Promise<void> => expect.soft(this.saveButton).toBeEnabled(), { box: true });

    await test.step('welcome text is visible', (): Promise<void> => expect.soft(this.welcomeText).toBeVisible(), { box: true });
  }
}
```

### Soft Assertions with Early Exit

Soft failures accumulate in `test.info().errors`. When a later check is pointless after an earlier failure, read that list and return.

```ts
// e2e/signup/pages/signup.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class SignupPage {
  public readonly emailInput: Locator;
  public readonly form: Locator;
  public readonly nameInput: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.form = page.getByRole('form');
    this.nameInput = page.getByLabel('Name');
  }

  public async expectFormFieldsSoft(): Promise<void> {
    await test.step('form is visible', (): Promise<void> => expect.soft(this.form).toBeVisible(), { box: true });

    const hasFailures = test.info().errors.length > 0;

    if (hasFailures) return;

    await test.step('name field is visible', (): Promise<void> => expect.soft(this.nameInput).toBeVisible(), { box: true });

    await test.step('email field is visible', (): Promise<void> => expect.soft(this.emailInput).toBeVisible(), { box: true });
  }
}
```

## Waiting Strategies

### Auto-Waiting (Default)

Actions automatically wait for:

- Element to be attached to DOM
- Element to be visible
- Element to be stable (no animations)
- Element to be enabled
- Element to receive events

Every action on a locator field (`click`, `fill`, `check`, `selectOption`) auto-waits, so a page-object action method is the bare calls with no wait in front of them. Deprecated `page.click(selector)` and `page.fill(selector)` auto-wait too; use locator fields instead.

### Wait for Navigation

A navigation that follows a click is asserted with `expect(page).toHaveURL` in the spec. When the page object must block on the navigation itself, it starts `waitForURL` before the click and awaits it after.

```ts
// e2e/nav/pages/nav.page.ts
import type { Locator, Page } from '@playwright/test';

export class NavPage {
  public readonly dashboardLink: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.dashboardLink = page.getByRole('link', { name: 'Dashboard' });
  }

  public async openDashboard(): Promise<void> {
    const navigation = this.page.waitForURL('**/dashboard');

    await this.dashboardLink.click();
    await navigation;
  }
}
```

| Call | Waits for |
|---|---|
| `page.waitForURL('/dashboard')` | Exact path, resolved against `baseURL` |
| `page.waitForURL(/\/dashboard/)` | Regex |
| `Promise.all([page.waitForURL('**/dashboard'), link.click()])` | Same as the const-then-await shape above |

### Wait for Network

Start the wait before the action, then return the typed result so the spec asserts on it in its own step.

```ts
// e2e/users/pages/users.page.ts
import type { Locator, Page, Response } from '@playwright/test';

export class UsersPage {
  public readonly refreshButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.refreshButton = page.getByRole('button', { name: 'Refresh' });
  }

  public async refresh(): Promise<Response> {
    const responsePromise = this.page.waitForResponse('**/api/users');

    await this.refreshButton.click();

    return responsePromise;
  }
}
```

```ts
// e2e/users/users.spec.ts
import type { Response } from '@playwright/test';

import { expect, test } from './users.fixture';

test.describe('FEATURE: users list', () => {
  test('SCENARIO: list refresh gets a 200 from the users api', async ({ usersPage }): Promise<void> => {
    const response = await test.step('WHEN the list is refreshed', (): Promise<Response> => usersPage.refresh());

    await test.step('THEN users api answered 200', (): void => expect(response.status()).toBe(200));
  });
});
```

| Call | Waits for |
|---|---|
| `page.waitForResponse('**/api/users')` | A response matching the glob |
| `page.waitForRequest('**/api/submit')` | A request matching the glob |
| `page.waitForLoadState('networkidle')` | No network activity for 500 ms; slow and unreliable on apps that poll |

### Wait for Element State

A web-first assertion covers every element state, so a spec never calls `locator.waitFor`. The `expect*` method is a boxed step as in [Locator Assertions](#locator-assertions).

| State | Assertion |
|---|---|
| Appears | `expect(dialog).toBeVisible()` |
| Disappears | `expect(loadingText).toBeHidden()` |
| Attached | `expect(result).toBeAttached()` |
| Detached | `expect(modal).not.toBeAttached()` |

### Wait for Function

`page.waitForFunction` runs a predicate in the browser until it returns truthy. Reach for it only when no locator expresses the condition; `expect(status).toHaveText('Ready')` replaces the second method below.

```ts
// e2e/report/pages/report.page.ts
import type { Page } from '@playwright/test';

const isLoaded = (): boolean => document.querySelector('.loaded') !== null;

const hasText = (selector: string): boolean => document.querySelector(selector)?.textContent === 'Ready';

export class ReportPage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async waitForLoaded(): Promise<void> {
    await this.page.waitForFunction(isLoaded);
  }

  public async waitForStatusReady(): Promise<void> {
    await this.page.waitForFunction(hasText, '.status');
  }
}
```

## Polling & Retrying

### toPass() for Polling

Retry a block until every assertion inside it passes or the timeout ends. The block and its options live in a util; the spec calls the util in one step.

```ts
// e2e/status/test/utils/status-api.spec.util.ts
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

import type { StatusBody } from '../../common/status.type';

const TO_PASS_OPTIONS = { intervals: [1000, 2000, 5000], timeout: 30000 };

export const expectServiceReady = async (request: APIRequestContext): Promise<void> => {
  const check = async (): Promise<void> => {
    const response = await request.get('/api/status');
    const body: StatusBody = await response.json();

    expect(response.status()).toBe(200);
    expect(body.ready).toBe(true);
  };

  await expect(check).toPass(TO_PASS_OPTIONS);
};
```

`intervals` lists the retry delays in milliseconds; `timeout` caps the whole wait. `toPass` ignores the global `expect.timeout` unless configured under `expect.toPass` in the config.

### expect.poll()

Poll a function until its return value satisfies the matcher.

```ts
// e2e/jobs/test/utils/jobs-api.spec.util.ts
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

import type { JobBody } from '../../common/jobs.type';

const POLL_OPTIONS = { intervals: [1000, 2000, 5000], timeout: 30000 };

export const expectJobCompleted = async (request: APIRequestContext, jobId: string): Promise<void> => {
  const readStatus = async (): Promise<string> => {
    const response = await request.get(`/api/job/${jobId}`);
    const body: JobBody = await response.json();

    return body.status;
  };

  await expect.poll(readStatus, POLL_OPTIONS).toBe('completed');
};
```

Polling a DOM value (`expect.poll((): Promise<string | null> => counter.textContent()).toBe('10')`) works but `expect(counter).toHaveText('10')` is the web-first form; prefer it.

## Custom Matchers

`baseExpect.extend` returns a typed `expect`, so no global type augmentation is needed. The matcher takes the page object as receiver, reads its locators (`DashboardPage` exposes `dataContainer` as `page.getByTestId('data-container')`), and returns a `MatcherReturnType`. Pass and fail results are named consts, never inline object literals. The fixture file exports the extended `expect` next to `test`.

```ts
// e2e/dashboard/dashboard.fixture.ts
import type { MatcherReturnType } from '@playwright/test';
import { expect as baseExpect, test as base } from '@playwright/test';

import { DashboardPage } from './pages/dashboard.page';

type DashboardFixtures = {
  readonly dashboardPage: DashboardPage;
};

const LOADED: MatcherReturnType = { message: (): string => '', pass: true };

const NOT_LOADED: MatcherReturnType = { message: (): string => 'Expected data to be loaded but found loading state', pass: false };

const toHaveDataLoaded = async (dashboardPage: DashboardPage): Promise<MatcherReturnType> => {
  try {
    await baseExpect(dashboardPage.dataContainer).toBeVisible();
    await baseExpect(dashboardPage.dataContainer).not.toContainText('Loading');

    return LOADED;
  } catch {
    return NOT_LOADED;
  }
};

export const test = base.extend<DashboardFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  }
});

export const expect = baseExpect.extend({ toHaveDataLoaded });
```

The spec imports `expect` from this file and asserts in one step: `await test.step('data is loaded', (): Promise<void> => expect(dashboardPage).toHaveDataLoaded());`.

## Timeouts

### Configure Timeouts

Config values are named consts above `defineConfig`. Per-test and per-assertion overrides are listed in the table.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const expectOptions = { timeout: 5000 };

export default defineConfig({ expect: expectOptions, timeout: 30000 });
```

| Scope | Setting |
|---|---|
| Every test | `timeout: 30000` in the config |
| Every assertion | `expect: { timeout: 5000 }` in the config |
| One describe | `test.describe.configure({ timeout: 60000 })` at the top of the `describe` callback |
| One test | `test.setTimeout(60000)` as the first line of the test body, before the first step |
| One assertion | `expect(locator).toBeVisible({ timeout: 10000 })` inside the boxed `expect*` method |

## Best Practices

| Do                             | Don't                          |
| ------------------------------ | ------------------------------ |
| Use web-first assertions       | Use generic assertions for DOM |
| Let auto-waiting work          | Add unnecessary explicit waits |
| Use `toPass()` for polling     | Write manual retry loops       |
| Configure appropriate timeouts | Use `waitForTimeout()`         |
| Check specific conditions      | Wait for arbitrary time        |

## Anti-Patterns to Avoid

| Anti-Pattern                                              | Problem                       | Solution                                     |
| --------------------------------------------------------- | ----------------------------- | -------------------------------------------- |
| `await page.waitForTimeout(5000)`                         | Slow, flaky, arbitrary timing | Use auto-waiting or `waitForResponse`        |
| `await new Promise(resolve => setTimeout(resolve, 1000))` | Same as above                 | Use `waitForResponse` or element state waits |
| Generic assertions on DOM elements                        | No auto-retry, flaky          | Use web-first assertions with `expect()`     |
| `locator.waitFor({ state })` in a spec                    | Wait without an assertion     | Boxed `expect*` method on the page object    |

## Related References

- **Debugging timeout issues**: See [debugging.md](../debugging/debugging.md) for troubleshooting
- **Fixing flaky tests**: See [debugging.md](../debugging/debugging.md) for race condition solutions
- **Network interception**: See [test-suite-structure.md](test-suite-structure.md) for API mocking
