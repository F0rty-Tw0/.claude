# User Notes

- **MCP/HOOKS setup location**: `$HOME\.claude.json`

# Agents

Local agents live in `~/.claude/agents/` — invoke by bare name (`executor`, `analyst`, …). The full roster + descriptions are injected every session; don't duplicate the list here (it drifts).

- **Delegate code edits.** Route source-code changes (`.ts`, `.py`, `.go`, etc.) through `executor` / `deep-executor`. Edit config/orchestration files (`~/.claude/**`, `CLAUDE.md`) directly.
- **Model is per-agent.** Each agent declares its own `model` (`executor`=sonnet, `analyst`/`planner`=opus, `explore`=haiku, etc.). Override only when a call needs a different tier.

## Picking between overlapping agents

Descriptions don't disambiguate these — the tie-breaks do:

- `executor` (sonnet) by default; `deep-executor` (opus) only for multi-file / fuzzy goals.
- `analyst` = requirements BEFORE a plan; `planner` = writes the plan; `architect` = system-design review; `critic` = tears a plan apart.
- `code-reviewer` = whole-step review against the plan; the panel (`style-reviewer` / `api-reviewer` / `security-reviewer` / `performance-reviewer` / `quality-reviewer`) = deep single-dimension passes.
- `explore` (agent) = locate code; `deepsearch` / `analyze` (skills) = heavier sweeps.

## Team Compositions

Workflow recipes — not discoverable at runtime, kept here on purpose.

- **Feature Development:** `analyst` -> `planner` -> `executor` -> `test-engineer` -> `quality-reviewer` -> `verifier`
- **Bug Investigation:** `explore` + `debugger` + `executor` + `test-engineer` + `verifier`
- **Code Review:** `style-reviewer` + `quality-reviewer` + `api-reviewer` + `security-reviewer`
- **Product Discovery:** `product-manager` + `ux-researcher` + `product-analyst` + `designer`
- **Feature Specification:** `product-manager` -> `analyst` -> `information-architect` -> `planner` -> `executor`
- **UX Audit:** `ux-researcher` + `information-architect` + `designer` + `product-analyst`

@AGENTS.md

# Always Use Caveman skill

@skills/caveman/SKILL.md

# Always Use Ponytail skill when you are about to write code

@skills/ponytail/SKILL.md

# When you are about to read any terminal output, use:

@RTK.md

# RDX — supplement to Caveman + Ponytail

Keep both always-on; layer rdx on demand (stricter rule wins on overlap):

- `/rdx` — adds evidence-before-minimalism + risk-matched brevity on top of caveman/ponytail.
- Automatic: before presenting any diff >150 lines, run `/rdx-audit` on it and cut what it flags.
- `/rdx-review` — code-only over-engineering gate before a merge.
