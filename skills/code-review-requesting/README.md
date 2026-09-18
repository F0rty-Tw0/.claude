# Requesting Code Review

Dispatch a code-reviewer subagent to catch issues before they ship. Determines review scope, dispatches with template, and acts on findings by severity.

## What It Does

Provides proportional code review based on change size:

| Size       | Criteria                  | Review Depth                          |
| ---------- | ------------------------- | ------------------------------------- |
| **Small**  | <3 files, <50 lines       | Quick scan - bugs and edge cases only |
| **Medium** | 3-10 files                | Standard review with architecture     |
| **Large**  | >10 files or >200 lines   | Full review including design          |

Acts on findings: Critical = fix immediately, Important = fix before proceeding, Minor = note or skip.

---

## When to Use

Triggers when you:

- Complete a feature or task
- Prepare to merge to main branch
- Fix a complex bug
- Want a fresh perspective when stuck

---
