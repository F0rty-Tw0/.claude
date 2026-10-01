# Complex Authentication Flow Patterns

## Table of Contents

1. [Shared Pieces](#shared-pieces)
2. [Email Verification Flows](#email-verification-flows)
3. [Password Reset](#password-reset)
4. [Session Timeout](#session-timeout)
5. [Remember Me Persistence](#remember-me-persistence)
6. [Passkeys](#passkeys)
7. [Logout Patterns](#logout-patterns)
8. [Tips](#tips)
9. [Related](#related)

> **When to use**: Testing email verification, password reset, session timeout/expiration, remember-me, or passkey sign-in. For basic auth setup (storage state, OAuth mocking, MFA, role-based access), see [authentication.md](authentication.md).

## Shared Pieces

Every sample in this file builds on the `e2e/auth/` feature from [authentication.md](authentication.md): `Credentials`, `Signup`, `SESSION_STATE_PATH`, `EMPTY_STORAGE_STATE`, `TEST_USER`, `SIGNUP_STUB`, `LoginPage`, `HomePage`, `SignupPage`, and `saveSessionState`. The page objects below are new or gain members; `ResetPasswordPage` is shown in full, the rest follow the same shape.

Opening options are data, never handlers. Each page object below that takes them declares one `<Page>Options` type in `auth.type.ts` (`HomeOptions`, `ProfileOptions`, `SecuritySettingsOptions`, `SignupOptions`), `readonly` and optional, and picks the mock itself. With no option, `goto()` routes nothing.

| Page object | File | Members used in this file |
|---|---|---|
| `SignupPage` | `e2e/auth/pages/signup.page.ts` | gains `expectInboxPrompt()` ("Check your inbox"), `register(signup): Promise<string>` (`submit(signup)`, then the `verificationToken` of the register response, read the way `requestLink` reads its token), and `goto({ verificationToken })`: when given the option, it routes `**/api/auth/register` to `registerMock(verificationToken)` and the verify call to `verifyMock()` before it navigates |
| `VerifyPage` | `e2e/auth/pages/verify.page.ts` | `goto(token)` opens `/verify?token=`, `expectConfirmed()` ("Email confirmed") |
| `ForgotPasswordPage` | `e2e/auth/pages/forgot-password.page.ts` | `goto()`, `requestLink(email): Promise<string>` (starts `waitForResponse('**/api/auth/forgot-password')`, sends the form, returns `readToken(response, 'resetToken')`), `expectEmailSent()` ("Reset email sent") |
| `ResetPasswordPage` | `e2e/auth/pages/reset-password.page.ts` | shown below; also gains `expectStrengthHint()`, a plain `toBeVisible()` on `getByText(/at least 8 characters/i)` |
| `LoginPage` | `e2e/auth/pages/login.page.ts` | gains `rememberMeCheckbox` ("Keep me signed in"), `expectSessionExpired()` (`/session.*expired\|sign in again/i`) |
| `HomePage` | `e2e/auth/pages/home.page.ts` | gains `goto({ sessionExpiresIn })`: when given the option, it routes `**/api/auth/session` to `sessionMock(sessionExpiresIn)` and `**/api/auth/refresh` to the recorded `refreshMock()` it creates in its constructor, before it navigates. Also `expectRefreshCalls(count)` (`expect.poll` on that record), `expectOpen()` (url is `/home`), `expectRedirectedToLogin()` (url is `/login`), `expectWelcome()`, `expectSessionWarning()` (`/session.*expir/i` plus the extend button, 10 s timeout because the warning fires on a timer), `extendSession()`, `expectSessionWarningHidden()`, `signOut()` (account menu, then "Sign out") |
| `ProfilePage` | `e2e/auth/pages/profile.page.ts` | `goto({ withoutSessionCookie })` opens the protected `/profile` route, first calling `clearSessionCookie(page.context())` when the option is set |
| `SecuritySettingsPage` | `e2e/auth/pages/security-settings.page.ts` | `goto({ stubLogoutAll })`: when given the flag, it routes `**/api/auth/logout-all` to the recorded `logoutAllMock()` it creates in its constructor, before it navigates. Also `expectLogoutAllCalls(count)` (`expect.poll` on that record), `signOutEverywhere()` (button, then dialog "Confirm") |

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

The fixture lists every page object a spec below destructures; `signupPage`, `verifyPage`, and `securitySettingsPage` register the same way for the flows described in prose. `rememberedHomePage` seeds its own state: it logs in with "Keep me signed in" in a throwaway context, then hands over a `HomePage` in a fresh context built from the saved file, and closes it after the test. The file is `testInfo.outputPath('remembered.json')`, so every test writes its own. `sessionOnlyHomePage` does the same without "Keep me signed in" and carries over only the persistent cookies; see [Remember Me Persistence](#remember-me-persistence).

```ts
// e2e/auth/auth.fixture.ts
import { test as base } from '@playwright/test';

import { ForgotPasswordPage } from './pages/forgot-password.page';
import { HomePage } from './pages/home.page';
import { LoginPage } from './pages/login.page';
import { ProfilePage } from './pages/profile.page';
import { ResetPasswordPage } from './pages/reset-password.page';
import { loginWithRememberMe, openPageWithCookies, openPageWithState, persistentCookiesAfterLogin } from './test/utils/remember-me.spec.util';

type AuthFixtures = {
  readonly forgotPasswordPage: ForgotPasswordPage;
  readonly homePage: HomePage;
  readonly loginPage: LoginPage;
  readonly profilePage: ProfilePage;
  readonly rememberedHomePage: HomePage;
  readonly resetPasswordPage: ResetPasswordPage;
  readonly sessionOnlyHomePage: HomePage;
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
  rememberedHomePage: async ({ browser }, use, testInfo): Promise<void> => {
    const statePath = testInfo.outputPath('remembered.json');

    await loginWithRememberMe(browser, statePath);

    const page = await openPageWithState(browser, statePath);

    await use(new HomePage(page));
    await page.context().close();
  },
  resetPasswordPage: async ({ page }, use): Promise<void> => {
    await use(new ResetPasswordPage(page));
  },
  sessionOnlyHomePage: async ({ browser }, use): Promise<void> => {
    const cookies = await persistentCookiesAfterLogin(browser);
    const page = await openPageWithCookies(browser, cookies);

    await use(new HomePage(page));
    await page.context().close();
  }
});

export { expect } from '@playwright/test';
```

Two mock shapes appear below. A plain factory fulfills a route with a fixed body (shape in [test-data.md](../core/test-data.md), "Fixture with Factory"). A recorded factory also collects every request it served, so the page object that routes it can check the call count with `expect.poll`. The shared types live in `test/common/`.

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

export type SessionBody = {
  readonly expiresIn: number;
  readonly valid: boolean;
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

The real backend issues the token in its response. The action that sends the email waits for that response and returns the token, so the next action can use it and no step only reads a value. `waitForResponse` starts before the click and only observes, so nothing is routed and a real-backend spec stays `.e2e.ts`. `SignupPage.register` and `ForgotPasswordPage.requestLink` read the body through one util:

```ts
// e2e/auth/test/utils/token-response.spec.util.ts
import type { Response } from '@playwright/test';

type TokenBody = {
  readonly resetToken: string;
  readonly verificationToken: string;
};

type TokenField = keyof TokenBody;

export const readToken = async (response: Response, field: TokenField): Promise<string> => {
  const body: TokenBody = await response.json();

  return body[field];
};
```

The verification spec has the shape of `password-reset.e2e.ts` below:

1. `WHEN signupPage.goto()`
2. `const token = await test.step('AND the signup form is submitted', (): Promise<string> => signupPage.register(SIGNUP_STUB))`
3. `THEN signupPage.expectInboxPrompt()`
4. `WHEN verifyPage.goto(token)`
5. `THEN verifyPage.expectConfirmed()`

Fully mocked, with no backend at all, only the opening call changes: `signupPage.goto({ verificationToken: MOCK_TOKEN })` routes register and ``**/api/auth/verify?token=${MOCK_TOKEN}`` before it navigates, and `register()` returns `MOCK_TOKEN` from the mocked response. That option routes the app's own api, so that spec is a `.test.ts`.

## Password Reset

`requestLink` returns the `resetToken` of the forgot-password response, read the same way; nothing is routed, so the spec is `.e2e.ts`. The email-sent check ends the first phase. Opening the reset link is an action after a check, so it starts a new phase with its own `WHEN` and `THEN`.

```ts
// e2e/auth/password-reset.e2e.ts
import { test } from './auth.fixture';
import { EMPTY_STORAGE_STATE, TEST_USER } from './common/auth.const';

const NEW_PASSWORD = 'NewPassword456!';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: password reset', () => {
  test('GIVEN a registered email, following the reset link updates the password', async ({ forgotPasswordPage, resetPasswordPage }): Promise<void> => {
    await test.step('WHEN the forgot password page is opened', (): Promise<void> => forgotPasswordPage.goto());

    const token = await test.step('AND a reset link is requested', (): Promise<string> => forgotPasswordPage.requestLink(TEST_USER.email));

    await test.step('THEN the reset email sent message is shown', (): Promise<void> => forgotPasswordPage.expectEmailSent());

    await test.step('WHEN the reset link is opened', (): Promise<void> => resetPasswordPage.goto(token));

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

`ProfilePage.goto({ withoutSessionCookie: true })` removes the session cookie through this util, then opens the protected route, so the spec starts from a saved session and has no login hook. The util returns early when no session cookie exists, so it never throws on an already-clean context. `expectNoSessionCookies` is the logout check further down; it reads the cookies itself, so no step only reads them.

```ts
// e2e/auth/test/utils/session-cookie.spec.util.ts
import type { BrowserContext, Cookie } from '@playwright/test';
import { expect } from '@playwright/test';

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

export const expectNoSessionCookies = async (context: BrowserContext): Promise<void> => {
  await expect.poll((): Promise<Cookie[]> => sessionCookies(context)).toHaveLength(0);
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

`homePage.goto({ sessionExpiresIn: 60 })` routes `sessionMock(60)` and the page object's recorded `refreshMock()` before it navigates. `sessionMock(60)` tells the app the session ends in 60 seconds, so the warning appears without waiting for a real timeout. The recorded mock replaces a `let sessionExtended = false` flag: `expectRefreshCalls(1)` polls the record with `expect.poll`, which retries until the request has been served instead of asserting on a flag that may not have flipped yet. Clicking extend is an action after a check, so it starts a new phase.

```ts
// e2e/auth/session-extension.test.ts
import { test } from './auth.fixture';
import { SESSION_STATE_PATH } from './common/auth.const';

test.use({ storageState: SESSION_STATE_PATH });

test.describe('FEATURE: session extension', () => {
  test('GIVEN an expiring session, extending calls the refresh endpoint and hides the warning', async ({ homePage }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto({ sessionExpiresIn: 60 }));

    await test.step('THEN the session warning and extend button are shown', (): Promise<void> => homePage.expectSessionWarning());

    await test.step('WHEN extend is clicked', (): Promise<void> => homePage.extendSession());

    await test.step('THEN the refresh endpoint was called once', (): Promise<void> => homePage.expectRefreshCalls(1));

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

Session-only login is a second test in the same spec, `'GIVEN a login without keep me signed in, a fresh browser opens login'`. It takes the `sessionOnlyHomePage` fixture, built from two more functions in the same util file:

- `persistentCookiesAfterLogin(browser)` is `loginWithRememberMe` with `uncheck()`. Instead of saving state, it returns `cookies.filter((cookie: Cookie): boolean => cookie.expires > 0)`. Session cookies have `expires: -1`, so the filter drops them.
- `openPageWithCookies(browser, cookies)` is `openPageWithState` with `EMPTY_STORAGE_STATE` plus `context.addCookies(cookies)`.

The test's `WHEN` is `sessionOnlyHomePage.goto()`. Its `THEN` is `sessionOnlyHomePage.expectRedirectedToLogin()`, which checks the url on the fixture's own page, not on the spec's blank `page`.

## Passkeys

`context.credentials` is a virtual WebAuthn authenticator for one context. No hardware key, no OS prompt.

| Call | Does |
|---|---|
| `install()` | Overrides `navigator.credentials.create()` and `get()` in every current and future page of the context |
| `create(rpId, options?)` | Seeds a credential for the relying party (the site's domain) and returns it, private key included |
| `get({ rpId, id }?)` | Every credential the authenticator holds, optionally filtered |
| `delete(id)` | Removes one credential, seeded or registered by the page |

Register once, in a `setup` project, through the real sign-up UI. `context.storageState({ credentials: true, path })` saves the session cookies and the passkey together. `registerPasskey(signup)` on `SignupPage` clicks "Create a passkey" and waits for `/home`, so the passkey exists before the state is saved.

```ts
// e2e/auth/passkey.setup.ts
import { test as setup } from './auth.fixture';
import { PASSKEY_STATE_PATH } from './common/auth.const';
import { SIGNUP_STUB } from './test/stubs/auth.stub';

setup('saves the passkey user', async ({ context, signupPage }): Promise<void> => {
  await context.credentials.install();
  await signupPage.goto();
  await signupPage.registerPasskey(SIGNUP_STUB);
  await context.storageState({ credentials: true, path: PASSKEY_STATE_PATH });
});
```

`PASSKEY_STATE_PATH` is `${AUTH_DIR}/passkey.json`. The `passkeyLoginPage` fixture calls `await context.setStorageState(PASSKEY_STATE_PATH)`, which installs the authenticator because the state holds credentials, then `await context.clearCookies()`, so the test starts signed out with the passkey still held. The spec is `'GIVEN a registered passkey, signing in with it opens home'`: `WHEN passkeyLoginPage.goto()`, `AND passkeyLoginPage.signInWithPasskey()`, `THEN passkeyLoginPage.expectHome()`.

The saved file carries the credential's private key: anyone holding it signs in as that user. Treat it like any storage state: under the gitignored `e2e/.auth/`, never uploaded as a CI artifact, regenerated each run by the `setup` project.

## Logout Patterns

After logout no session cookie may remain, and a second visit to home must bounce to login. `expectNoSessionCookies` from the session-timeout util polls every cookie whose name contains `session` or `token` until none is left. The second visit is an action after a check, so it starts a new phase: `WHEN` home is opened again, `THEN` it redirects to login.

```ts
// e2e/auth/logout.test.ts
import { expect, test } from './auth.fixture';
import { SESSION_STATE_PATH } from './common/auth.const';
import { expectNoSessionCookies } from './test/utils/session-cookie.spec.util';

test.use({ storageState: SESSION_STATE_PATH });

test.describe('FEATURE: logout', () => {
  test('GIVEN one signed-in device, signing out clears its session', async ({ context, homePage, page }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

    await test.step('AND sign out is clicked in the account menu', (): Promise<void> => homePage.signOut());

    await test.step('THEN the login url is shown', (): Promise<void> => expect(page).toHaveURL('/login'));

    await test.step('AND no session cookies remain', (): Promise<void> => expectNoSessionCookies(context));

    await test.step('WHEN the home page is opened again', (): Promise<void> => homePage.goto());

    await test.step('THEN home redirects to login', (): Promise<void> => expect(page).toHaveURL(/\/login/));
  });
});
```

### Logout from All Devices

A second test in the same spec is why the file is `logout.test.ts`: its opening call routes the app's own `**/api/**`. A real logout-all would end the saved session every other test starts from, so `securitySettingsPage.goto({ stubLogoutAll: true })` routes it to a recorded stub. The test is `'GIVEN sessions on other devices, signing out everywhere calls logout-all and opens login'`, with the shape of `session-extension.test.ts`:

1. `WHEN securitySettingsPage.goto({ stubLogoutAll: true })`
2. `AND securitySettingsPage.signOutEverywhere()`
3. `THEN securitySettingsPage.expectLogoutAllCalls(1)`
4. `AND expect(page).toHaveURL(/\/login/)`

The dialog confirm lives inside `signOutEverywhere()`, so the spec does not know the dialog exists. `securitySettingsPage` is registered in `AuthFixtures` like the others.

## Tips

1. **Configure shorter session timeouts in test environments** — Enables testing timeout behavior without slow tests
2. **Test token expiration edge cases** — Expired tokens, invalid tokens, already-used tokens
3. **Verify cleanup on logout** — Check both cookies and localStorage are cleared
4. **Test the full flow end-to-end** — Password reset should verify login with new password works

## Related

- [authentication.md](authentication.md) — Storage state, OAuth mocking, MFA, role-based access, API login
- [fixtures-hooks.md](../core/fixtures-hooks.md) — Creating auth fixtures
- [third-party.md](./third-party.md) — Mocking external auth providers
