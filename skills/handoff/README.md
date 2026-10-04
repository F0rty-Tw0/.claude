# Handoff

On-demand session handoff. Writes what the next context needs into one Markdown file, so you can `/clear` and continue without a generic compaction summary. Manual only: it costs no context until you run `/handoff`.

## What It Does

| Section | Why it is there |
|---|---|
| Goal, state and proof | The next session starts from facts it can check |
| In progress, next step | Work resumes where it stopped |
| Decisions, ruled out | Reasons and dead ends survive, so they aren't re-tried |
| Blocked, files and commits, verify | Open questions, git state, and one command to confirm it all |
| Last user prompts, verbatim | The user's own words, not a paraphrase |

Files land in `~/.claude/handoffs/` (not synced; it is outside the repo's allowlist). The reply ends with a line to paste after `/clear`.

Outline adapted from [trytofly94/handoff-compact](https://github.com/trytofly94/handoff-compact), which does the same automatically as a compaction mod.

---

## When to Use

- The context is filling up mid-task and you want a clean restart
- Before switching machines or sessions on the same work
- `/handoff <what to stress>` to emphasise one part

For an end-of-session retro (memory, rules, cleanup), use `wrap-up` instead.

---
