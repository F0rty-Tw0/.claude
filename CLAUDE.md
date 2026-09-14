# User Notes

- **MCP/HOOKS setup location**: `$HOME\.claude.json`

# Agents

Local agents live in `~/.claude/agents/` — invoke by bare name (`executor`, `analyst`, …). The full roster + descriptions are injected every session; don't duplicate the list here (it drifts).

- **Delegate code edits.** Route source-code changes (`.ts`, `.py`, `.go`, etc.) through `executor` / `deep-executor`. Edit config/orchestration files (`~/.claude/**`, `CLAUDE.md`) directly.
- **Model is per-agent.** Use `haiku` for lookup/extraction, `opus` for routine implementation and bounded specialist work, and `inherit` for complex implementation and high-risk analysis/review. `inherit` follows the parent model, not a fixed Fable version; select the stronger parent model before using those agents. Model selection does not set reasoning effort. Override a specialist's model for exceptionally difficult tasks instead of promoting its default.

## Picking between overlapping agents

Descriptions don't disambiguate these — the tie-breaks do:

- `executor` (`opus`) by default for well-scoped changes; `deep-executor` (`inherit`) for complex, cross-system, or fuzzy goals. File count alone is not an escalation trigger: mechanical multi-file edits stay with `executor`. `build-fixer` and `test-engineer` default to `opus`; `designer` inherits for open-ended UI design and implementation.
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
