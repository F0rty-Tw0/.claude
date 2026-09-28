# Projects & Dependencies

Every config sample below is `e2e/playwright.config.ts`. Each nested object (`use`, a project's `use`, a viewport) is a named `const` above `defineConfig`, and `projects` is itself a named `const`. Top-level `use`, `timeout`, `retries`, and `testMatch` are inherited by every project, so a project's `use` only carries what differs. Paths resolve from the config's folder, so the config sets no top-level `testDir`, and a project's `testDir` is `'./api'`, not `'./e2e/api'`.

## Table of Contents

1. [Project Configuration](#project-configuration)
2. [Project Dependencies](#project-dependencies)
3. [Setup Projects](#setup-projects)
4. [Filtering & Running Projects](#filtering--running-projects)
5. [Sharing Configuration](#sharing-configuration)
6. [Advanced Patterns](#advanced-patterns)

## Project Configuration

### Basic Multi-Browser Setup

`devices[...]` is already an object, so it is passed directly as a project's `use`.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Environment-Based Projects

One project per target; `--project=staging` picks the base URL.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const local = { baseURL: 'http://localhost:3000' };
const production = { baseURL: 'https://example.com' };
const staging = { baseURL: 'https://staging.example.com' };

const projects = [
  { name: 'local', use: local },
  { name: 'production', use: production },
  { name: 'staging', use: staging }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Test Type Projects

A project can own its own `testDir`, so E2E, API, and visual suites run under one config.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const api = { baseURL: 'http://localhost:3000' };

const viewport = { height: 720, width: 1280 };

const visual = { ...devices['Desktop Chrome'], viewport };

const projects = [
  { name: 'e2e', testDir: './features', use: devices['Desktop Chrome'] },
  { name: 'api', testDir: './api', use: api },
  { name: 'visual', testDir: './visual', use: visual }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

## Project Dependencies

### Setup Dependency

The `setup` project runs first; browser projects declare `dependencies: ['setup']` and read the storage state it wrote.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' };
const firefox = { ...devices['Desktop Firefox'], storageState: 'e2e/.auth/user.json' };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium },
  { dependencies: ['setup'], name: 'firefox', use: firefox }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Multiple Auth States

One setup project per role. A test project depends on the role it needs; an integration project depends on both.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const admin = { storageState: 'e2e/.auth/admin.json' };
const user = { storageState: 'e2e/.auth/user.json' };

const projects = [
  { name: 'setup-admin', testMatch: /admin\.setup\.ts/ },
  { name: 'setup-user', testMatch: /user\.setup\.ts/ },
  { dependencies: ['setup-admin'], name: 'admin-tests', testDir: './admin', use: admin },
  { dependencies: ['setup-user'], name: 'user-tests', testDir: './user', use: user },
  { dependencies: ['setup-admin', 'setup-user'], name: 'integration-tests', testDir: './integration' }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Chained Dependencies

Dependencies form a chain: database, then auth, then seed, then tests. Each stage runs only after the one it names.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const projects = [
  { name: 'db-setup', testMatch: /db\.setup\.ts/ },
  { dependencies: ['db-setup'], name: 'auth-setup', testMatch: /auth\.setup\.ts/ },
  { dependencies: ['auth-setup'], name: 'seed-setup', testMatch: /seed\.setup\.ts/ },
  { dependencies: ['seed-setup'], name: 'tests' }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

## Setup Projects

### Authentication Setup

Setup projects are the recommended way to handle authentication. They run before your main test projects and can use Playwright fixtures.

> **For complete authentication patterns** (storage state, multiple auth states, auth fixtures), see [fixtures-hooks.md](fixtures-hooks.md#authentication-patterns).

### Data Seeding Setup

A setup file is not a behaviour spec: its body calls the util directly, with no steps, and its title names what it produces. The API calls live in a test util; `SEED_COUNTS: SeedCounts` (`{ orders: 100, products: 50, users: 10 }`) lives in `common/playwright.const.ts`.

```ts
// e2e/test/utils/seed.spec.util.ts
import type { APIRequestContext } from '@playwright/test';

import type { SeedCounts } from '../../common/playwright.type';

export const seedTestData = async (request: APIRequestContext, counts: SeedCounts): Promise<void> => {
  await request.post('/api/test/seed', { data: counts });
};

export const clearTestData = async (request: APIRequestContext): Promise<void> => {
  await request.delete('/api/test/cleanup');
};
```

```ts
// e2e/seed.setup.ts
import { test as setup } from '@playwright/test';

import { SEED_COUNTS } from './common/playwright.const';
import { seedTestData } from './test/utils/seed.spec.util';

setup('seeds orders, products, and users', async ({ request }): Promise<void> => {
  await seedTestData(request, SEED_COUNTS);
});
```

### Cleanup Setup

The same shape removes leftovers from the previous run before seeding.

```ts
// e2e/cleanup.setup.ts
import { test as setup } from '@playwright/test';

import { clearTestData } from './test/utils/seed.spec.util';

setup('clears the data the previous run left', async ({ request }): Promise<void> => {
  await clearTestData(request);
});
```

## Filtering & Running Projects

### Run Specific Project

```bash
# Run single project
npx playwright test --project=chromium

# Run multiple projects
npx playwright test --project=chromium --project=firefox
```

### Run by Grep

```bash
# Run tests matching pattern
npx playwright test --grep @smoke

# Run project with grep
npx playwright test --project=chromium --grep @critical

# Exclude pattern
npx playwright test --grep-invert @slow
```

### Project-Specific Grep

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const projects = [
  { grep: /@smoke/, name: 'smoke', use: devices['Desktop Chrome'] },
  { grepInvert: /@smoke/, name: 'regression', use: devices['Desktop Chrome'] }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

## Sharing Configuration

### Base Configuration

Top-level `use`, `timeout`, and `expect` are inherited by every project. A project only spreads what it adds on top.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const expect = { timeout: 5_000 };

const use = { screenshot: 'only-on-failure', trace: 'on-first-retry' } as const;

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] }
];

export default defineConfig({ expect, projects, testMatch: '**/*.@(e2e|test).ts', timeout: 30_000, use });
```

### Shared Project Settings

Settings that only some projects share (browser projects retry, the API project does not) go in a named const and are spread into each project that wants them.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const browserUse = { trace: 'on-first-retry', video: 'on-first-retry' } as const;

const browserProject = { retries: 2, timeout: 60_000 };

const chromium = { ...browserUse, ...devices['Desktop Chrome'] };
const firefox = { ...browserUse, ...devices['Desktop Firefox'] };

const projects = [
  { ...browserProject, name: 'chromium', use: chromium },
  { ...browserProject, name: 'firefox', use: firefox },
  { name: 'api', testDir: './api' }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

## Advanced Patterns

### Conditional Projects

`projects` is a mutable `Project[]`; extra entries are pushed under an environment guard. Firefox joins only in CI, mobile only when `TEST_MOBILE` is set.

```ts
// e2e/playwright.config.ts
import type { Project } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';

const chromium: Project = { name: 'chromium', use: devices['Desktop Chrome'] };
const firefox: Project = { name: 'firefox', use: devices['Desktop Firefox'] };
const mobile: Project = { name: 'mobile', use: devices['iPhone 14'] };

const projects: Project[] = [chromium];

if (process.env.CI) projects.push(firefox);

if (process.env.TEST_MOBILE) projects.push(mobile);

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

### Project Metadata

`metadata` is free-form and reaches a test through `testInfo.project.metadata`. Name its shape so the read is typed.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const chromiumMetadata = { browser: 'chromium', platform: 'desktop', priority: 'high' };

const projects = [{ metadata: chromiumMetadata, name: 'chromium', use: devices['Desktop Chrome'] }];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

```ts
// e2e/gallery/gallery.e2e.ts
import type { ProjectMetadata } from '../common/playwright.type';
import { test } from './gallery.fixture';

test.describe('FEATURE: gallery', () => {
  test('GIVEN a desktop project, hovering an image shows the caption', async ({ galleryPage }, testInfo): Promise<void> => {
    const metadata: ProjectMetadata = testInfo.project.metadata;

    test.skip(metadata.platform !== 'desktop', 'Hover needs a pointer');

    await test.step('WHEN the gallery is opened', (): Promise<void> => galleryPage.goto());

    await test.step('AND the first image is hovered', (): Promise<void> => galleryPage.hoverImage());

    await test.step('THEN caption is visible', (): Promise<void> => galleryPage.expectCaptionVisible());
  });
});
```

### Teardown Projects

A project's `teardown` names another project that runs after every project depending on it has finished. A teardown file follows the setup-file shape: no steps, and a title naming what it leaves behind.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const projects = [
  { name: 'setup', teardown: 'teardown', testMatch: /.*\.setup\.ts/ },
  { name: 'teardown', testMatch: /.*\.teardown\.ts/ },
  { dependencies: ['setup'], name: 'tests' }
];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

```ts
// e2e/cleanup.teardown.ts
import { test as teardown } from '@playwright/test';

import { clearTestData } from './test/utils/seed.spec.util';

teardown('clears the seeded data', async ({ request }): Promise<void> => {
  await clearTestData(request);
});
```

## Anti-Patterns to Avoid

| Anti-Pattern               | Problem                | Solution                            |
| -------------------------- | ---------------------- | ----------------------------------- |
| Too many browser projects  | Slow CI, expensive     | Focus on critical browsers          |
| Missing setup dependencies | Tests fail randomly    | Declare all dependencies explicitly |
| Duplicated configuration   | Hard to maintain       | Extract shared config               |
| Not using setup projects   | Repeated auth in tests | Use setup project + storageState    |

## Related References

- **Global Setup**: See [global-setup.md](global-setup.md) for globalSetup vs setup projects
- **Fixtures**: See [fixtures-hooks.md](fixtures-hooks.md) for authentication patterns
- **CI/CD**: See [ci-cd.md](../infrastructure-ci-cd/ci-cd.md) for running projects in CI
