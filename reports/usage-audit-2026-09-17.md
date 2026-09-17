# Usage audit — Claude Code, Codex, omp

Date: 2026-09-17
Scope: `~/.claude`, `~/.codex`, `~/.omp` — skills, custom agents, slash commands.
Read-only analysis. Nothing deleted.

## TL;DR

- **37 of 82 local skills never used** in any tool.
- **14 of 29 custom agents never spawned** in any tool; 7 more used once.
- Real load: `executor` + `deep-executor` (Claude), `librarian`/`scout` (omp built-ins), `test-engineer`, `code-reviewer` (omp).
- Skills that actually earn their keep: `caveman`, `humanizer`, `pr-description`, `skills-using`, `systematic-debugging`, `verification-before-completion`, `analyze`, `angular-developer`, `test-driven-development`.
- **6 copies of `agents/`**, 2 copies of `skills/`, all drifting. One `skills.backup.*` (3.3 MB) still in repo.
- **MCP:** `ide` + `playwright` do all the work. `chrome-devtools`, `agentic-mcp`, `context7`, `angular-cli`, 4 claude.ai connectors ≈ 0 calls across 189 sessions.

## Data sources and limits

| Tool | Window | Source | Limit |
|---|---|---|---|
| Claude Code — skills | 2026-05-29 → 2026-09-17 | `~/.claude.json` → `skillUsage` (lifetime counter) | Counts explicit `/skill` or Skill-tool calls only. Skills auto-loaded via `@` in CLAUDE.md (`caveman`, `ponytail`) are undercounted. |
| Claude Code — agents | 2026-09-14 → 2026-09-17 | `~/.claude/projects/**/*.jsonl` (16 sessions, 3157 assistant msgs + 75 subagent transcripts) | **16 of 189 sessions (8%).** `clean-claude` deletes older transcripts. `~/.claude.json` has no lifetime agent counter. |
| Claude Code — session census + MCP | 2026-06 → 2026-09 | `~/.cache/claude-cli-nodejs/*/mcp-logs-*/*.jsonl` (1066 debug logs) | Session IDs + `Calling MCP tool:` lines only. No agent/skill data. |
| Claude Code — prompts | 2026-05-29 → 2026-09-16 | `history.jsonl` (883 prompts, 202 startups) | User-typed text only. |
| Codex | 2026-09-02 → 2026-09-17 | `state_5.sqlite`, `thread_history_1.sqlite`, 10 rollout files (6 real threads + 4 subagent threads) | 2 weeks. Skill "use" = model ran a command that read `SKILL.md`. |
| omp (oh-my-pi) | 2026-06 → 2026-09 | `~/.omp/agent/sessions/**` (55 sessions + 96 subagent logs), `agent.db`, `history.db` (266 prompts) | Skill "use" = `read skill://name`. Agent = `task` tool `tasks[].agent`. |

Claude agent numbers are a **sample**, not a census. Skill numbers are lifetime.

Sources checked and found empty for agent/skill signal: `~/.claude/telemetry` (110 `tengu_skill_loaded` = one session's startup index load), 75 nested `subagents/*.jsonl` (0 nested Agent/Skill calls), VS Code `Anthropic.claude-code` ext logs, Codex desktop logs (`~/.local/state/codex`), `~/.omp/logs`, `~/.omp/agent/terminal-sessions`. Prompt text: user asked for an agent by name once in Claude (`executor`), once in omp (`vision`).

## Activity overview

Prompts per month:

| Month | Claude prompts | Claude sessions (MCP census) | omp prompts | omp sessions | Codex threads |
|---|---:|---:|---:|---:|---:|
| 2026-05 | 80 | – | – | – | – |
| 2026-06 | 596 | 121 | 60 | 24 | – |
| 2026-07 | 178 | 46 | 98 | 15 | – |
| 2026-08 | 0 | 0 | 82 | 8 | – |
| 2026-09 | 29 | 22 | 26 | 8 | 6 |

Claude: 189 sessions Jun–Sep (census excludes `skillopt-sleep` tmp runs). Transcripts survive for 16 → agent table = 8% sample. Claude went quiet in August; omp carried that month. Codex started Sep 2.

Claude tool mix (4-day sample): Bash 1204, Agent 72, Edit 47, Write 26, SendMessage 26, ToolSearch 23, AskUserQuestion 14, Read 14, Skill **4**.

omp tool mix (all sessions): read 1353, bash 1198, edit 417, todo 350, hub 341, grep 164, write 106, search 101, eval 66, task 63, browser 45, ask 39.

Codex tool mix: wait 51, send_message 43, followup_task 5, spawn_agent 4, request_user_input 4.

User-typed slash commands in Claude (lifetime): `/clear` 40, `/model` 17, `/effort` 7, `/mcp` 6, `/login` 6, `/pr-description` 5, `/btw` 4, `/caveman` 3, `/plugin` 3, `/modern-web-guidance` 2, `/angular-developer` 2. Everything else 1.

omp slash commands: `/mcp` 2, `/skill:pr-description` 2, `/compact` 2, `/skill:skills-creating` 1, `/model` 1.

## Agents — full table (29 custom agents in `~/.claude/agents`)

| Agent | Claude (Sep 14–17) | omp (Jun–Sep) | Codex (Sep 2–17) | Total | Size KB |
|---|---:|---:|---:|---:|---:|
| deep-executor | 34 | 6 | 0 | 40 | 6.3 |
| executor | 29 | 10 | 0 | 39 | 4.8 |
| test-engineer | 0 | 10 | 0 | 10 | 5.6 |
| code-reviewer | 0 | 8 | 0 | 8 | 5.5 |
| architect | 3 | 2 | 0 | 5 | 6.4 |
| quality-reviewer | 0 | 3 | 0 | 3 | 5.6 |
| writer | 2 | 1 | 0 | 3 | 3.8 |
| external-researcher | 2 | 0 | 0 | 2 | 8.6 |
| analyst | 0 | 1 | 0 | 1 | 5.3 |
| api-reviewer | 0 | 1 | 0 | 1 | 5.0 |
| debugger | 0 | 1 | 0 | 1 | 5.3 |
| explore | 0 | 1 | 0 | 1 | 6.6 |
| performance-reviewer | 0 | 1 | 0 | 1 | 5.2 |
| scientist | 0 | 1 | 0 | 1 | 5.6 |
| verifier | 0 | 1 | 0 | 1 | 5.1 |
| build-fixer | 0 | 0 | 0 | 0 | 4.4 |
| critic | 0 | 0 | 0 | 0 | 5.0 |
| designer | 0 | 0 | 0 | 0 | 8.2 |
| git-master | 0 | 0 | 0 | 0 | 4.4 |
| information-architect | 0 | 0 | 0 | 0 | 12.7 |
| planner | 0 | 0 | 0 | 0 | 7.4 |
| product-analyst | 0 | 0 | 0 | 0 | 14.8 |
| product-manager | 0 | 0 | 0 | 0 | 10.6 |
| qa-tester | 0 | 0 | 0 | 0 | 5.4 |
| quality-strategist | 0 | 0 | 0 | 0 | 9.5 |
| security-reviewer | 0 | 0 | 0 | 0 | 6.2 |
| style-reviewer | 0 | 0 | 0 | 0 | 4.3 |
| ux-researcher | 0 | 0 | 0 | 0 | 13.1 |
| vision | 0 | 0 | 0 | 0 | 3.8 |

Non-custom agents also spawned:

- Claude: `Explore` (built-in) 2
- omp: `librarian` 15, `scout` 8 (omp built-ins), generic `task` 9, unnamed 9, `Tester` 1 (typo/ad-hoc)
- Codex: 4 ad-hoc subagents (`boundary_review`, `edge_audit`, `tracker_audit`, `query_audit`) — **none of the 29 custom agents used**

### Never spawned anywhere (14)

`build-fixer`, `critic`, `designer`, `git-master`, `information-architect`, `planner`, `product-analyst`, `product-manager`, `qa-tester`, `quality-strategist`, `security-reviewer`, `style-reviewer`, `ux-researcher`, `vision`

### Spawned exactly once (7)

`analyst`, `api-reviewer`, `debugger`, `explore`, `performance-reviewer`, `scientist`, `verifier`

### Agent observations

- Claude: `deep-executor` 34 + `executor` 29 = 88% of all spawns. Matches CLAUDE.md "delegate code edits" rule.
- omp: spread wider (test-engineer, code-reviewer, quality-reviewer, architect) — omp's `task` tool + `skills-using` skill push toward the roster.
- Codex: ignores the roster entirely. Codex `agents/` dir is dead weight there.
- Product suite (`product-manager`, `product-analyst`, `ux-researcher`, `information-architect`, `quality-strategist`) = 61 KB of prompt injected every session, **0 spawns**.
- Reviewer panel (`style`, `api`, `security`, `performance`): 2 spawns total across 3+ months. `code-reviewer` + `quality-reviewer` do the work.
- `planner` / `critic` 0 — you use `/plan` skill and built-in `Plan` agent instead.
- `git-master` agent 0; `git-master` skill 2 (omp). Skill wins.
- `build-fixer` agent 0; `build-fix` skill 2 (omp). Skill wins.

### Agent copy drift

| Path | Files | Differ from `~/.claude/agents` |
|---|---:|---:|
| `~/.claude/agents` (source of truth per CLAUDE.md) | 29 | – |
| `~/.codex/agents` | 29 | 26 |
| `~/.omp/agent/agents` | 27 | all (missing `external-researcher`, `vision`) |
| `~/.claude/.omp/agent/agents` | 27 | all |
| `~/.claude/.omp/agent-anthropic/agents` | 27 | all |
| `~/.claude/.omp/agent-openai/agents` | 27 | all |

Diff content not inspected line-by-line — likely frontmatter/model fields (inferred). Three copies live inside the git repo under `.omp/`.

## Skills — full table (82 local skills in `~/.claude/skills`)

| Skill | Claude lifetime | Claude last used | omp reads | Codex reads | Total |
|---|---:|---|---:|---:|---:|
| skills-using | 0 |  | 79 | 2 | 81 |
| caveman | 36 | 2026-06-12 | 10 | 1 | 47 |
| analyze | 0 |  | 24 | 10 | 34 |
| test-driven-development | 0 |  | 29 | 4 | 33 |
| humanizer | 27 | 2026-07-08 | 3 | 0 | 30 |
| angular-developer | 3 | 2026-06-12 | 25 | 0 | 28 |
| verification-before-completion | 0 |  | 20 | 4 | 24 |
| systematic-debugging | 1 | 2026-07-08 | 18 | 1 | 20 |
| external-context | 0 |  | 18 | 1 | 19 |
| pr-description | 14 | 2026-07-08 | 1 | 0 | 15 |
| rdx-audit | 2 | 2026-09-17 | 11 | 1 | 14 |
| brainstorming | 2 | 2026-07-08 | 9 | 0 | 11 |
| code-review | 0 |  | 11 | 0 | 11 |
| ponytail | 0 |  | 9 | 1 | 10 |
| code-review-receiving | 2 | 2026-06-12 | 2 | 2 | 6 |
| code-review-requesting | 1 | 2026-06-23 | 5 | 0 | 6 |
| plan | 1 | 2026-07-08 | 4 | 1 | 6 |
| git-master | 0 |  | 4 | 0 | 4 |
| plans-writing | 0 |  | 3 | 1 | 4 |
| skills-creating | 1 | 2026-06-15 | 3 | 0 | 4 |
| structuring-feature-modules | 2 | 2026-07-01 | 2 | 0 | 4 |
| autopilot | 0 |  | 3 | 0 | 3 |
| meaningful-commits | 3 | 2026-09-17 | 0 | 0 | 3 |
| modern-web-guidance | 3 | 2026-06-12 | 0 | 0 | 3 |
| plans-executing | 0 |  | 1 | 2 | 3 |
| research | 0 |  | 2 | 1 | 3 |
| using-git-worktrees | 1 | 2026-06-12 | 2 | 0 | 3 |
| build-fix | 0 |  | 2 | 0 | 2 |
| deepsearch | 0 |  | 2 | 0 | 2 |
| finishing-a-development-branch | 0 |  | 2 | 0 | 2 |
| flow | 0 |  | 2 | 0 | 2 |
| pnpm-best-practices | 0 |  | 2 | 0 | 2 |
| prompt-engineer | 0 |  | 2 | 0 | 2 |
| prototype | 0 |  | 2 | 0 | 2 |
| rdx-review | 0 |  | 2 | 0 | 2 |
| artification | 1 | 2026-09-17 | 0 | 0 | 1 |
| deflaky | 1 | 2026-07-08 | 0 | 0 | 1 |
| deglaze | 0 |  | 1 | 0 | 1 |
| dispatching-parallel-agents | 0 |  | 1 | 0 | 1 |
| kaizen | 0 |  | 1 | 0 | 1 |
| note | 0 |  | 1 | 0 | 1 |
| ralph | 0 |  | 1 | 0 | 1 |
| subagent-driven-development | 1 | 2026-07-08 | 0 | 0 | 1 |
| triage | 0 |  | 1 | 0 | 1 |
| value-realization | 1 | 2026-06-23 | 0 | 0 | 1 |
| angular-new-app | 0 |  | 0 | 0 | 0 |
| chrome-extensions | 0 |  | 0 | 0 | 0 |
| deepinit | 0 |  | 0 | 0 | 0 |
| frontend-design | 0 |  | 0 | 0 | 0 |
| frontend-ui-ux | 0 |  | 0 | 0 | 0 |
| grill-with-docs | 0 |  | 0 | 0 | 0 |
| learner | 0 |  | 0 | 0 | 0 |
| nextjs-best-practices | 0 |  | 0 | 0 | 0 |
| nx-workspace-scafold | 0 |  | 0 | 0 | 0 |
| pipeline | 0 |  | 0 | 0 | 0 |
| project-session-manager | 0 |  | 0 | 0 | 0 |
| psm | 0 |  | 0 | 0 | 0 |
| ralph-init | 0 |  | 0 | 0 | 0 |
| ralplan | 0 |  | 0 | 0 | 0 |
| rdx | 0 |  | 0 | 0 | 0 |
| rdx-help | 0 |  | 0 | 0 | 0 |
| review | 0 |  | 0 | 0 | 0 |
| security-review | 0 |  | 0 | 0 | 0 |
| setup-engineering-skills | 0 |  | 0 | 0 | 0 |
| skill | 0 |  | 0 | 0 | 0 |
| source-command-clean-claude | 0 |  | 0 | 0 | 0 |
| source-command-delete-nul | 0 |  | 0 | 0 | 0 |
| source-command-review-claude | 0 |  | 0 | 0 | 0 |
| source-command-skillopt-run | 0 |  | 0 | 0 | 0 |
| source-command-start-mcp-proxy | 0 |  | 0 | 0 | 0 |
| source-command-start-pytaiga-mcp | 0 |  | 0 | 0 | 0 |
| team | 0 |  | 0 | 0 | 0 |
| to-issues | 0 |  | 0 | 0 | 0 |
| trace | 0 |  | 0 | 0 | 0 |
| ultrapilot | 0 |  | 0 | 0 | 0 |
| ultraqa | 0 |  | 0 | 0 | 0 |
| ultrawork | 0 |  | 0 | 0 | 0 |
| upgrade-dotnet | 0 |  | 0 | 0 | 0 |
| using-agentic-mcp | 0 |  | 0 | 0 | 0 |
| wrap-up | 0 |  | 0 | 0 | 0 |
| writer-memory | 0 |  | 0 | 0 | 0 |
| zoom-out | 0 |  | 0 | 0 | 0 |

Built-in / plugin skills used (not in local dir): `update-config` 1, `claude-hud:setup` 1, `keybindings-help` 2, `simplify` 1, `subagent-driven-development` 1 (Claude). Codex-only local skill `loop-video`: 1 explicit call, 1 read.

### Never used anywhere (37)

`angular-new-app`, `chrome-extensions`, `deepinit`, `frontend-design`, `frontend-ui-ux`, `grill-with-docs`, `learner`, `nextjs-best-practices`, `nx-workspace-scafold`, `pipeline`, `project-session-manager`, `psm`, `ralph-init`, `ralplan`, `rdx`, `rdx-help`, `review`, `security-review`, `setup-engineering-skills`, `skill`, `source-command-clean-claude`, `source-command-delete-nul`, `source-command-review-claude`, `source-command-skillopt-run`, `source-command-start-mcp-proxy`, `source-command-start-pytaiga-mcp`, `team`, `to-issues`, `trace`, `ultrapilot`, `ultraqa`, `ultrawork`, `upgrade-dotnet`, `using-agentic-mcp`, `wrap-up`, `writer-memory`, `zoom-out`

`nx-workspace-scafold` added one commit ago — exempt.

### Redundant clusters

1. **Exact duplicates / aliases**
   - `psm` = `project-session-manager`. Both 0.
   - `ralplan` = `/plan --consensus`; `review` = `/plan --review`. Both 0.
   - `source-command-*` (6) = `~/.claude/commands/*.md` (7). Same content loaded twice.
   - `humanizer` = `anthropic-skills:avoid-ai-writing` (synced). `humanizer` used 27 — keep; ignore synced.
   - `rdx-help` — help text for a mode with 0 uses.

2. **Orchestration pile** (10 skills, one job: fan out agents)
   `pipeline` 0, `team` 0, `ultrawork` 0, `ultrapilot` 0, `ultraqa` 0, `ralph-init` 0, `ralph` 1, `flow` 2, `autopilot` 3, `research` 3, `dispatching-parallel-agents` 1, `subagent-driven-development` 1.
   You spawn agents directly (72 Agent calls in 4 days). Skills are not your path to parallelism.

3. **Minimalism pile**
   `rdx` 0, `rdx-help` 0, `rdx-review` 0, `rdx-audit` 5, `kaizen` 1, `ponytail` (auto-loaded), `simplify` (built-in) 1.

4. **Review pile**
   `code-review` 1, `code-review-requesting` 3, `code-review-receiving` 6, `security-review` 0, `rdx-review` 0, built-in `/code-review`, plus 6 reviewer agents.

5. **Frontend pile**
   `frontend-design` 0, `frontend-ui-ux` 0, `modern-web-guidance` 3, `designer` agent 0, `angular-developer` 11, `angular-new-app` 0 (angular-cli MCP covers scaffolding).

6. **Skill management pile**
   `skill` 0, `learner` 0, `skills-creating` 4, `anthropic-skills:skill-creator` (synced).

7. **Skill ↔ agent mirrors** (same job, two shapes; skill side wins in omp, agent side ~0)
   `build-fix`↔`build-fixer`, `git-master`↔`git-master`, `systematic-debugging`↔`debugger`, `verification-before-completion`↔`verifier`, `external-context`↔`external-researcher`, `deepsearch`↔`explore`, `deglaze`↔`verifier`.

8. **Planning pile**
   `plan` 6, `plans-writing` 4, `plans-executing` 2, `brainstorming` 8, `grill-with-docs` 0, `ralph-init` 0, `ralplan` 0, `review` 0, plus built-in `Plan` agent + `planner` agent 0 + `critic` agent 0.

### Skill copy drift

- `~/.codex/skills` is a near-copy of `~/.claude/skills`.
- Differ: `ponytail`, `test-driven-development`.
- Codex-only: `loop-video`. Claude-only: `artification`, `nx-workspace-scafold`, `source-command-*` ×6.
- `~/.claude/skills.backup.20260707-110001/` — 70 skills, 3.3 MB, in repo.

## MCP servers (Claude, Jun–Sep, from debug logs)

| Server | Sessions started in | Sessions with ≥1 call | Calls | Top tools |
|---|---:|---:|---:|---|
| ide | 125 | 94 | 5031 | getDiagnostics 4675, closeAllDiffTabs 356 |
| playwright | 156 | 15 | 242 | browser_evaluate 100, browser_navigate 57, press_key 30, screenshot 20 |
| t3-code | 14 | 7 | 9 | link_pull_request 9 |
| context7 | 156 | 1 | 2 | resolve-library-id 2 |
| angular-cli | 156 | 1 | 1 | search_documentation 1 |
| agentic-mcp | 69 | 0 | 0 | – |
| chrome-devtools | 156 | 0 | 0 | – |
| claude-ai-Figma | 28 | 0 | 0 | – |
| claude-ai-Gmail | 27 | 0 | 0 | – |
| claude-ai-Google-Calendar | 27 | 0 | 0 | – |
| claude-ai-Google-Drive | 27 | 0 | 0 | – |
| claude-ai-Claude-Docs | 16 | 0 | 0 | – |
| claude-ai-Claude-Code-Remote | 10 | 0 | 0 | – |

- `chrome-devtools`, `agentic-mcp`, `context7`, `angular-cli`: booted in every session, ≈0 calls. Each adds tool schemas to every prompt.
- `using-agentic-mcp` skill (0 uses) + `agentic-mcp` server (0 calls) — drop both together.
- `chrome-devtools` duplicates `playwright` (which is used). Drop.
- claude.ai connectors (Figma/Gmail/Calendar/Drive): unauthenticated, 0 calls. Disconnect or authorize.

## Recommendations

### Delete now — 0 use, pure alias or duplicate

- Skills: `psm`, `ralplan`, `review`, `rdx-help`, `source-command-*` ×6
- Dirs: `skills.backup.20260707-110001/`, `.omp/agent/`, `.omp/agent-anthropic/`, `.omp/agent-openai/` (inside `~/.claude`)

### Delete unless you plan to use — 0 use, domain-specific or superseded

`upgrade-dotnet`, `writer-memory`, `chrome-extensions`, `nextjs-best-practices`, `angular-new-app`, `zoom-out`, `setup-engineering-skills`, `to-issues`, `grill-with-docs`, `using-agentic-mcp`, `wrap-up`, `trace`, `learner`, `skill`, `deepinit`, `deepsearch`, `frontend-design`, `frontend-ui-ux`, `security-review`, `triage`

### Collapse orchestration → keep 2

Keep `autopilot` + `research`. Drop `pipeline`, `team`, `ultrawork`, `ultrapilot`, `ultraqa`, `ralph-init`. Keep `ralph` / `flow` only if you will invoke them by name.

### Collapse minimalism → keep 2

Keep `ponytail` (auto-loaded) + `rdx-audit`. Drop `rdx`, `rdx-review`, `kaizen`. Update CLAUDE.md RDX section accordingly.

### Collapse agents 29 → ~10

Keep: `executor`, `deep-executor`, `architect`, `explore`, `external-researcher`, `test-engineer`, `code-reviewer`, `quality-reviewer`, `debugger`, `writer`.

Drop: `product-manager`, `product-analyst`, `ux-researcher`, `information-architect`, `quality-strategist` (61 KB, 0 use), `critic`, `planner`, `designer`, `vision`, `qa-tester`, `style-reviewer`, `api-reviewer`, `performance-reviewer`, `security-reviewer` (fold into `code-reviewer`), `build-fixer`, `git-master`, `verifier`, `scientist`, `analyst`.

Update CLAUDE.md "Team Compositions" and "Picking between overlapping agents" after — they reference dropped agents.

### Fix drift — one source of truth

- `~/.claude/agents` and `~/.claude/skills` = source.
- Symlink `~/.codex/agents`, `~/.codex/skills`, `~/.omp/agent/agents` to them.
- Move `loop-video` into `~/.claude/skills` first.
- Reconcile `ponytail` and `test-driven-development` diffs before linking.

### Measurement fix

`clean-claude` wipes transcripts → agent stats for Claude cover 16 of 189 sessions. Options: (a) exclude `projects/` from cleanup, (b) run this audit script before each cleanup and append to this file. Script lives in this PR (see below).

## Reproduce

Script: `scripts/usage-audit.py` — scans all three tools plus Claude MCP debug logs, writes `/tmp/usage-audit.json`. Re-run and regenerate tables when needed.

## Confirmed vs inferred

- Confirmed: every count above (scripts run 2026-09-17 against live data).
- Inferred: agent-copy diffs are frontmatter-only; product-suite agents inflate every prompt (size confirmed, injection cost not measured).
- Not checked: whether omp `librarian`/`scout` overlap with `explore`/`external-researcher` in behavior.
