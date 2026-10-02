# Artification

Personal coding rules for TypeScript creation and refactoring. Types expose architecture; pure functions expose behavior boundaries. Ownership, mutability, nested concepts, and utility placement stay explicit.

## What It Does

| File | Purpose |
|---|---|
| `SKILL.md` | Defines when the skill applies and which reference must be read. |
| `references/typescript-style.md` | Stores feature-grouped TypeScript type organization, mutability, declaration and import rules (order, `import type`, return types, accessibility, naming, blank lines, erasable syntax), and statement layout rules. |
| `references/utility-style.md` | Defines pure function extraction, `utils/` placement, `.util.ts` naming, and testing boundaries. |
| `references/feature-modules.md` | Lays out every feature module as `feature` / `ui` / `domain-logic` / `data-access` / `utils` / `common`, with one-way imports (lint-suite `boundaries`), storage-role file names, and one root barrel. |
| `references/module-size.md` | Caps source `.ts` files at 150 lines and specs at 300 and defines how to split by concern, routing chunks through the type and utility rules. |
| `references/module-depth.md` | Measures depth at the feature module's root barrel (deletion test, seam count, interface as test surface) and runs the architecture scan for deepening refactors. |
| `references/unit-testing.md` | Puts every test-only file under the owning feature's `test/`: `test/stubs/`, `test/mocks/`, `test/fixtures/`, `test/utils/*.spec.util.ts`. Keeps `common/` and `utils/` production-only. Bans support-file suffixes. |

---

## When to Use

Use it when you:

- Write TypeScript from scratch
- Refactor TypeScript modules
- Add or reorganize exported or cross-file types
- Change object, nested configuration, or array contracts
- Create a feature module or place a client, store, service, or handler
- Extract pure, deterministic behavior
- Create or reorganize `utils/` folders and `.util.ts` files
- Leave a `.ts` file over 300 lines
- Write or reorganize specs, stubs, fixtures, or test-only helpers

---
