# RDX Review

Identifies over-engineering, redundant abstractions, and custom rewrites of standard library utilities during code reviews and pull requests.

## What It Does

| Target | Review Action |
| --- | --- |
| Abstractions | Flags single-implementation classes, interfaces, or factories where no multiple cases exist. |
| Redundancy | Points out custom code reinventing stdlib helpers or package capabilities. |
| Precision | Requires explicit diff/file evidence, preventing empty or speculative verdicts. |

---

## When to Use

Triggers when you:
- Review pull requests or code diffs for over-engineering.
- Request feedback on whether a implementation is too complex.
- Run /rdx-review or ask "review this for bloat".

---
