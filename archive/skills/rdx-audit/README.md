# RDX Audit

One-shot, read-only audit for over-engineered code and wordy comments or docs. Also covers the old `rdx-review` job (code-only pre-merge review).

## What It Does

| Domain | Audit Check |
| --- | --- |
| Code | Flags hand-rolled stdlib utilities, single-implementation abstractions, and configuration that never changes. |
| Prose | Spots redundant comments, wordy documentation, and speculative TODO graveyards. |
| Constraints | Excludes trust boundaries (security, input validation, data protection) from cuts. |

---

## When to Use

Triggers when you:
- Audit a file, diff, PR, or the whole repository for bloat.
- Review a diff for over-engineering before merge (`code` mode).
- Run /rdx-audit or ask "what can I cut".

---
