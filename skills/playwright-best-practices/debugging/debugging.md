# Debugging & Troubleshooting

## Table of Contents

1. [Debug Tools](#debug-tools)
2. [Trace Viewer](#trace-viewer)
3. [Identifying Flaky Tests](#identifying-flaky-tests)
4. [Debugging Network Issues](#debugging-network-issues)
5. [Debugging in CI](#debugging-in-ci)
6. [Debugging Authentication](#debugging-authentication)
7. [Debugging Screenshots](#debugging-screenshots)
8. [Common Issues](#common-issues)
9. [Logging](#logging)

Debug probes are throwaway code, but they still follow the house shape: a probe is a function in `e2e/<feature>/test/utils/<name>.spec.util.ts`, and the spec calls it from a step. A probe goes into a real test as extra `WHEN` / `AND` steps; the test keeps its `THEN`, so it still proves something while the probe pauses, prints, or attaches. Samples below use the `dashboard` feature: `dashboardPage` has `goto()`, `loadData()`, `openMenu()`, and the checks `expectDataLoaded()` and `expectMenuOpen()`, and later sections show the members they add.

## Debug Tools

### Playwright Inspector

```bash
# Run with inspector
PWDEBUG=1 npx playwright test
# Or specific test
PWDEBUG=1 npx playwright test login.e2e.ts
```

Features:

- Step through test actions
- Pick locators visually
- Inspect DOM state
- Edit and re-run

### Headed Mode

```bash
# Run with visible browser
npx playwright test --headed

# Interactive debugging (headed, paused, step-through)
npx playwright test --debug

# Same run, driven from a terminal or a coding agent over playwright-cli (1.59)
npx playwright test --debug=cli
```

`slowMo` adds an `N` ms delay per action, which makes test execution easier to follow while debugging.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const launchOptions = { slowMo: 500 };

const use = { launchOptions };

export default defineConfig({ testMatch: '**/*.@(e2e|test).ts', use });
```

### UI Mode

```bash
# Interactive test runner
npx playwright test --ui
```

Features:

- Watch mode
- Test timeline
- DOM snapshots
- Network logs
- Console logs

### Debug in Code

`page.pause()` stops the test and opens the Inspector at that point. It is a step like any other, placed right before the step to inspect, so it is easy to find and delete.

```ts
// e2e/dashboard/dashboard.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN a live data api, loading data shows it on the dashboard', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the run pauses for the inspector', (): Promise<void> => page.pause());

    await test.step('AND data is loaded', (): Promise<void> => dashboardPage.loadData());

    await test.step('THEN the data is shown', (): Promise<void> => dashboardPage.expectDataLoaded());
  });
});
```

## Trace Viewer

### Enable Traces

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const use = { trace: 'on-first-retry' } as const;

export default defineConfig({ testMatch: '**/*.@(e2e|test).ts', use });
```

| `trace` value | Behavior |
|---|---|
| `'on-first-retry'` | Record on the first retry only |
| `'on-all-retries'` | Record every retry |
| `'on'` | Always record |
| `'retain-on-failure'` | Record every run, keep only failed runs |
| `'retain-on-first-failure'` | Record the first run only, keep it if it failed |
| `'retain-on-failure-and-retries'` | Record every run, keep failed runs and every retry, so a failing and a passing attempt of one test can be diffed (1.59) |
| `'off'` | Never record |

### View Traces

```bash
# Open trace file
npx playwright show-trace trace.zip

# From test-results
npx playwright show-trace test-results/test-name/trace.zip
```

### Terminal Trace Analysis (agents)

`npx playwright trace` (1.59) reads a trace from the shell, so a coding agent can inspect a failure without the GUI. `open` extracts the trace; every later command reads the open one until `close`.

```bash
npx playwright trace open test-results/dashboard-GIVEN-a-live-data-api/trace.zip
npx playwright trace actions --errors-only
npx playwright trace action 12
npx playwright trace snapshot 12 --phase before
npx playwright trace close
```

| Command | Shows |
|---|---|
| `open <trace.zip>` | Extracts the trace; prints browser, viewport, duration, action and error counts |
| `actions [--grep <pattern>] [--errors-only]` | Action tree with ids and timing; `--errors-only` keeps failed actions |
| `action <id>` | Params, result, call log, source line, available snapshot phases |
| `snapshot <id> [--phase before\|action\|after]` | The accessibility snapshot of the DOM at that action; `-- eval "<js>"` or `-- screenshot` runs one command against the frozen DOM |
| `requests [--failed] [--method <m>] [--status <code>] [--grep <url>]`, `request <id>` | Network log, one request's headers and body |
| `console [--errors-only] [--warnings] [--browser] [--stdio]` | Browser console and runner stdout / stderr |
| `errors` | Every error with its stack and action |
| `screenshot <id> -o <path>`, `attachments`, `attachment <n>` | Screencast frame and test attachments |
| `close` | Removes the extracted data |

Workflow: open, list failed actions, read the failing action's call log, snapshot it at `before` to see what the locator saw, then check `requests --failed` and `console --errors-only`. For a flake, record with `trace: 'retain-on-failure-and-retries'`, run the same commands on the failing and the passing attempt, and diff the two `actions` lists and the snapshots at the first action where they diverge.

### Trace Contents

- Screenshots at each action
- DOM snapshots
- Network requests/responses
- Console logs
- Action timeline
- Source code

### Programmatic Traces

`context.tracing` records a trace for part of a test. The util owns the options; the spec brackets the actions with two steps and keeps its `THEN` after them.

```ts
// e2e/dashboard/test/utils/tracing.spec.util.ts
import type { BrowserContext } from '@playwright/test';

const TRACE_OPTIONS = { screenshots: true, snapshots: true };

export const startTrace = (context: BrowserContext): Promise<void> => context.tracing.start(TRACE_OPTIONS);

export const stopTrace = (context: BrowserContext, path: string): Promise<void> => context.tracing.stop({ path });
```

```ts
// e2e/dashboard/dashboard.e2e.ts
import { test } from './dashboard.fixture';
import { startTrace, stopTrace } from './test/utils/tracing.spec.util';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN a live data api, a traced data load shows the data', async ({ context, dashboardPage }): Promise<void> => {
    await test.step('WHEN tracing is started', (): Promise<void> => startTrace(context));

    await test.step('AND the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('AND data is loaded', (): Promise<void> => dashboardPage.loadData());

    await test.step('AND tracing is stopped', (): Promise<void> => stopTrace(context, 'trace.zip'));

    await test.step('THEN the data is shown', (): Promise<void> => dashboardPage.expectDataLoaded());
  });
});
```

## Identifying Flaky Tests

If a test fails intermittently, it's likely flaky. Quick checks:

| Behavior                               | Likely Cause                  | Next Step                              |
| -------------------------------------- | ----------------------------- | -------------------------------------- |
| Fails sometimes, passes other times    | Flaky - timing/race condition | [flaky-tests.md](flaky-tests.md)       |
| Fails only with multiple workers       | Flaky - parallelism/isolation | [flaky-tests.md](flaky-tests.md)       |
| Fails only in CI                       | Environment difference        | [CI Debugging](#debugging-in-ci) below |
| Always fails                           | Bug in test or app            | Debug with tools above                 |
| Always passes locally, always fails CI | CI-specific issue             | [ci-cd.md](../infrastructure-ci-cd/ci-cd.md)                   |

> **For flaky test detection commands, root cause analysis, and fixing strategies**, see [flaky-tests.md](flaky-tests.md).

## Debugging Network Issues

### Monitor All Requests

The util registers three listeners and returns the log. `response` carries the status; `requestfailed` carries the failure text.

```ts
// e2e/dashboard/common/dashboard.type.ts
export type NetworkLog = {
  readonly failures: string[];
  readonly requests: string[];
};
```

```ts
// e2e/dashboard/test/utils/network-log.spec.util.ts
import type { Page, Request, Response } from '@playwright/test';

import type { NetworkLog } from '../../common/dashboard.type';

export const recordNetwork = (page: Page): NetworkLog => {
  const log: NetworkLog = { failures: [], requests: [] };

  page.on('request', (request: Request): number => log.requests.push(`>> ${request.method()} ${request.url()}`));
  page.on('response', (response: Response): number => log.requests.push(`<< ${response.status()} ${response.url()}`));
  page.on('requestfailed', (request: Request): number => log.failures.push(`FAILED: ${request.url()} - ${request.failure()?.errorText}`));

  return log;
};

export const logNetworkSummary = (log: NetworkLog): void => {
  console.log('Requests:', log.requests.length);

  if (log.failures.length > 0) console.log('Failures:', log.failures);
};
```

The `networkLog` fixture member calls `recordNetwork(page)` and passes the log to `use`, so the listeners exist before the test's `WHEN` opens the page. The summary prints in an `AND` step, and the `THEN` reads the same log to prove no request failed.

```ts
// e2e/dashboard/dashboard.e2e.ts
import { expect, test } from './dashboard.fixture';
import { logNetworkSummary } from './test/utils/network-log.spec.util';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN a recorded network log, opening the dashboard fails no request', async ({ dashboardPage, networkLog }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the network summary is printed', (): void => logNetworkSummary(networkLog));

    await test.step('THEN no request failed', (): void => expect(networkLog.failures).toEqual([]));
  });
});
```

### Wait for Specific API Response

When debugging network-dependent issues, wait for the specific API response instead of an arbitrary timeout. The page object starts waiting before it clicks and returns the response.

```ts
// e2e/dashboard/pages/dashboard.po.ts
import type { Locator, Page, Response } from '@playwright/test';

const isDataResponse = (response: Response): boolean => response.url().includes('/api/data') && response.status() === 200;

export class DashboardPage {
  public readonly loadButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.loadButton = page.getByRole('button', { name: 'Load' });
  }

  public async loadData(): Promise<Response> {
    const responsePromise = this.page.waitForResponse(isDataResponse);

    await this.loadButton.click();

    return responsePromise;
  }
}
```

The spec reads it as `const response = await test.step('AND data is loaded', (): Promise<Response> => dashboardPage.loadData());` and logs `response.status()` in the next step.

> **For comprehensive waiting patterns** (navigation, element state, network, polling), see [assertions-waiting.md](../core/assertions-waiting.md#waiting-strategies).

### Debug Slow Requests

`request.timing()` is available on `requestfinished`. The util prints every request over the threshold.

```ts
// e2e/dashboard/test/utils/slow-requests.spec.util.ts
import type { Page, Request } from '@playwright/test';

const logIfSlow = (request: Request, thresholdMs: number): void => {
  const timing = request.timing();
  const total = timing.responseEnd - timing.requestStart;

  if (total > thresholdMs) console.log(`SLOW (${total}ms): ${request.url()}`);
};

export const logSlowRequests = (page: Page, thresholdMs: number): void => {
  page.on('requestfinished', (request: Request): void => logIfSlow(request, thresholdMs));
};
```

Register it before navigation in a fixture, above `use`: `logSlowRequests(page, 1_000);`. No step wraps it.

## Debugging in CI

### Simulate CI Locally

```bash
# Run in headless mode like CI
CI=true npx playwright test

# Match CI browser versions
npx playwright install --with-deps

# Run in Docker (same as CI)
docker run --rm -v $(pwd):/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test
```

### CI-Specific Configuration

CI keeps more artifacts and retries more, but every retry is a failure to investigate.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);

const use = {
  screenshot: IS_CI ? 'only-on-failure' : 'off',
  trace: IS_CI ? 'on-first-retry' : 'off',
  video: IS_CI ? 'retain-on-failure' : 'off'
} as const;

export default defineConfig({
  retries: IS_CI ? 2 : 0,
  testMatch: '**/*.@(e2e|test).ts',
  use
});
```

### Debug CI Environment

`testInfo` knows the project, worker, retry, and configured `baseURL`; `page.viewportSize()` confirms the device profile.

```ts
// e2e/dashboard/test/utils/environment.spec.util.ts
import type { Page, TestInfo } from '@playwright/test';

export const logEnvironment = (page: Page, testInfo: TestInfo): void => {
  const viewport = page.viewportSize();

  console.log('CI:', process.env.CI);
  console.log('Project:', testInfo.project.name);
  console.log('Worker:', testInfo.workerIndex);
  console.log('Retry:', testInfo.retry);
  console.log('Base URL:', testInfo.project.use.baseURL);
  console.log('Viewport:', viewport);
};
```

Call it after the opening step as `await test.step('AND the environment is printed', (): void => logEnvironment(page, test.info()));`.

## Debugging Authentication

Two probes: one prints the cookies before navigation, the other saves the storage state to disk when the protected page redirected to login. The test's `THEN` checks that the protected page stayed open, so a redirect still fails the test, after the state is saved.

```ts
// e2e/dashboard/test/utils/auth-debug.spec.util.ts
import type { BrowserContext, Cookie, Page } from '@playwright/test';

const toName = (cookie: Cookie): string => cookie.name;

const isSession = (cookie: Cookie): boolean => cookie.name.includes('session');

export const logAuthState = async (context: BrowserContext): Promise<void> => {
  const cookies = await context.cookies();
  const sessionCookie = cookies.find(isSession);

  console.log('Cookies:', cookies.map(toName));
  console.log('Auth cookie:', sessionCookie ? 'present' : 'MISSING');
};

export const saveStateWhenRedirected = async (page: Page, context: BrowserContext): Promise<void> => {
  const isLogin = page.url().includes('/login');

  if (!isLogin) return;

  console.error('Auth failed - redirected to login');
  await context.storageState({ path: 'debug-auth.json' });
};
```

```ts
// e2e/dashboard/dashboard.e2e.ts
import { expect, test } from './dashboard.fixture';
import { logAuthState, saveStateWhenRedirected } from './test/utils/auth-debug.spec.util';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN a signed-in session, the protected page opens without a login redirect', async ({ context, page }): Promise<void> => {
    await test.step('WHEN the auth cookies are printed', (): Promise<void> => logAuthState(context));

    await test.step('AND the protected page is opened', async (): Promise<void> => {
      await page.goto('/protected');
    });

    await test.step('AND the state is saved when redirected to login', (): Promise<void> => saveStateWhenRedirected(page, context));

    await test.step('THEN the protected page stays open', (): Promise<void> => expect(page).toHaveURL(/\/protected/));
  });
});
```

## Debugging Screenshots

### Compare Visual State

The util writes a full-page screenshot to the test output folder and attaches it to the report under the same name.

```ts
// e2e/dashboard/test/utils/screenshot.spec.util.ts
import type { Page, TestInfo } from '@playwright/test';

export const attachFullPage = async (page: Page, testInfo: TestInfo, name: string): Promise<void> => {
  const path = testInfo.outputPath(`${name}.png`);

  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(name, { contentType: 'image/png', path });
};
```

```ts
// e2e/dashboard/dashboard.e2e.ts
import { test } from './dashboard.fixture';
import { attachFullPage } from './test/utils/screenshot.spec.util';

test.describe('FEATURE: dashboard', () => {
  test('GIVEN a closed menu, opening it shows the menu', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the before screenshot is attached', (): Promise<void> => attachFullPage(page, test.info(), 'before'));

    await test.step('AND the menu is opened', (): Promise<void> => dashboardPage.openMenu());

    await test.step('AND the after screenshot is attached', (): Promise<void> => attachFullPage(page, test.info(), 'after'));

    await test.step('THEN the menu is open', (): Promise<void> => dashboardPage.expectMenuOpen());
  });
});
```

### Screenshot Specific Element

A page object owns the problem element. One method screenshots the element alone; the other paints a border so the element stands out in a full-page screenshot.

```ts
// e2e/dashboard/pages/dashboard.po.ts
import type { Locator, Page } from '@playwright/test';

const highlight = (element: HTMLElement): void => {
  element.style.border = '3px solid red';
};

export class DashboardPage {
  public readonly problemArea: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.problemArea = page.getByTestId('problem-area');
  }

  public async screenshotProblemArea(path: string): Promise<void> {
    await this.problemArea.screenshot({ path });
  }

  public async highlightProblemArea(path: string): Promise<void> {
    await this.problemArea.evaluate(highlight);
    await this.page.screenshot({ path });
  }
}
```

## Common Issues

### Common Error Messages

| Message | Cause | Fix |
|---|---|---|
| `strict mode violation: <locator> resolved to N elements` | The locator matches more than one element and the action needs one | Narrow it in the page object: scope to a parent, add `name` / `exact`, or `filter({ hasText })` |
| `Target page, context or browser has been closed` | The test or fixture finished, or a popup closed, while a call was still pending | Await every call (see [Static checks](flaky-tests.md#static-checks)); keep the page open until the last `THEN` |
| `Execution context was destroyed, most likely because of a navigation` | `evaluate` ran while the page navigated | Wait for the navigation with `expect(page).toHaveURL()` first, or use a locator call that retries |
| `Executable doesn't exist at <path>` | Browsers missing for the installed Playwright version | `npx playwright install --with-deps`; in CI, cache keyed on the Playwright version |
| `Frame was detached` | The iframe was removed or reloaded under the call | Use `frameLocator`, which re-resolves; assert the frame content after it reloads |
| `Test timeout of 30000ms exceeded.` | The whole test (hooks and fixtures included) ran past `timeout` | Find the stuck step in the trace; `test.slow('reason')` only when the work is truly long |
| `locator.click: Timeout 30000ms exceeded.` with `waiting for element to be visible, enabled and stable` in the call log | Actionability never passed: hidden, disabled, or still animating | Assert the precondition state in an `expect*` method; fix the app state, not the timeout |
| `Element is not attached to the DOM` | The element re-rendered between resolve and action | Act through a locator, never a stored `ElementHandle` |
| `<element> intercepts pointer events` in the call log | An overlay, toast, or sticky header covers the target | Close or wait out the overlay through its page object; never `force: true` |

### Element Not Found

The probe prints how many elements match, their text, and takes a screenshot before the action that fails.

```ts
// e2e/dashboard/test/utils/locator-debug.spec.util.ts
import type { Locator, Page } from '@playwright/test';

export const logLocatorState = async (locator: Locator): Promise<void> => {
  const count = await locator.count();
  const visible = await locator.isVisible();
  const enabled = await locator.isEnabled();
  const texts = await locator.allTextContents();

  console.log('Count:', count, 'Visible:', visible, 'Enabled:', enabled);
  console.log('Texts:', texts);
};

export const screenshotBeforeAction = (page: Page): Promise<Buffer> => page.screenshot({ path: 'debug.png' });
```

Call it on the page-object locator: `await test.step('AND the button state is printed', (): Promise<void> => logLocatorState(dashboardPage.loadButton));`.

### Timeout Issues

| Scope | Call | Where |
|---|---|---|
| One assertion | `expect(this.loaded).toBeVisible({ timeout: 30_000 })` | Inside an `expect*` page-object method, as a plain `await expect(…)` |
| Every test in a spec | `test.setTimeout(60_000)` | First line of the `FEATURE` `test.describe` callback |
| One test | `test.slow('reason')` or `test('GIVEN <state>, <outcome>', { timeout: 60_000 }, …)` | Spec |

To see what is blocking, record network traffic with `recordNetwork(page)` from [Monitor All Requests](#monitor-all-requests) before opening the slow page.

### Selector Issues

- `await locator.highlight()` outlines the match in headed mode.
- In the Inspector console, `playwright.locator('button').first().highlight()` does the same for any selector.
- `logLocatorState(locator)` above prints count, visibility, and enabled state.

### Frame Issues

```ts
// e2e/dashboard/test/utils/frame-debug.spec.util.ts
import type { Page } from '@playwright/test';

export const logFrames = async (page: Page): Promise<void> => {
  const frames = page.frames();
  const firstFrame = page.frameLocator('iframe').first();
  const buttonCount = await firstFrame.getByRole('button').count();

  for (const frame of frames) {
    console.log('Frame:', frame.url());
  }

  console.log('Buttons in the first iframe:', buttonCount);
};
```

## Logging

### Capture Browser Console

The util forwards browser console lines and page errors to the runner output. Register it in an `auto` fixture above `use`, never in a hook step.

```ts
// e2e/dashboard/test/utils/browser-log.spec.util.ts
import type { ConsoleMessage, Page } from '@playwright/test';

const logMessage = (message: ConsoleMessage): void => console.log('Browser:', message.text());

const logError = (error: Error): void => console.log('Page error:', error.message);

export const logBrowserConsole = (page: Page): void => {
  page.on('console', logMessage);
  page.on('pageerror', logError);
};
```

> **For comprehensive console error handling** (fail on errors, allowed patterns, fixtures), see [console-errors.md](console-errors.md).

### Custom Test Attachments

`testInfo.attach` accepts a buffer or a string body; `testInfo.outputPath` gives a per-test folder for files written during the run.

```ts
// e2e/dashboard/test/utils/attachments.spec.util.ts
import type { Page, TestInfo } from '@playwright/test';

export const attachDebugArtifacts = async (page: Page, testInfo: TestInfo): Promise<void> => {
  const screenshot = await page.screenshot();
  const outputPath = testInfo.outputPath('debug-file.json');

  await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' });
  await testInfo.attach('logs', { body: 'Custom log data', contentType: 'text/plain' });
  console.log('Output path:', outputPath);
};
```

Call it as `await test.step('AND debug artifacts are attached', (): Promise<void> => attachDebugArtifacts(page, test.info()));`.

## Troubleshooting Checklist

### By Symptom

| Symptom                                       | Common Causes                                                | Quick Fixes                                                         | Reference                                                                  |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Element not found**                         | Wrong selector, element not visible, in iframe, timing issue | Check locator with Inspector, wait for visibility, use frameLocator | [locators.md](../core/locators.md), [assertions-waiting.md](../core/assertions-waiting.md) |
| **Timeout errors**                            | Slow network, heavy page load, waiting for wrong condition   | Increase timeout, wait for specific response, check network tab     | [assertions-waiting.md](../core/assertions-waiting.md)                             |
| **Flaky tests**                               | Race conditions, shared state, timing dependencies           | See comprehensive flaky test guide                                  | [flaky-tests.md](flaky-tests.md)                                           |
| **Tests pass locally, fail in CI**            | Environment differences, missing dependencies, timing        | Simulate CI locally, check CI logs, verify environment vars         | [ci-cd.md](../infrastructure-ci-cd/ci-cd.md), [flaky-tests.md](flaky-tests.md)                     |
| **Slow test execution**                       | Not parallelized, heavy network calls, unnecessary waits     | Enable parallelization, mock APIs, optimize waits                   | [performance.md](../infrastructure-ci-cd/performance.md)                                           |
| **Selector works in browser but not in test** | Element not attached, wrong context, dynamic content         | Use auto-waiting, check iframe, verify element state                | [locators.md](../core/locators.md)                                                 |
| **Test fails on retry**                       | Non-deterministic data, external dependencies                | Use test data fixtures, mock external services                      | [fixtures-hooks.md](../core/fixtures-hooks.md)                                     |

### Step-by-Step Debugging Process

1. **Reproduce the issue**

   ```bash
   # Run with trace enabled
   npx playwright test tests/failing.e2e.ts --trace on

   # If intermittent, run multiple times
   npx playwright test --repeat-each=10
   ```

2. **Inspect the failure**

   ```bash
   # View trace
   npx playwright show-trace test-results/path-to-trace.zip

   # Run in headed mode to watch
   npx playwright test --headed

   # Use inspector for step-by-step
   PWDEBUG=1 npx playwright test
   ```

3. **Isolate the problem**

   Add three steps before the failing one: pause, print the locator state, and screenshot.

   ```ts
   // e2e/dashboard/dashboard.e2e.ts
   await test.step('AND the inspector is paused', (): Promise<void> => page.pause());

   await test.step('AND the button state is printed', (): Promise<void> => logLocatorState(dashboardPage.loadButton));

   await test.step('AND a screenshot is taken before the action', (): Promise<Buffer> => screenshotBeforeAction(page));
   ```

4. **Check related areas**
   - Network requests: Are API calls completing? (see [Debugging Network Issues](#debugging-network-issues))
   - Timing: Is auto-waiting working correctly?
   - State: Is the test isolated? (see [flaky-tests.md](flaky-tests.md))
   - Environment: Does it work locally but fail in CI? (see [Debugging in CI](#debugging-in-ci))

5. **Apply fix and verify**
   - Fix the root cause (not just symptoms)
   - Run multiple times to confirm stability: `--repeat-each=10`
   - Check related tests aren't affected

## Related References

- **Flaky tests**: See [flaky-tests.md](flaky-tests.md) for comprehensive flaky test guide
- **Locator issues**: See [locators.md](../core/locators.md) for selector strategies
- **Waiting problems**: See [assertions-waiting.md](../core/assertions-waiting.md) for waiting patterns
- **Test isolation**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for fixtures and isolation
- **CI issues**: See [ci-cd.md](../infrastructure-ci-cd/ci-cd.md) for CI configuration
