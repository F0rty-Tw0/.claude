# Module Depth

## Contents

- [Core Principle](#core-principle)
- [Vocabulary](#vocabulary)
- [Quick Reference](#quick-reference)
- [Dependencies by Layer](#dependencies-by-layer)
- [Architecture Scan](#architecture-scan)
- [Rationalizations](#rationalizations)
- [Red Flags](#red-flags)

## Core Principle

A feature module is deep when a lot of behavior sits behind a small interface. Small files and a deep feature module are not in tension: depth is measured at the interface, not by file length. The 150-line ceiling in `module-size.md` still holds; deepening shrinks what other feature modules import and how many files a caller or test must know, never by growing a file.

Vocabulary from John Ousterhout's *A Philosophy of Software Design* and Michael Feathers, as used in Matt Pocock's `codebase-design` skill.

## Vocabulary

Use these terms exactly in architecture findings. Elsewhere in artification, "module" means a file; here it means a feature module.

| Term | Meaning in this codebase |
|---|---|
| Feature module | The unit of depth: one `feature/ ui/ domain-logic/ data-access/ utils/ common/` tree per `feature-modules.md`. |
| Interface | Everything a caller must know: what other feature modules import, plus method order, error modes, required providers, and invariants. Not only the TypeScript signatures. For a library this is its root barrel; for an app-internal feature module without one, it is the set of files siblings import directly (`feature-modules.md`, Cross-module, relative). |
| Depth | Behavior a caller or test reaches per symbol it must learn. Deep: few exports, much behavior. Shallow: the interface is nearly as complex as what it hides. |
| Seam | Where behavior can change without editing the caller. The external seam is the interface above; layer files are internal seams. |
| Adapter | What fills a seam: a `data-access` file in production, a `test/mocks/` double swapped in by `TestBed.overrideProvider` in specs. |
| Leverage | What callers get: one implementation pays back across every call site and spec. |
| Locality | What maintainers get: a change, a bug, and its proof land in one feature module. |

## Quick Reference

| Concern | Rule |
|---|---|
| Deletion test | Imagine deleting the file or export. Complexity reappears across several callers → it earns its place. Complexity just vanishes → it is a pass-through; inline it. A `domain-logic` forwarder that exists to keep the one-way layer graph passes: the layer is its reason. |
| Interface size | Each symbol another feature module imports is interface it must learn. Export or barrel one only when another feature module imports it (already the barrel rule); remove it when its last importer goes. |
| Call order leak | A caller that must call several exports in a fixed order is reading the implementation. Give the feature module one entry that owns the order. |
| Test surface | Sibling specs test each file through its exported function and may stub same-feature collaborators (`unit-testing.md`, `spec-style.md`). The feature-root integration spec tests through the interface or entry with the feature's own files real, and is the spec that must survive an internal refactor unchanged. Moving code between internal files moves its sibling spec with it; it never edits the integration spec. |
| Testing past the interface | A spec that needs an internal exported just for it means the file has no reachable boundary; the split is wrong (`unit-testing.md`). |
| Seam count | One adapter is a hypothetical seam. A class provider is already a seam: specs swap it with `TestBed.overrideProvider`, so it needs no `InjectionToken` or interface. Add a token only for what has no class to override (a function, a value, a platform global) or when two production implementations exist. |
| Testable shape | Accept dependencies through `inject()` or parameters instead of constructing them; return results instead of mutating arguments. |

## Dependencies by Layer

Classify what the deepened feature module depends on; the class decides how its integration spec crosses the seam.

| Dependency | Layer | Spec strategy |
|---|---|---|
| Pure computation | `utils/` | Call it for real; no adapter. |
| In-memory state | `domain-logic/` (view-only `signal()`) or `data-access/` (`.store.ts`, `.cache.ts`) | Use a real instance in the spec. |
| Local-substitutable (a stand-in runs locally: PGlite, in-memory file system) | `data-access/` | Run the stand-in in the spec; the seam stays internal. |
| Remote but owned (own HTTP service, queue) | `data-access/` `.api.ts` service class | Override the class with a `test/mocks/` double; no token. |
| True external (third-party SDK, browser platform global) | `data-access/` `.client.ts`, or an `InjectionToken` for a global per `feature-modules.md` | Mock in `test/mocks/` that can also fail or reject. |

## Architecture Scan

Use when asked to review architecture, find refactoring targets, or make a feature module easier to test.

1. **Scope.** A named feature module or pain point wins. Otherwise read `git log --oneline` back far enough to find the files that keep changing, and start there; deepening pays off where change recurs.
2. **Read decisions.** Any ADRs (`docs/adr/`) and the module's `README` in the area. A candidate that contradicts an ADR is listed only when the friction justifies reopening it, and says so.
3. **Explore** (an `Explore` subagent for wide trees) and note friction:
   - Understanding one concept means bouncing across many files or feature modules.
   - An interface nearly as complex as what it hides.
   - Pure `utils/` extracted for testability while the bugs live in how `domain-logic` sequences them.
   - A consumer reaching past a library's root barrel, or importing another feature module's `.api.ts`, `.db.ts`, or `+state/`. Direct file imports between sibling app modules are sanctioned (`feature-modules.md`).
   - Behavior with no spec reachable through the interface.
4. **Apply the deletion test** to each suspect.
5. **Report** candidates, strongest first. Each gets: files; problem; solution in plain words; benefit in locality, leverage, and which specs improve; a before/after file tree or call tree; strength `Strong`, `Worth exploring`, or `Speculative`. End with the one to tackle first and why.
6. **Stop and ask** which candidate to explore. No interfaces are proposed before the user picks.
7. **Design the picked one with the user:** constraints, what sits behind the seam, the new barrel exports, and which sibling specs move versus which integration spec proves the result. A rejection with a reason a future scan would need → offer to record it as an ADR.

## Rationalizations

| Excuse | Counter |
|---|---|
| "Export it so the other feature module can reuse it." | Every export is interface. Reuse through an entry that owns the behavior, not its parts. |
| "Add a token now in case we swap the implementation." | One adapter is a hypothetical seam, and a class is already overridable. Add a token with the second production implementation. |
| "Deepening means merging these files." | Depth is at the interface. Files stay under 150 lines. |
| "The thin `domain-logic` forwarder fails the deletion test." | It holds the layer graph; the layer is the reason. Flag forwarders outside that role. |

## Red Flags

- A caller imports three or more symbols from one feature module to do one thing.
- The feature-root integration spec mocks a file inside its own feature module.
- An integration spec changes in a refactor that claimed no behavior change.
- A `utils/` function has a sibling spec, but the order `domain-logic` calls it in has none.
