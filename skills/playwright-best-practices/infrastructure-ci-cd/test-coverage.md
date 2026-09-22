# Test Coverage

## Table of Contents

1. [Coverage Setup](#coverage-setup)
2. [Collecting Coverage](#collecting-coverage)
3. [Coverage Reports](#coverage-reports)
4. [Coverage Thresholds](#coverage-thresholds)
5. [Advanced Patterns](#advanced-patterns)
6. [CI Integration](#ci-integration)

## Coverage Setup

### Install Dependencies

```bash
# For V8 coverage (built into Playwright)
# No additional dependencies needed

# For Istanbul-based coverage (more features)
npm install -D nyc @istanbuljs/nyc-config-typescript
```

### Basic Configuration

`page.coverage` is a Chromium-only API. V8 coverage needs no `use` option; it starts when a fixture or test calls `startJSCoverage`. The only config change is limiting the coverage project to Chromium.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const projects = [{ name: 'chromium', use: devices['Desktop Chrome'] }];

export default defineConfig({
  projects,
  testDir: './e2e'
});
```

### Coverage Types

Playwright's `stopJSCoverage` returns entries with `functions[].ranges[]` (`startOffset`, `endOffset`, `count`) and `source`; `stopCSSCoverage` returns entries with `ranges[]` (`start`, `end`) and `text`. The two shapes differ, so each is named. Playwright does not export these types by name, so the feature declares them.

```ts
// e2e/coverage/common/coverage.type.ts
export type CoverageRange = {
  readonly count: number;
  readonly endOffset: number;
  readonly startOffset: number;
};

export type CoverageFunction = {
  readonly functionName: string;
  readonly isBlockCoverage: boolean;
  readonly ranges: CoverageRange[];
};

export type JsCoverageEntry = {
  readonly functions: CoverageFunction[];
  readonly scriptId: string;
  readonly source?: string;
  readonly url: string;
};

export type CssRange = {
  readonly end: number;
  readonly start: number;
};

export type CssCoverageEntry = {
  readonly ranges: CssRange[];
  readonly text?: string;
  readonly url: string;
};

export type CoverageSummary = {
  readonly files: number;
  readonly percent: number;
};

export type CoverageThreshold = {
  readonly minCoverage: number;
  readonly pattern: RegExp;
};
```

```ts
// e2e/coverage/common/coverage.const.ts
import type { CoverageThreshold } from './coverage.type';

export const COVERAGE_DIR = './coverage';

export const MIN_COVERAGE_PERCENT = 80;

export const SOURCE_PATH_MARKER = '/src/';

export const COVERAGE_THRESHOLDS: CoverageThreshold[] = [
  { minCoverage: 90, pattern: /\/src\/core\// },
  { minCoverage: 85, pattern: /\/src\/utils\// },
  { minCoverage: 70, pattern: /\/src\/components\// },
  { minCoverage: 60, pattern: /\/src\/pages\// }
];
```

### V8 Coverage Fixture

An `auto` fixture on `page` starts JS and CSS coverage before every test and writes one JSON file per kind after it. Merge it into `e2e/playwright.fixture.ts` with `mergeTests` so every spec collects without importing it. A spec that starts coverage by hand must not use this fixture on the same page; `startJSCoverage` throws when coverage is already running.

```ts
// e2e/coverage/coverage.fixture.ts
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { test as base } from '@playwright/test';

import { COVERAGE_DIR } from './common/coverage.const';

type CoverageFixtures = {
  readonly collectCoverage: void;
};

export const test = base.extend<CoverageFixtures>({
  collectCoverage: [
    async ({ page }, use): Promise<void> => {
      await page.coverage.startJSCoverage();
      await page.coverage.startCSSCoverage();

      await use();

      const jsCoverage = await page.coverage.stopJSCoverage();
      const cssCoverage = await page.coverage.stopCSSCoverage();
      const id = randomUUID();

      await mkdir(COVERAGE_DIR, { recursive: true });
      await writeFile(join(COVERAGE_DIR, `js-${id}.json`), JSON.stringify(jsCoverage));
      await writeFile(join(COVERAGE_DIR, `css-${id}.json`), JSON.stringify(cssCoverage));
    },
    { auto: true }
  ]
});

export { expect } from '@playwright/test';
```

## Collecting Coverage

### Coverage Utils

The percentages are byte-based approximations: a function's uncovered bytes are the ranges with `count === 0`. Nested zero-count ranges can double count; use `v8-to-istanbul` ([Coverage Reports](#coverage-reports)) for exact line numbers. `moduleCoveragePercent` returns `0` when no entry matches, so a missing module fails a threshold instead of passing silently.

```ts
// e2e/coverage/test/utils/js-coverage.spec.util.ts
import { SOURCE_PATH_MARKER } from '../../common/coverage.const';
import type { CoverageFunction, CoverageRange, CoverageSummary, JsCoverageEntry } from '../../common/coverage.type';

const EMPTY_SUMMARY: CoverageSummary = { files: 0, percent: 0 };

const functionRanges = (fn: CoverageFunction): CoverageRange[] => fn.ranges;

const isUncovered = (range: CoverageRange): boolean => range.count === 0;

const addRangeLength = (sum: number, range: CoverageRange): number => sum + range.endOffset - range.startOffset;

const sourceLength = (entry: JsCoverageEntry): number => entry.source?.length ?? 0;

const addSourceLength = (sum: number, entry: JsCoverageEntry): number => sum + sourceLength(entry);

const addUncoveredBytes = (sum: number, entry: JsCoverageEntry): number => sum + uncoveredBytes(entry);

export const isSourceEntry = (entry: JsCoverageEntry): boolean => entry.url.includes(SOURCE_PATH_MARKER);

export const uncoveredBytes = (entry: JsCoverageEntry): number => {
  const ranges = entry.functions.flatMap(functionRanges);
  const zeroRanges = ranges.filter(isUncovered);

  return zeroRanges.reduce(addRangeLength, 0);
};

export const jsCoveragePercent = (entry: JsCoverageEntry): number => {
  const total = sourceLength(entry);

  if (total === 0) return 0;

  return ((total - uncoveredBytes(entry)) / total) * 100;
};

export const moduleCoveragePercent = (entries: JsCoverageEntry[], moduleName: string): number => {
  const entry = entries.find((candidate: JsCoverageEntry): boolean => candidate.url.includes(moduleName));

  if (entry === undefined) return 0;

  return jsCoveragePercent(entry);
};

export const summarizeCoverage = (entries: JsCoverageEntry[]): CoverageSummary => {
  const sourceEntries = entries.filter(isSourceEntry);
  const total = sourceEntries.reduce(addSourceLength, 0);

  if (total === 0) return EMPTY_SUMMARY;

  const uncovered = sourceEntries.reduce(addUncoveredBytes, 0);
  const summary: CoverageSummary = { files: sourceEntries.length, percent: ((total - uncovered) / total) * 100 };

  return summary;
};
```

```ts
// e2e/coverage/test/utils/css-coverage.spec.util.ts
import type { CssCoverageEntry, CssRange } from '../../common/coverage.type';

const addRangeLength = (sum: number, range: CssRange): number => sum + range.end - range.start;

export const cssUnusedPercent = (entry: CssCoverageEntry): number => {
  const total = entry.text?.length ?? 0;

  if (total === 0) return 0;

  const used = entry.ranges.reduce(addRangeLength, 0);

  return ((total - used) / total) * 100;
};

export const stylesheetUnusedPercent = (entries: CssCoverageEntry[], stylesheetName: string): number => {
  const entry = entries.find((candidate: CssCoverageEntry): boolean => candidate.url.includes(stylesheetName));

  if (entry === undefined) return 100;

  return cssUnusedPercent(entry);
};
```

Reading the files the fixture wrote is one util shared by the reporter and the scripts below.

```ts
// e2e/coverage/test/utils/coverage-files.spec.util.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { JsCoverageEntry } from '../../common/coverage.type';

const isJsCoverageFile = (file: string): boolean => file.startsWith('js-');

export const readJsCoverageEntries = async (dir: string): Promise<JsCoverageEntry[]> => {
  const files = await readdir(dir);
  const jsFiles = files.filter(isJsCoverageFile);
  const entries: JsCoverageEntry[] = [];

  for (const file of jsFiles) {
    const raw = await readFile(join(dir, file), 'utf-8');
    const fileEntries: JsCoverageEntry[] = JSON.parse(raw);

    entries.push(...fileEntries);
  }

  return entries;
};
```

### Per-Test Coverage

A targeted test starts coverage itself, drives the page object, and asserts on one module. `resetOnNavigation: false` keeps entries across `goto`. The `stop` step returns the entries; a sync step derives the percent so the assertion step stays one `expect`. `checkout.fixture.ts` follows the standard fixture shape and exposes `checkoutPage`.

```ts
// e2e/checkout/pages/checkout.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class CheckoutPage {
  public readonly helpButton: Locator;
  public readonly helpDialog: Locator;
  public readonly payButton: Locator;
  public readonly successMessage: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.helpButton = page.getByRole('button', { name: 'Help' });
    this.helpDialog = page.getByRole('dialog');
    this.payButton = page.getByRole('button', { name: 'Pay' });
    this.successMessage = page.getByText('Success');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/checkout');
  }

  public async pay(): Promise<void> {
    await this.payButton.click();
  }

  public async openHelp(): Promise<void> {
    await this.helpButton.hover();
    await this.helpButton.click();
  }

  public async expectSuccess(): Promise<void> {
    await test.step('success message is shown', (): Promise<void> => expect(this.successMessage).toBeVisible(), { box: true });
  }

  public async expectHelpOpen(): Promise<void> {
    await test.step('help dialog is open', (): Promise<void> => expect(this.helpDialog).toBeVisible(), { box: true });
  }
}
```

```ts
// e2e/checkout/checkout-coverage.spec.ts
import { MIN_COVERAGE_PERCENT } from '../coverage/common/coverage.const';
import type { CssCoverageEntry, JsCoverageEntry } from '../coverage/common/coverage.type';
import { stylesheetUnusedPercent } from '../coverage/test/utils/css-coverage.spec.util';
import { moduleCoveragePercent } from '../coverage/test/utils/js-coverage.spec.util';
import { expect, test } from './checkout.fixture';

const MAX_UNUSED_CSS_PERCENT = 50;

test.describe('FEATURE: checkout coverage', () => {
  test.describe('GIVEN the checkout page', () => {
    test('submitting the payment covers the checkout module', async ({ checkoutPage, page }): Promise<void> => {
      await test.step('GIVEN js coverage is recording', (): Promise<void> => page.coverage.startJSCoverage({ resetOnNavigation: false }));

      await test.step('AND the checkout page is open', (): Promise<void> => checkoutPage.goto());

      await test.step('WHEN the payment is submitted', (): Promise<void> => checkoutPage.pay());

      await test.step('THEN the success message is shown', (): Promise<void> => checkoutPage.expectSuccess());

      const entries = await test.step('AND js coverage is collected', (): Promise<JsCoverageEntry[]> => page.coverage.stopJSCoverage());
      const percent = await test.step('AND checkout.js coverage is measured', (): number => moduleCoveragePercent(entries, 'checkout.js'));

      await test.step('AND the checkout module meets the minimum', (): Promise<void> => expect(percent).toBeGreaterThan(MIN_COVERAGE_PERCENT));
    });

    test('opening the help dialog uses most of the stylesheet', async ({ checkoutPage, page }): Promise<void> => {
      await test.step('GIVEN css coverage is recording', (): Promise<void> => page.coverage.startCSSCoverage());

      await test.step('AND the checkout page is open', (): Promise<void> => checkoutPage.goto());

      await test.step('WHEN the help dialog is opened', (): Promise<void> => checkoutPage.openHelp());

      await test.step('THEN the help dialog is open', (): Promise<void> => checkoutPage.expectHelpOpen());

      const entries = await test.step('AND css coverage is collected', (): Promise<CssCoverageEntry[]> => page.coverage.stopCSSCoverage());
      const unused = await test.step('AND app.css unused share is measured', (): number => stylesheetUnusedPercent(entries, 'app.css'));

      await test.step('AND under half of the stylesheet is unused', (): Promise<void> => expect(unused).toBeLessThan(MAX_UNUSED_CSS_PERCENT));
    });
  });
});
```

| Variant | Change |
|---|---|
| Coverage for the whole run | Drop the start/stop steps and rely on the `auto` fixture above. |
| Coverage for one file | `moduleCoveragePercent(entries, 'checkout.js')` picks the first entry whose `url` contains the name. |
| Unused CSS per stylesheet | Loop `entries` in a util and collect every `cssUnusedPercent` above the ceiling into a `string[]` of violations. |

## Coverage Reports

### Converting to Istanbul Format

`v8-to-istanbul` turns one V8 entry into Istanbul's map keyed by file path. The script reads every `js-*.json` the fixture wrote, converts entries whose `url` is a local `file://` path, and writes `coverage-final.json` for `nyc`. A dev server serves `http://` URLs; map them to disk paths before calling `v8ToIstanbul`. `CoverageMapData` comes from `istanbul-lib-coverage`, which `v8-to-istanbul` depends on.

```ts
// scripts/convert-coverage.ts
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CoverageMapData } from 'istanbul-lib-coverage';
import v8ToIstanbul from 'v8-to-istanbul';

import { COVERAGE_DIR } from '../e2e/coverage/common/coverage.const';
import type { JsCoverageEntry } from '../e2e/coverage/common/coverage.type';
import { readJsCoverageEntries } from '../e2e/coverage/test/utils/coverage-files.spec.util';

const isLocalFile = (entry: JsCoverageEntry): boolean => entry.url.startsWith('file://');

const convertEntry = async (entry: JsCoverageEntry): Promise<CoverageMapData> => {
  const converter = v8ToIstanbul(entry.url.replace('file://', ''));

  await converter.load();
  converter.applyCoverage(entry.functions);

  return converter.toIstanbul();
};

const convertCoverage = async (): Promise<void> => {
  const entries = await readJsCoverageEntries(COVERAGE_DIR);
  const localEntries = entries.filter(isLocalFile);
  const istanbulCoverage: CoverageMapData = {};

  for (const entry of localEntries) {
    const converted = await convertEntry(entry);

    Object.assign(istanbulCoverage, converted);
  }

  await writeFile(join(COVERAGE_DIR, 'coverage-final.json'), JSON.stringify(istanbulCoverage));
};

await convertCoverage();
```

### Generating HTML Report

`json-summary` writes `coverage-summary.json`, which the CI threshold step below reads.

```bash
# Using nyc to generate report
npx nyc report --reporter=html --reporter=text --temp-dir=./coverage
```

```json
{
  "scripts": {
    "test": "playwright test",
    "test:coverage": "playwright test && npm run coverage:report",
    "coverage:report": "npx nyc report --reporter=html --reporter=lcov --reporter=json-summary --temp-dir=./coverage"
  }
}
```

### Custom Coverage Reporter

The reporter aggregates every `js-*.json` in `onEnd`, prints one summary line, and returns `status: 'failed'` when the byte percentage is under the minimum. The returned status marks the whole run failed, so the threshold is enforced without a test.

```ts
// e2e/reporters/coverage.reporter.ts
import type { FullResult, Reporter } from '@playwright/test/reporter';

import { COVERAGE_DIR, MIN_COVERAGE_PERCENT } from '../coverage/common/coverage.const';
import { readJsCoverageEntries } from '../coverage/test/utils/coverage-files.spec.util';
import { summarizeCoverage } from '../coverage/test/utils/js-coverage.spec.util';

class CoverageReporter implements Reporter {
  public async onEnd(result: FullResult): Promise<FullResult> {
    const entries = await readJsCoverageEntries(COVERAGE_DIR);
    const summary = summarizeCoverage(entries);
    const percent = summary.percent.toFixed(1);

    console.log(`Coverage: ${summary.files} source files, ${percent}% bytes covered`);

    if (summary.percent >= MIN_COVERAGE_PERCENT) return result;

    console.warn(`Coverage ${percent}% is below the ${MIN_COVERAGE_PERCENT}% threshold`);

    const failed: FullResult = { ...result, status: 'failed' };

    return failed;
  }
}

export default CoverageReporter;
```

```ts
// e2e/playwright.config.ts
import type { ReporterDescription } from '@playwright/test';
import { defineConfig } from '@playwright/test';

const reporter: ReporterDescription[] = [['list'], ['./reporters/coverage.reporter.ts']];

export default defineConfig({ reporter });
```

## Coverage Thresholds

### Enforcing Minimum Coverage

The reporter above is the enforcement point. Avoid a `test.afterAll` that reads the coverage files and calls `expect`: Playwright runs `afterAll` once per worker per file, so the check runs before the other workers finish writing, and a spec file with no tests never runs its hooks at all.

```ts avoid
test.afterAll(async () => {
  const percent = await readCoveragePercent();
  expect(percent).toBeGreaterThan(80);
});
```

Prefer the reporter's `onEnd`, which runs once after every worker has exited.

### Per-Directory Thresholds

`COVERAGE_THRESHOLDS` in `coverage.const.ts` lists a pattern and a minimum per directory. The util returns one violation string per pattern under its minimum; the reporter or a script prints them and fails on a non-empty list.

```ts
// e2e/coverage/test/utils/coverage-thresholds.spec.util.ts
import type { CoverageThreshold, JsCoverageEntry } from '../../common/coverage.type';
import { summarizeCoverage } from './js-coverage.spec.util';

export const thresholdViolations = (entries: JsCoverageEntry[], thresholds: CoverageThreshold[]): string[] => {
  const violations: string[] = [];

  for (const threshold of thresholds) {
    const matching = entries.filter((entry: JsCoverageEntry): boolean => threshold.pattern.test(entry.url));
    const summary = summarizeCoverage(matching);

    if (summary.percent < threshold.minCoverage) {
      violations.push(`${threshold.pattern}: ${summary.percent.toFixed(1)}% < ${threshold.minCoverage}%`);
    }
  }

  return violations;
};
```

## Advanced Patterns

### Merging Coverage Across Shards

Each shard uploads its `coverage/` directory as `shard-<n>`. The merge script keys entries by `url` and appends the `functions` of later shards to the first entry seen, so the byte math above counts every range.

```ts
// scripts/merge-coverage.ts
import { readFile, writeFile } from 'node:fs/promises';

import { glob } from 'glob';

import type { JsCoverageEntry } from '../e2e/coverage/common/coverage.type';

const mergeEntry = (merged: Map<string, JsCoverageEntry>, entry: JsCoverageEntry): void => {
  const existing = merged.get(entry.url);

  if (existing === undefined) {
    merged.set(entry.url, entry);

    return;
  }

  existing.functions.push(...entry.functions);
};

const mergeCoverage = async (): Promise<void> => {
  const files = await glob('shard-*/coverage/js-*.json');
  const merged = new Map<string, JsCoverageEntry>();

  for (const file of files) {
    const raw = await readFile(file, 'utf-8');
    const entries: JsCoverageEntry[] = JSON.parse(raw);

    for (const entry of entries) {
      mergeEntry(merged, entry);
    }
  }

  await writeFile('./coverage/js-merged.json', JSON.stringify([...merged.values()]));
};

await mergeCoverage();
```

### Incremental Coverage

In CI, print coverage only for the `.ts` files the last commit changed. A changed file without a coverage entry prints `0.0%`.

```ts
// scripts/changed-files-coverage.ts
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import type { JsCoverageEntry } from '../e2e/coverage/common/coverage.type';
import { moduleCoveragePercent } from '../e2e/coverage/test/utils/js-coverage.spec.util';

const isTypescriptFile = (file: string): boolean => file.endsWith('.ts');

const diff = execSync('git diff --name-only HEAD~1').toString();
const changedFiles = diff.split('\n').filter(isTypescriptFile);
const raw = await readFile('./coverage/js-merged.json', 'utf-8');
const entries: JsCoverageEntry[] = JSON.parse(raw);

for (const file of changedFiles) {
  const percent = moduleCoveragePercent(entries, file);

  console.log(`${file}: ${percent.toFixed(1)}%`);
}
```

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests with Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm ci
      - run: npx playwright install --with-deps

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
```

## Anti-Patterns to Avoid

| Anti-Pattern                 | Problem                                | Solution                    |
| ---------------------------- | -------------------------------------- | --------------------------- |
| Coverage for coverage's sake | Gaming metrics                         | Focus on critical paths     |
| 100% coverage target         | Diminishing returns, tests for getters | Set realistic thresholds    |
| Ignoring coverage drops      | Technical debt                         | Enforce thresholds in CI    |
| No source map support        | Wrong line numbers                     | Enable source maps in build |
| Coverage only in CI          | Late feedback                          | Run locally too             |
| Threshold check in `test.afterAll` | Runs per worker per file, skipped when a file has no tests | Reporter `onEnd` returning `status: 'failed'` |

## Related References

- **CI/CD**: See [ci-cd.md](ci-cd.md) for pipeline configuration
- **Performance**: See [performance.md](performance.md) for optimizing coverage collection
