# Open PR

Write PR titles and descriptions that are concise, honest about impact, and sound like a human wrote them. The analysis is full; the body carries only what a reviewer needs to decide.

## What It Does

Every PR gets the same compact body:

| Part | Contents |
| ---- | -------- |
| Summary | 1–3 sentences: what changed, why if not obvious, one non-obvious impact |
| Sketch | Optional single fenced block: pseudocode, call tree, file tree, Mermaid, or a `diff` of one of those |
| `## Stack` | Only for stacked PRs, 1–3 lines |
| `## Proof` | Before/after pair of the change running (screenshot or CLI/console output), verified / not verified, review verdict |

Blast radius, test counts, ticket numbers, and branch details orient the agent while it builds proof; they stay out of the body.

Process: Proof gate (code-review) > Gather changes > Scan repo context > Write body > Write title (<60 chars, lowercase) > Write summary > Polish (Red Flags) > Present.

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
