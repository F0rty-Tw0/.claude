# Accessibility Testing

## Table of Contents

1. [Axe-Core Integration](#axe-core-integration)
2. [Keyboard Navigation](#keyboard-navigation)
3. [ARIA Validation](#aria-validation)
4. [Focus Management](#focus-management)
5. [Color & Contrast](#color--contrast)
6. [CI Integration](#ci-integration)

Every sample lives under `e2e/accessibility/`. Specs import `test` and `expect` from `accessibility.fixture.ts`, which registers `makeAxeBuilder` and one page object per page under test.

## Axe-Core Integration

```bash
npm install -D @axe-core/playwright axe-core
```

`axe-core` is installed alongside so `AxeResults`, `Result`, and `NodeResult` can be imported as types.

### Basic A11y Test

The scan is an `AND` step that returns the `AxeResults`; the assertion is its own step.

```ts
// e2e/accessibility/accessibility.e2e.ts
import type { AxeResults } from 'axe-core';

import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: accessibility', () => {
  test('GIVEN the WCAG 2.1 A and AA rules, scanning the home page reports no violations', async ({ homePage, makeAxeBuilder }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

    const results = await test.step('AND the page is scanned with axe', (): Promise<AxeResults> => makeAxeBuilder().analyze());

    await test.step('THEN no violations are reported', (): void => expect(results.violations).toEqual([]));
  });
});
```

`AxeBuilder` narrows the scan when a method is chained before `analyze()`: `makeAxeBuilder().include('#contact-form').analyze()`.

| Builder method | Effect |
|---|---|
| `.include('#contact-form')` | Scan only that subtree. |
| `.exclude('.legacy-widget')` | Skip a known-bad component. |
| `.disableRules(['color-contrast'])` | Turn off one rule for this scan. |
| `.withTags(['wcag2a', 'wcag2aa'])` | Run only rules with these tags. |
| `.withRules(['label'])` | Run only the named rules. |

### A11y Fixture

`makeAxeBuilder` returns a builder preloaded with the WCAG tags the project cares about, so every spec scans the same rule set. `ItemsPage` is described under [Focus Trap in Modal](#focus-trap-in-modal).

```ts
// e2e/accessibility/accessibility.fixture.ts
import AxeBuilder from '@axe-core/playwright';
import { test as base } from '@playwright/test';

import { DashboardPage } from './pages/dashboard.po';
import { HomePage } from './pages/home.po';
import { ItemsPage } from './pages/items.po';
import { SignupPage } from './pages/signup.po';

type AxeBuilderFactory = () => AxeBuilder;

type AccessibilityFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly homePage: HomePage;
  readonly itemsPage: ItemsPage;
  readonly makeAxeBuilder: AxeBuilderFactory;
  readonly signupPage: SignupPage;
};

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export const test = base.extend<AccessibilityFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  homePage: async ({ page }, use): Promise<void> => {
    await use(new HomePage(page));
  },
  itemsPage: async ({ page }, use): Promise<void> => {
    await use(new ItemsPage(page));
  },
  makeAxeBuilder: async ({ page }, use): Promise<void> => {
    await use((): AxeBuilder => new AxeBuilder({ page }).withTags(WCAG_TAGS));
  },
  signupPage: async ({ page }, use): Promise<void> => {
    await use(new SignupPage(page));
  }
});

export { expect } from '@playwright/test';
```

### Detailed Violation Reporting

`toEqual([])` prints the whole `Result` object on failure. A util summarises each violation to id, impact, description, and the offending HTML, and passes that summary as the assertion message.

```ts
// e2e/accessibility/test/utils/axe.spec.util.ts
import { expect } from '@playwright/test';
import type { AxeResults, ImpactValue, NodeResult, Result } from 'axe-core';

type ViolationSummary = {
  readonly description: string;
  readonly id: string;
  readonly impact: ImpactValue | undefined;
  readonly nodes: string[];
};

const summarise = (violation: Result): ViolationSummary => {
  const summary: ViolationSummary = {
    description: violation.description,
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node: NodeResult): string => node.html)
  };

  return summary;
};

export const expectNoViolations = (results: AxeResults): void => {
  const violations = results.violations.map(summarise);
  const report = JSON.stringify(violations, null, 2);

  expect(violations, report).toHaveLength(0);
};
```

The spec calls it as its assertion step: `await test.step('THEN no violations are reported', (): void => expectNoViolations(results));`.

## Keyboard Navigation

### Tab Order Testing

Pressing Tab is the user's action, so `tabThrough(stops)` presses it once per stop and returns what each press focused: the `ariaSnapshot()` of the `:focus` locator, which names the element by role and accessible name (`- textbox "Email"`). The spec's `THEN` compares that list with the expected order, so a failure prints the order a keyboard user actually met.

```ts
// e2e/accessibility/pages/signup.po.ts
import type { Locator, Page } from '@playwright/test';

export class SignupPage {
  public readonly focused: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.focused = page.locator(':focus');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  public async tabThrough(stops: number): Promise<string[]> {
    const visited: string[] = [];

    for (let stop = 0; stop < stops; stop += 1) {
      await this.page.keyboard.press('Tab');

      const snapshot = await this.focused.ariaSnapshot();

      visited.push(snapshot);
    }

    return visited;
  }
}
```

```ts
// e2e/accessibility/signup-keyboard.e2e.ts
import { expect, test } from './accessibility.fixture';

const TAB_ORDER: string[] = ['- textbox "Email"', '- textbox "Password"', '- button "Sign up"'];

test.describe('FEATURE: signup keyboard navigation', () => {
  test('GIVEN focus at the page start, tabbing visits email, password, sign up in order', async ({ signupPage }): Promise<void> => {
    await test.step('WHEN the signup page is opened', (): Promise<void> => signupPage.goto());

    const visited = await test.step('AND tab is pressed once per control', (): Promise<string[]> => signupPage.tabThrough(TAB_ORDER.length));

    await test.step('THEN focus visits email, password, sign up in order', (): void => expect(visited).toEqual(TAB_ORDER));
  });
});
```

### Keyboard-Only Interaction and Skip Links

A keyboard flow is a page-object method per user intent; the key sequence stays inside the method and the spec step names the intent. A shop flow reads `WHEN the shop is opened` → `shopPage.goto()`, `AND the first product is opened with tab and enter` → `shopPage.openFirstProductByKeyboard()` (Tab twice, then Enter), `THEN` `expect(page).toHaveURL(/\/products\/\d+/)`; the next phase acts on the product page that check proved: `WHEN it is added to the cart by keyboard` → `addToCartByKeyboard()`, `THEN` `expect(shopPage.toast).toContainText('Added to cart')`.

`HomePage` also carries the landmark locators used under [Color & Contrast](#color--contrast). `goto()` takes `HomeOptions`, applied with `page.emulateMedia` before it navigates, so a media preference is part of the opening call.

```ts
// e2e/accessibility/common/accessibility.type.ts
export type HomeOptions = {
  readonly forcedColors?: 'active';
  readonly reducedMotion?: 'reduce';
};
```

```ts
// e2e/accessibility/pages/home.po.ts
import type { Locator, Page } from '@playwright/test';

import type { HomeOptions } from '../common/accessibility.type';

export class HomePage {
  public readonly hero: Locator;
  public readonly main: Locator;
  public readonly navigation: Locator;
  public readonly skipLink: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.hero = page.getByTestId('hero-animation');
    this.main = page.getByRole('main');
    this.navigation = page.getByRole('navigation');
    this.skipLink = page.getByRole('link', { name: /skip to main/i });
  }

  public async goto(options: HomeOptions = {}): Promise<void> {
    await this.page.emulateMedia(options);
    await this.page.goto('/');
  }

  public async pressTab(): Promise<void> {
    await this.page.keyboard.press('Tab');
  }

  public async pressEnter(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }
}
```

```ts
// e2e/accessibility/skip-link.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: skip link', () => {
  test('GIVEN focus at the page start, the skip link moves focus to the main landmark', async ({ homePage }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

    await test.step('AND tab is pressed', (): Promise<void> => homePage.pressTab());

    await test.step('THEN the skip link is focused', (): Promise<void> => expect(homePage.skipLink).toBeFocused());

    await test.step('WHEN enter is pressed', (): Promise<void> => homePage.pressEnter());

    await test.step('THEN the main landmark is focused', (): Promise<void> => expect(homePage.main).toBeFocused());
  });
});
```

### Escape Key Handling

`DashboardPage` also owns the landmark locators used under [ARIA Validation](#aria-validation).

```ts
// e2e/accessibility/pages/dashboard.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class DashboardPage {
  public readonly footer: Locator;
  public readonly main: Locator;
  public readonly navigation: Locator;
  public readonly search: Locator;
  public readonly settingsButton: Locator;
  public readonly settingsDialog: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.footer = page.getByRole('contentinfo');
    this.main = page.getByRole('main');
    this.navigation = page.getByRole('navigation');
    this.search = page.getByRole('search');
    this.settingsButton = page.getByRole('button', { name: 'Settings' });
    this.settingsDialog = page.getByRole('dialog');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  public async openSettings(): Promise<void> {
    await this.settingsButton.click();
  }

  public async pressEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  public async expectLandmarks(): Promise<void> {
    await expect(this.navigation).toBeVisible();
    await expect(this.main).toBeVisible();
    await expect(this.footer).toBeVisible();
    await expect(this.search).toBeVisible();
  }
}
```

```ts
// e2e/accessibility/settings-dialog.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: settings dialog keyboard handling', () => {
  test('GIVEN a closed settings dialog, escape after opening it closes it and refocuses the trigger', async ({ dashboardPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the settings dialog is opened', (): Promise<void> => dashboardPage.openSettings());

    await test.step('THEN the dialog is visible', (): Promise<void> => expect(dashboardPage.settingsDialog).toBeVisible());

    await test.step('WHEN escape is pressed', (): Promise<void> => dashboardPage.pressEscape());

    await test.step('THEN the dialog is hidden', (): Promise<void> => expect(dashboardPage.settingsDialog).toBeHidden());

    await test.step('AND the settings button is focused again', (): Promise<void> => expect(dashboardPage.settingsButton).toBeFocused());
  });
});
```

## ARIA Validation

Every ARIA check is one phase: the `WHEN` step opens the page, an `AND` step calls one page-object action, a `THEN` step asserts one locator. Roles are locators on the page object; several roles that describe one state are asserted together in one `expect*` method as plain `await expect(…)` lines.

| Check | Page-object member | Action after `WHEN` | `THEN` |
|---|---|---|---|
| Landmark and widget roles | `dashboardPage.expectLandmarks()` (shown above) | none, `goto()` is the only action | `dashboardPage.expectLandmarks()` |
| Expanded state | `faqPage.shippingButton` = `getByRole('button', { name: 'Shipping' })`, `faqPage.shippingPanel` = `getByRole('region', { name: 'Shipping' })` | `faqPage.toggleShipping()` | `expect(faqPage.shippingButton).toHaveAttribute('aria-expanded', 'true')`, then `expect(faqPage.shippingPanel).toBeVisible()` |
| Live region | `checkoutPage.liveRegion` = `page.locator('[aria-live="polite"]')`, located by attribute because a live region has no role name | `checkoutPage.setQuantity('3')` | `expect(checkoutPage.liveRegion).toContainText('Total: $29.97')` |

### Aria Snapshots

`toMatchAriaSnapshot` compares the accessibility tree (roles, names, states) with a YAML baseline. It works on a locator and on the whole page. Called with `{ name }` it reads `<name>` from the test's snapshot folder; `--update-snapshots` writes it on the first run. The assertion lives in an `expect*` page-object method like any other; `accessibility.fixture.ts` registers `settingsPage` beside the other page objects.

```ts
// e2e/accessibility/pages/settings.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const NAVIGATION_SNAPSHOT = { name: 'settings-navigation.aria.yml' };

const PAGE_SNAPSHOT = { name: 'settings-page.aria.yml' };

export class SettingsPage {
  public readonly navigation: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.navigation = page.getByRole('navigation', { name: 'Settings' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/settings');
  }

  public async expectNavigationTree(): Promise<void> {
    await expect(this.navigation).toMatchAriaSnapshot(NAVIGATION_SNAPSHOT);
  }

  public async expectPageTree(): Promise<void> {
    await expect(this.page).toMatchAriaSnapshot(PAGE_SNAPSHOT);
  }
}
```

```ts
// e2e/accessibility/settings-tree.e2e.ts
import { test } from './accessibility.fixture';

test.describe('FEATURE: settings accessibility tree', () => {
  test('GIVEN the default settings, the navigation and page trees match their baselines', async ({ settingsPage }): Promise<void> => {
    await test.step('WHEN the settings page is opened', (): Promise<void> => settingsPage.goto());

    await test.step('THEN the navigation tree matches its baseline', (): Promise<void> => settingsPage.expectNavigationTree());

    await test.step('AND the page tree matches its baseline', (): Promise<void> => settingsPage.expectPageTree());
  });
});
```

| Call | Use |
|---|---|
| `toMatchAriaSnapshot(expected)` | Inline YAML for a small tree. Keep the string in `common/<feature>.const.ts`, not in the page object. |
| `ariaSnapshot({ depth })` (1.59) | Text tree cut at `depth` levels, for a check or a debug print of a large region. |
| `ariaSnapshot({ mode: 'ai' })` (1.59) | Adds `[ref=e2]` element refs and iframe content; the form coding agents read. |
| `ariaSnapshot({ boxes: true })` (1.60) | Appends each element's viewport box. |
| `ariaSnapshotJSON()` (1.63) | The same tree as a JSON value with the same options, on a locator or the page. An `expect*` util reads it and asserts structure with `toMatchObject`, no YAML parsing. |

## Focus Management

### Focus Trap in Modal

A dialog is a helper object scoped to its root locator. Tabbing one past the focusable count proves focus wrapped instead of leaving the dialog. The presses are the action: `tabPastLastControl()` records after each press whether the root still contains the focused element, and the spec's `THEN` checks the record.

```ts
// e2e/accessibility/helpers/dialog.helper.ts
import type { Locator } from '@playwright/test';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const containsFocus = (root: Element): boolean => root.contains(document.activeElement);

export class DialogHelper {
  public readonly focusable: Locator;
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.focusable = root.locator(FOCUSABLE);
  }

  public async tabPastLastControl(): Promise<boolean[]> {
    const count = await this.focusable.count();
    const inside: boolean[] = [];

    for (let index = 0; index <= count; index += 1) {
      await this.root.page().keyboard.press('Tab');

      const focusInside = await this.root.evaluate(containsFocus);

      inside.push(focusInside);
    }

    return inside;
  }
}
```

`ItemsPage` follows `DashboardPage`: `goto()` opens `/items`, `openDialog()` clicks `getByRole('button', { name: 'Open Modal' })`, and `dialog` is `new DialogHelper(page.getByRole('dialog'))`.

```ts
// e2e/accessibility/items-focus.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: items page focus management', () => {
  test('GIVEN a closed item dialog, tabbing through it after opening never leaves it', async ({ itemsPage }): Promise<void> => {
    await test.step('WHEN the items page is opened', (): Promise<void> => itemsPage.goto());

    await test.step('AND the dialog is opened', (): Promise<void> => itemsPage.openDialog());

    await test.step('THEN the dialog is visible', (): Promise<void> => expect(itemsPage.dialog.root).toBeVisible());

    const inside = await test.step('WHEN tab is pressed once past the last control', (): Promise<boolean[]> => itemsPage.dialog.tabPastLastControl());

    await test.step('THEN focus never leaves the dialog', (): void => expect(inside).not.toContain(false));
  });
});
```

Focus restoration: the last step of `settings-dialog.e2e.ts` covers it: the trigger that opened the dialog must be focused after the dialog closes. Any trigger and dialog pair follows the same steps: open the dialog, close it, `toBeFocused()` on the trigger.

## Color & Contrast

`page.emulateMedia` runs inside `homePage.goto(options)` before it navigates, so the preference is an option on the opening call and the `WHEN` stays `'WHEN the home page is opened'`. Media emulation can change at runtime, so it stays an option on the opening call even when every test in a spec shares it, never a `test.use`.

| Emulation | Opening call | `THEN` |
|---|---|---|
| High contrast | `homePage.goto({ forcedColors: 'active' })` | `expect(homePage.navigation).toBeVisible()`, then `expect(page).toHaveScreenshot('high-contrast.png')` |
| Reduced motion | `homePage.goto({ reducedMotion: 'reduce' })` | shown below |

`toHaveCSS('animation-duration', '0s')` reads the computed style inside the check and retries until it matches, so no step reads the value first.

```ts
// e2e/accessibility/reduced-motion.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: reduced motion', () => {
  test('GIVEN a reduced motion preference, the hero animation is disabled', async ({ homePage }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto({ reducedMotion: 'reduce' }));

    await test.step('THEN the hero animation lasts 0s', (): Promise<void> => expect(homePage.hero).toHaveCSS('animation-duration', '0s'));
  });
});
```

## CI Integration

A dedicated project collects every spec under `e2e/accessibility/`, so CI can run the accessibility specs on their own.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const a11yUse = { ...devices['Desktop Chrome'] };

const projects = [{ name: 'a11y', testMatch: 'accessibility/**/*.e2e.ts', use: a11yUse }];

export default defineConfig({ projects, testMatch: '**/*.@(e2e|test).ts' });
```

```yaml
# .github/workflows/a11y.yml
- name: Run accessibility tests
  run: npx playwright test --project=a11y
```

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|---|---|---|
| Testing a11y only on homepage | Misses issues on other pages | Test all critical user flows |
| Ignoring all violations | No value from tests | Address or explicitly exclude known issues |
| Only automated testing | Misses many a11y issues | Combine with manual testing |
| Testing without screen reader | Misses interaction issues | Test with VoiceOver/NVDA periodically |

## Related References

- **Locators**: See [locators.md](../core/locators.md) for role-based selectors
- **Visual testing**: See [test-suite-structure.md](../core/test-suite-structure.md) for screenshot comparison
