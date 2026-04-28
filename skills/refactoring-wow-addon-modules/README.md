# Refactoring WoW Addon Modules

Refactor Lua 5.1 World of Warcraft addon modules by preserving behavior first, extracting the narrowest useful seam, and avoiding premature shared frameworks. The skill focuses on making files shorter because responsibilities are clearer, not because code was merely moved around.

## What It Does

| Focus | Guidance |
| --- | --- |
| Behavior safety | Keep refactors inside a TDD loop and preserve exported contracts on the first pass |
| Extraction level | Choose between local helper, private submodule, feature helper, or shared utility |
| WoW specifics | Keep `_G` usage explicit, preserve client-quirk comments, guard stub-sensitive frame calls |
| Maintainability | Split policy from widget mutation, remove duplicates, keep files and functions focused |

---

## When to Use

Triggers when you:

- Need to split an oversized addon module or function
- See duplicate frame setup, policy logic, or restoration code
- Want to simplify brittle UI code without changing behavior
- Need a refactor plan that respects Lua 5.1 and WoW addon constraints

---

## Core Principles

- Preserve behavior before improving structure
- Extract by responsibility, not by visual similarity alone
- Prefer the smallest helper that removes the duplication cleanly
- Keep WoW-specific quirks explicit and tested

---
