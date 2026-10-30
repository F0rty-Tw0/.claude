# User Notes

- **Config locations**: MCP servers in `~/.claude.json`; hooks wired in `~/.claude/settings.json`, scripts in `~/.claude/hooks/`.

# Agents

Local agents live in `~/.claude/agents/` — invoke by bare name (`executor`, `architect`, …). The roster and descriptions are injected every session; don't duplicate the list here.

- **Delegate sizeable code work.** Send source-code changes that are large, or that split into independent parallel tracks, to `executor` / `deep-executor`. Make small edits (a handful of tool calls) yourself — a subagent re-reads context and costs more than the edit. Edit config/orchestration files (`~/.claude/**`, `CLAUDE.md`) directly.
- **Model is per-agent.** `sonnet` + `effort: high` for routine tool-checked work (build-fixer, git-master, writer — trial since 2026-10-05), `opus` for judgment-heavy specialist work, `inherit` for implementation (executor, debugger, test-engineer), verification, and high-risk analysis/review. Model doesn't set reasoning effort; the `effort:` frontmatter field does. Frontmatter is the default only: a plan task's **Model** line overrides `model` and `effort` on that call (tiers in skill:plan `references/task-format.md`: start at sonnet, opus on evidence). Off-plan, override on the call for an exceptionally hard task instead of changing the agent's default.
- **Agent lifecycle.** `TaskStop` an agent once its report is used. A subagent's cache lives 5 minutes, so a follow-up to one idle longer goes to a fresh agent with a short brief, not `SendMessage`. Spawn agents without `name`: a named agent becomes a teammate, and each finish wakes you with an `idle_notification` that repeats its whole report (thousands a month). `SendMessage` reaches an unnamed agent by id. Name one only when the user asks for a team.
- **Timing runs** over ~10 min go to a fresh bench agent, not the executor that built the change.
- **CPU-heavy runs** take the machine lock: `~/.claude/scripts/cpu-lock bench <cmd>` (exclusive) for benches and timing, `cpu-lock gate <cmd>` (shared) for full gates and e2e.
- **Tie-breaks:** `executor` by default; `deep-executor` for cross-system or fuzzy goals (file count alone doesn't escalate). `/plan` writes the plan, `architect` reviews design, `critic` attacks the spec and the plan. `code-reviewer` checks a whole step against the plan; `security-` / `performance-` / `quality-reviewer` are single-dimension deep passes.
- **Recipes, when the user asks for a full pipeline** (≤3 agents in parallel):
  - Feature: `brainstorming` → `/plan` → `executor` → `test-engineer` → `quality-reviewer`; run the final build/tests yourself.
  - Bug: built-in `Explore` → `debugger` → `executor` → `test-engineer`.
  - Review panel: `quality-reviewer` + `security-reviewer` + `performance-reviewer`.

@AGENTS.md

# Terminal output

A PreToolUse hook rewrites Bash commands through `rtk`, so their output arrives compressed. Use `rtk proxy <cmd>` when you need raw, unfiltered output.
