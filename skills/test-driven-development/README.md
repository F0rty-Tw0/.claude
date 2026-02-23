# Test-Driven Development

Write the test first. Watch it fail. Write minimal code to pass. If you didn't watch the test fail, you don't know if it tests the right thing.

The Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.

## What It Does

Enforces the Red-Green-Refactor cycle:

| Phase          | Action                                          | Verify                          |
| -------------- | ----------------------------------------------- | ------------------------------- |
| **RED**        | Write one minimal failing test (one behavior)   | Fails for expected reason       |
| **GREEN**      | Write simplest code to pass the test            | All tests pass, output pristine |
| **REFACTOR**   | Remove duplication, improve names, extract helpers | Tests stay green              |

Good tests are: minimal (one thing), clear (name describes behavior), and show intent (demonstrate desired API). Write code before test? Delete it. Start over.

---

## When to Use

Triggers when you:

- Implement any new feature
- Fix any bug (write failing test reproducing it first)
- Refactor or change behavior
- Are tempted to skip "just this once" (that's rationalization)

---

## Why Order Matters

Tests written after code pass immediately. Passing immediately proves nothing - might test the wrong thing, might miss edge cases, you never saw it catch the bug. Test-first forces you to see the test fail, proving it actually tests something.

---
