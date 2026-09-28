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

export type PwaOptions = {
  readonly notifications?: 'granted';
  readonly path?: string;
};
```

`pwaPage` hands over the page object. `cachedPwaPage` opens the app and waits until the worker has cached it, so an offline test starts from a cached app and its first `WHEN` is the first offline action. No fixture opens the app for the worker-side wrappers: they find the worker through `activeServiceWorker(context)` after the test's own `WHEN` has opened the page.

```ts
// e2e/pwa/pwa.fixture.ts
import { test as base } from '@playwright/test';

import { PwaPage } from './pages/pwa.page';

type PwaFixtures = {
  readonly cachedPwaPage: PwaPage;
  readonly pwaPage: PwaPage;
};

export const test = base.extend<PwaFixtures>({
  cachedPwaPage: async ({ pwaPage }, use): Promise<void> => {
    await pwaPage.goto();
    await pwaPage.expectAppCached();
    await use(pwaPage);
  },
  pwaPage: async ({ page }, use): Promise<void> => {
    await use(new PwaPage(page));
  }
});

export { expect } from '@playwright/test';
```

`goto(options)` grants notifications before it navigates when `notifications: 'granted'` is set, then opens `path` (default `/pwa-app`); that option check is the page object's only branch. `expectAppCached()` polls the `app-cache-v1` URLs until the list is not empty. The other `expect*` methods hold one plain assertion each: `expectDashboard()` on the heading, `expectOfflineBadge()` and `expectOnline()` on the badge visible or hidden, and `expectStatus(text)` on the status text.

```ts
// e2e/pwa/pages/pwa.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { PwaOptions } from '../common/pwa.type';
import { cachedUrls } from '../test/utils/cache.spec.util';

export class PwaPage {
  public readonly heading: Locator;
  public readonly messageInput: Locator;
  public readonly offlineBadge: Locator;
  public readonly offlineMessage: Locator;
  public readonly retryButton: Locator;
  public readonly sendButton: Locator;
  public readonly statusText: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.messageInput = page.getByLabel('Message');
    this.offlineBadge = page.getByTestId('offline-badge');
    this.offlineMessage = page.getByText('You are offline');
    this.retryButton = page.getByRole('button', { name: 'Retry' });
    this.sendButton = page.getByRole('button', { name: 'Send' });
    this.statusText = page.getByRole('status');
  }

  public async goto(options: PwaOptions = {}): Promise<void> {
    if (options.notifications === 'granted') await this.page.context().grantPermissions(['notifications']);
    await this.page.goto(options.path ?? '/pwa-app');
  }

  public async reload(): Promise<void> {
    await this.page.reload();
  }

  public async sendMessage(text: string): Promise<void> {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  public async expectAppCached(): Promise<void> {
    await expect.poll((): Promise<string[]> => cachedUrls(this.page, 'app-cache-v1')).not.toEqual([]);
  }

  public async expectOfflineFallback(): Promise<void> {
    await expect(this.offlineMessage).toBeVisible();
    await expect(this.retryButton).toBeVisible();
  }
}
```

### Waiting for Service Worker Registration

`navigator.serviceWorker.ready` resolves once a worker is active. The wrapper returns a boolean, and the spec polls it inside its `THEN`, so the check reads what it asserts. `activeServiceWorker` returns the worker the context already runs, or waits for the next one; the worker-side wrappers call it, so a test opens the app in its `WHEN` and reads the worker in its `THEN`.

```ts
// e2e/pwa/test/utils/service-worker.spec.util.ts
import type { BrowserContext, Page, Worker } from '@playwright/test';

import type { SwGlobals } from '../../common/pwa.type';

const readActive = async (): Promise<boolean> => {
  const isSupported = 'serviceWorker' in navigator;

  if (!isSupported) return false;

  const registration = await navigator.serviceWorker.ready;

  return registration.active !== null;
};

const readVersion = (): string => {
  const scope: SwGlobals = self;

  return scope.SW_VERSION ?? 'unknown';
};

export const activeServiceWorker = (context: BrowserContext): Promise<Worker> => {
  const [worker] = context.serviceWorkers();

  if (worker) return Promise.resolve(worker);

  return context.waitForEvent('serviceworker');
};

export const isServiceWorkerActive = (page: Page): Promise<boolean> => page.evaluate(readActive);

export const serviceWorkerUrl = async (context: BrowserContext): Promise<string> => {
  const worker = await activeServiceWorker(context);

  return worker.url();
};

export const serviceWorkerVersion = async (context: BrowserContext): Promise<string> => {
  const worker = await activeServiceWorker(context);

  return worker.evaluate(readVersion);
};
```

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { isServiceWorkerActive } from './test/utils/service-worker.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a first visit, loading the app activates a service worker', async ({ page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    await test.step('THEN a worker is active', (): Promise<void> => expect.poll((): Promise<boolean> => isServiceWorkerActive(page)).toBe(true));
  });
});
```

### Getting Service Worker State

`expectActiveRegistration` waits for `navigator.serviceWorker.ready`, maps the registration to a plain `ServiceWorkerState`, and asserts on its named fields: the worker is active and the page URL sits inside the registration scope. Reading through `getRegistration()` instead can return a registration that has no active worker yet.

```ts
// e2e/pwa/test/utils/registration.spec.util.ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { ServiceWorkerState } from '../../common/pwa.type';

const readState = async (): Promise<ServiceWorkerState> => {
  const registration = await navigator.serviceWorker.ready;
  const state: ServiceWorkerState = {
    active: registration.active !== null,
    installing: registration.installing !== null,
    scope: registration.scope,
    waiting: registration.waiting !== null
  };

  return state;
};

export const expectActiveRegistration = async (page: Page): Promise<void> => {
  const state = await page.evaluate(readState);

  expect(state.active).toBe(true);
  expect(page.url()).toContain(state.scope);
};
```

```ts
// e2e/pwa/pwa.e2e.ts
import { test } from './pwa.fixture';
import { expectActiveRegistration } from './test/utils/registration.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a first visit, the registration is active and its scope covers the app', async ({ page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    await test.step('THEN the registration is active and its scope covers the page', (): Promise<void> => expectActiveRegistration(page));
  });
});
```

### Service Worker Context

`context.serviceWorkers()` lists workers already running; `context.waitForEvent('serviceworker')` waits for the next one. `activeServiceWorker` (above) checks the list first and registers the wait in the same tick, so a worker that registered during `goto` is found and one still registering is caught by the event.

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { serviceWorkerUrl } from './test/utils/service-worker.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a first visit, the registered worker runs sw.js', async ({ context, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    await test.step('THEN the worker script is sw.js', (): Promise<void> => expect.poll((): Promise<string> => serviceWorkerUrl(context)).toContain('sw.js'));
  });
});
```

## Registration & Lifecycle

### Testing SW Update Flow

Register a new worker version, wait for a `waiting` worker, post `SKIP_WAITING`, and wait for `controllerchange`. `expect.poll` replaces the `updatefound` listener plus timeout, and the test creates the update it asserts on.

A route cannot serve the new version: neither `page.route` nor `context.route` sees the browser's fetch of a worker script (checked on Chromium 141: zero hits, the worker stayed on v1). The app's worker reads its version from its own script URL instead: `const VERSION = new URL(self.location.href).searchParams.get('version') ?? 'v1';`. It opens `app-cache-<VERSION>` on install, never calls `skipWaiting()` on its own, and calls it only when the page posts `SKIP_WAITING`. So `publishWorker(page, version)` registers `/sw.js?version=<version>` in one call: the new script URL makes the browser install that version as the waiting worker.

Worker v2 must be registered after v1 is active, or there is nothing to update. So publishing v2 is a new `WHEN` after the check that v1 is active, not an option on the opening call.

`activateWaitingWorker` adds the `controllerchange` listener before it posts `SKIP_WAITING`, inside one browser call, so the change cannot fire before anything listens. The listener writes a flag to `document.documentElement.dataset`, and the `THEN` polls it.

```ts
// e2e/pwa/test/utils/service-worker-update.spec.util.ts
import type { Page } from '@playwright/test';

const registerVersion = async (version: string): Promise<void> => {
  await navigator.serviceWorker.register(`/sw.js?version=${version}`);
};

const readHasWaiting = async (): Promise<boolean> => {
  const registration = await navigator.serviceWorker.ready;

  return registration.waiting !== null;
};

const postSkipWaiting = async (): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;
  const markChanged = (): void => {
    document.documentElement.dataset.controllerChanged = 'true';
  };

  navigator.serviceWorker.addEventListener('controllerchange', markChanged, { once: true });
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
};

const readControllerChanged = (): boolean => document.documentElement.dataset.controllerChanged === 'true';

export const publishWorker = (page: Page, version: string): Promise<void> => page.evaluate(registerVersion, version);

export const hasWaitingWorker = (page: Page): Promise<boolean> => page.evaluate(readHasWaiting);

export const activateWaitingWorker = (page: Page): Promise<void> => page.evaluate(postSkipWaiting);

export const hasControllerChanged = (page: Page): Promise<boolean> => page.evaluate(readControllerChanged);
```

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { activateWaitingWorker, hasControllerChanged, hasWaitingWorker, publishWorker } from './test/utils/service-worker-update.spec.util';
import { isServiceWorkerActive } from './test/utils/service-worker.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN an active v1 worker, activating a published v2 hands it control', async ({ page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    await test.step('THEN worker v1 is active', (): Promise<void> => expect.poll((): Promise<boolean> => isServiceWorkerActive(page)).toBe(true));

    await test.step('WHEN worker v2 is published', (): Promise<void> => publishWorker(page, 'v2'));

    await test.step('THEN worker v2 is waiting', (): Promise<void> => expect.poll((): Promise<boolean> => hasWaitingWorker(page)).toBe(true));

    await test.step('WHEN the waiting worker is told to skip waiting', (): Promise<void> => activateWaitingWorker(page));

    await test.step('THEN the controller changes to worker v2', (): Promise<void> => expect.poll((): Promise<boolean> => hasControllerChanged(page)).toBe(true));
  });
});
```

### Testing SW Installation

`worker.evaluate` runs inside the worker scope. `serviceWorkerVersion` (in `service-worker.spec.util.ts` above) finds the worker through `activeServiceWorker(context)` and reads `SW_VERSION` from `self` through the optional `SwGlobals` type.

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { serviceWorkerVersion } from './test/utils/service-worker.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a first visit, the installed worker reports version 1.0.0', async ({ context, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    await test.step('THEN the worker version is 1.0.0', (): Promise<void> => expect.poll((): Promise<string> => serviceWorkerVersion(context)).toBe('1.0.0'));
  });
});
```

### Unregistering Service Workers

Playwright gives each test a fresh browser context, and a fresh context starts with no registrations and no caches, so tests do not share worker state by default. `resetServiceWorkers` unregisters every worker and deletes every cache; it matters only when a context outlives one test (a persistent context, or a worker-scoped context fixture). Call it in that fixture after it opens a page and before `use`, so no hook and no step does the reset.

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

## Cache Testing

### Verifying Cached Resources

The cache wrappers open a named cache and list its request URLs. `expect.poll` on the list replaces a fixed wait for the worker to finish caching; each `THEN` polls the list it asserts on.

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
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { cachedUrls } from './test/utils/cache.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a first visit, the worker caches the app assets', async ({ page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    await test.step('THEN the cache is populated', (): Promise<void> => pwaPage.expectAppCached());

    await test.step('AND the stylesheet is cached', (): Promise<void> => expect.poll((): Promise<string[]> => cachedUrls(page, 'app-cache-v1')).toContainEqual(expect.stringContaining('/styles.css')));

    await test.step('AND the app bundle is cached', (): Promise<void> => expect.poll((): Promise<string[]> => cachedUrls(page, 'app-cache-v1')).toContainEqual(expect.stringContaining('/app.js')));
  });
});
```

### Testing Cache Strategies

To prove a cache-first strategy, go offline and reload: the stylesheet can then only come from the worker's cache. A route cannot stand in for offline here, because Playwright routes never see a request the worker answers. `styles.css` sets `body { font-family: 'App Sans', sans-serif; }`, so without the cached stylesheet the default font shows and the check fails. The test starts from `cachedPwaPage`, which waits until the worker has cached the stylesheet.

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { bodyFontFamily } from './test/utils/cache.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a cached app, an offline reload keeps the cached styles', async ({ cachedPwaPage, context, page }): Promise<void> => {
    await test.step('WHEN the network goes offline', (): Promise<void> => context.setOffline(true));

    await test.step('AND the app is reloaded', (): Promise<void> => cachedPwaPage.reload());

    await test.step('THEN the body uses the app font', (): Promise<void> => expect.poll((): Promise<string> => bodyFontFamily(page)).toContain('App Sans'));
  });
});
```

### Testing Cache Updates

Publishing worker v2 with `publishWorker` (above) creates `app-cache-v2` when v2 installs. `expect.poll` on `hasCache` replaces `waitForFunction`.

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { hasCache } from './test/utils/cache.spec.util';
import { publishWorker } from './test/utils/service-worker-update.spec.util';
import { isServiceWorkerActive } from './test/utils/service-worker.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN an active v1 worker, publishing v2 creates the v2 cache', async ({ page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    await test.step('THEN worker v1 is active', (): Promise<void> => expect.poll((): Promise<boolean> => isServiceWorkerActive(page)).toBe(true));

    await test.step('WHEN worker v2 is published', (): Promise<void> => publishWorker(page, 'v2'));

    await test.step('THEN the v2 cache exists', (): Promise<void> => expect.poll((): Promise<boolean> => hasCache(page, 'app-cache-v2')).toBe(true));
  });
});
```

## Offline Testing

This section covers **offline-first apps (PWAs)** that are designed to work offline using service workers, caching, and background sync. For testing **unexpected network failures** (error recovery, graceful degradation), see [error-testing.md](../debugging/error-testing.md#offline-testing).

### Simulating Offline Mode

`context.setOffline(true)` cuts the network for every page in the context. The cache must be populated before going offline, so these tests start from `cachedPwaPage`, which opens the app and polls the cache before `use`. Going offline is then the first `WHEN`; the network returning after a check starts the next phase.

```ts
// e2e/pwa/pwa.e2e.ts
import { test } from './pwa.fixture';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a cached app, reloading offline shows the dashboard with the offline badge', async ({ cachedPwaPage, context }): Promise<void> => {
    await test.step('WHEN the network goes offline', (): Promise<void> => context.setOffline(true));

    await test.step('AND the app is reloaded', (): Promise<void> => cachedPwaPage.reload());

    await test.step('THEN the dashboard is shown', (): Promise<void> => cachedPwaPage.expectDashboard());

    await test.step('AND the offline badge is shown', (): Promise<void> => cachedPwaPage.expectOfflineBadge());

    await test.step('WHEN the network returns', (): Promise<void> => context.setOffline(false));

    await test.step('THEN the offline badge disappears', (): Promise<void> => cachedPwaPage.expectOnline());
  });
});
```

### Testing Offline Fallback

The fallback is the worker's answer to a navigation it has not cached, so the test also starts from `cachedPwaPage`: the worker is installed before the network goes away.

```ts
// e2e/pwa/pwa.e2e.ts
import { test } from './pwa.fixture';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a cached app, opening an uncached route offline shows the offline fallback', async ({ cachedPwaPage, context }): Promise<void> => {
    await test.step('WHEN the network goes offline', (): Promise<void> => context.setOffline(true));

    await test.step('AND an uncached page is opened', (): Promise<void> => cachedPwaPage.goto({ path: '/uncached-page' }));

    await test.step('THEN the offline fallback offers a retry', (): Promise<void> => cachedPwaPage.expectOfflineFallback());
  });
});
```

### Testing Offline Form Submission

The form is submitted offline, queued, then synced when the network returns. `registerSync` (see [Background Sync](#background-sync)) triggers the sync tag explicitly instead of waiting for the browser's own schedule. The network returning after the queued check starts a new phase. The final assertion allows extra time for the sync round trip.

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { registerSync } from './test/utils/sync.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN an online form, a message sent offline syncs once the network returns', async ({ context, page, pwaPage }): Promise<void> => {
    await test.step('WHEN the form is opened', (): Promise<void> => pwaPage.goto({ path: '/pwa-app/form' }));

    await test.step('AND the network goes offline', (): Promise<void> => context.setOffline(true));

    await test.step('AND a message is sent', (): Promise<void> => pwaPage.sendMessage('Offline message'));

    await test.step('THEN the message is queued', (): Promise<void> => pwaPage.expectStatus('Queued for sync'));

    await test.step('WHEN the network returns', (): Promise<void> => context.setOffline(false));

    await test.step('AND the form sync is triggered', (): Promise<void> => registerSync(page, 'form-sync'));

    await test.step('THEN the message is sent', (): Promise<void> => expect(pwaPage.statusText).toHaveText('Message sent', { timeout: 10000 }));
  });
});
```

## Push Notifications

### Mocking Push Subscription

`context.grantPermissions(['notifications'])` lets `pushManager.subscribe` and `showNotification` resolve. `pwaPage.goto({ notifications: 'granted' })` grants it before it navigates, the same opening-call option as `alertsPage.goto({ notifications: 'granted' })` in [browser-apis.md](browser-apis.md#permissions). The page-side wrappers return DOM-lib types (`PushSubscriptionJSON`, notification titles); the worker-side wrappers find the worker through `activeServiceWorker(context)`. `clickFirstNotification` starts `context.waitForEvent('page')` before it dispatches the click and returns the page it opened, so the wait cannot miss the page and no step holds a pending promise.

```ts
// e2e/pwa/test/utils/push.spec.util.ts
import type { BrowserContext, Page } from '@playwright/test';

import type { PushPayload } from '../../common/pwa.type';
import { activeServiceWorker } from './service-worker.spec.util';

const readSubscribe = async (): Promise<PushSubscriptionJSON> => {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ applicationServerKey: 'test-key', userVisibleOnly: true });

  return subscription.toJSON();
};

const readShowNotification = async (url: string): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification('Test', { body: 'Click me', data: { url } });
};

const readNotificationTitles = async (): Promise<string[]> => {
  const registration = await navigator.serviceWorker.ready;
  const notifications = await registration.getNotifications();

  return notifications.map((notification: Notification): string => notification.title);
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

export const shownNotificationTitles = (page: Page): Promise<string[]> => page.evaluate(readNotificationTitles);

export const dispatchPushEvent = async (context: BrowserContext, payload: PushPayload): Promise<void> => {
  const worker = await activeServiceWorker(context);

  await worker.evaluate(dispatchPush, payload);
};

export const clickFirstNotification = async (context: BrowserContext): Promise<Page> => {
  const worker = await activeServiceWorker(context);
  const pagePromise = context.waitForEvent('page');

  await worker.evaluate(dispatchNotificationClick);

  return pagePromise;
};
```

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { subscribeToPush } from './test/utils/push.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN granted notifications, subscribing to push returns an endpoint', async ({ page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto({ notifications: 'granted' }));

    const subscription = await test.step('AND the app subscribes to push', (): Promise<PushSubscriptionJSON> => subscribeToPush(page));

    await test.step('THEN the subscription has an endpoint', (): void => expect(subscription.endpoint).toBeDefined());
  });
});
```

### Testing Push Message Handling

`PushEvent` accepts a string `data`, so no `PushMessageData` construction is needed. Playwright cannot observe the OS notification the worker shows; assert on what the worker does with the push. Here the worker shows a notification titled from the payload, so the `THEN` polls `registration.getNotifications()` for that title. A worker that caches a record or posts to the page gets the same shape with a different wrapper.

```ts
// e2e/pwa/pwa.e2e.ts
import type { PushPayload } from './common/pwa.type';
import { expect, test } from './pwa.fixture';
import { dispatchPushEvent, shownNotificationTitles } from './test/utils/push.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN granted notifications, a push event shows its notification', async ({ context, page, pwaPage }): Promise<void> => {
    const payload: PushPayload = { body: 'Push message', title: 'Test' };

    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto({ notifications: 'granted' }));

    await test.step('AND a push event is dispatched in the worker', (): Promise<void> => dispatchPushEvent(context, payload));

    await test.step('THEN the worker shows the pushed notification', (): Promise<void> => expect.poll((): Promise<string[]> => shownNotificationTitles(page)).toContain(payload.title));
  });
});
```

### Testing Notification Click

The worker's `notificationclick` handler opens the target URL in a new page. The click step returns that page, and the last step asserts its URL. `page.waitForTimeout` is not needed.

```ts
// e2e/pwa/pwa.e2e.ts
import type { Page } from '@playwright/test';

import { expect, test } from './pwa.fixture';
import { clickFirstNotification, showNotification } from './test/utils/push.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN granted notifications, clicking a shown notification opens its target page', async ({ context, page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto({ notifications: 'granted' }));

    await test.step('AND a notification targeting a url is shown', (): Promise<void> => showNotification(page, '/notification-target'));

    const opened = await test.step('AND the notification is clicked in the worker', (): Promise<Page> => clickFirstNotification(context));

    await test.step('THEN the new page shows the target', (): Promise<void> => expect(opened).toHaveURL(/notification-target/));
  });
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
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { isSyncSupported } from './test/utils/sync.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN a first visit, registering a sync tag reports background sync support', async ({ page, pwaPage }): Promise<void> => {
    await test.step('WHEN the app is opened', (): Promise<void> => pwaPage.goto());

    const supported = await test.step('AND a sync tag is registered', (): Promise<boolean> => isSyncSupported(page, 'my-sync'));

    await test.step('THEN background sync is supported', (): void => expect(supported).toBe(true));
  });
});
```

### Testing Sync Event

The app queues its data (IndexedDB or the offline form above) while offline and registers a sync tag. The page listens for the worker's `SYNC_COMPLETE` message before the network returns; `expect.poll` on the flag replaces `waitForFunction`.

```ts
// e2e/pwa/pwa.e2e.ts
import { expect, test } from './pwa.fixture';
import { isSyncCompleted, listenForSyncComplete, registerSync } from './test/utils/sync.spec.util';

test.describe('FEATURE: pwa service worker', () => {
  test('GIVEN an online form, a sync registered offline completes once the network returns', async ({ context, page, pwaPage }): Promise<void> => {
    await test.step('WHEN the form is opened', (): Promise<void> => pwaPage.goto({ path: '/pwa-app/form' }));

    await test.step('AND the network goes offline', (): Promise<void> => context.setOffline(true));

    await test.step('AND a message is queued', (): Promise<void> => pwaPage.sendMessage('test'));

    await test.step('AND the data sync tag is registered', (): Promise<void> => registerSync(page, 'data-sync'));

    await test.step('AND the page listens for sync completion', (): Promise<void> => listenForSyncComplete(page));

    await test.step('AND the network returns', (): Promise<void> => context.setOffline(false));

    await test.step('THEN the sync completes', (): Promise<void> => expect.poll((): Promise<boolean> => isSyncCompleted(page), { timeout: 10000 }).toBe(true));
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                   | Problem                 | Solution                                     |
| ------------------------------ | ----------------------- | -------------------------------------------- |
| Sharing one context across tests | Workers and caches leak between tests | Keep the fresh context per test; call `resetServiceWorkers` in a fixture that shares one |
| Not waiting for SW ready       | Race conditions         | Always await `navigator.serviceWorker.ready` |
| Testing in isolation only      | Misses real SW behavior | Test with actual caching                     |
| Hardcoded timeouts for caching | Flaky tests             | `expect.poll` until the cache is populated   |
| Ignoring SW update cycle       | Missing update bugs     | Test install, activate, update flows         |

## Related References

- **Network Failures**: See [error-testing.md](../debugging/error-testing.md#offline-testing) for unexpected network failure patterns
- **Browser APIs**: See [browser-apis.md](browser-apis.md) for permissions
- **Network Mocking**: See [network-advanced.md](../advanced/network-advanced.md) for network interception
- **Browser Extensions**: See [browser-extensions.md](../testing-patterns/browser-extensions.md) for extension service worker patterns
