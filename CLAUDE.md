# User Notes

- **MCP/HOOKS setup location**: `$HOME\.claude.json`

# Agents

Local agents live in `~/.claude/agents/` — invoke by bare name (`executor`, `analyst`, …), no plugin prefix. The full roster + descriptions are injected every session; don't duplicate the list here (it drifts).

- **Delegate code edits.** Route source-code changes (`.ts`, `.py`, `.go`, etc.) through `executor` / `deep-executor`. Edit config/orchestration files (`~/.claude/**`, `CLAUDE.md`) directly.
- **Model is per-agent.** Each agent declares its own `model` (`executor`=sonnet, `analyst`/`planner`=opus, `explore`=haiku, etc.). Override only when a call needs a different tier.

## Team Compositions

Workflow recipes — not discoverable at runtime, kept here on purpose.

- **Feature Development:** `analyst` -> `planner` -> `executor` -> `test-engineer` -> `quality-reviewer` -> `verifier`
- **Bug Investigation:** `explore` + `debugger` + `executor` + `test-engineer` + `verifier`
- **Code Review:** `style-reviewer` + `quality-reviewer` + `api-reviewer` + `security-reviewer`
- **Product Discovery:** `product-manager` + `ux-researcher` + `product-analyst` + `designer`
- **Feature Specification:** `product-manager` -> `analyst` -> `information-architect` -> `planner` -> `executor`
- **UX Audit:** `ux-researcher` + `information-architect` + `designer` + `product-analyst`

@AGENTS.md

@RTK.md

# Always Use Caveman skill

@skills/caveman/SKILL.md

# Always Use Ponytail skill

@skills/ponytail/SKILL.md
