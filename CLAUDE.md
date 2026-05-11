<!-- OMC:START -->
<!-- OMC:VERSION:4.2.13 -->

# oh-my-claudecode

Multi-agent orchestration layer. Agent types, skills, and tools are discoverable at runtime via Task tool descriptions, system-reminder skill lists, and ToolSearch — do not duplicate them here.

## Band-Aids

- **Delegate code edits.** Route source-code changes (`.ts`, `.py`, `.go`, etc.) through `executor`/`deep-executor` agents. Write directly only to config/orchestration files (`~/.claude/**`, `.omc/**`, `CLAUDE.md`). Use `oh-my-claudecode:` prefix for OMC agent subagent types.
- **Model routing.** Pass `model` on Task calls: `haiku` for quick lookups, `sonnet` for standard work, `opus` for architecture/complex refactors.
- **MCP tools are deferred.** Call `ToolSearch("mcp")` before first use — they are NOT in your tool list at session start. No results means not configured; fall back to Claude agents. Always attach `context_files`/`files` when calling MCP tools.
- **Uncertain API/SDK usage.** Delegate to `dependency-expert` or use Context7 (`resolve-library-id` then `query-docs`) before guessing field names or API contracts.
- **Cancellation.** Hooks can't read your responses. Use `/oh-my-claudecode:cancel` to end execution modes (`--force` clears all state).
- **OMC state path.** All state lives at `{worktree}/.omc/` — not `~/.claude/`.
- **Context persistence.** Use `<remember>info</remember>` (7 days) or `<remember priority>info</remember>` (permanent).
- **MCP provider strengths.** Codex (`ask_codex`): architecture, planning, critical analysis, code/security review. Gemini (`ask_gemini`): UI/UX design, documentation, visual analysis, large-context (1M tokens). Pass any OMC agent role as `agent_role` parameter.
- **Hook patterns** in `<system-reminder>` tags:
  - `hook success: Success` — proceed normally
  - `hook additional context: ...` — read it, it's relevant
  - `[MAGIC KEYWORD: ...]` — invoke that skill immediately
  - `The boulder never stops` — ralph/ultrawork active, keep going

## Team Compositions

These workflow recipes are not available in skill files — they exist only here.

- **Feature Development:** `analyst` -> `planner` -> `executor` -> `test-engineer` -> `quality-reviewer` -> `verifier`
- **Bug Investigation:** `explore` + `debugger` + `executor` + `test-engineer` + `verifier`
- **Code Review:** `style-reviewer` + `quality-reviewer` + `api-reviewer` + `security-reviewer`
- **Product Discovery:** `product-manager` + `ux-researcher` + `product-analyst` + `designer`
- **Feature Specification:** `product-manager` -> `analyst` -> `information-architect` -> `planner` -> `executor`
- **UX Audit:** `ux-researcher` + `information-architect` + `designer` + `product-analyst`

<!-- OMC:END -->

# User Notes

- **MCP/HOOKS setup location**: `$HOME\.claude.json`

@AGENTS.md

@RTK.md

# Always Use Caveman skill

@skills/skills/caveman/SKILL.md
