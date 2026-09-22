# Vue and Nuxt Testing

## Table of Contents

1. [Commands](#commands)
2. [Configuration](#configuration)
3. [Patterns](#patterns)
4. [Vue vs Nuxt Differences](#vue-vs-nuxt-differences)
5. [Component Testing Dependencies](#component-testing-dependencies)
6. [Testing v-model](#testing-v-model)
7. [Capturing Vue Warnings](#capturing-vue-warnings)
8. [Anti-Patterns](#anti-patterns)

> **When to use**: Testing Vue 3 applications with composition API, Pinia stores, Vue Router, Nuxt 3 apps, Teleport portals, and transitions.
> **Prerequisites**: [house-style.md](../core/house-style.md), [configuration.md](../core/configuration.md), [locators.md](../core/locators.md)

## Commands

```bash
npm init playwright@latest
npm install -D @playwright/experimental-ct-vue
npx playwright test
npx playwright test -c playwright-ct.config.ts
```

## Configuration

### Vue with Vite

`CI` is read once, here. In CI the web server runs the production build through `vite preview`; locally it reuses a running `npm run dev`.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);
const BASE_URL = 'http://localhost:5173';

const use = { baseURL: BASE_URL, screenshot: 'only-on-failure', trace: 'on-first-retry' } as const;

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'mobile', use: devices['iPhone 14'] }
];

const webServer = {
  command: IS_CI ? 'npm run build && npx vite preview --port 5173' : 'npm run dev',
  reuseExistingServer: !IS_CI,
  timeout: 120_000,
  url: BASE_URL
};

export default defineConfig({
  forbidOnly: IS_CI,
  fullyParallel: true,
  projects,
  retries: IS_CI ? 2 : 0,
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  use,
  webServer,
  workers: IS_CI ? '50%' : undefined
});
```

### Nuxt 3

Nuxt serves on port 3000 and needs `nuxi build` before `nuxi preview`. Public runtime config reaches the server through `webServer.env`.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);
const BASE_URL = 'http://localhost:3000';

const use = { baseURL: BASE_URL, screenshot: 'only-on-failure', trace: 'on-first-retry' } as const;

const projects = [{ name: 'chromium', use: devices['Desktop Chrome'] }];

const webServerEnv = { NUXT_PUBLIC_API_BASE: `${BASE_URL}/api` };

const webServer = {
  command: IS_CI ? 'npx nuxi build && npx nuxi preview' : 'npx nuxi dev',
  env: webServerEnv,
  reuseExistingServer: !IS_CI,
  timeout: 120_000,
  url: BASE_URL
};

export default defineConfig({
  forbidOnly: IS_CI,
  fullyParallel: true,
  projects,
  retries: IS_CI ? 2 : 0,
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  use,
  webServer
});
```

### Component Testing

```ts
// e2e/playwright-ct.config.ts
import { defineConfig, devices } from '@playwright/experimental-ct-vue';

const use = { ctPort: 3100, trace: 'on-first-retry' } as const;

const projects = [{ name: 'chromium', use: devices['Desktop Chrome'] }];

export default defineConfig({
  projects,
  testDir: './e2e',
  testMatch: '**/*.ct.ts',
  use
});
```

## Patterns

### Component Testing with Experimental CT

**Use when**: Testing complex interactive Vue components in isolation (data tables, form components, custom dropdowns).

**Avoid when**: Component depends heavily on Pinia stores, Vue Router, or backend data. Use E2E tests instead.

`mount` returns a `Locator` rooted at the component. A component object wraps that root so the spec never queries it directly.

```ts
// e2e/stepper/components/stepper.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/experimental-ct-vue';

export class StepperComponent {
  public readonly decrementButton: Locator;
  public readonly incrementButton: Locator;

  private readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.decrementButton = root.getByRole('button', { name: '-' });
    this.incrementButton = root.getByRole('button', { name: '+' });
  }

  public async increment(): Promise<void> {
    await this.incrementButton.click();
  }

  public async expectValue(value: number): Promise<void> {
    await test.step(`value reads ${value}`, (): Promise<void> => expect(this.root.getByText(`Value: ${value}`)).toBeVisible(), { box: true });
  }
}
```

A test util owns the `mount` call so each case is one step. `StepperProps` and `StepperListeners` are named types in `common/stepper.type.ts`.

```ts
// e2e/stepper/test/utils/stepper-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-vue';

import Stepper from '@/components/Stepper.vue';

import type { StepperListeners, StepperProps } from '../../common/stepper.type';
import { StepperComponent } from '../../components/stepper.component';

type Mount = ComponentFixtures['mount'];

export const mountStepper = async (mount: Mount, props: StepperProps, on?: StepperListeners): Promise<StepperComponent> => {
  const root = await mount(Stepper, { on, props });

  return new StepperComponent(root);
};
```

```ts
// e2e/stepper/stepper.ct.ts
import { expect, test } from '@playwright/experimental-ct-vue';

import type { StepperListeners } from './common/stepper.type';
import type { StepperComponent } from './components/stepper.component';
import { mountStepper } from './test/utils/stepper-mount.spec.util';

test.describe('FEATURE: stepper', () => {
  test.describe('GIVEN a mounted stepper', () => {
    test('clicking + increments the value', async ({ mount }): Promise<void> => {
      const stepper = await test.step('GIVEN a stepper mounted at 0', (): Promise<StepperComponent> => mountStepper(mount, { value: 0 }));

      await test.step('WHEN + is clicked', (): Promise<void> => stepper.increment());

      await test.step('THEN the value reads 1', (): Promise<void> => stepper.expectValue(1));
    });

    test('clicking + twice emits change with each value', async ({ mount }): Promise<void> => {
      const changes: number[] = [];
      const listeners: StepperListeners = { change: (value: number): number => changes.push(value) };
      const stepper = await test.step('GIVEN a stepper mounted at 10 with a change listener', (): Promise<StepperComponent> => mountStepper(mount, { value: 10 }, listeners));

      await test.step('WHEN + is clicked', (): Promise<void> => stepper.increment());

      await test.step('AND + is clicked again', (): Promise<void> => stepper.increment());

      await test.step('THEN change was emitted with 11 then 12', (): void => expect(changes).toEqual([11, 12]));
    });
  });
});
```

| `mount` option | Purpose | Example value |
|---|---|---|
| `props` | Component props | `{ value: 0 }` |
| `on` | Emitted-event listeners | `{ change: recordChange }` |
| `slots` | Slot content as HTML strings | `{ default: '<span class="label">Quantity</span>' }` |
| `hooksConfig` | Data passed to `beforeMount` hooks | `{ routes }` |

### Pinia Store Testing Through UI

**Use when**: Verifying Pinia stores produce correct UI behavior. If the UI is correct, the store is correct.

**Avoid when**: Testing pure store logic with no UI side effect. Use unit tests with Vitest.

The page object owns every locator, including the list-item filter that finds a product row.

```ts
// e2e/shop/pages/shop.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ShopPage {
  public readonly cartBadge: Locator;
  public readonly cartLink: Locator;
  public readonly products: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.cartBadge = page.getByTestId('cart-badge');
    this.cartLink = page.getByRole('link', { name: 'Cart' });
    this.products = page.getByRole('listitem');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/shop');
  }

  public async addToCart(name: string): Promise<void> {
    await this.products.filter({ hasText: name }).getByRole('button', { name: 'Add' }).click();
  }

  public async openCart(): Promise<void> {
    await this.cartLink.click();
    await this.page.waitForURL('/cart');
  }

  public async reload(): Promise<void> {
    await this.page.reload();
  }

  public async expectBadge(count: number): Promise<void> {
    await test.step(`cart badge reads ${count}`, (): Promise<void> => expect(this.cartBadge).toHaveText(String(count)), { box: true });
  }
}
```

```ts
// e2e/shop/shop.fixture.ts
import { test as base } from '@playwright/test';

import { CartPage } from './pages/cart.page';
import { ShopPage } from './pages/shop.page';

type ShopFixtures = {
  readonly cartPage: CartPage;
  readonly shopPage: ShopPage;
};

export const test = base.extend<ShopFixtures>({
  cartPage: async ({ page }, use): Promise<void> => {
    await use(new CartPage(page));
  },
  shopPage: async ({ page }, use): Promise<void> => {
    await use(new ShopPage(page));
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/shop/shop.spec.ts
import { test } from './shop.fixture';

test.describe('FEATURE: shopping cart store', () => {
  test.describe('GIVEN an empty cart on the shop page', () => {
    test.beforeEach(async ({ shopPage }): Promise<void> => {
      await test.step('GIVEN the shop is open', (): Promise<void> => shopPage.goto());

      await test.step('AND the badge reads 0', (): Promise<void> => shopPage.expectBadge(0));
    });

    test('adding two products counts both on the badge', async ({ shopPage }): Promise<void> => {
      await test.step('WHEN the hoodie is added', (): Promise<void> => shopPage.addToCart('Hoodie'));

      await test.step('AND the cap is added', (): Promise<void> => shopPage.addToCart('Cap'));

      await test.step('THEN the badge reads 2', (): Promise<void> => shopPage.expectBadge(2));
    });

    test('adding two products lists both on the cart page', async ({ cartPage, shopPage }): Promise<void> => {
      await test.step('WHEN the hoodie is added', (): Promise<void> => shopPage.addToCart('Hoodie'));

      await test.step('AND the cap is added', (): Promise<void> => shopPage.addToCart('Cap'));

      await test.step('AND the cart is opened', (): Promise<void> => shopPage.openCart());

      await test.step('THEN both products are listed', (): Promise<void> => cartPage.expectItems(['Hoodie', 'Cap']));
    });

    test('reloading the page keeps the persisted state', async ({ shopPage }): Promise<void> => {
      await test.step('GIVEN the hoodie is in the cart', (): Promise<void> => shopPage.addToCart('Hoodie'));

      await test.step('WHEN the page reloads', (): Promise<void> => shopPage.reload());

      await test.step('THEN the badge reads 1', (): Promise<void> => shopPage.expectBadge(1));
    });
  });
});
```

### Vue Router Navigation

**Use when**: Testing client-side routing, navigation guards, URL parameters, browser history.

A client-side navigation keeps the document; a full load replaces it. The page object stamps an attribute on `<html>` before the click and asserts it is still there after, which proves the router handled the link.

```ts
// e2e/navigation/pages/home.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const SPA_MARKER = 'data-spa-session';

export class HomePage {
  public readonly contactLink: Locator;
  public readonly root: Locator;
  public readonly shopLink: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.contactLink = page.getByRole('link', { name: 'Contact' });
    this.root = page.locator('html');
    this.shopLink = page.getByRole('link', { name: 'Shop' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/');
  }

  public async markSpaSession(): Promise<void> {
    await this.root.evaluate((html: HTMLElement, marker: string): void => html.setAttribute(marker, 'on'), SPA_MARKER);
  }

  public async openShop(): Promise<void> {
    await this.shopLink.click();
    await this.page.waitForURL('/shop');
  }

  public async openContact(): Promise<void> {
    await this.contactLink.click();
    await this.page.waitForURL('/contact');
  }

  public async goBack(): Promise<void> {
    await this.page.goBack();
  }

  public async goForward(): Promise<void> {
    await this.page.goForward();
  }

  public async expectSpaSessionKept(): Promise<void> {
    await test.step('spa marker survives navigation', (): Promise<void> => expect(this.root).toHaveAttribute(SPA_MARKER, 'on'), { box: true });
  }
}
```

```ts
// e2e/navigation/navigation.spec.ts
import { expect, test } from './navigation.fixture';

test.describe('FEATURE: router navigation', () => {
  test.describe('GIVEN the home page is open', () => {
    test.beforeEach(async ({ homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());
    });

    test('following a router link keeps the document', async ({ homePage }): Promise<void> => {
      await test.step('AND the session is marked', (): Promise<void> => homePage.markSpaSession());

      await test.step('WHEN the shop link is followed', (): Promise<void> => homePage.openShop());

      await test.step('THEN the marker is still present', (): Promise<void> => homePage.expectSpaSessionKept());
    });

    test('going back and forward replays history', async ({ homePage, page }): Promise<void> => {
      await test.step('AND the shop link is followed', (): Promise<void> => homePage.openShop());

      await test.step('AND the contact link is followed', (): Promise<void> => homePage.openContact());

      await test.step('WHEN the browser goes back', (): Promise<void> => homePage.goBack());

      await test.step('THEN the url is the shop', (): Promise<void> => expect(page).toHaveURL(/\/shop/));

      await test.step('WHEN the browser goes back again', (): Promise<void> => homePage.goBack());

      await test.step('THEN the url is the root', (): Promise<void> => expect(page).toHaveURL(/\/$/));

      await test.step('WHEN the browser goes forward', (): Promise<void> => homePage.goForward());

      await test.step('THEN the url is the shop again', (): Promise<void> => expect(page).toHaveURL(/\/shop/));
    });
  });

  test.describe('GIVEN no session', () => {
    test('opening an admin url redirects to login', async ({ adminPage, page }): Promise<void> => {
      await test.step('WHEN the admin dashboard is opened', (): Promise<void> => adminPage.goto());

      await test.step('THEN the url is the login page', (): Promise<void> => expect(page).toHaveURL(/\/login/));

      await test.step('AND the login heading is shown', (): Promise<void> => adminPage.expectLoginHeading());
    });
  });
});
```

The remaining router cases follow the same shape with one page object each:

| Case | Page object call | Assertion |
|---|---|---|
| Dynamic route param | `itemsPage.gotoItem(99)` | `itemsPage.expectHeading('Item #99')` |
| Query params drive state | `itemsPage.gotoFiltered('price', 'clothing')` then `itemsPage.sortBy('name')` | `expect(page).toHaveURL(/sort=name/)` |
| Catch-all 404 | `notFoundPage.goto('/nonexistent-page')` | `notFoundPage.expectHeading('Not Found')` |

### Teleport Components

**Use when**: Testing components rendered via `<Teleport>` (modals, notifications, overlay menus).

Teleported nodes land elsewhere in the document but are ordinary DOM. A page object exposes the overlay as a locator and scopes its buttons to it.

```ts
// e2e/items/pages/items.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ItemsPage {
  public readonly confirmDialog: Locator;
  public readonly removeButtons: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.confirmDialog = page.getByRole('dialog', { name: 'Confirm' });
    this.removeButtons = page.getByRole('button', { name: 'Remove' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/items');
  }

  public async removeFirst(): Promise<void> {
    await this.removeButtons.first().click();
  }

  public async cancelRemoval(): Promise<void> {
    await this.confirmDialog.getByRole('button', { name: 'Cancel' }).click();
  }

  public async expectDialogOpen(): Promise<void> {
    await test.step('confirm dialog is visible', (): Promise<void> => expect(this.confirmDialog).toBeVisible(), { box: true });
  }

  public async expectDialogClosed(): Promise<void> {
    await test.step('confirm dialog is hidden', (): Promise<void> => expect(this.confirmDialog).toBeHidden(), { box: true });
  }
}
```

```ts
// e2e/items/items.spec.ts
import { test } from './items.fixture';

test.describe('FEATURE: teleported dialog', () => {
  test.describe('GIVEN the items page', () => {
    test.beforeEach(async ({ itemsPage }): Promise<void> => {
      await test.step('GIVEN the items page is open', (): Promise<void> => itemsPage.goto());
    });

    test('remove opens the dialog and cancel closes it', async ({ itemsPage }): Promise<void> => {
      await test.step('WHEN remove is clicked on the first item', (): Promise<void> => itemsPage.removeFirst());

      await test.step('THEN the dialog is open', (): Promise<void> => itemsPage.expectDialogOpen());

      await test.step('WHEN the removal is cancelled', (): Promise<void> => itemsPage.cancelRemoval());

      await test.step('THEN the dialog is closed', (): Promise<void> => itemsPage.expectDialogClosed());
    });
  });
});
```

| Teleported widget | Action | Assertion |
|---|---|---|
| Notification that auto-dismisses | `profilePage.update()` | `expectAlert('Saved')` then `expect(alert).toBeHidden({ timeout: 10_000 })` inside a boxed step |
| Dropdown closing on outside click | `homePage.openMenu()` then `homePage.clickOutside()` (`body.click({ position: { x: 10, y: 10 } })`) | `expect(menu).toBeHidden()` |

### Transitions and Animations

**Use when**: Verifying `<Transition>` and `<TransitionGroup>` work correctly. Focus on end state, not animation details.

Web-first assertions wait through enter and leave transitions, so a test asserts the end state only. For faster runs a util injects a style tag that zeroes every duration; it must run after `goto`, because a style tag added to `about:blank` is lost on navigation.

```ts
// e2e/tasks/test/utils/animations.spec.util.ts
import type { Page } from '@playwright/test';

const NO_ANIMATION_CSS = [
  '*, *::before, *::after {',
  '  animation-duration: 0s !important;',
  '  animation-delay: 0s !important;',
  '  transition-duration: 0s !important;',
  '  transition-delay: 0s !important;',
  '}'
].join('\n');

export const disableAnimations = async (page: Page): Promise<void> => {
  await page.addStyleTag({ content: NO_ANIMATION_CSS });
};
```

```ts
// e2e/tasks/tasks.spec.ts
import { test } from './tasks.fixture';
import { disableAnimations } from './test/utils/animations.spec.util';

test.describe('FEATURE: task list transitions', () => {
  test.describe('GIVEN the task list', () => {
    test.beforeEach(async ({ page, tasksPage }): Promise<void> => {
      await test.step('GIVEN the task list is open', (): Promise<void> => tasksPage.goto());

      await test.step('AND animations are disabled', (): Promise<void> => disableAnimations(page));
    });

    test('adding a task lists it', async ({ tasksPage }): Promise<void> => {
      await test.step('WHEN a task is added', (): Promise<void> => tasksPage.add('Write tests'));

      await test.step('THEN the task is listed', (): Promise<void> => tasksPage.expectTask('Write tests'));
    });

    test('removing a task drops it from the list', async ({ tasksPage }): Promise<void> => {
      await test.step('GIVEN a task is added', (): Promise<void> => tasksPage.add('Temp item'));

      await test.step('AND the task is listed', (): Promise<void> => tasksPage.expectTask('Temp item'));

      await test.step('WHEN the task is removed', (): Promise<void> => tasksPage.remove('Temp item'));

      await test.step('THEN the task is gone', (): Promise<void> => tasksPage.expectNoTask('Temp item'));
    });
  });
});
```

`TasksPage` owns `add(title)` (fill the `Task` textbox, click `Add`), `remove(title)` (filter the list item, click its `Remove`), and boxed `expectTask` / `expectNoTask`.

### Composition API Components

**Use when**: Testing components with `<script setup>` or `setup()`. From Playwright's perspective, Composition API and Options API are identical.

```ts
// e2e/pricing/pricing.spec.ts
import { test } from './pricing.fixture';

test.describe('FEATURE: pricing calculator', () => {
  test.describe('GIVEN the pricing page', () => {
    test.beforeEach(async ({ pricingPage }): Promise<void> => {
      await test.step('GIVEN the pricing page is open', (): Promise<void> => pricingPage.goto());
    });

    test('changing amount, quantity, and discount updates the computed sum', async ({ pricingPage }): Promise<void> => {
      await test.step('WHEN amount 50 and quantity 4 are entered', (): Promise<void> => pricingPage.enterOrder(50, 4));

      await test.step('THEN the sum reads $200.00', (): Promise<void> => pricingPage.expectSum('$200.00'));

      await test.step('WHEN a 20 discount is entered', (): Promise<void> => pricingPage.enterDiscount(20));

      await test.step('THEN the sum reads $160.00', (): Promise<void> => pricingPage.expectSum('$160.00'));
    });
  });
});
```

Every reactive primitive is asserted the same way, through what it renders:

| Primitive | Action | Assertion |
|---|---|---|
| `computed` | `pricingPage.enterOrder(50, 4)` | `expectSum('$200.00')` |
| `watch` | `preferencesPage.selectLocale('de')` | `expectHeading('Einstellungen')` |
| Composable with debounce | `shopPage.typeSearch('hoodie')` (`pressSequentially` with `delay: 50`) | `expectResultCount(2)` and `expectResult('Black Hoodie')` |
| `provide` / `inject` | `homePage.toggleDarkTheme()` | `expect(body).toHaveClass(/dark/)` inside a boxed step |

### Nuxt-Specific Patterns

**Use when**: Testing Nuxt 3 with SSR, auto-imports, server routes, and middleware.

Server routes are tested through the `request` fixture. A util owns the call and returns the typed body; the `Item` type lives in `common/posts.type.ts`.

```ts
// e2e/posts/test/utils/items-api.spec.util.ts
import type { APIRequestContext } from '@playwright/test';

import type { Item } from '../../common/posts.type';

export const fetchItems = async (request: APIRequestContext): Promise<Item[]> => {
  const response = await request.get('/api/items');
  const items: Item[] = await response.json();

  return items;
};
```

```ts
// e2e/posts/posts.spec.ts
import type { Item } from './common/posts.type';
import { expect, test } from './posts.fixture';
import { fetchItems } from './test/utils/items-api.spec.util';

test.describe('FEATURE: nuxt posts', () => {
  test.describe('GIVEN the posts page', () => {
    test('server rendering delivers ten articles with content', async ({ postsPage }): Promise<void> => {
      await test.step('WHEN the posts page opens', (): Promise<void> => postsPage.goto());

      await test.step('THEN ten articles are rendered', (): Promise<void> => postsPage.expectArticleCount(10));

      await test.step('AND the first article has text', (): Promise<void> => postsPage.expectFirstArticleText(/\w+/));
    });

    test('following a NuxtLink keeps the document', async ({ homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      await test.step('AND the session is marked', (): Promise<void> => homePage.markSpaSession());

      await test.step('WHEN the posts link is followed', (): Promise<void> => homePage.openPosts());

      await test.step('THEN the marker is still present', (): Promise<void> => homePage.expectSpaSessionKept());
    });

    test('opening a post sets the title and description through useHead', async ({ page, postsPage }): Promise<void> => {
      await test.step('WHEN the hello-world post is opened', (): Promise<void> => postsPage.gotoPost('hello-world'));

      await test.step('THEN the title names the post', (): Promise<void> => expect(page).toHaveTitle(/Hello World/));

      await test.step('AND the description is at least 50 characters', (): Promise<void> => postsPage.expectDescriptionLength(50));
    });
  });

  test.describe('GIVEN the items server route', () => {
    test('requesting the route returns items with ids', async ({ request }): Promise<void> => {
      const items = await test.step('WHEN the items are fetched', (): Promise<Item[]> => fetchItems(request));

      await test.step('THEN the first item has an id', (): void => expect(items[0]).toHaveProperty('id'));
    });
  });

  test.describe('GIVEN no session', () => {
    test('opening the admin page redirects to login', async ({ adminPage, page }): Promise<void> => {
      await test.step('WHEN the admin page is opened', (): Promise<void> => adminPage.goto());

      await test.step('THEN the url is the login page', (): Promise<void> => expect(page).toHaveURL(/\/login/));
    });
  });
});
```

`postsPage.expectDescriptionLength(min)` reads `meta[name="description"]` with `getAttribute('content')` and asserts `length` inside a boxed step. `HomePage.markSpaSession` is the same attribute stamp shown under [Vue Router Navigation](#vue-router-navigation).

## Vue vs Nuxt Differences

| Aspect | Vue 3 (Vite) | Nuxt 3 |
| --- | --- | --- |
| Default port | `5173` | `3000` |
| Dev command | `npm run dev` | `npx nuxi dev` |
| Build + preview | `npm run build && npx vite preview` | `npx nuxi build && npx nuxi preview` |
| SSR | Optional | Built-in |
| API routes | External backend | `/server/api/` built-in |
| Env variables | `VITE_*` prefix | `NUXT_PUBLIC_*` (client), `NUXT_*` (server) |
| File-based routing | No | Yes |

## Component Testing Dependencies

Components depending on Pinia or Vue Router need these provided in the CT bootstrap. `HooksConfig` names the shape a test passes through `hooksConfig`.

```ts
// playwright/index.ts
import { beforeMount } from '@playwright/experimental-ct-vue/hooks';
import { createPinia } from 'pinia';
import type { RouteRecordRaw } from 'vue-router';
import { createMemoryHistory, createRouter } from 'vue-router';

type HooksConfig = {
  readonly routes?: RouteRecordRaw[];
};

beforeMount<HooksConfig>(async ({ app, hooksConfig }): Promise<void> => {
  const pinia = createPinia();

  app.use(pinia);

  if (!hooksConfig?.routes) return;

  const router = createRouter({ history: createMemoryHistory(), routes: hooksConfig.routes });

  app.use(router);
});
```

## Testing v-model

`v-model` listens to standard DOM events. Playwright's `fill`, `check`, and `selectOption` dispatch them, so a page object talks to the inputs and never to the binding.

```ts
// e2e/subscribe/pages/subscribe.page.ts
import type { Locator, Page } from '@playwright/test';

export class SubscribePage {
  public readonly countrySelect: Locator;
  public readonly emailInput: Locator;
  public readonly subscribeCheckbox: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.countrySelect = page.getByRole('combobox', { name: 'Country' });
    this.emailInput = page.getByLabel('Email');
    this.subscribeCheckbox = page.getByRole('checkbox', { name: 'Subscribe' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/subscribe');
  }

  public async fillPreferences(email: string, country: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.subscribeCheckbox.check();
    await this.countrySelect.selectOption(country);
  }
}
```

## Capturing Vue Warnings

A fixture attaches the console listener before the test runs and hands the collected warnings to the spec.

```ts
// e2e/home/home.fixture.ts
import type { ConsoleMessage } from '@playwright/test';
import { test as base } from '@playwright/test';

import { HomePage } from './pages/home.page';

type HomeFixtures = {
  readonly homePage: HomePage;
  readonly vueWarnings: string[];
};

const collectVueWarning = (warnings: string[], message: ConsoleMessage): void => {
  const isWarning = message.type() === 'warning';
  const isVue = message.text().includes('[Vue warn]');

  if (isWarning && isVue) warnings.push(message.text());
};

export const test = base.extend<HomeFixtures>({
  homePage: async ({ page }, use): Promise<void> => {
    await use(new HomePage(page));
  },
  vueWarnings: async ({ page }, use): Promise<void> => {
    const warnings: string[] = [];

    page.on('console', (message: ConsoleMessage): void => collectVueWarning(warnings, message));
    await use(warnings);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/home/home.spec.ts
import { expect, test } from './home.fixture';

test.describe('FEATURE: home page', () => {
  test.describe('GIVEN the home page', () => {
    test('rendering the home page logs no Vue warning', async ({ homePage, vueWarnings }): Promise<void> => {
      await test.step('WHEN the home page opens', (): Promise<void> => homePage.goto());

      await test.step('THEN the heading is shown', (): Promise<void> => homePage.expectHeading('Home'));

      await test.step('AND no Vue warning was logged', (): void => expect(vueWarnings).toEqual([]));
    });
  });
});
```

## Anti-Patterns

| Avoid | Problem | Instead |
| --- | --- | --- |
| `page.evaluate(() => app.__vue_app__.config.globalProperties.$store)` | Accesses Vue internals; breaks on upgrades | Assert on UI that state produces |
| `page.locator('[data-v-abc123]')` | Scoped style hashes change on every build | Use `getByRole`, `getByText`, `getByTestId` |
| Import `.vue` files in E2E tests | E2E tests run in Node.js; `.vue` needs compilation | Use `@playwright/experimental-ct-vue` for component tests |
| `page.waitForTimeout(300)` for transitions | Arbitrary waits are fragile | `await expect(locator).toBeVisible()` auto-waits |
| Mock Pinia by patching `window.__pinia` | Fragile; may not trigger reactivity | Control state through UI or mock API responses |
| Test composables via `page.evaluate` | Composables need Vue's setup context | Test through components or unit test with Vitest |
| `page.locator('.v-btn')` for Vuetify | Class names change between versions | `page.getByRole('button', { name: 'Submit' })` |
| Run Nuxt dev server in CI | Dev mode is slower with hot reload overhead | Use `npx nuxi build && npx nuxi preview` |
| `page.addStyleTag` before `goto` | The tag is added to `about:blank` and lost on navigation | Call it after `goto`, or from a `beforeEach` step that follows the open step |
