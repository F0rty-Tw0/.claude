# Code Review Reception

Receive and respond to code review feedback with technical rigor, not performative agreement. Verify before implementing, ask before assuming, technical correctness over social comfort.

## What It Does

Follows a structured response pattern for review feedback:

| Step         | Action                                              |
| ------------ | --------------------------------------------------- |
| **Read**     | Complete feedback without reacting                  |
| **Understand** | Restate requirement in own words (or ask)         |
| **Verify**   | Check against codebase reality                      |
| **Evaluate** | Technically sound for THIS codebase?                |
| **Respond**  | Technical acknowledgment or reasoned pushback       |
| **Implement**| One item at a time, test each                       |

Handles source-specific review (human partner vs external reviewers), YAGNI checks, and implementation ordering (blocking > simple > complex).

---

## When to Use

Triggers when you:

- Receive code review feedback before implementing suggestions
- Encounter feedback that seems unclear or technically questionable
- Need to push back on incorrect suggestions with technical reasoning

---

## Core Rules

- No performative agreement ("You're absolutely right!", "Great point!")
- No gratitude expressions - just fix it and show in the code
- Verify against codebase before implementing anything
- If any item is unclear, stop and ask before implementing any of them

---
