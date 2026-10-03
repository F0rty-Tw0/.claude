---
name: systematic-debugging
description: Root-cause debugging method - reproduce, instrument component boundaries, test one hypothesis at a time, and question the architecture after 3 failed fixes. Use for non-obvious bugs, test failures, or regressions before proposing a fix.
---

# Systematic Debugging

Find the root cause before fixing. A patch on the symptom tends to move the bug rather than remove it. Trivial, self-explaining errors (a typo, a missing import named in the message) don't need the full method.

Every fix needs Phase 1 and Phase 4's failing test. Use Phases 2 and 3 when Phase 1 leaves the cause unclear.

## Phase 1: Root cause investigation

1. **Read the error completely** — full stack trace, file paths, line numbers, error codes. Compiler codes are precise; look them up before guessing. TypeScript/Angular codes and failure modes: `references/typescript-angular.md`.
2. **Reproduce reliably** — exact steps, every time? Not reproducible → gather more data rather than guess.
3. **Check recent changes** — `git diff`, recent commits, new dependencies, config, environment differences.
4. **Instrument component boundaries** in multi-component systems (CI → build → signing, API → service → database). For each boundary, log what enters, what exits, and the config/env that propagates. Run once, find the layer that receives good data and emits bad (handler ✓, service ✗ → the transform between them), then investigate that layer. Worked TypeScript example: `references/typescript-angular.md`.
5. **Trace data flow backward** when the error is deep in the call stack: where does the bad value originate, and what called this with it? Fix at the source. Full technique: `root-cause-tracing.md`.

## Phase 2: Pattern analysis

- Find similar working code in the same codebase and list every difference from the broken code, however small.
- When implementing a known pattern, read the reference implementation completely before applying it.
- Note the dependencies, settings, and assumptions the component relies on.

## Phase 3: Hypothesis and testing

1. State one hypothesis: "X is the root cause because Y."
   **Blind second diagnosis.** Before testing your first hypothesis, dispatch the `debugger` agent with only the symptom, the error output, and the repro steps. Leave out your hypothesis and suspect files: naming them anchors it on your guess. Ask for the top 1-3 candidate causes with `file:line`, the evidence for each, and what would falsify it. Its top candidate matches yours → test yours. It differs → read its evidence before testing anything, and note why the losing diagnosis was wrong.
2. Test it with the smallest change, one variable at a time.
3. Worked → Phase 4. Didn't → form a new hypothesis; don't stack fixes.
4. Don't understand something? Say so, and research or ask.

## Phase 4: Implementation

1. **Failing test first** — simplest reproduction, automated if possible (skill:test-driven-development). Test runner and debugger-attach recipes: `references/typescript-angular.md`.
2. **One fix** for the root cause. No bundled refactoring or "while I'm here" changes.
3. **Verify** — the test passes, nothing else broke, the original issue is gone.
4. **Fix didn't work** — fewer than 3 attempts: back to Phase 1 with the new information.
5. **3 failed fixes → question the architecture.** Signs: each fix reveals new shared state or coupling elsewhere, fixes need large refactors, or each creates new symptoms. Ask whether the pattern is sound, and discuss with the user before a fourth attempt. The `architect` agent is the escalation point.

Casting with `as`, `!`, or `@ts-ignore` to silence an error is a symptom fix — find why the types disagree.

## No root cause found

If the issue is genuinely environmental, timing-dependent, or external: document what you investigated, add appropriate handling (retry, timeout, clear error), and add logging for next time. Most "no root cause" conclusions turn out to be incomplete investigation, so recheck Phase 1 first.

## Supporting files

- `root-cause-tracing.md` — trace bugs backward through the call stack.
- `defense-in-depth.md` — harden at boundaries after the fix.
- `condition-based-waiting.md` — replace arbitrary timeouts with condition polling.
- `find-polluter.sh` — bisect which test pollutes shared state.
- `references/typescript-angular.md` — TypeScript, Node, vitest/jest, Angular failure modes.
