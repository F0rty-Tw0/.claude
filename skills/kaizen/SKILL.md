---
name: kaizen
description: Use when code shows over-engineering, YAGNI violations, speculative abstraction, or tech-debt/code-smell discussions
---

# Kaizen: Continuous Improvement

## Overview

Small improvements continuously. Error-proof by design. Follow what works. Build only what's needed.

**Core principle:** Many small improvements beat one big change. Prevent errors at design time, not with fixes.

## When to Use

Applied to all code work: implementation, refactoring, architecture, error handling, technical debt reduction, clean code improvements.

## Quick Reference

| Pillar                         | Core Question                          | Red Flag                       |
| ------------------------------ | -------------------------------------- | ------------------------------ |
| **Continuous Improvement**     | Can I make the code I'm changing better? | "I'll refactor it later"     |
| **Poka-Yoke (Error Proofing)** | How can I make this error impossible?  | "Users should just be careful" |
| **Standardized Work**          | What pattern does the codebase use?    | "I prefer to do it my way"     |
| **Just-In-Time (JIT)**         | Is this needed now?                    | "We might need this someday"   |

## The Four Pillars

### 1. Continuous Improvement (Kaizen)

Small, frequent improvements compound into major gains.

**Incremental over revolutionary:**

- Smallest viable change that improves quality
- One improvement at a time, verify before next

**Leave the code you touch better (boy scout rule, inside the task's scope):**

- Fix smells, dead code, and outdated comments in the lines the task already changes
- Smells elsewhere: note them as a one-line follow-up instead of fixing them unasked

**Iterative refinement:**

1. Make it work
2. Make it clear
3. Make it efficient

Don't try all three at once. For the structured iterative cycle, see skill:test-driven-development.

See [patterns-and-examples.md](patterns-and-examples.md) for code examples.

### 2. Poka-Yoke (Error Proofing)

Design systems that prevent errors at compile/design time, not runtime.

**Make errors impossible:**

- Type system catches mistakes, compiler enforces contracts
- Invalid states unrepresentable
- Errors caught early (left of production)

**Defense in layers:**

1. Type system (compile time)
2. Validation (runtime, early)
3. Guards (preconditions)
4. Error boundaries (graceful degradation)

See [patterns-and-examples.md](patterns-and-examples.md) for type system patterns, validation strategies, guards, and configuration examples.

### 3. Standardized Work

Follow established patterns. Document what works. Make good practices easy to follow.

**Consistency over cleverness:**

- Follow existing codebase patterns
- Don't reinvent solved problems
- New pattern only if significantly better

**Documentation lives with code:**

- README for setup, CLAUDE.md for AI conventions
- Comments for "why", not "what"

**Automate standards:**

- Linters enforce style, type checks enforce contracts
- Tests verify behavior, CI/CD enforces quality gates

See [patterns-and-examples.md](patterns-and-examples.md) for pattern-following examples and error handling patterns.

### 4. Just-In-Time (JIT)

Build what's needed now. No more, no less. Avoid premature optimization and over-engineering.

**YAGNI (You Aren't Gonna Need It):**

- Implement only current requirements
- No "just in case" features, delete speculation

**Simplest thing that works:**

- Start with straightforward solution
- Add complexity only when needed
- Don't anticipate future needs

**Optimize when measured:**

- Profile before optimizing
- Measure impact, accept "good enough" performance

**When to add complexity:**

- Current requirement demands it
- Pain points identified through use
- Multiple use cases emerged (Rule of Three for abstractions)

See [patterns-and-examples.md](patterns-and-examples.md) for YAGNI examples, premature abstraction anti-patterns, and performance optimization guidance.

## Common Mistakes

**Continuous Improvement violations:**

- "I'll refactor it later" -> Fix now or create a tracked issue
- Leaving code worse than found -> Apply boy scout rule
- Big bang rewrites -> Incremental improvements instead

**Poka-Yoke violations:**

- "Users should just be careful" -> Make errors impossible via types
- Validation after use instead of before -> Validate at boundaries
- Optional config with no validation -> Required config, fail at startup

**Standardized Work violations:**

- "I prefer to do it my way" -> Check existing patterns first
- Not checking existing patterns -> Search codebase before adding new ones
- Ignoring project conventions -> Read CLAUDE.md and match style

**Just-In-Time violations:**

- "We might need this someday" -> Delete speculative code
- Building frameworks before using them -> Wait for Rule of Three
- Optimizing without measuring -> Profile first, optimize second

