# Global Setup & Teardown

## Table of Contents

1. [Global Setup](#global-setup)
2. [Global Teardown](#global-teardown)
3. [Database Patterns](#database-patterns)
4. [Environment Provisioning](#environment-provisioning)
5. [Setup Projects vs Global Setup](#setup-projects-vs-global-setup)
6. [Parallel Execution Caveats](#parallel-execution-caveats)

## Global Setup

### Basic Global Setup

A global setup file default-exports one async function. It receives the resolved `FullConfig` and runs once before any worker starts: start services, run migrations, and similar one-time work.

```ts
// e2e/global-setup.ts
import type { FullConfig } from '@playwright/test';

const globalSetup = async (config: FullConfig): Promise<void> => {
  process.env.TEST_RUN_ID = `run-${Date.now()}-${config.workers}`;
};

export default globalSetup;
```

### Configure Global Setup

Paths resolve relative to the config file.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts'
});
```

> **Authentication in Global Setup**: For authentication patterns using storage state in global setup, see [fixtures-hooks.md](fixtures-hooks.md#authentication-patterns). Setup projects are generally preferred for authentication as they provide access to Playwright fixtures.

### Global Setup with Return Value

The setup may return a teardown function instead of a separate `globalTeardown` file. The function type is named. `startTestServer` and `stopTestServices` are the spawn-and-probe wrappers described under [Start Services in Setup](#start-services-in-setup); they sit beside `waitForServer` in `test-server.spec.util.ts`.

```ts
// e2e/global-setup.ts
import { startTestServer } from './test/utils/test-server.spec.util';

type Teardown = () => Promise<void>;

const globalSetup = async (): Promise<Teardown> => {
  const server = await startTestServer();

  return (): Promise<void> => server.stop();
};

export default globalSetup;
```

### Access Config in Global Setup

`config` exposes the resolved projects, `workers`, and `timeout`. The first project's `use.baseURL` is the usual way to find the target URL without hardcoding it; `process.env.CI` tells setup whether it runs on CI.

```ts
// e2e/global-setup.ts
import type { FullConfig } from '@playwright/test';

import { waitForServer } from './test/utils/test-server.spec.util';

const globalSetup = async (config: FullConfig): Promise<void> => {
  const [project] = config.projects;
  const baseURL = project.use.baseURL ?? 'http://localhost:3000';
  const isCi = Boolean(process.env.CI);
  const timeout = isCi ? project.timeout * 2 : project.timeout;

  await waitForServer(`${baseURL}/health`, timeout);
};

export default globalSetup;
```

## Global Teardown

### Basic Global Teardown

Teardown removes what setup created: auth files, test data, services. A call result used in a condition is a named const first.

```ts
// e2e/global-teardown.ts
import fs from 'node:fs';

import { cleanupTestDatabase } from './test/utils/database.spec.util';
import { stopTestServices } from './test/utils/test-server.spec.util';

const AUTH_DIR = 'e2e/.auth';

const globalTeardown = async (): Promise<void> => {
  const hasAuthDir = fs.existsSync(AUTH_DIR);

  if (hasAuthDir) fs.rmSync(AUTH_DIR, { recursive: true });

  await cleanupTestDatabase();
  await stopTestServices();
};

export default globalTeardown;
```

### Conditional Teardown

CI containers are discarded after the run, so cleanup there is wasted time. The guard is one line.

```ts
// e2e/global-teardown.ts
import { cleanupLocalTestData } from './test/utils/database.spec.util';

const globalTeardown = async (): Promise<void> => {
  if (process.env.CI) return;

  await cleanupLocalTestData();
};

export default globalTeardown;
```

## Database Patterns

This section covers **one-time database setup** (migrations, snapshots, per-worker databases). For related topics:

- **Per-test database fixtures** (isolation, transaction rollback): See [fixtures-hooks.md](fixtures-hooks.md#database-fixtures)
- **Test data factories** (builders, Faker): See [test-data.md](test-data.md)

### Database Migration in Setup

Migrations and seeds run as shell commands with inherited stdio so their output lands in the test log.

```ts
// e2e/global-setup.ts
import { execSync } from 'node:child_process';

const globalSetup = async (): Promise<void> => {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  execSync('npx prisma db seed', { stdio: 'inherit' });
};

export default globalSetup;
```

### Database Snapshot Pattern

The first run migrates, seeds, and dumps a snapshot. Later runs restore the snapshot and return early.

```ts
// e2e/global-setup.ts
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const SNAPSHOT_PATH = './test-db-snapshot.sql';

const globalSetup = async (): Promise<void> => {
  const hasSnapshot = fs.existsSync(SNAPSHOT_PATH);

  if (hasSnapshot) {
    execSync(`psql $DATABASE_URL < ${SNAPSHOT_PATH}`, { stdio: 'inherit' });

    return;
  }

  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  execSync('npx prisma db seed', { stdio: 'inherit' });
  execSync(`pg_dump $DATABASE_URL > ${SNAPSHOT_PATH}`, { stdio: 'inherit' });
};

export default globalSetup;
```

### Test Database per Worker

Setup creates one database per worker from `config.workers`; teardown drops them. Tests pick theirs by `workerInfo.workerIndex` (see [fixtures-hooks.md](fixtures-hooks.md#worker-scope)).

```ts
// e2e/global-setup.ts
import type { FullConfig } from '@playwright/test';

import { createDatabase, runMigrations, seedDatabase } from './test/utils/database.spec.util';

const globalSetup = async (config: FullConfig): Promise<void> => {
  const workerCount = config.workers || 1;

  for (let index = 0; index < workerCount; index += 1) {
    const dbName = `test_db_worker_${index}`;

    await createDatabase(dbName);
    await runMigrations(dbName);
    await seedDatabase(dbName);
  }
};

export default globalSetup;
```

```ts
// e2e/global-teardown.ts
import type { FullConfig } from '@playwright/test';

import { dropDatabase } from './test/utils/database.spec.util';

const globalTeardown = async (config: FullConfig): Promise<void> => {
  const workerCount = config.workers || 1;

  for (let index = 0; index < workerCount; index += 1) {
    await dropDatabase(`test_db_worker_${index}`);
  }
};

export default globalTeardown;
```

## Environment Provisioning

### Start Services in Setup

Prefer the config `webServer` option: it spawns the process, polls the URL, and stops it after the run. When a process must be owned here, `spawn` it, store the handle at module scope for teardown, and wait for its health endpoint with a bounded probe in a util.

```ts
// e2e/test/utils/test-server.spec.util.ts
import { setTimeout } from 'node:timers/promises';

const PROBE_INTERVAL_MS = 1000;

const isServerUp = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url);

    return response.ok;
  } catch {
    return false;
  }
};

export const waitForServer = async (url: string, timeout: number): Promise<void> => {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const isUp = await isServerUp(url);

    if (isUp) return;

    await setTimeout(PROBE_INTERVAL_MS);
  }

  throw new Error(`Server did not start within ${timeout}ms`);
};
```

```ts
// e2e/global-setup.ts
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';

import { waitForServer } from './test/utils/test-server.spec.util';

const SPAWN_OPTIONS = { detached: true, stdio: 'pipe' } as const;

let serverProcess: ChildProcess | undefined;

const globalSetup = async (): Promise<void> => {
  serverProcess = spawn('npm', ['run', 'start:test'], SPAWN_OPTIONS);

  await waitForServer('http://localhost:3000/health', 30000);

  process.env.SERVER_PID = String(serverProcess.pid);
};

export default globalSetup;
```

### Docker Compose Setup

Compose brings the services up detached; a second command blocks until the database answers.

```ts
// e2e/global-setup.ts
import { execSync } from 'node:child_process';

const globalSetup = async (): Promise<void> => {
  execSync('docker-compose -f docker-compose.test.yml up -d', { stdio: 'inherit' });
  execSync('docker-compose -f docker-compose.test.yml exec -T db pg_isready', { stdio: 'inherit' });
};

export default globalSetup;
```

```ts
// e2e/global-teardown.ts
import { execSync } from 'node:child_process';

const globalTeardown = async (): Promise<void> => {
  execSync('docker-compose -f docker-compose.test.yml down -v', { stdio: 'inherit' });
};

export default globalTeardown;
```

### Environment Variables Setup

Load the environment file for the run, then fail fast on any missing required key. The filter's predicate declares its return type.

```ts
// e2e/global-setup.ts
import path from 'node:path';

import dotenv from 'dotenv';

const REQUIRED_KEYS = ['DATABASE_URL', 'API_KEY', 'TEST_EMAIL'];

const isMissing = (key: string): boolean => !process.env[key];

const globalSetup = async (): Promise<void> => {
  const envFile = process.env.CI ? '.env.ci' : '.env.test';

  dotenv.config({ path: path.resolve(process.cwd(), envFile) });

  const missing = REQUIRED_KEYS.filter(isMissing);

  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
};

export default globalSetup;
```

## Setup Projects vs Global Setup

### When to Use Each

| Use Global Setup                      | Use Setup Projects                       |
| ------------------------------------- | ---------------------------------------- |
| One-time setup (migrations, services) | Per-project setup (auth states)          |
| No access to Playwright fixtures      | Need page, request fixtures              |
| Runs once before all projects         | Can run per-project or have dependencies |
| Shared across all workers             | Can be parallelized                      |

### Setup Project Pattern

Test projects list `setup` in `dependencies`, so it runs first.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'] };

const firefox = { ...devices['Desktop Firefox'] };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium },
  { dependencies: ['setup'], name: 'firefox', use: firefox }
];

export default defineConfig({ projects });
```

> **For complete authentication setup patterns**, see [fixtures-hooks.md](fixtures-hooks.md#authentication-patterns).

### Combining Both

Global setup starts services and runs migrations; the setup project creates auth states on top of that.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' };

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium }
];

export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  projects
});
```

## Parallel Execution Caveats

### Understanding Global Setup Execution

```text
┌─────────────────────────────────────────────────────────────┐
│  globalSetup runs ONCE                                      │
│  ↓                                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Worker 1│  │ Worker 2│  │ Worker 3│  │ Worker 4│        │
│  │ tests   │  │ tests   │  │ tests   │  │ tests   │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│  ↓                                                          │
│  globalTeardown runs ONCE                                   │
└─────────────────────────────────────────────────────────────┘
```

**Key implications:**

- Global setup has **no access** to Playwright fixtures (`page`, `request`, `context`)
- State created in global setup is **shared** across all workers
- If tests **modify** shared state, they may conflict with parallel workers
- Global setup **cannot** react to individual test needs

### When to Prefer Worker-Scoped Fixtures

Use **worker-scoped fixtures** instead of globalSetup when:

| Scenario                             | Why Fixtures Are Better                              |
| ------------------------------------ | ---------------------------------------------------- |
| Each worker needs isolated resources | Fixtures can create per-worker databases, servers    |
| Setup needs Playwright APIs          | Fixtures have access to `page`, `request`, `browser` |
| Setup depends on test configuration  | Fixtures receive test context and options            |
| Resources need cleanup per worker    | Worker fixtures auto-cleanup when worker exits       |

### Common Parallel Pitfall

Avoid: global setup creates one user and every worker fights over it.

```ts avoid
const globalSetup = async (): Promise<void> => {
  await createUser({ email: 'test@example.com' });
};
```

Prefer: a worker-scoped fixture that names its user after `workerInfo.workerIndex`, so each worker owns its own data. The full sample is in [fixtures-hooks.md](fixtures-hooks.md#isolate-test-data-between-parallel-workers).

## Anti-Patterns to Avoid

| Anti-Pattern                   | Problem                          | Solution                                   |
| ------------------------------ | -------------------------------- | ------------------------------------------ |
| Heavy setup in globalSetup     | Slow test startup                | Use setup projects for parallelizable work |
| Not cleaning up in teardown    | Leaks resources, flaky CI        | Always clean up or use containers          |
| Hardcoded URLs in setup        | Breaks in different environments | Use config.projects[0].use.baseURL         |
| No timeout on service wait     | Hangs forever if service fails   | Add timeout with clear error               |
| Shared mutable state           | Race conditions in parallel      | Use worker-scoped fixtures for isolation   |
| Global setup for per-test data | Tests conflict                   | Use test-scoped fixtures                   |

## Related References

- **Fixtures & Auth**: See [fixtures-hooks.md](fixtures-hooks.md) for worker-scoped fixtures and auth patterns
- **CI/CD**: See [ci-cd.md](../infrastructure-ci-cd/ci-cd.md) for CI setup patterns
- **Projects**: See [projects-dependencies.md](projects-dependencies.md) for project configuration
