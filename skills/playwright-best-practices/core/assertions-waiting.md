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

A locator assertion lives in a page-object `expect*` method as a plain `await expect(…)` line; the spec's `THEN` step is the only step around it. The page object shows the shape; the table lists every matcher.

```ts
// e2e/profile/pages/profile.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

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
    await expect(this.heading).toHaveText(text);
  }

  public async expectEmail(email: string): Promise<void> {
    await expect(this.emailInput).toHaveValue(email);
  }

  public async expectSaveEnabled(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
  }

  public async expectNewsletterChecked(): Promise<void> {
    await expect(this.newsletterCheckbox).toBeChecked();
  }

  public async expectHomeLink(): Promise<void> {
    await expect(this.homeLink).toHaveAttribute('href', '/home');
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
| Pseudo-element CSS | `toHaveCSS('color', 'rgb(220, 38, 38)', { pseudo: 'after' })` reads `::after`; `pseudo` takes `'before'` or `'after'` |
| Input value | `toHaveValue('user@example.com')`, `toBeEmpty()` |
| Focus | `toBeFocused()` |
| Checked state | `toBeChecked()`, `not.toBeChecked()` |
| Editable state | `toBeEditable()` |

### Page Assertions

`expect(page)` takes the `page` fixture, so it may sit in a spec step directly. The project's `storageState` signs the user in ([house-style.md](house-style.md#configuration)), which is the state the title names.

```ts
// e2e/dashboard/dashboard.e2e.ts
import { expect, test } from './dashboard.fixture';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN a signed-in user, opening the dashboard matches its url and title', async ({ dashboardPage, page }): Promise<void> => {
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

The request is a util the spec's `WHEN` step calls; it returns the `APIResponse`. A check on the body is an `expect*` util that reads the body it asserts, so no step only reads a value and the spec keeps one call per step.

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

export const expectFirstUserName = async (response: APIResponse, name: string): Promise<void> => {
  const [firstUser]: User[] = await response.json();

  expect(firstUser).toHaveProperty('name', name);
};
```

In a `THEN` step, `expect(response).toBeOK()` asserts a 2xx status and `not.toBeOK()` a non-2xx one.

## Generic Assertions

Use for non-UI values. Do NOT retry - execute immediately. A check on a value the test already holds is a `(): void =>` step, like the status below. A check on the body reads it inside its `expect*` util, then asserts with the same matchers. An API spec checks the status first, then the body. The run's global seed ([global-setup.md](global-setup.md#database-migration-in-setup)) stores the three users the title names.

```ts
// e2e/users/users-api.e2e.ts
import type { APIResponse } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { expectFirstUserName, expectUserCount, fetchUsers } from './test/utils/users-api.spec.util';

test.describe('FEATURE: users api', () => {
  test('GIVEN three seeded users, requesting users returns all three with Ada first', async ({ request }): Promise<void> => {
    const response = await test.step('WHEN the users are requested', (): Promise<APIResponse> => fetchUsers(request));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the body lists three users', (): Promise<void> => expectUserCount(response, 3));

    await test.step('AND the first user is Ada', (): Promise<void> => expectFirstUserName(response, 'Ada'));
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

Continue test execution after failure, report all failures at end. The `expect.soft` calls sit as plain lines in one page-object method; the report lists every failed check under the spec's one `THEN` step.

```ts
// e2e/dashboard/pages/dashboard.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

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
    await expect.soft(this.heading).toHaveText('Dashboard');
    await expect.soft(this.saveButton).toBeEnabled();
    await expect.soft(this.welcomeText).toBeVisible();
  }
}
```

`expect.soft.poll(fn).toBe(value)` polls like [expect.poll()](#expectpoll) and records a soft failure instead of stopping the test.

### Soft Assertions with Early Exit

Soft failures accumulate in `test.info().errors`. When a later check is pointless after an earlier failure, read that list and return. The early return is a branch, and a page object branches only in `goto(options)`, so the check is a util over the public `form`, `nameInput`, and `emailInput` locators of `SignupPage`. The spec calls it in one step: `'THEN the form fields are shown'` → `expectFormFieldsSoft(signupPage)`.

```ts
// e2e/signup/test/utils/signup-form.spec.util.ts
import { expect, test } from '@playwright/test';

import type { SignupPage } from '../../pages/signup.po';

export const expectFormFieldsSoft = async (signupPage: SignupPage): Promise<void> => {
  await expect.soft(signupPage.form).toBeVisible();

  const hasFailures = test.info().errors.length > 0;

  if (hasFailures) return;

  await expect.soft(signupPage.nameInput).toBeVisible();
  await expect.soft(signupPage.emailInput).toBeVisible();
};
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
// e2e/nav/pages/nav.po.ts
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
// e2e/users/pages/users.po.ts
import type { Locator, Page, Response } from '@playwright/test';

export class UsersPage {
  public readonly refreshButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.refreshButton = page.getByRole('button', { name: 'Refresh' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/users');
  }

  public async refresh(): Promise<Response> {
    const responsePromise = this.page.waitForResponse('**/api/users');

    await this.refreshButton.click();

    return responsePromise;
  }
}
```

```ts
// e2e/users/users.e2e.ts
import type { Response } from '@playwright/test';

import { expect, test } from './users.fixture';

test.describe('FEATURE: users list', () => {
  test('GIVEN existing users, refreshing the list gets a 200 from the users api', async ({ usersPage }): Promise<void> => {
    await test.step('WHEN the users page is opened', (): Promise<void> => usersPage.goto());

    const response = await test.step('AND the list is refreshed', (): Promise<Response> => usersPage.refresh());

    await test.step('THEN the users api answers 200', (): void => expect(response.status()).toBe(200));
  });
});
```

| Call | Waits for |
|---|---|
| `page.waitForResponse('**/api/users')` | A response matching the glob |
| `page.waitForRequest('**/api/submit')` | A request matching the glob |
| `page.waitForLoadState('networkidle')` | No network activity for 500 ms; slow and unreliable on apps that poll |

### Wait for Element State

A web-first assertion covers every element state, so a spec never calls `locator.waitFor`. The `expect*` method is a plain `await expect(…)` as in [Locator Assertions](#locator-assertions).

| State | Assertion |
|---|---|
| Appears | `expect(dialog).toBeVisible()` |
| Disappears | `expect(loadingText).toBeHidden()` |
| Attached | `expect(result).toBeAttached()` |
| Detached | `expect(modal).not.toBeAttached()` |

### Wait for Function

`locator.waitForFunction(fn, arg?)` calls `fn` with the matched element until it returns truthy. The locator is re-resolved on every retry, so a re-render does not break the wait. Reach for it only when no web-first assertion expresses the condition: `toHaveText`, `toHaveAttribute`, and `toHaveJSProperty` cover most of them. An image finishing decode has no matcher:

```ts
// e2e/report/pages/report.po.ts
import type { Locator, Page } from '@playwright/test';

const isDecoded = (element: Element): boolean => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0;

export class ReportPage {
  public readonly chartImage: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.chartImage = page.getByRole('img', { name: 'Revenue chart' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/report');
  }

  public async waitForChartDecoded(): Promise<void> {
    await this.chartImage.waitForFunction(isDecoded);
  }
}
```

`page.waitForFunction` stays for page-global state with no element (`window.appReady`). A predicate that calls `document.querySelector` is a locator in disguise: use `locator.waitForFunction` or a web-first assertion.

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

import { DashboardPage } from './pages/dashboard.po';

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

The spec imports `expect` from this file and asserts in one step: `await test.step('THEN data is loaded', (): Promise<void> => expect(dashboardPage).toHaveDataLoaded());`.

## Timeouts

### Configure Timeouts

Config values are named consts above `defineConfig`. Per-test and per-assertion overrides are listed in the table.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const expectOptions = { timeout: 5000 };

export default defineConfig({ expect: expectOptions, testMatch: '**/*.@(e2e|test).ts', timeout: 30000 });
```

| Scope | Setting |
|---|---|
| Every test | `timeout: 30000` in the config |
| Every assertion | `expect: { timeout: 5000 }` in the config |
| One describe | `test.describe.configure({ timeout: 60000 })` at the top of the `describe` callback |
| One test | `test.setTimeout(60000)` as the first line of the test body, before the first step |
| One assertion | `expect(locator).toBeVisible({ timeout: 10000 })` inside the `expect*` method |
| Cancel early | `{ signal }` takes an `AbortSignal` on actions and web-first assertions; aborting rejects the call at once instead of waiting out the timeout |

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
| `expect(await locator.isVisible()).toBe(true)`            | Read once, no retry           | `await expect(locator).toBeVisible()`        |
| `expect(await locator.textContent()).toBe('Saved')`       | Read once, no retry           | `await expect(locator).toHaveText('Saved')`  |
| `expect(await locator.count()).toBe(3)`                   | Read once, no retry           | `await expect(locator).toHaveCount(3)`       |
| `expect(locator).toBeVisible()` with no `await`           | Never awaited: passes or fails after the line moved on | `await` it; enable `@typescript-eslint/no-floating-promises` |
| `toBeVisible()` right before `click()` on the same locator | The click already waits for visibility | Drop it; assert what the click changes |
| `locator.waitFor({ state })` in a spec                    | Wait without an assertion     | Web-first `expect*` method on the page object |

## Related References

- **Debugging timeout issues**: See [debugging.md](../debugging/debugging.md) for troubleshooting
- **Fixing flaky tests**: See [debugging.md](../debugging/debugging.md) for race condition solutions
- **Network interception**: See [test-suite-structure.md](test-suite-structure.md) for API mocking
