# Refactoring Existing Specs

A suite written before this house style usually has nested `describe` groups, `should` or `SCENARIO:` titles, `GIVEN` steps that only register a route, boxed steps inside page objects, and `beforeEach` hooks that open the page. This file is the order of work for bringing such a suite to `house-style.md` without losing coverage. Refactor one feature folder at a time, and keep the suite green after each folder.

## Contents

- [Order of Work](#order-of-work)
- [Old Shape to New Shape](#old-shape-to-new-shape)
- [Before and After](#before-and-after)
- [Keeping Coverage](#keeping-coverage)
- [Common Mistakes](#common-mistakes)

## Order of Work

1. **Baseline.** Run the folder: `npx playwright test e2e/<feature> --reporter=list`. Write down the pass count, the number of tests, and, per test, the checks it runs, including the ones inside page-object methods it calls. These must not drop.
2. **Inventory.** `bash <skill>/scripts/lint-samples.sh e2e/<feature>` lists every rule the folder breaks, by file and line. The lint reads real `.ts` files as well as the samples in this skill.
3. **Page objects and helpers.** Remove every `test.step` and `{ box: true }`; each `expect*` method becomes plain `await expect(…)` lines. For each route a spec registers before opening the page, give `goto` an option (`goto({ failOn: 'delete' })`) typed by one `<Page>Options`.
4. **Fixtures.** Move API seeding into fixtures; a fixture may hand over the page already seeded and open. Delete steps from hooks; a hook that only opened the page goes away, and each test opens it in its `WHEN`.
5. **Specs.** One `FEATURE` per spec, with a `JOURNEY` only for tests that follow one user path. Titles become `GIVEN <start state>, <outcome>`. Steps become `WHEN` → `AND` → `THEN` → `AND`, with a new `WHEN` for each action after a check. A `test.use` group with a context-fixed option moves to its own spec.
6. **Names.** A `.spec.ts` file becomes `.test.ts` when a test run routes your own origin (its own route, a routing fixture, or a routing option it passes), and `.e2e.ts` otherwise. The config's `testMatch` is `'**/*.@(e2e|test).ts'`.
7. **Verify.** Lint clean, `npx tsc --noEmit` clean, the same pass count, `--repeat-each=3` green, and every test still runs the checks listed in step 1. Open one trace (`npx playwright show-trace`) and check that no step sits inside another.

## Old Shape to New Shape

| Old | New |
|---|---|
| `test.describe('Login')` with `test.describe('when …')` groups inside | One `test.describe('FEATURE: login')`; each group's state moves into its tests' titles. |
| `test('should show an error')`, `test('SCENARIO: …')` | `test('GIVEN a wrong password, submitting shows the error banner')`. |
| `test.step('GIVEN the service rejects deletes', () => page.route(…))` | Gone. `alertsPage.goto({ failOn: 'delete' })` in the opening `WHEN`; the title names the rejection. |
| `beforeEach` that opens the page | Each test's `'WHEN … is opened'` step, or a fixture that hands over the open page. |
| `beforeEach` that seeds data through the UI or `request` | A fixture that seeds through `request` and hands over the page. |
| `test.step('THEN …', …, { box: true })` inside a page object | Plain `await expect(…)` in the `expect*` method; the spec's step is the only step. |
| `THEN` check, then `AND` click, then `THEN` check | `THEN` check, `WHEN` click, `THEN` check: an action after a check starts a new phase. |
| `const body = await response.json()` before the status check | `'THEN the status is 200'`, then `'AND the body …'` through an `expect*` util that reads the body. |
| `test.describe('German', () => { test.use({ locale: 'de-DE' }); … })` | `<feature>-de.e2e.ts` with a file-level `test.use({ locale: 'de-DE' })` and its own `FEATURE`. |
| `for (const locale of LOCALES) test.describe(…)` | A project per locale. A runtime value such as a viewport is a `for` loop of tests instead. |
| `const token = await …` between steps | A step that returns the value, or a fixture that provides it. |

## Before and After

Before, the shape in many existing suites: a flat spec whose first step only registers a route, and a page object that opens its own boxed `THEN`. The trace shows a 0 ms `GIVEN` step and a `THEN` nested inside every `THEN`.

```ts avoid
test.describe('FEATURE: price alerts API failures', () => {
  test('SCENARIO: a failed delete warns and keeps the alert', async ({ alertsPage, page }) => {
    await test.step('GIVEN the alerts service rejects deletes', async () => {
      await page.route(ALERTS_URL, alertsMock({ failOn: 'delete' }));
    });
    await test.step('AND the alerts overview is open', () => alertsPage.goto());
    await test.step('WHEN the active alert is opened', () => alertsPage.openAlert(ALERT_STUB.name));
    await test.step('AND its deletion is confirmed', () => alertsPage.confirmDeletion());
    await test.step('THEN the delete error toast is shown', () => alertsPage.expectDeleteError());
  });
});
```

After, the spec: the title names the rejection, the opening call applies it, and the trace is one level deep.

```ts
// e2e/price-alerts/price-alerts.test.ts
import { test } from './price-alerts.fixture';
import { ALERT_STUB } from './test/stubs/alerts.stub';

test.describe('FEATURE: price alerts', () => {
  test('GIVEN a rejected delete, deleting warns and keeps the alert', async ({ alertsPage }): Promise<void> => {
    await test.step('WHEN the alerts overview is opened', (): Promise<void> => alertsPage.goto({ failOn: 'delete' }));

    await test.step('AND the active alert is opened', (): Promise<void> => alertsPage.openAlert(ALERT_STUB.name));

    await test.step('AND its deletion is confirmed', (): Promise<void> => alertsPage.confirmDeletion());

    await test.step('THEN the delete error toast is shown', (): Promise<void> => alertsPage.expectDeleteError());

    await test.step('AND the alert is still active', (): Promise<void> => alertsPage.expectActive(ALERT_STUB.name));
  });
});
```

After, the page object's opening call and checks. `AlertsOptions` is `{ readonly failOn?: 'delete' | 'list' }` in `common/price-alerts.type.ts`; `alertsMock` serves `ALERTS_STUB` and fails the method the option names.

```ts
// e2e/price-alerts/pages/alerts.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { AlertsOptions } from '../common/price-alerts.type';
import { ALERTS_URL, alertsMock } from '../test/mocks/alerts.mock';

export class AlertsPage {
  public readonly activeAlerts: Locator;
  public readonly toast: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.activeAlerts = page.getByTestId('active-alerts');
    this.toast = page.getByRole('status');
  }

  public async goto(options: AlertsOptions = {}): Promise<void> {
    await this.page.route(ALERTS_URL, alertsMock(options));
    await this.page.goto('/alerts');
  }

  public async expectDeleteError(): Promise<void> {
    await expect(this.toast).toHaveText('There was an error deleting the alert');
  }

  public async expectActive(name: string): Promise<void> {
    await expect(this.activeAlerts).toContainText(name);
  }
}
```

`openAlert` and `confirmDeletion` are unchanged action methods. This spec mocks every alerts call, so `goto` routes unconditionally and needs no `if`; in a suite that runs against the real backend, `goto` routes only when an option is given.

## Keeping Coverage

A refactor that deletes checks to fit the new step order has lowered the bar. Before a file is done:

| Check | How |
|---|---|
| No test lost | The number of `test(` calls per file is not lower than the baseline, unless two tests merged and the merged test keeps both checks. |
| No check lost | Each check from the baseline list still runs in the same test. A grep count of `expect(` can fall when inline checks move into a shared `expect*` method, so compare per test, not by total. A guard check before an action stays, as its own phase: `'THEN the alert is listed'`, then `'WHEN it is deleted'`. |
| Same behaviour | Each old title's outcome still has a `THEN` that asserts it. |
| Stable | `npx playwright test e2e/<feature> --repeat-each=3` is green. |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Deleting the check between two actions so the test has one `WHEN` | Keep it; the next action starts a new `WHEN` phase. |
| Keeping the route step and renaming it `AND` | A step never routes. Move the route into the opening call's option or a fixture. |
| `'GIVEN the alerts page, …'` | Name the start state the page shows: `'GIVEN saved alerts, …'`. |
| `'GIVEN a confirmed deletion, …'` while the steps confirm the deletion | Name where the test starts; the action goes after the comma: `'GIVEN an active alert, deleting it …'`. |
| A second options type for the same page object in another feature folder | One `<Page>Options`; add a field to it. |
| Renaming every spec that imports a page object which can route to `.test.ts` | Only a run that routes counts: its own route, a routing fixture, or a routing option it passes. |
| A lint finding on a line that Prettier split | The lint joins `test(` and `test.step(` split after the parenthesis. For other splits, keep one call per line or read the rule in `house-style.md` by hand. |
