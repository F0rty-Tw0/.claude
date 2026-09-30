---
name: skills-creating
description: Test-first method for writing and editing Claude skills, with frontmatter, description, body, and README conventions. Use when creating, editing, or validating a skill, or extracting a reusable technique from a session.
---

# Creating Skills

Writing a skill is test-driven development applied to instructions. If you never saw an agent fail without the skill, you don't know whether the skill teaches the right thing.

Personal skills live in `~/.claude/skills/<name>/`.

This skill is the authoring loop. For eval tooling and packaging, use `anthropic-skills:skill-creator`. Anthropic's authoring guide is copied in [anthropic-best-practices.md](anthropic-best-practices.md); read it for anything not covered here.

## When a skill is worth writing

Create one for a technique that was not obvious, that you will reuse across sessions, and that the model would not do unprompted. Good skill content is:

1. **Not searchable** - "this codebase resolves paths through `fileURLToPath`", not "how to read files in TypeScript".
2. **Context-specific** - names real files, errors, and commands.
3. **Precise** - "`Cannot find module` in `dist/` → check `moduleResolution` in tsconfig.json", not "handle edge cases".
4. **Hard-won** - it cost real debugging to learn.

Skip it for one-off fixes, general knowledge the model already has, project conventions (put those in the project's CLAUDE.md), and constraints a lint rule or hook can enforce mechanically.

## Layout

```
skills/<name>/
  SKILL.md       # required: frontmatter + body, under 500 lines
  README.md      # required here: human-readable overview
  <topic>.md     # optional: heavy reference, loaded on demand
  scripts/       # optional: reusable tools
```

Link each reference from SKILL.md, one level deep, with a line saying when to read it. Move anything over ~100 lines, or only sometimes needed, into its own file.

## Frontmatter

- `name`: letters, numbers, hyphens. Gerund or verb-first reads well (`creating-skills`, `condition-based-waiting`).
- `description`: loaded into every session, so it decides whether the skill is ever read.
  - Say **what** the skill does and **when** to use it, in third person, ideally 40 words or fewer (hard limit 1024 characters).
  - Include concrete triggers: user phrases, error strings, symptoms, file types, tool names.
  - Never list the workflow steps. When a description summarized a workflow ("code review between tasks"), Claude followed the summary and skipped the body's two-stage review. A "what" is a capability, not a procedure.
  - Plain YAML scalars break on `: ` and ` #`; rephrase or quote the value.
- Optional Claude Code fields (`argument-hint`, `allowed-tools`) only when needed.

```yaml
# Bad: workflow summary, the model follows this instead of the body
description: Use for TDD - write test first, watch it fail, write minimal code, refactor
# Bad: vague, no trigger
description: For async testing
# Good: what + when, concrete triggers
description: Diagnoses flaky async tests caused by race conditions and timing dependencies. Use when tests pass and fail inconsistently, hang, or time out only under parallel load.
```

## Writing the body

- Assume the reader is already capable. Add only what it would not know or would not do by default.
- Give the reason with each rule. "Stage files by path because `git add .` picks up stray artifacts" generalizes better than a bare command.
- Normal volume. Current models over-apply capitals, "MUST", and "no exceptions", which makes behavior rigid in gray areas.
- Show one strong example of the target shape instead of a long "don't" list. One language, from a real scenario.
- Give a default, not a menu of options.
- Refer to other skills by name (`skill:systematic-debugging`). Never `@path` a file: that force-loads it into context immediately.
- Use a small graphviz flowchart only for a non-obvious decision or loop, never for linear steps or reference data. Style rules: [graphviz-conventions.dot](graphviz-conventions.dot).
- Name only tools that exist in the harness (Bash, Read, Edit, Write, Agent, Skill, AskUserQuestion).
- Keep the body lean: every load pays its token cost. Push flag lists to `--help` and detail to reference files.

## Test first: RED, GREEN, REFACTOR

New skills and behavior-changing edits get a baseline run without the change, then a run with it. Wording, formatting, and factual fixes that don't change behavior skip the pressure run.

1. **RED** - run the scenario with a subagent that does not have the skill. Record what it did and the reasons it gave, verbatim.
2. **GREEN** - write the smallest skill that addresses those specific failures. Re-run with the skill; the agent should now comply.
3. **REFACTOR** - a new failure reproduced? Add one plain counter for it, with its reason, and re-test. Add nothing for failures you only imagine.

| Skill type | Test with | Passes when |
|---|---|---|
| Discipline (rules under pressure) | Scenarios combining 3+ pressures (time, sunk cost, authority) | It follows the rule under the combined pressure |
| Technique | Application to a new case | It applies the method correctly |
| Pattern | Recognition plus counter-examples | It knows when the pattern applies and when not |
| Reference | Retrieval questions | It finds and uses the right entry |

Scenario design and pressure types: [testing-skills-with-subagents.md](testing-skills-with-subagents.md). Loophole-closing techniques, used only for reproduced failures: [bulletproofing.md](bulletproofing.md).

## README.md

Every skill here ships a short README for browsing outside Claude sessions: a title, 2-3 sentences on what it does, `## What It Does` (a table when structured), and `## When to Use` (trigger bullets), each section closed with `---`. An overview in the skill's plain tone, not a copy of SKILL.md.

## Checklist

- [ ] Baseline failures recorded before writing
- [ ] Description is what + when, with concrete triggers and no workflow steps
- [ ] Run with the skill passes; README.md written; one skill finished before the next
