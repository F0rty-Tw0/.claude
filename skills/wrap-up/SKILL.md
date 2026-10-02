---
name: wrap-up
description: Runs an end-of-session retro - file cleanup, saving what was learned to the right memory location, and turning mistakes and review comments into checks or rules, applied after confirmation. Use when the user says "wrap up", "retro", "retrospective", "close session", "end session", or "close out this task", runs /wrap-up, or when finishing a branch or a round of PR review.
---

# Session Wrap-Up

Three phases, in order, inline in the conversation. One consolidated report at the end.

## Phase 1: Clean up

1. Run `git status` and review files created or changed this session.
2. Flag names that break the project's naming convention and files in the wrong folder. Propose renames or moves; apply after confirmation.
3. Note uncommitted work and unfinished steps. Don't commit unless the user asks.

## Phase 2: Remember it

Save what was learned, once, in the right place:

| Knowledge | Location |
|---|---|
| Insight, quirk, or correction Claude discovered | Auto memory, per the memory protocol in the system prompt |
| Permanent project convention, command, or decision | Project `CLAUDE.md` |
| Rule scoped to certain files | `.claude/rules/<topic>.md` with `paths:` frontmatter |
| Personal or ephemeral context (local URLs, current focus) | `CLAUDE.local.md` |
| Content that already exists in another file | `@import` it instead of copying |

## Phase 3: Review and apply

Sources: this conversation, and the human review comments on the branch's PR when one exists (`gh api repos/{owner}/{repo}/pulls/<n>/comments`, plus `gh pr view <n> --comments`). A comment a human had to write is a check or rule that was missing; the goal is never writing the same review comment twice.

Scan for:

- **Skill gap**: something that took several attempts or went wrong.
- **Friction**: steps the user had to ask for that should have been automatic.
- **Knowledge**: facts about the project, preferences, or setup that were missing.
- **Automation**: repeated patterns that could become a skill, hook, or script.
- **Navigation**: a file or fact that took long to find. A one-line pointer in the project `CLAUDE.md` fixes it.
- **Tool economy**: an expensive or repeated tool call that a script, flag, or narrower query would replace.
- **Information access**: a log, service, or doc the agent needed and could not reach (dev server output, read-only third-party access).
- **No-ops**: steering lines in `CLAUDE.md`, `AGENTS.md`, or a skill that did not change behavior this session. Propose deleting them.

Route each mistake or review comment by kind:

- **Mechanical** (banned API, import shape, file location, naming pattern): a deterministic check, not a written rule. Read the repo's existing check command first (`package.json` lint/check scripts, CI workflow); a check that exists but is unwired or broken is the finding. Otherwise propose the cheapest new one: a lint rule, a pre-commit hook, or a CI job.
- **Judgement** (cross-file consistency, design fit): a written rule, placed where the reviewer meets it rather than in always-loaded context. Prefer the skill that owns the topic (`artification` for TypeScript) or a path-scoped `.claude/rules/` file over global `CLAUDE.md` / `AGENTS.md`, which every implementer pays for.

A repo with no guardrail at all (no pre-commit hook and no CI job running lint, typecheck, or tests) is itself a finding.

Present the findings, most severe first, with a proposed action each (CLAUDE.md edit, rule, auto memory, skill or hook spec, CLAUDE.local.md). Apply the approved ones, then report in two groups: applied (finding → action taken) and no action needed (with the reason, such as "already in CLAUDE.md"). A short or routine session with nothing notable gets "Nothing to improve" after the scan.

## Failure modes

- "Nothing to improve" without scanning for friction or repeated corrections.
- Listing findings but applying none of the approved ones.
- Saving the same fact to both CLAUDE.md and auto memory.
- Promoting a one-off mistake to a permanent rule; confirm it would recur first.
- Writing a rule for a mechanical mistake that a lint rule or hook could catch.
