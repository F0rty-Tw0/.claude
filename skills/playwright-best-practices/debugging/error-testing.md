# Error & Edge Case Testing

## Table of Contents

1. [Error Boundaries](#error-boundaries)
2. [Network Failures](#network-failures)
3. [Offline Testing](#offline-testing)
4. [Loading States](#loading-states)
5. [Form Validation](#form-validation)

The samples below share one dashboard page object. `expect*` methods are boxed steps; action methods never assert.

```ts
// e2e/dashboard/pages/dashboard.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class DashboardPage {
  public readonly alert: Locator;
  public readonly data: Locator;
  public readonly fallbackMessage: Locator;
  public readonly navigation: Locator;
  public readonly offlineIndicator: Locator;
  public readonly refreshButton: Locator;
  public readonly retryButton: Locator;
  public readonly tryAgainButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.alert = page.getByRole('alert');
    this.data = page.getByTestId('data');
    this.fallbackMessage = page.getByText('Something went wrong');
    this.navigation = page.getByRole('navigation');
    this.offlineIndicator = page.getByText("You're offline");
    this.refreshButton = page.getByRole('button', { name: 'Refresh' });
    this.retryButton = page.getByRole('button', { name: 'Retry' });
    this.tryAgainButton = page.getByRole('button', { name: 'Try Again' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  public async retry(): Promise<void> {
    await this.retryButton.click();
  }

  public async refresh(): Promise<void> {
    await this.refreshButton.click();
  }

  public async expectErrorFallback(): Promise<void> {
    await test.step('fallback offers a retry', async (): Promise<void> => {
      await expect(this.fallbackMessage).toBeVisible();
      await expect(this.tryAgainButton).toBeVisible();
    }, { box: true });
  }

  public async expectText(text: string): Promise<void> {
    await test.step(`"${text}" is visible`, (): Promise<void> => expect(this.page.getByText(text)).toBeVisible(), { box: true });
  }
}
```

The fixture exposes the page object and a `pageErrors` list fed by the `pageerror` event.

```ts
// e2e/dashboard/dashboard.fixture.ts
import { test as base } from '@playwright/test';

import { DashboardPage } from './pages/dashboard.page';

type DashboardFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly pageErrors: string[];
};

export const test = base.extend<DashboardFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  pageErrors: async ({ page }, use): Promise<void> => {
    const errors: string[] = [];
    const record = (error: Error): void => {
      errors.push(error.message);
    };

    page.on('pageerror', record);

    await use(errors);
  }
});

export { expect } from '@playwright/test';
```

## Error Boundaries

Route handlers for `**/api/data` live in one mock file. `dataFailOnceMock` answers 500 to the first request and succeeds afterwards; `dataHangMock` never resolves; `dataAbortMock` aborts with a Playwright error code.

```ts
// e2e/dashboard/test/mocks/data.mock.ts
import type { Route } from '@playwright/test';

import type { DataResponse } from '../../common/dashboard.type';

type RouteHandler = (route: Route) => Promise<void>;

const DATA_BODY: DataResponse = { data: 'success' };

export const dataErrorMock = (status: number): RouteHandler => {
  const body = { error: `Error ${status}` };

  return (route: Route): Promise<void> => route.fulfill({ json: body, status });
};

export const dataFailOnceMock = (): RouteHandler => {
  let requestCount = 0;

  return (route: Route): Promise<void> => {
    requestCount += 1;

    if (requestCount === 1) return route.fulfill({ status: 500 });

    return route.fulfill({ json: DATA_BODY });
  };
};

export const dataHangMock = (): RouteHandler => {
  return (): Promise<void> => new Promise<void>((): void => {});
};

export const dataAbortMock = (errorCode: string): RouteHandler => {
  return (route: Route): Promise<void> => route.abort(errorCode);
};
```

Three cases share the spec: `userNullMock()` fulfills `**/api/user` with `json: null`, which makes the user widget throw, and the error boundary must render its fallback instead of a blank page; the first data request fails, the app shows its error state, and `Retry` triggers a second request that succeeds; an uncaught exception on `/buggy-page` must not take the navigation down, and `pageErrors` proves the exception fired.

```ts
// e2e/dashboard/dashboard.spec.ts
import { expect, test } from './dashboard.fixture';
import { dataFailOnceMock } from './test/mocks/data.mock';
import { userNullMock } from './test/mocks/user.mock';

test.describe('FEATURE: dashboard error handling', () => {
  test('a null user api response shows the error boundary fallback', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('GIVEN the user api is stubbed with null', async (): Promise<void> => {
      await page.route('**/api/user', userNullMock());
    });

    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('THEN the fallback offers a retry', (): Promise<void> => dashboardPage.expectErrorFallback());
  });

  test('clicking retry after a failed first request shows the data', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('GIVEN the first data request fails', async (): Promise<void> => {
      await page.route('**/api/data', dataFailOnceMock());
    });

    await test.step('AND the dashboard is open', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the error state names the failure', (): Promise<void> => dashboardPage.expectText('Failed to load'));

    await test.step('WHEN the request is retried', (): Promise<void> => dashboardPage.retry());

    await test.step('THEN the data is shown', (): Promise<void> => dashboardPage.expectText('success'));
  });

  test('a runtime error leaves the navigation rendered', async ({ dashboardPage, page, pageErrors }): Promise<void> => {
    await test.step('WHEN the buggy page is opened', async (): Promise<void> => {
      await page.goto('/buggy-page');
    });

    await test.step('THEN the navigation is visible', (): Promise<void> => expect(dashboardPage.navigation).toBeVisible());

    await test.step('AND the exception was logged', (): void => expect(pageErrors.length).toBeGreaterThan(0));
  });
});
```

## Network Failures

One `test` per status code, generated in a loop. Every status must surface an alert. The timeout and connection-reset cases keep the same three steps with a different mock and `THEN`:

| Case | Mock | `THEN` |
|---|---|---|
| Timeout | `dataHangMock()` never responds; the app needs its own timeout | `expect(dashboardPage.alert).toContainText('Request timed out', { timeout: 15000 })` |
| Connection reset | `dataAbortMock('connectionfailed')` | `dashboardPage.expectText('Connection failed')` and `expect(dashboardPage.retryButton).toBeVisible()` |

```ts
// e2e/dashboard/dashboard-network.spec.ts
import { expect, test } from './dashboard.fixture';
import { dataErrorMock } from './test/mocks/data.mock';

const ERROR_STATUSES = [400, 401, 403, 404, 500, 502, 503];

test.describe('FEATURE: dashboard network failures', () => {
  for (const status of ERROR_STATUSES) {
    test(`a ${status} from the data api shows an alert`, async ({ dashboardPage, page }): Promise<void> => {
      await test.step(`GIVEN the data api is stubbed with ${status}`, async (): Promise<void> => {
        await page.route('**/api/data', dataErrorMock(status));
      });

      await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN the alert is visible', (): Promise<void> => expect(dashboardPage.alert).toBeVisible());
    });
  }
});
```

### Test Mid-Request Failure

The handler waits, then aborts, so the request is in flight when it dies. `node:timers/promises` supplies the delay. The spec must show a failure message rather than hang.

```ts
// e2e/upload/test/mocks/upload.mock.ts
import { setTimeout as delay } from 'node:timers/promises';

import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

export const uploadAbortAfterMock = (delayMs: number): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await delay(delayMs);
    await route.abort('failed');
  };
};
```

```ts
// e2e/upload/upload.spec.ts
import { test } from './upload.fixture';
import { uploadAbortAfterMock } from './test/mocks/upload.mock';

test('an upload aborted mid-request shows the failure', async ({ page, uploadPage }): Promise<void> => {
  await test.step('GIVEN the upload aborts after 500ms', async (): Promise<void> => {
    await page.route('**/api/upload', uploadAbortAfterMock(500));
  });

  await test.step('AND the upload page is open', (): Promise<void> => uploadPage.goto());

  await test.step('WHEN the large file is uploaded', (): Promise<void> => uploadPage.upload('test/fixtures/large-file.pdf'));

  await test.step('THEN the failure message is shown', (): Promise<void> => uploadPage.expectUploadFailed());
});
```

`uploadPage.upload(path)` calls `setInputFiles` on the `File` input and clicks `Upload`.

## Offline Testing

This section covers **unexpected network failures** and error recovery. For **offline-first apps (PWAs)** with service workers, caching, and background sync, see [service-workers.md](../browser-apis/service-workers.md#offline-testing).

### Go Offline During Session

`context.setOffline(true)` cuts the network for the whole context. The app must show an offline indicator on the next request and recover when the network returns.

```ts
// e2e/dashboard/dashboard-offline.spec.ts
import { expect, test } from './dashboard.fixture';

test('the dashboard recovers after the connection drops and returns', async ({ context, dashboardPage }): Promise<void> => {
  await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());

  await test.step('AND the data is visible', (): Promise<void> => expect(dashboardPage.data).toBeVisible());

  await test.step('WHEN the browser goes offline', (): Promise<void> => context.setOffline(true));

  await test.step('AND the data is refreshed', (): Promise<void> => dashboardPage.refresh());

  await test.step('THEN the offline indicator is shown', (): Promise<void> => expect(dashboardPage.offlineIndicator).toBeVisible());

  await test.step('WHEN the browser goes back online', (): Promise<void> => context.setOffline(false));

  await test.step('AND the data is refreshed', (): Promise<void> => dashboardPage.refresh());

  await test.step('THEN the offline indicator is hidden', (): Promise<void> => expect(dashboardPage.offlineIndicator).toBeHidden());
});
```

### Test Network Recovery

Same shape, different assertions:

| Step | Assertion |
| --- | --- |
| Degraded state after `setOffline(true)` | `expect(dashboardPage.alert).toContainText(/offline\|connection/i)` |
| Recovery after `setOffline(false)` and `retry()` | `expect(dashboardPage.data).toBeVisible()` |

## Loading States

Delayed handlers make the loading UI observable. `postsDelayedMock(1000)` answers after one second; `postsEmptyMock()` answers `[]`.

```ts
// e2e/posts/test/mocks/posts.mock.ts
import { setTimeout as delay } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { Post } from '../../common/posts.type';

type RouteHandler = (route: Route) => Promise<void>;

const POSTS_BODY: Post[] = [{ id: 1, title: 'Post 1' }];

export const postsDelayedMock = (delayMs: number): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await delay(delayMs);
    await route.fulfill({ json: POSTS_BODY });
  };
};

export const postsEmptyMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: [] });
};
```

The skeleton appears at once; the content replaces it when the response lands. An empty response renders the empty-state copy and a call to action.

```ts
// e2e/posts/posts.spec.ts
import { expect, test } from './posts.fixture';
import { postsDelayedMock, postsEmptyMock } from './test/mocks/posts.mock';

test.describe('FEATURE: posts loading states', () => {
  test('a slow response shows the skeleton until the content lands', async ({ page, postsPage }): Promise<void> => {
    await test.step('GIVEN the posts api is delayed by one second', async (): Promise<void> => {
      await page.route('**/api/posts', postsDelayedMock(1000));
    });

    await test.step('WHEN the posts page is opened', (): Promise<void> => postsPage.goto());

    await test.step('THEN the skeleton is visible', (): Promise<void> => expect(postsPage.skeleton).toBeVisible());

    await test.step('AND the first post replaces the skeleton', (): Promise<void> => postsPage.expectPost('Post 1'));
  });

  test('no posts shows the empty state', async ({ page, postsPage }): Promise<void> => {
    await test.step('GIVEN the posts api is stubbed with an empty list', async (): Promise<void> => {
      await page.route('**/api/posts', postsEmptyMock());
    });

    await test.step('WHEN the posts page is opened', (): Promise<void> => postsPage.goto());

    await test.step('THEN the empty state offers to create a post', (): Promise<void> => postsPage.expectEmptyState());
  });
});
```

`postsPage.expectPost(title)` is a boxed step that asserts the title is visible and the skeleton is hidden. `expectEmptyState()` asserts the `No items yet` text and the `Create First Item` button.

### Test Loading Indicators

A save action disables its button and shows a spinner while the request is pending, then re-enables and confirms. `saveDelayedMock(500)` has the same shape as `postsDelayedMock`.

`EditorPage` owns `contentInput` (`getByLabel('Content')`), `saveButton`, `savedMessage` (`getByText('Saved')`) and `spinner` (`getByTestId('spinner')`). `goto()` opens `/editor`; `write(content)` fills the input; `save()` clicks the button; `expectSaving()` asserts the button disabled and the spinner visible in one boxed step; `expectSaved()` asserts the button enabled and `Saved` visible.

```ts
// e2e/editor/editor.spec.ts
import { test } from './editor.fixture';
import { saveDelayedMock } from './test/mocks/save.mock';

test('saving content shows the button loading then success', async ({ editorPage, page }): Promise<void> => {
  await test.step('GIVEN the save api is delayed', async (): Promise<void> => {
    await page.route('**/api/save', saveDelayedMock(500));
  });

  await test.step('AND the editor is open', (): Promise<void> => editorPage.goto());

  await test.step('AND new content is written', (): Promise<void> => editorPage.write('New content'));

  await test.step('WHEN the content is saved', (): Promise<void> => editorPage.save());

  await test.step('THEN the button shows the loading state', (): Promise<void> => editorPage.expectSaving());

  await test.step('AND the button shows the success state', (): Promise<void> => editorPage.expectSaved());
});
```

## Form Validation

`SignupPage` owns `emailInput`, `passwordInput`, `usernameInput` (`getByLabel`) and `signUpButton`. `goto()` opens `/signup`; `submit()` clicks the button; `fillEmail(email)` fills then `blur()`s so client-side validation fires; `register(user: SignupUser)` fills every field and submits; `expectFieldError(message)` and `expectNoFieldError(message)` are boxed steps on `getByText(message)` visible or hidden.

### Test Client-Side Validation

Submitting an empty form shows one error per required field and stays on `/signup`.

### Test Format Validation

A malformed email shows the format error on blur; a valid one clears it.

### Test Server-Side Validation

`registerInvalidMock()` fulfills `**/api/register` with status 422 and `{ errors: { email: 'Email already exists', username: 'Username is taken' } }`. Both messages must render next to their fields.

```ts
// e2e/signup/signup.spec.ts
import { expect, test } from './signup.fixture';
import { registerInvalidMock } from './test/mocks/register.mock';
import { SIGNUP_USER_STUB } from './test/stubs/signup.stub';

test.describe('FEATURE: signup validation', () => {
  test.describe('GIVEN the signup page is open', () => {
    test.beforeEach(async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());
    });

    test('submitting an empty form shows the required errors and keeps the url', async ({ page, signupPage }): Promise<void> => {
      await test.step('WHEN the empty form is submitted', (): Promise<void> => signupPage.submit());

      await test.step('THEN the email is required', (): Promise<void> => signupPage.expectFieldError('Email is required'));

      await test.step('AND the password is required', (): Promise<void> => signupPage.expectFieldError('Password is required'));

      await test.step('AND the url is still the signup page', (): Promise<void> => expect(page).toHaveURL('/signup'));
    });

    test('correcting a malformed email clears the format error', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN a malformed email is filled in', (): Promise<void> => signupPage.fillEmail('invalid-email'));

      await test.step('THEN the format error is shown', (): Promise<void> => signupPage.expectFieldError('Invalid email address'));

      await test.step('WHEN a valid email is filled in', (): Promise<void> => signupPage.fillEmail('valid@email.com'));

      await test.step('THEN the format error is gone', (): Promise<void> => signupPage.expectNoFieldError('Invalid email address'));
    });

    test('a server rejection shows its errors on the form', async ({ page, signupPage }): Promise<void> => {
      await test.step('GIVEN the register api is stubbed with 422', async (): Promise<void> => {
        await page.route('**/api/register', registerInvalidMock());
      });

      await test.step('WHEN a taken user is registered', (): Promise<void> => signupPage.register(SIGNUP_USER_STUB));

      await test.step('THEN the email error is shown', (): Promise<void> => signupPage.expectFieldError('Email already exists'));

      await test.step('AND the username error is shown', (): Promise<void> => signupPage.expectFieldError('Username is taken'));
    });
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern             | Problem                        | Solution                               |
| ------------------------ | ------------------------------ | -------------------------------------- |
| Only testing happy path  | Misses error handling bugs     | Test all error scenarios               |
| No network failure tests | App crashes on poor connection | Test offline/slow/failed requests      |
| Skipping loading states  | Janky UX not caught            | Assert loading UI appears              |
| Ignoring validation      | Form bugs slip through         | Test both client and server validation |

## Related References

- **Network Mocking**: See [network-advanced.md](../advanced/network-advanced.md) for mock patterns
- **Assertions**: See [assertions-waiting.md](../core/assertions-waiting.md) for error assertions
