---
name: structuring-feature-modules
description: Use when creating or structuring a feature module, library entry point, or package subpath that has its own public API — deciding its folder layout, file/type/const naming, layer boundaries, and what its barrel exports. Use when placing an HTTP client, store, reactive state, service, mapper, formatter, type, constant, or DI provider, or when a module mixes data, pure logic, I/O, and DI in one folder.
---

# Structuring Feature Modules

## Overview

Organize a feature by **slice first, layer second**. One feature = one folder, split into four
dependency-ordered layers. Name files by role, keep dependencies flowing one way, and export only
what a consumer actually uses.

**Core principle:** every feature module is a fill-in-the-blank copy of the same four-layer skeleton.
Consistency and enforceable boundaries beat per-module cleverness.

## When to Use

Use when a module has **two or more** of these concerns:

- types/constants (data shapes, default copy)
- pure logic (mappers, transformers, formatters, merges)
- external I/O or state (HTTP/API client, store, reactive state, cache, storage)
- DI wiring (injectable services, providers, injection tokens)

Then layer it — **even if a layer holds a single file**. A one-file folder is cheap; the boundary and
the repeatable template are the payoff.

**Do NOT use for:** a single standalone helper, one pure function, or a throwaway script. Those stay
one flat file. The trigger is *concern count, not file count*.

> ⚠️ **Counter the "too small to earn folders" reflex.** The instinct to keep a small module flat and
> split later is wrong here. Splitting later means renaming imports across consumers and re-deriving
> the boundary every time. If the module has the concerns above, lay the four folders now.

## The Four Layers

| Layer | Holds | May import from |
|---|---|---|
| `common` | types, interfaces, constants. Pure data. **No framework, no logic, no I/O.** | `common` only |
| `utils` | pure functions: mappers, transformers, formatters, merges. **No framework, no I/O.** | `utils`, `common` |
| `data-access` | external I/O **and** internal state: HTTP/API clients, stores, reactive state, caches, persistence. | `data-access`, `utils`, `common` |
| `domain-logic` | **injectable services** (orchestrators) **and** DI providers + injection tokens. | `domain-logic`, `data-access`, `utils`, `common` |

**Dependency direction is one-way and downward only:** `domain-logic → data-access → utils → common`.
A lower layer never imports an upper one. `common` imports nothing but itself.

Two rules that decide placement when it's ambiguous:

1. **State and I/O go to `data-access`** — a store holding reactive state belongs beside the HTTP client,
   not in a service. Both are "talks to the outside or remembers things."
2. **Keep `domain-logic` thin.** A service orchestrates: it composes utils + data-access into domain
   operations. Every pure transformation inside a service is a `utils` function in the wrong place —
   extract it. If you can't find a pure function to extract, look harder; usually the mapping or
   formatting is one.

## Folder Structure

```
<module>/
├── common/
│   ├── <name>.type.ts
│   ├── <name>.const.ts
│   ├── <name>.const.spec.ts
│   └── index.ts                # curated layer barrel
├── utils/
│   ├── <name>.util.ts          # pure mapper / formatter / merge
│   ├── <name>.util.spec.ts
│   └── index.ts
├── data-access/
│   ├── <name>.client.ts        # external API
│   ├── <name>.store.ts         # internal reactive state
│   ├── <name>.client.spec.ts
│   └── index.ts
├── domain-logic/
│   ├── <name>.service.ts       # injectable orchestrator
│   ├── <name>.provider.ts      # injection token + provideX()
│   ├── <name>.service.spec.ts
│   └── index.ts
└── index.ts                    # public barrel — composes curated layer barrels
```

- Folder = layer, filename prefix = slice. The two axes are orthogonal.
- Specs live **beside** source, never in a separate `__tests__` tree.
- Shared-across-slices values get their own named file, not a `misc`/`shared` dump.
- Split a file the moment it nears the lint line ceiling — spin the cohesive sub-group into
  `<name>.<sub>.util.ts`.

## Barrels — export only what is consumed

Start with **nothing exported**. Add an export only when an external consumer needs that symbol.

- **Internal stays internal:** wire/API payload types, internal mappers, and thin clients used only by
  a service are **not** exported. Leaking them widens the public API and (in TS) can force their
  transitive types public too.
- Each **layer `index.ts`** curates named exports (split `export type { }` from value exports).
- The **top `index.ts`** composes the already-curated layer barrels.
- Avoid blanket `export *` from leaf files — name what you expose.

```ts
// data-access/index.ts — client is internal; only the store is consumed
export { NotificationStore } from './notification.store';
// NotificationClient NOT exported — implementation detail of the service

// common/index.ts — wire payload stays private
export type { Notification, NotificationConfig } from './notification.type';
// RawNotification NOT exported — internal API shape
export { NOTIFICATION_EN_LABELS } from './notification.const';
```

## Naming

| Thing | Rule | Example |
|---|---|---|
| File | `<slice>.<kind>.ts` | `notification.client.ts` |
| Type | `Prefix + Domain + Concept + Role` | `NatTableControlsIntlConfig` |
| Role suffixes | carry meaning | `Config`, `ProviderConfig`, `Context`, `Labels`, `Map`, `Formatter` |
| Config trio | repeat per slice | `X` / `XConfig` / `XProviderConfig` |
| Constant | `NAMESPACE_SCREAMING_SNAKE` | `NAT_TABLE_BUILT_IN_LOCALES` |
| Default/core variant | **drops** the infix; variants carry it | core `X_LABELS`, variant `X_CONTROLS_LABELS` |
| Canonical id | one export, never duplicate aliases | `NAT_EN_LOCALE_ID` |

Type shapes: all fields `readonly`, doc-comment each public field. When you rename a folder/concept,
**rename its types too** — stale prefixes from an old name are the #1 drift.

## Generics

- **Descriptive `T`-prefixed names** when the param has meaning: `TData`, `TValue`, `TContext`.
  Bare `T` only for a trivial single-param helper.
- **Constrain by default:** `<T extends object>`, `<TData extends RowData>`.
- **Public generics get a default** so consumers can omit: `<TData extends RowData = RowData>`.
- **Thread a context type through callbacks** instead of `any`.
- **Assert-and-narrow helpers return the narrowed type**, not `void`:

```ts
const expectDefined = <TValue>(v: TValue | undefined, label: string): TValue => {
  if (v === undefined) throw new Error(`${label} must be defined.`);
  return v; // caller now has TValue, not TValue | undefined
};
```

- Don't add a type param with one concrete call site — inline the type.

## Specs

Gherkin nesting, leaf assertion only:

```
describe('FEATURE: <slice/behavior>')
  describe('GIVEN: <state>')
    describe('WHEN: <active verb>')   // "maps the payload", "falls back to default"
      it('THEN: <observable result>')
```

- **Compute once in the block, assert in the `it`.**
- **Parametrize sweeps** (`it.each`) over a set; label each case so failures name themselves.
- **Golden-value locks** for stable copy/output.
- Many small co-located specs beat one giant cross-cutting spec.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Flat folder, files by role-suffix only | Layer by concern; a one-file layer folder is fine |
| "Too small for layers, split later" | Lay folders now if the concerns exist — renaming imports later is the cost |
| HTTP client or store floating flat / inside a service | `data-access` layer (external I/O **and** state) |
| Fat service with inline mapping/formatting | Extract pure logic to `utils`; keep the service thin |
| Provider/token in `common` | Providers + services live in `domain-logic` (`common` can't import `utils`/DI) |
| Barrel exports everything | Export only the consumed surface; keep wire types + internal mappers private |
| `export *` from leaf files | Curate named exports per layer barrel |

## Quick Reference

- Slice first, layer second.
- 4 layers: `common` (data) · `utils` (pure logic) · `data-access` (I/O + state) · `domain-logic` (services + DI).
- Dependencies point down only.
- `data-access` = external APIs **or** internal state.
- `domain-logic` = injectable services **and** providers/tokens; keep them thin, push pure logic to `utils`.
- Barrel exports only what a consumer uses; internal symbols stay private.
- Name by role; default variant drops the infix; rename types when you rename concepts.
