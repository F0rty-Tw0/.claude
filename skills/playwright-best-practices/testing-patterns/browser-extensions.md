# Browser Extension Testing

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Loading Extensions](#loading-extensions)
3. [Popup Testing](#popup-testing)
4. [Background Script Testing](#background-script-testing)
5. [Content Script Testing](#content-script-testing)
6. [Extension APIs](#extension-apis)

## Setup & Configuration

### Prerequisites

Extensions load only in Chromium. `@types/chrome` types the `chrome` global used inside `evaluate` callbacks.

```bash
npm install -D @playwright/test @types/chrome
npx playwright install chromium
```

### Basic Configuration

Extensions need a headed browser, so `headless: false` sits in the shared `use`. The project pins `browserName` to Chromium through a named const.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const use = { headless: false } as const;

const chromiumExtension = { browserName: 'chromium' } as const;

const projects = [{ name: 'chromium-extension', use: chromiumExtension }];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts', use });
```

### Extension Fixture

The unpacked extension path is a constant. `context` is overridden with a persistent context launched with `--disable-extensions-except` and `--load-extension`, so the built-in `page` fixture opens inside it. `extensionId` is read from the service worker URL, never hardcoded, because it changes on reload.

```ts
// e2e/extension/common/extension.const.ts
import path from 'node:path';

export const EXTENSION_PATH = path.resolve(__dirname, '../../../extension');
```

`activeServiceWorker` returns the worker already running or waits for the `serviceworker` event; `backgroundPageOf` does the same for Manifest V2 background pages and is called from the spec, since a raw `Page` is not a fixture.

```ts
// e2e/extension/test/utils/extension-context.spec.util.ts
import type { BrowserContext, Page, Worker } from '@playwright/test';

export const activeServiceWorker = (context: BrowserContext): Promise<Worker> => {
  const [worker] = context.serviceWorkers();

  if (worker) return Promise.resolve(worker);

  return context.waitForEvent('serviceworker');
};

export const backgroundPageOf = (context: BrowserContext): Promise<Page> => {
  const [backgroundPage] = context.backgroundPages();

  if (backgroundPage) return Promise.resolve(backgroundPage);

  return context.waitForEvent('backgroundpage');
};

export const extensionIdOf = (worker: Worker): string => new URL(worker.url()).host;
```

`openPopup` is a factory fixture because a popup is closed and reopened inside one test; each call opens a fresh page at `chrome-extension://<id>/popup.html`.

```ts
// e2e/extension/extension.fixture.ts
import type { BrowserContext, Worker } from '@playwright/test';
import { chromium, test as base } from '@playwright/test';

import { EXTENSION_PATH } from './common/extension.const';
import { ContentPage } from './pages/content.page';
import { PopupPage } from './pages/popup.page';
import { activeServiceWorker, extensionIdOf } from './test/utils/extension-context.spec.util';

type OpenPopup = () => Promise<PopupPage>;

type ExtensionFixtures = {
  readonly contentPage: ContentPage;
  readonly context: BrowserContext;
  readonly extensionId: string;
  readonly openPopup: OpenPopup;
  readonly serviceWorker: Worker;
};

const LAUNCH_OPTIONS = {
  args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  headless: false
};

const popupOpener = (context: BrowserContext, extensionId: string): OpenPopup => {
  return async (): Promise<PopupPage> => {
    const page = await context.newPage();
    const popup = new PopupPage(page, extensionId);

    await popup.goto();

    return popup;
  };
};

export const test = base.extend<ExtensionFixtures>({
  contentPage: async ({ page }, use): Promise<void> => {
    await use(new ContentPage(page));
  },
  context: async ({}, use): Promise<void> => {
    const context = await chromium.launchPersistentContext('', LAUNCH_OPTIONS);

    await use(context);
    await context.close();
  },
  extensionId: async ({ serviceWorker }, use): Promise<void> => {
    await use(extensionIdOf(serviceWorker));
  },
  openPopup: async ({ context, extensionId }, use): Promise<void> => {
    await use(popupOpener(context, extensionId));
  },
  serviceWorker: async ({ context }, use): Promise<void> => {
    const serviceWorker = await activeServiceWorker(context);

    await use(serviceWorker);
  }
});

export { expect } from '@playwright/test';
```

## Loading Extensions

### Manifest V3 (Service Worker)

A Manifest V3 extension registers a service worker whose URL starts with `chrome-extension://`. The `WHEN` waits for it through `activeServiceWorker(context)`, the util behind the `serviceWorker` fixture, and the `THEN` reads its URL inside the check.

```ts
// e2e/extension/extension-load.e2e.ts
import type { Worker } from '@playwright/test';

import { expect, test } from './extension.fixture';
import { activeServiceWorker } from './test/utils/extension-context.spec.util';

test.describe('FEATURE: extension loading', () => {
  test('GIVEN a fresh install, the service worker runs from a chrome-extension url', async ({ context }): Promise<void> => {
    const worker = await test.step('WHEN the service worker starts', (): Promise<Worker> => activeServiceWorker(context));

    await test.step('THEN its url starts with chrome-extension://', (): void => expect(worker.url()).toContain('chrome-extension://'));
  });
});
```

### Manifest V2 (Background Page)

Manifest V2 extensions expose a background page instead of a worker. The same test destructures `context`, reads the page through `backgroundPageOf(context)` in the `WHEN` step (typed `(): Promise<Page>`), and asserts on `backgroundPage.url()`. Use only the wait that matches the manifest under test.

### Multiple Extensions

Load several extensions from one persistent context by joining their paths with a comma in both flags.

| Concern | Value |
|---|---|
| Launch args | `--disable-extensions-except=${first},${second}` and `--load-extension=${first},${second}` |
| Readiness | `await context.waitForEvent('serviceworker')` once per extension |
| Assertion | `expect(context.serviceWorkers()).toHaveLength(2)` |
| Extension IDs | `extensionIdOf(worker)` for each entry of `context.serviceWorkers()` |

## Popup Testing

### Opening Extension Popup

`PopupPage` owns the popup URL and its locators; the spec asserts on its public locators. `fetchData()` registers the runtime-message listener before the click that triggers the round trip.

```ts
// e2e/extension/pages/popup.page.ts
import type { Locator, Page } from '@playwright/test';

import { nextRuntimeMessage } from '../test/utils/runtime-message.spec.util';

export class PopupPage {
  public readonly enableButton: Locator;
  public readonly enabledLabel: Locator;
  public readonly fetchDataButton: Locator;
  public readonly heading: Locator;

  private readonly page: Page;
  private readonly url: string;

  public constructor(page: Page, extensionId: string) {
    this.page = page;
    this.url = `chrome-extension://${extensionId}/popup.html`;
    this.enableButton = page.getByRole('button', { name: 'Enable' });
    this.enabledLabel = page.getByText('Enabled');
    this.fetchDataButton = page.getByRole('button', { name: 'Fetch Data' });
    this.heading = page.getByRole('heading');
  }

  public async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  public async enable(): Promise<void> {
    await this.enableButton.click();
  }

  public async fetchData(): Promise<unknown> {
    const response = nextRuntimeMessage(this.page, 'RESPONSE');

    await this.fetchDataButton.click();

    return response;
  }
}
```

### Popup State Persistence

Closing the popup page and opening a new one through `openPopup` mirrors the user closing and reopening the toolbar popup. The persistence spec adds a `darkModeCheckbox` locator (`getByRole('checkbox', { name: 'Dark Mode' })`), an `enableDarkMode()` method that checks it, and a `close()` method wrapping `this.page.close()`; it checks the box on the first popup, closes it, opens a second through `openPopup()`, and expects the second `darkModeCheckbox` `toBeChecked()`.

### Popup Communication with Background

`nextRuntimeMessage` resolves with `message.data` when `chrome.runtime.onMessage` delivers a message of the given type. `sendRuntimeMessage` sends to an extension from a regular page through `chrome.runtime.sendMessage(extensionId, message, callback)`, which needs `externally_connectable` in the manifest.

```ts
// e2e/extension/common/extension.type.ts
export type AlarmRequest = {
  readonly delayInMinutes: number;
  readonly name: string;
};

export type RuntimeMessage = {
  readonly data?: unknown;
  readonly type: string;
};

export type RuntimeRequest = {
  readonly extensionId: string;
  readonly type: string;
};

export type StorageItems = Record<string, unknown>;

export type TabMessage = {
  readonly tabId: number;
  readonly type: string;
};
```

```ts
// e2e/extension/test/utils/runtime-message.spec.util.ts
import type { Page } from '@playwright/test';

import type { RuntimeMessage, RuntimeRequest } from '../../common/extension.type';

const waitForMessage = (type: string): Promise<unknown> => {
  return new Promise((resolve): void => {
    chrome.runtime.onMessage.addListener((message: RuntimeMessage): void => {
      if (message.type === type) resolve(message.data);
    });
  });
};

const sendMessage = (request: RuntimeRequest): Promise<unknown> => {
  return new Promise((resolve): void => {
    chrome.runtime.sendMessage(request.extensionId, { type: request.type }, resolve);
  });
};

export const nextRuntimeMessage = (page: Page, type: string): Promise<unknown> => page.evaluate(waitForMessage, type);

export const sendRuntimeMessage = (page: Page, request: RuntimeRequest): Promise<unknown> => page.evaluate(sendMessage, request);
```

```ts
// e2e/extension/popup.e2e.ts
import type { PopupPage } from './pages/popup.page';
import { expect, test } from './extension.fixture';

test.describe('FEATURE: extension popup', () => {
  test('GIVEN a fresh install, clicking Enable in the popup reports Enabled', async ({ openPopup }): Promise<void> => {
    const popup = await test.step('WHEN the popup is opened', (): Promise<PopupPage> => openPopup());

    await test.step('THEN the heading names the extension', (): Promise<void> => expect(popup.heading).toHaveText('My Extension'));

    await test.step('WHEN Enable is clicked', (): Promise<void> => popup.enable());

    await test.step('THEN the Enabled label is shown', (): Promise<void> => expect(popup.enabledLabel).toBeVisible());
  });

  test('GIVEN a fresh install, clicking Fetch Data in the popup gets an answer from the background', async ({ openPopup }): Promise<void> => {
    const popup = await test.step('WHEN the popup is opened', (): Promise<PopupPage> => openPopup());

    const response = await test.step('AND Fetch Data is clicked', (): Promise<unknown> => popup.fetchData());

    await test.step('THEN the RESPONSE carries data', (): void => expect(response).toBeDefined());
  });
});
```

## Background Script Testing

### Manifest V3 Service Worker

A regular page sends `GET_STATUS` to the extension through `sendRuntimeMessage`; the worker's `onMessageExternal` handler answers.

```ts
// e2e/extension/background-messages.e2e.ts
import type { RuntimeRequest } from './common/extension.type';
import { expect, test } from './extension.fixture';
import { sendRuntimeMessage } from './test/utils/runtime-message.spec.util';

test.describe('FEATURE: extension background messages', () => {
  test('GIVEN a fresh install, a GET_STATUS message from a page reports the worker active', async ({ contentPage, extensionId, page }): Promise<void> => {
    const request: RuntimeRequest = { extensionId, type: 'GET_STATUS' };

    await test.step('WHEN example.com is opened', (): Promise<void> => contentPage.goto());

    const response = await test.step('AND GET_STATUS is sent to the extension', (): Promise<unknown> => sendRuntimeMessage(page, request));

    await test.step('THEN the status is active', (): void => expect(response).toEqual({ status: 'active' }));
  });
});
```

### Testing Background Logic

`worker.evaluate` runs inside the service worker, where `chrome.storage` is available. Background state written by the worker is read inside the check, exactly as in the [Storage API](#storage-api) spec: `expect.poll((): Promise<StorageItems> => readLocalStorage(serviceWorker, ['settings'])).toHaveProperty('settings')`.

### Alarms and Timers

`createAndAwaitAlarm` registers the `onAlarm` listener before calling `chrome.alarms.create`, so a fast alarm is never missed. The side effect the handler writes (`alarmTriggered` in storage) is the assertion; `expect.poll` reads the storage inside the check and retries, because the extension's own handler may write after the test's listener resolves.

```ts
// e2e/extension/test/utils/alarm.spec.util.ts
import type { Worker } from '@playwright/test';

import type { AlarmRequest } from '../../common/extension.type';

const fireAlarm = (request: AlarmRequest): Promise<void> => {
  return new Promise((resolve): void => {
    chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm): void => {
      if (alarm.name === request.name) resolve();
    });
    chrome.alarms.create(request.name, { delayInMinutes: request.delayInMinutes });
  });
};

export const createAndAwaitAlarm = (worker: Worker, request: AlarmRequest): Promise<void> => worker.evaluate(fireAlarm, request);
```

```ts
// e2e/extension/background-alarm.e2e.ts
import type { AlarmRequest, StorageItems } from './common/extension.type';
import { expect, test } from './extension.fixture';
import { createAndAwaitAlarm } from './test/utils/alarm.spec.util';
import { readLocalStorage } from './test/utils/extension-storage.spec.util';

const TEST_ALARM: AlarmRequest = { delayInMinutes: 0.01, name: 'test-alarm' };

test.describe('FEATURE: extension alarms', () => {
  test('GIVEN a fresh install, a fired alarm is recorded by its handler', async ({ serviceWorker }): Promise<void> => {
    await test.step('WHEN test-alarm is created and fires', (): Promise<void> => createAndAwaitAlarm(serviceWorker, TEST_ALARM));

    await test.step('THEN alarmTriggered is stored as true', (): Promise<void> => expect.poll((): Promise<StorageItems> => readLocalStorage(serviceWorker, ['alarmTriggered'])).toHaveProperty('alarmTriggered', true));
  });
});
```

## Content Script Testing

`ContentPage` opens the host page and owns the elements the content script injects. `expect(widget).toBeVisible()` waits for the script to inject its UI; no `waitForSelector` is needed. A `<style>` element has no role, so `injectedStyles` is a CSS locator on the extension's `data-extension` attribute.

```ts
// e2e/extension/pages/content.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class ContentPage {
  public readonly injectedStyles: Locator;
  public readonly modifiedElements: Locator;
  public readonly widget: Locator;
  public readonly widgetButton: Locator;
  public readonly widgetResult: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.injectedStyles = page.locator('style[data-extension="my-ext"]');
    this.modifiedElements = page.locator('[data-modified-by-extension]');
    this.widget = page.locator('#my-extension-widget');
    this.widgetButton = this.widget.locator('button');
    this.widgetResult = this.widget.locator('.result');
  }

  public async goto(): Promise<void> {
    await this.page.goto('https://example.com');
  }

  public async clickWidgetButton(): Promise<void> {
    await this.widgetButton.click();
  }

  public async expectWidgetResult(text: string): Promise<void> {
    await expect(this.widgetResult).toHaveText(text);
  }
}
```

### Content Script Communication

The content script relays a click to the background and reflects the answer in a status element. The test has the same phases as the widget test; the assertion on the status text covers the whole round trip.

| Test | Locators | Action | Assertion |
|---|---|---|---|
| Widget button | `widget`, `widgetButton`, `widgetResult` | `clickWidgetButton()` | `expectWidgetResult('Success')` |
| Background round trip | `page.locator('#my-extension-button')`, `page.locator('#my-extension-status')` | `clickExtensionButton()` | `expectStatus('Connected')` |

### Page Modification Testing

Injected styles and DOM markers are both asserted through locators with `not.toHaveCount(0)`, which retries until the script has run instead of reading `count()` once.

```ts
// e2e/extension/content-script.e2e.ts
import { expect, test } from './extension.fixture';

test.describe('FEATURE: extension content script', () => {
  test('GIVEN a fresh install, clicking the injected widget button reports Success', async ({ contentPage }): Promise<void> => {
    await test.step('WHEN example.com is opened', (): Promise<void> => contentPage.goto());

    await test.step('THEN the widget is injected', (): Promise<void> => expect(contentPage.widget).toBeVisible());

    await test.step('WHEN the widget button is clicked', (): Promise<void> => contentPage.clickWidgetButton());

    await test.step('THEN the widget result reads Success', (): Promise<void> => contentPage.expectWidgetResult('Success'));
  });

  test('GIVEN a fresh install, opening a page injects extension styles and marks elements', async ({ contentPage }): Promise<void> => {
    await test.step('WHEN example.com is opened', (): Promise<void> => contentPage.goto());

    await test.step('THEN at least one style tag is injected', (): Promise<void> => expect(contentPage.injectedStyles).not.toHaveCount(0));

    await test.step('AND at least one element is marked', (): Promise<void> => expect(contentPage.modifiedElements).not.toHaveCount(0));
  });
});
```

## Extension APIs

### Storage API

One wrapper per `chrome.storage` area and direction. `StorageItems` is the plain object both `get` and `set` exchange. A check reads storage inside `expect.poll`, so no step only reads it.

```ts
// e2e/extension/test/utils/extension-storage.spec.util.ts
import type { Worker } from '@playwright/test';

import type { StorageItems } from '../../common/extension.type';

const readLocal = (keys: string[]): Promise<StorageItems> => chrome.storage.local.get(keys);

const writeLocal = (items: StorageItems): Promise<void> => chrome.storage.local.set(items);

export const readLocalStorage = (worker: Worker, keys: string[]): Promise<StorageItems> => worker.evaluate(readLocal, keys);

export const writeLocalStorage = (worker: Worker, items: StorageItems): Promise<void> => worker.evaluate(writeLocal, items);
```

| Area | Browser call | Wrappers |
|---|---|---|
| `local` | `chrome.storage.local.get` / `.set` | `readLocalStorage`, `writeLocalStorage` |
| `sync` | `chrome.storage.sync.get` / `.set` | `readSyncStorage`, `writeSyncStorage`, same signatures |

```ts
// e2e/extension/storage-api.e2e.ts
import type { StorageItems } from './common/extension.type';
import { expect, test } from './extension.fixture';
import { readLocalStorage, writeLocalStorage } from './test/utils/extension-storage.spec.util';

const LOCAL_ITEMS: StorageItems = { count: 42, key: 'value' };

test.describe('FEATURE: extension storage api', () => {
  test('GIVEN a fresh install, local items written by the worker read back unchanged', async ({ serviceWorker }): Promise<void> => {
    await test.step('WHEN key and count are written to local storage', (): Promise<void> => writeLocalStorage(serviceWorker, LOCAL_ITEMS));

    await test.step('THEN key and count read back unchanged', (): Promise<void> => expect.poll((): Promise<StorageItems> => readLocalStorage(serviceWorker, ['key', 'count'])).toEqual(LOCAL_ITEMS));
  });
});
```

### Tabs API

`chrome.tabs.query` runs in the worker and returns serializable `Tab` objects. `sendTabMessage` guards the optional `tab.id` on the Node side before evaluating and reports whether the message was delivered: `chrome.tabs.sendMessage` rejects when no content script listens in the tab.

```ts
// e2e/extension/test/utils/tabs.spec.util.ts
import type { Worker } from '@playwright/test';

import type { TabMessage } from '../../common/extension.type';

const queryByUrl = (url: string): Promise<chrome.tabs.Tab[]> => chrome.tabs.query({ url });

const sendToTab = async (message: TabMessage): Promise<boolean> => {
  try {
    await chrome.tabs.sendMessage(message.tabId, { type: message.type });

    return true;
  } catch {
    return false;
  }
};

export const queryTabs = (worker: Worker, url: string): Promise<chrome.tabs.Tab[]> => worker.evaluate(queryByUrl, url);

export const sendTabMessage = (worker: Worker, tab: chrome.tabs.Tab, type: string): Promise<boolean> => {
  if (tab.id === undefined) throw new Error('tab has no id');

  const message: TabMessage = { tabId: tab.id, type };

  return worker.evaluate(sendToTab, message);
};
```

```ts
// e2e/extension/tabs-api.e2e.ts
import { expect, test } from './extension.fixture';
import { queryTabs, sendTabMessage } from './test/utils/tabs.spec.util';

test.describe('FEATURE: extension tabs api', () => {
  test('GIVEN a fresh install, the worker finds an open example.com tab and messages it', async ({ contentPage, serviceWorker }): Promise<void> => {
    await test.step('WHEN example.com is opened', (): Promise<void> => contentPage.goto());

    const tabs = await test.step('AND tabs on example.com are queried', (): Promise<chrome.tabs.Tab[]> => queryTabs(serviceWorker, '*://example.com/*'));

    await test.step('THEN one tab matches', (): void => expect(tabs.length).toBeGreaterThan(0));

    const delivered = await test.step('WHEN PING is sent to that tab', (): Promise<boolean> => sendTabMessage(serviceWorker, tabs[0], 'PING'));

    await test.step('THEN the tab receives it', (): void => expect(delivered).toBe(true));
  });
});
```

### Context Menus

`createContextMenu` registers an item from the worker; `selectBodyText` puts a selection on the page so a `selection` context applies. Playwright cannot open the native context menu. At runtime the event object exposes `chrome.contextMenus.onClicked.dispatch(info, tab)`, which invokes the registered handler with a synthetic `{ menuItemId, selectionText }` and `{ id, url }`; `@types/chrome` does not declare `dispatch`, so call it from a small helper the extension exposes in test builds rather than casting the event.

```ts
// e2e/extension/test/utils/context-menu.spec.util.ts
import type { Page, Worker } from '@playwright/test';

const createMenu = (item: chrome.contextMenus.CreateProperties): void => {
  chrome.contextMenus.create(item);
};

const selectFirstNode = (): void => {
  const firstNode = document.body.firstChild;

  if (!firstNode) return;

  const range = document.createRange();

  range.selectNodeContents(firstNode);
  window.getSelection()?.addRange(range);
};

export const createContextMenu = (worker: Worker, item: chrome.contextMenus.CreateProperties): Promise<void> => worker.evaluate(createMenu, item);

export const selectBodyText = (page: Page): Promise<void> => page.evaluate(selectFirstNode);
```

Registering the item is not something the user does, so the fixture file adds a `contextMenuPage` fixture: it calls `createContextMenu(serviceWorker, …)` with `{ contexts: ['selection'], id: 'test-menu', title: 'Test Action' }` (typed `chrome.contextMenus.CreateProperties`), opens example.com through `contentPage.goto()`, and hands over that `ContentPage`. The spec's first `WHEN` is then the user's selection, `selectBodyText(page)`, and the `THEN` asserts on the side effect the test-build dispatch helper triggers.

### Permissions API

`chrome.permissions.contains` reports the current grant. `chrome.permissions.request` needs a user gesture, so the wrapper returns `false` when it throws; in automated runs the prompt is auto-granted or the request is mocked. The check reads `contains` inside `expect.poll` and compares it with the request's answer, so it holds whichever way the prompt resolves.

```ts
// e2e/extension/test/utils/permissions.spec.util.ts
import type { Worker } from '@playwright/test';

const containsOrigin = (origin: string): Promise<boolean> => chrome.permissions.contains({ origins: [origin] });

const requestOrigin = async (origin: string): Promise<boolean> => {
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
};

export const hasOriginPermission = (worker: Worker, origin: string): Promise<boolean> => worker.evaluate(containsOrigin, origin);

export const requestOriginPermission = (worker: Worker, origin: string): Promise<boolean> => worker.evaluate(requestOrigin, origin);
```

```ts
// e2e/extension/permissions-api.e2e.ts
import { expect, test } from './extension.fixture';
import { hasOriginPermission, requestOriginPermission } from './test/utils/permissions.spec.util';

const GITHUB_ORIGIN = 'https://*.github.com/*';

test.describe('FEATURE: extension permissions api', () => {
  test('GIVEN a fresh install, a github origin request and the permission check agree', async ({ serviceWorker }): Promise<void> => {
    const granted = await test.step('WHEN the github origin is requested', (): Promise<boolean> => requestOriginPermission(serviceWorker, GITHUB_ORIGIN));

    await test.step('THEN the reported grant matches the answer', (): Promise<void> => expect.poll((): Promise<boolean> => hasOriginPermission(serviceWorker, GITHUB_ORIGIN)).toBe(granted));
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                   | Problem               | Solution                                 |
| ------------------------------ | --------------------- | ---------------------------------------- |
| Testing in headless mode       | Extensions don't load | Use `headless: false`                    |
| Not waiting for service worker | Race conditions       | Wait for `serviceworker` event           |
| Hardcoding extension ID        | ID changes on reload  | Extract ID from service worker URL       |
| Testing packed extensions only | Slow iteration        | Test unpacked during development         |
| Ignoring MV3 differences       | Breaking changes      | Test both MV2 and MV3 if supporting both |

## Related References

- **Service Workers**: See [service-workers.md](../browser-apis/service-workers.md) for SW testing patterns
- **Multi-Context**: See [multi-context.md](../advanced/multi-context.md) for popup handling
- **Browser APIs**: See [browser-apis.md](../browser-apis/browser-apis.md) for permissions testing
