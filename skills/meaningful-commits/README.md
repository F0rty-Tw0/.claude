# Meaningful Commits

This skill defines a lightweight incremental commit workflow: complete one production file together with its matching test, verify, commit, then move on to the next pair.
It keeps history clean, reviewable, and easy to revert.

## What It Does

- Enforces `production file + test file` commit units
- Prevents unrelated changes from leaking into commits
- Promotes frequent verification before each commit

---

## When to Use

Triggers when you:

- Have explicit user permission/instruction to commit
- Are implementing changes across multiple file+test pairs
- Want a tidy commit history with isolated behavioral changes

---
