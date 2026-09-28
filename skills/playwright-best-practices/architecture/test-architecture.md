# Choosing Test Types: E2E, Component, or API

## Table of Contents

1. [Decision Matrix](#decision-matrix)
2. [API Tests](#api-tests)
3. [Component Tests](#component-tests)
4. [E2E Tests](#e2e-tests)
5. [Layering Test Types](#layering-test-types)
6. [Common Mistakes](#common-mistakes)
7. [Related](#related)

> **When to use**: Deciding which test type to write for a feature. Ask: "What's the cheapest test that gives confidence this works?"

## Decision Matrix

| Scenario                    | Recommended Type | Rationale                                     |
| --------------------------- | ---------------- | --------------------------------------------- |
| Login / auth flow           | E2E              | Cross-page, cookies, redirects, session state |
| Form submission             | Component        | Isolated validation logic, error states       |
| CRUD operations             | API              | Data integrity matters more than UI           |
| Search with results UI      | Component + API  | API for query logic; component for rendering  |
| Cross-page navigation       | E2E              | Routing, history, deep linking                |
| API error handling          | API              | Status codes, error shapes, edge cases        |
| UI error feedback           | Component        | Toast, banner, inline error rendering         |
| Accessibility               | Component        | ARIA roles, keyboard nav per-component        |
| Responsive layout           | Component        | Viewport-specific rendering without full app  |
| API contract validation     | API              | Response shapes, headers, auth                |
| WebSocket/real-time         | E2E              | Requires full browser environment             |
| Payment / checkout          | E2E              | Multi-step, third-party iframes               |
| Onboarding wizard           | E2E              | Multi-step, state persists across pages       |
| Widget behavior             | Component        | Toggle, accordion, date picker, modal         |
| Permissions / authorization | API              | Role-based access is backend logic            |

## API Tests

**Ideal for**:

- CRUD operations (create, read, update, delete)
- Input validation and error responses (400, 422)
- Permission and authorization checks
- Data integrity and business rules
- API contract verification
- Edge cases expensive to reproduce through UI
- Test data setup/teardown for E2E tests

**Avoid for**:

- Testing how errors display to users
- Browser-specific behavior (cookies, redirects)
- Visual layout or responsive design
- Flows requiring JavaScript execution or DOM interaction
- Third-party iframe interactions

HTTP calls live in a `.spec.util.ts` so a step is one call. The `managerToken` fixture posts `MANAGER_STUB` to `/api/auth/token` once per test and reads `accessToken` from the body; `staffToken` does the same with `STAFF_STUB`. `postProduct` posts through `createProduct` with the manager token and, after `use`, deletes every product the server created, so no case leaves a product behind for the next one. `existingProduct` posts `uniqueProduct()` through `postProduct` before `use` and hands over the created `Product`, so the conflict case starts with its sku already taken and no seeding step. `uniqueProduct()` in `test/utils/product-builder.spec.util.ts` spreads `PRODUCT_STUB` with a fresh sku, so parallel workers never post the same one. Each case checks the status first; a body check follows as an `expect*` util that reads the body itself.

```ts
// e2e/products/test/utils/products-api.spec.util.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

import type { PageQuery, Product, ProductPage } from '../../common/products.type';

const authHeaders = (token: string): Record<string, string> => {
  const headers = { Authorization: `Bearer ${token}` };

  return headers;
};

export const createProduct = (request: APIRequestContext, token: string, product: Partial<Product>): Promise<APIResponse> => {
  return request.post('/api/products', { data: product, headers: authHeaders(token) });
};

export const deleteProduct = (request: APIRequestContext, token: string, id: string): Promise<APIResponse> => {
  return request.delete(`/api/products/${id}`, { headers: authHeaders(token) });
};

export const listProducts = (request: APIRequestContext, token: string, params: PageQuery): Promise<APIResponse> => {
  return request.get('/api/products', { headers: authHeaders(token), params });
};

export const expectItemsAtMost = async (response: APIResponse, limit: number): Promise<void> => {
  const body: ProductPage = await response.json();

  expect(body.items.length).toBeLessThanOrEqual(limit);
};
```

```ts
// e2e/products/products-api.e2e.ts
import type { APIResponse } from '@playwright/test';

import type { Product } from './common/products.type';
import { expect, test } from './products.fixture';
import { PRODUCT_STUB } from './test/stubs/product.stub';
import { uniqueProduct } from './test/utils/product-builder.spec.util';
import { deleteProduct, expectItemsAtMost, listProducts } from './test/utils/products-api.spec.util';

test.describe('FEATURE: products API', () => {
  test('GIVEN a new sku, posting the product returns 201', async ({ postProduct }): Promise<void> => {
    const response = await test.step('WHEN the product is posted', (): Promise<APIResponse> => postProduct(uniqueProduct()));

    await test.step('THEN the status is 201', (): void => expect(response.status()).toBe(201));
  });

  test('GIVEN an existing sku, posting it again returns 409', async ({ existingProduct, postProduct }): Promise<void> => {
    const duplicate: Partial<Product> = { ...PRODUCT_STUB, sku: existingProduct.sku };

    const response = await test.step('WHEN the same sku is posted again', (): Promise<APIResponse> => postProduct(duplicate));

    await test.step('THEN the status is 409', (): void => expect(response.status()).toBe(409));
  });

  test('GIVEN a missing sku, posting returns 422', async ({ postProduct }): Promise<void> => {
    const response = await test.step('WHEN a product without a sku is posted', (): Promise<APIResponse> => postProduct({ name: 'Incomplete' }));

    await test.step('THEN the status is 422', (): void => expect(response.status()).toBe(422));
  });

  test('GIVEN a limit of twenty, listing the first page returns at most twenty items', async ({ managerToken, request }): Promise<void> => {
    const response = await test.step('WHEN the first page is listed', (): Promise<APIResponse> => listProducts(request, managerToken, { limit: '20', page: '1' }));

    await test.step('THEN the status is 200', (): void => expect(response.status()).toBe(200));

    await test.step('AND the items are capped at twenty', (): Promise<void> => expectItemsAtMost(response, 20));
  });

  test('GIVEN a staff token, deleting a product returns 403', async ({ request, staffToken }): Promise<void> => {
    const response = await test.step('WHEN a product is deleted', (): Promise<APIResponse> => deleteProduct(request, staffToken, '123'));

    await test.step('THEN the status is 403', (): void => expect(response.status()).toBe(403));
  });
});
```

Body assertions follow the list case: the status check first, then an `expect*` util that reads the body typed with the response type and holds one assertion (`toMatchObject` for echoed fields, `toContainEqual(expect.objectContaining({ field: 'sku' }))` for a 422 error list, `toHaveProperty('totalCount')` for pagination metadata). No step only reads the body.

## Component Tests

**Ideal for**:

- Form validation (required fields, format rules, error messages)
- Interactive widgets (modals, dropdowns, accordions, date pickers)
- Conditional rendering (show/hide, loading states, empty states)
- Accessibility per-component (ARIA attributes, keyboard navigation)
- Responsive layout at different viewports
- Visual states (hover, focus, disabled, selected)

**Avoid for**:

- Testing routing or navigation between pages
- Flows requiring real cookies, sessions, or server-side state
- Data persistence or API contract validation
- Third-party iframe interactions
- Anything requiring multiple pages or browser contexts

`mount` returns a `Locator`; a helper object in `helpers/` owns every child locator and assertion. The mount util wraps the JSX so a step stays one call. `Mount` is `(component: JSX.Element) => Promise<MountResult>` in `common/contact-form.type.ts`.

```tsx
// e2e/contact-form/test/utils/mount.spec.util.tsx
import { ContactForm } from '../../../../src/components/ContactForm';
import type { ContactMessage, Mount, SubmitHandler } from '../../common/contact-form.type';
import { ContactFormHelper } from '../../helpers/contact-form.helper';

export const noop = (): void => {};

export const recordInto = (submissions: ContactMessage[]): SubmitHandler => {
  return (data: ContactMessage): void => {
    submissions.push(data);
  };
};

export const mountContactForm = async (mount: Mount, onSubmit: SubmitHandler = noop, submitting = false): Promise<ContactFormHelper> => {
  const root = await mount(<ContactForm onSubmit={onSubmit} submitting={submitting} />);

  return new ContactFormHelper(root);
};
```

```tsx
// e2e/contact-form/contact-form.test.tsx
import { expect, test } from '@playwright/experimental-ct-react';

import type { ContactMessage } from './common/contact-form.type';
import type { ContactFormHelper } from './helpers/contact-form.helper';
import { MESSAGE_STUB } from './test/stubs/message.stub';
import { mountContactForm, noop, recordInto } from './test/utils/mount.spec.util';

test.describe('FEATURE: contact form', () => {
  test('GIVEN an empty form, submitting shows both required-field errors', async ({ mount }): Promise<void> => {
    const form = await test.step('WHEN the form is mounted', (): Promise<ContactFormHelper> => mountContactForm(mount));

    await test.step('AND the empty form is submitted', (): Promise<void> => form.submit());

    await test.step('THEN the name and email errors are shown', (): Promise<void> => form.expectErrors(['Name is required', 'Email is required']));
  });

  test('GIVEN a malformed email, submitting shows the email error', async ({ mount }): Promise<void> => {
    const message: ContactMessage = { ...MESSAGE_STUB, email: 'invalid-email' };
    const form = await test.step('WHEN the form is mounted', (): Promise<ContactFormHelper> => mountContactForm(mount));

    await test.step('AND the form is filled and submitted', (): Promise<void> => form.send(message));

    await test.step('THEN the email error is shown', (): Promise<void> => form.expectErrors(['Enter a valid email']));
  });

  test('GIVEN valid data, submitting calls onSubmit once', async ({ mount }): Promise<void> => {
    const submissions: ContactMessage[] = [];
    const form = await test.step('WHEN the form is mounted', (): Promise<ContactFormHelper> => mountContactForm(mount, recordInto(submissions)));

    await test.step('AND the form is filled and submitted', (): Promise<void> => form.send(MESSAGE_STUB));

    await test.step('THEN the handler received the message', (): void => expect(submissions).toEqual([MESSAGE_STUB]));
  });

  test('GIVEN a form mid-submit, the send button is disabled', async ({ mount }): Promise<void> => {
    const form = await test.step('WHEN the form is mounted', (): Promise<ContactFormHelper> => mountContactForm(mount, noop, true));

    await test.step('THEN the send button is disabled', (): Promise<void> => form.expectSubmitting());
  });
});
```

| Further case | Helper-object method |
| --- | --- |
| Labels are associated with inputs | `expectLabelledInputs()` asserts `getByRole('textbox', { name })` for `Name` and `Email`. |
| Visual states (hover, focus, disabled) | One `expect*` method per state, one scenario per prop set, its opening `WHEN` step mounting those props. |

## E2E Tests

**Ideal for**:

- Critical user flows that generate revenue (checkout, signup)
- Authentication flows (login, SSO, MFA, password reset)
- Multi-page workflows where state carries across navigation
- Flows involving third-party iframes (payment widgets)
- Smoke tests validating the entire stack
- Real-time collaboration requiring multiple browser contexts

**Avoid for**:

- Testing every form validation permutation
- CRUD operations where UI is a thin wrapper
- Verifying individual component states
- Testing API response shapes or error codes
- Responsive layout at every breakpoint
- Edge cases that only affect the backend

Seed data through the API in a fixture, never through the UI and never in a step. The `upgradePage` fixture calls `seedAccount(page.request, 'free')` before `use`, so the spec starts on a free account and its title names that state. The third-party payment iframe is a helper object scoped to a `FrameLocator`; `UpgradePage` exposes it as `paymentFrame`, built from `page.frameLocator('iframe[title="Secure Payment"]')`.

```ts
// e2e/subscription/helpers/payment-frame.helper.ts
import type { FrameLocator, Locator } from '@playwright/test';

import type { Card } from '../common/subscription.type';

export class PaymentFrameHelper {
  public readonly cardNumberInput: Locator;
  public readonly cvvInput: Locator;
  public readonly expiryInput: Locator;

  public constructor(frame: FrameLocator) {
    this.cardNumberInput = frame.getByLabel('Card number');
    this.cvvInput = frame.getByLabel('CVV');
    this.expiryInput = frame.getByLabel('Expiry');
  }

  public async fillCard(card: Card): Promise<void> {
    await this.cardNumberInput.fill(card.number);
    await this.expiryInput.fill(card.expiry);
    await this.cvvInput.fill(card.cvv);
  }
}
```

```ts
// e2e/subscription/subscription.e2e.ts
import { test } from './subscription.fixture';
import { BILLING_STUB } from './test/stubs/billing.stub';
import { CARD_STUB } from './test/stubs/card.stub';

test.describe('FEATURE: subscription upgrade', () => {
  test('GIVEN a free account, buying the premium plan shows the subscription number on the welcome page', async ({ successPage, upgradePage }): Promise<void> => {
    await test.step('WHEN the upgrade page is opened', (): Promise<void> => upgradePage.goto());

    await test.step('AND the premium plan is selected', (): Promise<void> => upgradePage.selectPlan('Premium'));

    await test.step('AND the billing details are entered', (): Promise<void> => upgradePage.fillBilling(BILLING_STUB));

    await test.step('AND the card details are entered in the payment frame', (): Promise<void> => upgradePage.paymentFrame.fillCard(CARD_STUB));

    await test.step('AND the user subscribes', (): Promise<void> => upgradePage.subscribe());

    await test.step('THEN the welcome page shows the subscription number', (): Promise<void> => successPage.expectSubscribed());
  });
});
```

`successPage.expectSubscribed()` is one `expect*` method holding, as three plain `await expect(…)` lines, `toHaveURL(/\/account\/subscription\/success/)`, the `Welcome to Premium` heading, and the `/Subscription #\d+/` text: three assertions on one state.

## Layering Test Types

Effective test suites combine all three types. Example for an "inventory management" feature:

### API Layer (60% of tests)

Cover every backend logic permutation. Cheap to run and maintain.

```text
e2e/inventory/inventory-api.e2e.ts
  FEATURE: inventory API
    GIVEN a new sku, posting the item returns 201
    GIVEN an existing sku, posting it again returns 409
    GIVEN a non-numeric quantity, posting returns 422
    GIVEN missing required fields, posting returns 422
    GIVEN a limit of twenty, listing returns at most twenty items
    GIVEN a category filter, listing returns only that category
    GIVEN a new stock level, patching the item stores it
    GIVEN an active item, archiving it removes it from the active list
    GIVEN an item with pending orders, archiving it returns 409
    GIVEN a warehouse-staff token, deleting an item returns 403
    GIVEN no token, any request returns 401
```

### Component Layer (30% of tests)

Cover every visual state and interaction.

```text
e2e/inventory/inventory-form.test.tsx
  FEATURE: inventory form
    GIVEN an empty form, submitting shows the validation errors
    GIVEN an invalid sku, entering it shows an inline error
    GIVEN valid data, submitting calls onSubmit once
    GIVEN a save that succeeds, submitting resets the form
    GIVEN a save in progress, the submit button is disabled

e2e/inventory/inventory-table.test.tsx
  FEATURE: inventory table
    GIVEN three items, the table renders one row per item
    GIVEN unsorted rows, clicking a column header sorts by that column
    GIVEN an active row, clicking archive opens the confirmation modal
    GIVEN mixed stock levels, the badges are coloured by level
    GIVEN an empty list, the table shows the empty state
```

### E2E Layer (10% of tests)

Cover only critical paths proving full stack works.

```text
e2e/inventory/inventory.e2e.ts
  FEATURE: inventory management
    GIVEN a manager, creating an item adds it to the list
    GIVEN a manager, updating a stock level shows the new level in the list
    GIVEN a warehouse-staff member, opening admin settings is denied
```

### Execution Profile

For this feature:

- **11 API tests** — ~2 seconds total, no browser
- **10 component tests** — ~5 seconds total, real browser but no server
- **3 E2E tests** — ~15 seconds total, full stack

Total: 24 tests, ~22 seconds. API tests catch most regressions. Component tests catch UI bugs. E2E tests prove wiring works. If E2E fails but API and component pass, the problem is in integration (routing, state management, API client).

## Common Mistakes

| Anti-Pattern                              | Problem                                                  | Better Approach                                                |
| ----------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| E2E for every validation rule             | 30-second browser test for something API covers in 200ms | API test for validation, one component test for error display  |
| No API tests, all E2E                     | Slow suite, flaky from UI timing, hard to diagnose       | API tests for data/logic, E2E for critical paths only          |
| Component tests mocking everything        | Tests pass but app broken because mocks drift            | Mock only external boundaries; API tests verify real contracts |
| Same assertion in API, component, AND E2E | Triple maintenance cost                                  | Each layer tests what it uniquely verifies                     |
| E2E creating test data via UI             | 2-minute test where 90 seconds is setup                  | Seed via API in a fixture, test actual flow                    |
| Testing third-party behavior              | Testing that Stripe validates cards (Stripe's job)       | Mock Stripe; trust their contract                              |
| Skipping API layer                        | Can't tell if bug is frontend or backend                 | API tests isolate backend; component tests isolate frontend    |
| One giant E2E for entire feature          | 5-minute test failing somewhere with no clear cause      | Focused E2E per critical path; one `test.step()` per action    |

## Related

- [test-suite-structure.md](../core/test-suite-structure.md) — file structure and naming
- [api-testing.md](../testing-patterns/api-testing.md) — Playwright's `request` API for HTTP testing
- [component-testing.md](../testing-patterns/component-testing.md) — setting up component tests
- [authentication.md](../advanced/authentication.md) — auth flow patterns with `storageState`
- [when-to-mock.md](when-to-mock.md) — when to mock vs hit real services
- [pom-vs-fixtures.md](pom-vs-fixtures.md) — organizing shared test logic
