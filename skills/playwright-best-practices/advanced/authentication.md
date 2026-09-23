# Authentication Testing

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Patterns](#patterns)
3. [Decision Guide](#decision-guide)
4. [Anti-Patterns](#anti-patterns)
5. [Troubleshooting](#troubleshooting)
6. [Related](#related)

> **When to use**: Apps with login, session management, or protected routes. Authentication is the most common source of slow test suites.

## Quick Reference

| Approach | Mechanism | Result |
|---|---|---|
| Storage state reuse | A `setup` project logs in once and calls `storageState({ path })` | Every test starts authenticated |
| Config | `use: { storageState }` per project, as a named const above `defineConfig` | No login per test |
| API login | `request.post('/api/auth/login')` then `request.storageState({ path })` | Skips the UI entirely, 5-10x faster |

The fastest form is a `setup` project that logs in through the API and saves the state. `saveApiSessionState` comes from the util shown under [Storage State Reuse](#storage-state-reuse).

```ts
// e2e/auth/auth.setup.ts
import type { APIResponse } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { SESSION_STATE_PATH, TEST_USER } from './common/auth.const';
import { saveApiSessionState } from './test/utils/session.spec.util';

test('SCENARIO: api login saves the storage state', async ({ request }): Promise<void> => {
  const response = await test.step('WHEN credentials are posted', (): Promise<APIResponse> => request.post('/api/auth/login', { data: TEST_USER }));

  await test.step('THEN the login responds ok', (): Promise<void> => expect(response).toBeOK());

  await test.step('AND cookies and local storage are saved', (): Promise<void> => saveApiSessionState(request, SESSION_STATE_PATH));
});
```

Every sample in this file shares these types and constants. Credentials come from the environment once, here, never in a spec.

```ts
// e2e/auth/common/auth.type.ts
export type Credentials = {
  readonly email: string;
  readonly password: string;
};

export type Role = 'admin' | 'guest' | 'member';

export type RoleAccount = {
  readonly credentials: Credentials;
  readonly role: Role;
};

export type SessionRequest = {
  readonly email: string;
  readonly provider: string;
  readonly role: Role;
};

export type Signup = {
  readonly confirmPassword: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
};
```

```ts
// e2e/auth/common/auth.const.ts
import type { Credentials, RoleAccount } from './auth.type';

export const AUTH_DIR = 'e2e/.auth';

export const SESSION_STATE_PATH = `${AUTH_DIR}/session.json`;

export const EMPTY_STORAGE_STATE = { cookies: [], origins: [] };

export const PROVIDER_AUTHORIZE_URL = 'https://accounts.provider.com/**';

export const MFA_TOTP_SECRET = process.env.MFA_TOTP_SECRET ?? '';

export const TEST_USER: Credentials = {
  email: process.env.TEST_USER_EMAIL ?? '',
  password: process.env.TEST_USER_PASSWORD ?? ''
};

const ADMIN_CREDENTIALS: Credentials = { email: 'admin@example.com', password: process.env.ADMIN_PASSWORD ?? '' };
const MEMBER_CREDENTIALS: Credentials = { email: 'member@example.com', password: process.env.MEMBER_PASSWORD ?? '' };
const GUEST_CREDENTIALS: Credentials = { email: 'guest@example.com', password: process.env.GUEST_PASSWORD ?? '' };

export const ROLE_ACCOUNTS: RoleAccount[] = [
  { credentials: ADMIN_CREDENTIALS, role: 'admin' },
  { credentials: MEMBER_CREDENTIALS, role: 'member' },
  { credentials: GUEST_CREDENTIALS, role: 'guest' }
];
```

Page objects referenced below. `LoginPage` is shown in full under [Login Page Object](#login-page-object); the rest follow the same shape and are listed here instead of repeated.

| Page object | File | Members used in this file |
|---|---|---|
| `HomePage` | `e2e/auth/pages/home.page.ts` | `goto()`, `expectHeading()` |
| `MfaPage` | `e2e/auth/pages/mfa.page.ts` | `expectPrompt()`, `submitCode(code)` |
| `LandingPage` | `e2e/auth/pages/landing.page.ts` | `goto()`, `expectWelcome()` (heading plus "Log in" link) |
| `SignupPage` | `e2e/auth/pages/signup.page.ts` | `goto()`, `submit(signup)`, `expectOnboardingWelcome(name)` |
| `SettingsPage` | `e2e/settings/pages/settings.page.ts` | `goto()`, `saveDisplayName(name)`, `expectSaved()` |
| `AdminUsersPage` | `e2e/admin/pages/admin-users.page.ts` | `goto()`, `expectRemoveEnabled()`, `expectAccessDenied()` |

```ts
// e2e/auth/pages/home.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class HomePage {
  public readonly heading: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Home' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/home');
  }

  public async expectHeading(): Promise<void> {
    await test.step('THEN home heading is visible', (): Promise<void> => expect(this.heading).toBeVisible(), { box: true });
  }
}
```

```ts
// e2e/auth/auth.fixture.ts
import { test as base } from '@playwright/test';

import { HomePage } from './pages/home.page';
import { LandingPage } from './pages/landing.page';
import { LoginPage } from './pages/login.page';
import { MfaPage } from './pages/mfa.page';
import { SignupPage } from './pages/signup.page';

type AuthFixtures = {
  readonly homePage: HomePage;
  readonly landingPage: LandingPage;
  readonly loginPage: LoginPage;
  readonly mfaPage: MfaPage;
  readonly signupPage: SignupPage;
};

export const test = base.extend<AuthFixtures>({
  homePage: async ({ page }, use): Promise<void> => {
    await use(new HomePage(page));
  },
  landingPage: async ({ page }, use): Promise<void> => {
    await use(new LandingPage(page));
  },
  loginPage: async ({ page }, use): Promise<void> => {
    await use(new LoginPage(page));
  },
  mfaPage: async ({ page }, use): Promise<void> => {
    await use(new MfaPage(page));
  },
  signupPage: async ({ page }, use): Promise<void> => {
    await use(new SignupPage(page));
  }
});

export { expect } from '@playwright/test';
```

## Patterns

### Storage State Reuse

**Use when**: You need authenticated tests and want to avoid logging in before every test.
**Avoid when**: Tests require completely fresh sessions, or you are testing the login flow itself.

`storageState` serializes cookies and localStorage to a JSON file. Load it in any browser context to start authenticated instantly. The save helpers below also guard against the empty-state failure described under [Troubleshooting](#storagestate-file-is-empty-or-contains-no-cookies).

```ts
// e2e/auth/test/utils/session.spec.util.ts
import type { APIRequestContext, BrowserContext } from '@playwright/test';

export const saveSessionState = async (context: BrowserContext, path: string): Promise<void> => {
  const cookies = await context.cookies();
  const hasCookies = cookies.length > 0;

  if (!hasCookies) throw new Error('No cookies found after login');

  await context.storageState({ path });
};

export const saveApiSessionState = async (request: APIRequestContext, path: string): Promise<void> => {
  await request.storageState({ path });
};
```

The UI version of the setup project drives the login page through `LoginPage`. Run it once as a `setup` project; the `waitForURL` inside `submitAndWaitForHome` guarantees the session cookie exists before the state is saved.

```ts
// e2e/auth/auth.setup.ts
import { test } from './auth.fixture';
import { SESSION_STATE_PATH, TEST_USER } from './common/auth.const';
import { saveSessionState } from './test/utils/session.spec.util';

test('SCENARIO: ui login saves the storage state', async ({ loginPage, page }): Promise<void> => {
  await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());

  await test.step('WHEN credentials are submitted and home opens', (): Promise<void> => loginPage.submitAndWaitForHome(TEST_USER));

  await test.step('THEN cookies and local storage are saved', (): Promise<void> => saveSessionState(page.context(), SESSION_STATE_PATH));
});
```

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

import { SESSION_STATE_PATH } from './auth/common/auth.const';

const use = { baseURL: 'http://localhost:4000', trace: 'on-first-retry' } as const;

const chromium = { ...devices['Desktop Chrome'], storageState: SESSION_STATE_PATH };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium }
];

export default defineConfig({ projects, testDir: './e2e', use });
```

Every test in the `chromium` project now starts logged in.

```ts
// e2e/auth/home.e2e.ts
import { test } from './auth.fixture';

test.describe('FEATURE: home', () => {
  test.describe('GIVEN a saved session', () => {
    test('SCENARIO: the home page shows the heading', async ({ homePage }): Promise<void> => {
      await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

      await test.step('THEN the home heading is shown', (): Promise<void> => homePage.expectHeading());
    });
  });
});
```

### Global Setup Authentication

**Use when**: You want to authenticate once before the entire test suite runs and cannot use a `setup` project.
**Avoid when**: Different tests need different users, or your tokens expire faster than your suite runs. Prefer the `setup` project above; see [global-setup.md](../core/global-setup.md) for the trade-offs.

`baseURL` is read from the first project so relative `goto` and `waitForURL` calls resolve.

```ts
// e2e/global-setup.ts
import type { FullConfig } from '@playwright/test';
import { chromium } from '@playwright/test';

import { SESSION_STATE_PATH, TEST_USER } from './auth/common/auth.const';
import { LoginPage } from './auth/pages/login.page';
import { saveSessionState } from './auth/test/utils/session.spec.util';

const globalSetup = async (config: FullConfig): Promise<void> => {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.submitAndWaitForHome(TEST_USER);
  await saveSessionState(context, SESSION_STATE_PATH);
  await browser.close();
};

export default globalSetup;
```

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { SESSION_STATE_PATH } from './auth/common/auth.const';

const use = { baseURL: 'http://localhost:4000', storageState: SESSION_STATE_PATH } as const;

export default defineConfig({
  globalSetup: require.resolve('./global-setup'),
  testDir: './e2e',
  use
});
```

Add `e2e/.auth/` to `.gitignore`. Auth state files contain session tokens and must never be committed.

### Per-Worker Authentication

**Use when**: Each parallel worker needs its own authenticated session to avoid race conditions for tests that modify server-side state.
**Avoid when**: Tests are read-only and a shared session is safe; then a single shared account is enough.

> **Sharded runs**: `parallelIndex` resets per shard, so different shards can have workers with the same index. To avoid collisions, include the shard identifier in the username (e.g. `worker-${SHARD_INDEX}-${parallelIndex}@example.com`) by passing a `SHARD_INDEX` environment variable from your CI matrix.

The worker-scoped fixture receives `workerInfo` as its third argument; `parallelIndex` comes from there, not from `test.info()`, which is unavailable outside a running test. A test-scoped `settingsPage` fixture opens a fresh page in the worker's context so the spec never touches the context directly.

```ts
// e2e/settings/settings.fixture.ts
import type { BrowserContext } from '@playwright/test';
import { test as base } from '@playwright/test';

import type { Credentials } from '../auth/common/auth.type';
import { LoginPage } from '../auth/pages/login.page';
import { USER_STUB } from '../auth/test/stubs/auth.stub';
import { SettingsPage } from './pages/settings.page';

type SettingsFixtures = {
  readonly settingsPage: SettingsPage;
};

type SettingsWorkerFixtures = {
  readonly authenticatedContext: BrowserContext;
};

export const test = base.extend<SettingsFixtures, SettingsWorkerFixtures>({
  authenticatedContext: [
    async ({ browser }, use, workerInfo): Promise<void> => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const loginPage = new LoginPage(page);
      const credentials: Credentials = { ...USER_STUB, email: `worker-${workerInfo.parallelIndex}@example.com` };

      await loginPage.goto();
      await loginPage.submitAndWaitForHome(credentials);
      await page.close();
      await use(context);
      await context.close();
    },
    { scope: 'worker' }
  ],
  settingsPage: async ({ authenticatedContext }, use): Promise<void> => {
    const page = await authenticatedContext.newPage();

    await use(new SettingsPage(page));
    await page.close();
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/settings/settings.e2e.ts
import { test } from './settings.fixture';

test.describe('FEATURE: profile settings', () => {
  test.describe('GIVEN a worker-scoped authenticated session', () => {
    test('SCENARIO: saving the display name shows a confirmation', async ({ settingsPage }): Promise<void> => {
      await test.step('GIVEN the profile settings are open', (): Promise<void> => settingsPage.goto());

      await test.step('WHEN a new display name is saved', (): Promise<void> => settingsPage.saveDisplayName('Updated Name'));

      await test.step('THEN the profile saved message is shown', (): Promise<void> => settingsPage.expectSaved());
    });
  });
});
```

### Multiple Roles

**Use when**: Your app has role-based access control and you need to test different permission levels.
**Avoid when**: Your app has a single user role.

One `setup` test per role saves `e2e/.auth/<role>.json`.

```ts
// e2e/auth/roles.setup.ts
import { test } from './auth.fixture';
import { AUTH_DIR, ROLE_ACCOUNTS } from './common/auth.const';
import { saveSessionState } from './test/utils/session.spec.util';

for (const account of ROLE_ACCOUNTS) {
  test(`SCENARIO: ${account.role} login saves the ${account.role} storage state`, async ({ loginPage, page }): Promise<void> => {
    await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());

    await test.step('WHEN credentials are submitted and home opens', (): Promise<void> => loginPage.submitAndWaitForHome(account.credentials));

    await test.step('THEN the role storage state is saved', (): Promise<void> => saveSessionState(page.context(), `${AUTH_DIR}/${account.role}.json`));
  });
}
```

One project per role selects specs by suffix; the `anonymous` project gets an empty state so the config default never leaks in.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { AUTH_DIR, EMPTY_STORAGE_STATE } from './auth/common/auth.const';

const adminUse = { storageState: `${AUTH_DIR}/admin.json` };
const memberUse = { storageState: `${AUTH_DIR}/member.json` };
const guestUse = { storageState: `${AUTH_DIR}/guest.json` };
const anonymousUse = { storageState: EMPTY_STORAGE_STATE };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'admin', testMatch: '**/*.admin.e2e.ts', use: adminUse },
  { dependencies: ['setup'], name: 'member', testMatch: '**/*.member.e2e.ts', use: memberUse },
  { dependencies: ['setup'], name: 'guest', testMatch: '**/*.guest.e2e.ts', use: guestUse },
  { name: 'anonymous', testMatch: '**/*.anon.e2e.ts', use: anonymousUse }
];

export default defineConfig({ projects, testDir: './e2e' });
```

```ts
// e2e/admin/admin-panel.admin.e2e.ts
import { test } from './admin.fixture';

test.describe('FEATURE: admin panel', () => {
  test.describe('GIVEN an admin session', () => {
    test('SCENARIO: user management enables the remove button', async ({ adminUsersPage }): Promise<void> => {
      await test.step('WHEN user management is opened', (): Promise<void> => adminUsersPage.goto());

      await test.step('THEN the remove user button is enabled', (): Promise<void> => adminUsersPage.expectRemoveEnabled());
    });
  });
});
```

The other role specs differ only in suffix, `GIVEN`, and assertion:

| File | `GIVEN` | Assertion step |
|---|---|---|
| `admin-panel.guest.e2e.ts` | `GIVEN a guest session` | `adminUsersPage.expectAccessDenied()` |
| `admin-panel.member.e2e.ts` | `GIVEN a member session` | Whatever the member is allowed to see |

**Alternative**: a `loginAs(role)` fixture when one spec must switch roles. It opens one context per call and closes them all after the test.

```ts
// e2e/admin/role.fixture.ts
import { existsSync } from 'node:fs';

import type { Page } from '@playwright/test';
import { test as base } from '@playwright/test';

import { AUTH_DIR } from '../auth/common/auth.const';
import type { Role } from '../auth/common/auth.type';

type LoginAs = (role: Role) => Promise<Page>;

type RoleFixtures = {
  readonly loginAs: LoginAs;
};

export const test = base.extend<RoleFixtures>({
  loginAs: async ({ browser }, use): Promise<void> => {
    const pages: Page[] = [];
    const loginAs: LoginAs = async (role: Role): Promise<Page> => {
      const storageState = `${AUTH_DIR}/${role}.json`;
      const hasState = existsSync(storageState);

      if (!hasState) throw new Error(`Auth state for role "${role}" not found at ${storageState}`);

      const context = await browser.newContext({ storageState });
      const page = await context.newPage();

      pages.push(page);

      return page;
    };

    await use(loginAs);

    for (const page of pages) {
      await page.context().close();
    }
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/admin/role-comparison.e2e.ts
import type { Page } from '@playwright/test';

import { AdminUsersPage } from './pages/admin-users.page';
import { test } from './role.fixture';

test.describe('FEATURE: admin panel access', () => {
  test.describe('GIVEN saved admin and guest sessions', () => {
    test('SCENARIO: only the admin sees the remove button in user management', async ({ loginAs }): Promise<void> => {
      const adminPage = await test.step('GIVEN a page is open as admin', (): Promise<Page> => loginAs('admin'));
      const guestPage = await test.step('AND a page is open as guest', (): Promise<Page> => loginAs('guest'));
      const adminUsers = new AdminUsersPage(adminPage);
      const guestUsers = new AdminUsersPage(guestPage);

      await test.step('WHEN user management is opened as admin', (): Promise<void> => adminUsers.goto());

      await test.step('AND user management is opened as guest', (): Promise<void> => guestUsers.goto());

      await test.step('THEN the remove user button is enabled for the admin', (): Promise<void> => adminUsers.expectRemoveEnabled());

      await test.step('AND access denied is shown to the guest', (): Promise<void> => guestUsers.expectAccessDenied());
    });
  });
});
```

### OAuth/SSO Mocking

**Use when**: Your app authenticates via a third-party OAuth provider and you cannot hit the real provider in tests.
**Avoid when**: You have a dedicated test tenant on the OAuth provider.

A typical OAuth flow works like this:

1. User clicks "Sign in with Provider" and the browser navigates to `https://accounts.provider.com/authorize?...`
2. User authenticates on the provider's page and the provider redirects back to your app's **callback route** (e.g. `http://localhost:4000/auth/callback?code=ABC&state=XYZ`)
3. Your backend exchanges the `code` for an access token, creates a session, and redirects the user to a logged-in page

In tests you short-circuit step 2 with `page.route()`: intercept the outbound request to the provider and respond with a `302` redirect straight to your callback route, supplying a mock `code` and `state`. Your backend still executes its normal callback handler; only the provider's authorization page is mocked.

The callback url, code, and state are the payload, so they are one typed stub the mock takes as a parameter.

```ts
// e2e/auth/test/stubs/oauth.stub.ts
import type { OAuthCallback } from '../../common/auth.type';

export const OAUTH_CALLBACK_STUB: OAuthCallback = {
  code: 'mock-auth-code-xyz',
  state: 'expected-state-value',
  url: 'http://localhost:4000/auth/callback'
};
```

```ts
// e2e/auth/test/mocks/oauth.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { OAuthCallback, ResponseHeaders } from '../../common/auth.type';
import { OAUTH_CALLBACK_STUB } from '../stubs/oauth.stub';

export const oauthCallbackMock = (callback: OAuthCallback = OAUTH_CALLBACK_STUB): RouteHandler => {
  const callbackUrl = new URL(callback.url);

  callbackUrl.searchParams.set('code', callback.code);
  callbackUrl.searchParams.set('state', callback.state);

  const headers: ResponseHeaders = { location: callbackUrl.toString() };

  return (route: Route): Promise<void> => route.fulfill({ headers, status: 302 });
};
```

The route is registered in `beforeEach`, before any navigation, so the redirect is in place when the provider button is clicked.

```ts
// e2e/auth/oauth-login.e2e.ts
import { expect, test } from './auth.fixture';
import { EMPTY_STORAGE_STATE, PROVIDER_AUTHORIZE_URL } from './common/auth.const';
import { oauthCallbackMock } from './test/mocks/oauth.mock';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: oauth login', () => {
  test.describe('GIVEN the provider authorize page is short-circuited', () => {
    test.beforeEach(async ({ page }): Promise<void> => {
      await test.step('GIVEN provider requests redirect to the callback route', async (): Promise<void> => {
        await page.route(PROVIDER_AUTHORIZE_URL, oauthCallbackMock());
      });
    });

    test('SCENARIO: signing in with the provider opens the home page', async ({ homePage, loginPage, page }): Promise<void> => {
      await test.step('AND the login page is open', (): Promise<void> => loginPage.goto());

      await test.step('WHEN the provider sign in is started', (): Promise<void> => loginPage.signInWithProvider());

      await test.step('THEN the home url is shown', (): Promise<void> => expect(page).toHaveURL('/home'));

      await test.step('AND the home heading is shown', (): Promise<void> => homePage.expectHeading());
    });
  });
});
```

To skip the browser redirect entirely, call a **test-only API endpoint** that creates the session server-side and returns the session cookie directly.

```ts
// e2e/auth/test/stubs/auth.stub.ts
import type { Credentials, SessionRequest, Signup } from '../../common/auth.type';

export const USER_STUB: Credentials = {
  email: 'testuser@example.com',
  password: 'secretPass123'
};

export const MFA_USER_STUB: Credentials = {
  ...USER_STUB,
  email: 'mfa-user@example.com'
};

export const OAUTH_SESSION_STUB: SessionRequest = {
  email: 'oauth-user@example.com',
  provider: 'provider',
  role: 'member'
};

export const SIGNUP_STUB: Signup = {
  confirmPassword: 'secretPass123',
  email: 'new-user@example.com',
  name: 'New User',
  password: 'secretPass123'
};
```

```ts
// e2e/auth/oauth-session.e2e.ts
import type { APIResponse } from '@playwright/test';

import { expect, test } from './auth.fixture';
import { AUTH_DIR } from './common/auth.const';
import { OAUTH_SESSION_STUB } from './test/stubs/auth.stub';
import { saveSessionState } from './test/utils/session.spec.util';

test.describe('FEATURE: oauth session injection', () => {
  test.describe('GIVEN a test-only session endpoint', () => {
    test('SCENARIO: an api-created session opens the home page without the provider', async ({ homePage, page }): Promise<void> => {
      const response = await test.step('GIVEN a session is created server-side', (): Promise<APIResponse> => page.request.post('/api/test/create-session', { data: OAUTH_SESSION_STUB }));

      await test.step('AND the session endpoint responds ok', (): Promise<void> => expect(response).toBeOK());

      await test.step('AND the injected session is saved', (): Promise<void> => saveSessionState(page.context(), `${AUTH_DIR}/oauth-user.json`));

      await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

      await test.step('THEN the home heading is shown', (): Promise<void> => homePage.expectHeading());
    });
  });
});
```

**Backend requirement**: Your backend must expose a test-only session creation endpoint (guarded by `NODE_ENV=test`) or accept a known test OAuth code.

### MFA Handling

**Use when**: Your app requires two-factor authentication (TOTP, SMS, email codes).
**Avoid when**: MFA is optional and you can disable it for test accounts.

**Strategy 1**: Generate real TOTP codes from a shared secret. The generator is a pure helper, so it lives in `utils/`, not `test/utils/`.

```ts
// e2e/auth/utils/totp.util.ts
import * as OTPAuth from 'otpauth';

export const generateTotp = (secret: string): string => {
  const options = {
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret)
  };
  const totp = new OTPAuth.TOTP(options);

  return totp.generate();
};
```

The code is generated inside the step so it is fresh when submitted.

```ts
// e2e/auth/mfa-login.e2e.ts
import { expect, test } from './auth.fixture';
import { EMPTY_STORAGE_STATE, MFA_TOTP_SECRET } from './common/auth.const';
import { MFA_USER_STUB } from './test/stubs/auth.stub';
import { generateTotp } from './utils/totp.util';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: mfa login', () => {
  test.describe('GIVEN a user with totp enabled', () => {
    test('SCENARIO: submitting the current code opens the home page', async ({ homePage, loginPage, mfaPage, page }): Promise<void> => {
      await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());

      await test.step('AND credentials are submitted', (): Promise<void> => loginPage.submit(MFA_USER_STUB));

      await test.step('AND the authentication code prompt is shown', (): Promise<void> => mfaPage.expectPrompt());

      await test.step('WHEN the current totp code is submitted', (): Promise<void> => mfaPage.submitCode(generateTotp(MFA_TOTP_SECRET)));

      await test.step('THEN the home url is shown', (): Promise<void> => expect(page).toHaveURL('/home'));

      await test.step('AND the home heading is shown', (): Promise<void> => homePage.expectHeading());
    });
  });
});
```

**Strategy 2**: Mock MFA at the backend level. Have your backend accept a known bypass code (e.g. `000000`) when `NODE_ENV=test`.

**Strategy 3**: Disable MFA for test accounts at the infrastructure level.

### Session Refresh

**Use when**: Your tokens expire during long test runs.
**Avoid when**: Your test suite runs quickly and tokens outlast the entire run.

The fixture reuses the saved state when it exists, probes `/api/auth/me`, and logs in again only when the probe fails. The probe and the renewal are utils so the fixture body stays a straight line.

```ts
// e2e/auth/test/utils/session-refresh.spec.util.ts
import type { Page } from '@playwright/test';

import { SESSION_STATE_PATH, TEST_USER } from '../../common/auth.const';
import { LoginPage } from '../../pages/login.page';
import { saveSessionState } from './session.spec.util';

export const sessionIsValid = async (page: Page): Promise<boolean> => {
  const response = await page.request.get('/api/auth/me');

  return response.ok();
};

export const renewSession = async (page: Page): Promise<void> => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.submitAndWaitForHome(TEST_USER);
  await saveSessionState(page.context(), SESSION_STATE_PATH);
};
```

```ts
// e2e/auth/auth.fixture.ts
import { existsSync } from 'node:fs';

import { test as base } from '@playwright/test';

import { SESSION_STATE_PATH } from './common/auth.const';
import { HomePage } from './pages/home.page';
import { renewSession, sessionIsValid } from './test/utils/session-refresh.spec.util';

type AuthFixtures = {
  readonly homePage: HomePage;
};

export const test = base.extend<AuthFixtures>({
  homePage: async ({ browser }, use): Promise<void> => {
    const hasSavedState = existsSync(SESSION_STATE_PATH);
    const storageState = hasSavedState ? SESSION_STATE_PATH : undefined;
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const isSessionValid = await sessionIsValid(page);

    if (!isSessionValid) await renewSession(page);

    await use(new HomePage(page));
    await context.close();
  }
});

export { expect } from '@playwright/test';
```

### Login Page Object

**Use when**: Multiple test files need to log in and you want consistent, maintainable login logic.
**Avoid when**: You use `storageState` everywhere and never navigate through the login UI in tests.

Action methods never assert; `goto` no longer checks the button, the spec's first assertion step does. Field errors are checked through `toHaveAccessibleDescription`, which follows `aria-describedby` without a branch.

```ts
// e2e/auth/pages/login.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { Credentials } from '../common/auth.type';

export class LoginPage {
  public readonly errorMessage: Locator;
  public readonly forgotPasswordLink: Locator;
  public readonly loginButton: Locator;
  public readonly passwordInput: Locator;
  public readonly providerButton: Locator;
  public readonly usernameInput: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.errorMessage = page.getByRole('alert');
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password' });
    this.loginButton = page.getByRole('button', { name: 'Log in' });
    this.passwordInput = page.getByLabel('Password');
    this.providerButton = page.getByRole('button', { name: 'Sign in with Provider' });
    this.usernameInput = page.getByLabel('Username');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  public async submit(credentials: Credentials): Promise<void> {
    await this.usernameInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.loginButton.click();
  }

  public async submitAndWaitForHome(credentials: Credentials): Promise<void> {
    await this.submit(credentials);
    await this.page.waitForURL('/home');
  }

  public async submitEmpty(): Promise<void> {
    await this.loginButton.click();
  }

  public async openForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
  }

  public async signInWithProvider(): Promise<void> {
    await this.providerButton.click();
  }

  public async expectError(message: string | RegExp): Promise<void> {
    await test.step(`THEN error message reads ${String(message)}`, (): Promise<void> => expect(this.errorMessage).toContainText(message), { box: true });
  }

  public async expectFieldError(field: Locator, message: string): Promise<void> {
    await test.step(`THEN field reports ${message}`, (): Promise<void> => expect(field).toHaveAccessibleDescription(message), { box: true });
  }
}
```

Every case is one test under the shared `GIVEN`; its `WHEN` and `THEN` are steps, never a nested describe.

```ts
// e2e/auth/login.e2e.ts
import { expect, test } from './auth.fixture';
import { EMPTY_STORAGE_STATE } from './common/auth.const';
import { USER_STUB } from './test/stubs/auth.stub';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: login', () => {
  test.describe('GIVEN the login page is open', () => {
    test.beforeEach(async ({ loginPage }): Promise<void> => {
      await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());
    });

    test('SCENARIO: valid credentials open the home page', async ({ homePage, loginPage }): Promise<void> => {
      await test.step('WHEN credentials are submitted and home opens', (): Promise<void> => loginPage.submitAndWaitForHome(USER_STUB));

      await test.step('THEN the home heading is shown', (): Promise<void> => homePage.expectHeading());
    });

    test('SCENARIO: wrong password shows the error message', async ({ loginPage }): Promise<void> => {
      await test.step('WHEN a wrong password is submitted', (): Promise<void> => loginPage.submit({ ...USER_STUB, password: 'wrong-password' }));

      await test.step('THEN the error names invalid credentials', (): Promise<void> => loginPage.expectError('Invalid username or password'));
    });

    test('SCENARIO: empty form reports the username as required', async ({ loginPage }): Promise<void> => {
      await test.step('WHEN the empty form is submitted', (): Promise<void> => loginPage.submitEmpty());

      await test.step('THEN the username field reports required', (): Promise<void> => loginPage.expectFieldError(loginPage.usernameInput, 'Username is required'));
    });

    test('SCENARIO: forgot password link opens the reset page', async ({ loginPage, page }): Promise<void> => {
      await test.step('WHEN the forgot password link is followed', (): Promise<void> => loginPage.openForgotPassword());

      await test.step('THEN the forgot password url is shown', (): Promise<void> => expect(page).toHaveURL('/forgot-password'));
    });
  });
});
```

### API-Based Login

**Use when**: You want the fastest possible authentication without any browser interaction.
**Avoid when**: You are specifically testing the login UI.

API login is typically 5-10x faster than UI login. The `setup` project form is the [Quick Reference](#quick-reference) sample; the global-setup form is below.

```ts
// e2e/global-setup.ts
import type { FullConfig } from '@playwright/test';
import { request } from '@playwright/test';

import { SESSION_STATE_PATH, TEST_USER } from './auth/common/auth.const';

const globalSetup = async (config: FullConfig): Promise<void> => {
  const { baseURL } = config.projects[0].use;
  const requestContext = await request.newContext({ baseURL });
  const response = await requestContext.post('/api/auth/login', { data: TEST_USER });
  const isLoggedIn = response.ok();

  if (!isLoggedIn) throw new Error(`API login failed: ${response.status()} ${await response.text()}`);

  await requestContext.storageState({ path: SESSION_STATE_PATH });
  await requestContext.dispose();
};

export default globalSetup;
```

The fixture form logs in per test through `playwright.request` and hands the state to a fresh context, so no file is written.

```ts
// e2e/auth/auth.fixture.ts
import { test as base } from '@playwright/test';

import { TEST_USER } from './common/auth.const';
import { HomePage } from './pages/home.page';

type AuthFixtures = {
  readonly homePage: HomePage;
};

export const test = base.extend<AuthFixtures>({
  homePage: async ({ browser, playwright }, use): Promise<void> => {
    const apiContext = await playwright.request.newContext({ baseURL: 'http://localhost:4000' });

    await apiContext.post('/api/auth/login', { data: TEST_USER });

    const storageState = await apiContext.storageState();
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    await use(new HomePage(page));
    await context.close();
    await apiContext.dispose();
  }
});

export { expect } from '@playwright/test';
```

### Unauthenticated Tests

**Use when**: Testing the login page, signup flow, password reset, public pages, or redirect behavior for unauthenticated users.
**Avoid when**: The test requires a logged-in user.

When your config sets a default `storageState`, you must clear it explicitly for unauthenticated tests. The expired-session case needs a real session first, so it sits under its own `GIVEN` with its own `test.use`. `buildSignup()` in `test/utils/signup-builder.spec.util.ts` spreads `SIGNUP_STUB` and sets `email` to `test-${Date.now()}@example.com` so each run creates a new account.

```ts
// e2e/auth/public-pages.e2e.ts
import { expect, test } from './auth.fixture';
import { EMPTY_STORAGE_STATE, SESSION_STATE_PATH } from './common/auth.const';
import { buildSignup } from './test/utils/signup-builder.spec.util';

test.describe('FEATURE: public pages', () => {
  test.describe('GIVEN no stored session', () => {
    test.use({ storageState: EMPTY_STORAGE_STATE });

    test('SCENARIO: the landing page shows the welcome heading and log in link', async ({ landingPage }): Promise<void> => {
      await test.step('WHEN the landing page is opened', (): Promise<void> => landingPage.goto());

      await test.step('THEN the welcome heading and log in link are shown', (): Promise<void> => landingPage.expectWelcome());
    });

    test('SCENARIO: a protected route opens the login page with a redirect param', async ({ homePage, page }): Promise<void> => {
      await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

      await test.step('THEN the login url carries the redirect target', (): Promise<void> => expect(page).toHaveURL(/\/login.*redirect=%2Fhome/));
    });

    test('SCENARIO: signup greets the new user in onboarding', async ({ page, signupPage }): Promise<void> => {
      const signup = buildSignup();

      await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());

      await test.step('WHEN the signup form is submitted', (): Promise<void> => signupPage.submit(signup));

      await test.step('THEN the onboarding url is shown', (): Promise<void> => expect(page).toHaveURL('/onboarding'));

      await test.step('AND the welcome message names the new user', (): Promise<void> => signupPage.expectOnboardingWelcome(signup.name));
    });
  });

  test.describe('GIVEN a stored session', () => {
    test.use({ storageState: SESSION_STATE_PATH });

    test('SCENARIO: vanished session cookies report an expired session', async ({ context, homePage, loginPage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      await test.step('WHEN every cookie is cleared', (): Promise<void> => context.clearCookies());

      await test.step('AND the home page is opened again', (): Promise<void> => homePage.goto());

      await test.step('THEN the expired session message is shown', (): Promise<void> => loginPage.expectError('Your session has expired'));
    });
  });
});
```

## Decision Guide

| Scenario                         | Approach                       | Speed    | Isolation      | When to Choose                                                 |
| -------------------------------- | ------------------------------ | -------- | -------------- | -------------------------------------------------------------- |
| Most tests need auth             | Setup project + `storageState` | Fastest  | Shared session | Default for nearly every project                               |
| Tests modify user state          | Per-worker fixture             | Fast     | Per worker     | Tests update profile, change settings, or mutate data          |
| Multiple user roles              | Per-project `storageState`     | Fastest  | Per role       | App has admin/member/guest roles                               |
| Testing the login page           | No `storageState`              | N/A      | Full           | Use `test.use({ storageState: EMPTY_STORAGE_STATE })`          |
| OAuth/SSO provider               | Mock the callback              | Fast     | Per test       | Never hit real OAuth providers in CI                           |
| MFA is required                  | TOTP generation or bypass      | Moderate | Per test       | Generate real TOTP codes or use a test-mode bypass             |
| Token expires mid-suite          | Session refresh fixture        | Fast     | Per check      | Fixture validates the session before use                       |
| Single test needs different user | `loginAs(role)` fixture        | Moderate | Per call       | Rare: prefer per-project roles                                 |
| API-first app (no login UI)      | API login via `request.post()` | Fastest  | Per test       | No browser needed for auth                                     |

### UI Login vs API Login vs Storage State

```text
Need to test the login page itself?
├── Yes → UI login with LoginPage, no storageState
└── No → Do you have a login API endpoint?
    ├── Yes → API login in a setup project, save storageState (fastest)
    └── No → UI login in a setup project, save storageState
              └── Tokens expire quickly?
                  ├── Yes → Add session refresh fixture
                  └── No → Standard storageState reuse is fine
```

## Anti-Patterns

| Don't Do This                                                             | Problem                                     | Do This Instead                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Log in via UI before every test                                           | Adds 2-5 seconds per test                   | Use `storageState` to skip login entirely                                 |
| Share a single auth state file across parallel workers that mutate state  | Race conditions                             | Use per-worker fixtures with `{ scope: 'worker' }`                        |
| Hardcode credentials in test files                                        | Security risk                               | Read environment variables once in `common/auth.const.ts`                 |
| Ignore token expiration                                                   | Tests fail intermittently with 401 errors   | Add a session validity check in your auth fixture                         |
| Hit real OAuth providers in CI                                            | Flaky: rate limits, CAPTCHA, network issues | Mock the OAuth callback or use API session injection                      |
| Use `page.waitForTimeout(2000)` after login                               | Arbitrary delay                             | `page.waitForURL('/home')` in the page object or `expect(page).toHaveURL` |
| Store `.auth/*.json` files in git                                         | Tokens in version control                   | Add `e2e/.auth/` to `.gitignore`                                          |
| Create one "god" test account with all permissions                        | Cannot test role-based access control       | Create separate accounts per role                                         |
| Use `browser.newContext()` without `storageState` for authenticated tests | Every context starts unauthenticated        | Pass `storageState` when creating the context                             |
| Test MFA by disabling it everywhere                                       | You never test the MFA flow                 | Use TOTP generation for at least one test                                 |

## Troubleshooting

### Global setup fails with "Target page, context or browser has been closed"

**Cause**: The login page redirected unexpectedly, or the browser closed before `storageState()` was called.

**Fix**:

- Add `await page.waitForURL()` after the login action
- Check that `baseURL` in your config matches the actual server URL and protocol
- Wait for the auth response and fail loudly when it is not ok. The util races `waitForResponse` against the submit so the response is never missed:

```ts
// e2e/auth/test/utils/auth-response.spec.util.ts
import type { Page } from '@playwright/test';

import type { Credentials } from '../../common/auth.type';
import type { LoginPage } from '../../pages/login.page';

export const submitAndAwaitAuth = async (loginPage: LoginPage, page: Page, credentials: Credentials): Promise<void> => {
  const [response] = await Promise.all([page.waitForResponse('**/api/auth/**'), loginPage.submit(credentials)]);
  const isLoggedIn = response.ok();

  if (!isLoggedIn) throw new Error(`Login failed in global setup: ${response.status()} ${await response.text()}`);
};
```

### Tests fail with 401 Unauthorized after running for a while

**Cause**: The session token saved in `storageState` has expired.

**Fix**:

- Use the session refresh fixture pattern
- Increase token expiry in test environment configuration
- Switch to API-based login in a worker-scoped fixture

### `storageState` file is empty or contains no cookies

**Cause**: `storageState()` was called before the login response set cookies.

**Fix**:

- Wait for the post-login page to load: `await page.waitForURL('/home')`
- Verify cookies exist before saving: `saveSessionState` under [Storage State Reuse](#storage-state-reuse) throws `No cookies found after login` when the jar is empty

### Different browsers get different cookies

**Cause**: Some auth flows set cookies with `SameSite=Strict` or use browser-specific cookie behavior.

**Fix**:

- Generate separate auth state files per browser project
- Check if your auth uses `SameSite=None; Secure` cookies that require HTTPS:

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

import { AUTH_DIR } from './auth/common/auth.const';

const chromium = { ...devices['Desktop Chrome'], storageState: `${AUTH_DIR}/chromium-session.json` };
const firefox = { ...devices['Desktop Firefox'], storageState: `${AUTH_DIR}/firefox-session.json` };

const projects = [
  { name: 'chromium', use: chromium },
  { name: 'firefox', use: firefox }
];

export default defineConfig({ projects, testDir: './e2e' });
```

### Parallel tests interfere with each other's sessions

**Cause**: Multiple workers share the same test account and one worker's actions affect others.

**Fix**:

- Use per-worker test accounts: `worker-${workerInfo.parallelIndex}@example.com`
- Use the per-worker authentication fixture pattern
- Make tests idempotent

### OAuth mock does not work and still redirects to the real provider

**Cause**: `page.route()` was registered after the navigation that triggers the OAuth redirect.

**Fix**:

- Register route handlers before any navigation: call `page.route()` in `beforeEach`, before `goto()`
- Log the actual redirect URL to verify the pattern:

```ts
// e2e/auth/test/utils/oauth-log.spec.util.ts
import type { Page, Request } from '@playwright/test';

const logOauthRequest = (request: Request): void => {
  const url = request.url();
  const isOauth = url.includes('oauth') || url.includes('accounts.provider');

  if (isOauth) console.log('OAuth request:', url);
};

export const logOauthRequests = (page: Page): void => {
  page.on('request', logOauthRequest);
};
```

## Related

- [fixtures-hooks.md](../core/fixtures-hooks.md) — custom fixtures for auth setup and teardown
- [configuration.md](../core/configuration.md) — `storageState`, projects, and global setup configuration
- [global-setup.md](../core/global-setup.md) — global setup patterns and project dependencies
- [network-advanced.md](network-advanced.md) — route interception patterns used in OAuth mocking
- [api-testing.md](../testing-patterns/api-testing.md) — API request context used in API-based login
- [flaky-tests.md](../debugging/flaky-tests.md) — diagnosing auth-related flakiness
