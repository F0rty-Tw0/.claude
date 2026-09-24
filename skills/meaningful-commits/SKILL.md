---
name: meaningful-commits
description: Use whenever the user asks to commit ("commit", "commit this", "make commits"), before running git commit
---

# Meaningful Commits

## Overview

Create small, reviewable commits by pairing each production file with its test in the same commit, then continue to the next pair.

Core principle: one behavioral unit per commit.

## When to Use

Use this skill when:

- The user explicitly asked for commits
- Work spans multiple file+test pairs
- You want clean history and easy rollback

Do not use this skill when the user did not request commits.

## Commit Unit Rule

Each commit should contain:

- One production file change
- Its corresponding test update or new test
- No unrelated edits

Then move to the next production file and test pair.

No prod+test pair (docs, config, single-file fix, already-finished work)? One commit per concern instead.

## Workflow

1. Choose the next production file to complete.
2. Add or update its corresponding test.
3. Run focused verification for that pair.
4. Stage only the pair files by path (`git add <prod-file> <test-file>`) — never `git add -A` or `git add .`, which sweep in unrelated work.
5. Commit with a clear why-focused message.
6. Repeat for the next pair.

## Verification Before Each Commit

- Run the relevant unit test file(s) — commit only when the pair is green, never a failing pair
- Run typecheck/lint if the change requires it
- Ensure the commit contains only intended files (`git status` before committing)

## Common Mistakes

- Bundling multiple unrelated file pairs into one commit
- Committing production code without the related test
- Committing incidental formatting or refactor noise
- Creating commits when user did not request commits

## Quick Reference

- Unit scope: `one prod file + one test file`
- Commit timing: `after verification, before next pair`
- Message focus: `why this pair changed`
