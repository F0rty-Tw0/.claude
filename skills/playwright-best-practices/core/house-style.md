# House Style

Read this file before any other reference in this skill. Every code sample in this skill follows these rules; every Playwright file written with this skill follows them too. Where a Playwright doc or an older test in the repo disagrees, this file wins.

**REQUIRED BACKGROUND:** skill:artification. `references/typescript-style.md` applies unchanged. `references/spec-style.md` applies with one override, stated in its Scope section: Playwright has `test.step`, so `WHEN` / `THEN` move from `describe` / `it` into steps and the `test` title is `GIVEN <state>, <outcome>`. This file adds only what Playwright needs on top.

## Contents

- [Core Principle](#core-principle)
- [Quick Reference](#quick-reference)
- [Layout](#layout)
- [Spec Shape](#spec-shape)
- [Steps](#steps)
- [Page Objects](#page-objects)
- [Fixtures](#fixtures)
- [Test Data and Mocks](#test-data-and-mocks)
- [Configuration](#configuration)
- [Sample Style in This Skill](#sample-style-in-this-skill)
- [Rationalizations](#rationalizations)
- [Red Flags](#red-flags)
- [Common Mistakes](#common-mistakes)

## Core Principle

A spec is a list of named steps. A step is one call. The call lives in a page object, a fixture, or a util, so the spec reads as prose and the trace reads as the spec. Only the spec opens steps: the trace is one level deep, and every keyword in it appears once.

## Quick Reference

| Concern | Rule |
|---|---|
| Naming tree | Flat: `test.describe('FEATURE: <name>')` → `test('GIVEN <state>, <outcome>')`. One describe per spec, never nested. The title is the test's only `GIVEN`: it names the state that sets the test apart (`'GIVEN a failed create, saving warns and keeps the sheet open'`), and every arrange step in the body continues it with `AND`. Never a `GIVEN` or `WHEN` describe, no `SCENARIO:` prefix, no `GIVEN` step. |
| Test body | Every statement inside `test(...)` is `await test.step('<prose>', ...)`. No bare `page.*`, `expect(...)`, or page-object call outside a step. |
| Step body | One call. `(): Promise<void> => loginPage.submit(user)`. Two or more statements mean a page-object or fixture method is missing. |
| Step naming | Upper-case keyword, then present-tense prose: `'WHEN wrong credentials are submitted'`, `'THEN the error names invalid credentials'`. `AND` for arrange (it continues the title's `GIVEN`), `WHEN` for the action, `THEN` for the first assertion, `AND` for each further step of the same kind. |
| Steps only in the spec | `test.step` appears only in `.e2e.ts` / `.test.ts` bodies and their hooks. Page objects, helper objects, fixtures, and utils never open a step, so no step nests inside another and nothing is boxed. |
| One owner per file | One page object, one helper object, one fixture file, one route-mock file, one stub file per `.ts`. One `FEATURE:` per spec. |
| File size | Source `.ts` under 150 lines, spec under 300, blank and comment lines skipped. Over means split by concern per `module-size.md`. |
| Page object | `class` with `private readonly page: Page`, `public readonly` locators assigned in the constructor, `public async` methods returning `Promise<void>`. No parameter properties. `expect` only inside `expect*` methods. |
| Locator access | Specs never call `page.getBy*` or `page.locator`. Every locator is a page-object or helper-object field. |
| Spec name | `<feature>.test.ts` when the spec, or a fixture, page object, or mock it imports, routes your own origin: `**/api/**`, `**/graphql`, `**/ws/**`, own assets, `routeFromHAR`. `<feature>.e2e.ts` otherwise, including specs that only stub third-party hosts (payment gateway, analytics, OAuth provider). Component specs are `<feature>.test.tsx`. Never `.spec.ts`; that suffix is the artification unit-test name. |
| Fixtures | One `test.extend` per feature in `<feature>.fixture.ts`. Fixture shape is a named `type <Feature>Fixtures` with `readonly` members. Specs import `test` and `expect` from the fixture file, never from `@playwright/test` when a fixture exists. |
| Types | `type` never `interface`. Every property `readonly`. Arrays `T[]`. No inline object type literals. Cross-file types in `common/<feature>.type.ts`; types every feature shares in `e2e/common/playwright.type.ts`. |
| Shared types | `RouteHandler` is declared once, in `e2e/common/playwright.type.ts`, and imported. A `type RouteHandler = …` in a `.mock.ts` is the same type spelled again; two copies drift the day the signature changes. |
| Return types | Every function, arrow, and method declares its return type. `test`, hook, fixture, and step callbacks: `async ({ page }): Promise<void> =>` or the value type a step returns. `test.describe` callbacks stay `() => {`, matching `spec-style.md`. |
| Imports | `import type { Locator, Page } from '@playwright/test';` on its own line above `import { expect, test } from '@playwright/test';`. Groups and members alphabetical. |
| Quotes | Single quotes. Template literals only with interpolation. |
| Casts | No `as` except `as const`. A `page.evaluate` result gets a generic argument, not a cast. |
| Comments | None inside samples except a first-line path comment `// e2e/login/pages/login.page.ts`. Explanation lives in the prose above the block. |
| Waits | No `waitForTimeout`. No `waitForSelector` when a web-first `expect` covers it. No manual retry loops around `expect`. |
| Data | Base values are typed stubs in `test/stubs/`, spread and overridden per case. Route handlers are factories in `test/mocks/`. Builders and utils are functions in `test/utils/*.spec.util.ts`. |
| Intercepted payload | Every body a mock fulfills is a typed stub imported from `test/stubs/`. A mock declares no payload of its own: no inline literal in `route.fulfill`, no `const <X>_BODY` in the mock file. |
| Mock signature | `export const <name>Mock = (<payload>: <Type> = <TYPE>_STUB): RouteHandler => …`. The default serves the happy path; a fixture or spec passes a spread of the stub to override one field. |
| Payload type | The response contract is a named type in `common/<feature>.type.ts`, or `test/common/<feature>.type.ts` when production never imports it. An untyped stub is not a stub. |
| Config | `defineConfig` receives named consts for every nested object (`use`, `projects`, `reporter`). No inline nested literals. |
| Gate | `npx playwright test --reporter=list` green, `--repeat-each=3` green for the touched specs, typecheck clean, lint clean, no file over its ceiling. |

## Layout

```text
e2e/
  playwright.config.ts
  playwright.fixture.ts                 mergeTests of every feature fixture
  common/
    playwright.type.ts                  types every feature shares, e.g. RouteHandler
    playwright.const.ts                 BASE_URL, timeouts, shared paths
  <feature>/
    <feature>.e2e.ts                    real backend; third-party hosts may be stubbed
    <feature>.test.ts                   own api, graphql, ws, or assets routed
    <feature>.fixture.ts                test.extend for this feature
    common/
      <feature>.type.ts                 types the feature exports
      <feature>.const.ts                shared runtime constants, optional
    helpers/
      <name>.helper.ts                  reusable widget scoped to a Locator
    pages/
      <name>.page.ts                    one page object
    test/
      fixtures/                         on-disk files the subject reads or uploads
      mocks/
        <name>.mock.ts                  page.route handler factories
      stubs/
        <feature>.stub.ts               typed base values
      utils/
        <behavior>.spec.util.ts         test-only builders and utils
    utils/
      <behavior>.util.ts                pure, production-grade utils
```

Two words collide here and stay distinct:

| Word | Meaning | Location |
|---|---|---|
| Playwright fixture | Value injected by `test.extend` | `<feature>.fixture.ts` at the feature root |
| Artification fixture | Real file the subject reads from disk | `test/fixtures/` |
| Artification spec | Vitest unit case, `<module>.spec.ts` | Never inside `e2e/` |

`test/` holds only the sub-folders it needs. No barrels. Production code never imports from `test/`.

## Spec Shape

```ts
// e2e/login/login.e2e.ts
import type { Credentials } from './common/login.type';
import { expect, test } from './login.fixture';
import { USER_STUB } from './test/stubs/user.stub';

test.describe('FEATURE: login', () => {
  test('GIVEN valid credentials, submitting opens the dashboard', async ({ dashboardPage, loginPage, page }): Promise<void> => {
    await test.step('AND the login page is open', (): Promise<void> => loginPage.goto());

    await test.step('WHEN valid credentials are submitted', (): Promise<void> => loginPage.submit(USER_STUB));

    await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));

    await test.step('AND the greeting names the user', (): Promise<void> => dashboardPage.expectGreeting(USER_STUB.displayName));
  });

  test('GIVEN a wrong password, submitting shows the error banner', async ({ loginPage }): Promise<void> => {
    const user: Credentials = { ...USER_STUB, password: 'wrong' };

    await test.step('AND the login page is open', (): Promise<void> => loginPage.goto());

    await test.step('WHEN the wrong password is submitted', (): Promise<void> => loginPage.submit(user));

    await test.step('THEN the error banner reports invalid credentials', (): Promise<void> => loginPage.expectError('Invalid credentials'));
  });
});
```

| Concern | Rule |
|---|---|
| `describe` text | Exactly one `test.describe('FEATURE: <name>')` per spec, wrapping every test. No nested describe, so no `GIVEN` describe: the report tree is `file → FEATURE → GIVEN <state>, <outcome>`. |
| State in title | The title's `GIVEN` names the state that distinguishes the test: `'GIVEN a failed list, both lists show a load error'`. A state every test in the spec shares (`the login page is open`) is not what the title names; name the input or condition that differs instead (`'GIVEN a wrong password, submitting shows the error banner'`). |
| `test` text | `GIVEN`, the distinguishing state, a comma, then the outcome, as one lower-case present-tense sentence: `'GIVEN a wrong password, submitting shows the error banner'`. `WHEN` / `THEN` never appear in the title; they are steps. No "should". |
| Step keywords | Every step in a spec starts with `WHEN`, `THEN`, or `AND`; `GIVEN` belongs to the title. A test holds exactly one `WHEN` and at least one `THEN`. `beforeEach` steps are `AND`. |
| Step order | `AND`* (arrange) → `WHEN` → `AND`* (further actions) → `THEN` → `AND` / `THEN`. One `WHEN` per test; a further action is `AND` (`AND 5 more minutes pass`). Independent phases are separate tests. |
| Arrange | Arrange steps are `AND`. A step that only registers a route takes 0 ms and shows nothing in the trace, so it is never a step of its own: the opening call takes the condition and registers the mock before it navigates, `alertsPage.goto({ failOn: 'delete' })` → `'AND the alerts overview is open with deletes rejected'`. Arrange shared by every test in the spec may go in a `FEATURE`-level `beforeEach`, itself an `AND` step. When the arrange is API seeding, a fixture seeds, opens the page, and hands over the ready page object instead; see [Requirement Annotation](annotations.md#requirement-annotation). Case-specific data is a `const` above the first step, blank line after. |
| `test.use` options | `test.use` cannot run inside a test, and there is no describe to scope it. An option the browser can change at runtime is an `AND` arrange step: `page.setViewportSize`, `context.grantPermissions` / `clearPermissions`, `page.clock.install`. An option fixed at context creation (`locale`, `storageState`, `timezoneId`, device) that differs from the rest of the spec moves the scenarios to their own spec with a file-level `test.use` and its own `FEATURE`: `store-finder-denied.e2e.ts`. The same scenarios across several option values are a project per value in `playwright.config`, not a loop of describes. |
| Steps | One step per action or per assertion group. Blank line between steps. |
| Fixtures in signature | Destructure only what the test uses, alphabetical. |
| Tags | `test('GIVEN <state>, <outcome>', { tag: ['@smoke'] }, async …)`. Tags are the second argument, never in the title. |
| Annotations | `test.skip`, `test.fixme`, `test.slow` carry a reason string. |
| Requirement link | A test that covers a written requirement declares its ID in the details object: `test('GIVEN <state>, <outcome>', { annotation: { description: 'CHK-2', type: 'requirement' } }, async …)`. One ID per test. See [annotations.md](annotations.md#requirement-annotation). |

## Steps

A step is the unit of the trace and the unit of the spec. Rules:

| Concern | Rule |
|---|---|
| Body | One expression. `(): Promise<void> => loginPage.submit(user)`. |
| Assertion step | One `expect` call or one page-object `expect*` method. Two related assertions on one state go in one page-object `expect*` method as two plain `await expect(…)` lines. |
| Naming | Keyword plus what the user does or what is now true: `'WHEN the item is added to the cart'`, `'THEN the cart badge shows one item'`. |
| Return value | A step may return a value: `const orderId = await test.step('WHEN the order is placed', (): Promise<string> => checkoutPage.placeOrder());`. |
| Sync `expect` | `expect(value).toBe(…)` on a plain value is synchronous: the step callback is `(): void =>`. Only `expect(locator)` / `expect(page)` matchers and `expect.poll` return promises and take `(): Promise<void> =>`. |
| Non-void calls | `page.goto` / `reload` / `goBack` return `Promise<Response \| null>`; `route`, `addInitScript`, `exposeFunction`, `exposeBinding` return `Promise<Disposable>` since Playwright 1.63. An expression body cannot be typed `Promise<void>`, so use a block body with one `await`: `async (): Promise<void> => { await page.route('**/api/x', xMock()); }`. Still one call. Same for a util or mock arrow that wraps one of these. |

Before, a body with no steps and inline locators:

```ts avoid
test('login works', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
});
```

After, the spec is steps and the page object owns the locators:

```ts
// e2e/login/login.e2e.ts
test('GIVEN valid credentials, submitting opens the dashboard', async ({ loginPage, page }): Promise<void> => {
  await test.step('AND the login page is open', (): Promise<void> => loginPage.goto());

  await test.step('WHEN valid credentials are submitted', (): Promise<void> => loginPage.submit(USER_STUB));

  await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));
});
```

## Page Objects

```ts
// e2e/login/pages/login.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { Credentials } from '../common/login.type';

export class LoginPage {
  public readonly emailInput: Locator;
  public readonly errorBanner: Locator;
  public readonly passwordInput: Locator;
  public readonly submitButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.errorBanner = page.getByRole('alert');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  public async submit(credentials: Credentials): Promise<void> {
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.submitButton.click();
  }

  public async expectError(message: string): Promise<void> {
    await expect(this.errorBanner).toHaveText(message);
  }
}
```

| Concern | Rule |
|---|---|
| Members | Locators `public readonly`, alphabetical. `page` is `private readonly`, declared after the locators. Accessibility on every member. |
| Constructor | `public constructor(page: Page)`. Assign every field here. No parameter properties. |
| Methods | `public async <verb>(): Promise<void>`. One user intent per method. A method that decides (`if`) is doing two intents; split it. |
| Assertions | Only inside `expect*` methods, as plain `await expect(…)` lines with no step around them. Action methods never assert. |
| Helpers | A widget that appears on several pages is a helper object taking a `Locator` root, in `helpers/`. Pages expose it as a `public readonly` field. |
| Composition | A page object holds other page or helper objects as fields. It never extends another page object. |
| Return values | A method that reads state returns a typed value: `public async orderId(): Promise<string>`. |
| Size | A page object over 150 lines is two page objects or a page plus a helper. |

## Fixtures

```ts
// e2e/login/login.fixture.ts
import { test as base } from '@playwright/test';

import { DashboardPage } from './pages/dashboard.page';
import { LoginPage } from './pages/login.page';

type LoginFixtures = {
  readonly dashboardPage: DashboardPage;
  readonly loginPage: LoginPage;
};

export const test = base.extend<LoginFixtures>({
  dashboardPage: async ({ page }, use): Promise<void> => {
    await use(new DashboardPage(page));
  },
  loginPage: async ({ page }, use): Promise<void> => {
    await use(new LoginPage(page));
  }
});

export { expect } from '@playwright/test';
```

| Concern | Rule |
|---|---|
| Shape | Named `type <Feature>Fixtures`, `readonly` members, alphabetical. |
| Body | `async ({ deps }, use): Promise<void>`; setup above `use`, teardown below. |
| Worker scope | `[fn, { scope: 'worker' }]` tuple for expensive setup; the fixture type carries it in a separate `type <Feature>WorkerFixtures`. |
| Merge | `e2e/playwright.fixture.ts` exports `mergeTests(loginTest, checkoutTest)` when a spec needs two features. |
| Re-export | The fixture file re-exports `expect` so a spec has one import source. |
| Auth | Storage state is produced by a `setup` project and consumed through `use: { storageState }` per project, never per test. |

## Test Data and Mocks

Every route mock returns the same handler type, so it is declared once and imported.

```ts
// e2e/common/playwright.type.ts
import type { Route } from '@playwright/test';

export type RouteHandler = (route: Route) => Promise<void>;
```

```ts
// e2e/login/test/stubs/user.stub.ts
import type { Credentials } from '../../common/login.type';

export const USER_STUB: Credentials = {
  displayName: 'Ada',
  email: 'ada@example.com',
  password: 'correct-horse'
};
```

```ts
// e2e/login/test/stubs/session.stub.ts
import type { Session } from '../../common/login.type';

export const SESSION_STUB: Session = { token: 'stub-token', userId: 'u-1' };
```

The mock owns the interception, never the data. It takes the payload as a parameter defaulting to the stub, so the happy path is `sessionMock()` and a case overrides with `sessionMock({ ...SESSION_STUB, userId: 'u-2' })`.

```ts
// e2e/login/test/mocks/session.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { Session } from '../../common/login.type';
import { SESSION_STUB } from '../stubs/session.stub';

export const sessionMock = (session: Session = SESSION_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: session });
};
```

| Concern | Rule |
|---|---|
| Stub | One `<TYPE>_STUB: <Type>` per type in `test/stubs/<feature>.stub.ts`. Specs spread and override only what the case asserts on. |
| Mock | One factory per route or collaborator in `test/mocks/<name>.mock.ts`, named `<name>Mock`. Returns a `page.route` handler. |
| Mock data | None. Every body the factory fulfills arrives as a parameter or is imported from `test/stubs/`. A `const <X>_BODY = { … }` in a `.mock.ts` is a stub in the wrong file. |
| Mock parameters | The payload first, with the stub as its default. Status, headers, and delay follow as further parameters with their own defaults. A parameter is never an inline object type; name it in `common/`. |
| Error payloads | An error body is its own typed stub (`SESSION_ERROR_STUB`), not a literal inside the handler. A mock that can fail takes both stubs or a separate `<name>ErrorMock`. |
| On-disk bodies | A body that is a whole document or binary is a file under `test/fixtures/`, served with `route.fulfill({ path })`. Playwright reads it and infers `Content-Type` from the extension; do not read it yourself or pass `contentType`. |
| Recorded calls | A factory that records what it served returns a named type from `test/common/<feature>.type.ts` holding the handler plus the recorded array. It still takes its payload as a stub-defaulted parameter. |
| Builder | Randomised or sequenced data (faker, counters) is a function in `test/utils/<feature>-builder.spec.util.ts`. Never in `stubs/`. |
| Upload files | Real files under `test/fixtures/`. Never a `.ts` module exporting base64. |
| API seeding | Setup through `request` in a fixture or a `setup` project, never through the UI. |

Who calls the mock decides where the override lives:

| Caller | Shape |
|---|---|
| Fixture, same body for every test in the feature | `await page.route('**/api/session', sessionMock());` before `use`. |
| Fixture, body the spec reads back | Build from the stub above the route call, pass it in, then `await use(session)`. |
| Spec, one case differs | `const session: Session = { ...SESSION_STUB, userId: 'u-2' };` above the steps, passed to the opening call: `accountPage.goto({ session })`, which routes `sessionMock(session)` before it navigates. |
| Spec, failure path | The opening call's failure option, `alertsPage.goto({ failOn: 'delete' })`, routes the error mock before it navigates. Never an inline `route.fulfill` and never a route-only step in the spec. |

## Configuration

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

import { BASE_URL } from './common/playwright.const';

const chromium = { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' };

const use = { baseURL: BASE_URL, trace: 'on-first-retry' } as const;

const projects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { dependencies: ['setup'], name: 'chromium', use: chromium }
];

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  projects,
  reporter: 'list',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  use
});
```

| Concern | Rule |
|---|---|
| Nested values | Every nested object (`use`, each project's `use`, `reporter` arrays) is a named `const` above `defineConfig`. |
| Env | Environment reads happen once, in the config, and become plain values. Specs never read `process.env`. |
| Constants | `BASE_URL`, timeouts, and shared paths live in `common/playwright.const.ts`. |

## Sample Style in This Skill

Rules for the markdown files in this skill, so every reference reads the same way:

| Concern | Rule |
|---|---|
| Fence language | `ts` for TypeScript, `bash` for shell, `yaml` for CI, `json` for JSON. Never `typescript` or `javascript`. |
| Avoid samples | A sample that shows what not to do is fenced `ts avoid`. It is the only sample kind exempt from `scripts/lint-samples.sh`. Keep it short; the "Prefer" sample is the one that teaches. |
| Lint | `scripts/lint-samples.sh <file.md>` must print `clean` before a reference file is done. |
| Path comment | First line of every `.ts` sample is `// <path>` under the layout above. Nothing else is commented. |
| Good / bad | Prose says "Before" and "After" or "Avoid" and "Prefer". No ✅ / ❌ inside code. |
| Completeness | A sample compiles as shown: imports present, return types present, types named. Elision uses a prose sentence, not `// ...`. |
| One example | One complete example per pattern. Variants are described in a table, not repeated as code. |
| Sample length | A sample stays under 60 lines. Longer means the sample hides two patterns. |
| Prose | Short declarative sentences. Tables for options. No marketing adjectives. |

## Rationalizations

| Excuse | Counter |
|---|---|
| "Steps make short tests longer." | A three-line test with three steps is still three lines. The trace now names them. |
| "The title already says WHEN and THEN." | The title is `GIVEN <state>, <outcome>`; `WHEN` / `THEN` are steps. Saying it twice is what the rule removes. |
| "The trace should show where the mock was set up." | A route-only step is 0 ms with nothing under it. The title names the condition; the opening step says `open with deletes rejected`. |
| "A boxed `THEN` in the page object points failures at the spec." | It also nests a second `THEN` under the spec's `THEN`. The stack trace already includes the spec line; one step level beats a prettier location. |
| "One `page.getByRole` in the spec is fine." | The spec now knows the DOM. Move it to the page object. |
| "Return types on test callbacks are noise." | The rule has no exception for tests. Consistency is the point. |
| "Playwright docs use `interface`." | Playwright docs are not this repo. `type` with `readonly`. |
| "This page object needs an `if`." | A branch in a page object is two user intents. Two methods. |
| "`waitForTimeout(500)` fixes it locally." | It hides a race. Find the state and `expect` it. |
| "The fixture file is tiny, inline the type." | Inline object types are banned everywhere. Name it. |
| "`as` is the only way to type `evaluate`." | `page.evaluate<Result>(...)` takes a generic. |
| "Upstream sample had comments explaining each line." | Explanation moves to prose. The code is the example. |
| "The body is only used by this one mock, keep it in the file." | A `.mock.ts` is behavior. The moment the body is a value with a shape, it is a stub, and `test/stubs/` is where a reader looks for it. |
| "`const INTENT_BODY = { clientSecret: '…' }` is obviously typed." | It is inferred, not typed. It drifts from the real response the day the API changes and nothing reports it. Name the type in `common/`, annotate the stub. |
| "This route returns a one-field object, a stub is overkill." | The one field is the contract the app parses. Same rule, same cost: one line in `test/stubs/`. |
| "A `GIVEN` describe saves repeating the arrange step." | It saves one line per test and hides the condition from the report tree. The step repeats; a fixture that hands over the ready page removes the repeat when it grows. |
| "Mocking inline in the spec is clearer for a failure case." | The spec now owns a payload shape and a status code. Failure option on the opening call, error mock, typed stub. |
| "The fixture needs different data per test, so the mock can't be shared." | That is what the stub-defaulted parameter is for. One factory, `sessionMock({ ...SESSION_STUB, … })` per case. |

## Red Flags

Stop and re-check this file when reasoning includes:

- A `test(...)` body with a statement that is not `await test.step(...)`.
- A step callback with braces and two statements.
- `page.getBy` or `page.locator` inside a `.e2e.ts` or `.test.ts`.
- `test.describe('Login', ...)` or any describe text with no Gherkin keyword.
- `test.describe('WHEN …')` or a test title starting with `WHEN` / `THEN`.
- `test.describe('GIVEN …')`, or any describe nested inside the `FEATURE`.
- Two test titles in one spec that read the same.
- A `GIVEN` step, or an arrange step that only calls `page.route`.
- `test.step` or `{ box: true }` in a page object, helper object, fixture, or util.
- A step whose name has no `WHEN` / `THEN` / `AND`.
- "should" in a test title.
- `interface`, `as SomeType`, `any`, or `// ...` inside a sample.
- An object literal inside `route.fulfill({ json: … })`.
- A response payload declared inside a `.mock.ts`: a `const <X>_BODY`, or an object literal the factory fulfills. Util functions, counters, caches, and resolved fixture paths are the mock's own wiring and stay.
- `type RouteHandler = (route: Route) => Promise<void>;` declared anywhere but `e2e/common/playwright.type.ts`.
- A stub declared without a type annotation, or annotated with an inline object type.
- `page.route` in a spec with the handler written inline.
- A second mock factory that differs from the first only by its payload.
- `waitForTimeout`, `waitForSelector`, or a manual polling loop.
- An `expect` inside a page-object action method.
- `import { test } from '@playwright/test'` in a spec that has a fixture file.
- A `.ts` sample without a path comment on line one.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `test.describe('Checkout', ...)` | `test.describe('FEATURE: checkout', ...)`. |
| `test('WHEN the order is placed THEN the confirmation page opens', ...)` | `test('GIVEN a filled cart, placing the order opens the confirmation page', ...)` with `WHEN` / `THEN` steps inside. |
| `test('placing the order opens the confirmation page', ...)` or `test('SCENARIO: …')` | Start with `GIVEN <state>,`. No keyword, no place in the tree; `SCENARIO:` is the old prefix. |
| `test.describe('WHEN the order is placed', ...)` | Delete the describe; `'WHEN the order is placed'` is a step. |
| `test.describe('GIVEN the create api fails', ...)` around tests | Delete the describe. The title names the failure, `'GIVEN a failed create, saving warns and keeps the sheet open'`, and the opening step folds in the mock: `'AND the price alerts page is open with creates rejected'`. |
| `test.describe('GIVEN notifications are denied', () => { test.use({ permissions: [] }); … })` | Runtime-changeable: an `AND` arrange step (`context.clearPermissions()`). Context-fixed (`locale`, `storageState`): a separate spec with a file-level `test.use`. |
| `test.step('submit credentials', ...)` in a spec | `test.step('WHEN credentials are submitted', ...)`. |
| Step with `async () => { await a(); await b(); }` | Add `checkoutPage.placeOrder()` and call it. |
| `test.step('THEN modal is open', …, { box: true })` in a page object | `await expect(this.modal).toBeVisible();` with no step; the spec's `THEN` step is the only one. |
| Step named `'Step 1'` or `'Arrange'` | Keyword plus the action: `'AND the checkout page is open'`. |
| `readonly page: Page` with no accessibility | `private readonly page: Page`. |
| `constructor(private readonly page: Page)` | Field declaration plus assignment in the body. |
| Locator declared on one line, assigned inline | Declare as a field, assign in the constructor. |
| `expect` inside `submit()` | Move to `expectSubmitted()`. |
| `fixtures/` folder holding `test.extend` files | `<feature>.fixture.ts` at the feature root; `test/fixtures/` is for on-disk files. |
| Inline `use: { baseURL, trace }` in `defineConfig` | `const use = { ... } as const;` above. |
| `const data = response as ApiResponse` | `const data: ApiResponse = await response.json();` with a typed contract, or a predicate. |
| `route.fulfill({ json: { token: 'abc' } })` | `SESSION_STUB` in `test/stubs/session.stub.ts`, typed, passed through the mock parameter. |
| `const SESSION_BODY: Session = { … }` in `session.mock.ts` | Move it to `test/stubs/session.stub.ts` as `SESSION_STUB` and import it as the parameter default. |
| `sessionMock()` and `sessionExpiredMock()` differing only in body | One `sessionMock(session: Session = SESSION_STUB)`; the expired case passes `SESSION_EXPIRED_STUB`. |
| `await page.route('**/api/x', (route) => route.fulfill(…))` in a spec | The opening call's option routes `xMock()` before it navigates, or the fixture routes it. |
| Mock body typed by inference | Annotate the stub with the response type from `common/<feature>.type.ts`. |
| `type RouteHandler` redeclared per mock file | Import it from `e2e/common/playwright.type.ts`. |
