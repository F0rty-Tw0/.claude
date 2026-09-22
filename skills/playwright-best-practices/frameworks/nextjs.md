# Next.js Testing Patterns

## Table of Contents

1. [Setup](#setup)
2. [App Router Patterns](#app-router-patterns)
3. [Pages Router Patterns](#pages-router-patterns)
4. [Dynamic Routes](#dynamic-routes)
5. [API Routes](#api-routes)
6. [Middleware Testing](#middleware-testing)
7. [Hydration Testing](#hydration-testing)
8. [next/image Testing](#nextimage-testing)
9. [NextAuth.js Authentication](#nextauthjs-authentication)
10. [Tips](#tips)
11. [Anti-Patterns](#anti-patterns)
12. [Related](#related)

> **When to use**: Testing Next.js applications with App Router, Pages Router, API routes, middleware, SSR, dynamic routes, and server components.
> **Prerequisites**: [house-style.md](../core/house-style.md), [configuration.md](../core/configuration.md), [locators.md](../core/locators.md)

## Setup

### Configuration with webServer

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const IS_CI = Boolean(process.env.CI);
const BASE_URL = 'http://localhost:3000';

const use = { baseURL: BASE_URL, screenshot: 'only-on-failure', trace: 'on-first-retry' } as const;

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'mobile', use: devices['iPhone 14'] }
];

const env = { NODE_ENV: IS_CI ? 'production' : 'test' };

const webServer = {
  command: IS_CI ? 'npm run build && npm run start' : 'npm run dev',
  env,
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
  use,
  webServer,
  workers: IS_CI ? '50%' : undefined
});
```

### Environment Variables

Next.js loads `.env.test` when `NODE_ENV=test`:

```bash
# .env.test (commit this)
NEXT_PUBLIC_API_URL=http://localhost:3000/api
DATABASE_URL=postgresql://localhost:5432/test_db

# .env.test.local (gitignored)
NEXTAUTH_SECRET=test-secret-local
```

## App Router Patterns

### Server Component Content

A server component is plain HTML by the time Playwright sees it. Assert on roles as on any page.

```ts
// e2e/home/home.e2e.ts
import { test } from './home.fixture';

test.describe('FEATURE: server components', () => {
  test.describe('GIVEN the home page', () => {
    test('SCENARIO: page load shows the server-rendered heading and navigation', async ({ homePage }): Promise<void> => {
      await test.step('WHEN the home page is opened', (): Promise<void> => homePage.goto());

      await test.step('THEN welcome heading is shown', (): Promise<void> => homePage.expectHeading('Welcome'));

      await test.step('AND main navigation is shown', (): Promise<void> => homePage.expectNavigation('Main'));
    });
  });
});
```

`HomePage` is shared by every `home.e2e.ts` below: `goto()` opens `/`; `expectHeading(name)` asserts the level-1 heading; `expectNavigation(name)` asserts `getByRole('navigation', { name })`; `expectText(text)` asserts `getByText(text)` visible; `getStarted()` clicks the `Get started` button.

### Loading States with Streaming

A slow data source keeps the `loading.tsx` boundary on screen. The mock delays the stats request with `setTimeout` from `node:timers/promises` and lets it through.

```ts
// e2e/dashboard/test/mocks/stats.mock.ts
import { setTimeout as sleep } from 'node:timers/promises';

import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../common/dashboard.type';

export const slowStatsMock = (delayMs: number): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await sleep(delayMs);
    await route.continue();
  };
};
```

`DashboardPage` owns `heading` (`getByRole('heading', { name: 'Dashboard' })`), `progressbar` (`getByRole('progressbar')`) and `sidebar` (`getByRole('navigation', { name: 'Dashboard' })`). `goto(path = '/dashboard')` navigates; `routeStats(handler: RouteHandler)` wraps `page.route('**/api/stats', handler)`; `expectLoading` asserts the progressbar visible; `expectLoaded` asserts the heading visible and the progressbar hidden in one boxed step; `openSection(name)` clicks the sidebar link then `waitForURL('/dashboard/<name>')`; `expectSection(name)` asserts the sidebar and the section heading.

```ts
// e2e/dashboard/dashboard.test.ts
import { test } from './dashboard.fixture';
import { slowStatsMock } from './test/mocks/stats.mock';

test.describe('FEATURE: streaming dashboard', () => {
  test.describe('GIVEN the stats endpoint takes two seconds', () => {
    test('SCENARIO: dashboard open shows the loading boundary and resolves it', async ({ dashboardPage }): Promise<void> => {
      await test.step('WHEN the stats response is held for 2s', (): Promise<void> => dashboardPage.routeStats(slowStatsMock(2_000)));

      await test.step('AND the dashboard is opened', (): Promise<void> => dashboardPage.goto());

      await test.step('THEN loading boundary is shown', (): Promise<void> => dashboardPage.expectLoading());

      await test.step('AND content replaces the loading boundary', (): Promise<void> => dashboardPage.expectLoaded());
    });
  });
});
```

### Nested Layouts

A nested layout stays mounted while its child route changes. `dashboardPage.goto('/dashboard/analytics')`, `expectSection('Analytics')`, `openSection('Settings')`, `expectSection('Settings')` walk the same page object.

## Pages Router Patterns

### SSR with getServerSideProps

Data fetched in `getServerSideProps` is in the first HTML response, so the spec asserts as on any page: `blogPage.goto()`, `expectHeading('Blog')`, `expectArticleCount(10)` on `getByRole('article')`, `expectFirstArticleText(/\w+/)`.

### Static Generation with getStaticProps

Same shape: `aboutPage.goto()`, `expectHeading('About Us')`, `expectText('Founded in 2020')`.

## Dynamic Routes

### Slug Parameters

`page.goto` returns the navigation response, so a `[slug]` page object returns it and the spec asserts the status. `Response | null` is the declared type; a `null` response means the navigation was a same-document change.

```ts
// e2e/blog/pages/post.page.ts
import type { Locator, Page, Response } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class PostPage {
  public readonly heading: Locator;
  public readonly notFoundHeading: Locator;
  public readonly notFoundText: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.notFoundHeading = page.getByRole('heading', { name: '404' });
    this.notFoundText = page.getByText('Page not found');
  }

  public async goto(slug: string): Promise<Response | null> {
    return this.page.goto(`/blog/${slug}`);
  }

  public async expectPost(title: string): Promise<void> {
    await test.step(`post "${title}" is shown`, async (): Promise<void> => {
      await expect(this.heading).toContainText(title);
      await expect(this.notFoundText).toBeHidden();
    }, { box: true });
  }

  public async expectNotFound(): Promise<void> {
    await test.step('404 heading is shown', (): Promise<void> => expect(this.notFoundHeading).toBeVisible(), { box: true });
  }
}
```

```ts
// e2e/blog/blog.e2e.ts
import type { Response } from '@playwright/test';

import { expect, test } from './blog.fixture';

test.describe('FEATURE: blog post routes', () => {
  test.describe('GIVEN a published post', () => {
    test('SCENARIO: published slug renders the post', async ({ postPage }): Promise<void> => {
      await test.step('WHEN the testing guide is opened', (): Promise<Response | null> => postPage.goto('testing-guide'));

      await test.step('THEN post is shown', (): Promise<void> => postPage.expectPost('Testing Guide'));
    });
  });

  test.describe('GIVEN an unknown slug', () => {
    test('SCENARIO: unknown slug responds 404', async ({ postPage }): Promise<void> => {
      const response = await test.step('WHEN a missing post is opened', (): Promise<Response | null> => postPage.goto('nonexistent-post'));

      await test.step('THEN status is 404', (): void => expect(response?.status()).toBe(404));

      await test.step('AND 404 heading is shown', (): Promise<void> => postPage.expectNotFound());
    });
  });
});
```

### Catch-All Routes

`docsPage.goto('getting-started/installation')` then `expectHeading('Installation')`; `docsPage.goto('api/configuration')` then `expectHeading('Configuration')`. One page object, two steps per path.

### Query Parameters

Query parameters drive the filter and the sort. The page object returns the rendered prices as numbers; the util decides whether they are ascending.

```ts
// e2e/products/test/utils/prices.spec.util.ts
const toNumber = (price: string): number => parseFloat(price.replace('$', ''));

const ascending = (left: number, right: number): number => left - right;

export const toPrices = (texts: string[]): number[] => texts.map(toNumber);

export const sortedAscending = (prices: number[]): number[] => [...prices].sort(ascending);
```

```ts
// e2e/products/products.e2e.ts
import { expect, test } from './products.fixture';
import { sortedAscending } from './test/utils/prices.spec.util';

test.describe('FEATURE: product filters', () => {
  test.describe('GIVEN electronics sorted by price ascending', () => {
    test('SCENARIO: page load lists prices ascending', async ({ productsPage }): Promise<void> => {
      await test.step('WHEN electronics sorted by price is opened', (): Promise<void> => productsPage.goto('category=electronics&sort=price-asc'));

      await test.step('THEN electronics heading is shown', (): Promise<void> => productsPage.expectHeading('Electronics'));

      const prices = await test.step('AND the rendered prices are read', (): Promise<number[]> => productsPage.prices());

      await test.step('THEN prices are ascending', (): void => expect(prices).toEqual(sortedAscending(prices)));
    });
  });
});
```

`productsPage.goto(query)` opens `/products?${query}`; `expectHeading(name)` asserts the level-1 heading; `prices()` reads `getByTestId('product-price').allTextContents()` and returns `toPrices(texts)`.

## API Routes

### Direct API Testing

The `request` fixture hits the route without a browser. A typed body replaces `toHaveProperty` checks: reading `response.json()` into a `ProductsBody` const makes the shape part of the contract.

```ts
// e2e/products/common/products.type.ts
export type Product = {
  readonly id: number;
  readonly name: string;
  readonly price: number;
};

export type ProductsBody = {
  readonly products: Product[];
};

export type CreatedProductBody = {
  readonly product: Product;
};
```

```ts
// e2e/products/products-api.e2e.ts
import type { APIResponse } from '@playwright/test';

import type { CreatedProductBody, ProductsBody } from './common/products.type';
import { expect, test } from './products.fixture';
import { NEW_PRODUCT_STUB } from './test/stubs/products.stub';

test.describe('FEATURE: products api', () => {
  test.describe('GIVEN the products route', () => {
    test('SCENARIO: GET returns a product list', async ({ request }): Promise<void> => {
      const response = await test.step('WHEN products are fetched', (): Promise<APIResponse> => request.get('/api/products'));

      await test.step('THEN response is ok', (): void => expect(response.ok()).toBeTruthy());

      const body = await test.step('AND the body is read', (): Promise<ProductsBody> => response.json());

      await test.step('THEN first product has an id and a name', (): void => expect(body.products[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) }));
    });
  });
});
```

`NEW_PRODUCT_STUB` is `{ name: 'Test Product', price: 29.99 }` in `test/stubs/products.stub.ts`. The write cases follow the same four steps:

| Case | Call | Status | Body |
|---|---|---|---|
| Create | `request.post('/api/products', { data: NEW_PRODUCT_STUB })` | `201` | `CreatedProductBody`; `body.product.name` is `NEW_PRODUCT_STUB.name` |
| Validation | `request.post('/api/products', { data: { ...NEW_PRODUCT_STUB, name: '' } })` | `400` | `body.error` contains `expect.objectContaining({ field: 'name' })` |

See [api-testing.md](../testing-patterns/api-testing.md) for API objects and `readJson`.

### API Through UI

The form posts to the same route. The page object waits for the redirect so the spec asserts the success text after navigation.

```ts
// e2e/products/products.e2e.ts
import { test } from './products.fixture';
import { NEW_PRODUCT_STUB } from './test/stubs/products.stub';

test.describe('FEATURE: product form', () => {
  test.describe('GIVEN the new product page', () => {
    test('SCENARIO: submitted product is created by the api and confirmed on the page', async ({ newProductPage }): Promise<void> => {
      await test.step('GIVEN the new product page is open', (): Promise<void> => newProductPage.goto());

      await test.step('WHEN a widget is created', (): Promise<void> => newProductPage.create({ ...NEW_PRODUCT_STUB, name: 'Widget', price: 19.99 }));

      await test.step('THEN success message is shown', (): Promise<void> => newProductPage.expectCreated());
    });
  });
});
```

`newProductPage.goto()` opens `/products/new`; `create(product)` fills `Product name` and `Price`, clicks `Create product`, and calls `page.waitForURL('/products/**')`; `expectCreated` asserts `Product created successfully` visible.

## Middleware Testing

### Auth Redirects

Middleware redirects before any component renders. The return URL lands in `callbackUrl` or `returnTo`; the util reads whichever is set.

```ts
// e2e/auth/test/utils/return-url.spec.util.ts
export const returnUrl = (current: string): string | null => {
  const url = new URL(current);
  const callbackUrl = url.searchParams.get('callbackUrl');
  const returnTo = url.searchParams.get('returnTo');

  return callbackUrl ?? returnTo;
};
```

```ts
// e2e/auth/auth.unauth.e2e.ts
import { expect, test } from './auth.fixture';
import { returnUrl } from './test/utils/return-url.spec.util';

test.describe('FEATURE: auth middleware', () => {
  test.describe('GIVEN a signed-out visitor', () => {
    test('SCENARIO: nested page redirect shows login and keeps the return url', async ({ loginPage, page }): Promise<void> => {
      await test.step('WHEN dashboard settings is opened', async (): Promise<void> => {
        await page.goto('/dashboard/settings');
      });

      await test.step('THEN login url is shown', (): Promise<void> => expect(page).toHaveURL(/\/login/));

      await test.step('AND the sign-in heading is shown', (): Promise<void> => loginPage.expectHeading());

      await test.step('AND return url points at settings', (): void => expect(returnUrl(page.url())).toContain('/dashboard/settings'));
    });
  });
});
```

`loginPage.expectHeading()` asserts the `Sign in` heading.

### Security Headers

The navigation response carries the middleware headers. Both assertions describe one state, so they share a boxed step in the util.

```ts
// e2e/auth/test/utils/security-headers.spec.util.ts
import type { Response } from '@playwright/test';
import { expect, test } from '@playwright/test';

export const expectSecurityHeaders = async (response: Response | null): Promise<void> => {
  const headers = response?.headers() ?? {};

  await test.step('security headers are set', (): void => {
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
  }, { box: true });
};
```

The spec reads `const response = await test.step('open the home page', (): Promise<Response | null> => page.goto('/'));` then `await test.step('security headers are set', (): Promise<void> => expectSecurityHeaders(response));`.

### Locale Rewrites

Middleware rewrites by `Accept-Language`. The header set is a named const above the steps.

```ts
// e2e/home/home.e2e.ts
import { test } from './home.fixture';

const FRENCH_HEADERS = { 'Accept-Language': 'fr-FR,fr;q=0.9' };

test.describe('FEATURE: locale middleware', () => {
  test.describe('GIVEN a French browser', () => {
    test('SCENARIO: home page open serves the French copy', async ({ context, homePage }): Promise<void> => {
      await test.step('WHEN French accept-language is sent', (): Promise<void> => context.setExtraHTTPHeaders(FRENCH_HEADERS));

      await test.step('AND the home page is opened', (): Promise<void> => homePage.goto());

      await test.step('THEN french welcome is shown', (): Promise<void> => homePage.expectText('Bienvenue'));
    });
  });
});
```

## Hydration Testing

### Console Error Detection

A hydration mismatch is a console error mentioning `Hydration`, `hydration`, or `did not match`. The `consoleErrors` fixture from [console-errors.md](console-errors.md#fail-test-on-any-error) collects every error; the util keeps the hydration ones.

```ts
// e2e/home/test/utils/hydration.spec.util.ts
const isHydrationError = (error: string): boolean => error.includes('Hydration') || error.includes('hydration') || error.includes('did not match');

export const hydrationErrors = (errors: string[]): string[] => errors.filter(isHydrationError);
```

```ts
// e2e/home/home.e2e.ts
import { expect, test } from './home.fixture';
import { hydrationErrors } from './test/utils/hydration.spec.util';

test.describe('FEATURE: hydration', () => {
  test.describe('GIVEN the home page', () => {
    test('SCENARIO: hydrated page click logs no hydration error', async ({ consoleErrors, homePage }): Promise<void> => {
      await test.step('GIVEN the home page is open', (): Promise<void> => homePage.goto());

      await test.step('WHEN get started is clicked', (): Promise<void> => homePage.getStarted());

      const mismatches = await test.step('AND the hydration errors are kept', (): string[] => hydrationErrors(consoleErrors));

      await test.step('THEN no hydration error was logged', (): void => expect(mismatches).toEqual([]));
    });
  });
});
```

### Interactive Elements After Hydration

A click that changes state proves hydration finished. `counterPage.expectValue(0)`, `counterPage.increment()`, `counterPage.expectValue(1)` on the `counter-value` test ID; the page object is the one in [angular.md](angular.md#signals-and-observables).

## next/image Testing

`next/image` emits a `srcset` with `w=` descriptors and sets `loading="lazy"` on everything but priority images. Web-first attribute assertions cover both; `naturalWidth` proves a lazy image actually loaded after scrolling.

```ts
// e2e/gallery/pages/gallery.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const naturalWidth = (image: HTMLImageElement): number => image.naturalWidth;

export class GalleryPage {
  public readonly heroImage: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.heroImage = page.getByRole('img', { name: 'Hero banner' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/gallery');
  }

  public async scrollToItem(index: number): Promise<void> {
    await this.item(index).scrollIntoViewIfNeeded();
  }

  public async itemNaturalWidth(index: number): Promise<number> {
    return this.item(index).evaluate(naturalWidth);
  }

  private item(index: number): Locator {
    return this.page.getByRole('img', { name: `Gallery item ${index}` });
  }

  public async expectHeroEager(): Promise<void> {
    await test.step('hero image is visible, has a srcset, and is not lazy', async (): Promise<void> => {
      await expect(this.heroImage).toBeVisible();
      await expect(this.heroImage).toHaveAttribute('srcset', /w=/);
      await expect(this.heroImage).not.toHaveAttribute('loading', 'lazy');
    }, { box: true });
  }
}
```

```ts
// e2e/gallery/gallery.e2e.ts
import { expect, test } from './gallery.fixture';

test.describe('FEATURE: next/image', () => {
  test.describe('GIVEN the gallery', () => {
    test.beforeEach(async ({ galleryPage }): Promise<void> => {
      await test.step('GIVEN the gallery is open', (): Promise<void> => galleryPage.goto());
    });

    test('SCENARIO: page load renders the hero image eager with a srcset', async ({ galleryPage }): Promise<void> => {
      await test.step('THEN hero image is eager', (): Promise<void> => galleryPage.expectHeroEager());
    });

    test('SCENARIO: offscreen image loads when scrolled into view', async ({ galleryPage }): Promise<void> => {
      await test.step('WHEN item 20 is scrolled to', (): Promise<void> => galleryPage.scrollToItem(20));

      const width = await test.step('AND the natural width is read', (): Promise<number> => galleryPage.itemNaturalWidth(20));

      await test.step('THEN image has loaded pixels', (): void => expect(width).toBeGreaterThan(0));
    });
  });
});
```

## NextAuth.js Authentication

### Setup Project

The `setup` project logs in once and writes storage state; the `authenticated` project depends on it. Unauthenticated specs match `*.unauth.e2e.ts` and run without state.

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

import { USER_STATE_PATH } from './auth/common/auth.const';

const authenticated = { storageState: USER_STATE_PATH };

const projects = [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  { dependencies: ['setup'], name: 'authenticated', use: authenticated },
  { name: 'unauthenticated', testMatch: '**/*.unauth.e2e.ts' }
];

export default defineConfig({ projects });
```

### Auth Setup

`auth.setup.ts` is the UI setup project from [authentication.md](../advanced/authentication.md#storage-state-reuse): `loginPage.goto()`, `loginPage.submit(TEST_USER)` (fills `Email` and `Password`, clicks `Sign in`, calls `page.waitForURL('/dashboard')`), `dashboardPage.expectHeading()`, then `page.context().storageState({ path: USER_STATE_PATH })`. `TEST_USER` and `USER_STATE_PATH` (`e2e/.auth/user.json`) live in `auth/common/auth.const.ts`; the password is read there once from `process.env.TEST_PASSWORD`, so the setup file never touches `process.env`.

### Authenticated Tests

A spec in the `authenticated` project opens `/dashboard` directly: `dashboardPage.goto()`, `dashboardPage.expectHeading()`, `dashboardPage.expectUser(TEST_USER.email)`.

## Tips

### webServer Variants

Every variant is the `webServer` const from [Setup](#setup) with a different `command`.

| Scenario | `command` | Note |
|---|---|---|
| Local development | `npm run dev` | Fast iteration, no production behavior; `reuseExistingServer: !IS_CI` |
| Turbopack | `npx next dev --turbopack` | Same config, faster local rebuilds |
| CI pipeline | `npm run build && npm run start` | Tests the real production bundle |
| Multiple services | `webServer: [apiServer, webApp]` | Array of entries, each with its own `command` and `url`; Playwright waits for every `url` before the run starts |

## Anti-Patterns

| Avoid | Problem | Prefer |
|---|---|---|
| `await page.waitForTimeout(3000)` | Arbitrary waits are fragile | `await page.waitForURL('/path')` or `await expect(locator).toBeVisible()` |
| Test `getServerSideProps` directly | Depends on req/res context | Navigate to page and verify rendered output |
| Mock your own API routes | Hides real API bugs | Let real API handle requests; mock only external services |
| `page.goto('http://localhost:3000/path')` | Breaks when port changes | Use `page.goto('/path')` with `baseURL` |
| Run `npm run build` locally for every test | Extremely slow | Use `npm run dev` locally with `reuseExistingServer: true` |
| Test `next/image` by checking exact URLs | Paths change between dev/prod | Assert on `alt`, visibility, `naturalWidth > 0`, `srcset` |
| Test server actions by calling as functions | Server actions need Next.js runtime | Trigger through UI (forms, buttons) |

## Related

- [configuration.md](../core/configuration.md) -- Playwright configuration including `webServer`
- [authentication.md](../advanced/authentication.md) -- authentication setup and `storageState`
- [api-testing.md](../testing-patterns/api-testing.md) -- testing API routes with `request` context
- [react.md](react.md) -- React patterns for Next.js client components
