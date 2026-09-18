# Triage

Moves issues on the project's issue tracker through a small state machine driven by triage roles, from "just reported" to "ready for an AFK agent to pick up" or "won't fix."

## What It Does

- Two category roles (`bug`, `enhancement`) plus five state roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — every triaged issue carries exactly one of each
- On a specific issue: gathers full context (body, comments, prior triage notes, relevant `.out-of-scope/` history), recommends a category/state with reasoning, attempts reproduction for bugs before any further questioning, and optionally runs a `brainstorming` session if the issue needs fleshing out
- Applies the outcome — posts an agent brief for `ready-for-agent`, triage notes for `needs-info`, a rejection note to `.out-of-scope/` for `wontfix` enhancements, etc.
- Every tracker comment/issue it posts opens with an AI-generated disclaimer

Relies on the repo's AGENTS.md/CLAUDE.md having recorded the tracker and label vocabulary.

---

## When to Use

Trigger when you:
- want to see what needs triage attention across unlabeled, `needs-triage`, and stale `needs-info` issues
- are evaluating one specific issue and need a category/state recommendation plus a codebase-informed summary
- need to move an issue directly to a known state on the maintainer's say-so, skipping the full interview
