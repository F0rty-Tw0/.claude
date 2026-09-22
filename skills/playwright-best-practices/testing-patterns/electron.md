# Electron Testing

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Launching Electron Apps](#launching-electron-apps)
3. [Main Process Testing](#main-process-testing)
4. [Renderer Process Testing](#renderer-process-testing)
5. [IPC Communication](#ipc-communication)
6. [Native Features](#native-features)
7. [Packaging & Distribution](#packaging--distribution)

## Setup & Configuration

### Installation

```bash
npm install -D @playwright/test electron
```

### Basic Configuration

`playwright.config.ts` needs no Electron-specific entries: the fixture launches the app, not a browser project. See [configuration.md](../core/configuration.md).

### Electron Test Fixture

`electronApp` launches the app from the package root (`args: ['.']` points at `package.json` `main`) with `NODE_ENV=test` and closes it after the test. `mainWindow` wraps `electronApp.firstWindow()` in a page object and waits for `domcontentloaded`; `renderer` wraps the same window for `evaluate` calls into the renderer.

The `electronApp.evaluate` callback receives the `electron` module. Playwright does not export that type, so `ElectronModule` names it once for every main-process util.

```ts
// e2e/desktop/common/desktop.type.ts
export type ElectronModule = typeof import('electron');

export type FetchData = {
  readonly data: string;
  readonly mocked: boolean;
};

export type IpcMock = {
  readonly channel: string;
  readonly response: FetchData;
};

export type MenuPath = {
  readonly item: string;
  readonly menu: string;
};

export type UserSettings = {
  readonly theme: string;
};

export type ElectronApi = {
  readonly fetchData: () => Promise<FetchData>;
  readonly getAppVersion: () => Promise<string>;
  readonly getData: (key: string) => Promise<UserSettings>;
  readonly onMessage: (handler: (message: string) => void) => void;
};

export type NodeProcessLike = {
  readonly version: string;
};

export type RendererGlobals = {
  readonly document: Document;
  readonly electronAPI?: ElectronApi;
  readonly process?: NodeProcessLike;
  readonly require?: unknown;
};
```

```ts
// e2e/desktop/desktop.fixture.ts
import type { ElectronApplication } from '@playwright/test';
import { _electron as electron, test as base } from '@playwright/test';

import { MainWindowPage } from './pages/main-window.page';
import { RendererPage } from './pages/renderer.page';

type DesktopFixtures = {
  readonly electronApp: ElectronApplication;
  readonly mainWindow: MainWindowPage;
  readonly renderer: RendererPage;
};

const env = { ...process.env, NODE_ENV: 'test' };

const LAUNCH_OPTIONS = { args: ['.', '--no-sandbox'], env };

export const test = base.extend<DesktopFixtures>({
  electronApp: async ({}, use): Promise<void> => {
    const electronApp = await electron.launch(LAUNCH_OPTIONS);

    await use(electronApp);
    await electronApp.close();
  },
  mainWindow: async ({ electronApp }, use): Promise<void> => {
    const window = await electronApp.firstWindow();

    await window.waitForLoadState('domcontentloaded');
    await use(new MainWindowPage(window, electronApp));
  },
  renderer: async ({ electronApp }, use): Promise<void> => {
    const window = await electronApp.firstWindow();

    await use(new RendererPage(window));
  }
});

export { expect } from '@playwright/test';
```

### Launch Options

| Option | Purpose |
|---|---|
| `args: ['main.js', '--custom-flag']` | Entry file and flags passed to the app |
| `cwd: '/path/to/app'` | Working directory for the launch |
| `env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', NODE_ENV: 'test' }` | Environment visible to the app; spread `process.env` or the app loses `PATH` |
| `timeout: 30_000` | Launch timeout in milliseconds |
| `executablePath: '/path/to/MyApp.app/Contents/MacOS/MyApp'` | Launch a packaged binary instead of `electron .` |

## Launching Electron Apps

### Development Mode

The fixture above is development mode: `electron.launch({ args: ['.'] })` runs the source tree. `MainWindowPage` owns the first window's locators; `openSettings()` clicks the button and waits for `electronApp.waitForEvent('window')` so the new window is captured, then returns it as `SettingsWindowPage`. `SettingsWindowPage` (`e2e/desktop/pages/settings-window.page.ts`) follows the same shape with one locator, `heading = page.locator('h1')`, and a `close()` method that calls `page.close()`.

```ts
// e2e/desktop/pages/main-window.page.ts
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { SettingsWindowPage } from './settings-window.page';

export class MainWindowPage {
  public readonly notifyButton: Locator;
  public readonly openFileButton: Locator;
  public readonly openSettingsButton: Locator;
  public readonly textbox: Locator;

  private readonly electronApp: ElectronApplication;
  private readonly page: Page;

  public constructor(page: Page, electronApp: ElectronApplication) {
    this.page = page;
    this.electronApp = electronApp;
    this.notifyButton = page.getByRole('button', { name: 'Notify' });
    this.openFileButton = page.getByRole('button', { name: 'Open File' });
    this.openSettingsButton = page.getByRole('button', { name: 'Open Settings' });
    this.textbox = page.getByRole('textbox');
  }

  public async openSettings(): Promise<SettingsWindowPage> {
    const windowPromise = this.electronApp.waitForEvent('window');

    await this.openSettingsButton.click();

    return new SettingsWindowPage(await windowPromise);
  }

  public async pasteIntoTextbox(): Promise<void> {
    await this.textbox.press('ControlOrMeta+v');
  }

  public async expectText(text: string): Promise<void> {
    await test.step(`window shows "${text}"`, (): Promise<void> => expect(this.page.getByText(text)).toBeVisible(), { box: true });
  }
}
```

### Packaged Application

A packaged binary launches through `executablePath`; see [Packaging & Distribution](#packaging--distribution) for the fixture that resolves the path per platform. The spec shape is the same as development mode; `expect(page).toHaveTitle(/MyApp/)` on the first window is the readiness check.

### Multiple Windows

```ts
// e2e/desktop/windows.e2e.ts
import type { SettingsWindowPage } from './pages/settings-window.page';
import { expect, test } from './desktop.fixture';

test.describe('FEATURE: desktop windows', () => {
  test.describe('GIVEN the app is running', () => {
    test('SCENARIO: app start names the app in the main window', async ({ mainWindow }): Promise<void> => {
      await test.step('THEN window shows My App', (): Promise<void> => mainWindow.expectText('My App'));
    });

    test('SCENARIO: Open Settings opens a second window', async ({ electronApp, mainWindow }): Promise<void> => {
      const settingsWindow = await test.step('WHEN the settings window is opened', (): Promise<SettingsWindowPage> => mainWindow.openSettings());

      await test.step('THEN settings heading reads Settings', (): Promise<void> => expect(settingsWindow.heading).toHaveText('Settings'));

      await test.step('AND main window still shows Main', (): Promise<void> => mainWindow.expectText('Main'));

      await test.step('AND two windows are open', (): void => expect(electronApp.windows()).toHaveLength(2));
    });
  });
});
```

## Main Process Testing

### Evaluate in Main Process

`electronApp.evaluate` runs a function inside the main process with the `electron` module as its argument. Each read is a named function so its return type is explicit; `BrowserWindow.getAllWindows()[0]` is the main window.

```ts
// e2e/desktop/test/utils/main-process.spec.util.ts
import type { ElectronApplication } from '@playwright/test';
import type { Rectangle } from 'electron';

import type { ElectronModule } from '../../common/desktop.type';

const readAppVersion = ({ app }: ElectronModule): string => app.getVersion();

const readWindowBounds = ({ BrowserWindow }: ElectronModule): Rectangle => {
  const [window] = BrowserWindow.getAllWindows();

  return window.getBounds();
};

export const appVersion = (electronApp: ElectronApplication): Promise<string> => electronApp.evaluate(readAppVersion);

export const windowBounds = (electronApp: ElectronApplication): Promise<Rectangle> => electronApp.evaluate(readWindowBounds);
```

Other reads follow the same two shapes:

| Read | Callback body | Returns |
|---|---|---|
| App path | `app.getAppPath()` | `string`, contains the project folder name |
| App ready | `app.isReady()` | `boolean` |
| Platform | `process.platform`, no `electron` argument needed | `'darwin' \| 'linux' \| 'win32'` |
| Window maximized | `window.isMaximized()` | `boolean` |
| Window title | `window.getTitle()` | `string` |

```ts
// e2e/desktop/main-process.e2e.ts
import type { Rectangle } from 'electron';

import { expect, test } from './desktop.fixture';
import { appVersion, windowBounds } from './test/utils/main-process.spec.util';

const SEMVER = /^\d+\.\d+\.\d+$/;

test.describe('FEATURE: desktop main process', () => {
  test.describe('GIVEN the app is running', () => {
    test('SCENARIO: app reports a semver version', async ({ electronApp }): Promise<void> => {
      const version = await test.step('WHEN the app version is read', (): Promise<string> => appVersion(electronApp));

      await test.step('THEN version is semver', (): void => expect(version).toMatch(SEMVER));
    });

    test('SCENARIO: main window has bounds', async ({ electronApp }): Promise<void> => {
      const bounds = await test.step('WHEN the window bounds are read', (): Promise<Rectangle> => windowBounds(electronApp));

      await test.step('THEN window has a width', (): void => expect(bounds.width).toBeGreaterThan(0));

      await test.step('AND window has a height', (): void => expect(bounds.height).toBeGreaterThan(0));
    });
  });
});
```

## Renderer Process Testing

### Standard Page Testing

The first window is a `Page`; every Playwright interaction and web-first assertion applies. `RendererPage` wraps the `evaluate` calls into the renderer's globals so a spec never touches `window.*` directly. Each read declares `const scope: RendererGlobals = window` instead of a cast, and stays a standalone function because `page.evaluate` serialises it and cannot close over module helpers.

```ts
// e2e/desktop/pages/renderer.page.ts
import type { Page } from '@playwright/test';

import type { FetchData, RendererGlobals, UserSettings } from '../common/desktop.type';

const readHasElectronApi = (): boolean => {
  const scope: RendererGlobals = window;

  return scope.electronAPI !== undefined;
};

const readUserSettings = async (key: string): Promise<UserSettings | undefined> => {
  const scope: RendererGlobals = window;

  return scope.electronAPI?.getData(key);
};

const readFetchData = async (): Promise<FetchData | undefined> => {
  const scope: RendererGlobals = window;

  return scope.electronAPI?.fetchData();
};

const awaitMessage = (): Promise<string> => {
  const scope: RendererGlobals = window;

  return new Promise((resolve): void => {
    scope.electronAPI?.onMessage(resolve);
  });
};

export class RendererPage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async hasElectronApi(): Promise<boolean> {
    return this.page.evaluate(readHasElectronApi);
  }

  public async userSettings(key: string): Promise<UserSettings | undefined> {
    return this.page.evaluate(readUserSettings, key);
  }

  public async fetchData(): Promise<FetchData | undefined> {
    return this.page.evaluate(readFetchData);
  }

  public nextMessage(): Promise<string> {
    return this.page.evaluate(awaitMessage);
  }
}
```

### Access Node.js in Renderer

With `nodeIntegration: true` the renderer exposes `process.version` and `require`; with `contextIsolation: true` the preload script exposes `window.electronAPI` instead. Reads for either mode follow the shape above; the assertion states which mode the app is built with, because the other mode returns `undefined` or `false`.

| Read | Expression on `scope` | Returns | Mode |
|---|---|---|---|
| Node version | `scope.process?.version` | `string \| undefined` | `nodeIntegration` |
| Require present | `typeof scope.require === 'function'` | `boolean` | `nodeIntegration` |
| App version | `scope.electronAPI?.getAppVersion()` | `Promise<string \| undefined>`, semver | `contextIsolation` |

### Context Isolation Testing

```ts
// e2e/desktop/renderer.e2e.ts
import { expect, test } from './desktop.fixture';

test.describe('FEATURE: desktop renderer', () => {
  test.describe('GIVEN the main window is open', () => {
    test('SCENARIO: context isolation exposes the preload api', async ({ renderer }): Promise<void> => {
      const hasApi = await test.step('WHEN electronAPI is checked', (): Promise<boolean> => renderer.hasElectronApi());

      await test.step('THEN electronAPI is exposed', (): void => expect(hasApi).toBe(true));
    });
  });
});
```

## IPC Communication

`electronAPI.getData('user-settings')` is a preload wrapper around `ipcRenderer.invoke`; `userSettings()` returns the typed result. `roundTripFromMain` registers the renderer listener first, then sends through `webContents.send` from the main process, and returns what the renderer received; registering before sending is what makes the round trip deterministic. `installIpcMock` removes the existing `ipcMain` handler for a channel and installs one that answers with the given response. The response travels as the `evaluate` argument because the callback body is serialised and cannot close over Node-side values. The channel-and-response pair it takes is data, so it is `FETCH_DATA_STUB: IpcMock` in `test/stubs/ipc.stub.ts` holding `{ channel: 'fetch-data', response: { data: 'test-data', mocked: true } }`; a value named `*_MOCK` that never intercepts anything is a stub wearing the wrong name.

```ts
// e2e/desktop/test/utils/ipc.spec.util.ts
import type { ElectronApplication } from '@playwright/test';

import type { ElectronModule, FetchData, IpcMock } from '../../common/desktop.type';
import type { RendererPage } from '../../pages/renderer.page';

const sendMessage = ({ BrowserWindow }: ElectronModule, text: string): void => {
  const [window] = BrowserWindow.getAllWindows();

  window.webContents.send('message', text);
};

const installMock = ({ ipcMain }: ElectronModule, mock: IpcMock): void => {
  ipcMain.removeHandler(mock.channel);
  ipcMain.handle(mock.channel, (): FetchData => mock.response);
};

export const installIpcMock = (electronApp: ElectronApplication, mock: IpcMock): Promise<void> => electronApp.evaluate(installMock, mock);

export const sendToRenderer = (electronApp: ElectronApplication, text: string): Promise<void> => electronApp.evaluate(sendMessage, text);

export const roundTripFromMain = async (electronApp: ElectronApplication, renderer: RendererPage, text: string): Promise<string> => {
  const received = renderer.nextMessage();

  await sendToRenderer(electronApp, text);

  return received;
};
```

```ts
// e2e/desktop/ipc.e2e.ts
import type { FetchData, UserSettings } from './common/desktop.type';
import { expect, test } from './desktop.fixture';
import { installIpcMock, roundTripFromMain } from './test/utils/ipc.spec.util';
import { FETCH_DATA_STUB } from './test/stubs/ipc.stub';

test.describe('FEATURE: desktop ipc', () => {
  test.describe('GIVEN the main window is open', () => {
    test('SCENARIO: user-settings response has a theme', async ({ renderer }): Promise<void> => {
      const settings = await test.step('WHEN getData is invoked for user-settings', (): Promise<UserSettings | undefined> => renderer.userSettings('user-settings'));

      await test.step('THEN settings carry a theme', (): void => expect(settings).toHaveProperty('theme'));
    });

    test('SCENARIO: message from main reaches the renderer', async ({ electronApp, renderer }): Promise<void> => {
      const message = await test.step('WHEN Hello from main! is sent and awaited', (): Promise<string> => roundTripFromMain(electronApp, renderer, 'Hello from main!'));

      await test.step('THEN renderer received the text', (): void => expect(message).toBe('Hello from main!'));
    });

    test('SCENARIO: mocked fetch-data reaches the renderer', async ({ electronApp, renderer }): Promise<void> => {
      await test.step('GIVEN the fetch-data mock is installed', (): Promise<void> => installIpcMock(electronApp, FETCH_DATA_STUB));

      const result = await test.step('WHEN fetchData is invoked', (): Promise<FetchData | undefined> => renderer.fetchData());

      await test.step('THEN response is the mock', (): void => expect(result?.mocked).toBe(true));
    });
  });
});
```

## Native Features

### File System Dialogs

Native dialogs block the test, so the main-process `dialog` methods are replaced with functions that resolve at once. The chosen paths travel as the `evaluate` argument.

```ts
// e2e/desktop/test/utils/dialog.spec.util.ts
import type { ElectronApplication } from '@playwright/test';
import type { OpenDialogReturnValue } from 'electron';

import type { ElectronModule } from '../../common/desktop.type';

const mockOpenDialog = ({ dialog }: ElectronModule, filePaths: string[]): void => {
  const result: OpenDialogReturnValue = { canceled: false, filePaths };

  dialog.showOpenDialog = async (): Promise<OpenDialogReturnValue> => result;
};

export const installOpenDialogMock = (electronApp: ElectronApplication, filePaths: string[]): Promise<void> => electronApp.evaluate(mockOpenDialog, filePaths);
```

| Dialog | Replaced method | Result type | Result value |
|---|---|---|---|
| Open | `dialog.showOpenDialog` | `OpenDialogReturnValue` | `{ canceled: false, filePaths }` |
| Save | `dialog.showSaveDialog` | `SaveDialogReturnValue` | `{ canceled: false, filePath }` |

```ts
// e2e/desktop/dialogs.e2e.ts
import { test } from './desktop.fixture';
import { installOpenDialogMock } from './test/utils/dialog.spec.util';

test.describe('FEATURE: desktop dialogs', () => {
  test.describe('GIVEN the dialogs are mocked', () => {
    test('SCENARIO: Open File opens the mocked file', async ({ electronApp, mainWindow }): Promise<void> => {
      await test.step('GIVEN the open dialog resolves with file.txt', (): Promise<void> => installOpenDialogMock(electronApp, ['/mock/path/file.txt']));

      await test.step('WHEN Open File is clicked', (): Promise<void> => mainWindow.openFileButton.click());

      await test.step('THEN file.txt is shown', (): Promise<void> => mainWindow.expectText('file.txt'));
    });
  });
});
```

### Menu Testing

`Menu.getApplicationMenu()` returns the menu tree. `menuLabels` maps the top-level items; `clickMenuItem` finds a submenu item by label and calls its `click()`. A spec reads `menuLabels(electronApp)` in a `WHEN` step typed `Promise<string[]>`, asserts `expect(labels).toContain('File')` in `THEN`, then clicks `clickMenuItem(electronApp, { item: 'New', menu: 'File' })`.

```ts
// e2e/desktop/test/utils/menu.spec.util.ts
import type { ElectronApplication } from '@playwright/test';
import type { MenuItem } from 'electron';

import type { ElectronModule, MenuPath } from '../../common/desktop.type';

const readMenuLabels = ({ Menu }: ElectronModule): string[] => {
  const menu = Menu.getApplicationMenu();
  const items = menu?.items ?? [];

  return items.map((item: MenuItem): string => item.label);
};

const clickItem = ({ Menu }: ElectronModule, target: MenuPath): void => {
  const menu = Menu.getApplicationMenu();
  const topItem = menu?.items.find((item: MenuItem): boolean => item.label === target.menu);
  const subItem = topItem?.submenu?.items.find((item: MenuItem): boolean => item.label === target.item);

  subItem?.click();
};

export const clickMenuItem = (electronApp: ElectronApplication, target: MenuPath): Promise<void> => electronApp.evaluate(clickItem, target);

export const menuLabels = (electronApp: ElectronApplication): Promise<string[]> => electronApp.evaluate(readMenuLabels);
```

### Native Notifications

`installNotificationSpy` replaces the global `Notification` with a subclass that records the last constructor options on `globalThis` through `Reflect.set`; `lastNotification` reads it back through a type predicate, so no cast is needed.

```ts
// e2e/desktop/test/utils/notification.spec.util.ts
import type { ElectronApplication } from '@playwright/test';
import type { NotificationConstructorOptions } from 'electron';

import type { ElectronModule } from '../../common/desktop.type';

const installSpy = ({ Notification }: ElectronModule): void => {
  class SpyNotification extends Notification {
    public constructor(options?: NotificationConstructorOptions) {
      super(options);
      Reflect.set(globalThis, 'lastNotification', options);
    }
  }

  Reflect.set(globalThis, 'Notification', SpyNotification);
};

const isNotificationOptions = (value: unknown): value is NotificationConstructorOptions => {
  const isObject = typeof value === 'object' && value !== null;

  return isObject && 'title' in value;
};

const readLast = (): NotificationConstructorOptions | undefined => {
  const value: unknown = Reflect.get(globalThis, 'lastNotification');

  if (isNotificationOptions(value)) return value;

  return undefined;
};

export const installNotificationSpy = (electronApp: ElectronApplication): Promise<void> => electronApp.evaluate(installSpy);

export const lastNotification = (electronApp: ElectronApplication): Promise<NotificationConstructorOptions | undefined> => electronApp.evaluate(readLast);
```

### Clipboard

`clipboard.writeText` and `clipboard.readText` run in the main process; the paste itself is `ControlOrMeta+v` in the renderer. The wrappers are `async` so they compile against both the synchronous clipboard of older Electron and the promise-based one in Electron 44+.

```ts
// e2e/desktop/test/utils/clipboard.spec.util.ts
import type { ElectronApplication } from '@playwright/test';

import type { ElectronModule } from '../../common/desktop.type';

const writeText = async ({ clipboard }: ElectronModule, text: string): Promise<void> => {
  await clipboard.writeText(text);
};

const readText = async ({ clipboard }: ElectronModule): Promise<string> => clipboard.readText();

export const readClipboard = (electronApp: ElectronApplication): Promise<string> => electronApp.evaluate(readText);

export const writeClipboard = (electronApp: ElectronApplication, text: string): Promise<void> => electronApp.evaluate(writeText, text);
```

```ts
// e2e/desktop/native.e2e.ts
import type { NotificationConstructorOptions } from 'electron';

import { expect, test } from './desktop.fixture';
import { readClipboard, writeClipboard } from './test/utils/clipboard.spec.util';
import { installNotificationSpy, lastNotification } from './test/utils/notification.spec.util';

test.describe('FEATURE: desktop native features', () => {
  test.describe('GIVEN the app is running', () => {
    test('SCENARIO: Notify creates a notification titled New Message', async ({ electronApp, mainWindow }): Promise<void> => {
      await test.step('WHEN Notification is spied on', (): Promise<void> => installNotificationSpy(electronApp));

      await test.step('AND Notify is clicked', (): Promise<void> => mainWindow.notifyButton.click());

      const notification = await test.step('AND the last notification is read', (): Promise<NotificationConstructorOptions | undefined> => lastNotification(electronApp));

      await test.step('THEN title is New Message', (): void => expect(notification?.title).toBe('New Message'));
    });

    test('SCENARIO: pasted text stays on the clipboard', async ({ electronApp, mainWindow }): Promise<void> => {
      await test.step('WHEN the clipboard is written', (): Promise<void> => writeClipboard(electronApp, 'Test clipboard content'));

      await test.step('AND the textbox receives a paste', (): Promise<void> => mainWindow.pasteIntoTextbox());

      const content = await test.step('AND the clipboard is read', (): Promise<string> => readClipboard(electronApp));

      await test.step('THEN clipboard holds the text', (): void => expect(content).toBe('Test clipboard content'));
    });
  });
});
```

## Packaging & Distribution

### Testing Packaged Apps

Build first, then launch the binary from `dist/`. A lookup table keyed by `process.platform` replaces a platform ternary; an unknown platform throws instead of launching the wrong path.

```ts
// e2e/desktop/packaged.fixture.ts
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';
import { _electron as electron, test as base } from '@playwright/test';

type PackagedFixtures = {
  readonly electronApp: ElectronApplication;
};

const DIST_PATH = path.join(__dirname, '../../dist');

const EXECUTABLES: Record<string, string> = {
  darwin: path.join(DIST_PATH, 'mac', 'MyApp.app', 'Contents', 'MacOS', 'MyApp'),
  linux: path.join(DIST_PATH, 'linux-unpacked', 'myapp'),
  win32: path.join(DIST_PATH, 'win-unpacked', 'MyApp.exe')
};

const packagedExecutable = (): string => {
  const executablePath = EXECUTABLES[process.platform];

  if (!executablePath) throw new Error(`no packaged build for ${process.platform}`);

  return executablePath;
};

export const test = base.extend<PackagedFixtures>({
  electronApp: async ({}, use): Promise<void> => {
    const executablePath = packagedExecutable();
    const electronApp = await electron.launch({ executablePath });

    await use(electronApp);
    await electronApp.close();
  }
});

export { expect } from '@playwright/test';
```

## Anti-Patterns to Avoid

| Anti-Pattern                          | Problem                      | Solution                                     |
| ------------------------------------- | ---------------------------- | -------------------------------------------- |
| Not closing ElectronApplication       | Resource leaks               | Always call `electronApp.close()` in cleanup |
| Hardcoded executable paths            | Breaks cross-platform        | Use platform detection                       |
| Testing packaged app without building | Outdated code                | Build before testing or test dev mode        |
| Ignoring IPC in tests                 | Missing coverage             | Test IPC communication explicitly            |
| Not mocking native dialogs            | Tests hang waiting for input | Mock dialog responses                        |

## Related References

- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for custom fixture patterns
- **Component Testing**: See [component-testing.md](component-testing.md) for renderer testing patterns
- **Debugging**: See [debugging.md](../debugging/debugging.md) for troubleshooting
