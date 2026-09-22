# Test Annotations & Organization

Annotation calls (`test.skip`, `test.fixme`, `test.fail`, `test.slow`, `test.setTimeout`, `annotate.*`) are not user actions, so they are the one kind of statement that sits outside a `test.step`. They go first in the body, blank line, then the steps. Everything else in a test body is a step, as `house-style.md` requires.

Environment reads (`CI`, `ENV`, `process.platform`) happen once in `e2e/common/playwright.const.ts` and reach specs as named constants:

```ts
// e2e/common/playwright.const.ts
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';

export const IS_CI = Boolean(process.env.CI);

export const IS_WINDOWS = process.platform === 'win32';

export const TARGET_ENV = process.env.ENV ?? 'local';
```

## Table of Contents

1. [Skip Annotations](#skip-annotations)
2. [Fixme & Fail Annotations](#fixme--fail-annotations)
3. [Slow Tests](#slow-tests)
4. [Test Steps](#test-steps)
5. [Custom Annotations](#custom-annotations)
6. [Conditional Annotations](#conditional-annotations)

## Skip Annotations

### Basic Skip

`test.skip(title, body)` in place of `test` never runs the body. `test.skip(condition, reason)` as the first statement of a body skips at runtime and records the reason in the report.

```ts
// e2e/payments/payments.spec.ts
import { test } from './payments.fixture';
import { CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: payments', () => {
  test.describe('GIVEN a saved card', () => {
    test.skip('SCENARIO: charging the card lists the amount on the receipt', async ({ paymentsPage }): Promise<void> => {
      await test.step('WHEN the card is charged', (): Promise<void> => paymentsPage.charge(CARD_STUB));

      await test.step('THEN the receipt shows the amount', (): Promise<void> => paymentsPage.expectReceiptAmount(CARD_STUB.amount));
    });

    test('SCENARIO: requesting a refund restores the balance', async ({ paymentsPage }): Promise<void> => {
      test.skip(true, 'Payment gateway in maintenance');

      await test.step('WHEN a refund is requested', (): Promise<void> => paymentsPage.refund(CARD_STUB));

      await test.step('THEN the balance shows the original amount', (): Promise<void> => paymentsPage.expectBalance(CARD_STUB.balance));
    });
  });
});
```

### Conditional Skip

The condition is any boolean. Built-in fixtures (`browserName`, `isMobile`) come from the test arguments; environment facts come from `playwright.const.ts`.

```ts
// e2e/media/media.spec.ts
import { TARGET_ENV } from '../common/playwright.const';
import { test } from './media.fixture';

test.describe('FEATURE: media playback', () => {
  test.describe('GIVEN a signed-in viewer', () => {
    test('SCENARIO: the codec page renders the player', async ({ browserName, mediaPage }): Promise<void> => {
      test.skip(browserName !== 'webkit', 'Codec only ships in WebKit');

      await test.step('WHEN the codec page is opened', (): Promise<void> => mediaPage.gotoCodec());

      await test.step('THEN the player is visible', (): Promise<void> => mediaPage.expectPlayerVisible());
    });

    test('SCENARIO: the CDN page plays the production stream', async ({ mediaPage }): Promise<void> => {
      test.skip(TARGET_ENV !== 'production', 'Only runs against production');

      await test.step('WHEN the CDN page is opened', (): Promise<void> => mediaPage.gotoCdn());

      await test.step('THEN the stream is playing', (): Promise<void> => mediaPage.expectStreamPlaying());
    });
  });
});
```

### Skip by Platform

Same shape as the conditional skip above; only the condition changes.

| Condition | Reason string | Source |
|---|---|---|
| `!IS_WINDOWS` | `'Windows only'` | `process.platform` in `playwright.const.ts` |
| `IS_CI` | `'Skipped in CI environment'` | `process.env.CI` in `playwright.const.ts` |
| `browserName === 'firefox'` | `'Firefox admin bug'` | Built-in fixture |
| `!isMobile` | `'Mobile only tests'` | Built-in fixture |

### Skip Describe Block

`test.skip` with a callback at describe level skips every test in the block when the callback returns `true`.

```ts
// e2e/admin/admin.spec.ts
import { test } from './admin.fixture';

test.describe('FEATURE: admin', () => {
  test.skip(({ browserName }): boolean => browserName === 'firefox', 'Firefox admin bug');

  test.describe('GIVEN an admin session', () => {
    test('SCENARIO: the dashboard shows the metrics panel', async ({ adminPage }): Promise<void> => {
      await test.step('WHEN the dashboard is opened', (): Promise<void> => adminPage.gotoDashboard());

      await test.step('THEN the metrics panel is visible', (): Promise<void> => adminPage.expectMetricsVisible());
    });

    test('SCENARIO: settings list the audit log', async ({ adminPage }): Promise<void> => {
      await test.step('WHEN settings are opened', (): Promise<void> => adminPage.gotoSettings());

      await test.step('THEN the audit log is listed', (): Promise<void> => adminPage.expectAuditLogVisible());
    });
  });
});
```

## Fixme & Fail Annotations

### Fixme - Known Issues

`test.fixme` skips like `test.skip` but records intent: the test is broken and tracked, not inapplicable. Put the ticket in the reason.

```ts
// e2e/reports/reports.spec.ts
import { IS_CI } from '../common/playwright.const';
import { test } from './reports.fixture';

test.describe('FEATURE: reports', () => {
  test.describe('GIVEN a generated report', () => {
    test.fixme('SCENARIO: exporting the report downloads the CSV', async ({ reportsPage }): Promise<void> => {
      await test.step('WHEN the report is exported', (): Promise<void> => reportsPage.exportCsv());

      await test.step('THEN the download completes', (): Promise<void> => reportsPage.expectDownloadComplete());
    });

    test('SCENARIO: the chart page renders the chart', async ({ reportsPage }): Promise<void> => {
      test.fixme(IS_CI, 'Investigate CI flakiness - ticket #123');

      await test.step('WHEN the chart page is opened', (): Promise<void> => reportsPage.gotoChart());

      await test.step('THEN the chart is visible', (): Promise<void> => reportsPage.expectChartVisible());
    });
  });
});
```

### Fail - Expected Failures

`test.fail()` runs the body and expects it to fail. When the bug is fixed the test passes and Playwright reports it as a failure, which is the signal to remove the annotation.

```ts
// e2e/render/render.spec.ts
import { test } from './render.fixture';

test.describe('FEATURE: render', () => {
  test.describe('GIVEN the buggy page', () => {
    test('SCENARIO: the buggy page reports a working status', async ({ renderPage }): Promise<void> => {
      test.fail();

      await test.step('WHEN the buggy page is opened', (): Promise<void> => renderPage.gotoBuggy());

      await test.step('THEN the status text reads working', (): Promise<void> => renderPage.expectStatus('Working'));
    });

    test('SCENARIO: the layout page renders the box 100px wide', async ({ browserName, renderPage }): Promise<void> => {
      test.fail(browserName === 'webkit', 'WebKit rendering bug #456');

      await test.step('WHEN the layout page is opened', (): Promise<void> => renderPage.gotoLayout());

      await test.step('THEN the box width is 100px', (): Promise<void> => renderPage.expectBoxWidth('100px'));
    });
  });
});
```

### Difference Between Skip, Fixme, Fail

| Annotation     | Runs? | Use Case                         |
| -------------- | ----- | -------------------------------- |
| `test.skip()`  | No    | Feature not applicable           |
| `test.fixme()` | No    | Known bug, needs investigation   |
| `test.fail()`  | Yes   | Expected to fail, tracking a bug |

## Slow Tests

### Mark Slow Tests

`test.slow()` triples the test timeout. The upload file is a real file under `test/fixtures/`.

```ts
// e2e/import/import.spec.ts
import { test } from './import.fixture';

const LARGE_CSV = 'e2e/import/test/fixtures/large-file.csv';

test.describe('FEATURE: data import', () => {
  test.describe('GIVEN the import page', () => {
    test.beforeEach(async ({ importPage }): Promise<void> => {
      await test.step('GIVEN the import page is open', (): Promise<void> => importPage.goto());
    });

    test('SCENARIO: importing a large file shows the completion banner', async ({ importPage }): Promise<void> => {
      test.slow();

      await test.step('WHEN the file is uploaded and imported', (): Promise<void> => importPage.importFile(LARGE_CSV));

      await test.step('THEN the completion banner is visible', (): Promise<void> => importPage.expectImportComplete());
    });

    test('SCENARIO: processing a video shows the preview', async ({ browserName, importPage }): Promise<void> => {
      test.slow(browserName === 'webkit', 'WebKit video processing is slow');

      await test.step('WHEN the sample video is processed', (): Promise<void> => importPage.processSampleVideo());

      await test.step('THEN the preview is visible', (): Promise<void> => importPage.expectPreviewVisible());
    });
  });
});
```

### Custom Timeout

`test.setTimeout(ms)` sets an exact budget for one test. `test.describe.configure({ timeout })` sets it for every test in the block.

```ts
// e2e/export/export.spec.ts
import { test } from './export.fixture';

test.describe('FEATURE: export', () => {
  test.describe.configure({ timeout: 60_000 });

  test.describe('GIVEN a large dataset', () => {
    test('SCENARIO: a full export downloads the archive', async ({ exportPage }): Promise<void> => {
      test.setTimeout(120_000);

      await test.step('WHEN the full export is started', (): Promise<void> => exportPage.startFullExport());

      await test.step('THEN the archive download completes', (): Promise<void> => exportPage.expectArchiveDownloaded());
    });
  });
});
```

## Test Steps

### Basic Steps

Every statement is a step and every step is one call. A step that would need two lines is a missing page-object method.

```ts
// e2e/checkout/checkout.spec.ts
import { test } from './checkout.fixture';
import { ADDRESS_STUB } from './test/stubs/address.stub';
import { CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: checkout', () => {
  test.describe('GIVEN a product in the catalog', () => {
    test('SCENARIO: paying the order shows the confirmation', async ({ checkoutPage, productsPage }): Promise<void> => {
      await test.step('GIVEN the first product is in the cart', (): Promise<void> => productsPage.addFirstToCart());

      await test.step('AND the checkout page is open', (): Promise<void> => productsPage.gotoCheckout());

      await test.step('WHEN shipping info is filled', (): Promise<void> => checkoutPage.fillShipping(ADDRESS_STUB));

      await test.step('AND payment is completed', (): Promise<void> => checkoutPage.pay(CARD_STUB));

      await test.step('THEN the order confirmation is visible', (): Promise<void> => checkoutPage.expectOrderConfirmed());
    });
  });
});
```

### Nested Steps

A page-object method may open its own steps for a multi-part flow. The spec calls one method; the trace shows the nested steps under it. Nesting depth is two, never three.

```ts
// e2e/register/register.spec.ts
import { test } from './register.fixture';
import { REGISTRATION_STUB } from './test/stubs/registration.stub';

test.describe('FEATURE: registration', () => {
  test.describe('GIVEN the registration page', () => {
    test.beforeEach(async ({ registerPage }): Promise<void> => {
      await test.step('GIVEN the registration page is open', (): Promise<void> => registerPage.goto());
    });

    test('SCENARIO: submitting the form shows the welcome message', async ({ registerPage }): Promise<void> => {
      await test.step('WHEN the registration form is filled', (): Promise<void> => registerPage.fillForm(REGISTRATION_STUB));

      await test.step('AND the form is submitted', (): Promise<void> => registerPage.submit());

      await test.step('THEN the welcome message is visible', (): Promise<void> => registerPage.expectWelcome());
    });
  });
});
```

### Steps with Return Values

A step returns whatever its call returns. Declare the value type on the callback.

```ts
// e2e/orders/orders.spec.ts
import { test } from './orders.fixture';

test.describe('FEATURE: orders', () => {
  test.describe('GIVEN a filled cart', () => {
    test('SCENARIO: placing the order names it on the order page', async ({ checkoutPage, orderPage }): Promise<void> => {
      const orderId = await test.step('WHEN the order is placed', (): Promise<string> => checkoutPage.placeOrder());

      await test.step('AND the order page is opened', (): Promise<void> => orderPage.goto(orderId));

      await test.step('THEN the heading names the order', (): Promise<void> => orderPage.expectHeading(`Order #${orderId}`));
    });
  });
});
```

### Step in Page Object

The page object behind the nested-steps spec. `fillForm` opens two steps; each step body is one private call. The assertion method is a boxed step so a failure points at the spec line.

```ts
// e2e/register/pages/register.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { Registration } from '../common/register.type';

export class RegisterPage {
  public readonly confirmPasswordInput: Locator;
  public readonly emailInput: Locator;
  public readonly nameInput: Locator;
  public readonly passwordInput: Locator;
  public readonly submitButton: Locator;
  public readonly welcomeText: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.confirmPasswordInput = page.getByLabel('Confirm Password');
    this.emailInput = page.getByLabel('Email');
    this.nameInput = page.getByLabel('Name');
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.submitButton = page.getByRole('button', { name: 'Register' });
    this.welcomeText = page.getByText('Welcome');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  public async fillForm(registration: Registration): Promise<void> {
    await test.step('fill personal info', (): Promise<void> => this.fillPersonalInfo(registration));

    await test.step('fill security', (): Promise<void> => this.fillSecurity(registration));
  }

  public async submit(): Promise<void> {
    await this.submitButton.click();
  }

  public async expectWelcome(): Promise<void> {
    await test.step('welcome message is visible', (): Promise<void> => expect(this.welcomeText).toBeVisible(), { box: true });
  }

  private async fillPersonalInfo(registration: Registration): Promise<void> {
    await this.nameInput.fill(registration.name);
    await this.emailInput.fill(registration.email);
  }

  private async fillSecurity(registration: Registration): Promise<void> {
    await this.passwordInput.fill(registration.password);
    await this.confirmPasswordInput.fill(registration.password);
  }
}
```

## Custom Annotations

### Add Annotations

`testInfo.annotations` is a mutable list of `{ type, description }`. Pushes sit with the other annotation calls above the first step.

```ts
// e2e/billing/billing.spec.ts
import { test } from './billing.fixture';

test.describe('FEATURE: billing', () => {
  test.describe('GIVEN an active subscription', () => {
    test('SCENARIO: the invoice page lists the latest invoice', async ({ billingPage }, testInfo): Promise<void> => {
      testInfo.annotations.push({ description: 'high', type: 'priority' });
      testInfo.annotations.push({ description: 'JIRA-123', type: 'ticket' });

      await test.step('WHEN the invoice page is opened', (): Promise<void> => billingPage.gotoInvoices());

      await test.step('THEN the latest invoice is listed', (): Promise<void> => billingPage.expectLatestInvoiceListed());
    });
  });
});
```

### Annotation Fixture

A fixture hides the `testInfo` plumbing behind named methods. It is cross-feature, so it lives next to `playwright.fixture.ts` and is merged there.

```ts
// e2e/annotations.fixture.ts
import type { TestInfo } from '@playwright/test';
import { test as base } from '@playwright/test';

type Priority = 'high' | 'low' | 'medium';

type Annotate = {
  readonly owner: (name: string) => void;
  readonly priority: (level: Priority) => void;
  readonly ticket: (id: string) => void;
};

type AnnotationFixtures = {
  readonly annotate: Annotate;
};

const annotateFor = (testInfo: TestInfo): Annotate => {
  const annotate: Annotate = {
    owner: (name: string): void => {
      testInfo.annotations.push({ description: name, type: 'owner' });
    },
    priority: (level: Priority): void => {
      testInfo.annotations.push({ description: level, type: 'priority' });
    },
    ticket: (id: string): void => {
      testInfo.annotations.push({ description: id, type: 'ticket' });
    }
  };

  return annotate;
};

export const test = base.extend<AnnotationFixtures>({
  annotate: async ({}, use, testInfo): Promise<void> => {
    await use(annotateFor(testInfo));
  }
});

export { expect } from '@playwright/test';
```

In a spec the calls read `annotate.ticket('JIRA-456')`, `annotate.priority('high')`, `annotate.owner('Alice')`, placed above the first step exactly like the direct pushes.

### Read Annotations in Reporter

A custom reporter reads `test.annotations` on every `onTestEnd`. Output through `console.log` is the reporter's product, not debug code.

```ts
// e2e/reporters/annotation.reporter.ts
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class AnnotationReporter implements Reporter {
  public onTestEnd(test: TestCase, result: TestResult): void {
    const ticket = test.annotations.find((annotation): boolean => annotation.type === 'ticket');
    const priority = test.annotations.find((annotation): boolean => annotation.type === 'priority');
    const isHighPriorityFailure = priority?.description === 'high' && result.status === 'failed';

    if (ticket) {
      console.log(`Test linked to: ${ticket.description}`);
    }

    if (isHighPriorityFailure) {
      console.log(`HIGH PRIORITY FAILURE: ${test.title}`);
    }
  }
}

export default AnnotationReporter;
```

## Conditional Annotations

### Annotation Helper

Repeated conditions become functions in a test util so the reason string is written once.

```ts
// e2e/test/utils/skip.spec.util.ts
import { test } from '@playwright/test';

import { IS_CI, TARGET_ENV } from '../../common/playwright.const';

export const skipInCi = (reason = 'Skipped in CI'): void => {
  test.skip(IS_CI, reason);
};

export const skipInBrowser = (browser: string, reason: string): void => {
  test.beforeEach(({ browserName }): void => {
    test.skip(browserName === browser, reason);
  });
};

export const onlyInEnv = (env: string): void => {
  test.skip(TARGET_ENV !== env, `Only runs in ${env}`);
};
```

```ts
// e2e/devtools/devtools.spec.ts
import { onlyInEnv, skipInCi } from '../test/utils/skip.spec.util';
import { test } from './devtools.fixture';

test.describe('FEATURE: developer tools', () => {
  test.describe('GIVEN a developer session', () => {
    test('SCENARIO: the local panel lists the disk usage', async ({ devtoolsPage }): Promise<void> => {
      skipInCi('Uses local resources');

      await test.step('WHEN the local panel is opened', (): Promise<void> => devtoolsPage.gotoLocalPanel());

      await test.step('THEN the disk usage is listed', (): Promise<void> => devtoolsPage.expectDiskUsageListed());
    });

    test('SCENARIO: the production check reports a green status', async ({ devtoolsPage }): Promise<void> => {
      onlyInEnv('production');

      await test.step('WHEN the production check is run', (): Promise<void> => devtoolsPage.runProductionCheck());

      await test.step('THEN the status is green', (): Promise<void> => devtoolsPage.expectStatus('green'));
    });
  });
});
```

### Describe-Level Conditions

A `beforeEach` that only annotates carries the condition for the whole `GIVEN`. The desktop variant flips the condition to `test.skip(isMobile, 'Desktop only tests')`.

```ts
// e2e/gallery/gallery.spec.ts
import { test } from './gallery.fixture';

test.describe('FEATURE: gallery', () => {
  test.describe('GIVEN a mobile viewport', () => {
    test.beforeEach(({ isMobile }): void => {
      test.skip(!isMobile, 'Mobile only tests');
    });

    test('SCENARIO: swiping the image shows the next image', async ({ galleryPage }): Promise<void> => {
      await test.step('WHEN the current image is swiped', (): Promise<void> => galleryPage.swipeLeft());

      await test.step('THEN the next image is shown', (): Promise<void> => galleryPage.expectImageIndex(2));
    });
  });

  test.describe('GIVEN a desktop viewport', () => {
    test.beforeEach(({ isMobile }): void => {
      test.skip(isMobile, 'Desktop only tests');
    });

    test('SCENARIO: hovering the image shows the caption', async ({ galleryPage }): Promise<void> => {
      await test.step('WHEN the current image is hovered', (): Promise<void> => galleryPage.hoverImage());

      await test.step('THEN the caption is visible', (): Promise<void> => galleryPage.expectCaptionVisible());
    });
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                | Problem                | Solution                         |
| --------------------------- | ---------------------- | -------------------------------- |
| Skipping without reason     | Hard to track why      | Always provide description       |
| Too many skipped tests      | Test debt accumulates  | Review and clean up regularly    |
| Using skip instead of fixme | Loses intent           | Use fixme for bugs, skip for N/A |
| Not using steps             | Hard to debug failures | Every statement is a one-call step |

## Related References

- **Test Tags**: See [test-tags.md](test-tags.md) for tagging and filtering tests with `--grep`
- **Test Organization**: See [test-suite-structure.md](test-suite-structure.md) for structuring tests
- **Debugging**: See [debugging.md](../debugging/debugging.md) for troubleshooting
