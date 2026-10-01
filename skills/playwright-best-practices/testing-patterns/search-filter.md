# Search and Filter Testing

> **When to use**: Testing search inputs, debounced queries, category and price filters, filter combinations, deep links, no-results states, and pagination under filters.
> **See also**: [forms-validation.md](forms-validation.md#auto-complete-and-typeahead-fields) for typeahead suggestions, [network-advanced.md](../advanced/network-advanced.md) for route patterns.

## Contents

1. [What to Cover](#what-to-cover)
2. [Debounce: One Request per Term](#debounce-one-request-per-term)
3. [URL State and Deep Links](#url-state-and-deep-links)
4. [Combinations, No Results, Pagination](#combinations-no-results-pagination)

Every sample belongs to the `catalog` feature. `ProductList` (`items`, `total`) is the response contract in `common/catalog.type.ts`.

## What to Cover

| Behavior | Check |
|---|---|
| Debounce | Typing a word sends one request, for the whole word |
| URL is the state | Every filter, the query, and the page number are in the query string |
| Deep link | Opening a filtered URL checks the boxes, fills the inputs, and filters the results |
| Back and forward | Back restores the previous filter set, controls included |
| Combinations | Two filters narrow together (AND), and the URL holds both |
| No results | An empty message, a way out (clear filters), no stale rows |
| Pagination | Page 2 keeps the filters; changing a filter goes back to page 1 |
| Clear all | Controls reset, URL loses the params, the full list returns |

Check the controls, not only the results. A result list filtered correctly next to an unchecked box is a one-way binding bug a results-only test passes.

## Debounce: One Request per Term

Counting requests needs a recorded mock, so this spec routes the app's own API and is a `.test.ts`. The mock records every request and serves the stub. `RecordedMock` (`calls: Request[]`, `handler: RouteHandler`) is in `test/common/catalog.type.ts`.

```ts
// e2e/catalog/test/mocks/products.mock.ts
import type { Request, Route } from '@playwright/test';

import type { ProductList } from '../../common/catalog.type';
import type { RecordedMock } from '../common/catalog.type';
import { PRODUCT_LIST_STUB } from '../stubs/catalog.stub';

export const productsMock = (products: ProductList = PRODUCT_LIST_STUB): RecordedMock => {
  const calls: Request[] = [];
  const handler = (route: Route): Promise<void> => {
    calls.push(route.request());

    return route.fulfill({ json: products });
  };
  const mock: RecordedMock = { calls, handler };

  return mock;
};
```

The `productCalls` fixture creates the mock, runs `await page.route('**/api/products**', mock.handler)` before `use`, and yields `mock.calls`. The route is installed before the page opens, so the first list request is recorded too; `**` after `products` matches the query string. The check reads only requests that carry a `q` parameter, so the initial unfiltered load does not count:

```ts
// e2e/catalog/test/utils/search-terms.spec.util.ts
import type { Request } from '@playwright/test';

const termOf = (request: Request): string | null => {
  const url = new URL(request.url());

  return url.searchParams.get('q');
};

const isTerm = (term: string | null): term is string => term !== null;

export const searchTerms = (calls: Request[]): string[] => calls.map(termOf).filter(isTerm);
```

`CatalogPage.typeSearch(term)` uses `pressSequentially`, so every key fires an input event the way a user's typing does. `fill()` sets the value in one event and cannot catch a missing debounce.

```ts
// e2e/catalog/catalog-search.test.ts
import { expect, test } from './catalog.fixture';
import { PRODUCT_LIST_STUB } from './test/stubs/catalog.stub';
import { searchTerms } from './test/utils/search-terms.spec.util';

test.describe('FEATURE: catalog search', () => {
  test('GIVEN a debounced search box, typing a word sends one request for the whole word', async ({ catalogPage, productCalls }): Promise<void> => {
    await test.step('WHEN the catalog is opened', (): Promise<void> => catalogPage.goto());

    await test.step('AND keyboard is typed key by key', (): Promise<void> => catalogPage.typeSearch('keyboard'));

    await test.step('THEN the results are shown', (): Promise<void> => catalogPage.expectResultCount(PRODUCT_LIST_STUB.items.length));

    await test.step('AND exactly one search was sent, for keyboard', (): Promise<void> => expect.poll((): string[] => searchTerms(productCalls)).toEqual(['keyboard']));
  });
});
```

A component that searched per keystroke has sent eight requests before the results render, so the poll fails on `['k', 'ke', …]`. For a debounce whose timing matters (300 ms, not 3 s), install `page.clock` through the opening call and advance it with `runFor` instead of waiting ([clock-mocking.md](../advanced/clock-mocking.md)).

## URL State and Deep Links

These run against the real backend, so they are `.e2e.ts`. `CatalogPage.goto(search = '')` opens `/catalog${search}`, so a deep link is the opening call: `catalogPage.goto('?category=books&maxPrice=20')`.

| Test | Steps |
|---|---|
| `'GIVEN no filters, choosing Books puts the category in the url'` | `goto()`, `chooseCategory('Books')`, `THEN expect(page).toHaveURL(/category=books/)`, `AND expectEveryResultIn('Books')` |
| `'GIVEN a deep link to books under 20, the page opens with both filters applied'` | `goto('?category=books&maxPrice=20')`, `THEN expectCategoryChecked('Books')`, `AND expectMaxPrice('20')`, `AND expectEveryResultIn('Books')` |
| `'GIVEN the Books filter, going back restores the unfiltered list'` | `goto('?category=books')`, `chooseCategory('Toys')`, `THEN` url has `toys`; `WHEN goBack()`, `THEN expectCategoryChecked('Books')` and url has `books` |

`expectCategoryChecked` is `toBeChecked()` on `getByRole('checkbox', { name })`; `expectMaxPrice` is `toHaveValue` on the price input. `expectEveryResultIn(category)` is `toHaveCount(0)` on `resultCards.filter({ hasNotText: category })`: one web-first assertion instead of a loop over `all()`.

`goBack()` returns `Promise<Response | null>`, so the page-object method wraps it in a block body with one `await`.

## Combinations, No Results, Pagination

| Case | Opening state | Outcome |
|---|---|---|
| Two filters | `goto('?category=books')`, then `setMaxPrice('20')` | Every result is a book at 20 or less; URL holds `category` and `maxPrice` |
| Query plus filter | `goto('?q=tolkien&category=books')` | Search box shows `tolkien`, Books checked, results match both |
| No results | `goto('?q=zzzz-no-match')` | Empty message visible, result cards `toHaveCount(0)`, Clear filters button visible |
| Clear from no results | Same, then `clearFilters()` | Search box empty, URL has no `q`, results return |
| Page 2 keeps filters | `goto('?category=books&page=2')` | Books checked, page 2 marked current (`getByRole('link', { name: '2' })` with `aria-current`), URL keeps both |
| Filter resets the page | `goto('?category=books&page=2')`, then `chooseCategory('Toys')` | URL has `page=1` or no `page`; first page marked current |

A no-results case on the real backend needs a term no seed will ever match; prefix it so it is obviously synthetic. A no-results case that must not depend on data routes `productsMock({ ...PRODUCT_LIST_STUB, items: [], total: 0 })` through the opening call and lives in the `.test.ts`.

Seed the data a filter test reads ([test-data.md](../core/test-data.md)): "every result is a book" passes on an empty list, so the same test also asserts a count above zero, or the seed names the books it expects.
