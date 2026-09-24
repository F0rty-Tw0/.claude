# PR Description Generator

Write PR titles and descriptions that are concise, honest about impact, and sound like a human wrote them. Uses the humanizer skill on final output.

## What It Does

Generates size-appropriate PR descriptions:

| Size       | Criteria                  | Output Format                                          |
| ---------- | ------------------------- | ------------------------------------------------------ |
| **Small**  | 1-3 files, <50 lines      | Plain sentences, no sections                           |
| **Medium** | 4-10 files                | Short bullet list with optional "Worth noting"        |
| **Large**  | 10+ files                 | What changed + Impact on existing code + Test plan     |

Process: Gather changes (git diff/log) > Scan repo context > Size the change > Write title (<60 chars, lowercase) > Write description > Add ticket link > Humanize > Present.

---

## When to Use

Triggers when you:

- Create a new PR with `gh pr create`
- Update an existing PR description
- Are asked to describe branch changes for a PR

---

## Red Flags

Rewrite if your PR description has: more than 2 sections for <5 files, bold-header bullets, words like "comprehensive" or "robust", a test plan padded with obvious steps, or a title over 60 characters.

---
