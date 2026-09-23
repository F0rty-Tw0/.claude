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

The scan is a step that returns the `AxeResults`; the assertion is its own step.

```ts
// e2e/accessibility/accessibility.e2e.ts
import type { AxeResults } from 'axe-core';

import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: accessibility', () => {
  test('SCENARIO: scanning the home page reports no axe violations', async ({ homePage, makeAxeBuilder }): Promise<void> => {
    await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

    const results = await test.step('WHEN the page is scanned with axe', (): Promise<AxeResults> => makeAxeBuilder().analyze());

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

import { DashboardPage } from './pages/dashboard.page';
import { HomePage } from './pages/home.page';
import { ItemsPage } from './pages/items.page';
import { SignupPage } from './pages/signup.page';

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

The page object owns the expected order as a `Locator[]` and walks it inside a boxed step.

```ts
// e2e/accessibility/pages/signup.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class SignupPage {
  public readonly emailInput: Locator;
  public readonly passwordInput: Locator;
  public readonly submitButton: Locator;
  public readonly tabOrder: Locator[];

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign up' });
    this.tabOrder = [this.emailInput, this.passwordInput, this.submitButton];
  }

  public async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  public async expectTabOrder(): Promise<void> {
    await test.step('THEN tab visits email, password, sign up in order', (): Promise<void> => this.walkTabOrder(), { box: true });
  }

  private async walkTabOrder(): Promise<void> {
    for (const target of this.tabOrder) {
      await this.page.keyboard.press('Tab');
      await expect(target).toBeFocused();
    }
  }
}
```

```ts
// e2e/accessibility/signup-keyboard.e2e.ts
import { test } from './accessibility.fixture';

test.describe('FEATURE: signup keyboard navigation', () => {
  test('SCENARIO: tabbing from the page start visits email, password, sign up in order', async ({ signupPage }): Promise<void> => {
    await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());

    await test.step('WHEN tab is pressed from the page start THEN focus visits email, password, sign up in order', (): Promise<void> => signupPage.expectTabOrder());
  });
});
```

### Keyboard-Only Interaction and Skip Links

A keyboard flow is a page-object method per user intent; the key sequence stays inside the method and the spec step names the intent. A shop flow reads `WHEN the first product is opened with tab and enter` → `shopPage.openFirstProductByKeyboard()` (Tab twice, then Enter), `THEN` `expect(page).toHaveURL(/\/products\/\d+/)`, then an `AND` / `THEN` pair for `addToCartByKeyboard()` and `expect(shopPage.toast).toContainText('Added to cart')`.

`HomePage` also carries the landmark locators and the media-emulation methods used under [Color & Contrast](#color--contrast).

```ts
// e2e/accessibility/pages/home.page.ts
import type { Locator, Page } from '@playwright/test';

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

  public async goto(): Promise<void> {
    await this.page.goto('/');
  }

  public async pressTab(): Promise<void> {
    await this.page.keyboard.press('Tab');
  }

  public async pressEnter(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }

  public async emulateForcedColors(): Promise<void> {
    await this.page.emulateMedia({ forcedColors: 'active' });
  }

  public async emulateReducedMotion(): Promise<void> {
    await this.page.emulateMedia({ reducedMotion: 'reduce' });
  }

  public async heroAnimationDuration(): Promise<string> {
    return this.hero.evaluate((element: HTMLElement): string => getComputedStyle(element).animationDuration);
  }
}
```

```ts
// e2e/accessibility/skip-link.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: skip link', () => {
  test('SCENARIO: activating the skip link moves focus to the main landmark', async ({ homePage }): Promise<void> => {
    await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

    await test.step('AND tab is pressed', (): Promise<void> => homePage.pressTab());

    await test.step('AND the skip link is focused', (): Promise<void> => expect(homePage.skipLink).toBeFocused());

    await test.step('WHEN enter is pressed', (): Promise<void> => homePage.pressEnter());

    await test.step('THEN the main landmark is focused', (): Promise<void> => expect(homePage.main).toBeFocused());
  });
});
```

### Escape Key Handling

`DashboardPage` also owns the landmark locators used under [ARIA Validation](#aria-validation).

```ts
// e2e/accessibility/pages/dashboard.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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
    await test.step('THEN navigation, main, footer, and search are visible', async (): Promise<void> => {
      await expect(this.navigation).toBeVisible();
      await expect(this.main).toBeVisible();
      await expect(this.footer).toBeVisible();
      await expect(this.search).toBeVisible();
    }, { box: true });
  }
}
```

```ts
// e2e/accessibility/settings-dialog.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: settings dialog keyboard handling', () => {
  test('SCENARIO: pressing escape closes the dialog and returns focus to the trigger', async ({ dashboardPage }): Promise<void> => {
    await test.step('GIVEN the dashboard is open', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the settings dialog is open', (): Promise<void> => dashboardPage.openSettings());

    await test.step('AND the dialog is visible', (): Promise<void> => expect(dashboardPage.settingsDialog).toBeVisible());

    await test.step('WHEN escape is pressed', (): Promise<void> => dashboardPage.pressEscape());

    await test.step('THEN the dialog is hidden', (): Promise<void> => expect(dashboardPage.settingsDialog).toBeHidden());

    await test.step('AND the settings button is focused again', (): Promise<void> => expect(dashboardPage.settingsButton).toBeFocused());
  });
});
```

## ARIA Validation

Every ARIA check is the shape of `settings-dialog.e2e.ts`: a `GIVEN` step opens the page, a `WHEN` step calls one page-object action, a `THEN` step asserts one locator. Roles are locators on the page object; several roles that describe one state are asserted together in one boxed `expect*` method.

| Check | Page-object member | `WHEN` | `THEN` |
|---|---|---|---|
| Landmark and widget roles | `dashboardPage.expectLandmarks()` (boxed, shown above) | `dashboardPage.goto()` | `dashboardPage.expectLandmarks()` |
| Expanded state | `faqPage.shippingButton` = `getByRole('button', { name: 'Shipping' })`, `faqPage.shippingPanel` = `getByRole('region', { name: 'Shipping' })` | `faqPage.toggleShipping()` | `expect(faqPage.shippingButton).toHaveAttribute('aria-expanded', 'true')`, then `expect(faqPage.shippingPanel).toBeVisible()` |
| Live region | `checkoutPage.liveRegion` = `page.locator('[aria-live="polite"]')`, located by attribute because a live region has no role name | `checkoutPage.setQuantity('3')` | `expect(checkoutPage.liveRegion).toContainText('Total: $29.97')` |

## Focus Management

### Focus Trap in Modal

A dialog is a component object scoped to its root locator. Tabbing one past the focusable count proves focus wrapped instead of leaving the dialog.

```ts
// e2e/accessibility/components/dialog.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class DialogComponent {
  public readonly focusable: Locator;
  public readonly focused: Locator;
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.focusable = root.locator(FOCUSABLE);
    this.focused = root.locator(':focus');
  }

  public async expectFocusTrapped(): Promise<void> {
    await test.step('THEN tab cycles inside the dialog', (): Promise<void> => this.cycleFocus(), { box: true });
  }

  private async cycleFocus(): Promise<void> {
    const count = await this.focusable.count();

    for (let index = 0; index <= count; index += 1) {
      await this.root.page().keyboard.press('Tab');
      await expect(this.focused).toHaveCount(1);
    }
  }
}
```

`ItemsPage` follows `DashboardPage`: `goto()` opens `/items`, `openDialog()` clicks `getByRole('button', { name: 'Open Modal' })`, and `dialog` is `new DialogComponent(page.getByRole('dialog'))`.

```ts
// e2e/accessibility/items-focus.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: items page focus management', () => {
  test('SCENARIO: an open dialog keeps tab inside it', async ({ itemsPage }): Promise<void> => {
    await test.step('GIVEN the items page is open', (): Promise<void> => itemsPage.goto());

    await test.step('WHEN the dialog is opened', (): Promise<void> => itemsPage.openDialog());

    await test.step('THEN the dialog is visible', (): Promise<void> => expect(itemsPage.dialog.root).toBeVisible());

    await test.step('AND focus is trapped in the dialog', (): Promise<void> => itemsPage.dialog.expectFocusTrapped());
  });
});
```

Focus restoration: the last step of `settings-dialog.e2e.ts` covers it: the trigger that opened the dialog must be focused after the dialog closes. Any trigger and dialog pair follows the same three steps: open, close, `toBeFocused()` on the trigger.

## Color & Contrast

`page.emulateMedia` lives on the page object as `emulateForcedColors()` and `emulateReducedMotion()`, called in a `GIVEN` step before `goto()`. `test.use({ forcedColors: 'active' })` at the describe level does the same for every test in the block.

| Emulation | `GIVEN` | `THEN` |
|---|---|---|
| High contrast | `homePage.emulateForcedColors()` | `expect(homePage.navigation).toBeVisible()`, then `expect(page).toHaveScreenshot('high-contrast.png')` |
| Reduced motion | `homePage.emulateReducedMotion()` | shown below |

The computed `animationDuration` is read by a page-object method with a typed `evaluate`, returned from a step, and asserted in the next step.

```ts
// e2e/accessibility/reduced-motion.e2e.ts
import { expect, test } from './accessibility.fixture';

test.describe('FEATURE: reduced motion', () => {
  test('SCENARIO: preferring reduced motion disables the hero animation', async ({ homePage }): Promise<void> => {
    await test.step('GIVEN reduced motion is emulated', (): Promise<void> => homePage.emulateReducedMotion());

    await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

    const duration = await test.step('AND the hero animation duration is read', (): Promise<string> => homePage.heroAnimationDuration());

    await test.step('THEN the animation duration is zero', (): void => expect(duration).toBe('0s'));
  });
});
```

## CI Integration

A dedicated project matches `*.a11y.e2e.ts` so CI can run accessibility specs on their own.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const a11yUse = { ...devices['Desktop Chrome'] };

const projects = [{ name: 'a11y', testMatch: /.*\.a11y\.spec\.ts/, use: a11yUse }];

export default defineConfig({ projects });
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
