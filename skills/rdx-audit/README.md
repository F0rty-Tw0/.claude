# RDX Audit

One-shot audit tool for identifying over-engineered logic and redundant, wordy comments or documentation sections.

## What It Does

| Domain | Audit Check |
| --- | --- |
| Code | Flags hand-rolled stdlib utilities, single-implementation abstractions, and configuration that never changes. |
| Prose | Spots redundant comments, wordy documentation, and speculative TODO graveyards. |
| Constraints | Excludes trust boundaries (security, input validation, data protection) from cuts. |

---

## When to Use

Triggers when you:
- Audit a file, diff, or the whole repository for bloat.
- Request feedback on what code or documentation can be cut.
- Run /rdx-audit or ask "what can I cut".

---
