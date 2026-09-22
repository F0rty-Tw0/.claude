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

export default defineConfig({ projects, testDir: './e2e', use });
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

A Manifest V3 extension registers a service worker whose URL starts with `chrome-extension://`. The fixture already waited for it.

```ts
// e2e/extension/extension-load.e2e.ts
import { expect, test } from './extension.fixture';

test.describe('FEATURE: extension loading', () => {
  test.describe('GIVEN the unpacked extension is loaded', () => {
    test('SCENARIO: the registered service worker has an extension url', async ({ serviceWorker }): Promise<void> => {
      const url = await test.step('WHEN the service worker url is read', (): string => serviceWorker.url());

      await test.step('THEN the url starts with chrome-extension://', (): void => expect(url).toContain('chrome-extension://'));
    });
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
  test.describe('GIVEN the popup is open', () => {
    test('SCENARIO: clicking Enable reports Enabled', async ({ openPopup }): Promise<void> => {
      const popup = await test.step('GIVEN the popup is open', (): Promise<PopupPage> => openPopup());

      await test.step('AND the heading names the extension', (): Promise<void> => expect(popup.heading).toHaveText('My Extension'));

      await test.step('WHEN Enable is clicked', (): Promise<void> => popup.enable());

      await test.step('THEN the Enabled label is shown', (): Promise<void> => expect(popup.enabledLabel).toBeVisible());
    });

    test('SCENARIO: clicking Fetch Data gets an answer from the background', async ({ openPopup }): Promise<void> => {
      const popup = await test.step('GIVEN the popup is open', (): Promise<PopupPage> => openPopup());

      const response = await test.step('WHEN Fetch Data is clicked', (): Promise<unknown> => popup.fetchData());

      await test.step('THEN the RESPONSE carries data', (): void => expect(response).toBeDefined());
    });
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
  test.describe('GIVEN a page on example.com', () => {
    test.beforeEach(async ({ contentPage }): Promise<void> => {
      await test.step('GIVEN example.com is open', (): Promise<void> => contentPage.goto());
    });

    test('SCENARIO: GET_STATUS reports the worker as active', async ({ extensionId, page }): Promise<void> => {
      const request: RuntimeRequest = { extensionId, type: 'GET_STATUS' };

      const response = await test.step('WHEN GET_STATUS is sent to the extension', (): Promise<unknown> => sendRuntimeMessage(page, request));

      await test.step('THEN the status is active', (): void => expect(response).toEqual({ status: 'active' }));
    });
  });
});
```

### Testing Background Logic

`worker.evaluate` runs inside the service worker, where `chrome.storage` is available. Background state written by the worker is read back with `readLocalStorage(serviceWorker, ['settings'])` exactly as in the [Storage API](#storage-api) spec; the assertion is `expect(items.settings).toBeDefined()`.

### Alarms and Timers

`createAndAwaitAlarm` registers the `onAlarm` listener before calling `chrome.alarms.create`, so a fast alarm is never missed. The side effect the handler writes (`alarmTriggered` in storage) is the assertion.

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
  test.describe('GIVEN the service worker is running', () => {
    test('SCENARIO: a fired test-alarm is recorded by the handler', async ({ serviceWorker }): Promise<void> => {
      await test.step('WHEN test-alarm is created and fires', (): Promise<void> => createAndAwaitAlarm(serviceWorker, TEST_ALARM));

      const items = await test.step('AND alarmTriggered is read from storage', (): Promise<StorageItems> => readLocalStorage(serviceWorker, ['alarmTriggered']));

      await test.step('THEN alarmTriggered is true', (): void => expect(items.alarmTriggered).toBe(true));
    });
  });
});
```

## Content Script Testing

`ContentPage` opens the host page and owns the elements the content script injects. `expect(widget).toBeVisible()` waits for the script to inject its UI; no `waitForSelector` is needed. Injected `<style>` tags are counted through a util because a style element has no locator role.

```ts
// e2e/extension/pages/content.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ContentPage {
  public readonly modifiedElements: Locator;
  public readonly widget: Locator;
  public readonly widgetButton: Locator;
  public readonly widgetResult: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
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
    await test.step(`widget result reads "${text}"`, (): Promise<void> => expect(this.widgetResult).toHaveText(text), { box: true });
  }
}
```

```ts
// e2e/extension/test/utils/injected-styles.spec.util.ts
import type { Page } from '@playwright/test';

const countStyles = (extensionName: string): number => document.querySelectorAll(`style[data-extension="${extensionName}"]`).length;

export const injectedStyleCount = (page: Page, extensionName: string): Promise<number> => page.evaluate(countStyles, extensionName);
```

### Content Script Communication

The content script relays a click to the background and reflects the answer in a status element. The test has the same shape as the widget test; the assertion on the status text covers the whole round trip.

| Test | Locators | Action | Assertion |
|---|---|---|---|
| Widget button | `widget`, `widgetButton`, `widgetResult` | `clickWidgetButton()` | `expectWidgetResult('Success')` |
| Background round trip | `page.locator('#my-extension-button')`, `page.locator('#my-extension-status')` | `clickExtensionButton()` | boxed `expectStatus('Connected')` |

### Page Modification Testing

Style injection is counted with `injectedStyleCount`; DOM markers are asserted through the `modifiedElements` locator with `not.toHaveCount(0)`, which retries instead of reading `count()` once.

```ts
// e2e/extension/content-script.e2e.ts
import { expect, test } from './extension.fixture';
import { injectedStyleCount } from './test/utils/injected-styles.spec.util';

test.describe('FEATURE: extension content script', () => {
  test.describe('GIVEN a page on example.com', () => {
    test.beforeEach(async ({ contentPage }): Promise<void> => {
      await test.step('GIVEN example.com is open', (): Promise<void> => contentPage.goto());
    });

    test('SCENARIO: clicking the widget button reports Success', async ({ contentPage }): Promise<void> => {
      await test.step('GIVEN the widget is injected', (): Promise<void> => expect(contentPage.widget).toBeVisible());

      await test.step('WHEN the widget button is clicked', (): Promise<void> => contentPage.clickWidgetButton());

      await test.step('THEN the widget result reads Success', (): Promise<void> => contentPage.expectWidgetResult('Success'));
    });

    test('SCENARIO: page load injects extension styles and marks elements', async ({ contentPage, page }): Promise<void> => {
      const styleCount = await test.step('WHEN the injected style tags are counted', (): Promise<number> => injectedStyleCount(page, 'my-ext'));

      await test.step('THEN at least one style tag is injected', (): void => expect(styleCount).toBeGreaterThan(0));

      await test.step('AND at least one element is marked', (): Promise<void> => expect(contentPage.modifiedElements).not.toHaveCount(0));
    });
  });
});
```

## Extension APIs

### Storage API

One wrapper per `chrome.storage` area and direction. `StorageItems` is the plain object both `get` and `set` exchange.

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
  test.describe('GIVEN the service worker is running', () => {
    test('SCENARIO: written local items read back', async ({ serviceWorker }): Promise<void> => {
      await test.step('WHEN key and count are written to local storage', (): Promise<void> => writeLocalStorage(serviceWorker, LOCAL_ITEMS));

      const items = await test.step('AND key and count are read', (): Promise<StorageItems> => readLocalStorage(serviceWorker, ['key', 'count']));

      await test.step('THEN the items match what was written', (): void => expect(items).toEqual(LOCAL_ITEMS));
    });
  });
});
```

### Tabs API

`chrome.tabs.query` runs in the worker and returns serializable `Tab` objects. `sendTabMessage` guards the optional `tab.id` on the Node side before evaluating.

```ts
// e2e/extension/test/utils/tabs.spec.util.ts
import type { Worker } from '@playwright/test';

import type { TabMessage } from '../../common/extension.type';

const queryByUrl = (url: string): Promise<chrome.tabs.Tab[]> => chrome.tabs.query({ url });

const sendToTab = (message: TabMessage): Promise<void> => chrome.tabs.sendMessage(message.tabId, { type: message.type });

export const queryTabs = (worker: Worker, url: string): Promise<chrome.tabs.Tab[]> => worker.evaluate(queryByUrl, url);

export const sendTabMessage = (worker: Worker, tab: chrome.tabs.Tab, type: string): Promise<void> => {
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
  test.describe('GIVEN a page on example.com', () => {
    test.beforeEach(async ({ contentPage }): Promise<void> => {
      await test.step('GIVEN example.com is open', (): Promise<void> => contentPage.goto());
    });

    test('SCENARIO: querying tabs by url finds the page and messages it', async ({ serviceWorker }): Promise<void> => {
      const tabs = await test.step('WHEN tabs on example.com are queried', (): Promise<chrome.tabs.Tab[]> => queryTabs(serviceWorker, '*://example.com/*'));

      await test.step('THEN one tab matches', (): void => expect(tabs.length).toBeGreaterThan(0));

      await test.step('AND PING reaches the tab', (): Promise<void> => sendTabMessage(serviceWorker, tabs[0], 'PING'));
    });
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

The spec opens `contentPage`, creates `{ contexts: ['selection'], id: 'test-menu', title: 'Test Action' }` (typed `chrome.contextMenus.CreateProperties`) through `createContextMenu(serviceWorker, …)` in a `GIVEN` step, selects text with `selectBodyText(page)` in the `WHEN`, and asserts in the `THEN` on the side effect the test-build dispatch helper triggers.

### Permissions API

`chrome.permissions.contains` reports the current grant. `chrome.permissions.request` needs a user gesture, so the wrapper returns `false` when it throws; in automated runs the prompt is auto-granted or the request is mocked.

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
  test.describe('GIVEN the service worker is running', () => {
    test('SCENARIO: requesting the github origin reports the grant', async ({ serviceWorker }): Promise<void> => {
      await test.step('WHEN the github origin is requested', (): Promise<boolean> => requestOriginPermission(serviceWorker, GITHUB_ORIGIN));

      const granted = await test.step('AND the github origin is checked', (): Promise<boolean> => hasOriginPermission(serviceWorker, GITHUB_ORIGIN));

      await test.step('THEN the grant state is a boolean', (): void => expect(typeof granted).toBe('boolean'));
    });
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
