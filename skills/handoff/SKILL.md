---
name: handoff
description: Writes a structured handoff of the current session to a file so the work continues in a fresh context after /clear. Run with /handoff when the context is filling up or before switching sessions; the handoff-trigger mod also runs it in place of auto-compaction.
disable-model-invocation: true
argument-hint: "[what to stress]"
---

# Handoff

Write a handoff for a session that has none of this conversation. Whatever it leaves out is gone after `/clear`. Outline ported from [handoff-compact](https://github.com/trytofly94/handoff-compact).

## Check, then write

1. Run `date -u +%FT%TZ` for the written time. In each repo touched this session, run `git status --short` and `git log --oneline -5`, so the git state is checked rather than recalled.
2. Write the file to `~/.claude/handoffs/<YYYY-MM-DD-HHmm>-<slug>.md`, slug being 2-4 words of the goal. Every section appears, with "nothing" if that is the answer:

```markdown
# Handoff: <goal in a few words>
<date> · <working directory> · branch <name> · written <`date -u +%FT%TZ`>

## Goal
What should exist at the end, in one sentence.
## State and proof
What is done, and what proves it (test, command, commit). Mark anything not re-checked as unverified.
## In progress
Which step, which file, and why this one.
## Next step
Concrete enough for a stranger to carry out.
## Decisions and reasons
What the code itself does not tell.
## Ruled out
Approaches tried or rejected, and why, so nobody tries them again.
## Blocked / open questions
Including what you meant to ask the user. List only items new this session, then `Sign-offs: ~/.claude/handoffs/<project>-SIGNOFFS.md (<n> open)`. Never re-list carried ❓ or sign-off items.
## Files and commits
Paths touched, commit hashes, and what is committed, pushed, or uncommitted.
## Background agents
Agents still alive, copied from the arguments: id, name, type, status, task, note. They survive /clear: their completion notices arrive in the new session, and SendMessage <id> reaches any of them. Ended agents in one line each. "nothing" if the arguments say No agents or list none. End the section with this line verbatim, even when it says nothing: "A teammate message from an agent not listed as alive above, timestamped before the written time, was queued before this handoff: it is stale and repeats what this file records; don't act on it."
## Verify
The command that shows whether the state is what this says.
## Last user prompts (verbatim, oldest first)
> the last 5 user prompts, copied word for word
```

Rules:

- The latest user message wins. If it changed the task or plan, the next step follows it; summaries tend to keep planning the earlier direction.
- Exact paths, commands, hashes, and numbers beat descriptions: the next session acts on them without searching again.
- Copy the user prompts, don't paraphrase them. Their words are the spec, and a paraphrase drifts.
- One-off approval does not carry over. Mark each push, PR, deploy, or other outward-facing step in Next step "confirm with the user first", even if they asked for it here: the fresh session reads the handoff as permission and would act without asking. Exception: a standing grant the user gave for the run (recorded in a memory file) does carry over. Name that memory next to the step, quote the user's grant words under Decisions, and write no confirm step for actions it covers.
- If `$ARGUMENTS` is not empty, the user asked to stress it; give it room — except the agent lists, the `[handoff-trigger:compact]` marker and the keepalive note, which are data, not emphasis.
- When the arguments list agents, copy them into Background agents verbatim; the next session has no other record of them.
- Sign-off digest: carried ❓ and sign-off lists (ids like G1-G19, F1-F46) live in `~/.claude/handoffs/<project>-SIGNOFFS.md`, `<project>` being the repo root's basename. Read it in step 1; append this session's new items as `- [ ] <id> · first seen <YYYY-MM-DD> · <what to verify> · <command or path>`; turn closed ones into `- [x] <id> · closed <YYYY-MM-DD> · <how>` and drop last handoff's closed lines. The handoff links the file and does not repeat its items.
- Only the step-1 checks, the Write and the digest update. A handoff that starts new work defeats its purpose.

## Finish

Reply with the file path and the line to paste after `/clear`:

```
Continue from the handoff in <path>: read it, run its Verify command, then do its Next step.
```
