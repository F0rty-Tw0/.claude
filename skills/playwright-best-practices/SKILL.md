---
name: playwright-best-practices
description: The user's Playwright house style plus topic references (locators, fixtures, page objects, mocks, auth, config, CI, sharding, visual, accessibility and API tests, debugging). Use when writing, refactoring, reviewing, or debugging Playwright tests or playwright.config.
---

# Playwright Best Practices

## Overview

Reference set for Playwright test development, rewritten to house style: one flat `FEATURE` describe per spec, `GIVEN <state>, <outcome>` test titles, `WHEN` / `THEN` / `AND` steps with one call each (only the spec opens steps; the title is the one `GIVEN`), page objects that own every locator, fixtures that own every page object, and one responsibility per file.

Load skill:artification too. Its `typescript-style.md` applies to every Playwright file unchanged. Its `spec-style.md` covers `describe` / `it` specs; Playwright specs follow `core/house-style.md`, which its Scope section points to.

## Read Order

1. `core/house-style.md`. Always. It is the contract every other file and every generated test follows.
2. The rows below that match the work.
3. For flake audits, skill:deflaky owns the multi-run procedure; `debugging/flaky-tests.md` owns the Playwright-specific fixes.

## Routing

| Situation | Read |
|---|---|
| New spec, any kind | `core/test-suite-structure.md`, `core/locators.md`, `core/assertions-waiting.md` |
| Refactoring an existing suite to house style | `core/refactoring.md`, then `scripts/lint-samples.sh e2e/<feature>` on the real files |
| Page object, helper object | `core/page-object-model.md`, `architecture/pom-vs-fixtures.md` |
| Fixture, hook, `test.extend`, `mergeTests` | `core/fixtures-hooks.md` |
| Stubs, builders, seeding, cleanup | `core/test-data.md` |
| Route mock payload, intercepted body, stubbing your own API | `core/house-style.md` (Test Data and Mocks), `core/test-data.md` |
| `playwright.config`, projects, dependencies | `core/configuration.md`, `core/projects-dependencies.md` |
| Global setup, storage state, auth once per run | `core/global-setup.md`, `advanced/authentication.md` |
| Skip, fixme, slow, conditional runs, steps, requirement IDs | `core/annotations.md` |
| Tags, `--grep`, PR vs nightly subsets | `core/test-tags.md` |
| Login, OAuth, SSO, MFA, password reset | `advanced/authentication.md`, `advanced/authentication-flows.md` |
| Two users, roles, real-time collaboration | `advanced/multi-user.md`, `browser-apis/websockets.md` |
| Popups, new tabs, second context | `advanced/multi-context.md` |
| Date, time, timers, timezone | `advanced/clock-mocking.md` |
| Route mocking, HAR, latency, offline | `advanced/network-advanced.md`, `debugging/error-testing.md` |
| Payments, email, SMS, third-party widgets | `advanced/third-party.md` |
| Devices, touch, viewport, breakpoints | `advanced/mobile-testing.md` |
| Geolocation, permissions, clipboard, media | `browser-apis/browser-apis.md` |
| iframes | `browser-apis/iframes.md` |
| Service workers, PWA, offline-first | `browser-apis/service-workers.md` |
| API tests, `request` fixture | `testing-patterns/api-testing.md` |
| GraphQL | `testing-patterns/graphql-testing.md` |
| Component tests (stories, gallery, `mount`) | `testing-patterns/component-testing.md` |
| Screenshots, visual diffs, canvas, WebGL | `testing-patterns/visual-regression.md`, `testing-patterns/canvas-webgl.md` |
| axe-core, keyboard, ARIA | `testing-patterns/accessibility.md` |
| XSS, CSRF, headers, auth boundaries | `testing-patterns/security-testing.md` |
| Web Vitals, Lighthouse, budgets | `testing-patterns/performance-testing.md` |
| Forms, validation messages | `testing-patterns/forms-validation.md` |
| CRUD flows, delete confirm, optimistic UI | `testing-patterns/crud.md` |
| Search, filters, debounce, pagination | `testing-patterns/search-filter.md` |
| Empty/one/many, boundary input, double submit, side service down | `testing-patterns/edge-cases.md` |
| Upload, download, file system | `testing-patterns/file-operations.md`, `testing-patterns/file-upload-download.md` |
| Drag and drop | `testing-patterns/drag-drop.md` |
| Locale, currency, RTL | `testing-patterns/i18n.md` |
| Electron | `testing-patterns/electron.md` |
| Browser extensions | `testing-patterns/browser-extensions.md` |
| React, Angular, Vue/Nuxt, Next.js specifics | `frameworks/<name>.md` |
| Element not found, timeout, race | `debugging/debugging.md`, `core/assertions-waiting.md`, `core/locators.md` |
| Reading a `trace.zip` from the terminal, known error message | `debugging/debugging.md` (Terminal Trace Analysis, Common Error Messages) |
| Flaky under `--workers`, state leak | `debugging/flaky-tests.md`, `core/fixtures-hooks.md` |
| Console errors, uncaught exceptions | `debugging/console-errors.md` |
| Error boundaries, loading states, failures | `debugging/error-testing.md` |
| Mock vs real, test type, suite shape | `architecture/when-to-mock.md`, `architecture/test-architecture.md` |
| CI pipeline, any provider | `infrastructure-ci-cd/ci-cd.md`, then `github-actions.md`, `gitlab.md`, `other-providers.md`, `docker.md` |
| Sharding, workers, run time | `infrastructure-ci-cd/parallel-sharding.md`, `infrastructure-ci-cd/performance.md` |
| Reporters, traces, artifacts | `infrastructure-ci-cd/reporting.md` |
| Coverage | `infrastructure-ci-cd/test-coverage.md` |

## Validation Loop

1. `npx playwright test --reporter=list` on the touched specs.
2. Red: read the trace (`npx playwright trace open <trace.zip>`, then `trace actions --errors-only`; see `debugging/debugging.md`), fix the locator, wait, or step, re-run.
3. Green: `npx playwright test --repeat-each=3` on the same specs. Still green means done.
4. Refactoring a real suite: `scripts/lint-samples.sh e2e/<feature>` must print `clean`, and the test and `expect` counts must not drop; see `core/refactoring.md`.
5. Skill authors: `scripts/lint-samples.sh` must print `clean` after editing any reference file.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Reading a topic file without `house-style.md` | Read `house-style.md` first; topic files assume it. |
| Copying a Playwright docs sample verbatim | Reshape it: `GIVEN <state>, <outcome>` title, Gherkin steps, page object, fixture, return types. |
| Fixing a flake by retrying | skill:deflaky audit, then the matching category in `debugging/flaky-tests.md`. |
| `login.spec.ts` for a Playwright file | `login.test.ts` when your own API is routed (directly or via fixture, page object, mock); `login.e2e.ts` otherwise, third-party stubs included. `.spec.ts` is artification's unit-test suffix. |
| `test.describe('Login')` | `test.describe('FEATURE: login')`. |
| `test.describe('GIVEN …')` grouping tests | Flat: one `FEATURE` describe (plus `JOURNEY` for a user path). The title starts `GIVEN <state>,`, and the opening `WHEN` call or a fixture sets that state up. |
| `test('WHEN … THEN …')`, `test('SCENARIO: …')`, or `test('<bare title>')` | Title is `GIVEN <state>, <outcome>`; `WHEN` / `THEN` are `test.step` names. |
| A `page.getByRole` in a spec | Move it to the page object; call the method from a step. |
| `route.fulfill({ json: { … } })` with a literal | Typed `<TYPE>_STUB` in `test/stubs/`, passed through the mock's stub-defaulted parameter. |
| A `const <X>_BODY` inside a `.mock.ts` | Data belongs in `test/stubs/`; a mock owns interception only. |
