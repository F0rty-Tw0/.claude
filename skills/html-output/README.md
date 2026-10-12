# html-output

Turns substantial agent output (plans, PR writeups, reviews, done reports, backlogs, explainers) into a self-contained HTML page instead of a long terminal markdown reply. In cloud sessions the page is published as a private Artifact; locally it is saved under `~/html-reports/` and opened in the browser.

Based on Thariq's "unreasonable effectiveness of HTML" post and its example gallery, which is vendored here (Apache-2.0).

## What It Does

| Piece | Purpose |
| --- | --- |
| **When-to-use rule** | Page for long or visual output; terminal for everything short |
| **Delivery switch** | `CLAUDE_CODE_REMOTE=true` → Artifact; local → file + browser |
| **Output table** | Maps each output type to the example to copy and the sections it must have |
| **Read-only pages** | Pages show options and context; decisions go through AskUserQuestion in the terminal |
| `house.html` | House style ("Status spine", built with frontend-design): the starter every report copies, plus a gallery of its components |
| `catalog.md` | All 31 examples with use case and techniques |
| `evals.md` | Six routing scenarios with expected answers and the last baseline vs with-skill run |
| `examples/` | The 31 example pages plus the two gallery indexes, used for structure only (their visual style is not ours) |

---

## When to Use

- Reporting finished multi-file work
- Writing an implementation plan or comparing approaches
- Writing or reviewing a PR
- Explaining code or a concept
- Triage or prioritization proposals (the user confirms in the terminal)

Short answers, confirmations, and one-line statuses stay in the terminal.

---
