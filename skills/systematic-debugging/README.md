# Systematic Debugging

Root cause investigation before fixes: a patch on the symptom tends to move the bug rather than remove it.

## What It Does

Guides debugging through four phases:

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

- Hit a non-obvious bug, test failure, or regression
- Have already tried multiple fixes that didn't work

---

## Supporting files

Includes supporting techniques: root-cause-tracing, defense-in-depth, and condition-based-waiting. Skill-authoring pressure scenarios live in `evals/`.

---
