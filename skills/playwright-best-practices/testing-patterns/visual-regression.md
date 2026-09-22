# Visual Regression Testing

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Patterns](#patterns)
3. [Decision Guide](#decision-guide)
4. [Anti-Patterns](#anti-patterns)
5. [Troubleshooting](#troubleshooting)

> **When to use**: Detecting unintended visual changes—layout shifts, style regressions, broken responsive designs—that functional assertions miss.

Every sample lives under `e2e/visual/`. A screenshot assertion is one step in the spec: `expect(page)` for the viewport or full page, `expect(<pageObject>.<locator>)` for an element. Locators to capture or mask are page-object fields; the spec never calls `page.getBy*`.

## Quick Reference

| Call | Captures |
|---|---|
| `expect(catalogPage.productCard).toHaveScreenshot()` | One element, snapshot named after the test |
| `expect(page).toHaveScreenshot('landing-hero.png')` | The viewport, named snapshot |
| `expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.01 })` | Viewport with a threshold for minor pixel variance |
| `expect(page).toHaveScreenshot({ mask: [analyticsPage.clock, analyticsPage.userPhoto] })` | Viewport with volatile elements boxed out |
| `expect(page).toHaveScreenshot({ animations: 'disabled' })` | Viewport with CSS animations frozen |

```bash
npx playwright test --update-snapshots
```

## Patterns

### Masking Volatile Content

**Use when**: Page contains timestamps, avatars, ad slots, relative dates, random images, or A/B variants.

The `mask` option overlays a solid box over specified locators before capturing. The page object owns the volatile locators and a `freezeTimestamps` method for the alternative below.

```ts
// e2e/visual/pages/analytics.page.ts
import type { Locator, Page } from '@playwright/test';

export class AnalyticsPage {
  public readonly activeUsers: Locator;
  public readonly lastUpdated: Locator;
  public readonly profileAvatar: Locator;
  public readonly promoBanner: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.activeUsers = page.getByTestId('active-users');
    this.lastUpdated = page.getByTestId('last-updated');
    this.profileAvatar = page.getByTestId('profile-avatar');
    this.promoBanner = page.locator('.promo-banner');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/analytics');
  }

  public async freezeTimestamps(): Promise<void> {
    await this.page.evaluate((): void => {
      for (const element of document.querySelectorAll('[data-testid="time-display"]')) {
        element.textContent = 'Jan 1, 2025 12:00 PM';
      }
    });
  }
}
```

The mask list is a named const above the step because it is a nested array inside the options object.

```ts
// e2e/visual/analytics.visual.spec.ts
import { expect, test } from './visual.fixture';

test.describe('FEATURE: analytics panel snapshot', () => {
  test('SCENARIO: masking volatile elements matches the panel snapshot', async ({ analyticsPage, page }): Promise<void> => {
    const mask = [analyticsPage.lastUpdated, analyticsPage.profileAvatar, analyticsPage.activeUsers, analyticsPage.promoBanner];

    await test.step('WHEN the analytics page opens', (): Promise<void> => analyticsPage.goto());

    await test.step('THEN the page matches analytics.png with masks', (): Promise<void> => expect(page).toHaveScreenshot('analytics.png', { mask, maskColor: '#FF00FF' }));
  });
});
```

| Page | Volatile locator | Mask |
|---|---|---|
| `/analytics` | test ids above plus `.promo-banner` | Four locators, magenta `maskColor` |
| `/activity` | `ActivityPage.relativeTimes = page.locator('time[datetime]')` | `{ mask: [activityPage.relativeTimes] }` |

**Alternative: freeze content with JavaScript** when masking affects layout. `freezeTimestamps` rewrites every `[data-testid="time-display"]` to a fixed string before the capture.

```ts
// e2e/visual/analytics-frozen.visual.spec.ts
import { expect, test } from './visual.fixture';

test.describe('FEATURE: analytics panel snapshot with frozen timestamps', () => {
  test('SCENARIO: frozen timestamps match the panel snapshot', async ({ analyticsPage, page }): Promise<void> => {
    await test.step('GIVEN the analytics page is open', (): Promise<void> => analyticsPage.goto());

    await test.step('WHEN the timestamps are frozen', (): Promise<void> => analyticsPage.freezeTimestamps());

    await test.step('THEN the page matches analytics-frozen.png', (): Promise<void> => expect(page).toHaveScreenshot('analytics-frozen.png'));
  });
});
```

### Disabling Animations

**Use when**: Always. CSS animations and transitions are the primary cause of flaky visual diffs.

```ts
// e2e/visual/home.visual.spec.ts
import { expect, test } from './visual.fixture';

test.describe('FEATURE: home page snapshot', () => {
  test('SCENARIO: disabled animations match the home page snapshot', async ({ homePage, page }): Promise<void> => {
    await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

    await test.step('THEN the page matches home.png', (): Promise<void> => expect(page).toHaveScreenshot('home.png', { animations: 'disabled' }));
  });
});
```

**Set globally** in config. The nested `expect.toHaveScreenshot` object is two named consts.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const toHaveScreenshot = { animations: 'disabled' } as const;

const expectOptions = { toHaveScreenshot };

export default defineConfig({ expect: expectOptions });
```

When `animations: 'disabled'` is set, Playwright injects CSS forcing animation/transition duration to 0s, waits for running animations to finish, then captures.

For JavaScript-driven animations (GSAP, Framer Motion), the page object asserts the settled state before the spec captures. `expectSettled` waits for the banner to be visible and for the `animating` class to drop.

```ts
// e2e/visual/pages/hero.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class HeroPage {
  public readonly heroBanner: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.heroBanner = page.getByTestId('hero-banner');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/animated-hero');
  }

  public async expectSettled(): Promise<void> {
    await test.step('hero banner is visible and no longer animating', async (): Promise<void> => {
      await expect(this.heroBanner).toBeVisible();
      await expect(this.heroBanner).not.toHaveClass(/animating/);
    }, { box: true });
  }
}
```

```ts
// e2e/visual/hero.visual.spec.ts
import { expect, test } from './visual.fixture';

test.describe('FEATURE: animated hero snapshot', () => {
  test('SCENARIO: settled JS animation matches the hero snapshot', async ({ heroPage, page }): Promise<void> => {
    await test.step('WHEN the animated hero opens', (): Promise<void> => heroPage.goto());

    await test.step('THEN the hero banner has settled', (): Promise<void> => heroPage.expectSettled());

    await test.step('AND the page matches hero.png', (): Promise<void> => expect(page).toHaveScreenshot('hero.png', { animations: 'disabled' }));
  });
});
```

### Configuring Thresholds

**Use when**: Minor rendering differences from anti-aliasing, font hinting, or sub-pixel rendering cause false failures.

| Option | Controls | Typical Value |
|---|---|---|
| `maxDiffPixels` | Absolute pixel count that can differ | `100` for pages, `10` for components |
| `maxDiffPixelRatio` | Fraction of total pixels (0-1) | `0.01` (1%) for pages |
| `threshold` | Per-pixel color tolerance (0-1) | `0.2` for most UIs, `0.1` for design systems |

The options object is a named const so the step stays one call. The brand logo is the zero-tolerance case; the others differ only in the const.

```ts
// e2e/visual/brand-logo.visual.spec.ts
import { expect, test } from './visual.fixture';

const PIXEL_PERFECT = { maxDiffPixels: 0, threshold: 0 };

test.describe('FEATURE: brand logo snapshot', () => {
  test('SCENARIO: the brand logo matches pixel for pixel', async ({ brandPage }): Promise<void> => {
    await test.step('WHEN the brand page opens', (): Promise<void> => brandPage.goto());

    await test.step('THEN the logo matches brand-logo.png exactly', (): Promise<void> => expect(brandPage.logo).toHaveScreenshot('brand-logo.png', PIXEL_PERFECT));
  });
});
```

| Subject | Locator | Options const |
|---|---|---|
| Control panel page | `page` | `{ maxDiffPixelRatio: 0.01 }` |
| Brand logo | `brandPage.logo` | `{ maxDiffPixels: 0, threshold: 0 }` |
| Sales graph | `reportsPage.salesGraph` | `{ maxDiffPixels: 200, threshold: 0.3 }` |

**Global thresholds** in config:

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const toHaveScreenshot = { animations: 'disabled', maxDiffPixelRatio: 0.01, threshold: 0.2 } as const;

const expectOptions = { toHaveScreenshot };

export default defineConfig({ expect: expectOptions });
```

### CI Configuration

**Use when**: Running visual tests in CI. Consistent rendering is critical—the same test must produce identical screenshots every time.

**The problem**: Font rendering and anti-aliasing differ across operating systems. macOS snapshots won't match Linux.

**The solution**: Run visual tests in Docker using the official Playwright container. Generate and update snapshots from the same container.

**GitHub Actions with Docker**

```yaml
# .github/workflows/visual-tests.yml
name: Visual Regression Tests
on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.48.0-noble
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm

      - run: npm ci

      - name: Run visual tests
        run: npx playwright test --project=visual
        env:
          HOME: /root

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-test-report
          path: playwright-report/
          retention-days: 14
```

**Updating snapshots locally using Docker**:

```bash
docker run --rm -v $(pwd):/work -w /work \
  mcr.microsoft.com/playwright:v1.48.0-noble \
  npx playwright test --update-snapshots --project=visual
```

**Add script to `package.json`**:

```json
{
  "scripts": {
    "test:visual": "npx playwright test --project=visual",
    "test:visual:update": "docker run --rm -v $(pwd):/work -w /work mcr.microsoft.com/playwright:v1.48.0-noble npx playwright test --update-snapshots --project=visual"
  }
}
```

**Platform-agnostic snapshots** (requires Docker for generation). The template drops the platform suffix so one Linux baseline serves every developer.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const snapshotPathTemplate = '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}';

const chrome = devices['Desktop Chrome'];

const projects = [{ name: 'visual', testMatch: '**/*.visual.spec.ts', use: chrome }];

export default defineConfig({ projects, snapshotPathTemplate });
```

### Full Page vs Element Screenshots

**Use when**: Deciding scope. Full page catches layout shifts. Element screenshots isolate components and are more stable.

`expect(page)` without options captures the visible viewport; `fullPage: true` captures the entire scrollable page. `CatalogPage` exposes `table` (`getByRole('table')`) and `featuredItem` (`getByTestId('featured-item')`).

```ts
// e2e/visual/scope.visual.spec.ts
import { expect, test } from './visual.fixture';

test.describe('FEATURE: snapshot scope', () => {
  test('SCENARIO: the home page matches its viewport and full-page snapshots', async ({ homePage, page }): Promise<void> => {
    await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

    await test.step('THEN the viewport matches home-viewport.png', (): Promise<void> => expect(page).toHaveScreenshot('home-viewport.png'));

    await test.step('AND the full page matches home-full.png', (): Promise<void> => expect(page).toHaveScreenshot('home-full.png', { fullPage: true }));
  });

  test('SCENARIO: each catalog component matches its element snapshot', async ({ catalogPage }): Promise<void> => {
    await test.step('WHEN the catalog opens', (): Promise<void> => catalogPage.goto());

    await test.step('THEN the table matches catalog-table.png', (): Promise<void> => expect(catalogPage.table).toHaveScreenshot('catalog-table.png'));

    await test.step('AND the featured item matches featured-item.png', (): Promise<void> => expect(catalogPage.featuredItem).toHaveScreenshot('featured-item.png'));
  });
});
```

**Rule of thumb**: Element screenshots for independently changing components. Full page screenshots for key layouts where spacing matters.

### Responsive Visual Testing

**Use when**: Application has responsive breakpoints requiring verification at different viewport sizes.

Each breakpoint is a `GIVEN` with `test.use({ viewport })`, which sizes the context before the page opens. `page.setViewportSize` does the same mid-test when one test must walk several sizes.

```ts
// e2e/visual/common/visual.type.ts
export type Breakpoint = {
  readonly height: number;
  readonly name: string;
  readonly width: number;
};
```

```ts
// e2e/visual/landing-breakpoints.visual.spec.ts
import type { Breakpoint } from './common/visual.type';
import { expect, test } from './visual.fixture';

const BREAKPOINTS: Breakpoint[] = [
  { height: 812, name: 'phone', width: 375 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 900, name: 'desktop', width: 1440 }
];

test.describe('FEATURE: landing page breakpoints', () => {
  for (const breakpoint of BREAKPOINTS) {
    test.describe('GIVEN a viewport size', () => {
      test.use({ viewport: breakpoint });

      test(`SCENARIO: the landing page at ${breakpoint.name} (${breakpoint.width}x${breakpoint.height}) matches landing-${breakpoint.name}.png`, async ({ landingPage, page }): Promise<void> => {
        await test.step('WHEN the landing page opens', (): Promise<void> => landingPage.goto());

        await test.step(`THEN the full page matches landing-${breakpoint.name}.png`, (): Promise<void> => expect(page).toHaveScreenshot(`landing-${breakpoint.name}.png`, { animations: 'disabled', fullPage: true }));
      });
    });
  }
});
```

**Alternative: use projects for responsive testing**. Each project's `use` is a named const.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const desktopViewport = { height: 900, width: 1440 };

const desktop = { ...devices['Desktop Chrome'], viewport: desktopViewport };

const tablet = devices['iPad (gen 7)'];

const mobile = devices['iPhone 14'];

const projects = [
  { name: 'desktop', testMatch: '**/*.visual.spec.ts', use: desktop },
  { name: 'tablet', testMatch: '**/*.visual.spec.ts', use: tablet },
  { name: 'mobile', testMatch: '**/*.visual.spec.ts', use: mobile }
];

export default defineConfig({ projects });
```

### Component Visual Testing

**Use when**: Testing individual UI components in isolation—buttons, cards, forms, modals. Faster and more stable than full-page screenshots.

A Storybook iframe is a page like any other. `StoryPage.goto` takes the story id; `button` is the only locator the button stories need.

```ts
// e2e/visual/pages/story.page.ts
import type { Locator, Page } from '@playwright/test';

export class StoryPage {
  public readonly button: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.button = page.getByRole('button');
  }

  public async goto(storyId: string): Promise<void> {
    await this.page.goto(`/storybook/iframe.html?id=${storyId}`);
  }

  public async hoverButton(): Promise<void> {
    await this.button.hover();
  }
}
```

```ts
// e2e/visual/button.visual.spec.ts
import { expect, test } from './visual.fixture';

const STILL = { animations: 'disabled' } as const;

const SIZES = ['small', 'medium', 'large'];

test.describe('FEATURE: button visual states', () => {
  test.describe('GIVEN the primary button story', () => {
    test.beforeEach(async ({ storyPage }): Promise<void> => {
      await test.step('GIVEN the primary button story is open', (): Promise<void> => storyPage.goto('button--primary'));
    });

    test('SCENARIO: the rendered button matches btn-primary.png', async ({ storyPage }): Promise<void> => {
      await test.step('WHEN the button has rendered', (): Promise<void> => expect(storyPage.button).toBeVisible());

      await test.step('THEN the button matches btn-primary.png', (): Promise<void> => expect(storyPage.button).toHaveScreenshot('btn-primary.png', STILL));
    });

    test('SCENARIO: the hovered button matches btn-primary-hover.png', async ({ storyPage }): Promise<void> => {
      await test.step('WHEN the button is hovered', (): Promise<void> => storyPage.hoverButton());

      await test.step('THEN the button matches btn-primary-hover.png', (): Promise<void> => expect(storyPage.button).toHaveScreenshot('btn-primary-hover.png', STILL));
    });
  });

  for (const size of SIZES) {
    test(`SCENARIO: the ${size} button matches btn-${size}.png`, async ({ storyPage }): Promise<void> => {
      await test.step(`WHEN the ${size} button story opens`, (): Promise<void> => storyPage.goto(`button--${size}`));

      await test.step(`THEN the button matches btn-${size}.png`, (): Promise<void> => expect(storyPage.button).toHaveScreenshot(`btn-${size}.png`, STILL));
    });
  }
});
```

**Using a dedicated test harness** instead of Storybook is the same spec against `CardHarnessPage`: `goto()` opens `/test-harness/card`, `goto('long')` opens `/test-harness/card?content=long`, and `card` is `getByTestId('card')`. The default state and the truncated long-content state are two tests with `card-default.png` and `card-long.png`.

### Updating Snapshots

**Use when**: Intentionally changed UI—design refresh, rebrand, new feature. Never update when diff is unexpected.

```bash
# Update all snapshots
npx playwright test --update-snapshots

# Update for specific file
npx playwright test tests/landing.spec.ts --update-snapshots

# Update for specific project
npx playwright test --project=chromium --update-snapshots
```

**Workflow for reviewing changes:**

1. Run tests and view failures in HTML report:
   ```bash
   npx playwright test
   npx playwright show-report
   ```
   The report shows expected, actual, and diff images side-by-side.

2. If changes are intentional, update:
   ```bash
   npx playwright test --update-snapshots
   ```

3. Review updated snapshots before committing:
   ```bash
   git diff --name-only
   ```

**Tag visual tests for selective updates.** The tag is the second argument of `test`, never part of the title; `--grep @visual` still matches it.

```ts
// e2e/visual/landing.visual.spec.ts
import { expect, test } from './visual.fixture';

test.describe('FEATURE: landing page snapshot', () => {
  test('SCENARIO: the landing page matches landing.png', { tag: ['@visual'] }, async ({ landingPage, page }): Promise<void> => {
    await test.step('WHEN the landing page opens', (): Promise<void> => landingPage.goto());

    await test.step('THEN the page matches landing.png', (): Promise<void> => expect(page).toHaveScreenshot('landing.png', { animations: 'disabled' }));
  });
});
```

```bash
npx playwright test --grep @visual --update-snapshots
```

### Cross-Browser Visual Testing

**Use when**: Users span Chrome, Firefox, Safari and you need per-browser rendering verification.

Playwright separates snapshots by project name automatically. Each browser gets its own baseline—browsers render fonts and shadows differently.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const toHaveScreenshot = { animations: 'disabled', maxDiffPixelRatio: 0.01 } as const;

const expectOptions = { toHaveScreenshot };

const chromium = devices['Desktop Chrome'];

const firefox = devices['Desktop Firefox'];

const webkit = devices['Desktop Safari'];

const projects = [
  { name: 'chromium', use: chromium },
  { name: 'firefox', use: firefox },
  { name: 'webkit', use: webkit }
];

export default defineConfig({ expect: expectOptions, projects });
```

**Strategy**: Run visual tests in a single browser (Chromium on Linux in CI) to minimize snapshot count. Add other browsers only when you have actual cross-browser rendering bugs. The `visual` project matches `*.visual.spec.ts`; the functional projects ignore it.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const chromium = devices['Desktop Chrome'];

const firefox = devices['Desktop Firefox'];

const projects = [
  { name: 'visual', testMatch: '**/*.visual.spec.ts', use: chromium },
  { name: 'chromium', testIgnore: '**/*.visual.spec.ts', use: chromium },
  { name: 'firefox', testIgnore: '**/*.visual.spec.ts', use: firefox }
];

export default defineConfig({ projects });
```

## Decision Guide

| Scenario | Approach | Rationale |
|---|---|---|
| Key landing/marketing pages | Full page, `fullPage: true` | Catches layout shifts, spacing, overall harmony |
| Individual components | Element screenshot | Isolated, fast, immune to unrelated changes |
| Page with dynamic content | Full page + `mask` | Covers layout while ignoring volatile content |
| Design system library | Element per variant, zero threshold | Pixel-perfect enforcement |
| Responsive verification | Screenshot per viewport | Catches breakpoint bugs |
| Cross-browser consistency | Separate snapshots per browser | Browsers render differently |
| CI pipeline | Docker container, Linux-only snapshots | Consistent rendering |
| Threshold: design system | `threshold: 0`, `maxDiffPixels: 0` | Zero tolerance |
| Threshold: content pages | `maxDiffPixelRatio: 0.01`, `threshold: 0.2` | Minor anti-aliasing variance |
| Threshold: charts/graphs | `maxDiffPixels: 200`, `threshold: 0.3` | Anti-aliasing on curves varies |

## Anti-Patterns

| Don't | Problem | Do Instead |
|---|---|---|
| Visual test every page | Massive maintenance, constant false failures | Pick 5-10 key pages and critical components |
| Skip masking dynamic content | Screenshots differ every run, permanently flaky | Use `mask` for all volatile elements |
| Run across macOS, Linux, Windows | Font rendering differs, snapshots never match | Standardize on Linux via Docker |
| Skip Docker in CI | OS updates shift rendering silently | Pin specific Playwright Docker image |
| Blindly run `--update-snapshots` | Accepts unintentional regressions | Always review diff in HTML report first |
| Skip `animations: 'disabled'` | CSS transitions create random diffs | Set globally in config |
| Replace functional assertions with visual tests | Diffs don't tell you *what* broke | Visual tests complement, never replace |
| Commit snapshots from different platforms | Tests fail for everyone | All team members use same Docker container |
| Set threshold too high (`0.1`) | 10% pixel change passes, defeats purpose | Start with `0.01`, adjust per-test |
| Full page on infinite scroll pages | Page height nondeterministic | Element screenshots on above-the-fold content |

## Troubleshooting

### "Screenshot comparison failed" on first CI run after local development

**Cause**: Snapshots generated on macOS locally. CI runs on Linux. Font rendering differs.

**Fix**: Generate snapshots using Docker:

```bash
docker run --rm -v $(pwd):/work -w /work \
  mcr.microsoft.com/playwright:v1.48.0-noble \
  npx playwright test --update-snapshots --project=visual
```

Commit Linux-generated snapshots.

### "Expected screenshot to match but X pixels differ"

**Cause**: Anti-aliasing, font hinting, sub-pixel rendering differences.

**Fix**: Add tolerance through an options const, `{ maxDiffPixelRatio: 0.01, threshold: 0.2 }`, passed as the second argument of `toHaveScreenshot` as in [Configuring Thresholds](#configuring-thresholds). Check the HTML report diff image to determine if it's regression or noise.

### Visual tests pass locally but fail in CI (even with Docker)

**Cause**: Different Playwright versions locally vs CI.

**Fix**: Ensure `package.json` version matches Docker image tag:

```json
{
  "devDependencies": {
    "@playwright/test": "latest"
  }
}
```

```yaml
container:
  image: mcr.microsoft.com/playwright:v1.48.0-noble
```

### Animations cause random diff failures

**Cause**: CSS animations captured mid-frame.

**Fix**: Set `animations: 'disabled'` globally through the `expectOptions` const in [Disabling Animations](#disabling-animations). For JS animations, assert the settled state in a page-object method before the capture.

### Snapshot file names conflict between tests

**Cause**: Two tests use same screenshot name without unique paths.

**Fix**: Name every snapshot explicitly and uniquely, `auth-home.png` and `public-home.png` rather than `home.png` twice. Or customize the snapshot path template so the test file and project name become part of the path:

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const snapshotPathTemplate = '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}';

export default defineConfig({ snapshotPathTemplate });
```

### Too many snapshot files to maintain

**Cause**: Visual tests for every page, browser, viewport.

**Fix**: Be selective. Visual test only high-risk pages:
- Landing and marketing pages
- Design system components
- Complex layouts (dashboards, data tables)
- Pages after major refactor

Skip pages where functional assertions cover key elements.
