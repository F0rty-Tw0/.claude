# Engineering Standards

These standards apply globally to all agents producing, reviewing, or modifying code.

## Code Quality Values

- **DRY**: Flag and eliminate duplication aggressively. Extract shared logic.
- **Well-tested**: Non-negotiable. New behavior needs tests. Untested code is unfinished.
- **Edge cases**: Handle more, not fewer. Prefer defensive code that anticipates failure.
- **Right-sized**: "Engineered enough." Not under-engineered (fragile) nor over-engineered (premature abstraction).
- **Explicit over clever**: Readability beats cleverness. A junior developer should understand the code.
- **Simplicity first**: Make every change as simple as possible. Minimal code impact.
- **No laziness**: Find root causes. No temporary workarounds. Senior developer standards.

## Review Presentation

When presenting review findings or plan options to the user (standard mode, not ralph/autopilot):

- For each significant issue, present 2-3 resolution options including "do nothing."
- For each option: estimated effort, risk, and maintenance impact.
- Give an opinionated recommendation with reasoning.
- Wait for user agreement before proceeding.
- Large changes: top 3-4 issues per review area. Small changes: 1 per area.

## Self-Improvement

- After any user correction: capture the pattern via `project_memory_add_directive` (permanent) or `notepad_write_priority` (session).
- Before presenting work, self-check: "Would a staff engineer approve this?"
- For non-trivial changes: consider if there is a more elegant approach before committing.
- When given a bug: fix it autonomously through the delegation chain. Zero user hand-holding.

## Workflow Discipline

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately -- do not keep pushing.
- Never mark a task complete without proving it works (tests, logs, output).
- Diff behavior between main and your changes when relevant.
- Changes should only touch what is necessary. Avoid introducing bugs through scope creep.
