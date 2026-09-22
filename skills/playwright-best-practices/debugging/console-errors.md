# Browser Console & JavaScript Error Handling

## Table of Contents

1. [Capturing Console Messages](#capturing-console-messages)
2. [Failing on Console Errors](#failing-on-console-errors)
3. [JavaScript Error Detection](#javascript-error-detection)
4. [Monitoring Warnings](#monitoring-warnings)
5. [Console Fixtures](#console-fixtures)

Every sample lives under `e2e/console/`. A listener registered in a fixture runs before the test body, so nothing is missed. The shared types and the page object come first; the fixture under [Basic Console Capture](#basic-console-capture) holds every member the two specs in this file destructure. Later sections add one member and its util in isolation; a real `console.fixture.ts` holds only what the feature needs.

```ts
// e2e/console/common/console.type.ts
import type { Route } from '@playwright/test';

export type ConsoleCapture = {
  readonly errors: string[];
  readonly infos: string[];
  readonly warnings: string[];
};

export type ConsoleError = {
  readonly location: string;
  readonly message: string;
};

type ConsoleLocation = {
  readonly line: number;
  readonly url: string;
};

export type ConsoleRecord = {
  readonly location: ConsoleLocation;
  readonly text: string;
  readonly timestamp: number;
  readonly type: string;
};

export type ConsoleFilter = () => ConsoleRecord[];

export type NoErrorsAssertion = (allowed?: RegExp[]) => void;

export type RouteHandler = (route: Route) => Promise<void>;
```

```ts
// e2e/console/pages/dashboard.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { RouteHandler } from '../common/console.type';

export class DashboardPage {
  public readonly fallback: Locator;
  public readonly loadButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.fallback = page.getByText('Something went wrong');
    this.loadButton = page.getByRole('button', { name: 'Load Data' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  public async loadData(): Promise<void> {
    await this.loadButton.click();
  }

  public async routeData(handler: RouteHandler): Promise<void> {
    await this.page.route('**/api/data', handler);
  }

  public async expectFallback(): Promise<void> {
    await test.step('error boundary fallback is shown', (): Promise<void> => expect(this.fallback).toBeVisible(), { box: true });
  }
}
```

## Capturing Console Messages

### Basic Console Capture

`consoleLogs` hands the test a growing array of `type: text` lines. `consoleErrors` and `pageErrors` are the members the specs below assert on; `collectErrorText` is defined under [Fail Test on Any Error](#fail-test-on-any-error).

```ts
// e2e/console/console.fixture.ts
import type { ConsoleMessage } from '@playwright/test';
import { test as base } from '@playwright/test';

import { DashboardPage } from './pages/dashboard.page';
import { collectErrorText } from './test/utils/console-error.spec.util';

type ConsoleFixtures = {
  readonly consoleErrors: string[];
  readonly consoleLogs: string[];
  readonly dashboardPage: DashboardPage;
  readonly pageErrors: Error[];
};

export const test = base.extend<ConsoleFixtures>({
  consoleErrors: async ({ page }, use): Promise<void> => {
    const errors: string[] = [];

    page.on('console', (message: ConsoleMessage): void => collectErrorText(errors, message));
    await use(errors);
  },
  consoleLogs: async ({ page }, use): Promise<void> => {
    const logs: string[] = [];

    page.on('console', (message: ConsoleMessage): number => logs.push(`${message.type()}: ${message.text()}`));
    await use(logs);
  },
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  pageErrors: async ({ page }, use): Promise<void> => {
    const errors: Error[] = [];

    page.on('pageerror', (error: Error): number => errors.push(error));
    await use(errors);
  }
});

export { expect } from '@playwright/test';
```

A spec that only wants the lines opens the dashboard and prints `consoleLogs` in a `THEN` step; see the table under [Fail Test on Any Error](#fail-test-on-any-error).

### Capture by Type

`ConsoleCapture` holds one array per level. The `switch` covers the levels the test cares about and ignores the rest through `default`.

```ts
// e2e/console/test/utils/console-capture.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';

import type { ConsoleCapture } from '../../common/console.type';

export const collectByType = (capture: ConsoleCapture, message: ConsoleMessage): void => {
  const text = message.text();

  switch (message.type()) {
    case 'error':
      capture.errors.push(text);
      break;
    case 'warning':
      capture.warnings.push(text);
      break;
    case 'info':
    case 'log':
      capture.infos.push(text);
      break;
    default:
      break;
  }
};
```

The fixture member `consoleCapture` creates `{ errors: [], infos: [], warnings: [] }`, registers `page.on('console', (message: ConsoleMessage): void => collectByType(capture, message))`, and passes the object to `use`. The spec asserts `expect(consoleCapture.errors).toHaveLength(0)` in one step and prints `consoleCapture.warnings` in another.

### Capture with Stack Trace

`message.location()` carries the source URL and line. The util turns a message into a `ConsoleError` so the report can point at the file.

```ts
// e2e/console/test/utils/console-error-detail.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';

import type { ConsoleError } from '../../common/console.type';

const toConsoleError = (message: ConsoleMessage): ConsoleError => {
  const source = message.location();
  const consoleError: ConsoleError = { location: `${source.url}:${source.lineNumber}`, message: message.text() };

  return consoleError;
};

export const collectErrorDetail = (errors: ConsoleError[], message: ConsoleMessage): void => {
  const isError = message.type() === 'error';

  if (isError) errors.push(toConsoleError(message));
};

export const logConsoleError = (error: ConsoleError): void => console.log(`Error: ${error.message}\n  at ${error.location}`);
```

The fixture member `consoleErrorDetails: ConsoleError[]` registers `collectErrorDetail`; the spec opens `/buggy-page` and runs `consoleErrorDetails.forEach(logConsoleError)` in a step.

## Failing on Console Errors

### Fail Test on Any Error

The collector keeps only `error` messages. The assertion util joins them into the failure message so the report names every line.

```ts
// e2e/console/test/utils/console-error.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';

export const collectErrorText = (errors: string[], message: ConsoleMessage): void => {
  const isError = message.type() === 'error';

  if (isError) errors.push(message.text());
};

export const expectNoConsoleErrors = (errors: string[]): void => {
  const report = errors.join('\n');

  expect(errors, `Console errors found:\n${report}`).toHaveLength(0);
};
```

```ts
// e2e/console/console-error.test.ts
import { test } from './console.fixture';
import { expectNoConsoleErrors } from './test/utils/console-error.spec.util';

test.describe('FEATURE: console errors', () => {
  test.describe('GIVEN the dashboard', () => {
    test('SCENARIO: loading data logs no console error', async ({ consoleErrors, dashboardPage }): Promise<void> => {
      await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());

      await test.step('WHEN data is loaded', (): Promise<void> => dashboardPage.loadData());

      await test.step('THEN no console error was logged', (): void => expectNoConsoleErrors(consoleErrors));
    });
  });
});
```

Every other capture in this file is a spec of the same shape: open the dashboard, act, then one `THEN` step on the fixture member. Only these cells change.

| Section | Fixture member | Listener | `THEN` step body |
|---|---|---|---|
| Basic Console Capture | `consoleLogs: string[]` | inline `push` above | `(): void => console.log('Captured logs:', consoleLogs)` |
| Fail with Allowed Exceptions | `unexpectedErrors: string[]` | `collectUnexpectedError` | `(): void => expect(unexpectedErrors).toEqual([])` |
| Catch Uncaught Exceptions | `pageErrors: Error[]` | `page.on('pageerror')` above | `(): void => expectNoPageErrors(pageErrors)` |
| Capture Deprecation Warnings | `deprecations: string[]` | `collectDeprecation` | `(): void => expect(deprecations).toEqual([])` |
| React Development Warnings | `reactWarnings: string[]` | `collectReactWarning` | `const critical = await test.step('AND the critical warnings are kept', (): string[] => criticalReactWarnings(reactWarnings));` then `(): void => expect(critical).toEqual([])` |
| Comprehensive Console Fixture | `assertNoErrors: NoErrorsAssertion` | `consoleMessages` below | `(): void => assertNoErrors([/favicon/])` |

### Fail with Allowed Exceptions

Known noise (favicon 404s, `ResizeObserver` loops) is listed once as patterns. The collector drops matches before they reach the array, so `toEqual([])` prints only the unexpected lines.

```ts
// e2e/console/test/utils/unexpected-error.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';

const ALLOWED_CONSOLE_ERRORS: RegExp[] = [/Failed to load resource.*favicon/, /ResizeObserver loop/];

const isAllowed = (text: string): boolean => ALLOWED_CONSOLE_ERRORS.some((pattern: RegExp): boolean => pattern.test(text));

export const collectUnexpectedError = (errors: string[], message: ConsoleMessage): void => {
  const isError = message.type() === 'error';
  const text = message.text();
  const allowed = isAllowed(text);

  if (isError && !allowed) errors.push(text);
};
```

### Auto-Fail Fixture

An `auto` fixture runs for every test without being destructured. Teardown after `use()` throws when the array is not empty and records the lines as an annotation.

```ts
// e2e/console/test/utils/fail-on-console-error.spec.util.ts
import type { TestInfo } from '@playwright/test';

export const throwOnConsoleErrors = (errors: string[], testInfo: TestInfo): void => {
  if (errors.length === 0) return;

  const description = errors.join('\n');

  testInfo.annotations.push({ description, type: 'console-errors' });

  throw new Error(`Console errors detected:\n${description}`);
};
```

```ts
// e2e/console/console.fixture.ts
import type { ConsoleMessage } from '@playwright/test';
import { test as base } from '@playwright/test';

import { collectErrorText } from './test/utils/console-error.spec.util';
import { throwOnConsoleErrors } from './test/utils/fail-on-console-error.spec.util';

type ConsoleFixtures = {
  readonly failOnConsoleError: void;
};

export const test = base.extend<ConsoleFixtures>({
  failOnConsoleError: [
    async ({ page }, use, testInfo): Promise<void> => {
      const errors: string[] = [];

      page.on('console', (message: ConsoleMessage): void => collectErrorText(errors, message));
      await use();
      throwOnConsoleErrors(errors, testInfo);
    },
    { auto: true }
  ]
});

export { expect } from '@playwright/test';
```

## JavaScript Error Detection

### Catch Uncaught Exceptions

`pageerror` fires for exceptions no handler caught. The `pageErrors` fixture member stores the `Error` objects; `message` and `stack` come with them, so no copy type is needed.

```ts
// e2e/console/test/utils/page-error.spec.util.ts
import { expect } from '@playwright/test';

const toMessage = (error: Error): string => error.message;

export const expectNoPageErrors = (errors: Error[]): void => {
  const report = errors.map(toMessage).join('\n');

  expect(errors, `Uncaught exceptions:\n${report}`).toHaveLength(0);
};

export const logPageError = (error: Error): void => console.log(`  Message: ${error.message}\n  Stack: ${error.stack}`);
```

### Capture Error Details

Reuse the `pageErrors` fixture and print each entry with `pageErrors.forEach(logPageError)` in a step. The `stack` property is already on the `Error`.

### Test Error Boundary Triggers

React error boundaries catch render errors before they become `pageerror` events, so the listener only fires for errors the boundary missed. A `null` payload makes the widget crash on render; the boundary shows its fallback and `pageErrors` stays empty. `null` is still a payload: `WIDGET_DATA_NULL_STUB` is typed `WidgetData | null` in `test/stubs/data.stub.ts`.

```ts
// e2e/console/test/mocks/data.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../common/console.type';
import { WIDGET_DATA_NULL_STUB } from '../stubs/data.stub';

export const brokenDataMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: WIDGET_DATA_NULL_STUB });
};
```

```ts
// e2e/console/error-boundary.test.ts
import { expect, test } from './console.fixture';
import { brokenDataMock } from './test/mocks/data.mock';

test.describe('FEATURE: error boundary', () => {
  test.describe('GIVEN the data endpoint returns null', () => {
    test('SCENARIO: rendering the dashboard lets the boundary catch the error', async ({ dashboardPage, pageErrors }): Promise<void> => {
      await test.step('GIVEN data is routed to a null payload', (): Promise<void> => dashboardPage.routeData(brokenDataMock()));

      await test.step('WHEN the dashboard opens', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN the fallback is shown', (): Promise<void> => dashboardPage.expectFallback());

      await test.step('AND no exception escaped the boundary', (): void => expect(pageErrors).toEqual([]));
    });
  });
});
```

## Monitoring Warnings

### Capture Deprecation Warnings

The collector keeps `warning` messages that mention deprecation. The spec asserts the list is empty; to only report, replace the assertion step with `deprecations.forEach(...)` and a `console.warn`.

```ts
// e2e/console/test/utils/deprecation.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';

export const collectDeprecation = (deprecations: string[], message: ConsoleMessage): void => {
  const isWarning = message.type() === 'warning';
  const text = message.text();
  const mentionsDeprecation = text.includes('deprecated') || text.includes('Deprecation');

  if (isWarning && mentionsDeprecation) deprecations.push(text);
};
```

### React Development Warnings

React prefixes its development warnings with `Warning:`. Only a few of them point at real bugs; the util keeps those, and the spec filters with `criticalReactWarnings` in an `AND` step before asserting.

```ts
// e2e/console/test/utils/react-warning.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';

const CRITICAL_REACT_WARNINGS: string[] = [
  'Each child in a list should have a unique',
  'Cannot update a component',
  "Can't perform a React state update"
];

const isCritical = (warning: string): boolean => CRITICAL_REACT_WARNINGS.some((needle: string): boolean => warning.includes(needle));

export const collectReactWarning = (warnings: string[], message: ConsoleMessage): void => {
  const isWarning = message.type() === 'warning';
  const text = message.text();
  const isReact = text.includes('Warning:') || text.includes('React');

  if (isWarning && isReact) warnings.push(text);
};

export const criticalReactWarnings = (warnings: string[]): string[] => warnings.filter(isCritical);
```

## Console Fixtures

### Comprehensive Console Fixture

One fixture records every message as a `ConsoleRecord` with type, text, location, and timestamp. Two filter fixtures return the errors or warnings on demand, and `assertNoErrors` fails through `expect` so the report lists the offending lines.

```ts
// e2e/console/test/utils/console-record.spec.util.ts
import type { ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';

import type { ConsoleRecord } from '../../common/console.type';

export const toConsoleRecord = (message: ConsoleMessage): ConsoleRecord => {
  const source = message.location();
  const location = { line: source.lineNumber, url: source.url };
  const record: ConsoleRecord = { location, text: message.text(), timestamp: Date.now(), type: message.type() };

  return record;
};

export const isConsoleError = (record: ConsoleRecord): boolean => record.type === 'error';

export const isConsoleWarning = (record: ConsoleRecord): boolean => record.type === 'warning';

export const expectNoUnexpectedErrors = (errors: ConsoleRecord[], allowed: RegExp[]): void => {
  const isAllowed = (record: ConsoleRecord): boolean => allowed.some((pattern: RegExp): boolean => pattern.test(record.text));
  const unexpected = errors.filter((record: ConsoleRecord): boolean => !isAllowed(record));
  const report = unexpected.map((record: ConsoleRecord): string => record.text).join('\n');

  expect(unexpected, `Unexpected console errors:\n${report}`).toHaveLength(0);
};
```

```ts
// e2e/console/console.fixture.ts
import type { ConsoleMessage } from '@playwright/test';
import { test as base } from '@playwright/test';

import type { ConsoleFilter, ConsoleRecord, NoErrorsAssertion } from './common/console.type';
import { expectNoUnexpectedErrors, isConsoleError, isConsoleWarning, toConsoleRecord } from './test/utils/console-record.spec.util';

type ConsoleFixtures = {
  readonly assertNoErrors: NoErrorsAssertion;
  readonly consoleMessages: ConsoleRecord[];
  readonly getConsoleErrors: ConsoleFilter;
  readonly getConsoleWarnings: ConsoleFilter;
};

export const test = base.extend<ConsoleFixtures>({
  assertNoErrors: async ({ getConsoleErrors }, use): Promise<void> => {
    await use((allowed: RegExp[] = []): void => expectNoUnexpectedErrors(getConsoleErrors(), allowed));
  },
  consoleMessages: async ({ page }, use): Promise<void> => {
    const messages: ConsoleRecord[] = [];

    page.on('console', (message: ConsoleMessage): number => messages.push(toConsoleRecord(message)));
    await use(messages);
  },
  getConsoleErrors: async ({ consoleMessages }, use): Promise<void> => {
    await use((): ConsoleRecord[] => consoleMessages.filter(isConsoleError));
  },
  getConsoleWarnings: async ({ consoleMessages }, use): Promise<void> => {
    await use((): ConsoleRecord[] => consoleMessages.filter(isConsoleWarning));
  }
});

export { expect } from '@playwright/test';
```

### Attach Console to Report

An `auto` fixture collects console lines and page errors, then attaches them as `console-log` after the test body. The attachment shows up in the HTML report and the trace.

```ts
// e2e/console/test/utils/console-attachment.spec.util.ts
import type { TestInfo } from '@playwright/test';

export const attachConsoleLog = (lines: string[], testInfo: TestInfo): Promise<void> => {
  const body = lines.join('\n');

  return testInfo.attach('console-log', { body, contentType: 'text/plain' });
};
```

```ts
// e2e/console/console.fixture.ts
import type { ConsoleMessage } from '@playwright/test';
import { test as base } from '@playwright/test';

import { attachConsoleLog } from './test/utils/console-attachment.spec.util';

type ConsoleFixtures = {
  readonly attachedConsole: void;
};

export const test = base.extend<ConsoleFixtures>({
  attachedConsole: [
    async ({ page }, use, testInfo): Promise<void> => {
      const lines: string[] = [];

      page.on('console', (message: ConsoleMessage): number => lines.push(`[${message.type()}] ${message.text()}`));
      page.on('pageerror', (error: Error): number => lines.push(`[EXCEPTION] ${error.message}`));
      await use();
      await attachConsoleLog(lines, testInfo);
    },
    { auto: true }
  ]
});

export { expect } from '@playwright/test';
```

## Anti-Patterns to Avoid

| Anti-Pattern               | Problem                    | Solution                    |
| -------------------------- | -------------------------- | --------------------------- |
| Ignoring console errors    | Bugs go unnoticed          | Check for errors in tests   |
| Too strict error checking  | Tests fail on minor issues | Allow known/expected errors |
| Not capturing stack traces | Hard to debug              | Include location info       |
| Checking only at end       | Miss errors during actions | Capture continuously        |

## Related References

- **Debugging**: See [debugging.md](debugging.md) for troubleshooting
- **Error Testing**: See [error-testing.md](error-testing.md) for error scenarios
