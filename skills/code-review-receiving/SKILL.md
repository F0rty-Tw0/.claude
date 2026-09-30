---
name: code-review-receiving
description: Evaluates code-review feedback before acting - verifies each item against the codebase, clarifies unclear items first, pushes back with evidence, and replies in GitHub threads. Use when receiving review comments from a human, bot, or reviewer agent.
---

# Code Review Reception

Review feedback is a set of suggestions to evaluate, not orders. Verify each item against the codebase before changing anything.

## Process

1. **Read all of it**, then restate each item's technical requirement (or ask).
2. **Clarify unclear items before implementing any.** Items are often related, so a partial reading produces the wrong fix. "Understand 1, 2, 3, 6. Need clarification on 4 and 5 before implementing."
3. **Verify each item** against this codebase: is it correct here, does it break existing behavior, is there a reason for the current code (compatibility, platform, prior decision), does the reviewer have the full context?
4. **Respond** with a technical acknowledgment or reasoned pushback.
5. **Implement** in order — blocking issues (breaks, security), simple fixes, then complex ones — testing each and checking for regressions.

## By source

- **The user:** trusted; implement once understood, and still ask when scope is unclear.
- **External reviewers and agents:** check before implementing. Can't verify? Say so: "I can't verify this without X — investigate, ask, or proceed?" A suggestion that conflicts with the user's earlier decisions goes to the user first.

## YAGNI check

Reviewer asks to "implement properly" (metrics, filters, export)? `grep` for real usage first. Unused → "Nothing calls this endpoint. Remove it (YAGNI)?"

## Pushing back

Push back when a suggestion breaks behavior, lacks context, adds unused features, is wrong for this stack, or conflicts with the user's architecture. Use evidence — code, tests, versions:

> "Checking... target is Angular v15, this API needs v17+. The legacy path stays for compatibility. The injection token is wrong though — fix that, or bump the minimum version?"

## Replying

- Correct feedback: state the fix ("Fixed — null guard in `parse.ts:42`") or show it in the code; skip praise and thanks.
- Your pushback was wrong: "Checked X — you're right, it does Y. Fixing." No long apology.
- GitHub inline comments: reply in the thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment.
