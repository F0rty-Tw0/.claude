# User Notes

- **Config locations**: MCP servers in `~/.claude.json`; hooks wired in `~/.claude/settings.json`, scripts in `~/.claude/hooks/`.

# Agents

Local agents live in `~/.claude/agents/` — invoke by bare name (`executor`, `architect`, …). The roster and descriptions are injected every session; don't duplicate the list here.

- **Delegate sizeable code work.** Send source-code changes that are large, or that split into independent parallel tracks, to `executor` / `deep-executor`. Make small edits (a handful of tool calls) yourself — a subagent re-reads context and costs more than the edit. Edit config/orchestration files (`~/.claude/**`, `CLAUDE.md`) directly.
- **Model is per-agent.** `haiku` for lookup/extraction, `sonnet` + `effort: high` for routine tool-checked work (build-fixer, git-master, writer — trial since 2026-10-05), `opus` for judgment-heavy specialist work, `inherit` for implementation (executor, debugger, test-engineer), verification, and high-risk analysis/review. Model doesn't set reasoning effort; the `effort:` frontmatter field does. For an exceptionally hard task, override the model on that call instead of changing the agent's default.
- **Tie-breaks:** `executor` by default; `deep-executor` for cross-system or fuzzy goals (file count alone doesn't escalate). `/plan` writes the plan, `architect` reviews design, `critic` attacks the spec and the plan. `code-reviewer` checks a whole step against the plan; `security-` / `performance-` / `quality-reviewer` are single-dimension deep passes.
- **Recipes, when the user asks for a full pipeline** (≤3 agents in parallel):
  - Feature: `brainstorming` → `/plan` → `executor` → `test-engineer` → `quality-reviewer`; run the final build/tests yourself.
  - Bug: built-in `Explore` → `debugger` → `executor` → `test-engineer`.
  - Review panel: `quality-reviewer` + `security-reviewer` + `performance-reviewer`.

@AGENTS.md

# Always-on modes

Grug for prose and code:

@skills/grug/SKILL.md

# Terminal output

A PreToolUse hook rewrites Bash commands through `rtk`, so their output arrives compressed. Use `rtk proxy <cmd>` when you need raw, unfiltered output.
