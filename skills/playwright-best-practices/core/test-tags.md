# Test Tags

## Table of Contents

1. [Basic Tagging](#basic-tagging)
2. [Tagging Describe Blocks](#tagging-describe-blocks)
3. [Running Tagged Tests](#running-tagged-tests)
4. [Filtering by Tags](#filtering-by-tags)
5. [Configuration-Based Filtering](#configuration-based-filtering)
6. [Tag Organization Patterns](#tag-organization-patterns)
7. [Common Tag Categories](#common-tag-categories)
8. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
9. [Related References](#related-references)

## Basic Tagging

### Tag via Title (not recommended)

Tags in the title still match `--grep`, but they pollute the Gherkin sentence and are invisible to `testInfo.tags`. Avoid:

```ts avoid
test('quick validation @fast @smoke', async ({ page }) => {
  await page.goto('/');
});
```

### Tag via Details Object

Prefer the details object as the second argument. A single tag is a string; several tags are an array.

```ts
// e2e/login/login.spec.ts
import { test } from './login.fixture';

test.describe('FEATURE: login', () => {
  test.describe('GIVEN a visitor', () => {
    test('SCENARIO: login page shows the heading', { tag: '@fast' }, async ({ loginPage }): Promise<void> => {
      await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto());

      await test.step('THEN heading is visible', (): Promise<void> => loginPage.expectHeadingVisible());
    });

    test('SCENARIO: dashboard renders the charts', { tag: ['@slow', '@smoke'] }, async ({ dashboardPage }): Promise<void> => {
      await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN charts are visible', (): Promise<void> => dashboardPage.expectChartsVisible());
    });
  });
});
```

## Tagging Describe Blocks

### Tag All Tests in Group

A tag on `test.describe` is inherited by every test inside.

### Combine Group and Test Tags

Test-level tags add to the inherited ones. The second test below carries `@admin`, `@critical`, and `@slow`.

```ts
// e2e/admin/admin.spec.ts
import { test } from './admin.fixture';

test.describe('FEATURE: admin', { tag: '@admin' }, () => {
  test.describe('GIVEN an admin session', () => {
    test('SCENARIO: dashboard lists the metrics', async ({ adminPage }): Promise<void> => {
      await test.step('WHEN the dashboard is opened', (): Promise<void> => adminPage.gotoDashboard());

      await test.step('THEN metrics are listed', (): Promise<void> => adminPage.expectMetricsListed());
    });

    test('SCENARIO: saved settings are recorded in the audit log', { tag: ['@critical', '@slow'] }, async ({ adminPage }): Promise<void> => {
      await test.step('WHEN the settings are saved', (): Promise<void> => adminPage.saveSettings());

      await test.step('THEN audit log lists the change', (): Promise<void> => adminPage.expectAuditEntry('settings saved'));
    });
  });
});
```

## Running Tagged Tests

### Run Tests with Specific Tag

```bash
# Run all @fast tests
npx playwright test --grep @fast
```

### Exclude Tests with Tag

```bash
# Run all tests except @slow
npx playwright test --grep-invert @slow
```

## Filtering by Tags

### Logical OR (Either Tag)

```bash
# Run tests with @fast OR @smoke
npx playwright test --grep "@fast|@smoke"
```

### Logical AND (Both Tags)

```bash
# Run tests with both @fast AND @critical
npx playwright test --grep "(?=.*@fast)(?=.*@critical)"
```

### Complex Patterns

```bash
# Run @e2e tests that are also @critical
npx playwright test --grep "(?=.*@e2e)(?=.*@critical)"

# Run @api tests excluding @slow
npx playwright test --grep "@api" --grep-invert "@slow"
```

## Configuration-Based Filtering

### Filter in playwright.config.ts

`grep` and `grepInvert` at the top level apply to the whole run.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  grep: /@smoke/,
  grepInvert: /@flaky/,
  testDir: './e2e'
});
```

### Project-Specific Tags

Each project filters independently, so one run can produce a smoke project and a regression project from the same specs.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const projects = [
  { grep: /@smoke/, name: 'smoke' },
  { grepInvert: /@smoke/, name: 'regression' },
  { grep: /@critical/, name: 'critical-only' }
];

export default defineConfig({ projects, testDir: './e2e' });
```

### Environment-Based Filtering

The environment read happens once in the config; `undefined` means no filter.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const isCi = Boolean(process.env.CI);

const grep = isCi ? /@smoke|@critical/ : undefined;

const grepInvert = isCi ? /@flaky/ : undefined;

export default defineConfig({ grep, grepInvert, testDir: './e2e' });
```

## Tag Organization Patterns

All three schemes use the same two mechanisms: a describe-level tag for the shared axis and a test-level tag for the specific one. One sample covers them; the tables say which tags go where.

### By Feature Area

```ts
// e2e/payments/payments.spec.ts
import { test } from './payments.fixture';
import { CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: payments', { tag: '@payments' }, () => {
  test.describe('GIVEN a saved card', () => {
    test('SCENARIO: charged card shows the receipt', { tag: ['@critical', '@p0'] }, async ({ paymentsPage }): Promise<void> => {
      await test.step('WHEN the card is charged', (): Promise<void> => paymentsPage.charge(CARD_STUB));

      await test.step('THEN receipt is visible', (): Promise<void> => paymentsPage.expectReceiptVisible());
    });

    test('SCENARIO: PayPal selection opens the redirect', { tag: ['@critical', '@slow'] }, async ({ paymentsPage }): Promise<void> => {
      await test.step('WHEN PayPal is selected', (): Promise<void> => paymentsPage.selectPaypal());

      await test.step('THEN PayPal redirect is open', (): Promise<void> => paymentsPage.expectPaypalRedirect());
    });
  });
});
```

### By Test Type

| Tag | Scope | Meaning |
|---|---|---|
| `@smoke` | Test | Quick validation: homepage loads, login works |
| `@regression` | Test or describe | Comprehensive: full checkout flow, all payment methods |
| `@e2e` | Describe | Complete user journeys |

### By Priority

| Tag | Pairs with | Meaning |
|---|---|---|
| `@p0` | `@critical` | Payment processing, auth |
| `@p1` | none | User preferences |
| `@p2` | none | Theme customization |

## Common Tag Categories

| Category        | Tags                                          | Purpose                       |
| --------------- | --------------------------------------------- | ----------------------------- |
| **Speed**       | `@fast`, `@slow`                              | Execution time classification |
| **Priority**    | `@critical`, `@p0`, `@p1`, `@p2`              | Business importance           |
| **Type**        | `@smoke`, `@regression`, `@e2e`               | Test suite categorization     |
| **Feature**     | `@auth`, `@payments`, `@settings`             | Feature area grouping         |
| **Pipeline**    | `@pr`, `@nightly`, `@release`                 | CI/CD execution timing        |
| **Status**      | `@flaky`, `@wip`, `@quarantine`               | Test health tracking          |
| **Environment** | `@local`, `@staging`, `@prod`                 | Target environment            |
| **Team**        | `@team-frontend`, `@team-backend`, `@team-qa` | Team assignment               |

## Anti-Patterns to Avoid

| Anti-Pattern             | Problem                  | Solution                                       |
| ------------------------ | ------------------------ | ---------------------------------------------- |
| Too many tags per test   | Hard to maintain         | Limit to 2-3 relevant tags                     |
| Inconsistent naming      | Confusing filtering      | Establish naming conventions                   |
| Missing `@` prefix       | Tags won't match filters | Always prefix with `@`                         |
| Overlapping tag meanings | Ambiguous categorization | Define clear tag semantics                     |
| Not using tags           | Can't selectively run    | Tag by type, priority, or feature              |
| Tags in test title       | Hard to parse/filter     | Use the details object for tags, not the title |

## Related References

- **Test Organization**: See [test-suite-structure.md](test-suite-structure.md) for structuring tests
- **Annotations**: See [annotations.md](annotations.md) for skip, fixme, fail, slow
- **CI/CD Integration**: See [ci-cd.md](../infrastructure-ci-cd/ci-cd.md) for pipeline setup
