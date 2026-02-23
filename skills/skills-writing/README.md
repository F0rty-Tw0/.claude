# Writing Skills

Test-Driven Development applied to process documentation. Write test cases (pressure scenarios), watch them fail (baseline behavior), write the skill, watch tests pass (agents comply), refactor (close loopholes).

## What It Does

Guides skill creation through a TDD-adapted process:

| TDD Concept       | Skill Creation Equivalent                        |
| ------------------ | ------------------------------------------------ |
| **Test case**      | Pressure scenario with subagent                  |
| **Production code**| SKILL.md document                                |
| **RED**            | Agent violates rule without skill (baseline)     |
| **GREEN**          | Agent complies with skill present                |
| **REFACTOR**       | Close loopholes while maintaining compliance     |

Covers: SKILL.md structure (YAML frontmatter, sections), README.md creation, Claude Search Optimization (CSO), directory organization, cross-referencing, token efficiency, and bulletproofing against rationalization.

---

## When to Use

Triggers when you:

- Create new skills or edit existing ones
- Need to verify skills work before deployment
- Want to extract a reusable technique from a session

---

## The Iron Law

No skill without a failing test first. Same as TDD - write skill before testing? Delete it. Start over. No exceptions.

---
