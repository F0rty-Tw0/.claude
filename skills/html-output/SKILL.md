---
name: html-output
description: Delivers substantial user-facing output as a self-contained HTML page instead of terminal markdown, published as an Artifact in cloud sessions or saved and opened in the browser locally. Use for plans, PR writeups and reviews, done-task reports, todo lists, explainers, research, option comparisons, triage, or any report the user must digest or answer.
---

# HTML Output

The user stops reading long terminal markdown (dyslexia, ADHD). A laid-out page with color, diagrams, tabs, and controls gets read; a 100-line markdown wall does not. HTML costs 2-4x the tokens and time, so it is reserved for output worth that cost.

## When to use HTML

Make a page when any of these is true of what you are about to tell the user:

- It would run past ~30 lines of terminal markdown.
- It has spatial or visual shape: a diff, a flow, a timeline, 2+ options side by side, a multi-column table over ~10 rows, numbers worth a chart.
- The user must answer it: pick an option, reorder, triage, tune values, approve rows.
- It is one of: implementation plan, PR writeup, code review, done-task report after multi-file work, todo/backlog, explainer of code or a concept, research summary, incident or status report.

Otherwise answer in the terminal as usual. A one-fact answer, a confirmation, or a short status line never becomes a page. This applies to the main session only; subagents return plain reports to their parent.

The terminal reply still exists: the bold result line, any failure or blocker in one line each, git state in one line when the work touched a repo, the link or path, and `Next:`. The rest of the closing-status detail (proof, inferred claims, what only the user can verify) lives on the page.

## Where it goes

Check the session once per session: `echo "$CLAUDE_CODE_REMOTE"` (the same signal `hooks/cloud-context.js` uses).

- `true` (cloud session) → publish with the Artifact tool. Write the source file in the session's scratchpad directory; nothing outside the Artifact needs to survive. Load whatever design skill the tool requires for its page contract (title, theme tokens, allowed CDNs), but house.html's `<head>` and `<style>` win over its design guidance: skip any design pass that would restyle the page. Use an Artifact, not a Claude Docs document, even when a Docs connector is attached: the user chose this routing. Redact secrets, tokens, and env values from any command output first; the page leaves the machine. No Artifact tool in the session → terminal reply as usual. The Artifact host wraps the page in its own document skeleton, so publish a copy without the outer tags and the charset/viewport metas: `sed -E '/^<!doctype html>$|^<\/?html( [^>]*)?>$|^<\/?head>$|^<\/?body>$|^<meta (charset|name="viewport")/d' report.html > report-artifact.html`. The user opens the private link from any device.
- Anything else (local session) → write the file to `$HOME/html-reports/<project>/<YYYY-MM-DD>-<slug>.html` and open it in the browser: `start "" "$HOME/html-reports/..."` on Windows (Git Bash), `open` on macOS, `xdg-open` on Linux. Spell the path with `$HOME`, never `~`: a quoted `~` is not expanded, and the browser gets a path it cannot find. `<project>` is the git repo's folder name, else the working directory's. Regenerating the same report overwrites its file. Print the path in the reply. This rule wins over the Artifact tool's default of publishing finished work: locally, the user reads the file.
- Local session, but the user says they are away or on another device → publish as an Artifact too.

Reports live outside the project repo because HTML diffs are noisy; commit one only when the user asks. When another skill needs its own file (`/plan` writes a markdown plan, `open-pr` puts `## Proof` in the PR body), keep that file as the source of truth and make the page a view of it, not a replacement. Approvals that a skill routes through AskUserQuestion (plan approval, the unknowns gate up to 3 questions) stay there; the page is for reading, and its Copy as prompt is for choices nobody asked through a tool. In plan mode, where writes and `start` are blocked, make no page.

## How to build it

1. Start from [house.html](house.html): copy it, keep its `<head>` and `<style>` as they are, and replace the sample body with your content using its components. Every report shares this look so the user recognizes the layout at a glance; don't restyle per report. Its tokens meet the Artifact tool's theme contract, so after the outer-tag strip above the same content publishes as an Artifact. Changing the house style means editing `house.html` with `skill:frontend-design`.
2. For layout ideas, read the matching example in [examples/](examples/) (table below) from `<body>` down: `grep -n '<body'`, then Read from that line. Take its structure and techniques only. Ignore its CSS: the gallery's look (cream background, serif with terracotta accent, pills, monospace labels) is what `skill:frontend-design` bans. All 31 are catalogued in [catalog.md](catalog.md).
3. One file: inline CSS and JS, no build step, nothing external except the Google Fonts link (offline it falls back to Verdana). Inline SVG for diagrams; load `skill:artifact-diagramming` for anything beyond a simple box-and-arrow.
4. Top of the page: the result banner, one line, colored by outcome. The rest is for scanning: short sections, one idea per line, tabs or `<details>` for depth, a table of contents when there are 4+ sections.
5. If the user must decide anything, add controls and a **Copy as prompt** button that serializes their choices into text they paste back here. Also show that text in a read-only `<textarea>`, because clipboard access can be blocked on `file://` pages. Without the export, the page is a dead end.
6. Real data only. Render diffs from actual `git diff`, numbers from actual command output, and label claims **confirmed** (with the file:line or command) or **inferred**, same as in the terminal. A pretty page with an invented number is worse than none.
7. HTML-escape every code snippet, diff, and command output (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`). One unescaped `<` in a diff silently swallows the rest of the page.
8. Before opening: if the page has a `<script>`, copy it to a scratch file and run `node --check` on it. A syntax error kills every button without any visible sign. This catches syntax only; keep each export form's button, status, and output together, since the template skips a form missing any of them.

| Output | Read first | Required sections |
|---|---|---|
| Done-task report | `11-status-report.html` | Result; failures and unimplemented scope first; files changed; proof (commands run, results vs baseline); inferred but unconfirmed; what only the user can verify; git state (dirty, committed, pushed); Next |
| Implementation plan | `16-implementation-plan.html`, `unknowns/08-implementation-plan.html` | Goal; unknowns and decisions; milestones; data-flow diagram; mockups if UI; key code; risks; acceptance criteria |
| Todo / backlog / triage | `18-editor-triage-board.html` | Draggable buckets (Now / Next / Later / Cut) pre-sorted with your rationale; Copy as prompt |
| PR writeup (your PR, for its reviewers or the user) | `17-pr-writeup.html` | Why; file-by-file; where to focus review; test plan; rollout |
| Code review (someone else's diff) | `03-code-review-pr.html` | Summary verdict; risk map; rendered diff with margin notes colored by severity; next steps |
| Explain code | `04-code-understanding.html`, `14-research-feature-explainer.html` | Diagram of the path; 3-4 annotated snippets; gotchas |
| Explain a concept | `15-research-concept-explainer.html`, `unknowns/02-color-grading-explainer.html` | Interactive model; comparison with the obvious alternative; where it shows up |
| Options / approaches | `01-exploration-code-approaches.html`, `unknowns/03-design-directions.html` | Side-by-side cards with the tradeoff each makes; recommendation; Copy as prompt for the pick |
| Questions for the user (4+ questions; 1-3 go through AskUserQuestion) | `unknowns/06-interview.html` | One question at a time with a recommended default; Copy as prompt for the answers |
| Pre-merge understanding | `unknowns/11-change-quiz.html`, `unknowns/10-pitch-doc.html` | What changed and why; quiz or objection-answer list |
| Incident / postmortem | `12-incident-report.html` | Timeline; root cause; impact; action items |
| Flow or pipeline | `13-flowchart-diagram.html` | Annotated SVG flowchart |

After changing this skill or the AGENTS.md routing line, re-run the routing check in [evals.md](evals.md).
