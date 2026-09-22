# CI/CD Integration

## Table of Contents

1. [GitHub Actions](#github-actions)
2. [Docker](#docker)
3. [Reporting](#reporting)
4. [Sharding](#sharding)
5. [Environment Management](#environment-management)
6. [Caching](#caching)

## GitHub Actions

### Basic Workflow

```yaml
# .github/workflows/playwright.yml
name: Playwright Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npx playwright test

      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### With Sharding

```yaml
name: Playwright Tests

on:
  push:
    branches: [main]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}

      - name: Upload blob report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: blob-report-${{ matrix.shardIndex }}
          path: blob-report
          retention-days: 1

  merge-reports:
    if: ${{ !cancelled() }}
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Download blob reports
        uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true

      - name: Merge reports
        run: npx playwright merge-reports --reporter html ./all-blob-reports

      - name: Upload HTML report
        uses: actions/upload-artifact@v4
        with:
          name: html-report
          path: playwright-report
          retention-days: 14
```

### With Container

```yaml
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    container:
      # Use latest or more appropriate playwright version (match package.json)
      image: mcr.microsoft.com/playwright:v1.40.0-jammy
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npx playwright test
        env:
          HOME: /root
```

## Docker

### Dockerfile

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

CMD ["npx", "playwright", "test"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  playwright:
    build: .
    volumes:
      - ./playwright-report:/app/playwright-report
      - ./test-results:/app/test-results
    environment:
      - CI=true
      - BASE_URL=http://app:3000
    depends_on:
      - app

  app:
    build: ./app
    ports:
      - "3000:3000"
```

### Run with Docker

```bash
# Build and run
docker build -t playwright-tests .
docker run --rm -v $(pwd)/playwright-report:/app/playwright-report playwright-tests

# With docker-compose
docker-compose run --rm playwright
```

## Reporting

### Configuration

| Reporter | Purpose |
|---|---|
| `html` | Browsable report, always generated |
| `list` | Console output |
| `github` | GitHub Actions annotations |
| `junit` | JUnit XML for CI integration |
| `json` | JSON for custom processing |
| `blob` | Per-shard output that `merge-reports` combines |

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const reporter: ReporterDescription[] = [
  ['html', { outputFolder: 'playwright-report' }],
  ['list'],
  ['github'],
  ['junit', { outputFile: 'results.xml' }],
  ['json', { outputFile: 'results.json' }],
  ['blob', { outputDir: 'blob-report' }]
];

export default defineConfig({ reporter });
```

### CI-Specific Reporter

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const CI_REPORTER: ReporterDescription[] = [['github'], ['blob'], ['html']];
const LOCAL_REPORTER: ReporterDescription[] = [['list'], ['html']];

export default defineConfig({
  reporter: process.env.CI ? CI_REPORTER : LOCAL_REPORTER
});
```

## Sharding

### Command Line

```bash
# Split into 4 shards, run shard 1
npx playwright test --shard=1/4

# Run shard 2
npx playwright test --shard=2/4
```

### Configuration

`fullyParallel` distributes tests evenly across shards. The `blob` reporter on CI produces the per-shard output that `merge-reports` combines later.

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const CI_REPORTER: ReporterDescription[] = [['blob']];
const LOCAL_REPORTER: ReporterDescription[] = [['html']];

export default defineConfig({
  fullyParallel: true,
  reporter: process.env.CI ? CI_REPORTER : LOCAL_REPORTER
});
```

### Merge Sharded Reports

```bash
# After all shards complete, merge blob reports
npx playwright merge-reports --reporter html ./all-blob-reports
```

## Environment Management

### Environment Variables

The config loads `.env.<NODE_ENV>` once and turns every environment read into a plain value. Specs never read `process.env`.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

const ENVIRONMENT = process.env.NODE_ENV ?? 'development';

dotenv.config({ path: `.env.${ENVIRONMENT}` });

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const use = { baseURL: BASE_URL } as const;

export default defineConfig({ use });
```

### Multiple Environments

```yaml
# .github/workflows/playwright.yml
jobs:
  test:
    strategy:
      matrix:
        environment: [staging, production]
    steps:
      - name: Run tests
        run: npx playwright test
        env:
          BASE_URL: ${{ matrix.environment == 'staging' && 'https://staging.example.com' || 'https://example.com' }}
          TEST_USER: ${{ secrets[format('TEST_USER_{0}', matrix.environment)] }}
```

### Secrets Management

```yaml
# GitHub Actions secrets
- name: Run tests
  run: npx playwright test
  env:
    TEST_EMAIL: ${{ secrets.TEST_EMAIL }}
    TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
```

The secrets are read once in a const file. The spec receives plain values and never touches `process.env`.

```ts
// e2e/login/common/login.const.ts
import type { Credentials } from './login.type';

export const CI_USER: Credentials = {
  email: process.env.TEST_EMAIL ?? '',
  password: process.env.TEST_PASSWORD ?? ''
};
```

```ts
// e2e/login/login.e2e.ts
import { CI_USER } from './common/login.const';
import { expect, test } from './login.fixture';

test('SCENARIO: CI credentials open the dashboard', async ({ loginPage, page }): Promise<void> => {
  await test.step('GIVEN the login page is open', (): Promise<void> => loginPage.goto());

  await test.step('WHEN the CI credentials are submitted', (): Promise<void> => loginPage.submit(CI_USER));

  await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));
});
```

## Caching

### Cache Playwright Browsers

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

- name: Install Playwright browsers
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps

- name: Install system deps only
  if: steps.playwright-cache.outputs.cache-hit == 'true'
  run: npx playwright install-deps
```

### Cache Node Modules

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: "npm"

- name: Install dependencies
  run: npm ci
```

## Tag-Based Test Filtering

### Run Specific Tags in CI

```yaml
# Run smoke tests on PR
- name: Run smoke tests
  run: npx playwright test --grep @smoke

# Run full regression nightly
- name: Run regression
  run: npx playwright test --grep @regression

# Exclude flaky tests
- name: Run stable tests
  run: npx playwright test --grep-invert @flaky
```

### PR vs Nightly Strategy

```yaml
# .github/workflows/pr.yml - Fast feedback
- name: Run critical tests
  run: npx playwright test --grep "@smoke|@critical"

# .github/workflows/nightly.yml - Full coverage
- name: Run all tests
  run: npx playwright test --grep-invert @flaky
```

### Tag Filtering in Config

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);

export default defineConfig({
  grep: IS_CI ? /@smoke|@critical/ : undefined,
  grepInvert: IS_CI ? /@flaky/ : undefined
});
```

### Project-Based Tag Filtering

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const projects = [
  { grep: /@smoke/, name: 'smoke' },
  { grepInvert: /@smoke/, name: 'regression' }
];

export default defineConfig({ projects });
```

## Best Practices

| Practice                      | Benefit                   |
| ----------------------------- | ------------------------- |
| Use `npm ci`                  | Deterministic installs    |
| Run headless in CI            | Faster, no display needed |
| Set retries in CI only        | Handle flakiness          |
| Upload artifacts on failure   | Debug failures            |
| Use sharding for large suites | Faster execution          |
| Cache browsers                | Faster setup              |
| Use blob reporter for shards  | Merge reports correctly   |
| Use tags for PR vs nightly    | Fast feedback + coverage  |
| Exclude @flaky in CI          | Stable pipeline           |

## CI Configuration Reference

CI-optimized config: `forbidOnly` blocks a stray `test.only`, retries and a single worker apply on CI only, and traces, screenshots, and videos are captured on the first retry or on failure.

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const CI_REPORTER: ReporterDescription[] = [['github'], ['blob'], ['html']];
const LOCAL_REPORTER: ReporterDescription[] = [['list'], ['html']];

const use = {
  baseURL: BASE_URL,
  screenshot: 'only-on-failure',
  trace: 'on-first-retry',
  video: 'on-first-retry'
} as const;

export default defineConfig({
  forbidOnly: IS_CI,
  fullyParallel: true,
  reporter: IS_CI ? CI_REPORTER : LOCAL_REPORTER,
  retries: IS_CI ? 2 : 0,
  testDir: './e2e',
  use,
  workers: IS_CI ? 1 : undefined
});
```

## Related References

- **Test tags**: See [test-tags.md](../core/test-tags.md) for tagging and filtering patterns
- **Performance optimization**: See [performance.md](performance.md) for sharding and parallelization
- **Debugging CI failures**: See [debugging.md](../debugging/debugging.md) for troubleshooting
- **Test reporting**: See [debugging.md](../debugging/debugging.md) for trace viewer usage
