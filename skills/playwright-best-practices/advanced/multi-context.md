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

The mechanic every popup and new-tab sample shares: start waiting for the event, trigger it, await the promise. That sequence lives in a page-object method that returns the page object built on the new `Page`, or the `Page` itself when nothing but a URL check needs it. The spec's step is one call that hands the page object over, so the test body never builds one between steps. The page objects below follow `core/house-style.md`; `HomePage` (support popup) is shown in full, the rest are listed. A page object built on a popup or new tab takes that `Page` in its constructor like any other.

| Page object | File | Members used in this file |
|---|---|---|
| `HomePage` | `e2e/support/pages/home.page.ts` | shown below |
| `SupportChatPage` | `e2e/support/pages/support-chat.page.ts` | `send(message)` (fill "Message", click "Send"), `expectSent()` ("Message sent") |
| `DashboardPage` | `e2e/integrations/pages/dashboard.page.ts` | `goto()`, `openConnectAccount(): Promise<ProviderLoginPage>`, `expectAccountConnected()` |
| `ProviderLoginPage` | `e2e/integrations/pages/provider-login.page.ts` | `submit(credentials)` (email, password, "Log In"), `expectClosed()` (`expect.poll` on `page.isClosed()`) |
| `SharePage` | `e2e/share/pages/share.page.ts` | `goto(options?)` (`{ popups: 'blocked' }` calls `blockPopups(this.page)` before navigating), `openTwitterShare(): Promise<Page>`, `shareToTwitter()`, `expectCopyLinkFallback()` ("Copy share link instead") |
| `ResourcesPage` | `e2e/resources/pages/resources.page.ts` | `goto()`, `openDocumentation(): Promise<DocsPage>` (waits on `context().waitForEvent('page')`) |
| `DocsPage` | `e2e/resources/pages/docs.page.ts` | `expectHeading()` (level 1 heading visible), `expectUrl(url)` (`toHaveURL` on its tab) |
| `LinksPage` | `e2e/links/pages/links.page.ts` | `goto(options?)` (`{ blankTargets: 'dropped' }` calls `keepLinksInTab(this.page)` after navigating), `openExternalSite()` |
| `LoginPage` | `e2e/auth/pages/login.page.ts` | `goto({ oauthLogin })` from [third-party.md](third-party.md#oauth-on-the-opening-call), `expectWelcome(name)`, `signInWithGoogle()`; gains `openGoogleSignIn(): Promise<GoogleLoginPage>` |
| `GoogleLoginPage` | `e2e/auth/pages/google-login.page.ts` | `submit(credentials)` (email, "Next", password, "Next"), `expectClosed()` (as `ProviderLoginPage`) |
| `SyncDashboardPage` | `e2e/dashboard/pages/sync-dashboard.page.ts` | `goto()`, `addItem(name)` ("Add Item", fill "Name", "Save"), `expectItem(name)` (10 s timeout for the sync) |
| `EditorPage` | `e2e/editor/pages/editor.page.ts` | `goto()`, `bringToFront()`, `fillContent(text)` |
| `PreviewPage` | `e2e/editor/pages/preview.page.ts` | `goto()`, `bringToFront()`, `reload()`, `expectContent(text)` |

```ts
// e2e/support/pages/home.page.ts
import type { Locator, Page } from '@playwright/test';

import { SupportChatPage } from './support-chat.page';

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

  public async openSupportChat(): Promise<SupportChatPage> {
    const popupPromise = this.page.waitForEvent('popup');

    await this.supportChatButton.click();

    const popup = await popupPromise;

    await popup.waitForLoadState();

    return new SupportChatPage(popup);
  }
}
```

## Popup Handling

### Basic Popup

```ts
// e2e/support/support-chat.e2e.ts
import type { SupportChatPage } from './pages/support-chat.page';
import { test } from './support.fixture';

test.describe('FEATURE: support chat popup', () => {
  test('GIVEN an allowed popup, a message sent in the support chat is confirmed', async ({ homePage }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

    const chat = await test.step('AND the support chat popup is opened', (): Promise<SupportChatPage> => homePage.openSupportChat());

    await test.step('AND a message is sent', (): Promise<void> => chat.send('Need help'));

    await test.step('THEN the message sent confirmation is shown', (): Promise<void> => chat.expectSent());
  });
});
```

### Popup with Authentication

The popup closes itself after login. `ProviderLoginPage.expectClosed()` checks it with `expect.poll` on `page.isClosed()`, which passes even when the popup closed before the check started; a `waitForEvent('close')` registered after the close waits out its whole timeout.

```ts
// e2e/integrations/connect-account.e2e.ts
import { TEST_USER } from '../auth/common/auth.const';
import { test } from './integrations.fixture';
import type { ProviderLoginPage } from './pages/provider-login.page';

test.describe('FEATURE: connect account', () => {
  test('GIVEN an unconnected account, logging in through the provider popup connects it', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    const providerLogin = await test.step('AND the connect account popup is opened', (): Promise<ProviderLoginPage> => dashboardPage.openConnectAccount());

    await test.step('AND the login is submitted inside the popup', (): Promise<void> => providerLogin.submit(TEST_USER));

    await test.step('THEN the popup closes after login', (): Promise<void> => providerLogin.expectClosed());

    await test.step('AND the account connected message is shown', (): Promise<void> => dashboardPage.expectAccountConnected());
  });
});
```

### Handle Blocked Popups

A blocked popup is its own scenario whose opening call blocks it, `sharePage.goto({ popups: 'blocked' })`, made deterministic by stubbing `window.open` in an init script rather than racing a `waitForEvent('popup')` against a timeout. If you cannot stub `window.open`, race `page.waitForEvent('popup', { timeout })` with `.catch` against the fallback text and branch in a util, not in the spec.

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

test.describe('FEATURE: share to twitter', () => {
  test('GIVEN a blocked popup, sharing falls back to the copy link', async ({ sharePage }): Promise<void> => {
    await test.step('WHEN the share page is opened', (): Promise<void> => sharePage.goto({ popups: 'blocked' }));

    await test.step('AND share to twitter is clicked', (): Promise<void> => sharePage.shareToTwitter());

    await test.step('THEN the copy share link fallback is shown', (): Promise<void> => sharePage.expectCopyLinkFallback());
  });
});
```

`SharePage` has two methods on the same button: `openTwitterShare()` waits for the popup and returns it; `shareToTwitter()` only clicks. The allowed-popup scenario, `'GIVEN an allowed popup, sharing opens the twitter share'`, is the Basic Popup shape in the same `FEATURE`: `openTwitterShare()`, then `expect(popup).toHaveURL(/twitter\.com/)`. The popup closes with the context at teardown, so no step closes it.

## New Tab Navigation

### Link Opens in New Tab

`target="_blank"` links raise `page` on the context, not `popup` on the page. `openDocumentation` waits on `this.page.context().waitForEvent('page')`, then `waitForLoadState`, and returns a `DocsPage` on the new tab.

```ts
// e2e/resources/documentation-link.e2e.ts
import type { DocsPage } from './pages/docs.page';
import { expect, test } from './resources.fixture';

test.describe('FEATURE: documentation link', () => {
  test('GIVEN a documentation link with a blank target, clicking it opens the docs in a new tab', async ({ page, resourcesPage }): Promise<void> => {
    await test.step('WHEN the resources page is opened', (): Promise<void> => resourcesPage.goto());

    const docsPage = await test.step('AND the documentation link is clicked', (): Promise<DocsPage> => resourcesPage.openDocumentation());

    await test.step('THEN the new tab url is on the docs host', (): Promise<void> => docsPage.expectUrl(/docs\.example\.com/));

    await test.step('AND the docs heading is shown', (): Promise<void> => docsPage.expectHeading());

    await test.step('AND the original tab is still on resources', (): Promise<void> => expect(page).toHaveURL(/\/resources/));
  });
});
```

### Intercept New Tab

Removing `target="_blank"` keeps the navigation in the current tab, so the destination can be asserted on `page`. The spec (`e2e/links/external-link.e2e.ts`) opens with `linksPage.goto({ blankTargets: 'dropped' })` as its `WHEN`, which navigates and then calls `keepLinksInTab(this.page)`, clicks through `linksPage.openExternalSite()` in an `AND` step, and asserts `expect(page).toHaveURL(/external-site\.com/)`.

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
| WHEN page opened | `dashboardPage.goto()` | `loginPage.goto()` |
| AND popup opens, returning its page object | `dashboardPage.openConnectAccount()` | `loginPage.openGoogleSignIn()` |
| AND login submitted | `providerLogin.submit(TEST_USER)` | `googleLogin.submit(GOOGLE_TEST_USER)` |
| THEN popup closes | `providerLogin.expectClosed()` | `googleLogin.expectClosed()` |
| AND outcome | `dashboardPage.expectAccountConnected()` | `loginPage.expectWelcome('Test User')` |

### Mock OAuth (Recommended)

The mocked version never opens the provider. It reuses the `oauthLogin` option from [OAuth on the Opening Call](third-party.md#oauth-on-the-opening-call): `loginPage.goto({ oauthLogin })` routes the provider callback to a `302` into the app, and the session and current-user endpoints to the stub user, before it navigates. The title names the mocked provider, so the `WHEN` only says the login page is opened. The routes hit the app's own `/api`, so the spec is a `.test.ts`.

```ts
// e2e/auth/google-mocked.test.ts
import { expect, test } from './auth.fixture';
import { EMPTY_STORAGE_STATE } from './common/auth.const';
import type { OAuthLogin } from './common/auth.type';
import { OAUTH_USER_STUB } from './test/stubs/oauth.stub';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: google sign in', () => {
  test('GIVEN a mocked google login, signing in names the user without the provider popup', async ({ loginPage, page }): Promise<void> => {
    const oauthLogin: OAuthLogin = { provider: 'google', user: OAUTH_USER_STUB };

    await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto({ oauthLogin }));

    await test.step('AND sign in with google is clicked', (): Promise<void> => loginPage.signInWithGoogle());

    await test.step('THEN the success url names google', (): Promise<void> => expect(page).toHaveURL('/auth/success?provider=google'));

    await test.step('AND the welcome names the user', (): Promise<void> => loginPage.expectWelcome(OAUTH_USER_STUB.name));
  });
});
```

### More OAuth Mocking

> **For the mocks behind `oauthLogin`**, other providers, and SAML SSO, see [third-party.md](third-party.md#oauthsso-mocking). This file covers the popup and tab mechanics of an OAuth flow.

## Multiple Windows

### Test Across Multiple Windows

Two tabs in one context share cookies and storage, which is what "same user, two windows" needs. `dashboard.fixture.ts` hands over `firstDashboard` and `secondDashboard`, each a `SyncDashboardPage` on its own `context.newPage()` tab, so opening the windows is not a step. `expectItem` carries a 10 s timeout because real-time sync is slower than a local render.

```ts
// e2e/dashboard/window-sync.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard window sync', () => {
  test('GIVEN two windows, adding an item in one shows it in the other', async ({ firstDashboard, secondDashboard }): Promise<void> => {
    await test.step('WHEN the dashboard is opened in the first window', (): Promise<void> => firstDashboard.goto());

    await test.step('AND the dashboard is opened in the second window', (): Promise<void> => secondDashboard.goto());

    await test.step('AND an item is added in the first window', (): Promise<void> => firstDashboard.addItem('New Item'));

    await test.step('THEN the second window shows the item', (): Promise<void> => secondDashboard.expectItem('New Item'));
  });
});
```

### Context-Level Events

A listener on the context covers every tab and popup in it, including ones opened after the listener is registered; a listener on `page` misses them. Register it in the fixture above `use`, like any page listener.

| Event | Fires for | Use |
|---|---|---|
| `context.on('page')` | Every new tab or popup in the context | Wrap each new page in its page object, or attach per-page listeners |
| `context.on('console')`, `'request'`, `'response'`, `'dialog'` | The same events from any page in the context | One log or one dialog policy for all tabs |
| `context.on('weberror')` (1.60) | An uncaught exception in any page; `webError.location()` gives file, line, column | Fail on errors in popups too; see [console-errors.md](../debugging/console-errors.md#capture-error-details) |
| `browser.on('context')` (1.60) | Every new context created on the browser | A worker-scoped fixture that applies the same routes or listeners to contexts a multi-user fixture creates with `browser.newContext()` |

### Different Users in Different Windows

> **For multi-user collaboration patterns** (admin/user interactions, real-time collaboration, role-based testing, concurrent actions), see [multi-user.md](multi-user.md). This file focuses on single-user scenarios with multiple tabs/windows/popups.

## Tab Coordination

### Switch Between Tabs

Same two-tab shape as the window sync spec above. `bringToFront()` and `reload()` are page-object methods that delegate to `this.page`, so the spec never touches `Page` directly.

| Spec | Opening steps (`WHEN`, then `AND`) | `AND` actions | `THEN` |
|---|---|---|---|
| `e2e/dashboard/window-sync.e2e.ts` | `firstDashboard.goto()`, `secondDashboard.goto()`: fixture `SyncDashboardPage`s, each on its own `context.newPage()` tab | `firstDashboard.addItem('New Item')` | `secondDashboard.expectItem('New Item')` |
| `e2e/editor/preview-tab.e2e.ts` | `editorPage.goto()`, `previewPage.goto()`: fixture page objects, each on its own tab | `editorPage.bringToFront()`, `fillContent('Hello World')`, `previewPage.bringToFront()`, `reload()` | `previewPage.expectContent('Hello World')` |
| `e2e/support/tab-cleanup.e2e.ts` | `homePage.goto()` on the test's `page`, then `openTabs(context, ['/popup/0', '/popup/1', '/popup/2'])` | `closeOtherTabs(context, page)` | `expect(context.pages()).toHaveLength(1)`, a sync `(): void =>` step |

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

| Anti-Pattern                    | Problem                        | Solution                                                                       |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Not waiting for popup           | Race condition                 | Use `waitForEvent('popup')` before trigger                                     |
| Testing real OAuth              | Slow, flaky, needs credentials | Mock OAuth endpoints                                                           |
| Assuming popup opens            | May be blocked                 | Handle both open and blocked cases                                             |
| Not closing contexts you create | Resource leak                  | Close them in the fixture's teardown; popups and tabs close with their context |

## Related References

- **Authentication**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for auth patterns
- **Network**: See [network-advanced.md](network-advanced.md) for mocking OAuth
