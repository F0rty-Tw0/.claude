---
name: code-review-requesting
description: Use when completing tasks, implementing features, or before merging to verify work meets requirements
---

# Requesting Code Review

Dispatch a code-reviewer subagent to catch issues before they ship.

## When to Request

- After completing a feature or task
- Before merge to main branch
- After fixing a complex bug
- When stuck and want a fresh perspective

## How to Request

**1. Determine review scope:**

```bash
git diff --stat HEAD~1..HEAD       # last commit
git diff --stat origin/master..HEAD # full branch
```

**2. Dispatch code-reviewer subagent:**

Use Task tool with the template at `code-reviewer.md`. Fill in:

- `{WHAT_CHANGED}` - Brief description of the change
- `{BASE_SHA}` / `{HEAD_SHA}` - Git range to review

**3. Act on findings:**

| Severity | Action |
|----------|--------|
| Critical | Fix immediately |
| Important | Fix before proceeding |
| Minor | Note for later or skip |

If the reviewer is wrong, push back with technical reasoning.

## Proportional Review

The subagent adapts review depth to change size automatically:

- **Small** (<3 files, <50 lines): Quick scan — bugs and edge cases only
- **Medium** (3-10 files): Standard review with architecture consideration
- **Large** (>10 files or >200 lines): Full review including design and integration

Don't over-review trivial changes. A typo fix doesn't need architecture analysis.

## Integration

- **Subagent-driven development:** Review after each task
- **Plan execution:** Review after each batch
- **Ad-hoc work:** Review before merge

See template: code-reviewer.md
