---
name: handoff
description: Writes a structured handoff of the current session to a file so the work continues in a fresh context after /clear. Run manually with /handoff when the context is filling up or before switching sessions.
disable-model-invocation: true
argument-hint: "[what to stress]"
---

# Handoff

Write a handoff for a session that has none of this conversation. Whatever it leaves out is gone after `/clear`. Outline ported from [handoff-compact](https://github.com/trytofly94/handoff-compact).

## Check, then write

1. In each repo touched this session, run `git status --short` and `git log --oneline -5`, so the git state is checked rather than recalled.
2. Write the file to `~/.claude/handoffs/<YYYY-MM-DD-HHmm>-<slug>.md`, slug being 2-4 words of the goal. Every section appears, with "nothing" if that is the answer:

```markdown
# Handoff: <goal in a few words>
<date> · <working directory> · branch <name>

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
Including what you meant to ask the user.
## Files and commits
Paths touched, commit hashes, and what is committed, pushed, or uncommitted.
## Verify
The command that shows whether the state is what this says.
## Last user prompts (verbatim, oldest first)
> the last 5 user prompts, copied word for word
```

Rules:

- The latest user message wins. If it changed the task or plan, the next step follows it; summaries tend to keep planning the earlier direction.
- Exact paths, commands, hashes, and numbers beat descriptions: the next session acts on them without searching again.
- Copy the user prompts, don't paraphrase them. Their words are the spec, and a paraphrase drifts.
- Approval does not carry over. Mark each push, PR, deploy, or other outward-facing step in Next step "confirm with the user first", even if they asked for it here: the fresh session reads the handoff as permission and would act without asking.
- If `$ARGUMENTS` is not empty, the user asked to stress it; give it room.
- Only the git checks and the Write. A handoff that starts new work defeats its purpose.

## Finish

Reply with the file path and the line to paste after `/clear`:

```
Continue from the handoff in <path>: read it, run its Verify command, then do its Next step.
```
