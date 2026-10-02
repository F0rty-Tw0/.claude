# Architecture Scan

## Contents

- [Core Principle](#core-principle)
- [Procedure](#procedure)
- [Visual Report](#visual-report)
- [Design It Twice](#design-it-twice)
- [Grilling Rounds](#grilling-rounds)
- [Common Mistakes](#common-mistakes)

## Core Principle

Find shallow feature modules, show each deepening as a picture, and design the chosen one with the user before any code moves. Every term comes from `module-depth.md`: feature module, interface, depth, seam, adapter, leverage, locality. Never drift into "component", "service", "API", or "boundary" for those ideas.

Adapted from Matt Pocock's `improve-codebase-architecture`, `codebase-design`, and `grilling` skills.

## Procedure

Use when asked to review architecture, find refactoring targets, or make a feature module easier to test.

1. **Scope.** A named feature module or pain point wins. Otherwise read `git log --oneline` back far enough to find the files that keep changing, and start there; deepening pays off where change recurs. Scattered history with no hot spot → widen the net.
2. **Read decisions.** Any ADRs (`docs/adr/`), a `GLOSSARY.md`, and the module's `README` in the area. A candidate that contradicts an ADR is listed only when the friction justifies reopening it, and the card says so.
3. **Explore** (an `Explore` subagent for wide trees) and note friction:
   - Understanding one concept means bouncing across many files or feature modules.
   - An interface nearly as complex as what it hides.
   - Pure `utils/` extracted for testability while the bugs live in how `domain-logic` sequences them.
   - A consumer reaching past a library's root barrel, or importing another feature module's `.api.ts`, `.db.ts`, or `+state/` and so skipping its `domain-logic` (`feature-modules.md`, Root barrel contents). Direct file imports between sibling app modules are the sanctioned pattern, not friction.
   - Behavior with no spec reachable through the interface.
4. **Apply the deletion test** (`module-depth.md`) to each suspect.
5. **Report** the candidates as a visual report (below). Name the one to tackle first and why.
6. **Stop and ask** which candidate to explore. No interfaces are proposed before the user picks.
7. **Design it twice** when the shape of the new interface is not obvious, or the user asks for alternatives.
8. **Grill** the picked design to a shared understanding (below).
9. **Record and hand off.** A rejection with a reason a future scan would need → offer an ADR, framed as "Record this so future scans don't re-suggest it?" Skip ephemeral reasons ("not now"). A confirmed design → the `plan` skill for implementation slices.

## Visual Report

The diagrams carry the report; prose is a line or two per card. If a diagram needs a paragraph to be understood, redraw the diagram.

**Where it goes.** Publish it as a private Artifact (load `artifact-design` first). No Artifact tool in this environment → write one self-contained HTML file to the OS temp directory (`$TMPDIR`, `/tmp`, or `%TEMP%`) as `architecture-review-<timestamp>.html`, open it (`start`, `open`, or `xdg-open`), and give the absolute path. Nothing lands in the repo. Mermaid loads from `cdn.jsdelivr.net/npm/mermaid@11`.

**Header.** Repo name, date, and a legend: solid box = file, thick dark box = deep feature module, dashed line = seam, red arrow = leak. No introduction.

**One card per candidate:**

| Part | Contents |
|---|---|
| Title | Names the deepening: "Collapse the order intake call order" |
| Badges | Strength `Strong`, `Worth exploring`, or `Speculative`, plus the dependency category from `module-depth.md` |
| Files | Monospace list |
| Before / After | Two diagrams side by side, about 320px tall, the centrepiece |
| Problem | One sentence: what hurts |
| Solution | One sentence: what changes |
| Wins | Bullets of six words or fewer, in glossary terms: "locality: pricing bugs land in one module", "interface shrinks to one entry". Never "cleaner" or "easier to maintain". |
| ADR callout | One line, only when the candidate contradicts an ADR |

**Diagram patterns.** Pick per candidate and mix them; a report where every diagram looks the same hides the differences.

| Pattern | Use when | Before → After |
|---|---|---|
| Mermaid `flowchart` | Dependencies or call flow are the point | Tangle with red leak edges → one dark deep module |
| Mermaid `sequenceDiagram` | Round-trips are the point | Six calls across the seam → one |
| Mass diagram | Interface as wide as the implementation | Two rectangles per module: interface nearly as tall as implementation → short interface, tall implementation |
| Cross-section | Layers that each do little | Stacked thin bands a call passes through → one thick band named for the responsibility |
| Call-graph collapse | A caller drives many small calls | Nested boxes of calls → one box with the calls faded inside |

Hand-built boxes (bordered divs, inline SVG arrows) when Mermaid's layout fights the point, typically for the thick deep-module box with greyed internals.

**Top recommendation.** One larger card at the end: candidate name, one sentence on why, link to its card.

## Design It Twice

The first interface idea is rarely the best (Ousterhout). For the picked candidate:

1. **Frame the problem** for the user: the constraints any new interface must meet, its dependencies and their categories, and a rough code sketch that makes the constraints concrete (not a proposal). Show it, then dispatch at once; the user reads while the agents work.
2. **Dispatch three `architect` agents in one wave**, each with the same technical brief (file paths, coupling, dependency categories, what sits behind the seam, the `module-depth.md` vocabulary and any `GLOSSARY.md` terms) and a different constraint:
   - Minimize the interface: one to three entry points, maximum leverage each.
   - Make the most common caller trivial.
   - Maximize flexibility for many callers. Swap this one for "Ports and adapters across the seam" when the candidate has a remote or true-external dependency.
3. **Each returns:** the interface (types, methods, invariants, ordering, error modes), a caller example, what hides behind the seam, the adapter and spec strategy per `module-depth.md`, and where leverage is thin.
4. **Compare** the designs one after another, then side by side on depth, locality, and seam placement. Recommend one, or a hybrid of named parts. Be opinionated; the user wants a read, not a menu.

## Grilling Rounds

Walk the design as a tree of decisions until nothing is silently assumed.

- **Frontier.** Each round asks every decision whose prerequisites are settled. A question that depends on another still open waits for a later round.
- **Format.** Number each question and give a recommendation:

  ```markdown
  **Q1 — Where does retry policy live?** In the facade, or the caller decides per call.

  Recommended: the facade; every caller retries the same way today.
  ```

- **Facts are yours, decisions are theirs.** A question that needs a fact from the code goes to an `Explore` subagent, never to the user. Only the questions downstream of a running lookup wait; ask the rest now.
- **Usual branches:** constraints, what sits behind the seam, the new interface and its error modes, which sibling specs move, and which integration spec proves the result.
- **Glossary.** A sharpened domain term goes into `GLOSSARY.md` when the repo keeps one.
- **Done** when the frontier is empty and the user confirms the shared understanding. No code before that.

## Common Mistakes

| Mistake | Fix |
|---|---|
| A text-only report | Every candidate gets a before/after diagram; redraw instead of explaining. |
| Proposing interfaces in the report | Stop at the pick (step 6). |
| Asking the user where a file lives | Look it up with a subagent; only decisions go to the user. |
| Four or more design agents at once | Three per wave; swap a brief instead of adding one. |
| Flagging direct sibling-module file imports | Sanctioned by `feature-modules.md`; flag only past-barrel reaches into libraries or into `.api.ts`, `.db.ts`, `+state/`. |
| Listing every refactor an ADR forbids | List only those whose friction justifies reopening the ADR. |
