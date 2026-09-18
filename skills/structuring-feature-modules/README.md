# Structuring Feature Modules

A house-style guide for laying out a feature module, library entry point, or package subpath. Organize
by feature-slice first and dependency-layer second, name files by role, keep dependencies one-way, and
export only what a consumer actually uses.

## What It Does

Codifies a repeatable four-layer skeleton so every feature module looks the same and its boundaries are
enforceable.

| Layer | Holds | May import from |
|---|---|---|
| `common` | types + constants (pure data) | `common` |
| `utils` | pure functions: mappers, formatters, merges | `utils`, `common` |
| `data-access` | external I/O **and** internal state (clients, stores) | `data-access`, `utils`, `common` |
| `domain-logic` | injectable services + DI providers/tokens | all of the above |

Also covers: file/type/constant naming, generics conventions, Gherkin spec form, and curated barrel
exports.

---

## When to Use

Triggers when you:

- Create or scaffold a new feature module, library entry point, or package subpath
- Decide where an HTTP client, store, service, mapper, type, constant, or DI provider belongs
- Have a module that mixes data, pure logic, I/O, and DI in one folder
- Need to decide what a module's `index.ts` barrel should export

Not for a single standalone helper or a throwaway script — the trigger is concern count, not file count.

---
