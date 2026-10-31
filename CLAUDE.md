# User Notes

- **Config locations**: MCP servers in `~/.claude.json`; hooks wired in `~/.claude/settings.json`, scripts in `~/.claude/hooks/`.

# Agents

Local agents live in `~/.claude/agents/` — invoke by bare name (`executor`, `architect`, …). The roster and descriptions are injected every session; don't duplicate the list here.

- **Delegate sizeable code work.** Send source-code changes that are large, or that split into independent parallel tracks, to `executor` / `deep-executor`. Make small edits (a handful of tool calls) yourself — a subagent re-reads context and costs more than the edit. Edit config/orchestration files (`~/.claude/**`, `CLAUDE.md`) directly.
- **Model is per-agent.** `sonnet` + `effort: high` for routine tool-checked work (git-master, writer — trial since 2026-10-05), `opus` for judgment-heavy specialist work, `inherit` for implementation (executor, debugger, test-engineer), verification, and high-risk analysis/review. Model doesn't set reasoning effort; the `effort:` frontmatter field does. Frontmatter is the default only: a plan task's **Model** line overrides `model` and `effort` on that call (tiers in skill:plan `references/task-format.md`: start at sonnet, opus on evidence). Off-plan, override on the call for an exceptionally hard task instead of changing the agent's default.
- **Agent lifecycle.** `TaskStop` an agent once its report is used. A subagent's cache lives 5 minutes, so a follow-up to one idle longer goes to a fresh agent with a short brief, not `SendMessage`. Spawn agents without `name`: a named agent becomes a teammate, and each finish wakes you with an `idle_notification` that repeats its whole report (thousands a month). `SendMessage` reaches an unnamed agent by id. Name one only when the user asks for a team.
- **Long reports.** A reply ending in a scratchpad path (`…/reports/<agent>-<slug>.md`) is complete: act on its verdict and summary, and `Read` the file only for detail. Put the resolved scratchpad directory in the brief; a subagent may not see it.
- **Worktree briefs.** A brief for an `isolation: "worktree"` agent says `Your cwd is the worktree; use paths relative to it.` and carries no absolute path into the main checkout (no `Repo:` line). `.claude/local/plans/**` is gitignored and absent in a worktree: paste what the agent needs.
- **Time budget.** Every brief states `Expected: N min` (default 15 for executor, 30 for deep-executor, 20 for a reviewer). Dispatch in the background and note the start time. The clock restarts at each new assignment (a dispatch or a `SendMessage` with new work); a brief that covers several slices states N per slice, and idle time between assignments doesn't count. At 2× of the current assignment with no report, `TaskStop` the agent, read its partial diff or report file, then take over or re-dispatch the unfinished part smaller. Nothing else stops a runaway: the retro found runs of 640 minutes.
- **Timing runs** over ~10 min go to a fresh bench agent, not the executor that built the change.
- **CPU-heavy runs** are wrapped in the shared lock by `hooks/cpu-guard.js` in every repo (opt out with a `.claude/cpu-guard.off` file). By hand: `~/.claude/scripts/cpu-lock bench <cmd>` (exclusive) for benches and timing, `cpu-lock gate <cmd>` (shared) for full gates and e2e. Once per machine, add the heavy JS commands to rtk's `exclude_commands` (line in the `cpu-guard.js` header).
- **Tie-breaks:** `executor` by default, including plan tasks that name their files and a test, however many systems they cross. `deep-executor` only when requirements are unclear or `executor` returned BLOCKED; it costs about 2x an Opus executor run. `test-engineer` for coverage-gap audits and flaky-suite hardening, not per feature. `/plan` writes the plan, `architect` reviews design, `critic` attacks the spec and the plan. `code-reviewer` checks a whole step against the plan; `security-` / `performance-` / `quality-reviewer` are single-dimension deep passes.
- **Recipes, when the user asks for a full pipeline** (≤3 agents in parallel):
  - Feature: `brainstorming` → `/plan` → `executor` (ships its own tests) → `quality-reviewer`; run the final build/tests yourself.
  - Bug: built-in `Explore` → `debugger` → `executor` (adds the fails-on-revert test).
  - Review panel: `quality-reviewer` + `security-reviewer` + `performance-reviewer`.

@AGENTS.md

# Terminal output

Local sessions: a PreToolUse hook rewrites Bash commands through `rtk`, so their output arrives compressed. Use `rtk proxy <cmd>` when you need raw, unfiltered output. Cloud sessions have no rtk (`scripts/cloud-setup.sh` drops its hook and cpu-guard): run commands plainly.
