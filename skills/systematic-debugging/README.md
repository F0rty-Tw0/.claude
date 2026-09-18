# Systematic Debugging

Enforces root cause investigation before attempting any fixes. Random fixes waste time and create new bugs.

The Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.

## What It Does

Guides debugging through four mandatory phases:

| Phase                  | Key Activities                                      | Success Criteria            |
| ---------------------- | --------------------------------------------------- | --------------------------- |
| **1. Root Cause**      | Read errors, reproduce, check changes, trace data   | Understand WHAT and WHY     |
| **2. Pattern Analysis**| Find working examples, compare differences           | Identify what's different   |
| **3. Hypothesis**      | Form theory, test minimally (one variable)           | Confirmed or new hypothesis |
| **4. Implementation**  | Create failing test, single fix, verify              | Bug resolved, tests pass    |

If 3+ fixes fail, stops to question the architecture rather than continuing to fix symptoms.

---

## When to Use

Triggers when you:

- Encounter any bug, test failure, or unexpected behavior
- Are under time pressure (emergencies make guessing tempting)
- Have already tried multiple fixes that didn't work
- See "just one quick fix" that seems obvious

---

## Real-World Impact

- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common

Includes supporting techniques: root-cause-tracing, defense-in-depth, and condition-based-waiting.

---
