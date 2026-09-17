# Learner

Extracts a reusable skill from the current conversation after a hard-won debugging session. The core principle: a skill is a decision-making heuristic ("how to think about this class of problem"), not a code snippet to copy-paste.

## What It Does

- Validates the candidate insight against three gates before saving anything: not Googleable in 5 minutes, specific to this codebase, and the product of real debugging effort
- Formats the skill with Insight / Why This Matters / Recognition Pattern / The Approach sections — principle first, code only as illustration
- Saves to `~/.claude/skills/learned/` (rare, portable insight) or `.claude/local/skills/` (default, project-specific)

| Keep | Reject |
| --- | --- |
| Non-obvious workaround tied to a real file/line/error | Generic programming pattern anyone could look up |
| Hidden gotcha that wastes time if forgotten | Library usage example |
| Undocumented behavior specific to this project | Boilerplate or type definitions |

---

## When to Use

Trigger only after:
- solving a bug that took real investigation, not a quick lookup
- discovering a workaround specific to this codebase
- finding a gotcha that will bite again if not written down
- uncovering undocumented behavior affecting this project

Do not trigger for routine fixes, standard patterns, or anything a five-minute search would surface.
