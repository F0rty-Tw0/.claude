# Security Testing Basics

## Table of Contents

1. [XSS Prevention](#xss-prevention)
2. [CSRF Protection](#csrf-protection)
3. [Authentication Security](#authentication-security)
4. [Authorization Testing](#authorization-testing)
5. [Input Validation](#input-validation)
6. [Security Headers](#security-headers)

Every sample lives under `e2e/security/`. Malicious inputs are typed constants in `common/security.const.ts`; page objects encode and submit them; the spec asserts that nothing executed, nothing leaked, and the server refused. `common/security.type.ts` holds `Credentials`, `SettingsPatch`, and `HeaderMap` (`Record<string, string>`); `test/stubs/security.stub.ts` holds `USER_STUB`.

```ts
// e2e/security/common/security.const.ts
export const XSS_PAYLOADS: string[] = [
  '<script>alert("xss")</script>',
  '<img src="x" onerror="alert(1)">',
  '"><script>alert(1)</script>',
  'javascript:alert(1)',
  '<svg onload="alert(1)">'
];

export const SQL_PAYLOADS: string[] = [
  "'; DROP TABLE users; --",
  "1' OR '1'='1",
  '1; DELETE FROM orders',
  "' UNION SELECT * FROM users --"
];
```

Two fixtures collect browser events for the whole test: `dialogs` records every `alert`, `confirm`, and `prompt` the page opens, and `cspViolations` records console messages that mention the Content Security Policy. Both are plain arrays the spec asserts on in a step. `secondLoginPage` is a `LoginPage` on a fresh browser context; the API objects wrap `page.request`, which shares the context's cookies.

```ts
// e2e/security/security.fixture.ts
import type { ConsoleMessage, Dialog } from '@playwright/test';
import { test as base } from '@playwright/test';

import { SettingsApi } from './api/settings.api';
import { AdminUsersPage } from './pages/admin-users.page';
import { DashboardPage } from './pages/dashboard.page';
import { ForgotPasswordPage } from './pages/forgot-password.page';
import { HomePage } from './pages/home.page';
import { LoginPage } from './pages/login.page';
import { PostEditorPage } from './pages/post-editor.page';
import { PostPage } from './pages/post.page';
import { ProfilePage } from './pages/profile.page';
import { ResetPasswordPage } from './pages/reset-password.page';
import { SearchPage } from './pages/search.page';
import { SettingsPage } from './pages/settings.page';

type SecurityFixtures = {
  readonly adminUsersPage: AdminUsersPage;
  readonly cspViolations: string[];
  readonly dashboardPage: DashboardPage;
  readonly dialogs: string[];
  readonly forgotPasswordPage: ForgotPasswordPage;
  readonly homePage: HomePage;
  readonly loginPage: LoginPage;
  readonly postEditorPage: PostEditorPage;
  readonly postPage: PostPage;
  readonly profilePage: ProfilePage;
  readonly resetPasswordPage: ResetPasswordPage;
  readonly searchPage: SearchPage;
  readonly secondLoginPage: LoginPage;
  readonly settingsApi: SettingsApi;
  readonly settingsPage: SettingsPage;
};

export const test = base.extend<SecurityFixtures>({
  adminUsersPage: async ({ page }, use): Promise<void> => {
    await use(new AdminUsersPage(page));
  },
  cspViolations: async ({ page }, use): Promise<void> => {
    const violations: string[] = [];
    const record = (message: ConsoleMessage): void => {
      const text = message.text();
      const isCsp = text.includes('Content Security Policy');

      if (isCsp) violations.push(text);
    };

    page.on('console', record);
    await use(violations);
  },
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  dialogs: async ({ page }, use): Promise<void> => {
    const messages: string[] = [];
    const record = async (dialog: Dialog): Promise<void> => {
      messages.push(dialog.message());
      await dialog.dismiss();
    };

    page.on('dialog', record);
    await use(messages);
  },
  forgotPasswordPage: async ({ page }, use): Promise<void> => {
    await use(new ForgotPasswordPage(page));
  },
  homePage: async ({ page }, use): Promise<void> => {
    await use(new HomePage(page));
  },
  loginPage: async ({ page }, use): Promise<void> => {
    await use(new LoginPage(page));
  },
  postEditorPage: async ({ page }, use): Promise<void> => {
    await use(new PostEditorPage(page));
  },
  postPage: async ({ page }, use): Promise<void> => {
    await use(new PostPage(page));
  },
  profilePage: async ({ page }, use): Promise<void> => {
    await use(new ProfilePage(page));
  },
  resetPasswordPage: async ({ page }, use): Promise<void> => {
    await use(new ResetPasswordPage(page));
  },
  searchPage: async ({ page }, use): Promise<void> => {
    await use(new SearchPage(page));
  },
  secondLoginPage: async ({ browser }, use): Promise<void> => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await use(new LoginPage(page));
    await context.close();
  },
  settingsApi: async ({ page }, use): Promise<void> => {
    await use(new SettingsApi(page.request));
  },
  settingsPage: async ({ page }, use): Promise<void> => {
    await use(new SettingsPage(page));
  }
});

export { expect } from '@playwright/test';
```

Every page object below follows `SearchPage`: `public readonly` locators set in the constructor, `public async` actions, and `expect*` methods that assert inside a boxed step.

## XSS Prevention

### Test Reflected XSS

A reflected payload arrives through the query string. `SearchPage.gotoQuery` encodes it; `expectPayloadEscaped` reads the served HTML and checks that no raw script tag or event handler survived. Escaping checks read the HTML; execution checks watch the browser: Playwright raises a `dialog` event for every `alert`, `confirm`, and `prompt`, so the `dialogs` fixture sees an executed payload without patching `window`. The same fixture covers a payload typed into the form through `submitSearch`.

```ts
// e2e/security/pages/search.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class SearchPage {
  public readonly databaseError: Locator;
  public readonly searchButton: Locator;
  public readonly searchInput: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.databaseError = page.getByText(/database error|sql|syntax|error/i);
    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.searchInput = page.getByLabel('Search');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/search');
  }

  public async gotoQuery(query: string): Promise<void> {
    await this.page.goto(`/search?q=${encodeURIComponent(query)}`);
  }

  public async submitSearch(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchButton.click();
  }

  public async expectPayloadEscaped(): Promise<void> {
    const content = await this.page.content();

    await test.step('served html has no raw script or handler', (): void => expect(content).not.toMatch(/<script>alert|onerror=/), { box: true });
  }

  public async expectNoDatabaseError(): Promise<void> {
    await test.step('no database error is shown', (): Promise<void> => expect(this.databaseError).not.toBeVisible(), { box: true });
  }
}
```

```ts
// e2e/security/reflected-xss.e2e.ts
import { XSS_PAYLOADS } from './common/security.const';
import { expect, test } from './security.fixture';

test.describe('FEATURE: reflected XSS', () => {
  test.describe('GIVEN a search page that echoes the query', () => {
    for (const payload of XSS_PAYLOADS) {
      test(`SCENARIO: the query ${payload} is escaped and does not run`, async ({ dialogs, searchPage }): Promise<void> => {
        await test.step('WHEN the search page is opened with the payload', (): Promise<void> => searchPage.gotoQuery(payload));

        await test.step('THEN no dialog opened', (): void => expect(dialogs).toEqual([]));

        await test.step('AND the payload is escaped in the html', (): Promise<void> => searchPage.expectPayloadEscaped());
      });
    }
  });
});
```

### Test Stored XSS

A stored payload goes in through a form and comes back on a later page. `PostEditorPage` has `goto()` and `submit(body)`. `PostPage` has `gotoLatest()` and `expectSanitized(visibleText)`, which reads `page.content()`, asserts it does not contain `<script>alert`, and asserts the `article` role `toContainText(visibleText)`, each in a boxed step.

```ts
// e2e/security/stored-xss.e2e.ts
import { test } from './security.fixture';

const STORED_PAYLOAD = '<script>alert("xss")</script>Hello';

test.describe('FEATURE: stored XSS', () => {
  test('SCENARIO: creating a post with a script tag renders it sanitized', async ({ postEditorPage, postPage }): Promise<void> => {
    await test.step('GIVEN the post editor is open', (): Promise<void> => postEditorPage.goto());

    await test.step('WHEN a post containing a script tag is submitted', (): Promise<void> => postEditorPage.submit(STORED_PAYLOAD));

    await test.step('AND the latest post is opened', (): Promise<void> => postPage.gotoLatest());

    await test.step('THEN the post is sanitized and Hello is visible', (): Promise<void> => postPage.expectSanitized('Hello'));
  });
});
```

## CSRF Protection

### Verify CSRF Token Present and Accepted

The token is a hidden input named `_csrf` or `csrf_token`. `SettingsPage.csrfInput` is `page.locator('input[name="_csrf"], input[name="csrf_token"]')`; `expectCsrfToken` asserts `toHaveAttribute('value', /.{21,}/)`, one web-first assertion that waits for the input and fails when the value is missing or shorter than 21 characters. `saveTheme(theme)` selects the `Theme` option and clicks Save; `expectSaved` asserts the `Settings saved` text is visible. The positive case is the form itself: the page renders the token, the app sends it, and the save succeeds.

```ts
// e2e/security/csrf.e2e.ts
import { test } from './security.fixture';

test.describe('FEATURE: CSRF token', () => {
  test('SCENARIO: opening the settings page renders a form with a csrf token', async ({ settingsPage }): Promise<void> => {
    await test.step('WHEN the settings page is opened', (): Promise<void> => settingsPage.goto());

    await test.step('THEN the form carries a csrf token', (): Promise<void> => settingsPage.expectCsrfToken());
  });

  test('SCENARIO: saving the theme through the form saves the settings', async ({ settingsPage }): Promise<void> => {
    await test.step('GIVEN the settings page is open', (): Promise<void> => settingsPage.goto());

    await test.step('WHEN the dark theme is saved', (): Promise<void> => settingsPage.saveTheme('dark'));

    await test.step('THEN the settings saved notice is shown', (): Promise<void> => settingsPage.expectSaved());
  });
});
```

### Test CSRF Token Validation

The negative cases go through an API object built on `page.request`, sending no token or a forged one. Both must be refused with 403.

| Case | Call | Status |
|---|---|---|
| No token | `settingsApi.updateWithoutToken(DARK_THEME)` | 403 |
| Invalid token | `settingsApi.updateWithToken(DARK_THEME, 'invalid-token')` | 403 |

```ts
// e2e/security/api/settings.api.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { SettingsPatch } from '../common/security.type';

export class SettingsApi {
  private readonly request: APIRequestContext;

  public constructor(request: APIRequestContext) {
    this.request = request;
  }

  public async updateWithoutToken(data: SettingsPatch): Promise<APIResponse> {
    const headers = { 'Content-Type': 'application/json' };

    return this.request.post('/api/settings', { data, headers });
  }

  public async updateWithToken(data: SettingsPatch, token: string): Promise<APIResponse> {
    const headers = { 'X-CSRF-Token': token };

    return this.request.post('/api/settings', { data, headers });
  }
}
```

```ts
// e2e/security/csrf-validation.api.e2e.ts
import type { APIResponse } from '@playwright/test';

import type { SettingsPatch } from './common/security.type';
import { expect, test } from './security.fixture';

const DARK_THEME: SettingsPatch = { theme: 'dark' };

test.describe('FEATURE: CSRF validation', () => {
  test('SCENARIO: posting settings without a token answers 403', async ({ settingsApi }): Promise<void> => {
    const response = await test.step('WHEN settings are posted without a token', (): Promise<APIResponse> => settingsApi.updateWithoutToken(DARK_THEME));

    await test.step('THEN the status is 403', (): void => expect(response.status()).toBe(403));
  });
});
```

## Authentication Security

### Test Session Expiry

`LoginPage.login(credentials)` opens `/login`, fills `Email` and `Password`, and clicks Sign in; `expectSessionExpired` asserts the `Session expired` text is visible. The clock jumps two hours through `page.clock.fastForward`, which needs `page.clock.install()` earlier in the test or fixture (see [clock-mocking.md](../advanced/clock-mocking.md)). The next navigation, `ProfilePage.goto()` to `/profile`, must land on the login page with the expiry notice.

```ts
// e2e/security/session-expiry.e2e.ts
import { expect, test } from './security.fixture';
import { USER_STUB } from './test/stubs/security.stub';

test.describe('FEATURE: session expiry', () => {
  test.describe('GIVEN a signed-in user', () => {
    test.beforeEach(async ({ loginPage, page }): Promise<void> => {
      await test.step('GIVEN the clock is installed', (): Promise<void> => page.clock.install());

      await test.step('AND the user is signed in', (): Promise<void> => loginPage.login(USER_STUB));

      await test.step('AND the dashboard is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));
    });

    test('SCENARIO: two hours passing sends the next navigation to the login page', async ({ loginPage, page, profilePage }): Promise<void> => {
      await test.step('WHEN the clock advances two hours', (): Promise<void> => page.clock.fastForward('02:00:00'));

      await test.step('AND the profile page is opened', (): Promise<void> => profilePage.goto());

      await test.step('THEN the login page is shown', (): Promise<void> => expect(page).toHaveURL(/\/login/));

      await test.step('AND the session expired notice is shown', (): Promise<void> => loginPage.expectSessionExpired());
    });
  });
});
```

### Test Concurrent Sessions

A second sign-in from another browser context must end or warn the first. `secondLoginPage` signs in on the fresh context; `DashboardPage.reload()` reloads the first, and `expectSessionEnded` asserts `page.getByText(/session.*another device|logged out/i)` is visible.

```ts
// e2e/security/concurrent-sessions.e2e.ts
import { test } from './security.fixture';
import { USER_STUB } from './test/stubs/security.stub';

test.describe('FEATURE: concurrent session limit', () => {
  test('SCENARIO: signing in from a second browser ends the first session', async ({ dashboardPage, loginPage, secondLoginPage }): Promise<void> => {
    await test.step('GIVEN the user is signed in from the first browser', (): Promise<void> => loginPage.login(USER_STUB));

    await test.step('WHEN the same user signs in from a second browser', (): Promise<void> => secondLoginPage.login(USER_STUB));

    await test.step('AND the first browser is reloaded', (): Promise<void> => dashboardPage.reload());

    await test.step('THEN the first browser reports the session ended', (): Promise<void> => dashboardPage.expectSessionEnded());
  });
});
```

### Test Password Reset Security

A reset token works once. In a test environment the token is exposed or captured from an email mock; here it is a constant. `ForgotPasswordPage.request(email)` submits the forgot-password form. `ResetPasswordPage.goto(token)` opens `/reset-password?token=<token>`; `submit(password)` fills the new password and clicks Reset; `expectUpdated` and `expectInvalidToken` assert the success and the invalid-or-expired notices.

```ts
// e2e/security/password-reset.e2e.ts
import { test } from './security.fixture';
import { USER_STUB } from './test/stubs/security.stub';

const RESET_TOKEN = 'mock-reset-token';

test.describe('FEATURE: password reset token', () => {
  test.describe('GIVEN a reset was requested and the token used once', () => {
    test.beforeEach(async ({ forgotPasswordPage, resetPasswordPage }): Promise<void> => {
      await test.step('GIVEN a password reset was requested', (): Promise<void> => forgotPasswordPage.request(USER_STUB.email));

      await test.step('AND the reset page is open with the token', (): Promise<void> => resetPasswordPage.goto(RESET_TOKEN));

      await test.step('AND a new password was submitted', (): Promise<void> => resetPasswordPage.submit('NewPassword123'));

      await test.step('AND the password updated notice is shown', (): Promise<void> => resetPasswordPage.expectUpdated());
    });

    test('SCENARIO: reusing the token rejects it as invalid or expired', async ({ resetPasswordPage }): Promise<void> => {
      await test.step('WHEN the reset page is opened with the used token', (): Promise<void> => resetPasswordPage.goto(RESET_TOKEN));

      await test.step('THEN the invalid or expired token notice is shown', (): Promise<void> => resetPasswordPage.expectInvalidToken());
    });
  });
});
```

## Authorization Testing

### Test Unauthorized Access

A regular user's storage state is pinned with `test.use` under its own `GIVEN`. `AdminUsersPage.goto()` requests `/admin/users`; `expectAccessDenied` asserts `getByText('Access denied')` is visible. Apps differ in how they refuse; assert the one yours does. The same shape covers another user's resource: `userSettingsPage.goto('other-user-id')` then `expectAccessDenied()`.

| Refusal | Assertion |
|---|---|
| Inline message | `adminUsersPage.expectAccessDenied()` on `getByText('Access denied')` |
| Redirect to login | `expect(page).toHaveURL(/\/login/)` |
| Dedicated 403 page | `expect(page).toHaveURL(/\/403/)` |

```ts
// e2e/security/admin-access.e2e.ts
import { expect, test } from './security.fixture';

test.describe('FEATURE: admin route authorization', () => {
  test.describe('GIVEN a regular user session', () => {
    test.use({ storageState: '.auth/user.json' });

    test('SCENARIO: requesting the admin users page denies access', async ({ adminUsersPage, page }): Promise<void> => {
      await test.step('WHEN the admin users page is requested', (): Promise<void> => adminUsersPage.goto());

      await test.step('THEN the admin url is not reached', (): Promise<void> => expect(page).not.toHaveURL('/admin/users'));

      await test.step('AND access denied is shown', (): Promise<void> => adminUsersPage.expectAccessDenied());
    });
  });
});
```

### Test IDOR (Insecure Direct Object Reference)

The API call must carry the signed-in user's session, otherwise a 401 for a missing cookie would pass as a 403. `idor.e2e.ts` pins `storageState: '.auth/user.json'` like `admin-access.e2e.ts` and follows the shape of `csrf-validation.api.e2e.ts`: `WHEN ordersApi.get('other-user-order-456')`, `THEN` `response.status()` is 403. `OrdersApi.get(orderId)` sends `GET /api/orders/<orderId>` through `page.request`, which shares the context's cookies, and joins the fixture in the same shape as `settingsApi`.

## Input Validation

### Test SQL Injection Prevention

`sql-injection.e2e.ts` loops `SQL_PAYLOADS` exactly as `reflected-xss.e2e.ts` loops `XSS_PAYLOADS`, so the failing payload names itself: `searchPage.goto()` in a `GIVEN` `beforeEach`, `WHEN searchPage.submitSearch(payload)`, `THEN searchPage.expectNoDatabaseError()`, which asserts no text matching `/database error|sql|syntax|error/i` is visible.

### Test Input Length Limits

A 10 000-character bio must be refused or truncated to the field's limit. `ProfilePage.saveBio(bio)` fills `Bio` and clicks Save; `expectBioAtMost(length)` asserts `toHaveValue(limit)` on the input, where `limit` is `new RegExp('^.{0,' + length + '}$', 's')`, which waits for the app to truncate.

`input-length.e2e.ts` is one test: `GIVEN profilePage.goto()`, `WHEN profilePage.saveBio('a'.repeat(10000))`, `THEN profilePage.expectBioAtMost(500)`.

## Security Headers

### Verify Security Headers

`page.goto` returns the main `Response` or `null`; `HomePage.open` throws on `null` so the spec handles a plain `Response`. HSTS is only set on HTTPS origins, so its test opens with `test.skip(BASE_URL.includes('localhost'), 'HSTS is not set on localhost')`.

| Header | Assertion | Protects against |
|---|---|---|
| `content-security-policy` | `toBeTruthy()` | Injected scripts and resources |
| `x-frame-options` | `toMatch(/DENY\|SAMEORIGIN/)` | Clickjacking |
| `x-content-type-options` | `toBe('nosniff')` | MIME type sniffing |
| `x-xss-protection` | `toBeTruthy()` | Legacy browser XSS filter |
| `strict-transport-security` | `toBeTruthy()` (not on localhost) | Protocol downgrade |

```ts
// e2e/security/pages/home.page.ts
import type { Page, Response } from '@playwright/test';

export class HomePage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async open(): Promise<Response> {
    const response = await this.page.goto('/');

    if (!response) throw new Error('navigation to / returned no response');

    return response;
  }

  public async injectInlineScript(): Promise<void> {
    await this.page.evaluate((): void => {
      const script = document.createElement('script');

      script.textContent = 'console.log("injected")';
      document.body.appendChild(script);
    });
  }
}
```

```ts
// e2e/security/security-headers.e2e.ts
import type { Response } from '@playwright/test';

import type { HeaderMap } from './common/security.type';
import { expect, test } from './security.fixture';

test.describe('FEATURE: security headers', () => {
  test.describe('GIVEN the home page response', () => {
    let response: Response;

    test.beforeEach(async ({ homePage }): Promise<void> => {
      response = await test.step('GIVEN the home page is open', (): Promise<Response> => homePage.open());
    });

    test('SCENARIO: reading the headers finds the policy headers set', async (): Promise<void> => {
      const headers = await test.step('WHEN the response headers are read', (): HeaderMap => response.headers());

      await test.step('THEN the content security policy is set', (): void => expect(headers['content-security-policy']).toBeTruthy());

      await test.step('AND x-frame-options denies framing', (): void => expect(headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/));

      await test.step('AND x-content-type-options is nosniff', (): void => expect(headers['x-content-type-options']).toBe('nosniff'));

      await test.step('AND x-xss-protection is set', (): void => expect(headers['x-xss-protection']).toBeTruthy());
    });

    test('SCENARIO: injecting an inline script makes the policy report a violation', async ({ cspViolations, homePage }): Promise<void> => {
      await test.step('WHEN an inline script is injected', (): Promise<void> => homePage.injectInlineScript());

      await test.step('THEN at least one violation was reported', (): void => expect(cspViolations.length).toBeGreaterThan(0));
    });
  });
});
```

### Test CSP Violations

A policy that blocks inline scripts reports each block on the console. `cspViolations` collects those messages; `HomePage.injectInlineScript` appends a script element from `page.evaluate`, and the second test above asserts at least one violation was reported.

> **For comprehensive console monitoring** (fixtures, allowed patterns, fail on errors), see [console-errors.md](../debugging/console-errors.md).

## Anti-Patterns to Avoid

| Anti-Pattern               | Problem               | Solution                      |
| -------------------------- | --------------------- | ----------------------------- |
| Testing only happy path    | Misses security holes | Test malicious inputs         |
| Hardcoded test credentials | Security risk         | Use environment variables     |
| Skipping auth tests in dev | Bugs reach production | Test auth in all environments |
| Not testing authorization  | Access control bugs   | Test all role combinations    |

## Related References

- **Authentication**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for auth fixtures
- **Multi-User**: See [multi-user.md](../advanced/multi-user.md) for role-based testing
- **Error Testing**: See [error-testing.md](../debugging/error-testing.md) for validation testing
