# Browser APIs: Geolocation, Permissions & More

## Table of Contents

1. [Geolocation](#geolocation)
2. [Permissions](#permissions)
3. [Clipboard](#clipboard)
4. [Notifications](#notifications)
5. [Camera & Microphone](#camera--microphone)

Each section is its own feature (`store-finder`, `alerts`, `share`, `video-call`). Browser-side code (`page.evaluate`, `page.addInitScript`) is self-contained, because Playwright serialises the function, and lives in a `test/mocks/` factory or a `test/utils/*.spec.util.ts` wrapper that returns a typed value. Fake browser globals are installed with `Object.defineProperty`, so no `window as any` cast is needed.

## Geolocation

`context.grantPermissions(['geolocation'])` plus `context.setGeolocation(coords)` gives the page a deterministic position. The fixture wraps both in a `setLocation` function so a spec step stays one call; `accuracy` defaults to 100 metres.

```ts
// e2e/store-finder/common/store-finder.type.ts
export type Coordinates = {
  readonly accuracy?: number;
  readonly latitude: number;
  readonly longitude: number;
};

export type SetLocation = (coords: Coordinates) => Promise<void>;

export type StoreFinderOptions = {
  readonly geolocation?: 'denied';
  readonly location?: Coordinates;
};
```

`test/stubs/coordinates.stub.ts` exports `SAN_FRANCISCO_STUB` (`37.7749, -122.4194`) and `OAKLAND_STUB` (`37.8044, -122.2712`) as `Coordinates`.

```ts
// e2e/store-finder/store-finder.fixture.ts
import { test as base } from '@playwright/test';

import type { Coordinates, SetLocation } from './common/store-finder.type';
import { StoreFinderPage } from './pages/store-finder.page';

type StoreFinderFixtures = {
  readonly setLocation: SetLocation;
  readonly storeFinderPage: StoreFinderPage;
};

export const test = base.extend<StoreFinderFixtures>({
  setLocation: async ({ context }, use): Promise<void> => {
    await context.grantPermissions(['geolocation']);

    const setLocation = async (coords: Coordinates): Promise<void> => {
      const geolocation: Coordinates = { ...coords, accuracy: coords.accuracy ?? 100 };

      await context.setGeolocation(geolocation);
    };

    await use(setLocation);
  },
  storeFinderPage: async ({ page }, use): Promise<void> => {
    await use(new StoreFinderPage(page));
  }
});

export { expect } from '@playwright/test';
```

`StoreFinderPage` has `goto()`, `findNearby()`, `startTracking()`, `refreshPosition()`, and the `expect*` methods `expectStoresIn(city)`, `expectLocation(fragment)` (`toContainText` on `getByTestId('location')`), and `expectDeniedFallback()` (denied text and ZIP input visible). `refreshPosition` is `page.evaluate` of a module-level `(): void => navigator.geolocation.getCurrentPosition((): void => undefined)`, so an app that only reads once picks up a changed `setGeolocation` value.

`goto(options: StoreFinderOptions = {})` applies the state before it navigates: `location` grants geolocation and calls `setGeolocation` on `this.page.context()`, and `geolocation: 'denied'` calls `context().clearPermissions()`, so the browser reports the permission as denied. Permissions change at runtime, so this is an option on the opening call, not a `test.use`; `browser.newContext({ permissions: [] })` does the same for a hand-built context. Moving to Oakland happens after the page is open, so it stays an `AND` action step through the `setLocation` fixture.

```ts
// e2e/store-finder/store-finder.e2e.ts
import { test } from './store-finder.fixture';
import { OAKLAND_STUB, SAN_FRANCISCO_STUB } from './test/stubs/coordinates.stub';

test.describe('FEATURE: store finder', () => {
  test('GIVEN granted geolocation, a location change shows the new position in the tracker', async ({ setLocation, storeFinderPage }): Promise<void> => {
    await test.step('WHEN the store finder is opened', (): Promise<void> => storeFinderPage.goto({ location: SAN_FRANCISCO_STUB }));

    await test.step('AND tracking is started', (): Promise<void> => storeFinderPage.startTracking());

    await test.step('THEN the tracker shows the initial latitude', (): Promise<void> => storeFinderPage.expectLocation('37.7749'));

    await test.step('AND the location moves to Oakland', (): Promise<void> => setLocation(OAKLAND_STUB));

    await test.step('AND a fresh position is requested', (): Promise<void> => storeFinderPage.refreshPosition());

    await test.step('THEN the tracker shows the new latitude', (): Promise<void> => storeFinderPage.expectLocation('37.8044'));
  });

  test('GIVEN denied geolocation, the store finder shows the ZIP fallback', async ({ storeFinderPage }): Promise<void> => {
    await test.step('WHEN the store finder is opened', (): Promise<void> => storeFinderPage.goto({ geolocation: 'denied' }));

    await test.step('AND nearby stores are requested', (): Promise<void> => storeFinderPage.findNearby());

    await test.step('THEN the denied message and ZIP input are shown', (): Promise<void> => storeFinderPage.expectDeniedFallback());
  });
});
```

The granted case with one position is `goto({ location: SAN_FRANCISCO_STUB })`, `findNearby()`, then `expectStoresIn('San Francisco')`. Permission-state options:

| Goal | Setup |
|---|---|
| Grant for the whole project | `use: { geolocation, permissions: ['geolocation'] }` in a project config |
| Grant per scenario | `context.grantPermissions(['geolocation'])` in a fixture or the opening call's option |
| Deny per scenario | `context.clearPermissions()` in the opening call's option, `goto({ geolocation: 'denied' })` |
| Deny in a hand-built context | `browser.newContext({ permissions: [] })`, then `context.close()` in teardown |

## Permissions

The `alerts` feature reads permission state through two wrappers so spec steps return typed values. `PermissionName` is the DOM lib union, so `navigator.permissions.query` needs no cast.

```ts
// e2e/alerts/test/utils/permissions.spec.util.ts
import type { Page } from '@playwright/test';

const readNotificationPermission = (): NotificationPermission => Notification.permission;

const readPermissionState = async (name: PermissionName): Promise<PermissionState> => {
  const status = await navigator.permissions.query({ name });

  return status.state;
};

export const notificationPermission = (page: Page): Promise<NotificationPermission> => page.evaluate(readNotificationPermission);

export const permissionState = (page: Page, name: PermissionName): Promise<PermissionState> => page.evaluate(readPermissionState, name);
```

`AlertsPage` has `goto(options: AlertsOptions = {})`, `enableNotifications()`, `notifyMe()`, and `expectPermissionHint()` on `getByText('Please enable notifications')`. `AlertsOptions` is `type AlertsOptions = { readonly notifications?: 'denied' | 'granted' }` in `common/alerts.type.ts`; `goto` applies it to `this.page.context()` before it navigates.

`context.grantPermissions` takes an array, so `notifications: 'granted'` grants camera, microphone, and notifications in one call. `notifications: 'denied'` calls `context.clearPermissions()`; the denied scenario then clicks the enable button and asserts the hint.

| Read | Step |
|---|---|
| `Notification.permission` | `(): Promise<NotificationPermission> => notificationPermission(page)` |
| Permissions API | `(): Promise<PermissionState> => permissionState(page, 'notifications')` |

```ts
// e2e/alerts/permissions.e2e.ts
import { expect, test } from './alerts.fixture';
import { permissionState } from './test/utils/permissions.spec.util';

test.describe('FEATURE: alert permissions', () => {
  test('GIVEN granted notification permission, the permissions API reports it granted', async ({ alertsPage, page }): Promise<void> => {
    await test.step('WHEN the alerts page is opened', (): Promise<void> => alertsPage.goto({ notifications: 'granted' }));

    const state = await test.step('AND the notifications permission is queried', (): Promise<PermissionState> => permissionState(page, 'notifications'));

    await test.step('THEN the state is granted', (): void => expect(state).toBe('granted'));
  });

  test('GIVEN denied notifications, enabling them shows the permission hint', async ({ alertsPage }): Promise<void> => {
    await test.step('WHEN the alerts page is opened', (): Promise<void> => alertsPage.goto({ notifications: 'denied' }));

    await test.step('AND notifications are enabled', (): Promise<void> => alertsPage.enableNotifications());

    await test.step('THEN the permission hint is shown', (): Promise<void> => alertsPage.expectPermissionHint());
  });
});
```

## Clipboard

`clipboard-read` and `clipboard-write` are granted once in the fixture. The fixture value is a named `ClipboardAccess` type, so the spec reads and writes without touching `page.evaluate`.

```ts
// e2e/share/common/share.type.ts
export type ClipboardAccess = {
  readonly read: () => Promise<string>;
  readonly write: (text: string) => Promise<void>;
};
```

```ts
// e2e/share/share.fixture.ts
import { test as base } from '@playwright/test';

import type { ClipboardAccess } from './common/share.type';
import { SharePage } from './pages/share.page';

type ShareFixtures = {
  readonly clipboard: ClipboardAccess;
  readonly sharePage: SharePage;
};

const readClipboard = (): Promise<string> => navigator.clipboard.readText();

const writeClipboard = (text: string): Promise<void> => navigator.clipboard.writeText(text);

export const test = base.extend<ShareFixtures>({
  clipboard: async ({ context, page }, use): Promise<void> => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const clipboard: ClipboardAccess = {
      read: (): Promise<string> => page.evaluate(readClipboard),
      write: (text: string): Promise<void> => page.evaluate(writeClipboard, text)
    };

    await use(clipboard);
  },
  sharePage: async ({ page }, use): Promise<void> => {
    await use(new SharePage(page));
  }
});

export { expect } from '@playwright/test';
```

`SharePage` owns `copyLinkButton` and `noteInput`; `goto()`, `copyLink()`, `pasteIntoNote()` (focus the input, press `Control+V`), and `expectNote(text)` on `toHaveValue`. The copy case reads the clipboard through the fixture and the step returns a `string` the next step asserts on; the paste case writes through the fixture once the page is open. That write needs the loaded page, so it is an `AND` action step after the `WHEN`, not an option on the opening call.

```ts
// e2e/share/share.e2e.ts
import { expect, test } from './share.fixture';

test.describe('FEATURE: share', () => {
  test('GIVEN a share link, clicking copy puts it on the clipboard', async ({ clipboard, sharePage }): Promise<void> => {
    await test.step('WHEN the share page is opened', (): Promise<void> => sharePage.goto());

    await test.step('AND the link is copied', (): Promise<void> => sharePage.copyLink());

    const link = await test.step('AND the clipboard is read', (): Promise<string> => clipboard.read());

    await test.step('THEN the clipboard holds a share url', (): void => expect(link).toContain('https://example.com/share/'));
  });

  test('GIVEN clipboard text, pasting shows it in the note', async ({ clipboard, sharePage }): Promise<void> => {
    await test.step('WHEN the share page is opened', (): Promise<void> => sharePage.goto());

    await test.step('AND text is written to the clipboard', (): Promise<void> => clipboard.write('Pasted content'));

    await test.step('AND the text is pasted into the note', (): Promise<void> => sharePage.pasteIntoNote());

    await test.step('THEN the note holds the pasted text', (): Promise<void> => sharePage.expectNote('Pasted content'));
  });
});
```

## Notifications

### Mock Notification API

The fake `Notification` class records every construction in `sessionStorage` and fires `onclick` on the next tick, which covers both the "was it created" and the "click handler" cases. It is installed with `page.addInitScript` before any navigation.

```ts
// e2e/alerts/common/alerts.type.ts
export type NotificationRecord = {
  readonly body?: string;
  readonly title: string;
};

export type FakeNotificationApi = {
  readonly created: () => Promise<NotificationRecord[]>;
  readonly raise: (title: string) => Promise<void>;
};
```

```ts
// e2e/alerts/test/mocks/notification.mock.ts
import type { NotificationRecord } from '../../common/alerts.type';

const installFakeNotification = (): void => {
  class FakeNotification {
    public static permission: NotificationPermission = 'granted';

    public onclick: (() => void) | null = null;

    public constructor(title: string, options?: NotificationOptions) {
      const raw = sessionStorage.getItem('notifications') ?? '[]';
      const records: NotificationRecord[] = JSON.parse(raw);
      const record: NotificationRecord = { title, ...options };

      records.push(record);
      sessionStorage.setItem('notifications', JSON.stringify(records));
      setTimeout((): void => this.onclick?.(), 0);
    }

    public static requestPermission(): Promise<NotificationPermission> {
      return Promise.resolve('granted');
    }
  }

  Object.defineProperty(window, 'Notification', { value: FakeNotification });
};

export const notificationMock = (): (() => void) => installFakeNotification;
```

```ts
// e2e/alerts/alerts.fixture.ts
import { test as base } from '@playwright/test';

import type { FakeNotificationApi, NotificationRecord } from './common/alerts.type';
import { AlertsPage } from './pages/alerts.page';
import { notificationMock } from './test/mocks/notification.mock';

type AlertsFixtures = {
  readonly alertsPage: AlertsPage;
  readonly fakeNotification: FakeNotificationApi;
};

const readCreated = (): NotificationRecord[] => {
  const raw = sessionStorage.getItem('notifications') ?? '[]';
  const records: NotificationRecord[] = JSON.parse(raw);

  return records;
};

const raiseNotification = (title: string): void => {
  new Notification(title);
};

export const test = base.extend<AlertsFixtures>({
  alertsPage: async ({ page }, use): Promise<void> => {
    await use(new AlertsPage(page));
  },
  fakeNotification: async ({ page }, use): Promise<void> => {
    await page.addInitScript(notificationMock());

    const api: FakeNotificationApi = {
      created: (): Promise<NotificationRecord[]> => page.evaluate(readCreated),
      raise: (title: string): Promise<void> => page.evaluate(raiseNotification, title)
    };

    await use(api);
  }
});

export { expect } from '@playwright/test';
```

### Test Notification Click

Each test requests `fakeNotification` in its signature, so the init script is installed before the opening `goto`.

```ts
// e2e/alerts/alerts.e2e.ts
import { expect, test } from './alerts.fixture';
import type { NotificationRecord } from './common/alerts.type';

test.describe('FEATURE: alerts', () => {
  test('GIVEN a faked notification API, clicking Notify Me creates one notification titled New Alert', async ({ alertsPage, fakeNotification }): Promise<void> => {
    await test.step('WHEN the alerts page is opened', (): Promise<void> => alertsPage.goto());

    await test.step('AND Notify Me is clicked', (): Promise<void> => alertsPage.notifyMe());

    const created = await test.step('AND the created notifications are read', (): Promise<NotificationRecord[]> => fakeNotification.created());

    await test.step('THEN one notification titled New Alert exists', (): void => expect(created).toEqual([{ title: 'New Alert' }]));
  });

  test('GIVEN a shown notification, clicking it opens the messages page', async ({ alertsPage, fakeNotification, page }): Promise<void> => {
    await test.step('WHEN the alerts page is opened', (): Promise<void> => alertsPage.goto());

    await test.step('AND a New Message notification is raised and clicked', (): Promise<void> => fakeNotification.raise('New Message'));

    await test.step('THEN the messages page is shown', (): Promise<void> => expect(page).toHaveURL(/\/messages/));
  });
});
```

## Camera & Microphone

CI has no camera, so `getUserMedia` returns a canvas stream and `enumerateDevices` returns stubbed devices. One `MediaDevicesConfig` drives both; `error` set to a `DOMException` name makes `getUserMedia` throw instead. The config is an option fixture, so a spec that needs other devices selects them with a file-level `test.use`.

```ts
// e2e/video-call/common/video-call.type.ts
export type MediaDeviceStub = {
  readonly deviceId: string;
  readonly groupId: string;
  readonly kind: MediaDeviceKind;
  readonly label: string;
};

export type MediaDevicesConfig = {
  readonly devices: MediaDeviceStub[];
  readonly error: string | null;
};

export type MediaDevicesInstaller = (config: MediaDevicesConfig) => void;
```

`test/stubs/media-devices.stub.ts` exports `FRONT_CAMERA_STUB` (`{ deviceId: 'cam1', groupId: '1', kind: 'videoinput', label: 'Front Camera' }`) and `MEDIA_DEVICES_STUB` (`{ devices: [FRONT_CAMERA_STUB], error: null }`).

```ts
// e2e/video-call/test/mocks/media-devices.mock.ts
import type { MediaDeviceStub, MediaDevicesConfig, MediaDevicesInstaller } from '../../common/video-call.type';

const installFakeMediaDevices = (config: MediaDevicesConfig): void => {
  const getUserMedia = async (): Promise<MediaStream> => {
    if (config.error) throw new DOMException('Permission denied', config.error);

    const canvas = document.createElement('canvas');

    canvas.width = 640;
    canvas.height = 480;

    return canvas.captureStream();
  };
  const enumerateDevices = async (): Promise<MediaDeviceStub[]> => config.devices;

  Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { value: enumerateDevices });
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: getUserMedia });
};

export const mediaDevicesMock = (): MediaDevicesInstaller => installFakeMediaDevices;
```

```ts
// e2e/video-call/video-call.fixture.ts
import { test as base } from '@playwright/test';

import type { MediaDevicesConfig } from './common/video-call.type';
import { VideoCallPage } from './pages/video-call.page';
import { mediaDevicesMock } from './test/mocks/media-devices.mock';
import { MEDIA_DEVICES_STUB } from './test/stubs/media-devices.stub';

type VideoCallFixtures = {
  readonly mediaDevices: MediaDevicesConfig;
  readonly videoCallPage: VideoCallPage;
};

export const test = base.extend<VideoCallFixtures>({
  mediaDevices: [MEDIA_DEVICES_STUB, { option: true }],
  videoCallPage: async ({ context, mediaDevices, page }, use): Promise<void> => {
    await context.grantPermissions(['camera', 'microphone']);
    await page.addInitScript(mediaDevicesMock(), mediaDevices);
    await use(new VideoCallPage(page));
  }
});

export { expect } from '@playwright/test';
```

`VideoCallPage` owns `cameraSelect`, `joinAudioOnlyButton`, `joinCallButton`, `startCameraButton`, and `videoPreview`. Its `expect*` methods hold plain `await expect(…)` lines: `expectPreview()`, `expectCameraOptions(labels)`, and `expectCameraDenied()` (denied text plus the audio-only button).

The default option serves one camera, so the main spec needs no `test.use`:

```ts
// e2e/video-call/video-call.e2e.ts
import { test } from './video-call.fixture';

test.describe('FEATURE: video call', () => {
  test('GIVEN a fake camera, starting it shows the preview', async ({ videoCallPage }): Promise<void> => {
    await test.step('WHEN the video settings are opened', (): Promise<void> => videoCallPage.goto('/video-settings'));

    await test.step('AND the camera is started', (): Promise<void> => videoCallPage.startCamera());

    await test.step('THEN the video preview is shown', (): Promise<void> => videoCallPage.expectPreview());
  });
});
```

`mediaDevices` is read when the init script is installed, before any test step runs, so a denied camera cannot be an option on the opening call. It is its own spec with a file-level `test.use`: `error: 'NotAllowedError'` makes the fake `getUserMedia` throw a `DOMException` with that name, and the app shows its audio-only fallback. Device selection is the same shape: a `video-call-two-cameras.e2e.ts` spec spreads `MEDIA_DEVICES_STUB` with `devices: [FRONT_CAMERA_STUB, { ...FRONT_CAMERA_STUB, deviceId: 'cam2', groupId: '2', label: 'Back Camera' }]` in its file-level `test.use`, then `videoCallPage.goto('/camera')` and `expectCameraOptions(['Front Camera', 'Back Camera'])`.

```ts
// e2e/video-call/video-call-denied.e2e.ts
import type { MediaDevicesConfig } from './common/video-call.type';
import { test } from './video-call.fixture';
import { MEDIA_DEVICES_STUB } from './test/stubs/media-devices.stub';

const cameraDenied: MediaDevicesConfig = { ...MEDIA_DEVICES_STUB, error: 'NotAllowedError' };

test.use({ mediaDevices: cameraDenied });

test.describe('FEATURE: video call with camera access denied', () => {
  test('GIVEN denied camera access, joining the call offers the audio-only fallback', async ({ videoCallPage }): Promise<void> => {
    await test.step('WHEN the video call is opened', (): Promise<void> => videoCallPage.goto('/video-call'));

    await test.step('AND the call is joined', (): Promise<void> => videoCallPage.joinCall());

    await test.step('THEN the denied message and audio-only button are shown', (): Promise<void> => videoCallPage.expectCameraDenied());
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|---|---|---|
| Not granting permissions | Tests fail with permission errors | Use `context.grantPermissions()` in a fixture |
| Testing real geolocation | Flaky, environment-dependent | Mock with `setGeolocation()` |
| Not testing permission denial | Misses error handling | Test both granted and denied states; deny through an opening-call option that runs `context.clearPermissions()` |
| Using real camera/mic | CI has no devices | Mock `getUserMedia` with an init script |
| `window as any` in init scripts | Hides the shape, breaks typecheck | `Object.defineProperty(window, name, { value })` |

## Related References

- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for context fixtures
- **Mobile**: See [mobile-testing.md](../advanced/mobile-testing.md) for device emulation
