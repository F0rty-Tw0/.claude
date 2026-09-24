---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs
---

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim
```

## Common Failures

| Claim                 | Requires                        | Not Sufficient                 |
| --------------------- | ------------------------------- | ------------------------------ |
| Tests pass            | Test command output: 0 failures | Previous run, "should pass"    |
| Linter clean          | Linter output: 0 errors         | Partial check, extrapolation   |
| Build succeeds        | Build command: exit 0           | Linter passing, logs look good |
| Bug fixed             | Test original symptom: passes   | Code changed, assumed fixed    |
| Regression test works | Red-green cycle verified        | Test passes once               |
| Agent completed       | VCS diff shows changes          | Agent reports "success"        |
| Requirements met      | Line-by-line checklist          | Tests passing                  |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Reading a grep narrowed to your own files instead of the suite's real exit code
- **ANY wording implying success without having run verification**

## Key Patterns

**Tests:**

```
✅ pnpm test → See: 34/34 pass → "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Type checking:**

```
✅ tsc --noEmit → exit 0 → "No type errors"
❌ "Looks correct" / "Types seem fine"
```

**Linting:**

```
✅ pnpm lint → 0 errors → "Linter clean"
❌ "I fixed the obvious issues" (without running the linter)
```

**Regression tests (TDD Red-Green):**

```
✅ Write → pnpm test (pass) → Revert fix → pnpm test (MUST FAIL) → Restore → pnpm test (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**

```
✅ pnpm build → exit 0 → "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**E2E / integration:**

```
✅ pnpm exec playwright test → all scenarios green → "E2E passes"
❌ "Unit tests pass so it should work end-to-end"
```

**Requirements:**

```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**

```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Why This Matters

Unverified completion claims cause real harm:

- Trust breaks when claims don't match reality
- Undefined functions get shipped and crash
- Missing requirements ship as incomplete features
- False completion wastes time on redirect and rework

## When To Apply

Before telling the user work is complete, fixed, or passing, and before committing or opening a PR. The rule covers the claim however it is worded.

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.
