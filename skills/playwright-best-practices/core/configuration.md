# Playwright Configuration

## Table of Contents

1. [CLI Quick Reference](#cli-quick-reference)
2. [Decision Guide](#decision-guide)
3. [Production-Ready Config](#production-ready-config)
4. [Patterns](#patterns)
5. [Anti-Patterns](#anti-patterns)
6. [Troubleshooting](#troubleshooting)
7. [Related](#related)

> **When to use**: Setting up a new project, adjusting timeouts, adding browser targets, configuring CI behavior, or managing environment-specific settings.

## CLI Quick Reference

```bash
npx playwright init                           # scaffold config + first test
npx playwright test --config=custom.config.ts # use alternate config
npx playwright test --project=chromium        # run single project
npx playwright test --reporter=html           # override reporter
npx playwright test --grep @smoke             # run tests tagged @smoke
npx playwright test --grep-invert @slow       # exclude @slow tests
npx playwright show-report                    # open last HTML report
DEBUG=pw:api npx playwright test              # verbose logging
```

## Decision Guide

### Timeout Selection

| Symptom | Setting | Default | Recommended |
|---------|---------|---------|-------------|
| Test takes too long overall | `timeout` | 30s | 30-60s (max 120s) |
| Assertion retries too long/short | `expect.timeout` | 5s | 5-10s |
| `page.goto()` or `waitForURL()` times out | `navigationTimeout` | 30s | 10-30s |
| `click()`, `fill()` time out | `actionTimeout` | 0 (unlimited) | 10-15s |
| Dev server slow to start | `webServer.timeout` | 60s | 60-180s |

### Server Management

| Scenario | Approach |
|----------|----------|
| App in same repo | `webServer` with `reuseExistingServer: !process.env.CI` |
| Separate repos | Manual start or Docker Compose |
| Testing deployed environment | No `webServer`; set `baseURL` via env |
| Multiple services | Array of `webServer` entries |

### Single vs Multi-Project

| Scenario | Approach |
|----------|----------|
| Early development | Single project (chromium only) |
| Pre-release validation | Multi-project: chromium + firefox + webkit |
| Mobile-responsive app | Add mobile projects alongside desktop |
| Auth + non-auth tests | Setup project with dependencies |
| Tight CI budget | Chromium on PRs; all browsers on main |

### globalSetup vs Setup Projects vs Fixtures

| Need | Use |
|------|-----|
| One-time DB seed | `globalSetup` |
| Shared browser auth | Setup project with `dependencies` |
| Per-test isolated state | Custom fixture via `test.extend()` |
| Cleanup after all tests | `globalTeardown` |

## Production-Ready Config

Every nested object (`expect`, `projects`, `reporter`, `use`, `webServer`) is a named const above `defineConfig`. `process.env` is read once into `IS_CI`; a project's `use` takes a `devices` entry directly.

```ts
// e2e/playwright.config.ts
import path from 'node:path';

import type { ReporterDescription } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const IS_CI = Boolean(process.env.CI);

const ciReporter: ReporterDescription[] = [['html', { open: 'never' }], ['github']];

const localReporter: ReporterDescription[] = [['html', { open: 'on-failure' }]];

const expectOptions = { timeout: 5_000 };

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] },
  { name: 'mobile-chrome', use: devices['Pixel 7'] },
  { name: 'mobile-safari', use: devices['iPhone 14'] }
];

const use = {
  actionTimeout: 10_000,
  baseURL: process.env.BASE_URL || 'http://localhost:4000',
  locale: 'en-US',
  navigationTimeout: 15_000,
  screenshot: 'only-on-failure',
  timezoneId: 'America/Los_Angeles',
  trace: 'on-first-retry',
  video: 'retain-on-failure'
} as const;

const webServer = {
  command: 'npm run start',
  reuseExistingServer: !IS_CI,
  stderr: 'pipe',
  stdout: 'pipe',
  timeout: 120_000,
  url: 'http://localhost:4000'
} as const;

export default defineConfig({
  expect: expectOptions,
  forbidOnly: IS_CI,
  fullyParallel: true,
  projects,
  reporter: IS_CI ? ciReporter : localReporter,
  retries: IS_CI ? 2 : 0,
  testDir: './e2e',
  testMatch: '**/*.@(e2e|test).ts',
  timeout: 30_000,
  use,
  webServer,
  workers: IS_CI ? '50%' : undefined
});
```

## Patterns

### Environment-Specific Configuration

**Use when**: Tests run against dev, staging, and production environments. The per-environment shape is a named type; the lookup happens once and feeds plain values into `defineConfig`.

```ts
// e2e/playwright.config.ts
import path from 'node:path';

import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

type EnvConfig = {
  readonly baseURL: string;
  readonly retries: number;
};

const ENV_CONFIGS: Record<string, EnvConfig> = {
  local: { baseURL: 'http://localhost:4000', retries: 0 },
  prod: { baseURL: 'https://myapp.com', retries: 2 },
  staging: { baseURL: 'https://staging.myapp.com', retries: 2 }
};

const env = process.env.TEST_ENV || 'local';

dotenv.config({ path: path.resolve(__dirname, `.env.${env}`) });

const { baseURL, retries } = ENV_CONFIGS[env];

const use = { baseURL };

export default defineConfig({ retries, testDir: './e2e', use });
```

```bash
TEST_ENV=staging npx playwright test
TEST_ENV=prod npx playwright test --grep @smoke
```

### Setup Project with Dependencies

**Use when**: Tests need shared authentication state before running. Each browser project is a named const carrying the same `storageState`.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const STORAGE_STATE = 'e2e/.auth/session.json';

const chromium = { ...devices['Desktop Chrome'], storageState: STORAGE_STATE };

const firefox = { ...devices['Desktop Firefox'], storageState: STORAGE_STATE };

const projects = [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium },
  { dependencies: ['setup'], name: 'firefox', use: firefox }
];

export default defineConfig({ projects, testDir: './e2e' });
```

The setup file signs in through the page objects of `login.fixture.ts` and saves the storage state. Credentials come from a stub; a secret password reaches the setup through a fixture option set in the config `use` block (see [fixtures-hooks.md](fixtures-hooks.md#fixture-with-options)), never from `process.env` in the setup file.

```ts
// e2e/auth/auth.setup.ts
import { test as setup } from '../login/login.fixture';
import { USER_STUB } from './test/stubs/auth.stub';
import { saveStorageState } from './test/utils/storage-state.spec.util';

const STORAGE_STATE = 'e2e/.auth/session.json';

setup('authenticate as the default user', async ({ dashboardPage, loginPage, page }): Promise<void> => {
  await setup.step('open the login page', (): Promise<void> => loginPage.goto());

  await setup.step('submit credentials', (): Promise<void> => loginPage.submit(USER_STUB));

  await setup.step('home heading is shown', (): Promise<void> => dashboardPage.expectHeading('Home'));

  await setup.step('save the storage state', (): Promise<void> => saveStorageState(page, STORAGE_STATE));
});
```

### webServer with Build Step

**Use when**: Tests need a running application server managed by Playwright. The server `env` is its own const because it is a nested object.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);

const webServerEnv = {
  DB_URL: process.env.DB_URL || 'postgresql://localhost:5432/testdb',
  NODE_ENV: 'test'
};

const webServer = {
  command: IS_CI ? 'npm run build && npm run preview' : 'npm run dev',
  env: webServerEnv,
  reuseExistingServer: !IS_CI,
  timeout: 120_000,
  url: 'http://localhost:4000'
};

const use = { baseURL: 'http://localhost:4000' };

export default defineConfig({ testDir: './e2e', use, webServer });
```

### globalSetup / globalTeardown

**Use when**: One-time non-browser work like seeding a database. Runs once per test run. Full patterns in [global-setup.md](global-setup.md).

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  testDir: './e2e'
});
```

```ts
// e2e/global-setup.ts
import { execSync } from 'node:child_process';

const globalSetup = async (): Promise<void> => {
  execSync('npx prisma db seed', { stdio: 'inherit' });
  process.env.TEST_RUN_ID = `run-${Date.now()}`;
};

export default globalSetup;
```

```ts
// e2e/global-teardown.ts
import { execSync } from 'node:child_process';

const globalTeardown = async (): Promise<void> => {
  execSync('npx prisma db push --force-reset', { stdio: 'inherit' });
};

export default globalTeardown;
```

### Environment Variables with .env

**Use when**: Managing secrets, URLs, or feature flags without hardcoding.

```bash
# .env.example (commit this)
BASE_URL=http://localhost:4000
TEST_PASSWORD=
API_KEY=

# .env.local (gitignored)
BASE_URL=http://localhost:4000
TEST_PASSWORD=secret123
API_KEY=dev-key-abc

# .env.staging (gitignored)
BASE_URL=https://staging.myapp.com
TEST_PASSWORD=staging-pass
API_KEY=staging-key-xyz
```

```bash
# .gitignore
.env
.env.local
.env.staging
.env.production
e2e/.auth/
```

Install dotenv:

```bash
npm install -D dotenv
```

### Tag-Based Test Filtering

**Use when**: Running subsets of tests in different CI stages (PR vs nightly). `grep` and `grepInvert` take a regex; `undefined` disables the filter.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);

export default defineConfig({
  grep: IS_CI ? /@smoke|@critical/ : undefined,
  grepInvert: IS_CI ? /@flaky/ : undefined,
  testDir: './e2e'
});
```

**Project-specific filtering:** each project carries its own `grep`, so one config exposes several subsets by `--project`.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const desktopChrome = { ...devices['Desktop Chrome'] };

const projects = [
  { grep: /@smoke/, name: 'smoke', use: desktopChrome },
  { grepInvert: /@smoke/, name: 'regression', use: desktopChrome },
  { grep: /@critical/, name: 'critical-only', use: desktopChrome }
];

export default defineConfig({ projects, testDir: './e2e' });
```

```bash
# Run specific project
npx playwright test --project=smoke
npx playwright test --project=regression
```

### Artifact Collection Strategy

| Setting | Local | CI | Reason |
|---------|-------|-----|--------|
| `trace` | `'off'` | `'on-first-retry'` | Traces are large; collect on failure only |
| `screenshot` | `'off'` | `'only-on-failure'` | Useful for CI debugging |
| `video` | `'off'` | `'retain-on-failure'` | Recording slows tests |

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);

const use = {
  screenshot: IS_CI ? 'only-on-failure' : 'off',
  trace: IS_CI ? 'on-first-retry' : 'off',
  video: IS_CI ? 'retain-on-failure' : 'off'
} as const;

export default defineConfig({ testDir: './e2e', use });
```

## Anti-Patterns

| Don't | Problem | Do Instead |
|-------|---------|------------|
| `timeout: 300_000` globally | Masks flaky tests; slow CI | Fix root cause; keep 30s default |
| Hardcoded URLs: `page.goto('http://localhost:4000/login')` | Breaks in other environments | Use `baseURL` + relative paths |
| All browsers on every PR | 3x CI time | Chromium on PRs; all on main |
| `trace: 'on'` always | Huge artifacts, slow uploads | `trace: 'on-first-retry'` |
| `video: 'on'` always | Massive storage; slow tests | `video: 'retain-on-failure'` |
| Config in test files: `test.use({ viewport: {...} })` everywhere | Scattered, inconsistent | Define once in project config |
| `retries: 3` locally | Hides flakiness | `retries: 0` local, `retries: 2` CI |
| No `forbidOnly` in CI | Committed `test.only` runs single test | `forbidOnly: Boolean(process.env.CI)` |
| `globalSetup` for browser auth | No browser context available | Use setup project with dependencies |
| Committing `.env` with credentials | Security risk | Commit `.env.example` only |
| Inline `use: { ... }` inside `defineConfig` | Nested literal hides the shape | Named `const use = { ... } as const;` above |

## Troubleshooting

### baseURL Not Working

**Cause**: Using absolute URL in `page.goto()` ignores `baseURL`.

Avoid:

```ts avoid
await page.goto('http://localhost:4000/dashboard');
```

Prefer a relative path in the page object's `goto`:

```ts
// e2e/dashboard/pages/dashboard.page.ts
import type { Page } from '@playwright/test';

export class DashboardPage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }
}
```

### webServer Starts But Tests Get Connection Refused

**Cause**: `webServer.url` doesn't match actual server address or health check returns non-200. Point `url` at a real endpoint.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const webServer = {
  command: 'npm run dev',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  url: 'http://localhost:4000/api/health'
};

export default defineConfig({ testDir: './e2e', webServer });
```

### Tests Pass Locally But Timeout in CI

**Cause**: CI machines are slower. Increase timeouts and reduce workers:

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);

const use = {
  actionTimeout: IS_CI ? 15_000 : 10_000,
  navigationTimeout: IS_CI ? 30_000 : 15_000
};

export default defineConfig({ testDir: './e2e', use, workers: IS_CI ? '50%' : undefined });
```

### "Target page, context or browser has been closed"

**Cause**: Test exceeded `timeout` and Playwright tore down browser during action.

**Fix**: Don't increase global timeout. Find slow step using trace:

```bash
npx playwright test --trace on
npx playwright show-report
```

## Related

- [test-tags.md](./test-tags.md) - tagging and filtering tests with `--grep`
- [fixtures-hooks.md](./fixtures-hooks.md) - custom fixtures for per-test state
- [test-suite-structure.md](test-suite-structure.md) - file structure and naming
- [authentication.md](../advanced/authentication.md) - setup projects for shared auth
- [projects-dependencies.md](./projects-dependencies.md) - advanced multi-project patterns
