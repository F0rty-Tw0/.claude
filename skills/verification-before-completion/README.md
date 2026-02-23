# Verification Before Completion

Run verification commands and confirm output before making any success claims. Evidence before assertions, always.

The Iron Law: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

## What It Does

Enforces a gate function before any claim of completion:

1. **IDENTIFY** - What command proves this claim?
2. **RUN** - Execute the full command (fresh, complete)
3. **READ** - Full output, check exit code, count failures
4. **VERIFY** - Does output confirm the claim?
5. **ONLY THEN** - Make the claim

| Claim          | Requires                     | Not Sufficient                |
| -------------- | ---------------------------- | ----------------------------- |
| Tests pass     | Test output: 0 failures      | Previous run, "should pass"   |
| Build succeeds | Build command: exit 0        | Linter passing                |
| Bug fixed      | Original symptom passes      | Code changed, assumed fixed   |
| Agent completed| VCS diff shows changes       | Agent reports "success"       |

---

## When to Use

Apply ALWAYS before:

- Any success, completion, or satisfaction claims
- Committing, PR creation, or task completion
- Moving to the next task
- Trusting agent success reports

---

## Red Flags

Using "should", "probably", "seems to". Expressing satisfaction before verification. Trusting agent reports without checking. Thinking "just this once."

---
