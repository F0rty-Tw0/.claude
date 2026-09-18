# Angular Developer

Generates Angular code and provides architectural guidance across the framework's full surface — reactivity, forms, DI (dependency injection), routing, SSR (server-side rendering), accessibility, styling, testing, and CLI tooling. Always checks the project's actual Angular version before recommending anything version-sensitive, and validates generated code with `ng build`.

## What It Does

Routes to a focused reference doc per topic instead of guessing from training data:

| Area | Covers |
| --- | --- |
| Components | Anatomy, template control flow, inputs/outputs, host bindings |
| Reactivity | `signal`, `computed`, `linkedSignal`, `resource`, `effect` |
| Forms | Signal forms (preferred for v21+), reactive forms, template-driven forms |
| DI | `inject()`, providers, injection context, hierarchical injectors |
| Angular Aria | Accessible headless components — accordion, listbox, combobox, menu, tabs, tree, grid |
| Routing | Route definitions, loading strategies, guards, resolvers, rendering strategies |
| Styling | Tailwind CSS integration, component style encapsulation, animations |
| Testing | Unit tests (Vitest), component harnesses, router testing, E2E (Cypress) |
| Tooling | CLI scaffolding, code modernization migrations, Angular MCP server |

For new projects, defaults to the latest stable Angular and signal forms (v21+) unless the user specifies otherwise.

---

## When to Use

Trigger when you:
- are creating an Angular project, component, or service
- need current best-practice guidance on any of the areas above rather than possibly-stale training knowledge
- have just generated code and need to validate it — run `ng build` before calling it done
