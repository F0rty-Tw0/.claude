---
name: trace
description: Use when the user wants to see what hooks, skills, agents, or tools fired this session, or asks for a session timeline
---

# Agent Flow Trace

[TRACE MODE ACTIVATED]

## Objective

Display the flow trace showing how hooks, keywords, skills, agents, and tools interacted during this session.

## Data Source

There is no `trace_timeline` / `trace_summary` MCP tool installed in this environment (verified: not in the deferred
tool list, no MCP server registers them, and `claude-hud` -- the only trace-adjacent plugin present -- only ships a
statusline renderer, not query tools). Reconstruct the trace directly from the session transcript instead.

1. **Locate the transcript**: the current session's JSONL log lives under
   `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Find it with the most recent mtime:
   ```bash
   ls -t ~/.claude/projects/*/*.jsonl | head -1
   ```
2. **Parse events** from the JSONL (one JSON object per line):
   - `tool_use` blocks -> tool name, input summary, start timestamp
   - `tool_result` blocks -> matching `tool_use_id`, end timestamp -- pair them to get duration; an unmatched
     `tool_use` is a still-running or aborted call
   - `Task`/`Agent` tool calls -> agent type, model, prompt summary (agent spawns)
   - `TodoWrite` calls -> todo list snapshots (mode/progress transitions)
   - Skill invocations -> `<command-name>` tags or `Skill` tool calls in the transcript
   - Hook firings are not logged in the transcript by default; if `settings.json` has a `hooks` block, note which
     hook events are configured but report that per-firing detail isn't recoverable from the transcript alone
3. **Prefer `jq` if available** for extraction (`jq -c 'select(.type=="tool_use")'`); fall back to Read + manual
   scan of the JSONL if `jq` is not installed.

## Output Format

Present the timeline first, then the summary. Highlight:

- **Mode transitions** (how execution modes / todo states changed)
- **Bottlenecks** (tool_use/tool_result pairs with the largest timestamp gap)
- **Flow patterns** (skill -> agent -> tool chains, in invocation order)

If the transcript can't be located or parsed, say so explicitly rather than fabricating a timeline -- do not invent
hook or tool activity that isn't confirmed in the JSONL.
