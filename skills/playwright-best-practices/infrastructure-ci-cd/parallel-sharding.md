# Sharding and Parallel Execution

## Table of Contents

1. [CLI Commands](#cli-commands)
2. [Patterns](#patterns)
3. [Decision Guide](#decision-guide)
4. [Anti-Patterns](#anti-patterns)
5. [Troubleshooting](#troubleshooting)

> **When to use**: Speeding up test suites by running tests concurrently on one machine (workers) or splitting across multiple CI jobs (sharding).

## CLI Commands

```bash
# Parallelism within one machine
npx playwright test --workers=4
npx playwright test --workers=50%

# Splitting across CI jobs
npx playwright test --shard=1/4
npx playwright test --shard=2/4

# Merging shard outputs
npx playwright merge-reports ./blob-report
npx playwright merge-reports --reporter=html,json ./blob-report

# Override config for single run
npx playwright test --fully-parallel
```

## Patterns

### Worker Configuration

**Use when**: Controlling concurrent test execution on a single machine.

`fullyParallel: true` makes tests inside one file run in parallel as well as files. `workers` takes a fixed count, a percentage string, or `undefined` for auto-detect (half the CPU cores).

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? '50%' : undefined
});
```

**`workers` values:**

| Value | Meaning |
|---|---|
| `undefined` | Auto-detect: half the CPU cores |
| `4` | Fixed worker count |
| `'50%'` | Percentage of CPU cores |

**`fullyParallel` behavior:**

| Setting                          | Files parallel | Tests in file parallel |
| -------------------------------- | -------------- | ---------------------- |
| `fullyParallel: false` (default) | Yes            | No (serial)            |
| `fullyParallel: true`            | Yes            | Yes                    |

**Serial execution for specific files:** `test.describe.configure({ mode: 'serial' })` at the top of a spec runs its tests in order on one worker, and skips the rest after the first failure.

```ts
// e2e/checkout/checkout.e2e.ts
import { expect, test } from './checkout.fixture';
import { CARD_STUB, ITEM_STUB } from './test/stubs/checkout.stub';

test.describe.configure({ mode: 'serial' });

test.describe('FEATURE: checkout', () => {
  test.describe('GIVEN an empty cart', () => {
    test('SCENARIO: adding an item shows one item on the cart badge', async ({ cartPage }): Promise<void> => {
      await test.step('WHEN the item is added to the cart', (): Promise<void> => cartPage.addItem(ITEM_STUB));

      await test.step('THEN the cart badge shows one item', (): Promise<void> => cartPage.expectBadgeCount(1));
    });

    test('SCENARIO: completing payment opens the confirmation page', async ({ checkoutPage, page }): Promise<void> => {
      await test.step('WHEN the card payment is completed', (): Promise<void> => checkoutPage.pay(CARD_STUB));

      await test.step('THEN the confirmation url is shown', (): Promise<void> => expect(page).toHaveURL('/confirmation'));
    });
  });
});
```

### Sharding Across CI Machines

**Use when**: Suite exceeds 5 minutes even with maximum workers.

```bash
# Job 1            Job 2            Job 3            Job 4
--shard=1/4        --shard=2/4      --shard=3/4      --shard=4/4
```

**Config for sharded runs:** CI emits a `blob` report per shard for merging, plus `github` annotations.

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const ciReporter: ReporterDescription[] = [['blob'], ['github']];
const localReporter: ReporterDescription[] = [['html', { open: 'on-failure' }]];
const reporter = process.env.CI ? ciReporter : localReporter;

export default defineConfig({
  fullyParallel: true,
  reporter,
  workers: process.env.CI ? '50%' : undefined
});
```

### Merging Shard Reports

**Use when**: Combining blob reports from multiple shards into a unified report.

```bash
# Merge all blobs into HTML
npx playwright merge-reports --reporter=html ./all-blob-reports

# Multiple formats
npx playwright merge-reports --reporter=html,json,junit ./all-blob-reports

# Custom output location
PLAYWRIGHT_HTML_REPORT=merged-report npx playwright merge-reports --reporter=html ./all-blob-reports
```

**GitHub Actions merge job:**

```yaml
merge-reports:
  if: ${{ !cancelled() }}
  needs: test
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci

    - uses: actions/download-artifact@v4
      with:
        path: all-blob-reports
        pattern: blob-report-*
        merge-multiple: true

    - run: npx playwright merge-reports --reporter=html ./all-blob-reports

    - uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 14
```

### Worker-Scoped Fixtures

**Use when**: Expensive resources (DB connections, auth tokens) should be created once per worker, not per test.

Worker fixtures go in a separate `type <Feature>WorkerFixtures` and are passed as the second generic to `base.extend`. Each is a `[fn, { scope: 'worker' }]` tuple; the third callback parameter is `WorkerInfo`, whose `workerIndex` keys per-worker data. `DB_URL` comes from `common/settings.const.ts`, so the fixture never reads `process.env`.

```ts
// e2e/settings/settings.fixture.ts
import { test as base } from '@playwright/test';

import { DB_URL } from './common/settings.const';
import { SettingsPage } from './pages/settings.page';
import { fetchApiToken } from './test/utils/api-token.spec.util';
import { DatabaseClient } from './utils/database-client.util';

type SettingsFixtures = {
  readonly settingsPage: SettingsPage;
};

type SettingsWorkerFixtures = {
  readonly apiToken: string;
  readonly dbClient: DatabaseClient;
};

export const test = base.extend<SettingsFixtures, SettingsWorkerFixtures>({
  apiToken: [
    async ({}, use, workerInfo): Promise<void> => {
      const token = await fetchApiToken(workerInfo.workerIndex);

      await use(token);
    },
    { scope: 'worker' }
  ],
  dbClient: [
    async ({}, use): Promise<void> => {
      const client = await DatabaseClient.connect(DB_URL);

      await use(client);
      await client.disconnect();
    },
    { scope: 'worker' }
  ],
  settingsPage: async ({ page }, use): Promise<void> => {
    await use(new SettingsPage(page));
  }
});

export { expect } from '@playwright/test';
```

`fetchApiToken` posts a per-worker user to the auth endpoint and returns the token:

```ts
// e2e/settings/test/utils/api-token.spec.util.ts
import { API_URL, TEST_PASSWORD } from '../../common/settings.const';

type TokenResponse = {
  readonly token: string;
};

export const fetchApiToken = async (workerIndex: number): Promise<string> => {
  const credentials = { password: TEST_PASSWORD, user: `test-user-${workerIndex}` };
  const body = JSON.stringify(credentials);
  const headers = { 'Content-Type': 'application/json' };
  const response = await fetch(`${API_URL}/auth`, { body, headers, method: 'POST' });
  const json: TokenResponse = await response.json();

  return json.token;
};
```

### Test Isolation for Parallelism

**Use when**: Preparing tests to run without interference.

Each test must create its own state. No test should depend on or modify shared state.

Avoid a hardcoded shared user; two workers editing it race:

```ts avoid
test('edit settings', async ({ page }) => {
  await page.goto('/users/test-user/settings');
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByRole('button', { name: 'Save' }).click();
});
```

Prefer a `user` fixture that seeds a unique user through `request` and deletes it after the test:

```ts
// e2e/profile/profile.fixture.ts
import { test as base } from '@playwright/test';

import type { User } from './common/profile.type';
import { SettingsPage } from './pages/settings.page';
import { uniqueUser } from './test/utils/user-builder.spec.util';

type ProfileFixtures = {
  readonly settingsPage: SettingsPage;
  readonly user: User;
};

export const test = base.extend<ProfileFixtures>({
  settingsPage: async ({ page }, use): Promise<void> => {
    await use(new SettingsPage(page));
  },
  user: async ({ request }, use): Promise<void> => {
    const draft = uniqueUser();
    const response = await request.post('/api/users', { data: draft });
    const user: User = await response.json();

    await use(user);
    await request.delete(`/api/users/${user.id}`);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/profile/profile.e2e.ts
import { test } from './profile.fixture';

test.describe('FEATURE: profile settings', () => {
  test.describe('GIVEN a freshly seeded user', () => {
    test.beforeEach(async ({ settingsPage, user }): Promise<void> => {
      await test.step('GIVEN the settings page is open', (): Promise<void> => settingsPage.goto(user.id));
    });

    test('SCENARIO: changing the email keeps the new value in the field', async ({ settingsPage }): Promise<void> => {
      await test.step('WHEN a new email is saved', (): Promise<void> => settingsPage.saveEmail('updated@example.com'));

      await test.step('THEN the email field shows the new value', (): Promise<void> => settingsPage.expectEmail('updated@example.com'));
    });
  });
});
```

**Using `testInfo` for unique identifiers:** `testInfo.workerIndex` plus a timestamp gives an identifier no other worker can produce. Build it in a `test/utils` builder and pass the result into the page object.

```ts
// e2e/orders/test/utils/order-builder.spec.util.ts
export const uniqueOrderRef = (workerIndex: number): string => {
  return `order-${workerIndex}-${Date.now()}`;
};
```

```ts
// e2e/orders/orders.e2e.ts
import { test } from './orders.fixture';
import { uniqueOrderRef } from './test/utils/order-builder.spec.util';

test.describe('FEATURE: orders', () => {
  test.describe('GIVEN a signed-in buyer', () => {
    test('SCENARIO: opening a new order shows its reference', async ({ orderPage }, testInfo): Promise<void> => {
      const orderRef = uniqueOrderRef(testInfo.workerIndex);

      await test.step('WHEN a new order is opened', (): Promise<void> => orderPage.gotoNew(orderRef));

      await test.step('THEN the order reference is shown', (): Promise<void> => orderPage.expectReference(orderRef));
    });
  });
});
```

### Dynamic Shard Count

**Use when**: Automatically adjusting shards based on test count.

```yaml
# .github/workflows/playwright.yml
jobs:
  calculate-shards:
    runs-on: ubuntu-latest
    outputs:
      shard-count: ${{ steps.calc.outputs.count }}
      shard-matrix: ${{ steps.calc.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - id: calc
        run: |
          TEST_COUNT=$(npx playwright test --list --reporter=json 2>/dev/null | node -e "
            const data = require('fs').readFileSync('/dev/stdin', 'utf8');
            const parsed = JSON.parse(data);
            console.log(parsed.suites?.reduce((acc, s) => acc + (s.specs?.length || 0), 0) || 0);
          ")
          # 1 shard per 20 tests, min 1, max 8
          SHARDS=$(( (TEST_COUNT + 19) / 20 ))
          SHARDS=$(( SHARDS > 8 ? 8 : SHARDS ))
          SHARDS=$(( SHARDS < 1 ? 1 : SHARDS ))
          MATRIX="["
          for i in $(seq 1 $SHARDS); do
            [ $i -gt 1 ] && MATRIX+=","
            MATRIX+="\"$i/$SHARDS\""
          done
          MATRIX+="]"
          echo "count=$SHARDS" >> $GITHUB_OUTPUT
          echo "matrix=$MATRIX" >> $GITHUB_OUTPUT

  test:
    needs: calculate-shards
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: ${{ fromJson(needs.calculate-shards.outputs.shard-matrix) }}
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --shard=${{ matrix.shard }}
```

## Decision Guide

| Scenario                         | Workers        | Shards | Reason                                  |
| -------------------------------- | -------------- | ------ | --------------------------------------- |
| < 50 tests, < 5 min              | Auto (default) | None   | No optimization needed                  |
| 50-200 tests, 5-15 min           | `'50%'` in CI  | 2-4    | Balance speed and cost                  |
| 200+ tests, > 15 min             | `'50%'` in CI  | 4-8    | Keep feedback under 10 min              |
| Flaky due to resource contention | Reduce to 2    | Keep   | Less CPU/memory pressure                |
| Tests modify shared database     | 1 or isolate   | Useful | Sharding splits files; workers run them |
| CI has limited resources         | 1 or `'25%'`   | More   | Compensate with more machines           |

| Aspect         | Workers (in-process)      | Shards (across machines)   |
| -------------- | ------------------------- | -------------------------- |
| What it splits | Tests across CPU cores    | Test files across CI jobs  |
| Controlled by  | Config or `--workers` CLI | `--shard=X/Y` CLI flag     |
| Shares memory  | Yes                       | No                         |
| Report merging | Not needed                | Required (`merge-reports`) |
| Cost           | Free (same machine)       | More CI minutes            |

## Anti-Patterns

| Anti-Pattern                            | Problem                                  | Solution                                             |
| --------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `fullyParallel: false` without reason   | Tests in files run serially              | Set `fullyParallel: true` unless tests need serial   |
| `workers: 1` in CI "for safety"         | Negates parallelism                      | Fix isolation issues; use `workers: '50%'`           |
| Hardcoded shared user account           | Race conditions in parallel runs         | Each test creates unique data                        |
| Sharding without blob reporter          | Each shard produces separate HTML report | Configure `reporter: [['blob']]` for CI              |
| Sharding with 3 tests                   | Setup overhead exceeds time saved        | Only shard when suite > 5 minutes                    |
| `test.describe.serial()` everywhere     | Kills parallelism, creates dependencies  | Use only when tests genuinely need prior state       |
| Workers > CPU cores                     | Context switching overhead               | Use `'50%'` or auto-detect                           |
| Missing `fail-fast: false` in CI matrix | One shard failure cancels others         | Always set `fail-fast: false` for sharded strategies |

## Troubleshooting

### Tests pass solo but fail together

- **Shared state**. Make test data unique with a builder keyed on `testInfo.workerIndex` and `Date.now()`, as in [Test Isolation for Parallelism](#test-isolation-for-parallelism), and seed it through `request` in a fixture.

### "No tests found" in some shards

- **Too many shards**. Never exceed file count:
  ```bash
  npx playwright test --shard=1/10   # ok if 10 files
  npx playwright test --shard=1/20   # too many, some shards empty
  ```

### Merged report missing results

- **Blob reports collide**. Use unique names:
  ```yaml
  # Each shard
  - uses: actions/upload-artifact@v4
    with:
      name: blob-report-${{ strategy.job-index }}
      path: blob-report/
  # Merge step
  - uses: actions/download-artifact@v4
    with:
      pattern: blob-report-*
      merge-multiple: true
      path: all-blob-reports
  ```

### Worker-scoped fixture not working

- **Missing `{ scope: 'worker' }`**. Without the tuple's second element the fixture is test-scoped and re-runs per test. Declare it in `type <Feature>WorkerFixtures`, pass that type as the second generic to `base.extend`, and wrap the function as `[fn, { scope: 'worker' }]` as in [Worker-Scoped Fixtures](#worker-scoped-fixtures).

### More workers = Slower

- **Too many workers thrash**. Limit in CI:

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  workers: process.env.CI ? 2 : undefined
});
```
