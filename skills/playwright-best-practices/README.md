# Playwright Best Practices

Playwright reference set covering E2E, component, API, visual, accessibility, security, Electron, and extension testing, plus CI and debugging. Forked from [currents-dev/playwright-best-practices-skill](https://github.com/currents-dev/playwright-best-practices-skill) (MIT, see `LICENSE.md`) and rewritten so every sample follows the house rules in `core/house-style.md` and the `artification` skill.

## What It Does

| Area | Files |
|---|---|
| Contract | `core/house-style.md` — `FEATURE` / `GIVEN` describes, scenario titles, `GIVEN` / `WHEN` / `THEN` steps with one call each, page objects own locators, fixtures own page objects, artification TypeScript rules, file layout, size caps. |
| Core | `core/` — structure, locators, assertions, POM, fixtures, data, config, projects, global setup, annotations, tags. |
| Advanced | `advanced/` — auth flows, multi-user, multi-context, clock, network, third-party, mobile. |
| Browser APIs | `browser-apis/` — WebSockets, service workers, iframes, geolocation, permissions, clipboard, media. |
| Patterns | `testing-patterns/` — API, GraphQL, component, visual, canvas, a11y, security, performance, forms, files, drag-drop, i18n, Electron, extensions. |
| Frameworks | `frameworks/` — React, Angular, Vue/Nuxt, Next.js. |
| Debugging | `debugging/` — failures, flaky tests, console errors, error states. |
| Infrastructure | `infrastructure-ci-cd/` — CI providers, Docker, sharding, performance, reporting, coverage. |
| Architecture | `architecture/` — POM vs fixtures, test type selection, mock vs real. |
| Tooling | `scripts/lint-samples.sh` — checks every code sample in this skill against the house rules. |

---

## When to Use

Triggers when you:

- Write or refactor a Playwright spec, page object, fixture, or stub
- Configure `playwright.config`, projects, sharding, or a CI pipeline
- Debug a failing, slow, or flaky Playwright run
- Mock network, time, browser APIs, or third-party services
- Decide between page objects, fixtures, mocks, and real services

---

## Maintenance

`core/house-style.md` is the only file that defines rules; topic files show the rules applied. Edit a rule there, then re-run `scripts/lint-samples.sh` and fix every finding.

---
