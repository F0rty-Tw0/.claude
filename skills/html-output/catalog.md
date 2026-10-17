# Example catalog

The files in `examples/` are vendored from [ThariqS/html-effectiveness](https://github.com/ThariqS/html-effectiveness) at commit `1787245` (2026-07-03), Apache-2.0 (`examples/LICENSE`). They accompany Thariq's post on using HTML instead of markdown as agent output. Each is self-contained: no external scripts, fonts, or network calls. Content is fictional ("Acme").

Pages are unchanged except the removals: the editor, input-collector, and prototype pages (`06`, `07`, `08`, `18`, `19`, `20`, `unknowns/06`) were deleted because every decision goes through AskUserQuestion, and the gallery indexes dropped their cards.

`examples/index.html` and `examples/unknowns/index.html` are the gallery pages; open them in a browser to see everything with thumbnails.

## Core gallery

| File | Use it for | Techniques worth taking |
|---|---|---|
| `01-exploration-code-approaches.html` | Comparing 2-4 implementation approaches | Side-by-side code cards, tradeoff labels, recommendation block |
| `02-exploration-visual-designs.html` | Comparing visual directions | Grid of rendered variants, labelled tradeoffs |
| `03-code-review-pr.html` | Reviewing a PR | Risk map, file list, rendered diff rows with margin notes, suggested next steps |
| `04-code-understanding.html` | How a flow moves through a codebase | Request-path diagram, call-stack walkthrough with code |
| `05-design-system.html` | Design-system reference from a codebase | Color, type, spacing, radius, elevation swatches; core components |
| `09-slide-deck.html` | Weekly update as slides | Keyboard-navigated slides, small charts. No report type uses it yet |
| `10-svg-illustrations.html` | Header illustrations or figures | Inline SVG art, palette rules. No report type uses it yet |
| `11-status-report.html` | Status or done report | Highlights, shipped list, velocity chart, carryover |
| `12-incident-report.html` | Incident postmortem | Colored timeline, root cause, impact, action items |
| `13-flowchart-diagram.html` | Pipeline or process | Annotated SVG flowchart |
| `14-research-feature-explainer.html` | How a feature works in this codebase | Step-by-step request path, tabbed config samples, gotchas, FAQ |
| `15-research-concept-explainer.html` | Teaching a concept | Interactive ring model, comparison with the naive approach |
| `16-implementation-plan.html` | Implementation plan | Milestones, data-flow diagram, mockups, key code, risks and mitigations |
| `17-pr-writeup.html` | PR description for reviewers | Why, file-by-file, where to focus review, test plan, rollout |

## "Know your unknowns" series (`unknowns/`)

Pages that surface what you and the agent don't know yet, ordered by project phase.

| File | Phase | Use it for |
|---|---|---|
| `01-blindspot-pass.html` | Before code | Unknowns scan: each trap as a one-sentence headline with evidence |
| `02-color-grading-explainer.html` | Before code | Teaching the user a domain in one sitting |
| `03-design-directions.html` | Before code | Four distinct directions to react to |
| `04-toolbar-mock.html` | Before code | Mocking layout calls instead of guessing |
| `05-churn-brainstorm.html` | Before code | Ranked brainstorm, cheapest to most ambitious; also the ranking layout for triage |
| `07-reference-port.html` | Before code | Mapping semantics from a reference implementation |
| `08-implementation-plan.html` | Before code | Plan sorted by likelihood of tweaking, mechanical work collapsed at the bottom |
| `09-implementation-notes.html` | During | Running log of deviations from the plan |
| `10-pitch-doc.html` | After | Buy-in doc that answers reviewer objections up front |
| `11-change-quiz.html` | After | Quiz the user on the change before merge |

## Patterns across the set

- Most pages end with an export button (`Copy`, `Copy prompt`, `Download SVG`, `Export selected`), and several use checkboxes, sliders, or toggles. Our pages are read-only: take the layout, drop every control and export.
- Most pages have `@media` rules for narrow screens. None handle `prefers-color-scheme`; house.html already does.
- System fonts and inline CSS variables throughout. No frameworks.
