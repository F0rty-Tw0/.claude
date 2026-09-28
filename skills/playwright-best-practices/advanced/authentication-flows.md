# Complex Authentication Flow Patterns

## Table of Contents

1. [Shared Pieces](#shared-pieces)
2. [Email Verification Flows](#email-verification-flows)
3. [Password Reset](#password-reset)
4. [Session Timeout](#session-timeout)
5. [Remember Me Persistence](#remember-me-persistence)
6. [Logout Patterns](#logout-patterns)
7. [Tips](#tips)
8. [Related](#related)

> **When to use**: Testing email verification, password reset, session timeout/expiration, or remember-me functionality. For basic auth setup (storage state, OAuth mocking, MFA, role-based access), see [authentication.md](authentication.md).

## Shared Pieces

Every sample in this file builds on the `e2e/auth/` feature from [authentication.md](authentication.md): `Credentials`, `Signup`, `AUTH_DIR`, `SESSION_STATE_PATH`, `EMPTY_STORAGE_STATE`, `TEST_USER`, `SIGNUP_STUB`, `LoginPage`, `HomePage`, `SignupPage`, and `saveSessionState`. The page objects below are new or gain members; `ResetPasswordPage` is shown in full, the rest follow the same shape.

| Page object | File | Members used in this file |
|---|---|---|
| `SignupPage` | `e2e/auth/pages/signup.page.ts` | gains `expectInboxPrompt()` ("Check your inbox") and a `goto({ registerHandler, verifyToken })` option: it routes `**/api/auth/register` through `registerHandler`, and with `verifyToken` also routes the verify call to `verifyMock()`, before it navigates |
| `VerifyPage` | `e2e/auth/pages/verify.page.ts` | `goto(token)` opens `/verify?token=`, `expectConfirmed()` ("Email confirmed") |
| `ForgotPasswordPage` | `e2e/auth/pages/forgot-password.page.ts` | `goto({ tokenHandler })` routes `**/api/auth/forgot-password` through `tokenHandler` before it navigates, `requestLink(email)`, `expectEmailSent()` ("Reset email sent") |
| `ResetPasswordPage` | `e2e/auth/pages/reset-password.page.ts` | shown below; also gains `expectStrengthHint()`, a plain `toBeVisible()` on `getByText(/at least 8 characters/i)` |
| `LoginPage` | `e2e/auth/pages/login.page.ts` | gains `rememberMeCheckbox` ("Keep me signed in"), `expectSessionExpired()` (`/session.*expired\|sign in again/i`) |
| `HomePage` | `e2e/auth/pages/home.page.ts` | gains `goto({ refreshHandler, sessionExpiresIn })` (routes `**/api/auth/session` to `sessionMock(sessionExpiresIn)` and `**/api/auth/refresh` through `refreshHandler` before it navigates), `expectOpen()` (url is `/home`), `expectWelcome()`, `expectSessionWarning()` (`/session.*expir/i` plus the extend button, 10 s timeout because the warning fires on a timer), `extendSession()`, `expectSessionWarningHidden()`, `signOut()` (account menu, then "Sign out") |
| `ProfilePage` | `e2e/auth/pages/profile.page.ts` | `goto({ withoutSessionCookie })` opens the protected `/profile` route, first calling `clearSessionCookie(page.context())` when the option is set |
| `SecuritySettingsPage` | `e2e/auth/pages/security-settings.page.ts` | `goto({ logoutAllHandler })` routes `**/api/auth/logout-all` through it before it navigates, `signOutEverywhere()` (button, then dialog "Confirm") |

```ts
// e2e/auth/pages/reset-password.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class ResetPasswordPage {
  public readonly confirmPasswordInput: Locator;
  public readonly errorMessage: Locator;
  public readonly newPasswordInput: Locator;
  public readonly successMessage: Locator;
  public readonly updateButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.confirmPasswordInput = page.getByLabel('Confirm password');
    this.errorMessage = page.getByRole('alert');
    this.newPasswordInput = page.getByLabel('New password', { exact: true });
    this.successMessage = page.getByText('Password updated');
    this.updateButton = page.getByRole('button', { name: 'Update password' });
  }

  public async goto(token: string): Promise<void> {
    await this.page.goto(`/reset-password?token=${token}`);
  }

  public async submit(password: string): Promise<void> {
    await this.newPasswordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    await this.updateButton.click();
  }

  public async expectUpdated(): Promise<void> {
    await expect(this.successMessage).toBeVisible();
  }

  public async expectError(message: RegExp): Promise<void> {
    await expect(this.errorMessage).toContainText(message);
  }
}
```

The fixture lists every page object a spec below destructures; `signupPage`, `verifyPage`, and `securitySettingsPage` register the same way for the flows described in prose. `rememberedHomePage` seeds its own state: it logs in with "Keep me signed in" in a throwaway context, then hands over a `HomePage` in a fresh context built from the saved file, and closes it after the test.

```ts
// e2e/auth/auth.fixture.ts
import { test as base } from '@playwright/test';

import { AUTH_DIR } from './common/auth.const';
import { ForgotPasswordPage } from './pages/forgot-password.page';
import { HomePage } from './pages/home.page';
import { LoginPage } from './pages/login.page';
import { ProfilePage } from './pages/profile.page';
import { ResetPasswordPage } from './pages/reset-password.page';
import { loginWithRememberMe, openPageWithState } from './test/utils/remember-me.spec.util';

const REMEMBERED_STATE_PATH = `${AUTH_DIR}/remembered.json`;

type AuthFixtures = {
  readonly forgotPasswordPage: ForgotPasswordPage;
  readonly homePage: HomePage;
  readonly loginPage: LoginPage;
  readonly profilePage: ProfilePage;
  readonly rememberedHomePage: HomePage;
  readonly resetPasswordPage: ResetPasswordPage;
};

export const test = base.extend<AuthFixtures>({
  forgotPasswordPage: async ({ page }, use): Promise<void> => {
    await use(new ForgotPasswordPage(page));
  },
  homePage: async ({ page }, use): Promise<void> => {
    await use(new HomePage(page));
  },
  loginPage: async ({ page }, use): Promise<void> => {
    await use(new LoginPage(page));
  },
  profilePage: async ({ page }, use): Promise<void> => {
    await use(new ProfilePage(page));
  },
  rememberedHomePage: async ({ browser }, use): Promise<void> => {
    await loginWithRememberMe(browser, REMEMBERED_STATE_PATH);

    const page = await openPageWithState(browser, REMEMBERED_STATE_PATH);

    await use(new HomePage(page));
    await page.context().close();
  },
  resetPasswordPage: async ({ page }, use): Promise<void> => {
    await use(new ResetPasswordPage(page));
  }
});

export { expect } from '@playwright/test';
```

Two mock shapes appear below. A plain factory fulfills a route with a fixed body (shape in [test-data.md](../core/test-data.md), "Fixture with Factory"). A recorded factory also collects every request it served, so a spec can assert the call happened with `expect.poll`. The shared types live in `test/common/`.

```ts
// e2e/auth/test/stubs/session.stub.ts
import type { SessionBody } from '../common/auth-mock.type';

export const REFRESHED_SESSION_STUB: SessionBody = { expiresIn: 3600, valid: true };
```

```ts
// e2e/auth/test/common/auth-mock.type.ts
import type { Request } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

export type RecordedMock = {
  readonly calls: Request[];
  readonly handler: RouteHandler;
};
```

```ts
// e2e/auth/test/mocks/refresh.mock.ts
import type { Request, Route } from '@playwright/test';

import type { RecordedMock } from '../common/auth-mock.type';
import { REFRESHED_SESSION_STUB } from '../stubs/session.stub';

export const refreshMock = (): RecordedMock => {
  const calls: Request[] = [];
  const handler = (route: Route): Promise<void> => {
    calls.push(route.request());

    return route.fulfill({ json: REFRESHED_SESSION_STUB });
  };
  const mock: RecordedMock = { calls, handler };

  return mock;
};
```

| Factory | File | Route | Body |
|---|---|---|---|
| `registerMock(token)` | `register.mock.ts` | `**/api/auth/register` | `{ message: 'Verification sent', verificationToken }` |
| `verifyMock()` | `verify.mock.ts` | `**/api/auth/verify?token=<token>` | `{ verified: true }` |
| `sessionMock(expiresIn)` | `session.mock.ts` | `**/api/auth/session` | `{ valid: true, expiresIn }` |
| `refreshMock()` | `refresh.mock.ts` | `**/api/auth/refresh` | `{ valid: true, expiresIn: 3600 }`, recorded |
| `logoutAllMock()` | `logout-all.mock.ts` | `**/api/auth/logout-all` | `{ message: 'Logged out everywhere' }`, recorded |

## Email Verification Flows

The real backend issues the token. A pass-through handler fetches the real response, reads the token field, and fulfills with the untouched response. `Promise.withResolvers` (Node 22+, `lib: es2024`) gives the spec a promise that settles once the response has been seen.

```ts
// e2e/auth/test/utils/token-capture.spec.util.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

type TokenBody = {
  readonly resetToken: string;
  readonly verificationToken: string;
};

type TokenField = keyof TokenBody;

type TokenCapture = {
  readonly handler: RouteHandler;
  readonly token: Promise<string>;
};

export const tokenCapture = (field: TokenField): TokenCapture => {
  const { promise, resolve } = Promise.withResolvers<string>();
  const handler = async (route: Route): Promise<void> => {
    const response = await route.fetch();
    const body: TokenBody = await response.json();

    resolve(body[field]);
    await route.fulfill({ response });
  };
  const capture: TokenCapture = { handler, token: promise };

  return capture;
};
```

The captured-token spec has the shape of `password-reset.test.ts` below, with `capture = tokenCapture('verificationToken')`: `WHEN signupPage.goto({ registerHandler: capture.handler })`, `AND signupPage.submit(SIGNUP_STUB)`, `THEN signupPage.expectInboxPrompt()`, `const token = await test.step('AND …', (): Promise<string> => capture.token)`, `AND verifyPage.goto(token)`, `THEN verifyPage.expectConfirmed()`.

Fully mocked, with no backend at all: the opening call is `signupPage.goto({ registerHandler: registerMock(MOCK_TOKEN), verifyToken: MOCK_TOKEN })`, which routes register and ``**/api/auth/verify?token=${MOCK_TOKEN}`` before it navigates. No hook and no route step; the test runs the same steps with `verifyPage.goto(MOCK_TOKEN)` and no capture step.

## Password Reset

Same capture util as above, reading `resetToken` from the forgot-password response. The opening call routes the capture handler before it navigates. The email-sent check is a `THEN`; reading the token and opening the link are actions again, so the final check is a new `THEN`.

```ts
// e2e/auth/password-reset.test.ts
import { test } from './auth.fixture';
import { EMPTY_STORAGE_STATE, TEST_USER } from './common/auth.const';
import { tokenCapture } from './test/utils/token-capture.spec.util';

const NEW_PASSWORD = 'NewPassword456!';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: password reset', () => {
  test('GIVEN a captured reset token, following the reset link updates the password', async ({ forgotPasswordPage, resetPasswordPage }): Promise<void> => {
    const capture = tokenCapture('resetToken');

    await test.step('WHEN the forgot password page is opened', (): Promise<void> => forgotPasswordPage.goto({ tokenHandler: capture.handler }));

    await test.step('AND a reset link is requested', (): Promise<void> => forgotPasswordPage.requestLink(TEST_USER.email));

    await test.step('THEN the reset email sent message is shown', (): Promise<void> => forgotPasswordPage.expectEmailSent());

    const token = await test.step('AND the captured token is read', (): Promise<string> => capture.token);

    await test.step('AND the reset link is opened', (): Promise<void> => resetPasswordPage.goto(token));

    await test.step('AND the new password is submitted', (): Promise<void> => resetPasswordPage.submit(NEW_PASSWORD));

    await test.step('THEN the password updated message is shown', (): Promise<void> => resetPasswordPage.expectUpdated());
  });
});
```

Expired-token and strength cases are further tests in the same spec, each one test of three steps: `WHEN resetPasswordPage.goto(token)`, `AND resetPasswordPage.submit(password)`, then the `THEN` assertion. The title names the token; the `WHEN` does not repeat it.

| Scenario title | Token | Password | `THEN` |
|---|---|---|---|
| `'GIVEN an expired reset token, submitting shows the expired error'` | `'expired-token'` | `NEW_PASSWORD` | `resetPasswordPage.expectError(/expired\|invalid/i)`; `expectError` takes a `RegExp` so the message can be either |
| `'GIVEN a weak password on a valid token, submitting shows the strength hint'` | `'valid-token'` | `'weak'` | `resetPasswordPage.expectStrengthHint()` |

## Session Timeout

### Detecting Expired Sessions

`ProfilePage.goto({ withoutSessionCookie: true })` removes the session cookie through this util, then opens the protected route, so the spec starts from a saved session and has no login hook. The util returns early when no session cookie exists, so it never throws on an already-clean context.

```ts
// e2e/auth/test/utils/session-cookie.spec.util.ts
import type { BrowserContext, Cookie } from '@playwright/test';

const isSessionCookie = (cookie: Cookie): boolean => cookie.name.includes('session') || cookie.name.includes('token');

export const sessionCookies = async (context: BrowserContext): Promise<Cookie[]> => {
  const cookies = await context.cookies();

  return cookies.filter(isSessionCookie);
};

export const clearSessionCookie = async (context: BrowserContext): Promise<void> => {
  const cookies = await sessionCookies(context);
  const sessionCookie = cookies.at(0);

  if (!sessionCookie) return;

  await context.clearCookies({ name: sessionCookie.name });
};
```

```ts
// e2e/auth/session-timeout.e2e.ts
import { expect, test } from './auth.fixture';
import { SESSION_STATE_PATH } from './common/auth.const';

test.use({ storageState: SESSION_STATE_PATH });

test.describe('FEATURE: session timeout', () => {
  test('GIVEN a missing session cookie, a protected route redirects to login', async ({ loginPage, page, profilePage }): Promise<void> => {
    await test.step('WHEN the profile page is opened', (): Promise<void> => profilePage.goto({ withoutSessionCookie: true }));

    await test.step('THEN the login url is shown', (): Promise<void> => expect(page).toHaveURL(/\/login/));

    await test.step('AND the session expired message is shown', (): Promise<void> => loginPage.expectSessionExpired());
  });
});
```

### Session Extension Warning and Action

`homePage.goto({ refreshHandler, sessionExpiresIn: 60 })` routes `sessionMock(60)` and the recorded refresh handler before it navigates. `sessionMock(60)` tells the app the session ends in 60 seconds, so the warning appears without waiting for a real timeout. The recorded mock replaces a `let sessionExtended = false` flag; `expect.poll` retries until the request has been served instead of asserting on a flag that may not have flipped yet.

```ts
// e2e/auth/session-extension.test.ts
import { expect, test } from './auth.fixture';
import { SESSION_STATE_PATH } from './common/auth.const';
import { refreshMock } from './test/mocks/refresh.mock';

test.use({ storageState: SESSION_STATE_PATH });

test.describe('FEATURE: session extension', () => {
  test('GIVEN an expiring session, extending calls the refresh endpoint and hides the warning', async ({ homePage }): Promise<void> => {
    const refresh = refreshMock();

    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto({ refreshHandler: refresh.handler, sessionExpiresIn: 60 }));

    await test.step('THEN the session warning and extend button are shown', (): Promise<void> => homePage.expectSessionWarning());

    await test.step('AND extend is clicked', (): Promise<void> => homePage.extendSession());

    await test.step('THEN the refresh endpoint was called once', (): Promise<void> => expect.poll((): number => refresh.calls.length).toBe(1));

    await test.step('AND the session warning is hidden', (): Promise<void> => homePage.expectSessionWarningHidden());
  });
});
```

## Remember Me Persistence

Two contexts stand in for two browser launches. The first logs in with "Keep me signed in" checked and saves its state through `saveSessionState`; the second starts from that file. Both live in one util file, and the `rememberedHomePage` fixture above calls them, so the spec holds no setup step.

```ts
// e2e/auth/test/utils/remember-me.spec.util.ts
import type { Browser, Page } from '@playwright/test';

import { EMPTY_STORAGE_STATE, TEST_USER } from '../../common/auth.const';
import { LoginPage } from '../../pages/login.page';
import { saveSessionState } from './session.spec.util';

export const loginWithRememberMe = async (browser: Browser, statePath: string): Promise<void> => {
  const context = await browser.newContext({ storageState: EMPTY_STORAGE_STATE });
  const page = await context.newPage();
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.rememberMeCheckbox.check();
  await loginPage.submitAndWaitForHome(TEST_USER);
  await saveSessionState(context, statePath);
  await context.close();
};

export const openPageWithState = async (browser: Browser, storageState: string): Promise<Page> => {
  const context = await browser.newContext({ storageState });

  return context.newPage();
};
```

```ts
// e2e/auth/remember-me.e2e.ts
import { test } from './auth.fixture';

test.describe('FEATURE: remember me', () => {
  test('GIVEN a remember me login, a fresh browser from the saved state opens home without login', async ({ rememberedHomePage }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => rememberedHomePage.goto());

    await test.step('THEN the home url is shown', (): Promise<void> => rememberedHomePage.expectOpen());

    await test.step('AND the welcome message is shown', (): Promise<void> => rememberedHomePage.expectWelcome());
  });
});
```

Session-only login: a second test in the same spec, `'GIVEN a login without keep me signed in, no persistent cookie is left'`, takes a second seeding fixture, `sessionOnlyHomePage`, built from two more util functions of the same shape. `persistentCookiesAfterLogin(browser)` is `loginWithRememberMe` with `uncheck()` and, instead of saving state, returns `cookies.filter((cookie: Cookie): boolean => cookie.expires > 0)`; session cookies have `expires: -1`, so the filter drops them. `openPageWithCookies(browser, cookies)` is `openPageWithState` with `EMPTY_STORAGE_STATE` plus `context.addCookies(cookies)`. The test's `WHEN` opens home and its `THEN` asserts the `/login` url.

## Logout Patterns

`sessionCookies` from the session-timeout util returns every cookie whose name contains `session` or `token`; after logout the list must be empty and a second visit to home must bounce to login. That second visit is an action after assertions, so the check after it is a new `THEN`.

```ts
// e2e/auth/logout.test.ts
import type { Cookie } from '@playwright/test';

import { expect, test } from './auth.fixture';
import { SESSION_STATE_PATH } from './common/auth.const';
import { sessionCookies } from './test/utils/session-cookie.spec.util';

test.use({ storageState: SESSION_STATE_PATH });

test.describe('FEATURE: logout', () => {
  test('GIVEN a signed-in session, signing out clears it', async ({ context, homePage, page }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

    await test.step('AND sign out is clicked in the account menu', (): Promise<void> => homePage.signOut());

    await test.step('THEN the login url is shown', (): Promise<void> => expect(page).toHaveURL('/login'));

    const cookies = await test.step('AND the remaining session cookies are read', (): Promise<Cookie[]> => sessionCookies(context));

    await test.step('AND no session cookies remain', (): void => expect(cookies).toHaveLength(0));

    await test.step('AND the home page is opened again', (): Promise<void> => homePage.goto());

    await test.step('THEN home redirects to login', (): Promise<void> => expect(page).toHaveURL(/\/login/));
  });
});
```

### Logout from All Devices

A second test in the same spec, which is why the file is `logout.test.ts` (it routes the app's own `**/api/**`), `'GIVEN the security settings, signing out everywhere calls logout-all and opens login'`, follows `session-extension.test.ts`: `const logoutAll = logoutAllMock()`, `WHEN securitySettingsPage.goto({ logoutAllHandler: logoutAll.handler })`, `AND securitySettingsPage.signOutEverywhere()`, `THEN expect.poll((): number => logoutAll.calls.length).toBe(1)`, `AND expect(page).toHaveURL(/\/login/)`. The dialog confirm lives inside `signOutEverywhere()` so the spec does not know the dialog exists; `securitySettingsPage` is registered in `AuthFixtures` like the others.

## Tips

1. **Configure shorter session timeouts in test environments** — Enables testing timeout behavior without slow tests
2. **Test token expiration edge cases** — Expired tokens, invalid tokens, already-used tokens
3. **Verify cleanup on logout** — Check both cookies and localStorage are cleared
4. **Test the full flow end-to-end** — Password reset should verify login with new password works

## Related

- [authentication.md](authentication.md) — Storage state, OAuth mocking, MFA, role-based access, API login
- [fixtures-hooks.md](../core/fixtures-hooks.md) — Creating auth fixtures
- [third-party.md](./third-party.md) — Mocking external auth providers
