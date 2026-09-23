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

Debug probes are throwaway code, but they still follow the house shape: a probe is a function in `e2e/<feature>/test/utils/<name>.spec.util.ts`, and the spec calls it from a step. Samples below use the `dashboard` feature; `dashboardPage` is the page object from [console-errors.md](console-errors.md).

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
```

`slowMo` adds an `N` ms delay per action, which makes test execution easier to follow while debugging.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const launchOptions = { slowMo: 500 };

const use = { launchOptions };

export default defineConfig({ use });
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

`page.pause()` stops the test and opens the Inspector at that point. It is a step like any other, so it is easy to find and delete.

```ts
// e2e/dashboard/dashboard.e2e.ts
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard', () => {
  test.describe('GIVEN the dashboard', () => {
    test('SCENARIO: inspector opens before the load click', async ({ dashboardPage, page }): Promise<void> => {
      await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());

      await test.step('WHEN the run pauses for the inspector', (): Promise<void> => page.pause());

      await test.step('AND data is loaded', (): Promise<void> => dashboardPage.loadData());
    });
  });
});
```

## Trace Viewer

### Enable Traces

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const use = { trace: 'on-first-retry' } as const;

export default defineConfig({ use });
```

| `trace` value | Behavior |
|---|---|
| `'on-first-retry'` | Record on the first retry only |
| `'on'` | Always record |
| `'retain-on-failure'` | Record every test, keep only failures |
| `'off'` | Never record |

### View Traces

```bash
# Open trace file
npx playwright show-trace trace.zip

# From test-results
npx playwright show-trace test-results/test-name/trace.zip
```

### Trace Contents

- Screenshots at each action
- DOM snapshots
- Network requests/responses
- Console logs
- Action timeline
- Source code

### Programmatic Traces

`context.tracing` records a trace for part of a test. The util owns the options; the spec brackets the actions with two steps.

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
  test.describe('GIVEN the dashboard', () => {
    test('SCENARIO: data load flow is saved as a trace', async ({ context, dashboardPage }): Promise<void> => {
      await test.step('GIVEN tracing is started', (): Promise<void> => startTrace(context));

      await test.step('AND the dashboard is open', (): Promise<void> => dashboardPage.goto());

      await test.step('AND data is loaded', (): Promise<void> => dashboardPage.loadData());

      await test.step('WHEN tracing is stopped', (): Promise<void> => stopTrace(context, 'trace.zip'));
    });
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

```ts
// e2e/dashboard/dashboard.e2e.ts
import type { NetworkLog } from './common/dashboard.type';
import { test } from './dashboard.fixture';
import { logNetworkSummary, recordNetwork } from './test/utils/network-log.spec.util';

test.describe('FEATURE: dashboard', () => {
  test.describe('GIVEN the dashboard', () => {
    test('SCENARIO: page load prints the network log', async ({ dashboardPage, page }): Promise<void> => {
      const network = await test.step('GIVEN network traffic is recorded', (): NetworkLog => recordNetwork(page));

      await test.step('AND the dashboard is open', (): Promise<void> => dashboardPage.goto());

      await test.step('WHEN the network summary is printed', (): void => logNetworkSummary(network));
    });
  });
});
```

### Wait for Specific API Response

When debugging network-dependent issues, wait for the specific API response instead of an arbitrary timeout. The page object starts waiting before it clicks and returns the response.

```ts
// e2e/dashboard/pages/dashboard.page.ts
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

The spec reads it as `const response = await test.step('WHEN data is loaded', (): Promise<Response> => dashboardPage.loadData());` and logs `response.status()` in the next step.

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

Call it before navigation: `await test.step('GIVEN requests over 1s are logged', (): void => logSlowRequests(page, 1_000));`.

## Debugging in CI

### Simulate CI Locally

```bash
# Run in headless mode like CI
CI=true npx playwright test

# Match CI browser versions
npx playwright install --with-deps

# Run in Docker (same as CI)
docker run --rm -v $(pwd):/work -w /work \
  mcr.microsoft.com/playwright:v1.40.0-jammy \
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

Call it as `await test.step('GIVEN the environment is printed', (): void => logEnvironment(page, test.info()));`.

## Debugging Authentication

Two probes: one prints the cookies before navigation, the other saves the storage state to disk when the protected page redirected to login.

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
import { test } from './dashboard.fixture';
import { logAuthState, saveStateWhenRedirected } from './test/utils/auth-debug.spec.util';

test.describe('FEATURE: dashboard', () => {
  test.describe('GIVEN a stored session', () => {
    test('SCENARIO: protected page open inspects the auth state', async ({ context, page }): Promise<void> => {
      await test.step('WHEN the cookies are printed', (): Promise<void> => logAuthState(context));

      await test.step('AND the protected page is opened', async (): Promise<void> => {
        await page.goto('/protected');
      });

      await test.step('AND the state is saved when redirected to login', (): Promise<void> => saveStateWhenRedirected(page, context));
    });
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
  test.describe('GIVEN the dashboard', () => {
    test('SCENARIO: menu open attaches before and after screenshots', async ({ dashboardPage, page }): Promise<void> => {
      await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());

      await test.step('AND the before screenshot is attached', (): Promise<void> => attachFullPage(page, test.info(), 'before'));

      await test.step('AND the menu is opened', (): Promise<void> => dashboardPage.openMenu());

      await test.step('WHEN the after screenshot is attached', (): Promise<void> => attachFullPage(page, test.info(), 'after'));
    });
  });
});
```

### Screenshot Specific Element

A page object owns the problem element. One method screenshots the element alone; the other paints a border so the element stands out in a full-page screenshot.

```ts
// e2e/dashboard/pages/dashboard.page.ts
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
| One assertion | `expect(this.loaded).toBeVisible({ timeout: 30_000 })` | Inside a boxed `expect*` page-object method |
| Every test in a group | `test.setTimeout(60_000)` | First line of the `test.describe` callback |
| One test | `test.slow('reason')` or `test('SCENARIO: <flow>', { timeout: 60_000 }, …)` | Spec |

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

The util forwards browser console lines and page errors to the runner output. Register it in a `beforeEach` step.

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
   await test.step('GIVEN the inspector is paused', (): Promise<void> => page.pause());

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
