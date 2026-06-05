---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:

- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**

- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**

- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Manager wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes
   - **TypeScript:** `tsc` error codes (e.g. `TS2322`, `TS2345`) are precise — look them up before guessing. `TS2322` is type mismatch; `TS2345` is argument type mismatch. `strictNullChecks` violations (`TS2531`, `TS2532`) mean you have a genuine nullable path that the type system found — do NOT silence with `!` until you understand why it's nullable.

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database):**

   **BEFORE proposing fixes, add diagnostic instrumentation:**

   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   **Example (multi-layer TypeScript service):**

   ```typescript
   // Layer 1: HTTP handler — log raw input
   app.post('/payment', async (req, res) => {
     console.error('DEBUG handler input:', JSON.stringify(req.body));
     // ...
   });

   // Layer 2: Service — log what it receives
   async function processPayment(payload: PaymentPayload) {
     console.error('DEBUG service input:', JSON.stringify(payload));
     // ...
   }

   // Layer 3: Repository — log the DB call
   async function savePayment(data: Payment) {
     console.error('DEBUG repo data:', JSON.stringify(data));
     // ...
   }
   ```

   **This reveals:** Which layer receives wrong data (handler ✓, service ✗ means transform broke it)

5. **Trace Data Flow**

   **WHEN error is deep in call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation COMPLETELY
   - Don't skim - read every line
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis
   - DON'T add more fixes on top

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Ask for help
   - Research more

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - MUST have before fixing
   - Use the `skill:test-driven-development` skill for writing proper failing tests
   - Run with: `pnpm test` (vitest/jest); for e2e flakes use Playwright

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - STOP
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1, re-analyze with new information
   - **If ≥ 3: STOP and question the architecture (step 5 below)**
   - DON'T attempt Fix #4 without architectural discussion

5. **If 3+ Fixes Failed: Question Architecture**

   **Pattern indicating architectural problem:**
   - Each fix reveals new shared state/coupling/problem in different place
   - Fixes require "massive refactoring" to implement
   - Each fix creates new symptoms elsewhere

   **STOP and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we "sticking with it through sheer inertia"?
   - Should we refactor architecture vs. continue fixing symptoms?

   **Discuss with your human partner before attempting more fixes**

   This is NOT a failed hypothesis - this is a wrong architecture.

## TypeScript-Specific Debugging

TypeScript bugs have patterns that don't exist in plain JS. Apply the same four-phase discipline, but know the TS failure modes.

### Compiler Errors (`tsc`)

**Read the error code, not just the message.**

| Code | Meaning | Common cause |
|------|---------|--------------|
| `TS2322` | Type `X` is not assignable to type `Y` | Wrong shape returned/passed |
| `TS2345` | Argument type mismatch | Caller and callee disagree on shape |
| `TS2531` | Object is possibly `null` | `strictNullChecks` found a genuine nullable path |
| `TS2532` | Object is possibly `undefined` | Same — do NOT suppress with `!` without understanding why |
| `TS2339` | Property does not exist on type | Wrong type assumed, or accessing before narrowing |
| `TS7006` | Parameter implicitly has `any` | Missing type annotation, likely a regression |

**Do NOT silence errors with `as`, `!`, or `// @ts-ignore` without first tracing WHY the types disagree.** Type errors are evidence of a logical mismatch — suppressing them hides bugs, it doesn't fix them.

### `strictNullChecks` Traps

```typescript
// ❌ Symptom fix — silences the error, hides the real problem
const user = getUser()!;

// ✅ Root-cause approach — understand why it can be null, then handle it
const user = getUser();
if (!user) {
  // Why is user null here? Is the caller wrong, or the return type?
  throw new Error('Expected authenticated user; check auth guard setup');
}
```

### Type Narrowing as a Debugging Tool

Discriminated unions let you trace which branch of a type you're actually in:

```typescript
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function processResult(result: Result<Payment>) {
  // TypeScript narrows the type after this check — use it
  if (!result.ok) {
    console.error('DEBUG processResult failed branch:', result.error);
    return;
  }
  // result.value is safe here — TypeScript knows it
  savePayment(result.value);
}
```

**Use `unknown` instead of `any` for external data.** `any` silently disables type checking; `unknown` forces you to narrow before use — which is exactly the investigation step you need.

### `as` Assertion-Induced Bugs

```typescript
// ❌ Asserts away the problem — common source of runtime crashes
const config = JSON.parse(raw) as AppConfig;
config.apiUrl.trim(); // Crashes if apiUrl is missing

// ✅ Validate the shape at the boundary (Layer 1 defense-in-depth)
function parseConfig(raw: string): AppConfig {
  const parsed = JSON.parse(raw);
  if (typeof parsed.apiUrl !== 'string') {
    throw new Error(`Config missing apiUrl: ${JSON.stringify(parsed)}`);
  }
  return parsed as AppConfig; // Now the assertion is backed by a check
}
```

### Async / Promise Debugging

TypeScript async bugs are often invisible because the error surface is fragmented.

**Lost stack traces across `await`:**
```typescript
// Stack trace loses context across await boundaries in Node < 18
// Use --enable-source-maps and --async-context (Node 18+) for full traces:
//   node --enable-source-maps --async-context dist/server.js

// Or capture context manually before awaiting:
async function processOrder(orderId: string) {
  const stack = new Error('processOrder context').stack;
  try {
    await paymentService.charge(orderId);
  } catch (err) {
    console.error('processOrder failed', { orderId, originalStack: stack, err });
    throw err;
  }
}
```

**Unhandled promise rejections:**
```typescript
// ❌ Fire-and-forget — rejection is swallowed silently
doSomethingAsync();

// ✅ Either await or explicitly handle
doSomethingAsync().catch((err) => {
  logger.error('Background task failed', err);
});
```

**`Promise.all` swallows individual errors:**
```typescript
// ❌ First rejection cancels the rest; you lose which one failed
const results = await Promise.all([fetchA(), fetchB(), fetchC()]);

// ✅ Use allSettled to get all outcomes, then inspect
const outcomes = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
for (const [i, outcome] of outcomes.entries()) {
  if (outcome.status === 'rejected') {
    console.error(`Task ${i} failed:`, outcome.reason);
  }
}
```

### Test Debugging (vitest / jest)

**Run in isolation before assuming interaction:**
```bash
pnpm test path/to/failing.spec.ts          # Single file
pnpm test --reporter=verbose               # See each test name
pnpm test -- --testNamePattern="my test"   # Single test by name
```

**Debugger attach (Node inspect):**
```bash
# vitest
node --inspect-brk ./node_modules/.bin/vitest path/to/test.ts

# jest
node --inspect-brk ./node_modules/.bin/jest --runInBand path/to/test.ts
```
Then attach VS Code debugger or Chrome DevTools (`chrome://inspect`).

**`vi.mock` pitfalls:**
- Mock factories run before imports — accessing outer variables inside the factory causes `undefined` (the "temporal dead zone" problem)
- Always use `vi.mocked()` to get typed mock references
- `vi.resetModules()` between tests if module state bleeds

```typescript
// ❌ Outer variable not yet initialized when factory runs
const mockFn = vi.fn();
vi.mock('./service', () => ({ doThing: mockFn })); // mockFn may be undefined

// ✅ Define inside the factory, or use vi.mocked after import
vi.mock('./service', () => ({ doThing: vi.fn() }));
import { doThing } from './service';
vi.mocked(doThing).mockReturnValue('test');
```

**For e2e flakiness:** Replace arbitrary `waitForTimeout` with `waitFor` condition polling (see `condition-based-waiting.md`). Playwright's built-in auto-waiting handles most DOM assertions — only reach for manual waits when crossing async non-DOM boundaries.

### Angular-Specific Debugging

**DI / injection context errors (`NG0203`):**
```
Error: NG0203: inject() must be called from an injection context
```
This means `inject()` was called outside a constructor, field initializer, or `runInInjectionContext`. Trace the call site — the most common cause is calling `inject()` inside a method body or a lazily-evaluated callback.

**`NG0` runtime error codes — look these up before guessing:**

| Code | Meaning |
|------|---------|
| `NG0100` | ExpressionChangedAfterItHasBeenCheckedError — classic change detection bug |
| `NG0200` | Circular DI dependency |
| `NG0203` | `inject()` outside injection context |
| `NG0301` | Component not found — missing import in `@NgModule` or standalone imports |
| `NG0302` | Pipe not found |

**ExpressionChangedAfterItHasBeenChecked (`NG0100`):**
This is almost always a root-cause bug, not a symptom to wrap in `setTimeout`. Trace where the expression value is being mutated during change detection. Common causes: lifecycle hook side effects, `ngOnChanges` mutating parent state, signal writes inside view-level code.

**Signal / change detection gotchas:**
```typescript
// ❌ Reading a signal outside Angular's reactive context gives a stale snapshot
const value = mySignal(); // inside a setTimeout — not reactive

// ✅ Read signals inside computed/effect/template to stay reactive
const derived = computed(() => mySignal() * 2);
```

**RxJS subscription leaks — always trace the subscription lifecycle:**
```typescript
// ❌ Never unsubscribed — leaks on component destroy
ngOnInit() {
  this.service.data$.subscribe((d) => this.data = d);
}

// ✅ Use takeUntilDestroyed (Angular 16+) or async pipe
private readonly destroyRef = inject(DestroyRef);

ngOnInit() {
  this.service.data$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((d) => this.data = d);
}
```

### Source Maps for Compiled Output

When debugging compiled JS (Angular prod build, Node dist), stack traces point to line numbers in the compiled output, not your TypeScript source.

```bash
# Node.js: enable source maps globally
node --enable-source-maps dist/server.js

# Or in package.json script
"start": "node --enable-source-maps dist/main.js"
```

For Angular, source maps are enabled automatically in development builds (`ng serve`). For production debugging, build with `--source-map` and use browser DevTools source panel to navigate to the original `.ts` files.

## Red Flags - STOP and Follow Process

If you catch yourself thinking:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**
- **TypeScript:** "I'll just cast it with `as` to get past this error"
- **TypeScript:** "I'll add `// @ts-ignore` temporarily"

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** Question the architecture (see Phase 4.5)

## Your Human Partner's Signals You're Doing It Wrong

**Watch for these redirections:**

- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You're proposing fixes without understanding
- "Ultrathink this" - Question fundamentals, not just symptoms
- "We're stuck?" (frustrated) - Your approach isn't working

**When you see these:** STOP. Return to Phase 1.

## Common Rationalizations

| Excuse                                       | Reality                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| "Issue is simple, don't need process"        | Simple issues have root causes too. Process is fast for simple bugs.    |
| "Emergency, no time for process"             | Systematic debugging is FASTER than guess-and-check thrashing.          |
| "Just try this first, then investigate"      | First fix sets the pattern. Do it right from the start.                 |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it.                       |
| "Multiple fixes at once saves time"          | Can't isolate what worked. Causes new bugs.                             |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely.              |
| "I see the problem, let me fix it"           | Seeing symptoms ≠ understanding root cause.                             |
| "One more fix attempt" (after 2+ failures)   | 3+ failures = architectural problem. Question pattern, don't fix again. |
| "I'll just use `as` / `!` to fix the type"  | Type errors are evidence. Suppressing them hides the bug.               |

## Quick Reference

| Phase                 | Key Activities                                         | Success Criteria            |
| --------------------- | ------------------------------------------------------ | --------------------------- |
| **1. Root Cause**     | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY     |
| **2. Pattern**        | Find working examples, compare                         | Identify differences        |
| **3. Hypothesis**     | Form theory, test minimally                            | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify                               | Bug resolved, tests pass    |

## When Process Reveals "No Root Cause"

If systematic investigation reveals issue is truly environmental, timing-dependent, or external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

**But:** 95% of "no root cause" cases are incomplete investigation.

## Supporting Techniques

These techniques are part of systematic debugging and available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**

- **skill:test-driven-development** - For creating failing test case (Phase 4, Step 1)
- **skill:verification-before-completion** - Verify fix worked before claiming success

## Real-World Impact

From debugging sessions:

- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common
