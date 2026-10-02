# iFrame Testing

## Table of Contents

1. [Basic iFrame Access](#basic-iframe-access)
2. [Cross-Origin iFrames](#cross-origin-iframes)
3. [Nested iFrames](#nested-iframes)
4. [Dynamic iFrames](#dynamic-iframes)
5. [iFrame Navigation](#iframe-navigation)
6. [Shadow DOM](#shadow-dom)
7. [Common Patterns](#common-patterns)

Every sample belongs to the `checkout` feature. A `FrameLocator` is a page-object field like any other locator; specs never call `page.frameLocator` or `page.frame`.

## Basic iFrame Access

### Using frameLocator

`page.frameLocator(selector)` scopes every later `getBy*` call to the iframe's document. The selector targets the `<iframe>` element in the parent page:

| Target | Selector |
|---|---|
| By id | `page.frameLocator('iframe#payment')` |
| By name attribute | `page.frameLocator('iframe[name="checkout"]')` |
| By title | `page.frameLocator('iframe[title="Payment Form"]')` |
| By src (partial match) | `page.frameLocator('iframe[src*="stripe.com"]')` |

```ts
// e2e/checkout/pages/checkout.po.ts
import type { FrameLocator, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class CheckoutPage {
  public readonly cardNumberInput: Locator;
  public readonly confirmationText: Locator;
  public readonly payButton: Locator;
  public readonly paymentFrame: FrameLocator;
  public readonly paymentFrameElement: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.confirmationText = page.getByText('Payment complete');
    this.paymentFrame = page.frameLocator('iframe[name="checkout"]');
    this.paymentFrameElement = page.locator('iframe[name="checkout"]');
    this.cardNumberInput = this.paymentFrame.getByLabel('Card number');
    this.payButton = this.paymentFrame.getByRole('button', { name: 'Pay' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/checkout');
  }

  public async payWith(cardNumber: string): Promise<void> {
    await this.cardNumberInput.fill(cardNumber);
    await this.payButton.click();
  }

  public async expectConfirmed(): Promise<void> {
    await expect(this.confirmationText).toBeVisible();
  }

  public async expectPaymentFrameReady(): Promise<void> {
    await expect(this.payButton).toBeVisible({ timeout: 15_000 });
  }

  public async expectPaymentFrameLoaded(): Promise<void> {
    await expect(this.paymentFrameElement).toHaveAttribute('src', /loaded/);
  }
}
```

### Frame vs FrameLocator

| API | Returns | Use for |
|---|---|---|
| `page.frameLocator(selector)` | `FrameLocator` | Locator-based interaction and web-first assertions (recommended) |
| `page.frame({ name })` / `page.frame({ url })` | `Frame \| null` | Navigation (`goto`, `waitForURL`), `evaluate`, `title()` |
| `page.frames()` | `Frame[]` | Listing every frame, including the main frame |
| `page.mainFrame()` | `Frame` | The top-level document |

`page.frame` returns `null` when no frame matches, so the util guards before returning a typed value.

```ts
// e2e/checkout/test/utils/frame.spec.util.ts
import type { Frame, Page } from '@playwright/test';

import type { FrameSummary } from '../../common/checkout.type';

export const namedFrame = (page: Page, name: string): Frame => {
  const frame = page.frame({ name });

  if (!frame) throw new Error(`frame "${name}" not found`);

  return frame;
};

export const frameSummaries = (page: Page): FrameSummary[] => {
  const summaries = page.frames().map((frame: Frame): FrameSummary => {
    const summary: FrameSummary = { name: frame.name(), url: frame.url() };

    return summary;
  });

  return summaries;
};
```

```ts
// e2e/checkout/common/checkout.type.ts
export type CardDetails = {
  readonly cvc: string;
  readonly expiry: string;
  readonly number: string;
};

export type FrameSummary = {
  readonly name: string;
  readonly url: string;
};

export type WidgetOptions = {
  readonly widget?: 'mocked';
};
```

### Waiting for iFrame Content

Wait for an element inside the frame, not for the `<iframe>` element. `expectPaymentFrameReady()` above does this with a web-first `expect` and a longer timeout. A src change is a web-first attribute assertion (`expectPaymentFrameLoaded()`), not a `waitForFunction` over `document.querySelector`.

## Cross-Origin iFrames

### Accessing Cross-Origin Content

`frameLocator` works the same across origins; the only difference is timing, so the readiness assertion stays explicit. A third-party form is a helper object scoped to its `FrameLocator`.

`ThirdPartyFormHelper` has the shape of `StripeCardHelper` below: the constructor takes the `FrameLocator`, fields are `body = frame.locator('body')`, `emailInput = frame.getByRole('textbox')`, and `submitButton = frame.getByRole('button', { name: 'Submit' })`, `submitEmail(email)` fills and clicks, and `expectReady()` is a plain `toBeVisible` assertion on `body`. `CheckoutPage` exposes it as `public readonly thirdPartyForm = new ThirdPartyFormHelper(page.frameLocator('iframe[src*="third-party.com"]'))`, assigned in the constructor.

### Payment Provider iFrames (Stripe, PayPal)

Stripe renders one iframe per field, all named `__privateStripeFrame…`, so the helper takes `.first()` and locates by placeholder. Initialisation is slow; the readiness step carries a 15 s timeout.

```ts
// e2e/checkout/helpers/stripe-card.helper.ts
import type { FrameLocator, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

import type { CardDetails } from '../common/checkout.type';

export class StripeCardHelper {
  public readonly cardNumberInput: Locator;
  public readonly cvcInput: Locator;
  public readonly expiryInput: Locator;

  private readonly frame: FrameLocator;

  public constructor(frame: FrameLocator) {
    this.frame = frame;
    this.cardNumberInput = frame.locator('[placeholder="Card number"]');
    this.cvcInput = frame.locator('[placeholder="CVC"]');
    this.expiryInput = frame.locator('[placeholder="MM / YY"]');
  }

  public async fill(card: CardDetails): Promise<void> {
    await this.cardNumberInput.fill(card.number);
    await this.expiryInput.fill(card.expiry);
    await this.cvcInput.fill(card.cvc);
  }

  public async expectReady(): Promise<void> {
    await expect(this.cardNumberInput).toBeVisible({ timeout: 15_000 });
  }
}
```

`CARD_STUB` in `test/stubs/card.stub.ts` holds the `4242 4242 4242 4242` test card. The page wires `this.stripeCard = new StripeCardHelper(page.frameLocator('iframe[name*="__privateStripeFrame"]').first())`; the helper also exposes `expectCardNumber(value)` as a plain `toHaveValue` assertion. A Stripe spec opens checkout, checks `checkoutPage.stripeCard.expectReady()`, then fills `CARD_STUB` with `.fill(CARD_STUB)` as a new `WHEN` and checks `.expectCardNumber(CARD_STUB.number)`. `paymentReadyPage` is the fixture from [iFrame Fixture](#iframe-fixture): it opens checkout and asserts the payment frame is ready before the test starts.

```ts
// e2e/checkout/checkout.e2e.ts
import { test } from './checkout.fixture';
import { CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: checkout', () => {
  test('GIVEN a ready payment frame, paying with the test card shows the confirmation', async ({ paymentReadyPage }): Promise<void> => {
    await test.step('WHEN the test card is paid', (): Promise<void> => paymentReadyPage.payWith(CARD_STUB.number));

    await test.step('THEN the payment confirmation is shown', (): Promise<void> => paymentReadyPage.expectConfirmed());
  });
});
```

### Handling OAuth in iFrames

When a provider renders its form in an iframe instead of a popup, the login page owns the frame as `oauthFrame = page.frameLocator('iframe[src*="accounts.google.com"]')` and exposes `startGoogleSignIn()` (click the provider button), `fillOauthEmail(email)` (fill `oauthFrame.getByLabel('Email')`), `expectOauthFormReady()` (`toBeVisible({ timeout: 10_000 })` on that label), and `expectOauthEmail(email)` (`toHaveValue` on that label). The spec is `WHEN goto()`, `AND startGoogleSignIn()`, `THEN expectOauthFormReady()`, then a new phase: `WHEN fillOauthEmail('test@gmail.com')`, `THEN expectOauthEmail('test@gmail.com')`.

## Nested iFrames

### Accessing Nested Frames

`FrameLocator.frameLocator()` chains, one call per nesting level. Each intermediate frame is its own field so the chain reads top-down. The `widget*` members serve [Dynamic iFrames](#dynamic-iframes).

```ts
// e2e/checkout/pages/widget.po.ts
import type { FrameLocator, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { WidgetOptions } from '../common/checkout.type';
import { widgetMock } from '../test/mocks/widget.mock';

export class WidgetPage {
  public readonly deepContent: Locator;
  public readonly innerFrame: FrameLocator;
  public readonly openWidgetButton: Locator;
  public readonly outerFrame: FrameLocator;
  public readonly submitButton: Locator;
  public readonly widgetFrame: FrameLocator;
  public readonly widgetHeading: Locator;
  public readonly widgetLoadedText: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.outerFrame = page.frameLocator('#outer-frame');
    this.innerFrame = this.outerFrame.frameLocator('#inner-frame');
    this.deepContent = this.innerFrame.frameLocator('#level3').getByText('Deep content');
    this.submitButton = this.innerFrame.getByRole('button', { name: 'Submit' });
    this.openWidgetButton = page.getByRole('button', { name: 'Open Widget' });
    this.widgetFrame = page.frameLocator('#widget-frame');
    this.widgetHeading = this.widgetFrame.getByRole('heading');
    this.widgetLoadedText = this.widgetFrame.getByText('Widget Loaded');
  }

  public async goto(options: WidgetOptions = {}): Promise<void> {
    if (options.widget === 'mocked') await this.page.route('**/embedded-widget**', widgetMock());
    await this.page.goto('/dashboard');
  }

  public async submit(): Promise<void> {
    await this.submitButton.click();
  }

  public async openWidget(): Promise<void> {
    await this.openWidgetButton.click();
  }

  public async expectWidgetLoaded(): Promise<void> {
    await expect(this.widgetLoadedText).toBeVisible();
  }

  public async expectWidgetHeading(text: string): Promise<void> {
    await expect(this.widgetHeading).toHaveText(text);
  }
}
```

### Finding Elements Across Frame Hierarchy

When the owning frame is unknown, a util checks the main page and then every frame once. It returns `null` rather than throwing so the spec step can decide.

```ts
// e2e/checkout/test/utils/any-frame.spec.util.ts
import type { Locator, Page } from '@playwright/test';

export const locatorInAnyFrame = async (page: Page, selector: string): Promise<Locator | null> => {
  const mainLocator = page.locator(selector);
  const mainCount = await mainLocator.count();

  if (mainCount > 0) return mainLocator;

  for (const frame of page.frames()) {
    const frameLocator = frame.locator(selector);
    const count = await frameLocator.count();

    if (count > 0) return frameLocator;
  }

  return null;
};
```

## Dynamic iFrames

### iFrames Created at Runtime

Avoid waiting for the `<iframe>` element:

```ts avoid
await page.getByRole('button', { name: 'Open Widget' }).click();
await page.waitForSelector('iframe#widget-frame');
const widgetFrame = page.frameLocator('#widget-frame');
await expect(widgetFrame.getByText('Widget Loaded')).toBeVisible();
```

Prefer a web-first assertion on content inside the frame; `frameLocator` waits for the frame to attach on its own, so `WidgetPage.expectWidgetLoaded()` needs no wait for the `<iframe>` element.

```ts
// e2e/checkout/widget.e2e.ts
import { test } from './checkout.fixture';

test.describe('FEATURE: dashboard widget', () => {
  test('GIVEN the live widget document, opening the widget reports it loaded', async ({ widgetPage }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => widgetPage.goto());

    await test.step('AND the widget is opened', (): Promise<void> => widgetPage.openWidget());

    await test.step('THEN the widget frame shows Widget Loaded', (): Promise<void> => widgetPage.expectWidgetLoaded());
  });
});
```

### iFrames with Changing src

A multi-step frame reloads between steps. `MultiStepPage` exposes `goto()`, `next()` (click Next inside the frame), and `expectStep(label)` (`toBeVisible({ timeout: 10_000 })` on `frame.getByText(label)`); the spec alternates phases: `WHEN goto()`, `THEN expectStep('Step 1')`, `WHEN next()`, `THEN expectStep('Step 2')`, `WHEN next()`, `THEN expectStep('Step 3')`.

### Lazy-Loaded iFrames

Scrolling triggers the load. `LazyFramePage` owns `lazyFrame = page.frameLocator('#lazy-iframe')` and `lazyFrameBody = lazyFrame.locator('body')`; `scrollToBottom()` runs `page.evaluate` on a named `(): void => { window.scrollTo(0, document.body.scrollHeight); }` function, and `expectLazyFrameLoaded()` is a plain `expect(this.lazyFrameBody).not.toBeEmpty({ timeout: 15_000 })`, so the assertion waits for content rather than for the `<iframe>` element.

## iFrame Navigation

### Navigating Within iFrame

Navigation and URL waits need a `Frame`, not a `FrameLocator`. `namedFrame` (from `frame.spec.util.ts` above) resolves it; the page object wraps the navigation so the spec step stays one call.

```ts
// e2e/checkout/pages/content-frame.po.ts
import type { Frame, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { namedFrame } from '../test/utils/frame.spec.util';

export class ContentFramePage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async goto(): Promise<void> {
    await this.page.goto('/app');
  }

  public contentFrame(): Frame {
    return namedFrame(this.page, 'content-frame');
  }

  public async openPage2(): Promise<void> {
    const frame = this.contentFrame();

    await frame.goto('https://embedded-app.com/page2');
    await frame.waitForURL('**/page2');
  }

  public async expectFrameHeading(text: string): Promise<void> {
    const frame = this.contentFrame();
    const heading = frame.getByRole('heading');

    await expect(heading).toHaveText(text);
  }
}
```

### Handling Frame Navigation Events

`page.on('framenavigated')` fires for every frame; `frame.parentFrame()` is `null` for the main frame, so the listener keeps only child-frame URLs. The listener is attached in a fixture so it exists before the first navigation.

```ts
// e2e/checkout/test/utils/frame-navigations.spec.util.ts
import type { Frame, Page } from '@playwright/test';

export const recordFrameNavigations = (page: Page): string[] => {
  const navigations: string[] = [];

  page.on('framenavigated', (frame: Frame): void => {
    const isChildFrame = frame.parentFrame() !== null;

    if (isChildFrame) navigations.push(frame.url());
  });

  return navigations;
};
```

```ts
// e2e/checkout/frame-navigation.e2e.ts
import { expect, test } from './checkout.fixture';

test.describe('FEATURE: frame navigation', () => {
  test('GIVEN a frame navigation recorder, moving the content frame to page 2 records it', async ({ contentFramePage, frameNavigations }): Promise<void> => {
    await test.step('WHEN the page with the content frame is opened', (): Promise<void> => contentFramePage.goto());

    await test.step('AND the frame navigates to page 2', (): Promise<void> => contentFramePage.openPage2());

    await test.step('THEN a page2 navigation was recorded', (): void => expect(frameNavigations).toContainEqual(expect.stringContaining('page2')));
  });
});
```

## Shadow DOM

Unlike a frame, a shadow root needs no `frameLocator`. Every `getBy*` and CSS locator pierces open shadow roots, so a page-object field such as `page.getByRole('button', { name: 'Pay' })` reaches a button inside `<card-widget>`.

| Root or selector | Pierced |
|---|---|
| Open shadow root, `getBy*` or CSS | Yes |
| Nested open shadow roots | Yes |
| XPath (`locator('xpath=…')`) | No |
| Closed shadow root (`attachShadow({ mode: 'closed' })`) | No |

A closed root is usually a third-party widget. Force it open before any page script runs: an init script wraps `Element.prototype.attachShadow` and rewrites the mode. The function runs in the browser, so it lives in a util and closes over nothing.

```ts
// e2e/checkout/test/utils/open-shadow-roots.spec.util.ts
export const openShadowRoots = (): void => {
  const attachShadow = Element.prototype.attachShadow;

  const attachOpen = function (this: Element, init: ShadowRootInit): ShadowRoot {
    const openInit: ShadowRootInit = { ...init, mode: 'open' };

    return attachShadow.call(this, openInit);
  };

  Element.prototype.attachShadow = attachOpen;
};
```

The feature fixture runs `await page.addInitScript(openShadowRoots);` before `use`, so every page object in the feature sees the widget's internals as open shadow DOM. The script changes what the app runs; keep it to specs that must reach into a widget you do not own, and test your own components through their public surface.

## Common Patterns

### iFrame Fixture

The fixture navigates, asserts readiness through the page object, and hands the spec a `CheckoutPage` whose `paymentFrame` field is already loaded. It returns the page object, not the raw `FrameLocator`, so the spec keeps calling intent methods. `frameNavigations` attaches the listener before any `goto`.

```ts
// e2e/checkout/checkout.fixture.ts
import { test as base } from '@playwright/test';

import { CheckoutPage } from './pages/checkout.po';
import { ContentFramePage } from './pages/content-frame.po';
import { WidgetPage } from './pages/widget.po';
import { recordFrameNavigations } from './test/utils/frame-navigations.spec.util';

type CheckoutFixtures = {
  readonly checkoutPage: CheckoutPage;
  readonly contentFramePage: ContentFramePage;
  readonly frameNavigations: string[];
  readonly paymentReadyPage: CheckoutPage;
  readonly widgetPage: WidgetPage;
};

export const test = base.extend<CheckoutFixtures>({
  checkoutPage: async ({ page }, use): Promise<void> => {
    await use(new CheckoutPage(page));
  },
  contentFramePage: async ({ page }, use): Promise<void> => {
    await use(new ContentFramePage(page));
  },
  frameNavigations: async ({ page }, use): Promise<void> => {
    await use(recordFrameNavigations(page));
  },
  paymentReadyPage: async ({ checkoutPage }, use): Promise<void> => {
    await checkoutPage.goto();
    await checkoutPage.expectPaymentFrameReady();
    await use(checkoutPage);
  },
  widgetPage: async ({ page }, use): Promise<void> => {
    await use(new WidgetPage(page));
  }
});

export { expect } from '@playwright/test';
```

`loginPage`, `multiStepPage`, and `lazyFramePage` join the same `test.extend` with the `new <Page>(page)` shape.

### Debugging iFrame Issues

`frameSummaries(page)` (from `frame.spec.util.ts`) returns every frame's name and URL as typed data; attach it to the report with `test.info().attach('frames', { body: JSON.stringify(summaries), contentType: 'application/json' })` instead of `console.log`. A frame body screenshot is `frame.locator('body').screenshot({ path })`; a frame's markup is `frameLocator.locator('body').innerHTML()`. Both belong in a page-object method used only while debugging.

### Handling iFrame Load Failures

Avoid a `try`/`catch` that resets `iframe.src` and retries the assertion:

```ts avoid
try {
  await expect(frame.getByRole('button')).toBeVisible({ timeout: 5000 });
} catch {
  await page.evaluate(() => { document.querySelector('#unreliable-frame').src += ''; });
  await expect(frame.getByRole('button')).toBeVisible({ timeout: 10000 });
}
```

Prefer one web-first assertion with the timeout the frame needs (`expectPaymentFrameReady()` uses 15 s). A frame that fails to load on its own is an app or third-party defect: fix it, or mock the frame document as shown next so the test stops depending on it.

### Mocking iFrame Content

A route mock fulfils the iframe's `src` request with a static document. The document is static sample content, so it is an on-disk fixture at `e2e/checkout/test/fixtures/widget/index.html`, never a string in the mock. `route.fulfill` reads the file itself when given a `path` and infers `Content-Type` from the extension, so there is no read util and no `contentType` to keep in sync.

```ts
// e2e/checkout/test/mocks/widget.mock.ts
import { resolve } from 'node:path';

import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';

const WIDGET_PATH = resolve(import.meta.dirname, '../fixtures/widget/index.html');

export const widgetMock = (path: string = WIDGET_PATH): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ path });
};
```

`WidgetPage.goto({ widget: 'mocked' })` (above) routes `'**/embedded-widget**'` to `widgetMock()` before it navigates. `#widget-frame` exists only after `openWidget()`, so the route waits in place until `'AND the widget is opened'` creates the frame and its document request hits the mock; no step routes. The mocked case keeps the steps of the widget spec above, with `'GIVEN a mocked widget document, …'` as its title, and its `THEN` is `widgetPage.expectWidgetHeading('Mocked Widget')`, a plain `toHaveText` on `widgetHeading`.

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|---|---|---|
| Using `page.frame()` for interactions | Less reliable than frameLocator | Use `page.frameLocator()` for element interactions |
| Hardcoding iframe index | Fragile if DOM order changes | Use name, id, or src attribute selectors |
| Not waiting for iframe load | Race conditions | Web-first `expect` on an element inside the iframe |
| `waitForSelector('iframe')` | Waits for the element, not its content | `frameLocator` plus `expect` on inner content |
| Assuming same-origin | Cross-origin has different timing | Always wait for iframe content explicitly |
| Ignoring nested iframes | Element not found | Chain frameLocator calls for nested frames |
| `page.frameLocator` in a spec | Spec knows the DOM | `FrameLocator` field on the page object |
| XPath into a web component | XPath does not pierce shadow roots | `getBy*` or CSS, which pierce open roots |

## Related References

- **Locators**: See [locators.md](../core/locators.md) for selector strategies
- **Third-party services**: See [third-party.md](../advanced/third-party.md) for payment iframe patterns
- **Debugging**: See [debugging.md](../debugging/debugging.md) for troubleshooting iframe issues
