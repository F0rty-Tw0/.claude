# House Style

Read this file before any other reference in this skill. Every code sample in this skill follows these rules; every Playwright file written with this skill follows them too. Where a Playwright doc or an older test in the repo disagrees, this file wins.

**REQUIRED BACKGROUND:** skill:artification. `references/typescript-style.md` applies unchanged. `references/spec-style.md` covers `describe` / `it` specs; its Scope section points Playwright specs here. Playwright has `test.step`, so the tree is `FEATURE` → optional `JOURNEY` → `test('GIVEN <state>, <outcome>')`, and `WHEN` / `THEN` / `AND` are steps. This file adds only what Playwright needs on top.

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

A spec is a list of named steps. A step is one call. The call lives in a page object, a fixture, or a util, so the spec reads as prose and the trace reads as the spec. Only the spec's test bodies open steps: the trace is one level deep, and no step nests inside another.

## Quick Reference

| Concern | Rule |
|---|---|
| Naming tree | `test.describe('FEATURE: <name>')` → optional `test.describe('JOURNEY: <user path>')` → `test('GIVEN <state>, <outcome>')`. One `FEATURE` per spec; `JOURNEY` is the only nested describe, one level deep. The title is the test's only `GIVEN`: it names the state the test starts from (`'GIVEN a failed create, saving warns and keeps the sheet open'`). The body is Gherkin phases after it: `WHEN` → `AND`* → `THEN` → `AND`*, repeated when the test acts again after a check. Never a `GIVEN` or `WHEN` describe, no `SCENARIO:` prefix, no `GIVEN` step. |
| Test body | Every statement inside `test(...)` is `await test.step('<prose>', ...)`, except what sits above the first step: a `const` holding case data (including values read from `testInfo`), and test configuration: `test.skip` / `test.slow` / `test.fixme` / `test.fail(condition, reason)`, `test.setTimeout`, `test.info().annotations.push`. No bare `page.*`, `expect(...)`, page-object, or fixture call outside a step. |
| Step body | One call. `(): Promise<void> => loginPage.submit(user)`. Two or more statements mean a page-object or fixture method is missing. |
| Step naming | Upper-case keyword, then present-tense prose: `'WHEN the alerts overview is opened'`, `'THEN the delete error toast is shown'`. `WHEN` starts a phase, `THEN` is its first check, `AND` continues whichever kind came before it. |
| Steps only in the spec | `test.step` appears only in the test bodies of `.e2e.ts` / `.test.ts` / `.test.tsx` specs. Never in hooks, page objects, helper objects, fixtures, mocks, utils, or `*.setup.ts` files, so no step nests inside another and nothing is boxed. |
| One owner per file | One page object, one helper object, one fixture file, one route-mock file, one stub file per `.ts`. One `FEATURE:` per spec. |
| File size | Source `.ts` under 150 lines, spec under 300, blank and comment lines skipped. Over means split by concern per `module-size.md`. |
| Page object | `class` with `private readonly page: Page`, `public readonly` locators assigned in the constructor, `public async` methods returning `Promise<void>`. No parameter properties. `expect` only inside `expect*` methods. |
| Locator access | Specs never call `page.getBy*` or `page.locator`. Every locator is a page-object or helper-object field. |
| Spec name | `<feature>.test.ts` when a test run routes your own origin (`**/api/**`, `**/graphql`, `**/ws/**`, own assets, `routeFromHAR`): through its own `page.route`, a fixture that routes, or an opening-call option it passes. A page object that can route but is called without that option does not count. `<feature>.e2e.ts` otherwise, including specs that only stub third-party hosts (payment gateway, analytics, OAuth provider). Component specs are `<feature>.test.tsx`. Never `.spec.ts`; that suffix is the artification unit-test name. |
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
    <behavior>.spec.util.ts             test-only utils every feature shares, e.g. expect-body
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
      stories/
        <name>.story.tsx                component wrapper for props a CT spec cannot pass (functions, refs)
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
    await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto());

    await test.step('AND the credentials are submitted', (): Promise<void> => loginPage.submit(USER_STUB));

    await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));

    await test.step('AND the greeting names the user', (): Promise<void> => dashboardPage.expectGreeting(USER_STUB.displayName));
  });

  test('GIVEN a wrong password, submitting shows the error banner', async ({ loginPage }): Promise<void> => {
    const user: Credentials = { ...USER_STUB, password: 'wrong' };

    await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto());

    await test.step('AND the credentials are submitted', (): Promise<void> => loginPage.submit(user));

    await test.step('THEN the error banner reports invalid credentials', (): Promise<void> => loginPage.expectError('Invalid credentials'));
  });
});
```

| Concern | Rule |
|---|---|
| `describe` text | Exactly one `test.describe('FEATURE: <name>')` per spec, wrapping every test. Inside it, tests sit directly or in a `test.describe('JOURNEY: <user path>')`. No other nested describe, so no `GIVEN` describe: the report tree is `file → FEATURE → (JOURNEY →) GIVEN <state>, <outcome>`. |
| Journey | A `JOURNEY` groups 2+ tests that follow one user path in order: `'JOURNEY: a guest buys one item'`. Legs are always independent: each title names where the leg starts (`'GIVEN one item in the cart, …'`), and the opening call or a fixture seeds that state instead of the leg before it. A step that cannot be seeded (a real third-party redirect) stays in the previous leg's test as a new phase; serial mode does not carry a page from one test to the next. |
| State in title | The title's `GIVEN` names the state the test starts from: what the opening call's options, a fixture, or a `const` above the steps set up. When tests in a spec start from different states, name what differs (`'GIVEN a failed list, …'`). When they share one, name that shared state and let the outcome tell them apart (`'GIVEN saved alerts, deleting one removes it from the list'`). Never a page name alone (`'GIVEN the alerts page, …'`), and never a state the test's own steps create (`'GIVEN a confirmed deletion, …'` in a test that confirms the deletion). |
| `test` text | `GIVEN`, the start state, a comma, then the outcome, as one lower-case present-tense sentence: `'GIVEN a wrong password, submitting shows the error banner'`. `WHEN` / `THEN` never appear in the title; they are steps. No "should". |
| Step keywords | Every step in a spec starts with `WHEN`, `THEN`, or `AND`; `GIVEN` belongs to the title. The first step is `WHEN`. Every phase holds at least one `THEN`. |
| Step order | A phase is `WHEN` → `AND`* (more actions) → `THEN` → `AND`* (more checks). A new `WHEN` may only follow a check: it starts the next phase (`'WHEN 30 minutes pass'` after `'THEN the dashboard is shown'`). `WHEN` → `AND` → `WHEN` with no check between, and a second `THEN` in one phase, are wrong: the second step is `AND`. Use a new phase when the test must act again on the state a check just proved: a guard check before a delete, time passing, the network dropping, a second user acting. Phases that do not depend on each other are separate tests. |
| Arrange | There are no arrange steps. The title's `GIVEN` names the state; the code that builds it runs inside the first `WHEN` call or a fixture. A route, a permission, a clock, a viewport, or headers are options on the opening call, which applies them before it navigates (an option that edits the loaded page, such as a style tag that hides dynamic content, applies right after): `alertsPage.goto({ failOn: 'delete' })` → `'WHEN the alerts overview is opened'`. No step repeats the title's condition; the title already names it. API seeding lives in a fixture, which may hand over the page already seeded and open; the first `WHEN` is then the first user action on it (`'WHEN guest checkout is chosen'`). See [Requirement Annotation](annotations.md#requirement-annotation). Case-specific data is a `const` above the first step, blank line after. Hooks never open a step or the page. |
| `test.use` options | `test.use` cannot run inside a test, and it is never used inside a `JOURNEY`. An option the browser can change at runtime (viewport, permissions, clock, headers) is an option on the opening call. An option fixed at context creation (`locale`, `storageState`, `timezoneId`, device, a fixture option such as `mockPayments`) that differs from the rest of the spec moves those tests to their own spec with a file-level `test.use` and its own `FEATURE`: `store-finder-de.e2e.ts`. The same tests across several context-fixed values are a project per value in `playwright.config`. The same test across several runtime values (breakpoints) is a `for` loop of tests, each title naming its value and each `goto` passing it. |
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
| Naming | Keyword plus what the user does or what is now true: `'WHEN the checkout page is opened'`, `'AND the item is added to the cart'`, `'THEN the cart badge shows one item'`. |
| Return value | A step may return a value: `const orderId = await test.step('AND the order is placed', (): Promise<string> => checkoutPage.placeOrder());`. |
| Sync `expect` | `expect(value).toBe(…)` on a plain value is synchronous: the step callback is `(): void =>`. Only `expect(locator)` / `expect(page)` matchers and `expect.poll` return promises and take `(): Promise<void> =>`. |
| Reads | A value a check needs is read inside the check: the `expect*` method or util reads the body, cookies, or state it asserts. No step only reads a value. An API spec checks the status first (`'THEN the status is 201'`), then the body (`'AND the body names the item'`), each check reading what it asserts. |
| Non-void calls | `page.goto` / `reload` / `goBack` return `Promise<Response \| null>`; `route`, `addInitScript`, `exposeFunction`, `exposeBinding` return `Promise<Disposable>` since Playwright 1.63. An expression body cannot be typed `Promise<void>`, so use a block body with one `await`: `async (): Promise<void> => { await page.reload(); }`. Still one call. Same for a page-object, util, or mock arrow that wraps one of these. A step never routes; see Arrange. |

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
import { expect, test } from './login.fixture';
import { USER_STUB } from './test/stubs/user.stub';

test.describe('FEATURE: login', () => {
  test('GIVEN valid credentials, submitting opens the dashboard', async ({ loginPage, page }): Promise<void> => {
    await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto());

    await test.step('AND the credentials are submitted', (): Promise<void> => loginPage.submit(USER_STUB));

    await test.step('THEN the dashboard url is shown', (): Promise<void> => expect(page).toHaveURL('/dashboard'));
  });
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
| Methods | `public async <verb>(): Promise<void>`. One user intent per method. A method that decides (`if`) is doing two intents; split it. The one exception is the opening call: `goto(options)` may branch on its options to apply them around navigating. |
| Opening options | One options type per page object, `<Page>Options` in `common/<feature>.type.ts`, `readonly` and optional. A reference file that needs one more option says so in prose (`AlertsOptions` gains `retry?: boolean`) instead of redeclaring the type. No option means no routing, so a real-backend spec stays unmocked. |
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
| Auth | Storage state is produced by a `setup` project and consumed through `use: { storageState }` per project, or through a file-level `test.use` in a spec whose tests all need another session. Never per test. |
| Setup files | A `*.setup.ts` or `*.teardown.ts` file is not a behaviour spec: no steps, and the title names what it produces or clears (`setup('saves the admin session')`, `teardown('clears the seeded data')`). |
| Fixture options | An option a spec sets with `test.use` is typed `<Feature>FixtureOptions`, so it never collides with a page's `<Page>Options`. |

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
  testMatch: '**/*.@(e2e|test).ts',
  use
});
```

| Concern | Rule |
|---|---|
| Nested values | Every nested object (`use`, each project's `use`, `reporter` arrays) is a named `const` above `defineConfig`. |
| Env | Environment reads happen once, in the config, and become plain values. Specs never read `process.env`. |
| Constants | `BASE_URL`, timeouts, and shared paths live in `common/playwright.const.ts`. |
| Test files | The config sits in `e2e/`, so it sets no `testDir` (that resolves from the config's own folder: `testDir: './e2e'` there means `e2e/e2e`). `testMatch: '**/*.@(e2e|test).ts'` collects both spec kinds; the default pattern skips `.e2e.ts`. |

## Sample Style in This Skill

Rules for the markdown files in this skill, so every reference reads the same way:

| Concern | Rule |
|---|---|
| Fence language | `ts` for TypeScript, `tsx` for TSX, `bash` for shell, `yaml` for CI, `json` for JSON. Never `typescript` or `javascript`. One call per line, so the lint can read each step. |
| Avoid samples | A sample that shows what not to do is fenced `ts avoid`. It is the only sample kind exempt from `scripts/lint-samples.sh`. Keep it short; the "Prefer" sample is the one that teaches. |
| Lint | `scripts/lint-samples.sh <file.md>` must print `clean` before a reference file is done. |
| Path comment | First line of every `.ts` sample is `// <path>` under the layout above. Nothing else is commented. |
| Good / bad | Prose says "Before" and "After" or "Avoid" and "Prefer". No ✅ / ❌ inside code. |
| Completeness | A sample compiles as shown: imports present, return types present, types named. Elision uses a prose sentence, not `// ...`. |
| One example | One complete example per pattern. Variants are described in a table, not repeated as code. |
| Sample length | A TypeScript sample stays under 60 lines. Longer means the sample hides two patterns. A CI pipeline file (`yaml`) stays whole so it can be copied. |
| Prose | Short declarative sentences. Tables for options. No marketing adjectives. |

## Rationalizations

| Excuse | Counter |
|---|---|
| "Steps make short tests longer." | A three-line test with three steps is still three lines. The trace now names them. |
| "The title already says WHEN and THEN." | The title is `GIVEN <state>, <outcome>`; `WHEN` / `THEN` are steps. Saying it twice is what the rule removes. |
| "The trace should show where the mock was set up." | A route-only step is 0 ms with nothing under it. The title names the condition; the `WHEN` call applies it. |
| "The `WHEN` should say which setup ran." | The title says it, directly above the steps. Repeating it in the `WHEN` doubles every condition and drifts the day one of them changes. |
| "Opening the page is arrange, not the action." | In an e2e test, opening the page is the user's first action. The title carries the state; the `WHEN` starts the sequence, and the outcome in the title says which part of it the test is about. |
| "A boxed `THEN` in the page object points failures at the spec." | It also nests a second `THEN` under the spec's `THEN`. The stack trace already includes the spec line; one step level beats a prettier location. |
| "One `page.getByRole` in the spec is fine." | The spec now knows the DOM. Move it to the page object. |
| "Return types on test callbacks are noise." | The rule has no exception for tests. Consistency is the point. |
| "Playwright docs use `interface`." | Playwright docs are not this repo. `type` with `readonly`. |
| "This page object needs an `if`." | A branch in a page object is two user intents. Two methods. The opening call's options are the one exception: applying them before navigating is still one intent, opening the page in the given state. |
| "The guard check before the action is noise; drop it." | Without it, `'the alert is gone'` passes when the alert never showed up. Keep the check and start a new phase: `THEN the alert is listed`, `WHEN it is deleted`. |
| "Every test in this spec starts on the same page, so `GIVEN the alerts page` is honest." | A page is where the test runs, not the state it starts from. Name the data or condition the page shows: `'GIVEN saved alerts, …'`. |
| "`waitForTimeout(500)` fixes it locally." | It hides a race. Find the state and `expect` it. |
| "The fixture file is tiny, inline the type." | Inline object types are banned everywhere. Name it. |
| "`as` is the only way to type `evaluate`." | `page.evaluate<Result>(...)` takes a generic. |
| "Upstream sample had comments explaining each line." | Explanation moves to prose. The code is the example. |
| "The body is only used by this one mock, keep it in the file." | A `.mock.ts` is behavior. The moment the body is a value with a shape, it is a stub, and `test/stubs/` is where a reader looks for it. |
| "`const INTENT_BODY = { clientSecret: '…' }` is obviously typed." | It is inferred, not typed. It drifts from the real response the day the API changes and nothing reports it. Name the type in `common/`, annotate the stub. |
| "This route returns a one-field object, a stub is overkill." | The one field is the contract the app parses. Same rule, same cost: one line in `test/stubs/`. |
| "A `GIVEN` describe saves repeating the opening step." | It saves one line per test and hides the condition from the report tree. The `WHEN` repeats; a fixture that hands over the ready page removes the repeat when it grows. |
| "Mocking inline in the spec is clearer for a failure case." | The spec now owns a payload shape and a status code. Failure option on the opening call, error mock, typed stub. |
| "The fixture needs different data per test, so the mock can't be shared." | That is what the stub-defaulted parameter is for. One factory, `sessionMock({ ...SESSION_STUB, … })` per case. |

## Red Flags

Stop and re-check this file when reasoning includes:

- A `test(...)` body with a statement that is not `await test.step(...)`, apart from a case-data `const` and a first-line `test.skip` / `test.slow` / `test.fixme`.
- A step callback with braces and two statements.
- `page.getBy` or `page.locator` inside a `.e2e.ts` or `.test.ts`.
- `test.describe('Login', ...)` or any describe text that is not `FEATURE:` or `JOURNEY:`.
- `test.describe('WHEN …')` or a test title starting with `WHEN` / `THEN`.
- `test.describe('GIVEN …')`, a nested describe that is not `JOURNEY:`, or a describe inside a `JOURNEY`.
- A `JOURNEY` leg that relies on the leg before it, or `mode: 'serial'` used to chain tests. Serial mode does not carry the page across tests.
- Two test titles in one spec that read the same, a title whose `GIVEN` is only a page name, or a `GIVEN` that the test's own steps create.
- A `GIVEN` step, a first step that is not `WHEN`, a `WHEN` that does not follow a check, a second `THEN` in one phase, a phase with no `THEN`, or a step that routes.
- A `test.step` inside a hook, a `*.setup.ts` file, or a `*.teardown.ts` file.
- A step that only reads a value (`response.json()`, cookies) instead of the check reading what it asserts.
- An `if` in a page-object method other than the opening call, or a second options type for the same page object.
- `test.step` or `{ box: true }` in a page object, helper object, fixture, mock, or util.
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
| `test.describe('GIVEN the create api fails', ...)` around tests | Delete the describe. The title names the failure, `'GIVEN a failed create, saving warns and keeps the sheet open'`, and the opening `WHEN` applies it: `priceAlertsPage.goto({ failOn: 'create' })` in `'WHEN the price alerts page is opened'`. |
| `test.describe('GIVEN notifications are denied', () => { test.use({ permissions: [] }); … })` | Runtime-changeable: an option on the opening call (`alertsPage.goto({ notifications: 'denied' })` runs `context.clearPermissions()` before navigating). Context-fixed (`locale`, `storageState`): a separate spec with a file-level `test.use`. |
| `test.step('submit credentials', ...)` in a spec | `test.step('AND the credentials are submitted', ...)` after the opening `WHEN`. |
| Step with `async () => { await a(); await b(); }` | Add `checkoutPage.placeOrder()` and call it. |
| `test.step('THEN modal is open', …, { box: true })` in a page object | `await expect(this.modal).toBeVisible();` with no step; the spec's `THEN` step is the only one. |
| `'AND the alert is deleted'` right after `'THEN the alert is listed'` | `'WHEN the alert is deleted'`: an action after a check starts a new phase. |
| `const body = await test.step('AND the body is read', …)` then `'THEN the status is ok'` | `'THEN the status is 200'`, then `'AND the body names the item'` through an `expect*` util that reads the body itself. |
| `test('GIVEN the dashboard, …')` | Name the state the dashboard starts in: `'GIVEN three saved widgets, …'`. |
| Step named `'Step 1'` or `'Arrange'` | Keyword plus the action: `'WHEN the checkout page is opened'`. |
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
