# Edge Case Testing

> **When to use**: Testing list sizes (zero, one, many), boundary and unusual input, double submits, back and forward navigation through a form, and pages whose side services fail.
> **See also**: [error-testing.md](../debugging/error-testing.md) for HTTP errors, network failure, offline, and loading states; [forms-validation.md](forms-validation.md) for field validation.

## Contents

1. [Zero, One, Many](#zero-one-many)
2. [Boundary and Unusual Input](#boundary-and-unusual-input)
3. [Double Submit](#double-submit)
4. [Back and Forward](#back-and-forward)
5. [Failing Side Services](#failing-side-services)
6. [Checklist](#checklist)

Every sample belongs to the `orders` feature. `Order` and the page options types are in `common/orders.type.ts`; `OrdersOptions` is `{ readonly orders?: Order[] }` and `CheckoutOptions` is `{ readonly failOn?: 'recommendations' }`. Each `goto(options)` routes only what its option names, before it navigates.

## Zero, One, Many

Most list bugs live at the ends: an empty table with a header and no message, "1 orders", a 250-row page that never paginates. One test per size, generated from a case list, each title naming its size. Sizes are data, so the list is routed and the spec is a `.test.ts`. `OrderCountCase` (`name`, `orders`, `summary`) is test-only, in `test/common/orders.type.ts`.

```ts
// e2e/orders/order-counts.test.ts
import type { OrdersOptions } from './common/orders.type';
import { test } from './orders.fixture';
import type { OrderCountCase } from './test/common/orders.type';
import { ORDER_STUB } from './test/stubs/orders.stub';
import { buildOrders } from './test/utils/order-builder.spec.util';

const MANY_ORDERS = buildOrders(250);

const COUNT_CASES: OrderCountCase[] = [
  { name: 'no orders', orders: [], summary: 'No orders yet' },
  { name: 'one order', orders: [ORDER_STUB], summary: '1 order' },
  { name: '250 orders', orders: MANY_ORDERS, summary: '250 orders' }
];

test.describe('FEATURE: order history sizes', () => {
  for (const countCase of COUNT_CASES) {
    test(`GIVEN ${countCase.name}, the history summary reads ${countCase.summary}`, async ({ ordersPage }): Promise<void> => {
      const options: OrdersOptions = { orders: countCase.orders };

      await test.step('WHEN the order history is opened', (): Promise<void> => ordersPage.goto(options));

      await test.step('THEN the summary names the count', (): Promise<void> => ordersPage.expectSummary(countCase.summary));
    });
  }
});
```

| Size | Also check |
|---|---|
| Zero | Empty-state message and its call to action; no table header, no "Showing 1-0 of 0" |
| One | Singular wording; bulk actions hidden or disabled |
| Many | Pagination or virtual scroll appears; totals add up; the last row is reachable |

## Boundary and Unusual Input

Each row is a case in a loop like the one above, or a variant row under the field's existing test. XSS and SQL payloads belong to [security-testing.md](security-testing.md).

| Input | Expect |
|---|---|
| Exactly the max length | Accepted and saved whole |
| Max length plus one | Blocked by `maxlength` or a field error; never silently truncated on save |
| Only whitespace | Treated as empty |
| Leading and trailing spaces | Trimmed, or kept, as the spec says; the same both on save and on search |
| Accents, CJK, emoji (`Zoë 東京 🚀`) | Saved and shown unchanged; counters count characters, not bytes |
| Right-to-left text | Shown in the right direction; no layout break |
| Zero, negative, and decimal amounts | Validated at the field; never reach the server as `NaN` |
| Dates at month, year, and DST edges | Shown in the user's zone; no off-by-one day |

## Double Submit

A double click on Place order must create one order. Counting POSTs needs a recorded mock, so the `orderPosts` fixture routes `**/api/orders` to `orderMock()` (same shape as `productsMock` in [search-filter.md](search-filter.md#debounce-one-request-per-term)) and yields its `calls`. `CheckoutPage.doubleClickPlaceOrder()` is `placeOrderButton.dblclick()`: two clicks before any response, the way an impatient user sends them.

```ts
// e2e/orders/double-submit.test.ts
import { expect, test } from './orders.fixture';

test.describe('FEATURE: checkout double submit', () => {
  test('GIVEN a filled cart, double-clicking Place order creates one order', async ({ checkoutPage, orderPosts }): Promise<void> => {
    await test.step('WHEN the checkout is opened', (): Promise<void> => checkoutPage.goto());

    await test.step('AND Place order is double-clicked', (): Promise<void> => checkoutPage.doubleClickPlaceOrder());

    await test.step('THEN the confirmation is shown', (): Promise<void> => checkoutPage.expectConfirmation());

    await test.step('AND exactly one order was posted', (): Promise<void> => expect.poll((): number => orderPosts.length).toBe(1));
  });
});
```

| Variant | Action | Outcome |
|---|---|---|
| Enter pressed twice in the last field | `press('Enter')` twice | One POST |
| Button state while pending | `goto` with a delayed `orderMock` | `toBeDisabled()` on the button until the response |
| Back after a placed order | `goBack()` after the confirmation | No second POST; the form does not resubmit |

## Back and Forward

Users go back to fix a field. A multi-step form must keep what they typed, or say clearly that it did not. These run on the real backend, so the spec is `.e2e.ts`. `goBack()` and `goForward()` return `Promise<Response | null>`, so the page-object wrappers use a block body with one `await`.

| Title | Steps |
|---|---|
| `'GIVEN a filled shipping step, going back from payment keeps the address'` | `fillShipping(ADDRESS_STUB)`, `continue()`, `THEN` payment step shown; `WHEN goBack()`, `THEN expectShipping(ADDRESS_STUB)` |
| `'GIVEN a filled shipping step, back then forward returns to payment'` | Same start; `goBack()`, `goForward()`, `THEN` payment step shown with its fields intact |
| `'GIVEN applied filters, back restores the previous set'` | See [search-filter.md](search-filter.md#url-state-and-deep-links) |

## Failing Side Services

Analytics, recommendations, and the chat widget may fail; checkout must not. Fail each one on purpose and assert that the core path still completes and nothing throws. The `pageErrors` fixture from [error-testing.md](../debugging/error-testing.md) records uncaught page errors.

```ts
// e2e/orders/degraded-services.test.ts
import { expect, test } from './orders.fixture';

test.describe('FEATURE: checkout with failing side services', () => {
  test('GIVEN a failing recommendations service, an order can still be placed', async ({ checkoutPage, pageErrors }): Promise<void> => {
    await test.step('WHEN the checkout is opened', (): Promise<void> => checkoutPage.goto({ failOn: 'recommendations' }));

    await test.step('AND the order is placed', (): Promise<void> => checkoutPage.placeOrder());

    await test.step('THEN the confirmation is shown', (): Promise<void> => checkoutPage.expectConfirmation());

    await test.step('AND no uncaught page error was raised', (): void => expect(pageErrors).toEqual([]));
  });
});
```

| Service | How it fails | Spec kind | Extra check |
|---|---|---|---|
| Recommendations (own `/api/recommendations`) | Opening-call option routes a 500 | `.test.ts` | The panel is hidden or shows its fallback |
| Analytics (third-party host) | `blockedMock()` on the tracker hosts ([third-party.md](../advanced/third-party.md#block-analytics-in-tests)) | `.e2e.ts` | No error toast reaches the user |
| Chat widget script | Opening-call option aborts the script host | `.e2e.ts` | The page renders; the chat button is absent, not broken |
| Slow side service | Mock that delays well past the page's own load | `.test.ts` | The core content is not blocked behind it |

## Checklist

- Lists: zero, one, and many each have a test; wording is singular at one.
- Inputs: max length, max plus one, whitespace only, non-ASCII, RTL.
- Every submit button: double click and double Enter produce one request.
- Multi-step forms: back keeps data; back after submit does not resubmit.
- Each non-critical service: failing it leaves the core path working and raises no page error.
