# html-output

Turns substantial agent output (plans, PR writeups, reviews, done reports, backlogs, explainers) into a self-contained HTML page instead of a long terminal markdown reply. In cloud sessions the page is published as a private Artifact; locally it is saved under `~/html-reports/` and opened in the browser.

Based on Thariq's "unreasonable effectiveness of HTML" post and its example gallery, which is vendored here (Apache-2.0).

## What It Does

| Piece | Purpose |
| --- | --- |
| **When-to-use rule** | Page for long, visual, or answer-me output; terminal for everything short |
| **Delivery switch** | `CLAUDE_CODE_REMOTE=true` → Artifact; local → file + browser |
| **Output table** | Maps each output type to the example to copy and the sections it must have |
| **Copy as prompt** | Every page that asks for a decision exports the user's choices back as pasteable text |
| `house.html` | House style ("Status spine", built with frontend-design): the starter every report copies, plus a gallery of its components |
| `catalog.md` | All 31 examples with use case and techniques |
| `examples/` | The 31 example pages plus the two gallery indexes, used for structure only (their visual style is not ours) |

---

## When to Use

- Reporting finished multi-file work
- Writing an implementation plan or comparing approaches
- Writing or reviewing a PR
- Explaining code or a concept
- Triage, prioritization, or any list the user must reorder or approve

Short answers, confirmations, and one-line statuses stay in the terminal.

---
