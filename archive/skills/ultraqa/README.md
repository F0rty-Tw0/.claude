# UltraQA

Autonomous test→fix→retest cycling workflow. Runs verification, diagnoses failures, applies fixes, and repeats until the goal is met or a cycle/failure-repeat limit is hit.

## When to Use

- Driving tests, build, lint, or typecheck to a passing state without manual re-runs after each fix
- Chasing a custom success pattern in command output
- Interactive CLI/service testing that needs repeated verify-and-fix rounds

---
