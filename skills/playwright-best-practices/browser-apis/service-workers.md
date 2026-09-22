# Service Worker Testing

## Table of Contents

1. [Service Worker Basics](#service-worker-basics)
2. [Registration & Lifecycle](#registration--lifecycle)
3. [Cache Testing](#cache-testing)
4. [Offline Testing](#offline-testing)
5. [Push Notifications](#push-notifications)
6. [Background Sync](#background-sync)

## Service Worker Basics

Every sample belongs to the `pwa` feature. Browser-side work runs through `page.evaluate` or `worker.evaluate`; each browser-side function is self-contained (Playwright serialises it) and lives next to the node-side wrapper that calls it in a `.spec.util.ts`. The wrappers return typed values so spec steps stay one call.

Globals that the DOM lib does not know (`SW_VERSION` on the worker scope, `sync` on the registration) are typed as optional properties next to one property the real object always has (`location`, `scope`), so `self` and the registration assign to them without a cast and without tripping the weak-type check. Helpers that run inside the worker (`self.registration`, `PushEvent`, `NotificationEvent`) use service-worker globals; compile them under a tsconfig with `lib: ["webworker"]`, separate from the page-side one.

```ts
// e2e/pwa/common/pwa.type.ts
export type ServiceWorkerState = {
  readonly active: boolean;
  readonly installing: boolean;
  readonly scope: string;
  readonly waiting: boolean;
};

export type SwGlobals = {
  readonly location: Location;
  readonly SW_VERSION?: string;
};

export type SyncManager = {
  readonly register: (tag: string) => Promise<void>;
};

export type SyncRegistration = {
  readonly scope: string;
  readonly sync?: SyncManager;
};

export type PushPayload = {
  readonly body: string;
  readonly title: string;
};
```

```ts
// e2e/pwa/pwa.fixture.ts
import type { Worker } from '@playwright/test';
import { test as base } from '@playwright/test';

import { PwaPage } from './pages/pwa.page';
import { activeServiceWorker } from './test/utils/service-worker.spec.util';

type PwaFixtures = {
  readonly pwaPage: PwaPage;
  readonly serviceWorker: Worker;
};

export const test = base.extend<PwaFixtures>({
  pwaPage: async ({ page }, use): Promise<void> => {
    await use(new PwaPage(page));
  },
  serviceWorker: async ({ context, page }, use): Promise<void> => {
    const workerPromise = activeServiceWorker(context);

    await page.goto('/pwa-app');
    await use(await workerPromise);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/pwa/pages/pwa.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class PwaPage {
  public readonly heading: Locator;
  public readonly messageInput: Locator;
  public readonly offlineBadge: Locator;
  public readonly retryButton: Locator;
  public readonly sendButton: Locator;
  public readonly statusText: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.messageInput = page.getByLabel('Message');
    this.offlineBadge = page.getByTestId('offline-badge');
    this.retryButton = page.getByRole('button', { name: 'Retry' });
    this.sendButton = page.getByRole('button', { name: 'Send' });
    this.statusText = page.getByRole('status');
  }

  public async goto(path = '/pwa-app'): Promise<void> {
    await this.page.goto(path);
  }

  public async reload(): Promise<void> {
    await this.page.reload();
  }

  public async sendMessage(text: string): Promise<void> {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  public async expectDashboard(): Promise<void> {
    await test.step('dashboard heading is shown', (): Promise<void> => expect(this.heading).toBeVisible(), { box: true });
  }

  public async expectOfflineBadge(): Promise<void> {
    await test.step('offline badge is shown', (): Promise<void> => expect(this.offlineBadge).toBeVisible(), { box: true });
  }

  public async expectOnline(): Promise<void> {
    await test.step('offline badge is hidden', (): Promise<void> => expect(this.offlineBadge).toBeHidden(), { box: true });
  }

  public async expectOfflineFallback(): Promise<void> {
    await test.step('offline fallback page is shown', async (): Promise<void> => {
      await expect(this.page.getByText('You are offline')).toBeVisible();
      await expect(this.retryButton).toBeVisible();
    }, { box: true });
  }

  public async expectStatus(text: string): Promise<void> {
    await test.step(`status reads "${text}"`, (): Promise<void> => expect(this.statusText).toHaveText(text), { box: true });
  }
}
```

### Waiting for Service Worker Registration

`navigator.serviceWorker.ready` resolves once a worker is active. The wrapper returns a boolean the spec asserts on.

```ts
// e2e/pwa/test/utils/service-worker.spec.util.ts
import type { BrowserContext, Page, Worker } from '@playwright/test';

import type { ServiceWorkerState, SwGlobals } from '../../common/pwa.type';

const readActive = async (): Promise<boolean> => {
  const isSupported = 'serviceWorker' in navigator;

  if (!isSupported) return false;

  const registration = await navigator.serviceWorker.ready;

  return registration.active !== null;
};

const readState = async (): Promise<ServiceWorkerState | null> => {
  const registration = await navigator.serviceWorker.getRegistration();

  if (!registration) return null;

  const state: ServiceWorkerState = {
    active: registration.active !== null,
    installing: registration.installing !== null,
    scope: registration.scope,
    waiting: registration.waiting !== null
  };

  return state;
};

const readVersion = (): string => {
  const scope: SwGlobals = self;

  return scope.SW_VERSION ?? 'unknown';
};

export const isServiceWorkerActive = (page: Page): Promise<boolean> => page.evaluate(readActive);

export const serviceWorkerState = (page: Page): Promise<ServiceWorkerState | null> => page.evaluate(readState);

export const serviceWorkerVersion = (worker: Worker): Promise<string> => worker.evaluate(readVersion);

export const activeServiceWorker = (context: BrowserContext): Promise<Worker> => {
  const [worker] = context.serviceWorkers();

  if (worker) return Promise.resolve(worker);

  return context.waitForEvent('serviceworker');
};
```

```ts
// e2e/pwa/pwa.spec.ts
import { expect, test } from './pwa.fixture';
import { isServiceWorkerActive, serviceWorkerState, serviceWorkerVersion } from './test/utils/service-worker.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test.describe('GIVEN the pwa app', () => {
    test.beforeEach(async ({ pwaPage }): Promise<void> => {
      await test.step('GIVEN the app is open', (): Promise<void> => pwaPage.goto());
    });

    test('SCENARIO: loading the app activates a service worker', async ({ page }): Promise<void> => {
      const active = await test.step('WHEN the worker registration is ready', (): Promise<boolean> => isServiceWorkerActive(page));

      await test.step('THEN a worker is active', (): void => expect(active).toBe(true));
    });
  });
});
```

### Getting Service Worker State

`serviceWorkerState` maps the registration to a plain object so the spec asserts on named fields.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: the registration is active in the app scope', async ({ page }): Promise<void> => {
  const state = await test.step('WHEN the registration state is read', (): Promise<ServiceWorkerState | null> => serviceWorkerState(page));

  await test.step('THEN the worker is active', (): void => expect(state?.active).toBe(true));

  await test.step('AND the scope covers the current url', (): void => expect(state?.scope).toContain(page.url()));
});
```

### Service Worker Context

`context.serviceWorkers()` lists workers already running; `context.waitForEvent('serviceworker')` waits for the next one. `activeServiceWorker` (above) picks whichever applies, and the `serviceWorker` fixture starts the wait before navigating so no registration is missed.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: the registered worker script is sw.js', async ({ serviceWorker }): Promise<void> => {
  const url = await test.step('WHEN the worker url is read', (): string => serviceWorker.url());

  await test.step('THEN the url ends in sw.js', (): void => expect(url).toContain('sw.js'));
});
```

## Registration & Lifecycle

### Testing SW Update Flow

Serve a new worker script, call `registration.update()`, wait for a `waiting` worker, post `SKIP_WAITING`, and wait for `controllerchange`. `expect.poll` replaces the `updatefound` listener plus timeout, and the route mock replaces the "if an update exists" branch: the test creates the update it asserts on.

```ts
// e2e/pwa/test/mocks/service-worker.mock.ts
import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

export const serviceWorkerMock = (version: string): RouteHandler => {
  const body = `
    const VERSION = '${version}';
    self.addEventListener('install', (event) => {
      event.waitUntil(caches.open('app-cache-' + VERSION));
      self.skipWaiting();
    });
  `;

  return (route: Route): Promise<void> => route.fulfill({ body, contentType: 'application/javascript' });
};
```

```ts
// e2e/pwa/test/utils/service-worker-update.spec.util.ts
import type { Page } from '@playwright/test';

const readUpdate = async (): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;

  await registration.update();
};

const readHasWaiting = async (): Promise<boolean> => {
  const registration = await navigator.serviceWorker.ready;

  return registration.waiting !== null;
};

const readSkipWaiting = async (): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;

  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
};

const readControllerChange = (): Promise<void> => {
  return new Promise((resolve: () => void): void => {
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
  });
};

export const updateServiceWorker = (page: Page): Promise<void> => page.evaluate(readUpdate);

export const hasWaitingWorker = (page: Page): Promise<boolean> => page.evaluate(readHasWaiting);

export const skipWaiting = (page: Page): Promise<void> => page.evaluate(readSkipWaiting);

export const waitForControllerChange = (page: Page): Promise<void> => page.evaluate(readControllerChange);
```

```ts
// e2e/pwa/pwa.spec.ts
test.describe('GIVEN a new worker version is served', () => {
  test.beforeEach(async ({ page, pwaPage }): Promise<void> => {
    await test.step('GIVEN the app is open', (): Promise<void> => pwaPage.goto());

    await test.step('AND worker v2 is served', async (): Promise<void> => {
      await page.route('**/sw.js', serviceWorkerMock('v2'));
    });
  });

  test('SCENARIO: a registration update lets the new worker take control', async ({ page }): Promise<void> => {
    await test.step('WHEN an update check is triggered', (): Promise<void> => updateServiceWorker(page));

    await test.step('THEN a worker is waiting', (): Promise<void> => expect.poll((): Promise<boolean> => hasWaitingWorker(page)).toBe(true));

    await test.step('AND the waiting worker is told to skip waiting', (): Promise<void> => skipWaiting(page));

    await test.step('AND the controller changes', (): Promise<void> => waitForControllerChange(page));
  });
});
```

### Testing SW Installation

`worker.evaluate` runs inside the worker scope. `serviceWorkerVersion` (in `service-worker.spec.util.ts` above) reads `SW_VERSION` from `self` through the optional `SwGlobals` type.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: the installed worker reports its version', async ({ serviceWorker }): Promise<void> => {
  const version = await test.step('WHEN the worker version is read', (): Promise<string> => serviceWorkerVersion(serviceWorker));

  await test.step('THEN the version is 1.0.0', (): void => expect(version).toBe('1.0.0'));
});
```

### Unregistering Service Workers

Unregister every worker and delete every cache before each test so tests do not share worker state. `resetServiceWorkers` does both; the `beforeEach` calls it as one step.

```ts
// e2e/pwa/test/utils/service-worker-reset.spec.util.ts
import type { Page } from '@playwright/test';

const readReset = async (): Promise<void> => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const cacheNames = await caches.keys();

  await Promise.all(registrations.map((registration: ServiceWorkerRegistration): Promise<boolean> => registration.unregister()));
  await Promise.all(cacheNames.map((name: string): Promise<boolean> => caches.delete(name)));
};

export const resetServiceWorkers = (page: Page): Promise<void> => page.evaluate(readReset);
```

```ts
// e2e/pwa/pwa.spec.ts
test.beforeEach(async ({ page, pwaPage }): Promise<void> => {
  await test.step('GIVEN the app is open', (): Promise<void> => pwaPage.goto('/'));

  await test.step('AND workers are unregistered and caches cleared', (): Promise<void> => resetServiceWorkers(page));
});
```

## Cache Testing

### Verifying Cached Resources

The cache wrappers open a named cache and list its request URLs. `expect.poll` on the list length replaces a fixed wait for the worker to finish caching.

```ts
// e2e/pwa/test/utils/cache.spec.util.ts
import type { Page } from '@playwright/test';

const readCachedUrls = async (cacheName: string): Promise<string[]> => {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();

  return requests.map((request: Request): string => request.url);
};

const readHasCache = (cacheName: string): Promise<boolean> => caches.has(cacheName);

const readBodyFontFamily = (): string => {
  const styles = window.getComputedStyle(document.body);

  return styles.fontFamily;
};

export const cachedUrls = (page: Page, cacheName: string): Promise<string[]> => page.evaluate(readCachedUrls, cacheName);

export const hasCache = (page: Page, cacheName: string): Promise<boolean> => page.evaluate(readHasCache, cacheName);

export const bodyFontFamily = (page: Page): Promise<string> => page.evaluate(readBodyFontFamily);
```

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: worker activation caches the app assets', async ({ page }): Promise<void> => {
  await test.step('THEN the cache is populated', (): Promise<void> => expect.poll((): Promise<number> => cachedUrls(page, 'app-cache-v1').then((urls: string[]): number => urls.length)).toBeGreaterThan(0));

  const urls = await test.step('WHEN the cached urls are read', (): Promise<string[]> => cachedUrls(page, 'app-cache-v1'));

  await test.step('THEN the stylesheet is cached', (): void => expect(urls).toContainEqual(expect.stringContaining('/styles.css')));

  await test.step('AND the app bundle is cached', (): void => expect(urls).toContainEqual(expect.stringContaining('/app.js')));
});
```

### Testing Cache Strategies

To prove a cache-first strategy, abort the network request for a cached asset, reload, and assert the asset still applied. `abortMock` is a one-line route factory in `test/mocks/abort.mock.ts` returning `(route: Route): Promise<void> => route.abort()`.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: a blocked stylesheet request still applies the cached stylesheet', async ({ page, pwaPage }): Promise<void> => {
  await test.step('THEN the cache is populated', (): Promise<void> => expect.poll((): Promise<number> => cachedUrls(page, 'app-cache-v1').then((urls: string[]): number => urls.length)).toBeGreaterThan(0));

  await test.step('WHEN the stylesheet is blocked on the network', async (): Promise<void> => {
    await page.route('**/styles.css', abortMock());
  });

  await test.step('AND the app is reloaded', (): Promise<void> => pwaPage.reload());

  await test.step('THEN the body keeps its font family', (): Promise<void> => expect.poll((): Promise<string> => bodyFontFamily(page)).not.toBe(''));
});
```

### Testing Cache Updates

Serving `serviceWorkerMock('v2')` (above) and triggering an update creates `app-cache-v2`. `expect.poll` on `hasCache` replaces `waitForFunction`.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: installing worker v2 creates the v2 cache', async ({ page }): Promise<void> => {
  await test.step('WHEN worker v2 is served', async (): Promise<void> => {
    await page.route('**/sw.js', serviceWorkerMock('v2'));
  });

  await test.step('AND an update check is triggered', (): Promise<void> => updateServiceWorker(page));

  await test.step('THEN the v2 cache exists', (): Promise<void> => expect.poll((): Promise<boolean> => hasCache(page, 'app-cache-v2')).toBe(true));
});
```

## Offline Testing

This section covers **offline-first apps (PWAs)** that are designed to work offline using service workers, caching, and background sync. For testing **unexpected network failures** (error recovery, graceful degradation), see [error-testing.md](../debugging/error-testing.md#offline-testing).

### Simulating Offline Mode

`context.setOffline(true)` cuts the network for every page in the context. The cache must be populated before going offline; `expect.poll` on the cached URL count replaces a fixed wait.

```ts
// e2e/pwa/pwa.spec.ts
test.describe('GIVEN the app is cached and the network is off', () => {
  test.beforeEach(async ({ context, page, pwaPage }): Promise<void> => {
    await test.step('GIVEN the app is open', (): Promise<void> => pwaPage.goto());

    await test.step('AND the cache is populated', (): Promise<void> => expect.poll((): Promise<number> => cachedUrls(page, 'app-cache-v1').then((urls: string[]): number => urls.length)).toBeGreaterThan(0));

    await test.step('AND the network goes offline', (): Promise<void> => context.setOffline(true));
  });

  test('SCENARIO: an offline reload shows the cached dashboard with the offline badge', async ({ context, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is reloaded', (): Promise<void> => pwaPage.reload());

    await test.step('THEN the dashboard is shown', (): Promise<void> => pwaPage.expectDashboard());

    await test.step('AND the offline badge is shown', (): Promise<void> => pwaPage.expectOfflineBadge());

    await test.step('AND the network returns', (): Promise<void> => context.setOffline(false));

    await test.step('THEN the offline badge disappears', (): Promise<void> => pwaPage.expectOnline());
  });
});
```

### Testing Offline Fallback

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: an uncached route shows the offline fallback', async ({ pwaPage }): Promise<void> => {
  await test.step('WHEN an uncached page is opened', (): Promise<void> => pwaPage.goto('/uncached-page'));

  await test.step('THEN the offline fallback is shown', (): Promise<void> => pwaPage.expectOfflineFallback());
});
```

### Testing Offline Form Submission

The form is submitted offline, queued, then synced when the network returns. `registerSync` (see [Background Sync](#background-sync)) triggers the sync tag explicitly instead of waiting for the browser's own schedule. The final assertion allows extra time for the sync round trip.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: a message sent offline syncs once the network returns', async ({ context, page, pwaPage }): Promise<void> => {
  await test.step('GIVEN the form is open', (): Promise<void> => pwaPage.goto('/pwa-app/form'));

  await test.step('WHEN the network goes offline', (): Promise<void> => context.setOffline(true));

  await test.step('AND a message is sent', (): Promise<void> => pwaPage.sendMessage('Offline message'));

  await test.step('THEN the message is queued', (): Promise<void> => pwaPage.expectStatus('Queued for sync'));

  await test.step('AND the network returns', (): Promise<void> => context.setOffline(false));

  await test.step('AND the form sync is triggered', (): Promise<void> => registerSync(page, 'form-sync'));

  await test.step('THEN the message is sent', (): Promise<void> => expect(pwaPage.statusText).toHaveText('Message sent', { timeout: 10000 }));
});
```

## Push Notifications

### Mocking Push Subscription

`context.grantPermissions(['notifications'])` lets `pushManager.subscribe` resolve. The wrapper returns `PushSubscriptionJSON` from the DOM lib.

```ts
// e2e/pwa/test/utils/push.spec.util.ts
import type { Page, Worker } from '@playwright/test';

import type { PushPayload } from '../../common/pwa.type';

const readSubscribe = async (): Promise<PushSubscriptionJSON> => {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ applicationServerKey: 'test-key', userVisibleOnly: true });

  return subscription.toJSON();
};

const readShowNotification = async (url: string): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification('Test', { body: 'Click me', data: { url } });
};

const dispatchPush = (payload: PushPayload): void => {
  self.dispatchEvent(new PushEvent('push', { data: JSON.stringify(payload) }));
};

const dispatchNotificationClick = async (): Promise<void> => {
  const [notification] = await self.registration.getNotifications();

  self.dispatchEvent(new NotificationEvent('notificationclick', { notification }));
};

export const subscribeToPush = (page: Page): Promise<PushSubscriptionJSON> => page.evaluate(readSubscribe);

export const showNotification = (page: Page, url: string): Promise<void> => page.evaluate(readShowNotification, url);

export const dispatchPushEvent = (worker: Worker, payload: PushPayload): Promise<void> => worker.evaluate(dispatchPush, payload);

export const clickFirstNotification = (worker: Worker): Promise<void> => worker.evaluate(dispatchNotificationClick);
```

```ts
// e2e/pwa/pwa.spec.ts
test.describe('GIVEN notification permission is granted', () => {
  test.beforeEach(async ({ context, pwaPage }): Promise<void> => {
    await test.step('GIVEN notification permission is granted', (): Promise<void> => context.grantPermissions(['notifications']));

    await test.step('AND the app is open', (): Promise<void> => pwaPage.goto());
  });

  test('SCENARIO: a push subscription has an endpoint', async ({ page }): Promise<void> => {
    const subscription = await test.step('WHEN the app subscribes to push', (): Promise<PushSubscriptionJSON> => subscribeToPush(page));

    await test.step('THEN the subscription has an endpoint', (): void => expect(subscription.endpoint).toBeDefined());
  });
});
```

### Testing Push Message Handling

`PushEvent` accepts a string `data`, so no `PushMessageData` construction is needed. Playwright cannot observe the OS notification the worker shows; assert on what the worker does with the push (a cached record, a `postMessage` to the page, or a `showNotification` call the next sample clicks).

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: the worker handles a push event', async ({ serviceWorker }): Promise<void> => {
  const payload: PushPayload = { body: 'Push message', title: 'Test' };

  await test.step('WHEN a push event is dispatched in the worker', (): Promise<void> => dispatchPushEvent(serviceWorker, payload));
});
```

### Testing Notification Click

The worker's `notificationclick` handler opens the target URL in a new page. `context.waitForEvent('page')` is started in a step before the click and returns the new page; the last step asserts its URL. `page.waitForTimeout` is not needed.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: clicking a notification opens the target page', async ({ context, page, serviceWorker }): Promise<void> => {
  await test.step('WHEN a notification targeting a url is shown', (): Promise<void> => showNotification(page, '/notification-target'));

  const pagePromise = await test.step('AND a new page is awaited', (): Promise<Promise<Page>> => Promise.resolve(context.waitForEvent('page')));

  await test.step('AND the notification is clicked in the worker', (): Promise<void> => clickFirstNotification(serviceWorker));

  const opened = await test.step('AND the new page opens', (): Promise<Page> => pagePromise);

  await test.step('THEN the new page shows the target', (): Promise<void> => expect(opened).toHaveURL(/notification-target/));
});
```

## Background Sync

### Testing Background Sync Registration

The Background Sync API is not in the DOM lib. `SyncRegistration` declares `sync` as optional beside the always-present `scope`, so a `ServiceWorkerRegistration` assigns to it and the wrapper reports `false` when the browser lacks the API. The sync completion flag is written to `document.documentElement.dataset` so no `window` global needs typing.

```ts
// e2e/pwa/test/utils/sync.spec.util.ts
import type { Page } from '@playwright/test';

import type { SyncRegistration } from '../../common/pwa.type';

const readRegisterSync = async (tag: string): Promise<boolean> => {
  const registration: SyncRegistration = await navigator.serviceWorker.ready;

  if (!registration.sync) return false;

  await registration.sync.register(tag);

  return true;
};

const readListenForSyncComplete = (): void => {
  const markComplete = (event: MessageEvent): void => {
    if (event.data.type === 'SYNC_COMPLETE') document.documentElement.dataset.syncCompleted = 'true';
  };

  navigator.serviceWorker.addEventListener('message', markComplete);
};

const readSyncCompleted = (): boolean => {
  return document.documentElement.dataset.syncCompleted === 'true';
};

export const registerSync = async (page: Page, tag: string): Promise<void> => {
  await page.evaluate(readRegisterSync, tag);
};

export const isSyncSupported = (page: Page, tag: string): Promise<boolean> => page.evaluate(readRegisterSync, tag);

export const listenForSyncComplete = (page: Page): Promise<void> => page.evaluate(readListenForSyncComplete);

export const isSyncCompleted = (page: Page): Promise<boolean> => page.evaluate(readSyncCompleted);
```

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: the browser accepts a registered sync tag', async ({ page }): Promise<void> => {
  const supported = await test.step('WHEN a sync tag is registered', (): Promise<boolean> => isSyncSupported(page, 'my-sync'));

  await test.step('THEN background sync is supported', (): void => expect(supported).toBe(true));
});
```

### Testing Sync Event

The app queues its data (IndexedDB or the offline form above) while offline and registers a sync tag. The page listens for the worker's `SYNC_COMPLETE` message before the network returns; `expect.poll` on the flag replaces `waitForFunction`.

```ts
// e2e/pwa/pwa.spec.ts
test('SCENARIO: the queued sync completes once the network returns', async ({ context, page, pwaPage }): Promise<void> => {
  await test.step('GIVEN the form is open', (): Promise<void> => pwaPage.goto('/pwa-app/form'));

  await test.step('WHEN the network goes offline', (): Promise<void> => context.setOffline(true));

  await test.step('AND a message is queued', (): Promise<void> => pwaPage.sendMessage('test'));

  await test.step('AND the data sync tag is registered', (): Promise<void> => registerSync(page, 'data-sync'));

  await test.step('AND sync completion is awaited', (): Promise<void> => listenForSyncComplete(page));

  await test.step('AND the network returns', (): Promise<void> => context.setOffline(false));

  await test.step('THEN the sync completes', (): Promise<void> => expect.poll((): Promise<boolean> => isSyncCompleted(page), { timeout: 10000 }).toBe(true));
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                   | Problem                 | Solution                                     |
| ------------------------------ | ----------------------- | -------------------------------------------- |
| Not clearing SW between tests  | Tests affect each other | Unregister SW in beforeEach                  |
| Not waiting for SW ready       | Race conditions         | Always await `navigator.serviceWorker.ready` |
| Testing in isolation only      | Misses real SW behavior | Test with actual caching                     |
| Hardcoded timeouts for caching | Flaky tests             | `expect.poll` until the cache is populated   |
| Ignoring SW update cycle       | Missing update bugs     | Test install, activate, update flows         |

## Related References

- **Network Failures**: See [error-testing.md](../debugging/error-testing.md#offline-testing) for unexpected network failure patterns
- **Browser APIs**: See [browser-apis.md](browser-apis.md) for permissions
- **Network Mocking**: See [network-advanced.md](../advanced/network-advanced.md) for network interception
- **Browser Extensions**: See [browser-extensions.md](../testing-patterns/browser-extensions.md) for extension service worker patterns
