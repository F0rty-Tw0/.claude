# Performance Testing & Web Vitals

## Table of Contents

1. [Core Web Vitals](#core-web-vitals)
2. [Performance Metrics](#performance-metrics)
3. [Performance Budgets](#performance-budgets)
4. [Lighthouse Integration](#lighthouse-integration)
5. [Performance Fixtures](#performance-fixtures)
6. [CI Performance Monitoring](#ci-performance-monitoring)

Every metric is read by a browser-side function in `test/utils/` and returned through `page.evaluate`. The function must be self-contained: Playwright serialises it, so it cannot reference anything outside its own body. The page object owns the `evaluate` call; the spec reads the typed result in one step and asserts it in the next.

The types every sample below shares:

```ts
// e2e/performance/common/performance.type.ts
export type HeapUsage = { readonly totalJSHeapSize: number; readonly usedJSHeapSize: number };

export type MetricReport = { readonly name: string; readonly value: number };

export type NavigationTiming = {
  readonly connection: number;
  readonly dns: number;
  readonly domContentLoaded: number;
  readonly domProcessing: number;
  readonly download: number;
  readonly loadComplete: number;
  readonly ttfb: number;
};

export type PerformanceBudget = {
  readonly cls: number;
  readonly fcp: number;
  readonly imageCount: number;
  readonly jsSize: number;
  readonly lcp: number;
  readonly totalSize: number;
  readonly ttfb: number;
};

export type ResourceEntry = { readonly duration: number; readonly name: string; readonly size: number; readonly type: string };

export type ResourceSummary = { readonly imageCount: number; readonly jsSize: number; readonly totalSize: number };

export type WebVitals = { readonly cls: number; readonly fcp: number; readonly lcp: number };
```

## Core Web Vitals

### Measure LCP, FID, CLS

`PerformanceObserver` with `buffered: true` replays entries recorded before the observer existed, so no `addInitScript` and no `window` global are needed. LCP is the last `largest-contentful-paint` entry, CLS is the sum of `layout-shift` entries without recent input, FCP comes from the `paint` timeline. FID needs a real interaction and was replaced by INP in 2024; the [web-vitals library](#using-web-vitals-library) sample covers it. The layout-shift observer is registered first so its buffered entries are delivered before the LCP callback resolves the promise.

```ts
// e2e/performance/test/utils/web-vitals.spec.util.ts
import type { WebVitals } from '../../common/performance.type';

type LayoutShiftFields = { readonly hadRecentInput: boolean; readonly value: number };

type LayoutShiftEntry = PerformanceEntry & LayoutShiftFields;

export const readWebVitals = (): Promise<WebVitals> => {
  return new Promise<WebVitals>((resolve): void => {
    let cls = 0;
    const isLayoutShift = (entry: PerformanceEntry): entry is LayoutShiftEntry => 'hadRecentInput' in entry;
    const isFirstContentfulPaint = (entry: PerformanceEntry): boolean => entry.name === 'first-contentful-paint';

    const addShift = (entry: LayoutShiftEntry): void => {
      if (entry.hadRecentInput) return;

      cls += entry.value;
    };

    const onLayoutShift = (list: PerformanceObserverEntryList): void => {
      list.getEntries().filter(isLayoutShift).forEach(addShift);
    };

    const onLargestContentfulPaint = (list: PerformanceObserverEntryList): void => {
      const fcp = performance.getEntriesByType('paint').find(isFirstContentfulPaint)?.startTime ?? 0;
      const lcp = list.getEntries().at(-1)?.startTime ?? 0;

      resolve({ cls, fcp, lcp });
    };

    const layoutShiftObserver = new PerformanceObserver(onLayoutShift);
    const paintObserver = new PerformanceObserver(onLargestContentfulPaint);

    layoutShiftObserver.observe({ buffered: true, type: 'layout-shift' });
    paintObserver.observe({ buffered: true, type: 'largest-contentful-paint' });
  });
};
```

The page object hands each reader (the others are under [Performance Metrics](#performance-metrics)) to `page.evaluate` and waits for `networkidle` after navigation so the metrics are settled:

```ts
// e2e/performance/pages/performance.page.ts
import type { Page } from '@playwright/test';

import type { HeapUsage, NavigationTiming, ResourceEntry, WebVitals } from '../common/performance.type';
import { readHeapUsage } from '../test/utils/heap-usage.spec.util';
import { readNavigationTiming } from '../test/utils/navigation-timing.spec.util';
import { readResourceEntries } from '../test/utils/resource-timing.spec.util';
import { readWebVitals } from '../test/utils/web-vitals.spec.util';

export class PerformancePage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  public async heapUsage(): Promise<HeapUsage> {
    return this.page.evaluate(readHeapUsage);
  }

  public async navigationTiming(): Promise<NavigationTiming> {
    return this.page.evaluate(readNavigationTiming);
  }

  public async resourceEntries(): Promise<ResourceEntry[]> {
    return this.page.evaluate(readResourceEntries);
  }

  public async webVitals(): Promise<WebVitals> {
    return this.page.evaluate(readWebVitals);
  }
}
```

The spec asserts Google's "good" thresholds one step each. The second test feeds the [CI reporter](#ci-performance-monitoring); the Chromium-only `GIVEN` skips other browsers with a reason because `performance.memory` does not exist there.

```ts
// e2e/performance/performance.spec.ts
import { HEAP_CEILING_BYTES, LOAD_TIME_BASELINE_MS, REGRESSION_TOLERANCE } from './common/performance.const';
import type { HeapUsage, NavigationTiming, WebVitals } from './common/performance.type';
import { expect, test } from './performance.fixture';
import { annotateLoadTime } from './test/utils/performance-annotation.spec.util';

test.describe('FEATURE: performance', () => {
  test.describe('GIVEN the home page has loaded', () => {
    test.beforeEach(async ({ performancePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => performancePage.goto('/'));
    });

    test('core web vitals stay inside the good thresholds', async ({ performancePage }): Promise<void> => {
      const vitals = await test.step('WHEN core web vitals are read', (): Promise<WebVitals> => performancePage.webVitals());

      await test.step('THEN LCP is under 2.5 seconds', (): void => expect(vitals.lcp).toBeLessThan(2500));

      await test.step('AND CLS is under 0.1', (): void => expect(vitals.cls).toBeLessThan(0.1));
    });

    test('load time stays within 10% of the baseline', async ({ performancePage }): Promise<void> => {
      const timing = await test.step('WHEN navigation timing is read', (): Promise<NavigationTiming> => performancePage.navigationTiming());

      await test.step('AND the load time is recorded for the reporter', (): void => annotateLoadTime(timing.loadComplete));

      await test.step('THEN the load time is under the regression ceiling', (): void => expect(timing.loadComplete).toBeLessThan(LOAD_TIME_BASELINE_MS * REGRESSION_TOLERANCE));
    });
  });

  test.describe('GIVEN the dashboard has loaded in Chromium', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'performance.memory is Chromium-only');

    test.beforeEach(async ({ performancePage }): Promise<void> => {
      await test.step('GIVEN the dashboard is open', (): Promise<void> => performancePage.goto('/dashboard'));
    });

    test('heap usage stays under 100 MB', async ({ performancePage }): Promise<void> => {
      const usage = await test.step('WHEN heap usage is read', (): Promise<HeapUsage> => performancePage.heapUsage());

      await test.step('THEN the used heap is under 100 MB', (): void => expect(usage.usedJSHeapSize).toBeLessThan(HEAP_CEILING_BYTES));
    });
  });
});
```

### Using web-vitals Library

The `web-vitals` IIFE build exposes `window.webVitals` with `onCLS`, `onFCP`, `onINP`, `onLCP`, `onTTFB` (v3 also ships `onFID`; v4 removed it). It is injected with `page.addScriptTag` after navigation, so the browser-side subscriber reads the API off `window` through `Reflect.get` and a type predicate rather than a global augmentation. Reports flow back to Node through `page.exposeFunction`; `reportAllChanges: true` makes each metric report as soon as it changes instead of on page hide.

```ts
// e2e/performance/test/utils/web-vitals-library.spec.util.ts
import type { MetricReport } from '../../common/performance.type';

type MetricHandler = (metric: MetricReport) => void;

type ReportOptions = { readonly reportAllChanges: boolean };

type MetricSubscriber = (handler: MetricHandler, options: ReportOptions) => void;

type WebVitalsApi = {
  readonly onCLS: MetricSubscriber;
  readonly onFCP: MetricSubscriber;
  readonly onINP: MetricSubscriber;
  readonly onLCP: MetricSubscriber;
  readonly onTTFB: MetricSubscriber;
};

export const subscribeWebVitals = (): void => {
  const api: unknown = Reflect.get(window, 'webVitals');
  const record: unknown = Reflect.get(window, 'recordVital');
  const isApi = (value: unknown): value is WebVitalsApi => typeof value === 'object' && value !== null && 'onLCP' in value;
  const isHandler = (value: unknown): value is MetricHandler => typeof value === 'function';
  const options: ReportOptions = { reportAllChanges: true };

  if (!isApi(api)) throw new Error('web-vitals is not loaded');
  if (!isHandler(record)) throw new Error('recordVital is not exposed');

  api.onCLS(record, options);
  api.onFCP(record, options);
  api.onINP(record, options);
  api.onLCP(record, options);
  api.onTTFB(record, options);
};
```

The page object collects reports into a map and asserts with `expect.poll`, which retries until the metric has arrived and clears the ceiling. That replaces the fixed `waitForTimeout` an upstream sample would use.

```ts
// e2e/performance/pages/web-vitals.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { WEB_VITALS_URL } from '../common/performance.const';
import type { MetricReport } from '../common/performance.type';
import { subscribeWebVitals } from '../test/utils/web-vitals-library.spec.util';

export class WebVitalsPage {
  public readonly firstButton: Locator;

  private readonly page: Page;
  private readonly reports = new Map<string, number>();

  public constructor(page: Page) {
    this.page = page;
    this.firstButton = page.getByRole('button').first();
  }

  public async goto(path: string): Promise<void> {
    const record = (metric: MetricReport): void => {
      this.reports.set(metric.name, metric.value);
    };

    await this.page.exposeFunction('recordVital', record);
    await this.page.goto(path);
    await this.page.addScriptTag({ url: WEB_VITALS_URL });
    await this.page.evaluate(subscribeWebVitals);
  }

  public async clickFirstButton(): Promise<void> {
    await this.firstButton.click();
  }

  public async expectVital(name: string, ceiling: number): Promise<void> {
    const read = (): number | undefined => this.reports.get(name);

    await test.step(`${name} is under ${ceiling}`, (): Promise<void> => expect.poll(read).toBeLessThan(ceiling), { box: true });
  }
}
```

```ts
// e2e/performance/web-vitals.spec.ts
import { test } from './performance.fixture';

test.describe('FEATURE: web vitals library', () => {
  test.describe('GIVEN the home page has loaded with web-vitals injected', () => {
    test.beforeEach(async ({ webVitalsPage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => webVitalsPage.goto('/'));
    });

    test('clicking the first button keeps LCP and INP inside the good thresholds', async ({ webVitalsPage }): Promise<void> => {
      await test.step('WHEN the first button is clicked', (): Promise<void> => webVitalsPage.clickFirstButton());

      await test.step('THEN LCP is under 2.5 seconds', (): Promise<void> => webVitalsPage.expectVital('LCP', 2500));

      await test.step('AND INP is under 200 milliseconds', (): Promise<void> => webVitalsPage.expectVital('INP', 200));
    });
  });
});
```

## Performance Metrics

### Navigation Timing

`performance.getEntriesByType('navigation')` returns `PerformanceEntry[]`; an `instanceof` guard narrows the first entry to `PerformanceNavigationTiming` without a cast. Each field is a difference of two timestamps.

```ts
// e2e/performance/test/utils/navigation-timing.spec.util.ts
import type { NavigationTiming } from '../../common/performance.type';

export const readNavigationTiming = (): NavigationTiming => {
  const [entry] = performance.getEntriesByType('navigation');

  if (!(entry instanceof PerformanceNavigationTiming)) throw new Error('navigation entry is missing');

  const navigationTiming = {
    connection: entry.connectEnd - entry.connectStart,
    dns: entry.domainLookupEnd - entry.domainLookupStart,
    domContentLoaded: entry.domContentLoadedEventEnd - entry.startTime,
    domProcessing: entry.domComplete - entry.domInteractive,
    download: entry.responseEnd - entry.responseStart,
    loadComplete: entry.loadEventEnd - entry.startTime,
    ttfb: entry.responseStart - entry.requestStart
  };

  return navigationTiming;
};
```

A timing test has the shape of the `load time` test above: one `WHEN` step returning `NavigationTiming`, then one `THEN` / `AND` step per limit, the good limits being `ttfb < 600`, `domContentLoaded < 2000`, and `loadComplete < 4000`.

### Resource Timing

Resource entries carry `initiatorType` (`script`, `img`, `css`, `fetch`), `duration`, and `transferSize`. The reader maps them to a plain `ResourceEntry[]`; the budget page under [Performance Budgets](#performance-budgets) sums them, and a spec may filter for whatever else it cares about, such as `duration > 1000` for slow resources or `size > 500000` for large ones. Slow resources are better attached to the report with `test.info().attach` than logged to the console.

```ts
// e2e/performance/test/utils/resource-timing.spec.util.ts
import type { ResourceEntry } from '../../common/performance.type';

export const readResourceEntries = (): ResourceEntry[] => {
  const isResource = (entry: PerformanceEntry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming;
  const toResourceEntry = (entry: PerformanceResourceTiming): ResourceEntry => {
    const resourceEntry: ResourceEntry = {
      duration: entry.duration,
      name: entry.name.split('/').pop() ?? entry.name,
      size: entry.transferSize,
      type: entry.initiatorType
    };

    return resourceEntry;
  };

  return performance.getEntriesByType('resource').filter(isResource).map(toResourceEntry);
};
```

### Memory Usage

`performance.memory` is Chromium-only and untyped, so the reader takes it off `performance` as `unknown` and narrows with a predicate.

```ts
// e2e/performance/test/utils/heap-usage.spec.util.ts
import type { HeapUsage } from '../../common/performance.type';

export const readHeapUsage = (): HeapUsage => {
  const memory: unknown = Reflect.get(performance, 'memory');
  const isHeapUsage = (value: unknown): value is HeapUsage => typeof value === 'object' && value !== null && 'usedJSHeapSize' in value;

  if (!isHeapUsage(memory)) throw new Error('performance.memory is not available');

  const heapUsage = { totalJSHeapSize: memory.totalJSHeapSize, usedJSHeapSize: memory.usedJSHeapSize };

  return heapUsage;
};
```

## Performance Budgets

### Define Budgets

Budgets are typed constants, one per page. Every field is required so the assertion method needs no branches; give a page a generous value rather than omitting the key. The remaining constants serve the heap, regression, and web-vitals samples.

```ts
// e2e/performance/common/performance.const.ts
import type { PerformanceBudget } from './performance.type';

export const HEAP_CEILING_BYTES = 100 * 1024 * 1024;

export const HOMEPAGE_BUDGET: PerformanceBudget = { cls: 0.1, fcp: 1800, imageCount: 20, jsSize: 500_000, lcp: 2500, totalSize: 1_500_000, ttfb: 600 };

export const LOAD_TIME_BASELINE_MS = 2000;

export const REGRESSION_TOLERANCE = 1.1;

export const WEB_VITALS_URL = 'https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js';
```

Resource totals are derived in Node from the `ResourceEntry[]` the page already returns, so the browser-side reader stays generic:

```ts
// e2e/performance/test/utils/resource-summary.spec.util.ts
import type { ResourceEntry, ResourceSummary } from '../../common/performance.type';

const addSize = (total: number, resource: ResourceEntry): number => total + resource.size;
const isImage = (resource: ResourceEntry): boolean => resource.type === 'img';
const isScript = (resource: ResourceEntry): boolean => resource.type === 'script';

export const summarizeResources = (resources: ResourceEntry[]): ResourceSummary => {
  const resourceSummary: ResourceSummary = {
    imageCount: resources.filter(isImage).length,
    jsSize: resources.filter(isScript).reduce(addSize, 0),
    totalSize: resources.reduce(addSize, 0)
  };

  return resourceSummary;
};
```

Upstream shape is an `assertBudget` function fixture. The house shape is a page object the fixture injects: it composes `PerformancePage`, reads every metric once, and asserts each budget line in its own boxed step so a failure points at the spec line. The spec is then one `GIVEN` step and one `THEN` step.

```ts
// e2e/performance/pages/budget.page.ts
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { PerformanceBudget } from '../common/performance.type';
import { summarizeResources } from '../test/utils/resource-summary.spec.util';
import { PerformancePage } from './performance.page';

export class BudgetPage {
  public readonly performancePage: PerformancePage;

  public constructor(page: Page) {
    this.performancePage = new PerformancePage(page);
  }

  public async goto(path: string): Promise<void> {
    await this.performancePage.goto(path);
  }

  public async expectWithinBudget(budget: PerformanceBudget): Promise<void> {
    const vitals = await this.performancePage.webVitals();
    const timing = await this.performancePage.navigationTiming();
    const summary = summarizeResources(await this.performancePage.resourceEntries());

    await test.step('LCP is inside the budget', (): void => expect(vitals.lcp).toBeLessThan(budget.lcp), { box: true });

    await test.step('CLS is inside the budget', (): void => expect(vitals.cls).toBeLessThan(budget.cls), { box: true });

    await test.step('FCP is inside the budget', (): void => expect(vitals.fcp).toBeLessThan(budget.fcp), { box: true });

    await test.step('TTFB is inside the budget', (): void => expect(timing.ttfb).toBeLessThan(budget.ttfb), { box: true });

    await test.step('total transfer size is inside the budget', (): void => expect(summary.totalSize).toBeLessThan(budget.totalSize), { box: true });

    await test.step('script transfer size is inside the budget', (): void => expect(summary.jsSize).toBeLessThan(budget.jsSize), { box: true });

    await test.step('image count is inside the budget', (): void => expect(summary.imageCount).toBeLessThanOrEqual(budget.imageCount), { box: true });
  }
}
```

```ts
// e2e/performance/budget.spec.ts
import { HOMEPAGE_BUDGET } from './common/performance.const';
import { test } from './performance.fixture';

test.describe('FEATURE: performance budget', () => {
  test.describe('GIVEN the home page has loaded', () => {
    test.beforeEach(async ({ budgetPage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => budgetPage.goto('/'));
    });

    test('the home page stays inside its budget', async ({ budgetPage }): Promise<void> => {
      await test.step('THEN the metrics stay inside the home page budget', (): Promise<void> => budgetPage.expectWithinBudget(HOMEPAGE_BUDGET));
    });
  });
});
```

## Lighthouse Integration

### Using playwright-lighthouse

`npm install -D playwright-lighthouse lighthouse`. The plain `playAudit` call is in [performance.md](../infrastructure-ci-cd/performance.md#lighthouse-integration). This feature folder adds a typed `Config` that narrows the audit to one category and pins throttling (`rttMs`, `throughputKbps`, `cpuSlowdownMultiplier`) so scores are comparable run to run, and attaches the raw `lhr` JSON to the test report. `playAudit` connects to Chromium over the DevTools port, so the project that runs it must launch with `launchOptions: { args: ['--remote-debugging-port=9222'] }`; it throws when a category scores under its threshold. `lighthouse.fixture.ts` has the shape of `performance.fixture.ts` below with a single `lighthousePage` member.

```ts
// e2e/lighthouse/common/lighthouse.type.ts
export type LighthouseSummary = { readonly accessibility: number; readonly performance: number };

export type LighthouseThresholds = { readonly accessibility?: number; readonly 'best-practices'?: number; readonly performance?: number; readonly seo?: number };
```

```ts
// e2e/lighthouse/common/lighthouse.const.ts
import type { Config } from 'lighthouse';

import type { LighthouseThresholds } from './lighthouse.type';

const throttling = { cpuSlowdownMultiplier: 1, rttMs: 40, throughputKbps: 10240 };
const settings = { onlyCategories: ['performance'], throttling };

export const DEBUG_PORT = 9222;

export const DEFAULT_THRESHOLDS: LighthouseThresholds = { accessibility: 90, 'best-practices': 80, performance: 80, seo: 80 };

export const PERFORMANCE_ONLY_CONFIG: Config = { extends: 'lighthouse:default', settings };

export const PERFORMANCE_ONLY_THRESHOLDS: LighthouseThresholds = { performance: 70 };
```

```ts
// e2e/lighthouse/pages/lighthouse.page.ts
import type { Page } from '@playwright/test';
import { test } from '@playwright/test';
import type { Config } from 'lighthouse';
import { playAudit } from 'playwright-lighthouse';

import { DEBUG_PORT } from '../common/lighthouse.const';
import type { LighthouseSummary, LighthouseThresholds } from '../common/lighthouse.type';

export class LighthousePage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  public async audit(thresholds: LighthouseThresholds, config?: Config): Promise<LighthouseSummary> {
    const audit = await playAudit({ config, page: this.page, port: DEBUG_PORT, thresholds });
    const attachment = { body: JSON.stringify(audit.lhr), contentType: 'application/json' };
    const summary: LighthouseSummary = {
      accessibility: (audit.lhr.categories.accessibility.score ?? 0) * 100,
      performance: (audit.lhr.categories.performance.score ?? 0) * 100
    };

    await test.info().attach('lighthouse', attachment);

    return summary;
  }
}
```

The default audit runs every category with `audit(DEFAULT_THRESHOLDS)` and asserts `summary.performance >= 80` and `summary.accessibility >= 90` the same way; the throttled spec passes the config as the second argument.

```ts
// e2e/lighthouse/lighthouse.spec.ts
import { PERFORMANCE_ONLY_CONFIG, PERFORMANCE_ONLY_THRESHOLDS } from './common/lighthouse.const';
import type { LighthouseSummary } from './common/lighthouse.type';
import { expect, test } from './lighthouse.fixture';

test.describe('FEATURE: lighthouse audit', () => {
  test.describe('GIVEN the home page has loaded', () => {
    test.beforeEach(async ({ lighthousePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => lighthousePage.goto('/'));
    });

    test('the performance-only audit clears 70', async ({ lighthousePage }): Promise<void> => {
      const summary = await test.step('WHEN the throttled performance audit runs', (): Promise<LighthouseSummary> => lighthousePage.audit(PERFORMANCE_ONLY_THRESHOLDS, PERFORMANCE_ONLY_CONFIG));

      await test.step('THEN performance scores at least 70', (): void => expect(summary.performance).toBeGreaterThanOrEqual(70));
    });
  });
});
```

## Performance Fixtures

One `test.extend` per feature. Specs import `test` and `expect` from here, never from `@playwright/test`.

```ts
// e2e/performance/performance.fixture.ts
import { test as base } from '@playwright/test';

import { BudgetPage } from './pages/budget.page';
import { PerformancePage } from './pages/performance.page';
import { WebVitalsPage } from './pages/web-vitals.page';

type PerformanceFixtures = {
  readonly budgetPage: BudgetPage;
  readonly performancePage: PerformancePage;
  readonly webVitalsPage: WebVitalsPage;
};

export const test = base.extend<PerformanceFixtures>({
  budgetPage: async ({ page }, use): Promise<void> => {
    await use(new BudgetPage(page));
  },
  performancePage: async ({ page }, use): Promise<void> => {
    await use(new PerformancePage(page));
  },
  webVitalsPage: async ({ page }, use): Promise<void> => {
    await use(new WebVitalsPage(page));
  }
});

export { expect } from '@playwright/test';
```

## CI Performance Monitoring

### Track Performance Over Time and Detect Regressions

A custom reporter collects a `performance` annotation from each test in `onTestEnd` and posts the batch to a metrics service in `onEnd`. Its options type, constructor, and non-blocking `onEnd` are `NotificationReporter` in [reporting.md](../infrastructure-ci-cd/reporting.md); the perf variant reads `test.annotations.find((annotation) => annotation.type === 'performance')`, pushes `{ loadTime: Number(annotation.description), test: test.title, timestamp }`, and posts `{ branch, commit, metrics }`. Environment reads happen once, in the config, and reach the reporter as plain options: `reporter: [['list'], ['./reporters/perf.reporter.ts', { branch: process.env.GITHUB_REF, commit: process.env.GITHUB_SHA, endpoint: process.env.METRICS_ENDPOINT }]]`.

The spec records the annotation through a util so the reporter has something to collect:

```ts
// e2e/performance/test/utils/performance-annotation.spec.util.ts
import { test } from '@playwright/test';

export const annotateLoadTime = (loadTime: number): void => {
  const annotation = { description: String(loadTime), type: 'performance' };

  test.info().annotations.push(annotation);
};
```

The `load time` test in `performance.spec.ts` above records the annotation and detects regressions against `LOAD_TIME_BASELINE_MS * REGRESSION_TOLERANCE`. Reading the baseline from a file or an API is the same shape with the const replaced by a fixture value.

## Anti-Patterns to Avoid

| Anti-Pattern                | Problem                   | Solution                         |
| --------------------------- | ------------------------- | -------------------------------- |
| Testing only once           | Results vary              | Run multiple times, use averages |
| Ignoring network conditions | Unrealistic results       | Test with throttling             |
| No baseline comparison      | Can't detect regressions  | Track metrics over time          |
| Testing in dev mode         | Slow, not production-like | Test production builds           |
| `waitForTimeout` before reading a metric | Hides the race, slows the suite | `expect.poll` or a buffered `PerformanceObserver` |

## Related References

- **Performance Optimization**: See [performance.md](../infrastructure-ci-cd/performance.md) for test execution performance
- **CI/CD**: See [ci-cd.md](../infrastructure-ci-cd/ci-cd.md) for CI integration
