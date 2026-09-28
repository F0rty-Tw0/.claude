# Mobile & Responsive Testing

## Table of Contents

1. [Device Emulation](#device-emulation)
2. [Touch Gestures](#touch-gestures)
3. [Viewport Testing](#viewport-testing)
4. [Mobile-Specific UI](#mobile-specific-ui)
5. [Responsive Breakpoints](#responsive-breakpoints)

## Device Emulation

### Use Built-in Devices

`devices` ships viewport, scale factor, user agent, `isMobile`, and `hasTouch` for named phones and tablets. Each project spreads one descriptor; the project list is a named const above `defineConfig`. The desktop and tablet projects ignore `*-devices.e2e.ts` specs, so a phone-only spec takes that suffix and runs on the two phone projects alone.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const PHONE_ONLY_SPECS = '**/*-devices.e2e.ts';

const desktopChrome = { ...devices['Desktop Chrome'] };
const mobileSafari = { ...devices['iPhone 14'] };
const mobileChrome = { ...devices['Pixel 7'] };
const tablet = { ...devices['iPad Pro 11'] };

const projects = [
  { name: 'Desktop Chrome', testIgnore: PHONE_ONLY_SPECS, use: desktopChrome },
  { name: 'Mobile Safari', use: mobileSafari },
  { name: 'Mobile Chrome', use: mobileChrome },
  { name: 'Tablet', testIgnore: PHONE_ONLY_SPECS, use: tablet }
];

export default defineConfig({
  projects,
  testMatch: '**/*.@(e2e|test).ts'
});
```

### Custom Device Configuration

A device that is not in the catalogue is a plain options object passed to `test.use` at the top of the spec. `viewport` is its own const because it is a nested object.

```ts
// e2e/home/home-custom-device.e2e.ts
import { test } from './home.fixture';

const CUSTOM_VIEWPORT = { height: 844, width: 390 };

const CUSTOM_DEVICE = {
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  viewport: CUSTOM_VIEWPORT
};

test.use(CUSTOM_DEVICE);

test.describe('FEATURE: home on a custom device', () => {
  test('GIVEN a mobile device, opening the home page shows the mobile layout', async ({ homePage }): Promise<void> => {
    await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

    await test.step('THEN the mobile layout is shown', (): Promise<void> => homePage.expectMobileLayout());
  });
});
```

### Test Across Multiple Devices

A device is fixed when the context is created, and a spec is flat, so one case on several devices is one project per device, as in [Use Built-in Devices](#use-built-in-devices), not a loop of describes with `test.use`. The spec stays flat and device-free; the report prefixes each result with the project name, so the device name never goes in the title. The `-devices.e2e.ts` suffix matches the `testIgnore` on the desktop and tablet projects, so this spec runs on the two phone projects only, where its `GIVEN a mobile device` holds.

```ts
// e2e/checkout/checkout-devices.e2e.ts
import { test } from './checkout.fixture';

test.describe('FEATURE: checkout on mobile devices', () => {
  test('GIVEN a mobile device, opening the checkout shows the pay button', async ({ checkoutPage }): Promise<void> => {
    await test.step('WHEN the checkout opens', (): Promise<void> => checkoutPage.goto());

    await test.step('THEN the pay button is visible', (): Promise<void> => checkoutPage.expectPayButton());
  });
});
```

## Touch Gestures

### Tap

`locator.tap()` is `click()` for touch devices and needs `hasTouch: true` on the context. The page object owns the call: `GalleryPage.tapFirstPhoto()` is `this.firstPhoto.tap()` on `getByRole('img', { name: 'Photo 1' })`; `expectLightboxOpen()` is one plain `expect` on the `dialog` being visible.

```ts
// e2e/gallery/gallery.e2e.ts
import { test } from './gallery.fixture';

test.use({ hasTouch: true });

test.describe('FEATURE: gallery', () => {
  test('GIVEN a touch screen, tapping the first photo opens the lightbox', async ({ galleryPage }): Promise<void> => {
    await test.step('WHEN the gallery is opened', (): Promise<void> => galleryPage.goto());

    await test.step('AND the first photo is tapped', (): Promise<void> => galleryPage.tapFirstPhoto());

    await test.step('THEN the lightbox is open', (): Promise<void> => galleryPage.expectLightboxOpen());
  });
});
```

### Swipe

Playwright's `touchscreen` exposes only `tap`, so a swipe is a drag: `locator.dragTo(locator, { sourcePosition, targetPosition })` with both positions relative to the element's box. The util computes start and end from the element's centre and a direction vector.

```ts
// e2e/carousel/test/utils/swipe.spec.util.ts
import type { Locator } from '@playwright/test';

import type { Point, SwipeDirection } from '../../common/carousel.type';

const DISTANCE = 100;

const DOWN: Point = { x: 0, y: 1 };
const LEFT: Point = { x: -1, y: 0 };
const RIGHT: Point = { x: 1, y: 0 };
const UP: Point = { x: 0, y: -1 };

const VECTORS: Record<SwipeDirection, Point> = { down: DOWN, left: LEFT, right: RIGHT, up: UP };

export const swipe = async (element: Locator, direction: SwipeDirection): Promise<void> => {
  const box = await element.boundingBox();

  if (!box) throw new Error('element is not visible');

  const vector = VECTORS[direction];
  const centerX = box.width / 2;
  const centerY = box.height / 2;
  const sourcePosition: Point = { x: centerX - vector.x * DISTANCE, y: centerY - vector.y * DISTANCE };
  const targetPosition: Point = { x: centerX + vector.x * DISTANCE, y: centerY + vector.y * DISTANCE };

  await element.dragTo(element, { sourcePosition, targetPosition });
};
```

`Point` is `{ readonly x: number; readonly y: number }` and `SwipeDirection` is `'down' | 'left' | 'right' | 'up'` in `common/carousel.type.ts`. A carousel page object calls `swipe(this.carousel, 'left')` from `swipeLeft()` and asserts the next slide in `expectSlide(2)`.

### Swipe Fixture

When several page objects swipe, expose the util as a fixture so the spec can swipe any page-object locator.

```ts
// e2e/inbox/inbox.fixture.ts
import type { Locator } from '@playwright/test';
import { test as base } from '@playwright/test';

import type { SwipeDirection } from '../carousel/common/carousel.type';
import { swipe } from '../carousel/test/utils/swipe.spec.util';
import { InboxPage } from './pages/inbox.page';

type Swipe = (element: Locator, direction: SwipeDirection) => Promise<void>;

type InboxFixtures = {
  readonly inboxPage: InboxPage;
  readonly swipe: Swipe;
};

export const test = base.extend<InboxFixtures>({
  inboxPage: async ({ page }, use): Promise<void> => {
    await use(new InboxPage(page));
  },
  swipe: async ({}, use): Promise<void> => {
    await use(swipe);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/inbox/inbox.e2e.ts
import { test } from './inbox.fixture';

test.use({ hasTouch: true });

test.describe('FEATURE: inbox', () => {
  test('GIVEN an inbox message, swiping it left reveals the delete button', async ({ inboxPage, swipe }): Promise<void> => {
    await test.step('WHEN the inbox is opened', (): Promise<void> => inboxPage.goto());

    await test.step('AND the first message is swiped left', (): Promise<void> => swipe(inboxPage.firstMessage, 'left'));

    await test.step('THEN the delete button is visible', (): Promise<void> => inboxPage.expectDeleteButton());
  });
});
```

### Long Press

A long press is a pointer held down for a duration. `locator.click({ delay })` holds the button down for `delay` milliseconds before releasing, which is the native way to express the hold without `waitForTimeout`. Apps that listen for `touchstart` rather than pointer events need `dispatchEvent('touchstart')` followed by the delayed release instead.

```ts
// e2e/files/pages/files.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const LONG_PRESS_MS = 500;

export class FilesPage {
  public readonly contextMenu: Locator;
  public readonly firstFile: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.contextMenu = page.getByRole('menu');
    this.firstFile = page.getByText('document.pdf');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/files');
  }

  public async longPressFirstFile(): Promise<void> {
    await this.firstFile.click({ delay: LONG_PRESS_MS });
  }

  public async expectContextMenu(): Promise<void> {
    await expect(this.contextMenu).toBeVisible();
  }
}
```

### Pinch Zoom

Playwright has no native pinch. Most map and image widgets treat ctrl+wheel as pinch, so the page object dispatches a `wheel` event with `ctrlKey: true` and a negative `deltaY` on the zoomable element; `locator.dispatchEvent` builds the `WheelEvent` for the given init. When the widget exposes a zoom API on `window`, calling it through `page.evaluate` is the other route.

```ts
// e2e/map/pages/map.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const ZOOM_IN_WHEEL = { ctrlKey: true, deltaY: -100 };

export class MapPage {
  public readonly map: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.map = page.locator('#map');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/map');
  }

  public async pinchZoomIn(): Promise<void> {
    await this.map.dispatchEvent('wheel', ZOOM_IN_WHEEL);
  }

  public async expectZoomLevel(level: number): Promise<void> {
    await expect(this.map).toHaveAttribute('data-zoom', String(level));
  }
}
```

## Viewport Testing

### Test Different Sizes

Viewports are named consts in `common/home.const.ts`. A branch on width inside a test is two cases, so the spec has two loops, one per layout. The title names the viewport, and the opening call applies it: `HomeOptions` gains `viewport?: ViewportSize`, and `HomePage.goto({ viewport })` runs `page.setViewportSize(viewport)` before it navigates, so no step only resizes.

```ts
// e2e/home/common/home.const.ts
import type { Viewport } from './home.type';

export const MOBILE_VIEWPORT: Viewport = { height: 667, name: 'mobile', width: 375 };
export const TABLET_VIEWPORT: Viewport = { height: 1024, name: 'tablet', width: 768 };
export const DESKTOP_VIEWPORT: Viewport = { height: 1080, name: 'desktop', width: 1920 };

export const NARROW_VIEWPORTS: Viewport[] = [MOBILE_VIEWPORT];
export const WIDE_VIEWPORTS: Viewport[] = [TABLET_VIEWPORT, DESKTOP_VIEWPORT];
```

```ts
// e2e/home/home-viewports.e2e.ts
import { test } from './home.fixture';
import { NARROW_VIEWPORTS, WIDE_VIEWPORTS } from './common/home.const';

test.describe('FEATURE: navigation', () => {
  for (const viewport of NARROW_VIEWPORTS) {
    test(`GIVEN a ${viewport.name} viewport, opening the home page shows the menu button`, async ({ homePage }): Promise<void> => {
      await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto({ viewport }));

      await test.step('THEN the menu button is visible', (): Promise<void> => homePage.expectMenuButton());
    });
  }

  for (const viewport of WIDE_VIEWPORTS) {
    test(`GIVEN a ${viewport.name} viewport, opening the home page shows the nav links`, async ({ homePage }): Promise<void> => {
      await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto({ viewport }));

      await test.step('THEN the products link is visible', (): Promise<void> => homePage.expectProductsLink());
    });
  }
});
```

`Viewport` is `{ readonly height: number; readonly name: string; readonly width: number }`; `setViewportSize` ignores the extra `name`.

### Dynamic Viewport Changes

Resizing mid-test verifies the layout reacts without a reload. `DashboardOptions`, declared in [network-advanced.md](network-advanced.md#mock-by-operation-name), gains `viewport?: ViewportSize`, so `DashboardPage.goto({ viewport })` sets the starting size before it navigates. The resize after the first check is a user action, so it starts a new phase: `WHEN the viewport shrinks to mobile`, then its own `THEN`. Each layout has one `expect*` method on the page object.

```ts
// e2e/dashboard/dashboard-resize.e2e.ts
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from '../home/common/home.const';
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard layout', () => {
  test('GIVEN a desktop viewport, shrinking it to mobile collapses the sidebar into the menu', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('WHEN the dashboard is opened', (): Promise<void> => dashboardPage.goto({ viewport: DESKTOP_VIEWPORT }));

    await test.step('THEN the sidebar is visible', (): Promise<void> => dashboardPage.expectDesktopLayout());

    await test.step('WHEN the viewport shrinks to mobile', (): Promise<void> => page.setViewportSize(MOBILE_VIEWPORT));

    await test.step('THEN the sidebar is hidden and the menu button is visible', (): Promise<void> => dashboardPage.expectMobileLayout());
  });
});
```

`expectMobileLayout` holds two plain assertions, no step around them: `expect(this.sidebar).toBeHidden()` and `expect(this.menuButton).toBeVisible()`.

## Mobile-Specific UI

### Hamburger Menu

The navigation drawer is a page object, `MobileNavPage`: `menuButton` (`getByRole('button', { name: 'Menu' })`), the `nav` landmark, and `productsLink` scoped inside it (`this.nav.getByRole('link', { name: 'Products' })`). `goto(options?)` takes the same `viewport` option as `HomePage` and applies it before it opens `/`; `openMenu()` and `goToProducts()` click; `expectMenuOpen()` and `expectMenuClosed()` are plain `expect` calls on `nav` visible or hidden. The viewport can change at runtime, so the spec passes it to the opening call rather than pinning it with `test.use`.

```ts
// e2e/home/mobile-nav.e2e.ts
import { MOBILE_VIEWPORT } from './common/home.const';
import { expect, test } from './home.fixture';

test.describe('FEATURE: mobile navigation', () => {
  test('GIVEN a mobile viewport, following a drawer link opens its page and closes the drawer', async ({ mobileNavPage, page }): Promise<void> => {
    await test.step('WHEN the home page is opened', (): Promise<void> => mobileNavPage.goto({ viewport: MOBILE_VIEWPORT }));

    await test.step('AND the menu is opened', (): Promise<void> => mobileNavPage.openMenu());

    await test.step('THEN the navigation drawer is shown', (): Promise<void> => mobileNavPage.expectMenuOpen());

    await test.step('WHEN the products link is followed', (): Promise<void> => mobileNavPage.goToProducts());

    await test.step('THEN the products url is shown', (): Promise<void> => expect(page).toHaveURL('/products'));

    await test.step('AND the navigation drawer is closed', (): Promise<void> => mobileNavPage.expectMenuClosed());
  });
});
```

### Bottom Sheet

The sheet is a `dialog`; its controls are locators scoped to it. Choosing a size and confirming is one user intent, so one method. `ProductOptions` is `{ readonly viewport?: ViewportSize }` in `common/product.type.ts`.

```ts
// e2e/product/pages/product.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { ProductOptions } from '../common/product.type';

export class ProductPage {
  public readonly addToCartButton: Locator;
  public readonly confirmButton: Locator;
  public readonly sheet: Locator;
  public readonly sizeSelect: Locator;
  public readonly toast: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
    this.sheet = page.getByRole('dialog');
    this.confirmButton = this.sheet.getByRole('button', { name: 'Confirm' });
    this.sizeSelect = this.sheet.getByRole('combobox', { name: 'Size' });
    this.toast = page.getByRole('status');
  }

  public async goto(id: string, options: ProductOptions = {}): Promise<void> {
    if (options.viewport) await this.page.setViewportSize(options.viewport);

    await this.page.goto(`/product/${id}`);
  }

  public async addToCart(): Promise<void> {
    await this.addToCartButton.click();
  }

  public async confirmSize(size: string): Promise<void> {
    await this.sizeSelect.selectOption(size);
    await this.confirmButton.click();
  }

  public async expectSheetOpen(): Promise<void> {
    await expect(this.sheet).toBeVisible();
  }

  public async expectAddedToast(): Promise<void> {
    await expect(this.toast).toHaveText('Added to cart');
  }
}
```

The spec's title is `'GIVEN a mobile viewport, confirming a size in the sheet adds the product'`. Its steps are two phases: `WHEN` `goto('123', { viewport: MOBILE_VIEWPORT })`, `AND` `addToCart()`, `THEN` `expectSheetOpen()`; then `WHEN` `confirmSize('Large')`, `THEN` `expectAddedToast()`.

### Pull to Refresh

A pull is a drag from near the top of the feed downwards. The refresh indicator appearing and then disappearing is the observable outcome, so the page object asserts both in sequence.

```ts
// e2e/feed/pages/feed.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const PULL_START = { x: 187, y: 50 };
const PULL_END = { x: 187, y: 200 };

export class FeedPage {
  public readonly feed: Locator;
  public readonly loading: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.feed = page.getByTestId('feed');
    this.loading = page.getByTestId('loading');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/feed');
  }

  public async pullToRefresh(): Promise<void> {
    await this.feed.dragTo(this.feed, { sourcePosition: PULL_START, targetPosition: PULL_END });
  }

  public async expectRefreshed(): Promise<void> {
    await expect(this.loading).toBeVisible();
    await expect(this.loading).toBeHidden();
  }
}
```

The spec is `goto()` (`WHEN`), `pullToRefresh()` (`AND`), `expectRefreshed()` (`THEN`) under `test.use({ hasTouch: true })`; touch support is fixed when the context is created, so it stays a file-level `test.use`. To assert new content, an `AND` step checks the first item against the text the refreshed feed serves, `expectFirstItem(text)`; no step reads the text to compare in a later one.

## Responsive Breakpoints

### Test All Breakpoints

Breakpoints split into the two groups the header renders differently, so no test branches on width. `header.e2e.ts` has the shape of `home-viewports.e2e.ts` above with a different loop source and `THEN`; `HeaderPage` holds `menuButton` (`getByTestId('mobile-menu-button')`) and `desktopNav` (`getByTestId('desktop-nav')`) with one `expect*` per layout, each holding its two plain assertions. Its `goto(options?)` takes the same `viewport` option as `HomePage`.

```ts
// e2e/home/common/breakpoints.const.ts
export const BREAKPOINT_HEIGHT = 800;

export const NARROW_BREAKPOINTS: Record<string, number> = { sm: 640, xs: 320 };

export const WIDE_BREAKPOINTS: Record<string, number> = { '2xl': 1536, lg: 1024, md: 768, xl: 1280 };
```

| Spec | Loop | Opening call (`WHEN`) | `THEN` |
|---|---|---|---|
| `header.e2e.ts`, narrow loop, title names the breakpoint | `Object.entries(NARROW_BREAKPOINTS)` | `headerPage.goto({ viewport })` with `const viewport: ViewportSize = { height: BREAKPOINT_HEIGHT, width }` above the steps | `headerPage.expectMobileHeader()` |
| `header.e2e.ts`, wide loop, title names the breakpoint | `Object.entries(WIDE_BREAKPOINTS)` | same | `headerPage.expectDesktopHeader()` |
| `home-visual.e2e.ts` | `SIZES: Viewport[]` of the three viewports | `homePage.goto({ viewport })` | `` expect(page).toHaveScreenshot(`homepage-${viewport.name}.png`) `` |

### Visual Regression at Breakpoints

One screenshot per viewport, named after the viewport, so a diff names the breakpoint that moved; the last table row above is the whole spec.

## Anti-Patterns to Avoid

| Anti-Pattern                | Problem                   | Solution                                          |
| --------------------------- | ------------------------- | ------------------------------------------------- |
| Only testing one viewport   | Misses responsive bugs    | Test multiple breakpoints                         |
| Ignoring touch events       | Features broken on mobile | Test tap, swipe, long press                       |
| Hardcoded viewport in tests | Can't test multiple sizes | Pass it to the opening call, `goto({ viewport })` |
| Not testing orientation     | Landscape bugs missed     | Test both portrait and landscape                  |

## Related References

- **Visual Testing**: See [test-suite-structure.md](../core/test-suite-structure.md) for screenshot testing
- **Locators**: See [locators.md](../core/locators.md) for mobile-friendly selectors
- **Browser APIs**: See [browser-apis.md](../browser-apis/browser-apis.md) for permissions (camera, geolocation, notifications)
- **Canvas/Touch**: See [canvas-webgl.md](../testing-patterns/canvas-webgl.md) for touch gestures on canvas elements
