# Module Depth

## Contents

- [Core Principle](#core-principle)
- [Vocabulary](#vocabulary)
- [Quick Reference](#quick-reference)
- [Dependencies by Layer](#dependencies-by-layer)
- [Rationalizations](#rationalizations)
- [Red Flags](#red-flags)

## Core Principle

A feature module is deep when a lot of behavior sits behind a small interface. Small files and a deep feature module are not in tension: depth is measured at the interface, not by file length. The 150-line ceiling in `module-size.md` still holds; deepening shrinks what other feature modules import and how many files a caller or test must know, never by growing a file.

The architecture scan that applies these rules lives in `architecture-scan.md`.

Vocabulary from John Ousterhout's *A Philosophy of Software Design* and Michael Feathers, as used in Matt Pocock's `codebase-design` skill.

## Vocabulary

Use these terms exactly in architecture findings. Elsewhere in artification, "module" means a file; here it means a feature module.

| Term | Meaning in this codebase |
|---|---|
| Feature module | The unit of depth: one `feature/ ui/ domain-logic/ data-access/ utils/ common/` tree per `feature-modules.md`. |
| Interface | Everything a caller must know: what other feature modules import, plus method order, error modes, required providers, and invariants. Not only the TypeScript signatures. For a library this is its root barrel; for an app-internal feature module without one, it is the set of files siblings import directly (`feature-modules.md`, Cross-module, relative). |
| Depth | Behavior a caller or test reaches per symbol it must learn. Deep: few exports, much behavior. Shallow: the interface is nearly as complex as what it hides. |
| Seam | Where behavior can change without editing the caller. The external seam is the interface above; layer files are internal seams. |
| Adapter | What fills a seam: a `data-access` file in production; in specs, a `test/mocks/` double swapped in by `TestBed.overrideProvider` (frontend) or `vi.mock` of the `data-access` module (backend). |
| Leverage | What callers get: one implementation pays back across every call site and spec. |
| Locality | What maintainers get: a change, a bug, and its proof land in one feature module. |

## Quick Reference

| Concern | Rule |
|---|---|
| Deletion test | Imagine deleting the file or export. Complexity reappears across several callers → it earns its place. Complexity just vanishes → it is a pass-through; inline it. A `domain-logic` forwarder that exists to keep the one-way layer graph passes: the layer is its reason. |
| Interface size | Each symbol another feature module imports is interface it must learn. Export or barrel one only when another feature module imports it (already the barrel rule); remove it when its last importer goes. |
| Call order leak | A caller that must call several exports in a fixed order is reading the implementation. Give the feature module one entry that owns the order. |
| Test surface | Sibling specs test each file through its exported function and may stub same-feature collaborators (`unit-testing.md`, `spec-style.md`). The feature-root integration spec (add one when deepening a feature that has none) tests through the interface or entry with the `feature`, `ui`, `domain-logic`, and `utils` files real; only a `data-access` adapter at a remote or true-external seam is doubled. It is the spec that must survive an internal refactor unchanged. Moving code between internal files moves its sibling spec with it; it never edits the integration spec. |
| Testing past the interface | A spec that needs an internal exported just for it means the file has no reachable boundary; the split is wrong (`unit-testing.md`). |
| Seam count | One adapter is a hypothetical seam. Frontend: a class provider is already a seam, swapped in specs with `TestBed.overrideProvider`, so it needs no `InjectionToken` or interface; add a token only for what has no class to override (a function, a value, a platform global) or when two production implementations exist. Backend (functions, no DI, primitives in per `feature-modules.md`): the `data-access` module is the seam. Specs replace it with `vi.mock('../data-access/<name>.api.ts', () => <name>ApiMock())`, the factory from `test/mocks/`; `unit-testing.md` allows `vi.mock` because no factory can be injected. A parameter seam that already exists (the `.db.ts` `client`) is used instead. |
| Testable shape | Accept dependencies through `inject()` or parameters instead of constructing them; return results instead of mutating arguments. |

## Dependencies by Layer

Classify what the deepened feature module depends on; the class decides how its integration spec crosses the seam.

| Dependency | Layer | Spec strategy |
|---|---|---|
| Pure computation | `utils/` | Call it for real; no adapter. |
| In-memory state | `domain-logic/` (view-only `signal()`) or `data-access/` (`.store.ts`, `.cache.ts`) | Use a real instance in the spec. |
| Local-substitutable (a stand-in runs locally: PGlite, in-memory file system) | `data-access/` | Run the stand-in in the spec; the seam stays internal. |
| Remote but owned (own HTTP service, queue) | Frontend: `data-access/` `.api.ts` service class. Backend: `data-access/` functions | Frontend: override the class with a `test/mocks/` double, no token. Backend: `vi.mock` the module with a `test/mocks/` factory. |
| True external (third-party REST or SDK, browser platform global) | Backend: `data-access/` `.api.ts` or `.client.ts`. Frontend: a `data-access/` service class, or an `InjectionToken` for a platform global per `feature-modules.md` | A `test/mocks/` double that can also fail or reject, swapped in as above. |

## Rationalizations

| Excuse | Counter |
|---|---|
| "Export it so the other feature module can reuse it." | Every export is interface. Reuse through an entry that owns the behavior, not its parts. |
| "Add a token now in case we swap the implementation." | One adapter is a hypothetical seam, and a class is already overridable. Add a token with the second production implementation. |
| "Deepening means merging these files." | Depth is at the interface. Files stay under 150 lines. |
| "The thin `domain-logic` forwarder fails the deletion test." | It holds the layer graph; the layer is the reason. Flag forwarders outside that role. |

## Red Flags

- A caller imports three or more symbols from one feature module to do one thing.
- The feature-root integration spec doubles anything but a remote or true-external `data-access` adapter.
- An integration spec changes in a refactor that claimed no behavior change.
- A `utils/` function has a sibling spec, but the order `domain-logic` calls it in has none.
