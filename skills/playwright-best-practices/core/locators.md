# Locator Strategies

## Table of Contents

1. [Priority Order](#priority-order)
2. [User-Facing Locators](#user-facing-locators)
3. [Filtering & Chaining](#filtering--chaining)
4. [Dynamic Content](#dynamic-content)
5. [Shadow DOM](#shadow-dom)
6. [Iframes](#iframes)

## Priority Order

Use locators in this order of preference:

1. **Role-based** (most resilient): `getByRole`
2. **Label-based**: `getByLabel`, `getByPlaceholder`
3. **Text-based**: `getByText`, `getByTitle`
4. **Test IDs** (when semantic locators aren't possible): `getByTestId`
5. **CSS/XPath** (last resort): `locator('css=...')`, `locator('xpath=...')`

Every locator is a `public readonly` field of a page object or helper object, assigned in the constructor. A spec never calls `page.getBy*` or `page.locator`; see [page-object-model.md](page-object-model.md).

## User-Facing Locators

One page object shows each user-facing query in its house position. The tables below list the variants.

```ts
// e2e/signup/pages/signup.page.ts
import type { Locator, Page } from '@playwright/test';

export class SignupPage {
  public readonly alert: Locator;
  public readonly countrySelect: Locator;
  public readonly emailInput: Locator;
  public readonly heading: Locator;
  public readonly homeLink: Locator;
  public readonly rememberMeCheckbox: Locator;
  public readonly searchInput: Locator;
  public readonly submitButton: Locator;
  public readonly welcomeText: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.alert = page.getByRole('alert');
    this.countrySelect = page.getByRole('combobox', { name: 'Country' });
    this.emailInput = page.getByLabel('Email address');
    this.heading = page.getByRole('heading', { level: 1, name: 'Welcome' });
    this.homeLink = page.getByRole('link', { name: 'Home' });
    this.rememberMeCheckbox = page.getByRole('checkbox', { name: 'Remember me' });
    this.searchInput = page.getByPlaceholder('Enter your email');
    this.submitButton = page.getByRole('button', { exact: true, name: 'Submit' });
    this.welcomeText = page.getByText('Welcome to our site', { exact: true });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/signup');
  }
}
```

### getByRole

Most robust approach - matches how users and assistive technology perceive the page.

| Query | Matches |
|---|---|
| `getByRole('button', { name: 'Submit', exact: true })` | Exact accessible name |
| `getByRole('button', { name: /submit/i })` | Case-insensitive regex |
| `getByRole('link', { name: 'Home' })` | Link by accessible name |
| `getByRole('textbox', { name: 'Email' })` | Text input by label |
| `getByRole('checkbox', { name: 'Remember me' })` | Checkbox |
| `getByRole('combobox', { name: 'Country' })` | Select or combobox |
| `getByRole('radio', { name: 'Option A' })` | Radio button |
| `getByRole('heading', { name: 'Welcome', level: 1 })` | Heading of a given level |
| `getByRole('list').getByRole('listitem')` | Items inside a list |
| `getByRole('navigation')`, `getByRole('main')`, `getByRole('dialog')`, `getByRole('alert')` | Landmarks and live regions |

### getByLabel

For form elements with associated labels.

| Query | Matches |
|---|---|
| `getByLabel('Email address')` | Input with `<label for="email">` |
| `getByLabel('Search')` | Input with `aria-label="Search"` |
| `getByLabel('Email', { exact: true })` | Exact label text only |

### getByPlaceholder

| Query | Matches |
|---|---|
| `getByPlaceholder('Enter your email')` | Exact placeholder |
| `getByPlaceholder(/email/i)` | Regex |

### getByText

| Query | Matches |
|---|---|
| `getByText('Welcome')` | Partial match (default) |
| `getByText('Welcome to our site', { exact: true })` | Exact match |
| `getByText(/welcome/i)` | Regex |

### getByTestId

The attribute defaults to `data-testid`. Configure another one in the config `use` block:

```ts
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

const use = { testIdAttribute: 'data-test' };

export default defineConfig({ use });
```

For `<button data-testid="submit-btn">Submit</button>` the field is `page.getByTestId('submit-btn')`.

## Filtering & Chaining

### filter()

A filtered or chained locator is still a page-object field. A chain starts on a name, so the shared base is a local const and each filtered field derives from it. A method that needs an index returns a `Locator`.

```ts
// e2e/products/pages/products.page.ts
import type { Locator, Page } from '@playwright/test';

export class ProductsPage {
  public readonly articleHeading: Locator;
  public readonly buyableItems: Locator;
  public readonly cheapProducts: Locator;
  public readonly firstItem: Locator;
  public readonly inStockItems: Locator;
  public readonly lastItem: Locator;
  public readonly productItems: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    const listItems = page.getByRole('listitem');
    const buyButton = page.getByRole('button', { name: 'Buy' });
    const productItems = listItems.filter({ hasText: 'Product' });

    this.page = page;
    this.articleHeading = page.getByRole('article').getByRole('heading');
    this.buyableItems = listItems.filter({ has: buyButton });
    this.cheapProducts = productItems.filter({ has: page.getByText('$9.99') });
    this.firstItem = listItems.first();
    this.inStockItems = listItems.filter({ hasNotText: 'Out of stock' });
    this.lastItem = listItems.last();
    this.productItems = productItems;
  }

  public item(index: number): Locator {
    return this.productItems.nth(index);
  }

  public async goto(): Promise<void> {
    await this.page.goto('/products');
  }
}
```

| Filter | Narrows to |
|---|---|
| `filter({ hasText: 'Product' })` | Items whose text contains `Product` |
| `filter({ hasNotText: 'Out of stock' })` | Items whose text does not contain it |
| `filter({ has: locator })` | Items containing a matching child |
| `filter({ hasText }).filter({ has })` | Both conditions |

### Chaining

| Chain | Reaches |
|---|---|
| `getByRole('article').getByRole('heading')` | Down the DOM tree |
| `getByText('Child').locator('..')` | Parent |
| `getByText('Child').locator('xpath=ancestor::article')` | Ancestor |

### nth() and first()/last()

| Call | Picks |
|---|---|
| `.first()` | First match |
| `.last()` | Last match |
| `.nth(2)` | Third match (0-indexed) |

## Dynamic Content

### Waiting for Elements

Locators auto-wait for actionability by default. Explicit state waits are web-first assertions inside a boxed `expect*` method, never `waitFor` in a spec.

```ts
// e2e/products/pages/products.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ProductsPage {
  public readonly loadingText: Locator;
  public readonly productItems: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.loadingText = page.getByText('Loading');
    this.productItems = page.getByRole('listitem');
  }

  public async expectLoaded(): Promise<void> {
    await test.step('THEN loading indicator is gone', (): Promise<void> => expect(this.loadingText).toBeHidden(), { box: true });
  }

  public async expectItemCount(count: number): Promise<void> {
    await test.step(`THEN ${count} items are listed`, (): Promise<void> => expect(this.productItems).toHaveCount(count), { box: true });
  }

  public async expectAllItemsVisible(): Promise<void> {
    const items = await this.productItems.all();

    for (const item of items) {
      await test.step('THEN item is visible', (): Promise<void> => expect(item).toBeVisible(), { box: true });
    }
  }
}
```

| `waitFor` state | Web-first assertion |
|---|---|
| `{ state: 'visible' }` | `expect(locator).toBeVisible()` |
| `{ state: 'hidden' }` | `expect(locator).toBeHidden()` |
| `{ state: 'attached' }` | `expect(locator).toBeAttached()` |
| `{ state: 'detached' }` | `expect(locator).not.toBeAttached()` |

> **For comprehensive waiting strategies** (element state, navigation, network, polling with `toPass()`), see [assertions-waiting.md](assertions-waiting.md#waiting-strategies).

### Lists with Dynamic Items

`expectItemCount` above waits for a specific count; `expectAllItemsVisible` reads every match with `locator.all()` and asserts each one. `all()` does not wait, so call `expectItemCount` first when the list is still loading.

## Shadow DOM

Playwright pierces shadow DOM by default, so `page.getByRole('button', { name: 'Shadow Button' })` finds a button inside a shadow root with no extra syntax. Explicit traversal, when needed, is `page.locator('my-component').locator('internal:shadow=button')`.

## Iframes

A frame is a `FrameLocator` field; locators inside it chain from that field.

```ts
// e2e/editor/pages/editor.page.ts
import type { FrameLocator, Locator, Page } from '@playwright/test';

export class EditorPage {
  public readonly contentFrame: FrameLocator;
  public readonly innerContent: Locator;
  public readonly saveButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.contentFrame = page.frameLocator('iframe[name="content"]');
    this.innerContent = page.frameLocator('#outer').frameLocator('#inner').getByText('Content');
    this.saveButton = this.contentFrame.getByRole('button', { name: 'Save' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/editor');
  }

  public async save(): Promise<void> {
    await this.saveButton.click();
  }
}
```

| Selector | Frame |
|---|---|
| `page.frameLocator('iframe[name="content"]')` | By name or URL attribute |
| `page.frameLocator('iframe').first()` | By index |
| `page.frameLocator('#outer').frameLocator('#inner')` | Nested iframes |

## Debugging Locators

| Call | Use |
|---|---|
| `await locator.highlight()` | Highlight the element in headed mode |
| `await locator.count()` | Count matches without waiting |
| `(await locator.count()) > 0` | Check existence without waiting |
| `PWDEBUG=1 npx playwright test` | Open the Playwright Inspector |

```bash
PWDEBUG=1 npx playwright test
```

## Common Issues & Solutions

| Issue                   | Solution                                         |
| ----------------------- | ------------------------------------------------ |
| Multiple elements match | Add filters or use `nth()`, `first()`, `last()`  |
| Element not found       | Check visibility, wait for load, verify selector |
| Stale element           | Locators are lazy; re-query if DOM changes       |
| Dynamic IDs             | Use stable attributes like role, text, test-id   |
| Hidden elements         | Use `{ force: true }` only when necessary        |

## Anti-Patterns to Avoid

| Anti-Pattern                      | Problem                           | Solution                                          |
| --------------------------------- | --------------------------------- | ------------------------------------------------- |
| `page.locator('.btn-primary')`    | Brittle, implementation-dependent | `page.getByRole('button', { name: 'Submit' })`    |
| `page.locator('#dynamic-id-123')` | Breaks when IDs change            | Use stable attributes like role, text, or test-id |
| `page.getByRole(...)` in a spec   | Spec knows the DOM                | Move the locator to the page object               |
| Testing implementation details    | Breaks on refactoring             | Test user-visible behavior                        |

## Related References

- **Debugging selector issues**: See [debugging.md](../debugging/debugging.md) for troubleshooting
- **Waiting for elements**: See [assertions-waiting.md](assertions-waiting.md) for waiting strategies
- **Using in Page Objects**: See [page-object-model.md](page-object-model.md) for organizing locators
