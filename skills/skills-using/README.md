# Using Skills

Establishes how to find and use skills, requiring Skill tool invocation BEFORE any response or action - including clarifying questions. Even a 1% chance a skill might apply means invoke it.

## What It Does

Enforces a strict skill-first workflow:

1. **User message received** - Check if any skill might apply
2. **Invoke Skill tool** - Load the skill before doing anything else
3. **Announce** - "Using [skill] to [purpose]"
4. **Follow skill exactly** - Rigid skills (TDD, debugging) followed to the letter; flexible skills (patterns) adapted to context

Skill priority: Process skills first (brainstorming, debugging), then implementation skills (frontend-design).

---

## When to Use

Active at the start of every conversation. Applies whenever:

- Any skill might be relevant (even 1% chance)
- Starting any task, including asking clarifying questions
- "I remember this skill" - skills evolve, read current version

---

## Red Flags

These thoughts mean STOP - you're rationalizing skipping the skill:

- "This is just a simple question"
- "I need more context first"
- "Let me explore the codebase first"
- "This doesn't need a formal skill"
- "The skill is overkill"

---
