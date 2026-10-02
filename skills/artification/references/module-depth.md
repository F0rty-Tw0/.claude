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

A feature module is deep when a lot of behavior sits behind a small root barrel. Small files and a deep feature module are not in tension: depth is measured at the barrel, not by file length. The 150-line ceiling in `module-size.md` still holds; deepening shrinks what crosses the barrel and how many files a caller or test must know, never by growing a file.

Vocabulary from John Ousterhout's *A Philosophy of Software Design* and Michael Feathers, as used in Matt Pocock's `codebase-design` skill.

## Vocabulary

Use these terms exactly in architecture findings. Elsewhere in artification, "module" means a file; here it means a feature module.

| Term | Meaning in this codebase |
|---|---|
| Feature module | The unit of depth: one `feature/ ui/ domain-logic/ data-access/ utils/ common/` tree per `feature-modules.md`. |
| Interface | Everything a caller must know: the root barrel's exports, plus the facade or service method order, error modes, required providers, and invariants. Not only the TypeScript signatures. |
| Depth | Behavior a caller or test reaches per symbol it must learn. Deep: few exports, much behavior. Shallow: the barrel is nearly as complex as what it hides. |
| Seam | Where behavior can change without editing the caller. The external seam is the root barrel; layer files are internal seams. |
| Adapter | What fills a seam: a `data-access` file in production, a `test/mocks/` double in specs. |
| Leverage | What callers get: one implementation pays back across every call site and spec. |
| Locality | What maintainers get: a change, a bug, and its proof land in one feature module. |

## Quick Reference

| Concern | Rule |
|---|---|
| Deletion test | Imagine deleting the file or export. Complexity reappears across several callers → it earns its place. Complexity just vanishes → it is a pass-through; inline it. A `domain-logic` forwarder that exists to keep the one-way layer graph passes: the layer is its reason. |
| Barrel size | Each root barrel export is interface a caller must learn. Add one only when another feature module imports it (already the barrel rule); remove one when its last importer goes. |
| Call order leak | A caller that must call several exports in a fixed order is reading the implementation. Give the feature module one entry that owns the order. |
| Test surface | Sibling specs test each file through its exported function (`unit-testing.md`). The feature-root integration spec tests through the root barrel or entry, and is the spec that must survive an internal refactor unchanged. Moving code between internal files moves its sibling spec with it; it never edits the integration spec. |
| Testing past the interface | A spec that needs an internal exported just for it means the file has no reachable boundary; the split is wrong (`unit-testing.md`). |
| Seam count | One adapter is a hypothetical seam. Add an `InjectionToken` or port only when two adapters exist; the production adapter plus a test double counts as two. |
| Testable shape | Accept dependencies through `inject()` or parameters instead of constructing them; return results instead of mutating arguments. |

## Dependencies by Layer

Classify what the deepened feature module depends on; the class decides how its integration spec crosses the seam.

| Dependency | Layer | Spec strategy |
|---|---|---|
| In-process (pure computation, in-memory state) | `utils/` | Call it for real; no adapter. |
| Local-substitutable (a stand-in runs locally: PGlite, in-memory file system) | `data-access/` | Run the stand-in in the spec; the seam stays internal. |
| Remote but owned (own HTTP service, queue) | `data-access/` behind a port | Production HTTP adapter, in-memory adapter in `test/mocks/`. |
| True external (Stripe, browser platform APIs) | `data-access/` behind an `InjectionToken` | Mock adapter in `test/mocks/` that can also fail or reject. |

## Architecture Scan

Use when asked to review architecture, find refactoring targets, or make a feature module easier to test.

1. **Scope.** A named feature module or pain point wins. Otherwise read `git log --oneline` back far enough to find the files that keep changing, and start there; deepening pays off where change recurs.
2. **Read decisions.** Any ADRs (`docs/adr/`) and the module's `README` in the area. A candidate that contradicts an ADR is listed only when the friction justifies reopening it, and says so.
3. **Explore** (an `Explore` subagent for wide trees) and note friction:
   - Understanding one concept means bouncing across many files or feature modules.
   - A root barrel nearly as complex as what it hides.
   - Pure `utils/` extracted for testability while the bugs live in how `domain-logic` sequences them.
   - A feature module importing another's internals past its barrel.
   - Behavior with no spec reachable through the barrel.
4. **Apply the deletion test** to each suspect.
5. **Report** candidates, strongest first. Each gets: files; problem; solution in plain words; benefit in locality, leverage, and which specs improve; a before/after file tree or call tree; strength `Strong`, `Worth exploring`, or `Speculative`. End with the one to tackle first and why.
6. **Stop and ask** which candidate to explore. No interfaces are proposed before the user picks.
7. **Design the picked one with the user:** constraints, what sits behind the seam, the new barrel exports, and which sibling specs move versus which integration spec proves the result. A rejection with a reason a future scan would need → offer to record it as an ADR.

## Rationalizations

| Excuse | Counter |
|---|---|
| "Export it so the other feature module can reuse it." | Every export is interface. Reuse through an entry that owns the behavior, not its parts. |
| "Add a token now in case we swap the implementation." | One adapter is a hypothetical seam. Add it with the second adapter. |
| "Deepening means merging these files." | Depth is at the barrel. Files stay under 150 lines. |
| "The thin `domain-logic` forwarder fails the deletion test." | It holds the layer graph; the layer is the reason. Flag forwarders outside that role. |

## Red Flags

- A caller imports three or more symbols from one barrel to do one thing.
- A spec mocks a file inside the same feature module to test its neighbor.
- An integration spec changes in a refactor that claimed no behavior change.
- A `utils/` function has a sibling spec, but the order `domain-logic` calls it in has none.
