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
// e2e/payments/payments.e2e.ts
import { test } from './payments.fixture';
import { CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: payments', () => {
  test.skip('GIVEN a valid card, charging it lists the amount on the receipt', async ({ paymentsPage }): Promise<void> => {
    await test.step('WHEN the payments page is opened', (): Promise<void> => paymentsPage.goto());

    await test.step('AND the card is charged', (): Promise<void> => paymentsPage.charge(CARD_STUB));

    await test.step('THEN the receipt shows the amount', (): Promise<void> => paymentsPage.expectReceiptAmount(CARD_STUB.amount));
  });

  test('GIVEN a charged card, requesting a refund restores the balance', async ({ chargedPaymentsPage }): Promise<void> => {
    test.skip(true, 'Payment gateway in maintenance');

    await test.step('WHEN a refund is requested', (): Promise<void> => chargedPaymentsPage.refund(CARD_STUB));

    await test.step('THEN the balance shows the original amount', (): Promise<void> => chargedPaymentsPage.expectBalance(CARD_STUB.balance));
  });
});
```

`chargedPaymentsPage` charges `CARD_STUB` through `request`, opens the payments page, and hands over the `PaymentsPage`, so the refund test starts at its first user action.

### Conditional Skip

The condition is any boolean. Built-in fixtures (`browserName`, `isMobile`) come from the test arguments; environment facts come from `playwright.const.ts`.

```ts
// e2e/media/media.e2e.ts
import { TARGET_ENV } from '../common/playwright.const';
import { test } from './media.fixture';

test.describe('FEATURE: media playback', () => {
  test('GIVEN a WebKit browser, opening the codec page renders the player', async ({ browserName, mediaPage }): Promise<void> => {
    test.skip(browserName !== 'webkit', 'Codec only ships in WebKit');

    await test.step('WHEN the codec page is opened', (): Promise<void> => mediaPage.gotoCodec());

    await test.step('THEN the player is visible', (): Promise<void> => mediaPage.expectPlayerVisible());
  });

  test('GIVEN the production environment, opening the CDN page plays the stream', async ({ mediaPage }): Promise<void> => {
    test.skip(TARGET_ENV !== 'production', 'Only runs against production');

    await test.step('WHEN the CDN page is opened', (): Promise<void> => mediaPage.gotoCdn());

    await test.step('THEN the stream is playing', (): Promise<void> => mediaPage.expectStreamPlaying());
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

`test.skip` with a callback at describe level skips every test in the block when the callback returns `true`. Both tests start from the admin session that the admin project's `storageState` provides ([Multiple Auth States](fixtures-hooks.md#multiple-auth-states)), so both titles name it and the outcome tells them apart.

```ts
// e2e/admin/admin.e2e.ts
import { test } from './admin.fixture';

test.describe('FEATURE: admin', () => {
  test.skip(({ browserName }): boolean => browserName === 'firefox', 'Firefox admin bug');

  test('GIVEN an admin session, opening the dashboard shows the metrics panel', async ({ adminPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => adminPage.gotoDashboard());

    await test.step('THEN the metrics panel is visible', (): Promise<void> => adminPage.expectMetricsVisible());
  });

  test('GIVEN an admin session, opening settings lists the audit log', async ({ adminPage }): Promise<void> => {
    await test.step('WHEN settings are opened', (): Promise<void> => adminPage.gotoSettings());

    await test.step('THEN the audit log is listed', (): Promise<void> => adminPage.expectAuditLogVisible());
  });
});
```

## Fixme & Fail Annotations

### Fixme - Known Issues

`test.fixme` skips like `test.skip` but records intent: the test is broken and tracked, not inapplicable. Put the ticket in the reason.

```ts
// e2e/reports/reports.e2e.ts
import { IS_CI } from '../common/playwright.const';
import { test } from './reports.fixture';

test.describe('FEATURE: reports', () => {
  test.fixme('GIVEN a generated report, exporting it downloads the CSV', async ({ generatedReportPage }): Promise<void> => {
    await test.step('WHEN the report is exported', (): Promise<void> => generatedReportPage.exportCsv());

    await test.step('THEN the download completes', (): Promise<void> => generatedReportPage.expectDownloadComplete());
  });

  test('GIVEN a generated report, opening its chart renders the chart', async ({ generatedReportPage }): Promise<void> => {
    test.fixme(IS_CI, 'Investigate CI flakiness - ticket #123');

    await test.step('WHEN the chart page is opened', (): Promise<void> => generatedReportPage.gotoChart());

    await test.step('THEN the chart is visible', (): Promise<void> => generatedReportPage.expectChartVisible());
  });
});
```

`generatedReportPage` generates a report through `request`, opens it, and hands over the `ReportsPage`; both tests start from that report.

### Fail - Expected Failures

`test.fail()` runs the body and expects it to fail. When the bug is fixed the test passes and Playwright reports it as a failure, which is the signal to remove the annotation. The title's `GIVEN` names the tracked bug, the state the test starts from.

```ts
// e2e/render/render.e2e.ts
import { test } from './render.fixture';

test.describe('FEATURE: render', () => {
  test('GIVEN a known status bug, opening the buggy page reports a working status', async ({ renderPage }): Promise<void> => {
    test.fail();

    await test.step('WHEN the buggy page is opened', (): Promise<void> => renderPage.gotoBuggy());

    await test.step('THEN the status text reads working', (): Promise<void> => renderPage.expectStatus('Working'));
  });

  test('GIVEN WebKit rendering bug #456, opening the layout page renders the box 100px wide', async ({ browserName, renderPage }): Promise<void> => {
    test.fail(browserName === 'webkit', 'WebKit rendering bug #456');

    await test.step('WHEN the layout page is opened', (): Promise<void> => renderPage.gotoLayout());

    await test.step('THEN the box width is 100px', (): Promise<void> => renderPage.expectBoxWidth('100px'));
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
// e2e/import/import.e2e.ts
import { test } from './import.fixture';

const LARGE_CSV = 'e2e/import/test/fixtures/large-file.csv';

test.describe('FEATURE: data import', () => {
  test('GIVEN a large file, importing it shows the completion banner', async ({ importPage }): Promise<void> => {
    test.slow();

    await test.step('WHEN the import page is opened', (): Promise<void> => importPage.goto());

    await test.step('AND the file is uploaded and imported', (): Promise<void> => importPage.importFile(LARGE_CSV));

    await test.step('THEN the completion banner is visible', (): Promise<void> => importPage.expectImportComplete());
  });

  test('GIVEN a sample video, processing it shows the preview', async ({ browserName, importPage }): Promise<void> => {
    test.slow(browserName === 'webkit', 'WebKit video processing is slow');

    await test.step('WHEN the import page is opened', (): Promise<void> => importPage.goto());

    await test.step('AND the sample video is processed', (): Promise<void> => importPage.processSampleVideo());

    await test.step('THEN the preview is visible', (): Promise<void> => importPage.expectPreviewVisible());
  });
});
```

### Custom Timeout

`test.setTimeout(ms)` sets an exact budget for one test. `test.describe.configure({ timeout })` sets it for every test in the block.

```ts
// e2e/export/export.e2e.ts
import { test } from './export.fixture';

test.describe('FEATURE: export', () => {
  test.describe.configure({ timeout: 60_000 });

  test('GIVEN a large dataset, starting a full export downloads the archive', async ({ largeDatasetExportPage }): Promise<void> => {
    test.setTimeout(120_000);

    await test.step('WHEN the full export is started', (): Promise<void> => largeDatasetExportPage.startFullExport());

    await test.step('THEN the archive download completes', (): Promise<void> => largeDatasetExportPage.expectArchiveDownloaded());
  });
});
```

`largeDatasetExportPage` seeds the large dataset through `request`, opens the export page, and hands over the `ExportPage`. The dataset's size is why this one test gets 120 seconds.

## Test Steps

### Basic Steps

Every statement is a step and every step is one call. A step that would need two lines is a missing page-object method. There are no arrange steps: the title names the state, and a fixture or the opening call builds it.

```ts
// e2e/checkout/checkout.e2e.ts
import { test } from './checkout.fixture';
import { ADDRESS_STUB } from './test/stubs/address.stub';
import { CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: checkout', () => {
  test('GIVEN a product in the cart, paying the order shows the confirmation', async ({ filledCheckoutPage }): Promise<void> => {
    await test.step('WHEN shipping info is filled', (): Promise<void> => filledCheckoutPage.fillShipping(ADDRESS_STUB));

    await test.step('AND payment is completed', (): Promise<void> => filledCheckoutPage.payWith(CARD_STUB.number));

    await test.step('THEN the order confirmation is visible', (): Promise<void> => filledCheckoutPage.expectOrderConfirmed());
  });
});
```

`filledCheckoutPage` is a fixture that seeds one product into the cart through `request`, opens the checkout page, and hands over the `CheckoutPage`, so the spec starts at the user's first action. `CheckoutPage.payWith(cardNumber: string)` takes the card number only.

### Nested Steps

Steps never nest. Page objects, helper objects, fixtures, and utils never open a step; only the spec does, so the trace is one level deep. A multi-part flow is one page-object method of plain sequential awaits, and the spec names it in one step.

```ts
// e2e/register/register.e2e.ts
import { test } from './register.fixture';
import { REGISTRATION_STUB } from './test/stubs/registration.stub';

test.describe('FEATURE: registration', () => {
  test('GIVEN valid registration details, submitting them shows the welcome message', async ({ registerPage }): Promise<void> => {
    await test.step('WHEN the registration page is opened', (): Promise<void> => registerPage.goto());

    await test.step('AND the registration form is filled', (): Promise<void> => registerPage.fillForm(REGISTRATION_STUB));

    await test.step('AND the form is submitted', (): Promise<void> => registerPage.submit());

    await test.step('THEN the welcome message is visible', (): Promise<void> => registerPage.expectWelcome());
  });
});
```

### Steps with Return Values

A step returns whatever its call returns. Declare the value type on the callback. `filledCheckoutPage` is the ready-page fixture from [Basic Steps](#basic-steps): the cart is filled through `request` and checkout is open, so the first `WHEN` places the order.

```ts
// e2e/orders/orders.e2e.ts
import { test } from './orders.fixture';

test.describe('FEATURE: orders', () => {
  test('GIVEN a filled cart, placing the order names it on the order page', async ({ filledCheckoutPage, orderPage }): Promise<void> => {
    const orderId = await test.step('WHEN the order is placed', (): Promise<string> => filledCheckoutPage.placeOrder());

    await test.step('AND the order page is opened', (): Promise<void> => orderPage.goto(orderId));

    await test.step('THEN the heading names the order', (): Promise<void> => orderPage.expectHeading(`Order #${orderId}`));
  });
});
```

### Multi-Part Page-Object Method

The page object behind the registration spec. `fillForm` is two plain awaits of private methods, with no step of its own. `expectWelcome` is a plain `await expect(…)`; the spec's `THEN` step is the only step around it.

```ts
// e2e/register/pages/register.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

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
    await this.fillPersonalInfo(registration);
    await this.fillSecurity(registration);
  }

  public async submit(): Promise<void> {
    await this.submitButton.click();
  }

  public async expectWelcome(): Promise<void> {
    await expect(this.welcomeText).toBeVisible();
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

### Requirement Annotation

A scenario that covers a written requirement declares the requirement ID in its details object, next to any tags. A declared annotation exists before the body runs, so the HTML report shows it on skipped and fixme tests too; `testInfo.annotations.push` only lands once the body runs. One ID per scenario: a scenario that needs two IDs is two scenarios. The `annotation` detail needs Playwright 1.42+. `--grep` matches titles and tags, not annotations; add a tag when a requirement must run on its own.

A feature spec then reads as the requirement list: `FEATURE` names the feature and each test is one requirement with its ID, its `GIVEN` title naming the condition that sets it apart.

```ts
// e2e/checkout/checkout.e2e.ts
import { test } from './checkout.fixture';
import { CARD_STUB, DECLINED_CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: checkout', () => {
  test('GIVEN a valid card, paying places the order', { annotation: { description: 'CHK-1', type: 'requirement' } }, async ({ confirmationPage, filledCartPage }): Promise<void> => {
    await test.step('WHEN the order is paid', (): Promise<void> => filledCartPage.payWith(CARD_STUB));

    await test.step('THEN the confirmation shows an order number', (): Promise<void> => confirmationPage.expectOrderNumber());

    await test.step('AND the cart badge is empty', (): Promise<void> => confirmationPage.header.expectCartCount(0));
  });

  test('GIVEN a declined card, paying keeps the cart', { annotation: { description: 'CHK-2', type: 'requirement' } }, async ({ filledCartPage }): Promise<void> => {
    await test.step('WHEN the order is paid', (): Promise<void> => filledCartPage.payWith(DECLINED_CARD_STUB));

    await test.step('THEN the error banner reports the decline', (): Promise<void> => filledCartPage.expectError('Card declined'));

    await test.step('AND the cart still holds two items', (): Promise<void> => filledCartPage.header.expectCartCount(2));
  });

  test('GIVEN a guest cart, starting checkout asks for sign-in', { annotation: { description: 'CHK-3', type: 'requirement' } }, async ({ guestCartPage, signInPage }): Promise<void> => {
    await test.step('WHEN checkout is started', (): Promise<void> => guestCartPage.startCheckout());

    await test.step('THEN the sign-in page is shown', (): Promise<void> => signInPage.expectShown());
  });
});
```

`filledCartPage` has the ready-page shape of `paymentReadyPage` in [iframes.md](../browser-apis/iframes.md#iframe-fixture): it signs a user in and seeds two cart items through `request`, opens the cart, and hands over the `CartPage`. The shared state is built in that fixture, not in the UI, so the signed-in scenarios start at the payment. `guestCartPage` is the fixture from [test-suite-structure.md](test-suite-structure.md#structure): one item in a cart with no session, which makes the third scenario a guest. Starting checkout there asks for sign-in; only 'Checkout as guest' (`checkoutAsGuest()`) goes straight to shipping. `header` is a helper object both pages expose. `DECLINED_CARD_STUB` spreads `CARD_STUB` with the gateway's decline test number. The final `THEN` asserts the sign-in page rendered through its page object, not only that the URL changed.

### Add Annotations

`testInfo.annotations` is a mutable list of `{ type, description }`. Pushes sit with the other annotation calls above the first step. `subscribedBillingPage` seeds an active subscription through `request`, opens billing, and hands over the `BillingPage`.

```ts
// e2e/billing/billing.e2e.ts
import { test } from './billing.fixture';

test.describe('FEATURE: billing', () => {
  test('GIVEN an active subscription, opening the invoices lists the latest invoice', async ({ subscribedBillingPage }, testInfo): Promise<void> => {
    testInfo.annotations.push({ description: 'high', type: 'priority' });
    testInfo.annotations.push({ description: 'JIRA-123', type: 'ticket' });

    await test.step('WHEN the invoice page is opened', (): Promise<void> => subscribedBillingPage.gotoInvoices());

    await test.step('THEN the latest invoice is listed', (): Promise<void> => subscribedBillingPage.expectLatestInvoiceListed());
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

### Annotation Util

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
// e2e/devtools/devtools.e2e.ts
import { onlyInEnv, skipInCi } from '../test/utils/skip.spec.util';
import { test } from './devtools.fixture';

test.describe('FEATURE: developer tools', () => {
  test('GIVEN a local run, opening the local panel lists the disk usage', async ({ devtoolsPage }): Promise<void> => {
    skipInCi('Uses local resources');

    await test.step('WHEN the local panel is opened', (): Promise<void> => devtoolsPage.gotoLocalPanel());

    await test.step('THEN the disk usage is listed', (): Promise<void> => devtoolsPage.expectDiskUsageListed());
  });

  test('GIVEN the production environment, running the production check reports a green status', async ({ devtoolsPage }): Promise<void> => {
    onlyInEnv('production');

    await test.step('WHEN the production check page is opened', (): Promise<void> => devtoolsPage.gotoProductionCheck());

    await test.step('AND the production check is run', (): Promise<void> => devtoolsPage.runProductionCheck());

    await test.step('THEN the status is green', (): Promise<void> => devtoolsPage.expectStatus('green'));
  });
});
```

### Viewport Conditions

With no describe to scope a `beforeEach`, each scenario carries its own condition as the first statement of its body, and its title names the viewport. A `FEATURE`-level `beforeEach` that only annotates carries a condition shared by every scenario in the spec.

```ts
// e2e/gallery/gallery.e2e.ts
import { test } from './gallery.fixture';

test.describe('FEATURE: gallery', () => {
  test('GIVEN a mobile device, swiping the image shows the next image', async ({ galleryPage, isMobile }): Promise<void> => {
    test.skip(!isMobile, 'Mobile only tests');

    await test.step('WHEN the gallery is opened', (): Promise<void> => galleryPage.goto());

    await test.step('AND the current image is swiped', (): Promise<void> => galleryPage.swipeLeft());

    await test.step('THEN the next image is shown', (): Promise<void> => galleryPage.expectImageIndex(2));
  });

  test('GIVEN a desktop browser, hovering the image shows the caption', async ({ galleryPage, isMobile }): Promise<void> => {
    test.skip(isMobile, 'Desktop only tests');

    await test.step('WHEN the gallery is opened', (): Promise<void> => galleryPage.goto());

    await test.step('AND the current image is hovered', (): Promise<void> => galleryPage.hoverImage());

    await test.step('THEN the caption is visible', (): Promise<void> => galleryPage.expectCaptionVisible());
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
