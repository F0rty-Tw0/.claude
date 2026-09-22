# Multi-Tab, Window & Popup Testing

This file covers **single-user scenarios** with multiple browser tabs, windows, and popups. For **multi-user collaboration testing** (multiple users interacting simultaneously), see [multi-user.md](multi-user.md).

## Table of Contents

1. [Popup Handling](#popup-handling)
2. [New Tab Navigation](#new-tab-navigation)
3. [OAuth Flows](#oauth-flows)
4. [Multiple Windows](#multiple-windows)
5. [Tab Coordination](#tab-coordination)
6. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
7. [Related References](#related-references)

The mechanic every popup and new-tab sample shares: start waiting for the event, trigger it, await the promise. That sequence lives in a page-object method that returns the new `Page`, so the spec's step is one call. The page objects below follow `core/house-style.md`; `HomePage` (support popup) is shown in full, the rest are listed. A page object built on a popup or new tab takes that `Page` in its constructor like any other.

| Page object | File | Members used in this file |
|---|---|---|
| `HomePage` | `e2e/support/pages/home.page.ts` | shown below |
| `SupportChatPage` | `e2e/support/pages/support-chat.page.ts` | `send(message)` (fill "Message", click "Send"), `expectSent()` ("Message sent") |
| `DashboardPage` | `e2e/integrations/pages/dashboard.page.ts` | `goto()`, `openConnectAccount(): Promise<Page>`, `expectAccountConnected()` |
| `ProviderLoginPage` | `e2e/integrations/pages/provider-login.page.ts` | `submit(credentials)` (email, password, "Log In") |
| `SharePage` | `e2e/share/pages/share.page.ts` | `goto()`, `openTwitterShare(): Promise<Page>`, `shareToTwitter()`, `expectCopyLinkFallback()` ("Copy share link instead") |
| `ResourcesPage` | `e2e/resources/pages/resources.page.ts` | `goto()`, `openDocumentation(): Promise<Page>` (waits on `context().waitForEvent('page')`) |
| `DocsPage` | `e2e/resources/pages/docs.page.ts` | `expectHeading()` (level 1 heading visible) |
| `LinksPage` | `e2e/links/pages/links.page.ts` | `goto()`, `openExternalSite()` |
| `LoginPage` | `e2e/auth/pages/login.page.ts` | gains `openGoogleSignIn(): Promise<Page>`, `signInWithGoogle()` |
| `GoogleLoginPage` | `e2e/auth/pages/google-login.page.ts` | `submit(credentials)` (email, "Next", password, "Next") |
| `HomePage` | `e2e/auth/pages/home.page.ts` | `expectWelcome(name)` |
| `SyncDashboardPage` | `e2e/dashboard/pages/dashboard.page.ts` | `goto()`, `addItem(name)` ("Add Item", fill "Name", "Save"), `expectItem(name)` (10 s timeout for the sync) |
| `EditorPage` | `e2e/editor/pages/editor.page.ts` | `goto()`, `bringToFront()`, `fillContent(text)` |
| `PreviewPage` | `e2e/editor/pages/preview.page.ts` | `goto()`, `bringToFront()`, `reload()`, `expectContent(text)` |

```ts
// e2e/support/pages/home.page.ts
import type { Locator, Page } from '@playwright/test';

export class HomePage {
  public readonly supportChatButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.supportChatButton = page.getByRole('button', { name: 'Open Support Chat' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/');
  }

  public async openSupportChat(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup');

    await this.supportChatButton.click();

    const popup = await popupPromise;

    await popup.waitForLoadState();

    return popup;
  }
}
```

## Popup Handling

### Basic Popup

```ts
// e2e/support/support-chat.e2e.ts
import type { Page } from '@playwright/test';

import { SupportChatPage } from './pages/support-chat.page';
import { test } from './support.fixture';

test.describe('FEATURE: support chat popup', () => {
  test.describe('GIVEN the home page', () => {
    test('SCENARIO: sending a message in the chat popup shows the confirmation', async ({ homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      const popup = await test.step('WHEN the support chat popup is opened', (): Promise<Page> => homePage.openSupportChat());
      const chat = new SupportChatPage(popup);

      await test.step('AND a message is sent', (): Promise<void> => chat.send('Need help'));

      await test.step('THEN the message sent confirmation is shown', (): Promise<void> => chat.expectSent());

      await test.step('AND the popup is closed', (): Promise<void> => popup.close());
    });
  });
});
```

### Popup with Authentication

The popup closes itself after login; `popup.waitForEvent('close')` is the step that waits for it.

```ts
// e2e/integrations/connect-account.e2e.ts
import type { Page } from '@playwright/test';

import { TEST_USER } from '../auth/common/auth.const';
import { test } from './integrations.fixture';
import { ProviderLoginPage } from './pages/provider-login.page';

test.describe('FEATURE: connect account', () => {
  test.describe('GIVEN the dashboard', () => {
    test('SCENARIO: completing the provider login in the popup connects the account', async ({ dashboardPage }): Promise<void> => {
      await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());

      const popup = await test.step('WHEN the connect account popup is opened', (): Promise<Page> => dashboardPage.openConnectAccount());
      const providerLogin = new ProviderLoginPage(popup);

      await test.step('AND the login is submitted inside the popup', (): Promise<void> => providerLogin.submit(TEST_USER));

      await test.step('THEN the popup closes after login', (): Promise<Page> => popup.waitForEvent('close'));

      await test.step('AND the account connected message is shown', (): Promise<void> => dashboardPage.expectAccountConnected());
    });
  });
});
```

### Handle Blocked Popups

A blocked popup is a distinct `GIVEN`, made deterministic by stubbing `window.open` in an init script rather than racing a `waitForEvent('popup')` against a timeout. If you cannot stub `window.open`, race `page.waitForEvent('popup', { timeout })` with `.catch` against the fallback text and branch in a util, not in the spec.

```ts
// e2e/share/test/utils/popup-blocker.spec.util.ts
import type { Page } from '@playwright/test';

const blockWindowOpen = (): void => {
  window.open = (): null => null;
};

export const blockPopups = async (page: Page): Promise<void> => {
  await page.addInitScript(blockWindowOpen);
};
```

```ts
// e2e/share/share.e2e.ts
import { test } from './share.fixture';
import { blockPopups } from './test/utils/popup-blocker.spec.util';

test.describe('FEATURE: share to twitter', () => {
  test.describe('GIVEN popups are blocked', () => {
    test.beforeEach(async ({ page }): Promise<void> => {
      await test.step('GIVEN window.open is stubbed to return null', (): Promise<void> => blockPopups(page));
    });

    test('SCENARIO: clicking share to twitter shows the copy link fallback', async ({ sharePage }): Promise<void> => {
      await test.step('GIVEN the share page is open', (): Promise<void> => sharePage.goto());

      await test.step('WHEN share to twitter is clicked', (): Promise<void> => sharePage.shareToTwitter());

      await test.step('THEN the copy share link fallback is shown', (): Promise<void> => sharePage.expectCopyLinkFallback());
    });
  });
});
```

`SharePage` has two methods on the same button: `openTwitterShare()` waits for the popup and returns it; `shareToTwitter()` only clicks. The `GIVEN popups are allowed` describe is the Basic Popup shape: `openTwitterShare()`, `expect(popup).toHaveURL(/twitter\.com/)`, `popup.close()`.

## New Tab Navigation

### Link Opens in New Tab

`target="_blank"` links raise `page` on the context, not `popup` on the page. `openDocumentation` waits on `this.page.context().waitForEvent('page')`, then `waitForLoadState`, and returns the tab.

```ts
// e2e/resources/documentation-link.e2e.ts
import type { Page } from '@playwright/test';

import { DocsPage } from './pages/docs.page';
import { expect, test } from './resources.fixture';

test.describe('FEATURE: documentation link', () => {
  test.describe('GIVEN the resources page', () => {
    test('SCENARIO: clicking the documentation link opens the docs in a new tab', async ({ page, resourcesPage }): Promise<void> => {
      await test.step('GIVEN the resources page is open', (): Promise<void> => resourcesPage.goto());

      const docsTab = await test.step('WHEN the documentation link is clicked', (): Promise<Page> => resourcesPage.openDocumentation());
      const docsPage = new DocsPage(docsTab);

      await test.step('THEN the new tab url is on the docs host', (): Promise<void> => expect(docsTab).toHaveURL(/docs\.example\.com/));

      await test.step('AND the docs heading is shown', (): Promise<void> => docsPage.expectHeading());

      await test.step('AND the original tab is still on resources', (): Promise<void> => expect(page).toHaveURL(/\/resources/));

      await test.step('AND the docs tab is closed', (): Promise<void> => docsTab.close());
    });
  });
});
```

### Intercept New Tab

Removing `target="_blank"` keeps the navigation in the current tab, so the destination can be asserted on `page`. The spec (`e2e/links/external-link.e2e.ts`) runs `linksPage.goto()`, then `keepLinksInTab(page)` as an `AND` arrange step, clicks through `linksPage.openExternalSite()`, and asserts `expect(page).toHaveURL(/external-site\.com/)`.

```ts
// e2e/links/test/utils/links.spec.util.ts
import type { Page } from '@playwright/test';

const dropBlankTargets = (): void => {
  const links = document.querySelectorAll('a[target="_blank"]');

  links.forEach((link): void => link.removeAttribute('target'));
};

export const keepLinksInTab = (page: Page): Promise<void> => page.evaluate(dropBlankTargets);
```

## OAuth Flows

### Google OAuth Popup

Driving the real provider popup: slow, needs real credentials, and the provider's DOM changes without notice. The mocked version below is the one to run in CI. The real-popup spec is the [Popup with Authentication](#popup-with-authentication) shape with `test.use({ storageState: EMPTY_STORAGE_STATE })`; `GOOGLE_TEST_USER` is a `Credentials` const in `e2e/auth/common/auth.const.ts`, read from the environment like `TEST_USER`.

| Step | Popup with Authentication | Google OAuth popup |
|---|---|---|
| GIVEN | `dashboardPage.goto()` | `loginPage.goto()` |
| WHEN popup opens | `dashboardPage.openConnectAccount()` | `loginPage.openGoogleSignIn()` |
| AND login submitted | `new ProviderLoginPage(popup).submit(TEST_USER)` | `new GoogleLoginPage(popup).submit(GOOGLE_TEST_USER)` |
| THEN popup closes | `popup.waitForEvent('close')` | same |
| AND outcome | `dashboardPage.expectAccountConnected()` | `homePage.expectWelcome('Test User')` |

### Mock OAuth (Recommended)

Two routes replace the provider: the callback answers with a `302` to the dashboard, and the token exchange answers with a stub user. Both are factories registered in `beforeEach` before any navigation.

```ts
// e2e/auth/test/stubs/callback.stub.ts
import type { ResponseHeaders } from '../../common/auth.type';

export const DASHBOARD_REDIRECT_STUB: ResponseHeaders = { Location: '/dashboard' };
```

```ts
// e2e/auth/test/mocks/callback-redirect.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { ResponseHeaders } from '../../common/auth.type';
import { DASHBOARD_REDIRECT_STUB } from '../stubs/callback.stub';

export const callbackRedirectMock = (headers: ResponseHeaders = DASHBOARD_REDIRECT_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ headers, status: 302 });
};
```

`tokenMock()` in `e2e/auth/test/mocks/token.mock.ts` has the same shape and fulfills `**/api/auth/token` with `TOKEN_STUB`, an `AuthToken` in `test/stubs/token.stub.ts` holding `{ access_token: 'mock-token', user: { email: 'test@example.com', name: 'Test User' } }`.

```ts
// e2e/auth/google-mocked.test.ts
import { expect, test } from './auth.fixture';
import { EMPTY_STORAGE_STATE } from './common/auth.const';
import { callbackRedirectMock } from './test/mocks/callback-redirect.mock';
import { tokenMock } from './test/mocks/token.mock';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: google sign in', () => {
  test.describe('GIVEN the callback and token exchange are mocked', () => {
    test.beforeEach(async ({ page }): Promise<void> => {
      await test.step('GIVEN the oauth callback redirects to the dashboard', async (): Promise<void> => {
        await page.route('**/auth/callback**', callbackRedirectMock());
      });

      await test.step('AND the token exchange is mocked', async (): Promise<void> => {
        await page.route('**/api/auth/token', tokenMock());
      });
    });

    test('SCENARIO: clicking sign in with google opens the dashboard without the provider', async ({ homePage, loginPage, page }): Promise<void> => {
      await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());

      await test.step('WHEN sign in with google is clicked', (): Promise<void> => loginPage.signInWithGoogle());

      await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));

      await test.step('AND the welcome names the user', (): Promise<void> => homePage.expectWelcome('Test User'));
    });
  });
});
```

### OAuth Fixture

> **For comprehensive OAuth mocking patterns** (fixtures, multiple providers, SAML SSO), see [third-party.md](third-party.md#oauthsso-mocking). This section focuses on popup window handling mechanics for OAuth flows.

## Multiple Windows

### Test Across Multiple Windows

Two tabs in one context share cookies and storage, which is what "same user, two windows" needs. `expectItem` carries a 10 s timeout because real-time sync is slower than a local render.

```ts
// e2e/dashboard/window-sync.e2e.ts
import type { Page } from '@playwright/test';

import { test } from './dashboard.fixture';
import { SyncDashboardPage } from './pages/dashboard.page';

test.describe('FEATURE: dashboard window sync', () => {
  test.describe('GIVEN two windows on the dashboard', () => {
    test('SCENARIO: adding an item in one window shows it in the other', async ({ context }): Promise<void> => {
      const firstTab = await test.step('GIVEN a first window is open', (): Promise<Page> => context.newPage());
      const secondTab = await test.step('AND a second window is open', (): Promise<Page> => context.newPage());
      const firstDashboard = new SyncDashboardPage(firstTab);
      const secondDashboard = new SyncDashboardPage(secondTab);

      await test.step('AND the dashboard is open in the first window', (): Promise<void> => firstDashboard.goto());

      await test.step('AND the dashboard is open in the second window', (): Promise<void> => secondDashboard.goto());

      await test.step('WHEN an item is added in the first window', (): Promise<void> => firstDashboard.addItem('New Item'));

      await test.step('THEN the second window shows the item', (): Promise<void> => secondDashboard.expectItem('New Item'));
    });
  });
});
```

### Different Users in Different Windows

> **For multi-user collaboration patterns** (admin/user interactions, real-time collaboration, role-based testing, concurrent actions), see [multi-user.md](multi-user.md). This file focuses on single-user scenarios with multiple tabs/windows/popups.

## Tab Coordination

### Switch Between Tabs

Same two-tab shape as the window sync spec above. `bringToFront()` and `reload()` are page-object methods that delegate to `this.page`, so the spec never touches `Page` directly.

| Spec | Page objects on `context.newPage()` tabs | WHEN | THEN |
|---|---|---|---|
| `e2e/dashboard/window-sync.e2e.ts` | `SyncDashboardPage` twice, `goto()` each | `firstDashboard.addItem('New Item')` | `secondDashboard.expectItem('New Item')` |
| `e2e/editor/preview-tab.e2e.ts` | `EditorPage`, `PreviewPage`, `goto()` each | `editorPage.bringToFront()`, `fillContent('Hello World')`, `previewPage.bringToFront()`, `reload()` | `previewPage.expectContent('Hello World')` |
| `e2e/support/tab-cleanup.e2e.ts` | `HomePage` on the main tab, `goto()`, then `openTabs(context, ['/popup/0', '/popup/1', '/popup/2'])` | `closeOtherTabs(context, mainTab)` | `expect(context.pages()).toHaveLength(1)` |

### Close All Tabs Except One

`openTabs` and `closeOtherTabs` are the utils the last row above calls.

```ts
// e2e/support/test/utils/tabs.spec.util.ts
import type { BrowserContext, Page } from '@playwright/test';

export const openTabs = async (context: BrowserContext, paths: string[]): Promise<void> => {
  for (const path of paths) {
    const tab = await context.newPage();

    await tab.goto(path);
  }
};

export const closeOtherTabs = async (context: BrowserContext, keep: Page): Promise<void> => {
  const others = context.pages().filter((tab): boolean => tab !== keep);

  for (const tab of others) {
    await tab.close();
  }
};
```

## Anti-Patterns to Avoid

| Anti-Pattern            | Problem                        | Solution                                   |
| ----------------------- | ------------------------------ | ------------------------------------------ |
| Not waiting for popup   | Race condition                 | Use `waitForEvent('popup')` before trigger |
| Testing real OAuth      | Slow, flaky, needs credentials | Mock OAuth endpoints                       |
| Assuming popup opens    | May be blocked                 | Handle both open and blocked cases         |
| Not closing extra pages | Resource leak                  | Close pages in cleanup                     |

## Related References

- **Authentication**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for auth patterns
- **Network**: See [network-advanced.md](network-advanced.md) for mocking OAuth
