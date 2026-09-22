# Mobile & Responsive Testing

## Table of Contents

1. [Device Emulation](#device-emulation)
2. [Touch Gestures](#touch-gestures)
3. [Viewport Testing](#viewport-testing)
4. [Mobile-Specific UI](#mobile-specific-ui)
5. [Responsive Breakpoints](#responsive-breakpoints)

## Device Emulation

### Use Built-in Devices

`devices` ships viewport, scale factor, user agent, `isMobile`, and `hasTouch` for named phones and tablets. Each project spreads one descriptor; the project list is a named const above `defineConfig`.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const desktopChrome = { ...devices['Desktop Chrome'] };
const mobileSafari = { ...devices['iPhone 14'] };
const mobileChrome = { ...devices['Pixel 7'] };
const tablet = { ...devices['iPad Pro 11'] };

const projects = [
  { name: 'Desktop Chrome', use: desktopChrome },
  { name: 'Mobile Safari', use: mobileSafari },
  { name: 'Mobile Chrome', use: mobileChrome },
  { name: 'Tablet', use: tablet }
];

export default defineConfig({
  projects,
  testDir: './e2e'
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
  test('SCENARIO: opening the home page shows the mobile layout', async ({ homePage }): Promise<void> => {
    await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

    await test.step('THEN the mobile layout is shown', (): Promise<void> => homePage.expectMobileLayout());
  });
});
```

### Test Across Multiple Devices

To run one case on several devices inside a single project, loop over device names and give each iteration its own `describe` with `test.use`. The describe title stays constant; the device name goes in the test title so the full path is unique.

```ts
// e2e/checkout/checkout-devices.e2e.ts
import { devices } from '@playwright/test';

import { test } from './checkout.fixture';

const MOBILE_DEVICES = ['iPhone 14', 'Pixel 7', 'Galaxy S21'];

test.describe('FEATURE: checkout on mobile devices', () => {
  for (const deviceName of MOBILE_DEVICES) {
    test.describe('GIVEN a mobile device', () => {
      test.use({ ...devices[deviceName] });

      test(`SCENARIO: opening the checkout on ${deviceName} shows the pay button`, async ({ checkoutPage }): Promise<void> => {
        await test.step('WHEN the checkout opens', (): Promise<void> => checkoutPage.goto());

        await test.step('THEN the pay button is visible', (): Promise<void> => checkoutPage.expectPayButton());
      });
    });
  }
});
```

## Touch Gestures

### Tap

`locator.tap()` is `click()` for touch devices and needs `hasTouch: true` on the context. The page object owns the call: `GalleryPage.tapFirstPhoto()` is `this.firstPhoto.tap()` on `getByRole('img', { name: 'Photo 1' })`; `expectLightboxOpen()` is a boxed step asserting the `dialog` visible.

```ts
// e2e/gallery/gallery.e2e.ts
import { test } from './gallery.fixture';

test.use({ hasTouch: true });

test.describe('FEATURE: gallery', () => {
  test('SCENARIO: tapping a photo opens the lightbox', async ({ galleryPage }): Promise<void> => {
    await test.step('GIVEN the gallery is open', (): Promise<void> => galleryPage.goto());

    await test.step('WHEN the first photo is tapped', (): Promise<void> => galleryPage.tapFirstPhoto());

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
  test('SCENARIO: swiping a message left reveals the delete button', async ({ inboxPage, swipe }): Promise<void> => {
    await test.step('GIVEN the inbox is open', (): Promise<void> => inboxPage.goto());

    await test.step('WHEN the first message is swiped left', (): Promise<void> => swipe(inboxPage.firstMessage, 'left'));

    await test.step('THEN the delete button is visible', (): Promise<void> => inboxPage.expectDeleteButton());
  });
});
```

### Long Press

A long press is a pointer held down for a duration. `locator.click({ delay })` holds the button down for `delay` milliseconds before releasing, which is the native way to express the hold without `waitForTimeout`. Apps that listen for `touchstart` rather than pointer events need `dispatchEvent('touchstart')` followed by the delayed release instead.

```ts
// e2e/files/pages/files.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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
    await test.step('context menu is open', (): Promise<void> => expect(this.contextMenu).toBeVisible(), { box: true });
  }
}
```

### Pinch Zoom

Playwright has no native pinch. Most map and image widgets treat ctrl+wheel as pinch, so the page object dispatches a `wheel` event with `ctrlKey: true` and a negative `deltaY` on the zoomable element; `locator.dispatchEvent` builds the `WheelEvent` for the given init. When the widget exposes a zoom API on `window`, calling it through `page.evaluate` is the other route.

```ts
// e2e/map/pages/map.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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
    await test.step(`map is at zoom level ${level}`, (): Promise<void> => expect(this.map).toHaveAttribute('data-zoom', String(level)), { box: true });
  }
}
```

## Viewport Testing

### Test Different Sizes

Viewports are named consts in `common/home.const.ts`. A branch on width inside a test is two cases, so the spec splits them into two `GIVEN` groups and loops inside each.

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
  test.describe('GIVEN a viewport under 768px', () => {
    for (const viewport of NARROW_VIEWPORTS) {
      test(`SCENARIO: opening the home page at ${viewport.name} shows the menu button`, async ({ homePage, page }): Promise<void> => {
        await test.step(`GIVEN the viewport is ${viewport.name}`, (): Promise<void> => page.setViewportSize(viewport));

        await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

        await test.step('THEN the menu button is visible', (): Promise<void> => homePage.expectMenuButton());
      });
    }
  });

  test.describe('GIVEN a viewport of 768px or wider', () => {
    for (const viewport of WIDE_VIEWPORTS) {
      test(`SCENARIO: opening the home page at ${viewport.name} shows the nav links`, async ({ homePage, page }): Promise<void> => {
        await test.step(`GIVEN the viewport is ${viewport.name}`, (): Promise<void> => page.setViewportSize(viewport));

        await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

        await test.step('THEN the products link is visible', (): Promise<void> => homePage.expectProductsLink());
      });
    }
  });
});
```

`Viewport` is `{ readonly height: number; readonly name: string; readonly width: number }`; `setViewportSize` ignores the extra `name`.

### Dynamic Viewport Changes

Resizing mid-test verifies the layout reacts without a reload. Each layout has one boxed `expect*` method on the page object.

```ts
// e2e/dashboard/dashboard-resize.e2e.ts
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from '../home/common/home.const';
import { test } from './dashboard.fixture';

test.describe('FEATURE: dashboard layout', () => {
  test('SCENARIO: shrinking the viewport to mobile collapses the sidebar into the menu', async ({ dashboardPage, page }): Promise<void> => {
    await test.step('GIVEN the viewport is desktop', (): Promise<void> => page.setViewportSize(DESKTOP_VIEWPORT));

    await test.step('AND the dashboard is open', (): Promise<void> => dashboardPage.goto());

    await test.step('AND the sidebar is visible', (): Promise<void> => dashboardPage.expectDesktopLayout());

    await test.step('WHEN the viewport shrinks to mobile', (): Promise<void> => page.setViewportSize(MOBILE_VIEWPORT));

    await test.step('THEN the sidebar is hidden and the menu button is visible', (): Promise<void> => dashboardPage.expectMobileLayout());
  });
});
```

`expectMobileLayout` holds two boxed steps: `expect(this.sidebar).toBeHidden()` and `expect(this.menuButton).toBeVisible()`.

## Mobile-Specific UI

### Hamburger Menu

The navigation drawer is a page object: `menuButton` (`getByRole('button', { name: 'Menu' })`), the `nav` landmark, and `productsLink` scoped inside it (`this.nav.getByRole('link', { name: 'Products' })`). `goto()` opens `/`; `openMenu()` and `goToProducts()` click; `expectMenuOpen()` and `expectMenuClosed()` are boxed steps on `nav` visible or hidden. The spec pins the mobile viewport with `test.use`.

```ts
// e2e/home/mobile-nav.e2e.ts
import { MOBILE_VIEWPORT } from './common/home.const';
import { expect, test } from './home.fixture';

test.use({ viewport: MOBILE_VIEWPORT });

test.describe('FEATURE: mobile navigation', () => {
  test('SCENARIO: following a drawer link changes the page and closes the drawer', async ({ mobileNavPage, page }): Promise<void> => {
    await test.step('GIVEN the home page is open', (): Promise<void> => mobileNavPage.goto());

    await test.step('AND the menu is open', (): Promise<void> => mobileNavPage.openMenu());

    await test.step('AND the navigation drawer is shown', (): Promise<void> => mobileNavPage.expectMenuOpen());

    await test.step('WHEN the products link is followed', (): Promise<void> => mobileNavPage.goToProducts());

    await test.step('THEN the products url is shown', (): Promise<void> => expect(page).toHaveURL('/products'));

    await test.step('AND the navigation drawer is closed', (): Promise<void> => mobileNavPage.expectMenuClosed());
  });
});
```

### Bottom Sheet

The sheet is a `dialog`; its controls are locators scoped to it. Choosing a size and confirming is one user intent, so one method.

```ts
// e2e/product/pages/product.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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

  public async goto(id: string): Promise<void> {
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
    await test.step('bottom sheet is open', (): Promise<void> => expect(this.sheet).toBeVisible(), { box: true });
  }

  public async expectAddedToast(): Promise<void> {
    await test.step('added-to-cart toast is shown', (): Promise<void> => expect(this.toast).toHaveText('Added to cart'), { box: true });
  }
}
```

The spec pins `MOBILE_VIEWPORT`, then steps through `goto('123')`, `addToCart()`, `expectSheetOpen()`, `confirmSize('Large')`, `expectAddedToast()`.

### Pull to Refresh

A pull is a drag from near the top of the feed downwards. The refresh indicator appearing and then disappearing is the observable outcome, so the page object asserts both in sequence.

```ts
// e2e/feed/pages/feed.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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
    await test.step('refresh indicator appears', (): Promise<void> => expect(this.loading).toBeVisible(), { box: true });

    await test.step('refresh indicator disappears', (): Promise<void> => expect(this.loading).toBeHidden(), { box: true });
  }
}
```

The spec is `goto()`, `pullToRefresh()`, `expectRefreshed()` under `test.use({ hasTouch: true })`. To assert new content, read the first item's text through a `firstItemText(): Promise<string>` method before and after the pull and compare in a step.

## Responsive Breakpoints

### Test All Breakpoints

Breakpoints split into the two groups the header renders differently, so no test branches on width. `header.e2e.ts` has the shape of `home-viewports.e2e.ts` above with a different loop source and `THEN`; `HeaderPage` holds `menuButton` (`getByTestId('mobile-menu-button')`) and `desktopNav` (`getByTestId('desktop-nav')`) with a boxed `expect*` per layout, each with its two assertions.

```ts
// e2e/home/common/breakpoints.const.ts
export const NARROW_BREAKPOINTS: Record<string, number> = { sm: 640, xs: 320 };

export const WIDE_BREAKPOINTS: Record<string, number> = { '2xl': 1536, lg: 1024, md: 768, xl: 1280 };
```

| Spec | Loop | `GIVEN` | `THEN` |
|---|---|---|---|
| `header.e2e.ts`, `GIVEN a breakpoint under md` | `Object.entries(NARROW_BREAKPOINTS)` | `page.setViewportSize({ height: HEIGHT, width })` | `headerPage.expectMobileHeader()` |
| `header.e2e.ts`, `GIVEN a breakpoint of md or wider` | `Object.entries(WIDE_BREAKPOINTS)` | same | `headerPage.expectDesktopHeader()` |
| `home-visual.e2e.ts` | `SIZES: Viewport[]` of the three viewports | `page.setViewportSize(viewport)` | `` expect(page).toHaveScreenshot(`homepage-${viewport.name}.png`) `` |

### Visual Regression at Breakpoints

One screenshot per viewport, named after the viewport, so a diff names the breakpoint that moved; the last table row above is the whole spec.

## Anti-Patterns to Avoid

| Anti-Pattern                | Problem                   | Solution                         |
| --------------------------- | ------------------------- | -------------------------------- |
| Only testing one viewport   | Misses responsive bugs    | Test multiple breakpoints        |
| Ignoring touch events       | Features broken on mobile | Test tap, swipe, long press      |
| Hardcoded viewport in tests | Can't test multiple sizes | Use `page.setViewportSize()`     |
| Not testing orientation     | Landscape bugs missed     | Test both portrait and landscape |

## Related References

- **Visual Testing**: See [test-suite-structure.md](../core/test-suite-structure.md) for screenshot testing
- **Locators**: See [locators.md](../core/locators.md) for mobile-friendly selectors
- **Browser APIs**: See [browser-apis.md](../browser-apis/browser-apis.md) for permissions (camera, geolocation, notifications)
- **Canvas/Touch**: See [canvas-webgl.md](../testing-patterns/canvas-webgl.md) for touch gestures on canvas elements
