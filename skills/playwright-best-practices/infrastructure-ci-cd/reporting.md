# Test Reports & Artifacts

## Table of Contents

1. [CLI Commands](#cli-commands)
2. [Reporter Configuration](#reporter-configuration)
3. [Custom Reporter](#custom-reporter)
4. [Trace Configuration](#trace-configuration)
5. [Screenshot & Video Settings](#screenshot--video-settings)
6. [Artifact Directory Structure](#artifact-directory-structure)
7. [CI Artifact Upload](#ci-artifact-upload)
8. [Decision Guide](#decision-guide)
9. [Anti-Patterns](#anti-patterns)
10. [Troubleshooting](#troubleshooting)

> **When to use**: Configuring test output for debugging, CI dashboards, and team visibility.

## CLI Commands

```bash
# Display last HTML report
npx playwright show-report

# Specify reporter
npx playwright test --reporter=html
npx playwright test --reporter=dot           # minimal CI output
npx playwright test --reporter=line          # one line per test
npx playwright test --reporter=json          # machine-readable
npx playwright test --reporter=junit         # CI integration

# Combine reporters
npx playwright test --reporter=dot,html

# Merge sharded reports
npx playwright merge-reports --reporter=html ./blob-report
```

## Reporter Configuration

### Environment-Based Setup

The two reporter lists are named consts typed `ReporterDescription[]`; `defineConfig` picks one on `process.env.CI`.

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const CI_REPORTER: ReporterDescription[] = [
  ['dot'],
  ['html', { open: 'never' }],
  ['junit', { outputFile: 'results/junit.xml' }],
  ['github']
];

const LOCAL_REPORTER: ReporterDescription[] = [['list'], ['html', { open: 'on-failure' }]];

export default defineConfig({
  reporter: process.env.CI ? CI_REPORTER : LOCAL_REPORTER
});
```

### Reporter Types

| Reporter | Output | Use Case |
|---|---|---|
| `list` | One line per test | Local development |
| `line` | Single updating line | Local, less verbose |
| `dot` | `.` pass, `F` fail | CI logs |
| `html` | Interactive HTML page | Post-run analysis |
| `json` | Machine-readable JSON | Custom tooling |
| `junit` | JUnit XML | CI platforms |
| `github` | PR annotations | GitHub Actions |
| `blob` | Binary archive | Shard merging |

### File Output Options

| Reporter | Option | Effect |
|---|---|---|
| `json` | `outputFile: 'results/output.json'` | Writes JSON to a file instead of stdout |
| `junit` | `outputFile: 'results/junit.xml'` | Writes XML to a file instead of stdout |
| `junit` | `stripANSIControlSequences: true` | Removes colour codes from failure messages |
| `junit` | `includeProjectInTestName: true` | Prefixes each test name with its project |
| `html` | `outputFolder: 'playwright-report'` | Report directory |
| `html` | `open: 'never' \| 'on-failure' \| 'always'` | Whether to open the report after the run |

### JUnit Customization

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const junitOptions = {
  includeProjectInTestName: true,
  outputFile: 'results/junit.xml',
  stripANSIControlSequences: true
};

const reporter: ReporterDescription[] = [['junit', junitOptions]];

export default defineConfig({ reporter });
```

## Custom Reporter

Build custom reporters for Slack notifications, database logging, or dashboards. The reporter counts outcomes in `onTestEnd` and posts a summary in `onEnd`. The webhook URL is read from the environment once, in the config, and reaches the reporter as an option. The message lists the first five failures. `AbortSignal.timeout` caps the HTTP call so a slow webhook cannot hold the pipeline; a failed call is logged and swallowed so it never fails the run.

```ts
// e2e/reporters/notification.reporter.ts
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

type NotificationReporterOptions = {
  readonly webhookUrl: string | undefined;
};

const HEADERS = { 'Content-Type': 'application/json' } as const;
const MAX_LISTED_FAILURES = 5;
const WEBHOOK_TIMEOUT_MS = 5_000;

const asBullet = (failure: string): string => `  - ${failure}`;

class NotificationReporter implements Reporter {
  private readonly failures: string[] = [];
  private readonly options: NotificationReporterOptions;
  private failed = 0;
  private passed = 0;
  private skipped = 0;

  public constructor(options: NotificationReporterOptions) {
    this.options = options;
  }

  public onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed') this.passed += 1;
    if (result.status === 'skipped') this.skipped += 1;

    const isFailure = result.status === 'failed' || result.status === 'timedOut';

    if (!isFailure) return;

    this.failed += 1;
    this.failures.push(`${test.title}: ${result.error?.message?.split('\n')[0]}`);
  }

  public async onEnd(result: FullResult): Promise<void> {
    if (this.options.webhookUrl === undefined) return;

    const status = this.failed > 0 ? 'FAILED' : 'PASSED';
    const seconds = (result.duration / 1000).toFixed(1);
    const counts = `Passed: ${this.passed} | Failed: ${this.failed} | Skipped: ${this.skipped}`;
    const listed = this.failures.slice(0, MAX_LISTED_FAILURES).map(asBullet);
    const text = [`Tests ${status}`, counts, `Duration: ${seconds}s`, ...listed].join('\n');
    const body = JSON.stringify({ text });
    const signal = AbortSignal.timeout(WEBHOOK_TIMEOUT_MS);

    try {
      await fetch(this.options.webhookUrl, { body, headers: HEADERS, method: 'POST', signal });
    } catch (error) {
      console.warn('Webhook notification failed', error);
    }
  }
}

export default NotificationReporter;
```

Register the reporter by path with its options object as the second tuple member:

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const notificationOptions = { webhookUrl: process.env.NOTIFICATION_WEBHOOK };

const reporter: ReporterDescription[] = [
  ['dot'],
  ['html', { open: 'never' }],
  ['./reporters/notification.reporter.ts', notificationOptions]
];

export default defineConfig({ reporter });
```

## Trace Configuration

Traces capture actions, network requests, DOM snapshots, and console logs. `on-first-retry` needs `retries` above zero or it never records.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const use = { trace: 'on-first-retry' } as const;

export default defineConfig({
  retries: process.env.CI ? 2 : 0,
  use
});
```

### Trace Options

| Value | Behavior | Overhead |
|---|---|---|
| `'off'` | Never records | None |
| `'on'` | Every test | High |
| `'on-first-retry'` | On first retry after failure | Minimal |
| `'retain-on-failure'` | Records all, keeps failures | Medium |
| `'retain-on-first-failure'` | Records all, keeps first failure | Medium |

### Viewing Traces

```bash
# Local trace viewer
npx playwright show-trace results/my-test/trace.zip

# From HTML report (click Traces tab)
npx playwright show-report

# Online viewer: https://trace.playwright.dev
```

## Screenshot & Video Settings

`video` takes either a mode string or an object with `mode` and `size`. The object form is a named const; the plain string form is `video: 'retain-on-failure'` in `use`.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const videoSize = { height: 720, width: 1280 };

const video = { mode: 'retain-on-failure', size: videoSize } as const;

const use = { screenshot: 'only-on-failure', video } as const;

export default defineConfig({ use });
```

### Screenshot Options

| Value | Captures | Disk Cost |
|---|---|---|
| `'off'` | Never | None |
| `'on'` | Every test | High |
| `'only-on-failure'` | Failed tests | Low |

### Video Options

| Value | Records | Keeps | Disk Cost |
|---|---|---|---|
| `'off'` | Never | — | None |
| `'on'` | Every test | All | Very high |
| `'on-first-retry'` | On retry | Retried | Low |
| `'retain-on-failure'` | Every test | Failed | Medium |

## Artifact Directory Structure

```text
test-results/
├── checkout-test-chromium/
│   ├── trace.zip
│   ├── test-failed-1.png
│   └── video.webm
├── login-test-firefox/
│   ├── trace.zip
│   └── test-failed-1.png
└── junit.xml

playwright-report/
├── index.html
└── data/

blob-report/
└── report-1.zip
```

## CI Artifact Upload

### GitHub Actions

```yaml
- uses: actions/upload-artifact@v4
  if: ${{ !cancelled() }}
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 14

- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: test-traces
    path: |
      test-results/**/trace.zip
      test-results/**/*.png
      test-results/**/*.webm
    retention-days: 7
```

## Decision Guide

| Scenario | Reporter Configuration |
|---|---|
| Local development | `[['list'], ['html', { open: 'on-failure' }]]` |
| GitHub Actions | `[['dot'], ['html'], ['github']]` |
| GitLab CI | `[['dot'], ['html'], ['junit']]` |
| Azure DevOps / Jenkins | `[['dot'], ['html'], ['junit']]` |
| Sharded CI | `[['blob'], ['github']]` |
| Custom dashboard | `[['json', { outputFile: '...' }]]` + custom reporter |

| Artifact | When to Collect | Retention | Upload Condition |
|---|---|---|---|
| HTML report | Always | 14 days | `if: ${{ !cancelled() }}` |
| Traces | On failure | 7 days | `if: failure()` |
| Screenshots | On failure | 7 days | `if: failure()` |
| Videos | On failure | 7 days | `if: failure()` |
| JUnit XML | Always | 14 days | `if: ${{ !cancelled() }}` |
| Blob report | Always (sharded) | 1 day | `if: ${{ !cancelled() }}` |

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|---|---|---|
| No reporter configured | Default `list` only; no persistent report | Configure `html` + CI reporter |
| `trace: 'on'` in CI | Massive artifacts, slow uploads | Use `trace: 'on-first-retry'` |
| `video: 'on'` in CI | Enormous storage, slower tests | Use `video: 'retain-on-failure'` |
| Upload artifacts only on failure | No report when tests pass | Upload with `if: ${{ !cancelled() }}` |
| No retention limits | CI storage fills quickly | Set `retention-days: 7-14` |
| Only `dot` reporter | Cannot drill into failures | Pair `dot` with `html` |
| JUnit to stdout | Interferes with console output | Write to file |
| Blocking `onEnd` in custom reporter | Slow HTTP calls delay pipeline | Abort the call with `AbortSignal.timeout` |
| `process.env` read inside a reporter | Config is no longer the single source of environment | Read it in the config, pass it as a reporter option |

## Troubleshooting

### Empty HTML Report

Check reporter config. HTML report defaults to `playwright-report/`:

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const reporter: ReporterDescription[] = [['html', { open: 'never', outputFolder: 'playwright-report' }]];

export default defineConfig({ reporter });
```

### Traces Too Large

Switch from `trace: 'on'` to `'on-first-retry'` with retries enabled. The config in [Trace Configuration](#trace-configuration) is the fix.

### JUnit XML Not Recognized

Ensure the `outputFile` path matches the CI configuration:

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const reporter: ReporterDescription[] = [['junit', { outputFile: 'results/junit.xml' }]];

export default defineConfig({ reporter });
```

```yaml
# GitHub Actions
- uses: dorny/test-reporter@latest
  with:
    path: results/junit.xml
    reporter: java-junit

# Azure DevOps
- task: PublishTestResults@latest
  inputs:
    testResultsFiles: 'results/junit.xml'

# Jenkins
junit 'results/junit.xml'
```

### Empty Merged Report

Use `blob` reporter for sharded runs (not `html`):

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const CI_REPORTER: ReporterDescription[] = [['blob'], ['dot']];
const LOCAL_REPORTER: ReporterDescription[] = [['html', { open: 'on-failure' }]];

export default defineConfig({
  reporter: process.env.CI ? CI_REPORTER : LOCAL_REPORTER
});
```

### Missing Screenshots in Report

Set `screenshot: 'only-on-failure'` in `use`, as in [Screenshot & Video Settings](#screenshot--video-settings). The HTML report embeds screenshots from `test-results/`. Deleting that directory removes screenshots from the report.
