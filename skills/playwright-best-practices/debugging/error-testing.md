# Error & Edge Case Testing

## Table of Contents

1. [Error Boundaries](#error-boundaries)
2. [Network Failures](#network-failures)
3. [Offline Testing](#offline-testing)
4. [Loading States](#loading-states)
5. [Form Validation](#form-validation)

The samples below share one dashboard page object. `expect*` methods hold plain `await expect(…)` lines and never open a step; action methods never assert. `goto(options: DashboardOptions = {})` routes the failure a case asks for before it navigates. `DashboardOptions`, the dashboard's one options type in `common/dashboard.type.ts`, gains `crashOn?: 'user'` (the endpoint whose payload crashes its widget, as in [console-errors.md](console-errors.md#test-error-boundary-triggers)) and `dataFault?: DataFault` here, with `type DataFault = 'fail-once' | 'hang' | 'reset' | number` in the same file. Without an option `goto` routes nothing.

```ts
// e2e/dashboard/pages/dashboard.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { DashboardOptions } from '../common/dashboard.type';
import { dataFaultMock } from '../test/mocks/data.mock';
import { userNullMock } from '../test/mocks/user.mock';

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

  public async goto(options: DashboardOptions = {}): Promise<void> {
    if (options.crashOn === 'user') await this.page.route('**/api/user', userNullMock());
    if (options.dataFault !== undefined) await this.page.route('**/api/data', dataFaultMock(options.dataFault));
    await this.page.goto('/dashboard');
  }

  public async retry(): Promise<void> {
    await this.retryButton.click();
  }

  public async refresh(): Promise<void> {
    await this.refreshButton.click();
  }

  public async expectErrorFallback(): Promise<void> {
    await expect(this.fallbackMessage).toBeVisible();
    await expect(this.tryAgainButton).toBeVisible();
  }

  public async expectText(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible();
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

Route handlers for `**/api/data` live in one mock file. `dataFailOnceMock` answers 500 to the first request and succeeds afterwards; `dataHangMock` never resolves; `dataAbortMock` aborts with a Playwright error code. `dataFaultMock` maps a `DataFault` to one of them, so `goto` has one route call for every data failure. Both payloads are stubs; the error body is derived from the status the case asks for, so it spreads its stub.

```ts
// e2e/dashboard/test/stubs/data.stub.ts
import type { DataError, DataResponse } from '../../common/dashboard.type';

export const DATA_ERROR_STUB: DataError = { error: 'Error' };

export const DATA_RESPONSE_STUB: DataResponse = { data: 'success' };
```

```ts
// e2e/dashboard/test/mocks/data.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { DataError, DataFault, DataResponse } from '../../common/dashboard.type';
import { DATA_ERROR_STUB, DATA_RESPONSE_STUB } from '../stubs/data.stub';

export const dataErrorMock = (status: number): RouteHandler => {
  const body: DataError = { ...DATA_ERROR_STUB, error: `Error ${status}` };

  return (route: Route): Promise<void> => route.fulfill({ json: body, status });
};

export const dataFailOnceMock = (): RouteHandler => {
  let requestCount = 0;

  return (route: Route): Promise<void> => {
    requestCount += 1;

    if (requestCount === 1) return route.fulfill({ status: 500 });

    return route.fulfill({ json: DATA_RESPONSE_STUB });
  };
};

export const dataHangMock = (): RouteHandler => {
  return (): Promise<void> => new Promise<void>((): void => {});
};

export const dataAbortMock = (errorCode: string): RouteHandler => {
  return (route: Route): Promise<void> => route.abort(errorCode);
};

export const dataFaultMock = (fault: DataFault): RouteHandler => {
  if (fault === 'fail-once') return dataFailOnceMock();
  if (fault === 'hang') return dataHangMock();
  if (fault === 'reset') return dataAbortMock('connectionfailed');

  return dataErrorMock(fault);
};
```

Three cases share the spec: `crashOn: 'user'` routes `userNullMock()`, which fulfills `**/api/user` with `USER_NULL_STUB`, typed `User | null` in `test/stubs/user.stub.ts`, which makes the user widget throw, and the error boundary must render its fallback instead of a blank page; the first data request fails, the app shows its error state, and `Retry` after that check triggers a second request that succeeds; an uncaught exception on `/buggy-page` must not take the navigation down, and `pageErrors` proves the exception fired.

```ts
// e2e/dashboard/dashboard.test.ts
import { expect, test } from './dashboard.fixture';

test.describe('FEATURE: dashboard error handling', () => {
  test('GIVEN a null user api response, the dashboard shows the error boundary fallback', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ crashOn: 'user' }));

    await test.step('THEN the fallback offers a retry', (): Promise<void> => dashboardPage.expectErrorFallback());
  });

  test('GIVEN a failed first request, clicking retry shows the data', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ dataFault: 'fail-once' }));

    await test.step('THEN the error state names the failure', (): Promise<void> => dashboardPage.expectText('Failed to load'));

    await test.step('WHEN the request is retried', (): Promise<void> => dashboardPage.retry());

    await test.step('THEN the data is shown', (): Promise<void> => dashboardPage.expectText('success'));
  });

  test('GIVEN a page that throws on load, the navigation stays rendered', async ({ dashboardPage, page, pageErrors }): Promise<void> => {
    await test.step('WHEN the buggy page is opened', async (): Promise<void> => {
      await page.goto('/buggy-page');
    });

    await test.step('THEN the navigation is visible', (): Promise<void> => expect(dashboardPage.navigation).toBeVisible());

    await test.step('AND the exception was logged', (): void => expect(pageErrors.length).toBeGreaterThan(0));
  });
});
```

## Network Failures

One `test` per status code, generated in a loop. Every status must surface an alert. The timeout and connection-reset cases keep the same steps with a different `dataFault` option and `THEN`:

| Case | `goto` option | `THEN` |
|---|---|---|
| Timeout | `{ dataFault: 'hang' }`: `dataHangMock()` never responds; the app needs its own timeout | `expect(dashboardPage.alert).toContainText('Request timed out', { timeout: 15000 })` |
| Connection reset | `{ dataFault: 'reset' }`: `dataAbortMock('connectionfailed')` | `dashboardPage.expectText('Connection failed')` and `expect(dashboardPage.retryButton).toBeVisible()` |

```ts
// e2e/dashboard/dashboard-network.test.ts
import { expect, test } from './dashboard.fixture';

const ERROR_STATUSES = [400, 401, 403, 404, 500, 502, 503];

test.describe('FEATURE: dashboard network failures', () => {
  for (const status of ERROR_STATUSES) {
    test(`GIVEN a ${status} from the data api, the dashboard shows an alert`, async ({ dashboardPage }): Promise<void> => {
      await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ dataFault: status }));

      await test.step('THEN the alert is visible', (): Promise<void> => expect(dashboardPage.alert).toBeVisible());
    });
  }
});
```

### Test Mid-Request Failure

The handler waits, then aborts, so the request is in flight when it dies. `node:timers/promises` supplies the delay. The spec must show a failure message rather than hang. `uploadPage.goto(options: UploadOptions = {})` takes `type UploadOptions = { readonly abortAfterMs?: number }` and routes `**/api/upload` to `uploadAbortAfterMock(abortAfterMs)` before it navigates.

```ts
// e2e/upload/test/mocks/upload.mock.ts
import { setTimeout as delay } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

export const uploadAbortAfterMock = (delayMs: number): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await delay(delayMs);
    await route.abort('failed');
  };
};
```

```ts
// e2e/upload/upload.test.ts
import { test } from './upload.fixture';

test.describe('FEATURE: upload failures', () => {
  test('GIVEN an upload api that drops mid-request, uploading a large file shows the failure', async ({ uploadPage }): Promise<void> => {
    await test.step('WHEN the upload page is opened', (): Promise<void> => uploadPage.goto({ abortAfterMs: 500 }));

    await test.step('AND the large file is uploaded', (): Promise<void> => uploadPage.upload('test/fixtures/large-file.pdf'));

    await test.step('THEN the failure message is shown', (): Promise<void> => uploadPage.expectUploadFailed());
  });
});
```

`uploadPage.upload(path)` calls `setInputFiles` on the `File` input and clicks `Upload`.

## Offline Testing

This section covers **unexpected network failures** and error recovery. For **offline-first apps (PWAs)** with service workers, caching, and background sync, see [service-workers.md](../browser-apis/service-workers.md#offline-testing).

### Go Offline During Session

`context.setOffline(true)` cuts the network for the whole context. The app must show an offline indicator on the next request and recover when the network returns. Going offline happens after the data check, so it is a new `WHEN`, not an option on the opening call; going back online after the indicator check starts the next phase.

```ts
// e2e/dashboard/dashboard-offline.e2e.ts
import { expect, test } from './dashboard.fixture';

test.describe('FEATURE: dashboard offline recovery', () => {
  test('GIVEN an online dashboard, dropping the connection shows the offline indicator until it returns', async ({ context, dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('THEN the data is visible', (): Promise<void> => expect(dashboardPage.data).toBeVisible());

    await test.step('WHEN the browser goes offline', (): Promise<void> => context.setOffline(true));

    await test.step('AND the data is refreshed', (): Promise<void> => dashboardPage.refresh());

    await test.step('THEN the offline indicator is shown', (): Promise<void> => expect(dashboardPage.offlineIndicator).toBeVisible());

    await test.step('WHEN the browser goes back online', (): Promise<void> => context.setOffline(false));

    await test.step('AND the data is refreshed', (): Promise<void> => dashboardPage.refresh());

    await test.step('THEN the offline indicator is hidden', (): Promise<void> => expect(dashboardPage.offlineIndicator).toBeHidden());
  });
});
```

### Test Network Recovery

Same shape, different assertions:

| Step | Assertion |
| --- | --- |
| Degraded state after `setOffline(true)` | `expect(dashboardPage.alert).toContainText(/offline\|connection/i)` |
| Recovery after `setOffline(false)` and `retry()` | `expect(dashboardPage.data).toBeVisible()` |

## Loading States

Delayed handlers make the loading UI observable. `postsDelayedMock(1000)` answers after one second; `postsEmptyMock()` answers the empty stub. The empty list is a stub too. `postsPage.goto(options: PostsOptions = {})` takes `type PostsOptions = { readonly posts?: 'delayed' | 'empty' }` and routes `**/api/posts` to `postsDelayedMock(1000)` or `postsEmptyMock()` before it navigates.

```ts
// e2e/posts/test/stubs/posts.stub.ts
import type { Post } from '../../common/posts.type';

export const POST_STUB: Post = { id: 1, title: 'Post 1' };

export const POSTS_EMPTY_STUB: Post[] = [];

export const POSTS_STUB: Post[] = [POST_STUB];
```

```ts
// e2e/posts/test/mocks/posts.mock.ts
import { setTimeout as delay } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { Post } from '../../common/posts.type';
import { POSTS_EMPTY_STUB, POSTS_STUB } from '../stubs/posts.stub';

export const postsDelayedMock = (delayMs: number, posts: Post[] = POSTS_STUB): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await delay(delayMs);
    await route.fulfill({ json: posts });
  };
};

export const postsEmptyMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: POSTS_EMPTY_STUB });
};
```

The skeleton appears at once; the content replaces it when the response lands. An empty response renders the empty-state copy and a call to action.

```ts
// e2e/posts/posts.test.ts
import { expect, test } from './posts.fixture';

test.describe('FEATURE: posts loading states', () => {
  test('GIVEN a slow response, the skeleton shows until the content lands', async ({ postsPage }): Promise<void> => {
    await test.step('WHEN the posts page is opened', (): Promise<void> => postsPage.goto({ posts: 'delayed' }));

    await test.step('THEN the skeleton is visible', (): Promise<void> => expect(postsPage.skeleton).toBeVisible());

    await test.step('AND the first post replaces the skeleton', (): Promise<void> => postsPage.expectPost('Post 1'));
  });

  test('GIVEN no posts, the list shows the empty state', async ({ postsPage }): Promise<void> => {
    await test.step('WHEN the posts page is opened', (): Promise<void> => postsPage.goto({ posts: 'empty' }));

    await test.step('THEN the empty state offers to create a post', (): Promise<void> => postsPage.expectEmptyState());
  });
});
```

`postsPage.expectPost(title)` is an `expect*` method that asserts the title is visible and the skeleton is hidden. `expectEmptyState()` asserts the `No items yet` text and the `Create First Item` button.

### Test Loading Indicators

A save action disables its button and shows a spinner while the request is pending, then re-enables and confirms. `saveDelayedMock(500)` has the same shape as `postsDelayedMock`.

`EditorPage` owns `contentInput` (`getByLabel('Content')`), `saveButton`, `savedMessage` (`getByText('Saved')`) and `spinner` (`getByTestId('spinner')`). `goto(options: EditorOptions = {})` opens `/editor`, first routing `**/api/save` to `saveDelayedMock(500)` when `type EditorOptions = { readonly save?: 'delayed' }` asks for it; `write(content)` fills the input; `save()` clicks the button; `expectSaving()` asserts the button disabled and the spinner visible in one `expect*` method; `expectSaved()` asserts the button enabled and `Saved` visible.

```ts
// e2e/editor/editor.test.ts
import { test } from './editor.fixture';

test.describe('FEATURE: editor save', () => {
  test('GIVEN a slow save api, saving new content shows the button loading then success', async ({ editorPage }): Promise<void> => {
    await test.step('WHEN the editor is opened', (): Promise<void> => editorPage.goto({ save: 'delayed' }));

    await test.step('AND new content is written', (): Promise<void> => editorPage.write('New content'));

    await test.step('AND the content is saved', (): Promise<void> => editorPage.save());

    await test.step('THEN the button shows the loading state', (): Promise<void> => editorPage.expectSaving());

    await test.step('AND the button shows the success state', (): Promise<void> => editorPage.expectSaved());
  });
});
```

## Form Validation

`SignupPage` owns `emailInput`, `passwordInput`, `usernameInput` (`getByLabel`) and `signUpButton`. `goto(options: SignupOptions = {})` opens `/signup`; `submit()` clicks the button; `fillEmail(email)` fills then `blur()`s so client-side validation fires; `register(user: SignupUser)` fills every field and submits; `expectFieldError(message)` and `expectNoFieldError(message)` are `expect*` methods on `getByText(message)` visible or hidden.

### Test Client-Side Validation

Submitting an empty form shows one error per required field and stays on `/signup`.

### Test Format Validation

A malformed email shows the format error on blur; a valid one clears it.

### Test Server-Side Validation

`registerInvalidMock()` fulfills `**/api/register` with status 422 and `REGISTER_ERRORS_STUB`, a `RegisterErrors` value in `test/stubs/register.stub.ts` holding `{ errors: { email: 'Email already exists', username: 'Username is taken' } }`. Both messages must render next to their fields. `signupPage.goto({ failOn: 'register' })` routes `registerInvalidMock()` before it navigates; `failOn` is a field of the signup page's one options type, `SignupOptions` in `common/signup.type.ts`.

```ts
// e2e/signup/signup.test.ts
import { expect, test } from './signup.fixture';
import { SIGNUP_USER_STUB } from './test/stubs/signup.stub';

test.describe('FEATURE: signup validation', () => {
  test('GIVEN an empty form, submitting shows the required errors and keeps the url', async ({ page, signupPage }): Promise<void> => {
    await test.step('WHEN the signup page is opened', (): Promise<void> => signupPage.goto());

    await test.step('AND the empty form is submitted', (): Promise<void> => signupPage.submit());

    await test.step('THEN the email is required', (): Promise<void> => signupPage.expectFieldError('Email is required'));

    await test.step('AND the password is required', (): Promise<void> => signupPage.expectFieldError('Password is required'));

    await test.step('AND the url is still the signup page', (): Promise<void> => expect(page).toHaveURL('/signup'));
  });

  test('GIVEN an empty form, a malformed email shows the format error until it is corrected', async ({ signupPage }): Promise<void> => {
    await test.step('WHEN the signup page is opened', (): Promise<void> => signupPage.goto());

    await test.step('AND a malformed email is filled in', (): Promise<void> => signupPage.fillEmail('invalid-email'));

    await test.step('THEN the format error is shown', (): Promise<void> => signupPage.expectFieldError('Invalid email address'));

    await test.step('WHEN a valid email is filled in', (): Promise<void> => signupPage.fillEmail('valid@email.com'));

    await test.step('THEN the format error is gone', (): Promise<void> => signupPage.expectNoFieldError('Invalid email address'));
  });

  test('GIVEN a 422 server rejection, the form shows its errors', async ({ signupPage }): Promise<void> => {
    await test.step('WHEN the signup page is opened', (): Promise<void> => signupPage.goto({ failOn: 'register' }));

    await test.step('AND a taken user is registered', (): Promise<void> => signupPage.register(SIGNUP_USER_STUB));

    await test.step('THEN the email error is shown', (): Promise<void> => signupPage.expectFieldError('Email already exists'));

    await test.step('AND the username error is shown', (): Promise<void> => signupPage.expectFieldError('Username is taken'));
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
