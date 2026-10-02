# Open PR

Write PR titles and descriptions that are concise, honest about impact, and sound like a human wrote them. The analysis is full; the body carries only what a reviewer needs to decide.

## What It Does

Every PR gets the same compact body:

| Part | Contents |
| ---- | -------- |
| Summary | 1–3 sentences: what changed, why if not obvious, one non-obvious impact |
| `## Stack` | Only for stacked PRs, 1–3 lines |
| `## Proof` | Blast radius + rollback, test command + counts, before/after pair of the change running (screenshot or CLI/console output), verified / not verified |
| `<details>` | For our own PRs only: runtime logs, base-failure output, Trunk gate/invariants/deep-read list |

Process: Proof gate (code-review) > Gather changes > Scan repo context > Ask audience > Write title (<60 chars, lowercase) > Write summary > Add ticket link > Polish (Red Flags) > Present.

---

## When to Use

Triggers when you:

- Create a new PR with `gh pr create`
- Update an existing PR description
- Are asked to describe branch changes for a PR

---

## Red Flags

Rewrite if your PR description has: sections besides Stack and Proof, a summary over 3 sentences, bold-header bullets, words like "comprehensive" or "robust", or a title over 60 characters.

---
