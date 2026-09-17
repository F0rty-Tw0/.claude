# Usage audit — Claude Code, Codex, omp (both machines)

Date: 2026-09-17
Scope: `~/.claude`, `~/.codex`, `~/.omp` — skills, custom agents, MCP servers.
Read-only analysis. Nothing deleted.

The config is shared across machines; the usage data is not. This report merges two machines:

| Machine | Platform | Data file | Notes |
|---|---|---|---|
| `Forty-Two` | Windows | `reports/data/usage-audit-Forty-Two.json` | Collected by `scripts/usage-audit.py` on 2026-09-17. |
| `machine-a` | Linux or Mac | `reports/data/usage-audit-machine-a.json` | **Reconstructed** from the first version of this report (single-machine run, 2026-09-17). Run the script there to replace it with real data. |

Every table below = sum of both machines unless a column says otherwise.

## TL;DR

- **9 of 82 skills never used** anywhere (was 37 when only machine-a was counted). 6 of the 9 are `source-command-*`, migrated from `commands/` **one day ago** — too young to judge, excluded from every delete list below.
- **5 of 29 custom agents never spawned**: `planner`, `product-analyst`, `product-manager`, `quality-strategist`, `vision`. 8 more spawned ≤2 times in ~6 months.
- Real load: `executor` 397, `code-reviewer` 191, `deep-executor` 163, `test-engineer` 63, `quality-reviewer` 52. Top 5 = 84% of 1034 custom-agent spawns.
- Claude spawns only `executor` / `deep-executor` (92% of Claude spawns). omp uses the whole roster. **Codex uses none** — its `~/.codex/agents` is empty on Windows, out of date on machine-a.
- Skills with real pull (excluding auto-loaded `skills-using`): `test-driven-development`, `artification`, `systematic-debugging`, `code-review`, `verification-before-completion`, `analyze`, `external-context`, `caveman`, `brainstorming`.
- **MCP:** `ide` does 99% of calls (21 240). `playwright` 242. Everything else ≤20 calls across ~570 Claude sessions. `agentic-mcp`, `chrome-devtools`, `filesystem`, 4 claude.ai connectors: 0 calls.
- Agent copies drift: 4 stale copies of `agents/` (3 inside this repo under `.omp/`), all 27 files differ from source.

## Data sources and limits

| Tool | Machine | Window | Source | Limit |
|---|---|---|---|---|
| Claude — skills | both | lifetime | `~/.claude.json` → `skillUsage` | Explicit `/skill` or Skill-tool calls only. Auto-loaded skills (`caveman`, `ponytail` via `@` in CLAUDE.md) undercounted. |
| Claude — agents | Forty-Two | 2026-08-18 → 2026-09-17 | 102 transcripts, 90 sessions | `clean-claude` deletes older transcripts. |
| Claude — agents | machine-a | 2026-09-14 → 2026-09-17 | 16 transcripts | 8% of that machine's sessions. |
| Claude — session census + MCP | both | 2026-03 → 2026-09 | `claude-cli-nodejs/**/mcp-logs-*/*.jsonl` (`~/.cache` on Linux/Mac, `AppData/Local` on Windows) | Session IDs + `Calling MCP tool:` lines only. |
| Codex | Forty-Two | 2026-02-11 → 2026-09-11 | 94 rollout files | Skill "use" = shell command with a read verb on `SKILL.md`. Sessions with cwd `~/.claude` excluded (repo maintenance, not use). |
| Codex | machine-a | 2026-09-02 → 2026-09-17 | 10 rollout files | Same, no maintenance filter. |
| omp | Forty-Two | 2026-03-08 → 2026-09-16 | 185 sessions + 1027 subagent logs | Skill "use" = `read skill://name`. Subagent reads counted. |
| omp | machine-a | 2026-06 → 2026-09 | 55 sessions + 96 subagent logs | Same. |

omp read counts are inflated relative to Claude: `skills-using` is read at every omp session and subagent start (1043 reads), and it instructs the model to read more skills. Treat omp numbers as "loaded", Claude numbers as "asked for".

## Activity overview

Sessions per month, both machines:

| Month | Claude (MCP census) | omp | Codex |
|---|---:|---:|---:|
| 2026-02 | 0 | 0 | 3 |
| 2026-03 | 70 | 29 | 9 |
| 2026-04 | 0 | 10 | 0 |
| 2026-05 | 3 | 8 | 0 |
| 2026-06 | 201 | 64 | 0 |
| 2026-07 | 144 | 37 | 5 |
| 2026-08 | 16 | 55 | 24 |
| 2026-09 | 133 | 37 | 59 |

Claude prompts typed (`history.jsonl`): Forty-Two Jun 305 / Jul 553 / Aug 0 / Sep 359; machine-a May 80 / Jun 596 / Jul 178 / Aug 0 / Sep 29. August was omp + Codex on both machines.

Claude tool mix, Forty-Two (Aug 18 – Sep 17): Bash 2895, Edit 213, Write 201, Agent 200, Read 151, SendMessage 115, claude-in-chrome 238 (computer 99, javascript 77, navigate 45, console 17), ToolSearch 71, WebFetch 61, AskUserQuestion 44, Skill **19**.

omp tool mix, Forty-Two (all sessions incl. subagents): read 32 431, bash 8408, grep 8145, hub 5284, edit 5124, todo 2040, eval 1729, write 1643, glob 1497, task 762, web_search 455.

User-typed slash commands in Claude, Forty-Two: `/clear` 66, `/model` 26, `/effort` 11, `/rate-limit-options` 10, `/goal` 10, `/workflows` 9, `/remote-control` 7, `/compact` 7, `/btw` 5, `/meaningful-commits` 3, `/pr-description` 3, `/skills-creating` 2, `/value-realization` 2, `/structuring-feature-modules` 1, `/skills-using` 1. machine-a: `/pr-description` 5, `/caveman` 3, `/modern-web-guidance` 2, `/angular-developer` 2.

## Agents — full table (29 custom agents in `~/.claude/agents`)

| Agent | Claude | omp | Codex | Total | KB | Added |
|---|---:|---:|---:|---:|---:|---:|
| executor | 128 | 269 | 0 | 397 | 4.8 | 2026-05-11 |
| code-reviewer | 1 | 190 | 0 | 191 | 5.5 | 2026-01-20 |
| deep-executor | 110 | 53 | 0 | 163 | 6.3 | 2026-05-11 |
| test-engineer | 1 | 62 | 0 | 63 | 5.6 | 2026-05-11 |
| quality-reviewer | 2 | 50 | 0 | 52 | 5.6 | 2026-05-11 |
| explore | 0 | 35 | 0 | 35 | 6.6 | 2026-05-11 |
| architect | 7 | 19 | 0 | 26 | 6.4 | 2026-05-11 |
| build-fixer | 0 | 20 | 0 | 20 | 4.4 | 2026-05-11 |
| git-master | 0 | 19 | 0 | 19 | 4.4 | 2026-05-11 |
| writer | 5 | 11 | 0 | 16 | 3.8 | 2026-05-11 |
| security-reviewer | 0 | 9 | 0 | 9 | 6.2 | 2026-05-11 |
| critic | 2 | 6 | 0 | 8 | 5.0 | 2026-05-11 |
| performance-reviewer | 0 | 6 | 0 | 6 | 5.2 | 2026-05-11 |
| verifier | 0 | 6 | 0 | 6 | 5.1 | 2026-05-11 |
| debugger | 0 | 5 | 0 | 5 | 5.3 | 2026-05-11 |
| designer | 1 | 4 | 0 | 5 | 8.2 | 2026-05-11 |
| api-reviewer | 0 | 2 | 0 | 2 | 5.0 | 2026-05-11 |
| external-researcher | 2 | 0 | 0 | 2 | 8.6 | 2026-06-17 |
| information-architect | 0 | 2 | 0 | 2 | 12.7 | 2026-05-11 |
| qa-tester | 0 | 2 | 0 | 2 | 5.4 | 2026-05-11 |
| scientist | 0 | 2 | 0 | 2 | 5.6 | 2026-05-11 |
| analyst | 0 | 1 | 0 | 1 | 5.3 | 2026-05-11 |
| style-reviewer | 0 | 1 | 0 | 1 | 4.3 | 2026-05-11 |
| ux-researcher | 0 | 1 | 0 | 1 | 13.1 | 2026-05-11 |
| planner | 0 | 0 | 0 | 0 | 7.4 | 2026-05-11 |
| product-analyst | 0 | 0 | 0 | 0 | 14.8 | 2026-05-11 |
| product-manager | 0 | 0 | 0 | 0 | 10.6 | 2026-05-11 |
| quality-strategist | 0 | 0 | 0 | 0 | 9.5 | 2026-05-11 |
| vision | 0 | 0 | 0 | 0 | 3.8 | 2026-05-11 |

Non-custom agents also spawned:

- Claude: `Explore` (built-in) 9, `fork` 3, `Plan` 1
- omp: unnamed 77, `scout` 71, `librarian` 53, generic `task` 36, `reviewer` 31, `document-specialist` 14, `sonic` 13, `Tester` 6, `code-simplifier` 2 (omp built-ins / ad-hoc)
- Codex: 4 ad-hoc subagents on machine-a (`boundary_review`, `edge_audit`, `tracker_audit`, `query_audit`). **0 custom agents on either machine.**

### Never spawned anywhere (5)

`planner`, `product-analyst`, `product-manager`, `quality-strategist`, `vision`

### Spawned ≤2 times in ~6 months (8)

`api-reviewer`, `external-researcher`, `information-architect`, `qa-tester`, `scientist`, `analyst`, `style-reviewer`, `ux-researcher`

### Agent observations

- Claude: `executor` 128 + `deep-executor` 110 = 92% of 259 Claude custom spawns. Matches CLAUDE.md "delegate code edits". Everything else in the roster is effectively omp-only.
- omp: full roster in play. `code-reviewer` 190 and `test-engineer` 62 likely come from omp's `code-review` / `test-driven-development` skills pointing at them (inferred, not traced).
- Codex: ignores the roster on both machines. On Windows `~/.codex/agents` is empty (0 files).
- Product suite (`product-manager`, `product-analyst`, `ux-researcher`, `information-architect`, `quality-strategist`) = 61 KB of agent definitions, **3 spawns total** in 6 months.
- Reviewer panel (`style` 1, `api` 2, `security` 9, `performance` 6) = 18 spawns vs `code-reviewer` + `quality-reviewer` 243. First report said "fold the panel into code-reviewer"; the Windows omp data shows `security-reviewer` does get used. Keep it, drop `style` and `api`.
- First report claimed skills win over their agent mirrors (`build-fix` skill vs `build-fixer` agent). Windows omp data reverses it: `build-fixer` 20 spawns, `git-master` agent 19. Both shapes are used. No action.
- `planner` / `critic`: `critic` 8, `planner` 0. `/plan` skill (40) + built-in `Plan` do planning.

### Agent copy drift (Forty-Two, 2026-09-17)

| Path | Files | Differ from `~/.claude/agents` |
|---|---:|---|
| `~/.claude/agents` (source of truth) | 29 | – |
| `~/.codex/agents` | **0** | dir exists, empty |
| `~/.omp/agent/agents` | 27 | all 27; missing `external-researcher`, `vision` |
| `~/.claude/.omp/agent/agents` | 27 | all 27 (in repo) |
| `~/.claude/.omp/agent-anthropic/agents` | 27 | all 27 (in repo) |
| `~/.claude/.omp/agent-openai/agents` | 27 | all 27 (in repo) |

machine-a (first report): `~/.codex/agents` 29 files, 26 differ; omp copies same as above. Diff content not inspected line-by-line (inferred: frontmatter/model fields).

## Skills — full table (82 local skills in `~/.claude/skills`)

| Skill | Claude lifetime | Claude last used | omp reads | Codex reads | Total | Added |
|---|---:|---:|---:|---:|---:|---:|
| skills-using | 26 | 2026-07-06 | 1043 | 4 | 1073 | 2026-02-11 |
| test-driven-development | 2 | 2026-04-09 | 448 | 4 | 454 | 2026-01-20 |
| artification | 18 | 2026-09-17 | 357 | 0 | 375 | 2026-09-08 |
| systematic-debugging | 3 | 2026-09-08 | 245 | 1 | 249 | 2026-01-20 |
| code-review | 1 | 2026-07-06 | 241 | 0 | 242 | 2026-06-16 |
| verification-before-completion | 0 |  | 207 | 5 | 212 | 2026-01-20 |
| analyze | 0 |  | 197 | 10 | 207 | 2026-06-16 |
| external-context | 0 |  | 159 | 1 | 160 | 2026-06-16 |
| code-review-requesting | 1 | 2026-06-23 | 136 | 0 | 137 | 2026-02-11 |
| caveman | 53 | 2026-06-13 | 79 | 2 | 134 | 2026-04-28 |
| brainstorming | 8 | 2026-07-14 | 115 | 0 | 123 | 2026-01-20 |
| ponytail | 0 |  | 64 | 1 | 65 | 2026-06-15 |
| angular-developer | 4 | 2026-07-11 | 58 | 0 | 62 | 2026-05-29 |
| git-master | 0 |  | 62 | 0 | 62 | 2026-06-16 |
| plans-writing | 1 | 2026-06-10 | 57 | 1 | 59 | 2026-02-11 |
| humanizer | 43 | 2026-07-10 | 14 | 0 | 57 | 2026-02-16 |
| rdx-audit | 7 | 2026-09-17 | 37 | 1 | 45 | 2026-07-12 |
| code-review-receiving | 3 | 2026-06-13 | 37 | 2 | 42 | 2026-02-11 |
| plan | 2 | 2026-07-08 | 37 | 1 | 40 | 2026-06-16 |
| build-fix | 0 |  | 39 | 0 | 39 | 2026-06-16 |
| plans-executing | 0 |  | 36 | 2 | 38 | 2026-02-11 |
| kaizen | 2 | 2026-04-17 | 35 | 0 | 37 | 2026-01-20 |
| dispatching-parallel-agents | 0 |  | 32 | 0 | 32 | 2026-01-20 |
| pr-description | 25 | 2026-07-10 | 5 | 0 | 30 | 2026-02-17 |
| ultrawork | 22 | 2026-04-08 | 8 | 0 | 30 | 2026-06-16 |
| deepsearch | 0 |  | 29 | 0 | 29 | 2026-06-16 |
| subagent-driven-development | 1 | 2026-07-08 | 27 | 0 | 28 | 2026-01-20 |
| structuring-feature-modules | 3 | 2026-07-01 | 24 | 0 | 27 | 2026-06-30 |
| security-review | 0 |  | 26 | 0 | 26 | 2026-06-16 |
| meaningful-commits | 17 | 2026-09-17 | 5 | 0 | 22 | 2026-03-07 |
| using-git-worktrees | 1 | 2026-06-12 | 21 | 0 | 22 | 2026-01-20 |
| modern-web-guidance | 5 | 2026-06-12 | 16 | 0 | 21 | 2026-05-29 |
| skills-creating | 4 | 2026-07-12 | 13 | 0 | 17 | 2026-03-12 |
| note | 0 |  | 15 | 0 | 15 | 2026-06-16 |
| pnpm-best-practices | 1 | 2026-06-19 | 14 | 0 | 15 | 2026-05-20 |
| autopilot | 0 |  | 13 | 0 | 13 | 2026-06-16 |
| deglaze | 0 |  | 12 | 0 | 12 | 2026-06-15 |
| finishing-a-development-branch | 0 |  | 12 | 0 | 12 | 2026-02-11 |
| rdx-review | 0 |  | 11 | 0 | 11 | 2026-07-12 |
| flow | 0 |  | 9 | 0 | 9 | 2026-06-17 |
| using-agentic-mcp | 0 |  | 8 | 0 | 8 | 2026-03-07 |
| ralph | 0 |  | 7 | 0 | 7 | 2026-06-16 |
| frontend-design | 1 | 2026-09-08 | 5 | 0 | 6 | 2026-01-30 |
| rdx | 0 |  | 6 | 0 | 6 | 2026-07-12 |
| research | 0 |  | 5 | 1 | 6 | 2026-06-16 |
| deflaky | 1 | 2026-07-08 | 4 | 0 | 5 | 2026-05-08 |
| frontend-ui-ux | 0 |  | 5 | 0 | 5 | 2026-06-16 |
| prompt-engineer | 0 |  | 5 | 0 | 5 | 2026-01-20 |
| value-realization | 4 | 2026-09-11 | 1 | 0 | 5 | 2026-02-23 |
| nx-workspace-scafold | 0 |  | 4 | 0 | 4 | 2026-09-16 |
| skill | 0 |  | 4 | 0 | 4 | 2026-06-16 |
| team | 0 |  | 4 | 0 | 4 | 2026-06-16 |
| triage | 0 |  | 3 | 0 | 3 | 2026-06-17 |
| ultrapilot | 0 |  | 3 | 0 | 3 | 2026-06-16 |
| wrap-up | 1 | 2026-04-29 | 2 | 0 | 3 | 2026-02-23 |
| angular-new-app | 1 | 2026-07-11 | 1 | 0 | 2 | 2026-05-29 |
| chrome-extensions | 1 | 2026-06-08 | 1 | 0 | 2 | 2026-06-05 |
| learner | 0 |  | 2 | 0 | 2 | 2026-06-16 |
| nextjs-best-practices | 0 |  | 2 | 0 | 2 | 2026-02-11 |
| pipeline | 0 |  | 2 | 0 | 2 | 2026-06-16 |
| prototype | 0 |  | 2 | 0 | 2 | 2026-06-17 |
| deepinit | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| project-session-manager | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| psm | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| ralph-init | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| ralplan | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| rdx-help | 0 |  | 1 | 0 | 1 | 2026-07-12 |
| review | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| setup-engineering-skills | 0 |  | 1 | 0 | 1 | 2026-06-17 |
| trace | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| ultraqa | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| upgrade-dotnet | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| writer-memory | 0 |  | 1 | 0 | 1 | 2026-06-16 |
| grill-with-docs | 0 |  | 0 | 0 | 0 | 2026-06-17 |
| source-command-clean-claude | 0 |  | 0 | 0 | 0 | 2026-09-16 |
| source-command-delete-nul | 0 |  | 0 | 0 | 0 | 2026-09-16 |
| source-command-review-claude | 0 |  | 0 | 0 | 0 | 2026-09-16 |
| source-command-skillopt-run | 0 |  | 0 | 0 | 0 | 2026-09-16 |
| source-command-start-mcp-proxy | 0 |  | 0 | 0 | 0 | 2026-09-16 |
| source-command-start-pytaiga-mcp | 0 |  | 0 | 0 | 0 | 2026-09-16 |
| to-issues | 0 |  | 0 | 0 | 0 | 2026-06-17 |
| zoom-out | 0 |  | 0 | 0 | 0 | 2026-06-17 |

Built-in / plugin skills called via Skill tool on Forty-Two: `claude-in-chrome` 2, `artifact-design` 1, `dataviz` 1, `start-mcp-proxy` 1, `update-config` 1. machine-a: `update-config` 1, `claude-hud:setup` 1, `keybindings-help` 2, `simplify` 1. Codex-only skill on machine-a: `loop-video` 1.

### Never used anywhere (9)

`grill-with-docs`, `to-issues`, `zoom-out` (added 2026-06-17, 3 months of data) and `source-command-*` ×6 (added 2026-09-16, **1 day** — not a signal).

### Read once or twice in ~6 months (18)

`angular-new-app`, `chrome-extensions`, `learner`, `nextjs-best-practices`, `pipeline`, `prototype`, `deepinit`, `project-session-manager`, `psm`, `ralph-init`, `ralplan`, `rdx-help`, `review`, `setup-engineering-skills`, `trace`, `ultraqa`, `upgrade-dotnet`, `writer-memory`

A single omp read is usually the model peeking at a skill after `skills-using` told it to — not a real invocation. Treat ≤2 as noise-level.

### Redundant clusters

1. **Exact duplicates / aliases**
   - `psm` = `project-session-manager`. 1 + 1.
   - `ralplan` = `/plan --consensus`; `review` = `/plan --review`. 1 + 1.
   - `source-command-*` (6) = `~/.claude/commands/*.md`. 0. Same content loaded twice.
   - `humanizer` = `anthropic-skills:avoid-ai-writing` (synced). `humanizer` 57 — keep; ignore synced.
   - `rdx-help` 1 — help text for a mode read 6 times.

2. **Orchestration pile** (12 skills, one job: fan out agents)
   `dispatching-parallel-agents` 32, `ultrawork` 30 (all before May), `subagent-driven-development` 28, `autopilot` 13, `flow` 9, `ralph` 7, `research` 6, `team` 4, `ultrapilot` 3, `pipeline` 2, `ralph-init` 1, `ultraqa` 1.
   You spawn agents directly (200 Agent calls in one month on Forty-Two, 762 omp `task` calls). Only `dispatching-parallel-agents` and `subagent-driven-development` get steady omp reads.

3. **Minimalism pile**
   `rdx-audit` 45, `kaizen` 37, `rdx-review` 11, `rdx` 6, `rdx-help` 1, `ponytail` 65 (auto-loaded), `simplify` (built-in) 1. `kaizen` is more used than first report saw.

4. **Review pile**
   `code-review` 242, `code-review-requesting` 137, `code-review-receiving` 42, `security-review` 26, `rdx-review` 11, built-in `/code-review`, plus 6 reviewer agents. All three `code-review*` skills carry weight in omp.

5. **Frontend pile**
   `angular-developer` 62, `modern-web-guidance` 21, `frontend-design` 6, `frontend-ui-ux` 5, `angular-new-app` 2, `designer` agent 5.

6. **Skill management pile**
   `skills-creating` 17, `skill` 4, `learner` 2, `anthropic-skills:skill-creator` (synced).

7. **Skill ↔ agent mirrors** (same job, two shapes — both shapes used in omp)
   `build-fix` 39 ↔ `build-fixer` 20, `git-master` 62 ↔ `git-master` 19, `systematic-debugging` 249 ↔ `debugger` 5, `verification-before-completion` 212 ↔ `verifier` 6, `external-context` 160 ↔ `external-researcher` 2, `deepsearch` 29 ↔ `explore` 35, `deglaze` 12 ↔ `verifier` 6.

8. **Planning pile**
   `plan` 40, `plans-writing` 59, `plans-executing` 38, `brainstorming` 123, `grill-with-docs` 0, `ralph-init` 1, `ralplan` 1, `review` 1, plus built-in `Plan` 1, `planner` agent 0, `critic` agent 8.

### Skill copy drift (Forty-Two)

- `~/.agents/skills` → junction to `~/.claude/skills`. Codex on Windows reads skills through it. Good — no copy.
- `~/.codex/skills` → only `.system/` + a stale `nx-workspace-scafold`. Dead dir.
- `~/.omp/agent/skills` → missing (omp reads `skill://` from `~/.claude/skills`).
- No `skills.backup.*` on this machine or in git. The 3.3 MB backup in the first report is machine-a local.

machine-a (first report): `~/.codex/skills` near-copy of `~/.claude/skills`, `ponytail` + `test-driven-development` differ, Codex-only `loop-video`.

## MCP servers (Claude, both machines, Mar–Sep)

| Server | Sessions started in | Sessions with ≥1 call | Calls | Top tools |
|---|---:|---:|---:|---|
| ide | 273 | 237 | 21240 | getDiagnostics 19812, closeAllDiffTabs 1277, close_tab 101, openDiff 50 |
| playwright | 156 | 15 | 242 | browser_evaluate 100, browser_navigate 57, press_key 30, screenshot 20 |
| github | 232 | 10 | 20 | search_code 10, get_issue 7, create_issue 1, get_file_contents 1, get_pull_request 1 |
| plugin-oh-my-claudecode-t | 78 | 6 | 12 | state_clear 6, state_list_active 3, lsp_diagnostics 2, state_write 1 |
| exa | 232 | 2 | 11 | web_fetch_exa 11 |
| context7 | 388 | 4 | 11 | query-docs 7, resolve-library-id 4 |
| t3-code | 14 | 7 | 9 | link_pull_request 9 |
| angular-cli | 388 | 2 | 3 | devserver.start 2, search_documentation 1 |
| agentic-mcp | 301 | 0 | 0 | – |
| filesystem | 168 | 0 | 0 | – |
| chrome-devtools | 156 | 0 | 0 | – |
| claude-ai-Gmail | 142 | 0 | 0 | – |
| claude-ai-Google-Calendar | 142 | 0 | 0 | – |
| claude-ai-Figma | 141 | 0 | 0 | – |
| claude-ai-Google-Drive | 83 | 0 | 0 | – |
| plugin-oh-my-claudecode-team | 63 | 0 | 0 | – |
| claude-in-chrome | 41 | 0 | 0 | – |
| claude-ai-Claude-Docs | 18 | 0 | 0 | – |
| mempalace | 17 | 0 | 0 | – |
| claude-ai-Claude-Code-Remote | 10 | 0 | 0 | – |
| claude-vscode | 4 | 0 | 0 | – |

- `claude-in-chrome` shows 0 in MCP debug logs but 238 tool calls in transcripts (Forty-Two). The extension bypasses the `Calling MCP tool:` log line — it is used, keep it. Same caveat may apply to any server; transcripts on Forty-Two show no other `mcp__*` tool with >0 calls.
- `agentic-mcp` (301 boots, 0 calls) + `using-agentic-mcp` skill (8 reads, 0 Claude uses) — drop both together. Also failed to connect in this session.
- `chrome-devtools` duplicates `playwright` (used) and `claude-in-chrome` (used). Drop.
- `filesystem` (168 boots, 0 calls) — Claude has native file tools. Drop.
- `github` 20 calls in 232 sessions; `exa` 11; `context7` 11; `angular-cli` 3. Marginal. Each adds tool schemas to every prompt. Keep only if you want them for the rare case; consider lazy MCP via ToolSearch instead.
- claude.ai connectors (Figma/Gmail/Calendar/Drive): unauthenticated, 0 calls. Disconnect or authorize.

## Age and dependency gate

Two checks before anything is archived. Both from git and grep, not from usage.

**Age.** `Added` = first commit of the file (with `--follow`). All 29 agents date from 2026-05-11 or earlier (`external-researcher` 2026-06-17). Every low-use skill is ≥67 days old except:

| Skill | Added | Age | Note |
|---|---|---:|---|
| `source-command-*` ×6 | 2026-09-16 | 1 day | Migrated copies of `commands/*.md`. Zero use expected. Judge after the `commands/` → skills migration settles. |
| `nx-workspace-scafold` | 2026-09-16 | 1 day | 4 omp reads already. Keep. |
| `artification` | 2026-09-08 | 9 days | 375 reads. Keep. |

omp data on Forty-Two starts 2026-03, so a skill added in June has ~3 months of observation. `rdx-help` (2026-07-12, 67 days, 1 read) is the youngest cut candidate.

**Dependencies.** grep for `/name`, `` `name` `` and `skill:name` across CLAUDE.md, AGENTS.md, settings.json, all skills, agents, hooks and commands (plain-word hits like "review" or "trace" excluded). Cut candidates that something else points at:

| Candidate | Referenced by |
|---|---|
| `planner` agent | CLAUDE.md ×3, `plan`, `pipeline`, `team` skills, `product-manager` agent |
| `analyst` agent | CLAUDE.md ×4, `team` skill, `product-analyst`, `product-manager` agents |
| `product-manager` agent | CLAUDE.md ×2, `prompt-engineer`, `team` skills, 4 product-suite agents |
| `product-analyst`, `ux-researcher`, `information-architect` agents | CLAUDE.md ×2 each, each other |
| `style-reviewer`, `api-reviewer` agents | CLAUDE.md ×2 each |
| `scientist` agent | `research` skill ×3, `product-analyst` agent |
| `qa-tester` agent | `pipeline` skill, `quality-strategist` agent |
| `review` skill alias | CLAUDE.md, `plan`, `project-session-manager`, `team` skills |
| `ralplan` skill alias | `plan` skill |
| `rdx` skill | CLAUDE.md, `rdx-help` |
| `psm` alias | `project-session-manager` ×11 (and vice versa) |
| `to-issues`, `zoom-out`, `ralph-init`, `grill-with-docs` | `setup-engineering-skills` (itself 1 read) and `triage` |
| `pipeline` skill | `code-review`, `security-review` skills |
| `team`, `ultrapilot`, `ultraqa`, `project-session-manager` | `flow` skill (+ each other) |
| `learner`, `deepinit` | `skill` skill |

No references anywhere: `quality-strategist`, `vision`, `rdx-help`, `upgrade-dotnet`, `writer-memory`, `chrome-extensions`, `nextjs-best-practices`, `angular-new-app`, `trace`, `prototype`. These are the only cuts that need no follow-up edit.

Everything else on the cut list needs the referencing file edited in the same change, or the reference becomes a dangling `/name`. CLAUDE.md is the big one: the "Team Compositions" and "Picking between overlapping agents" sections name 8 of the 11 agent cuts.

## Recommendations

Revised against the merged data plus the age and dependency gate above. Cuts are smaller than the first report proposed because omp on Windows uses most of the roster. Nothing younger than 67 days is on a cut list.

### Delete now — 0 use, pure alias or duplicate

- Skills with no references: `rdx-help`, `zoom-out`*, `to-issues`*, `grill-with-docs`*  (*referenced only by `setup-engineering-skills` / `triage`, both ≤3 reads — cut those references too)
- Aliases (edit the referencing skill first): `psm` (`project-session-manager`), `ralplan` + `review` (`plan`, CLAUDE.md)
- Not `source-command-*`: 1 day old. Revisit once `commands/` migration is done — if both copies stay, one is redundant.
- Dirs: `.omp/agent/`, `.omp/agent-anthropic/`, `.omp/agent-openai/` inside `~/.claude` (3 stale agent copies in the repo); `~/.codex/skills` on Windows (dead, Codex uses the `~/.agents/skills` junction)

### Delete unless you plan to use — ≤2 uses in 3–7 months, domain-specific or superseded

No references: `upgrade-dotnet`, `writer-memory`, `chrome-extensions`, `nextjs-best-practices`, `angular-new-app`, `trace`, `prototype`.
Referenced (edit referrer): `setup-engineering-skills`, `learner`, `deepinit` (← `skill`), `ultraqa` (← `flow`), `ralph-init` (← `setup-engineering-skills`), `pipeline` (← `code-review`, `security-review`), `project-session-manager` (← `flow`).

### Collapse orchestration → keep 4

Keep `dispatching-parallel-agents`, `subagent-driven-development`, `autopilot`, `flow`. Drop `team`, `ultrapilot`, `ultraqa`, `pipeline`, `ralph-init`. `ultrawork` (22 Claude uses, none since April) and `ralph` (7 omp reads) — your call.

### Minimalism → keep 3

Keep `ponytail` (auto-loaded), `rdx-audit`, `kaizen`. Drop `rdx`, `rdx-help`. `rdx-review` (11 omp reads) is borderline — CLAUDE.md names it as the merge gate, so keep it if that rule stays. Update CLAUDE.md RDX section if `rdx` goes.

### Collapse agents 29 → 18

Drop (0–2 spawns, 6 months, both machines): `planner`, `product-analyst`, `product-manager`, `quality-strategist`, `vision`, `ux-researcher`, `information-architect`, `style-reviewer`, `api-reviewer`, `analyst`, `scientist`. That is 92 KB of agent definitions for 9 spawns total.

Keep: `executor`, `deep-executor`, `code-reviewer`, `test-engineer`, `quality-reviewer`, `explore`, `architect`, `build-fixer`, `git-master`, `writer`, `security-reviewer`, `critic`, `performance-reviewer`, `verifier`, `debugger`, `designer`, `external-researcher`, `qa-tester`.

`external-researcher` (2) and `qa-tester` (2) are kept only because they have no skill equivalent in Claude; `external-context` skill covers the first in omp.

Same change must edit CLAUDE.md "Team Compositions" and "Picking between overlapping agents" (they name `analyst`, `planner`, `product-manager`, `ux-researcher`, `product-analyst`, `information-architect`, `style-reviewer`, `api-reviewer`), plus `plan`, `pipeline`, `team`, `research`, `prompt-engineer` skills and the surviving agents that mention cut ones (see gate table).

### Fix drift — one source of truth

- `~/.claude/agents` and `~/.claude/skills` = source.
- Windows already links skills (`~/.agents/skills` junction). Do the same for agents: `~/.codex/agents` (empty) and `~/.omp/agent/agents` (27 stale files) → link to `~/.claude/agents`.
- machine-a: link `~/.codex/agents`, `~/.codex/skills`, `~/.omp/agent/agents` the same way; move `loop-video` into `~/.claude/skills` first; reconcile `ponytail` and `test-driven-development` diffs.
- Delete the three `.omp/*/agents` copies from the repo.

### Measurement fix

- `clean-claude` wipes transcripts → Claude agent stats cover 90 of ~400 sessions on Forty-Two, 16 of 189 on machine-a. Run `scripts/usage-audit.py` before each cleanup; it writes a per-machine JSON into `reports/data/` which syncs with the repo.
- Run the script on machine-a to replace the reconstructed `usage-audit-machine-a.json` with real data (it will be named after that machine's hostname; delete the `machine-a` file after).

## Reproduce

```
python scripts/usage-audit.py            # collect this machine -> reports/data/usage-audit-<hostname>.json, then print merged tables
python scripts/usage-audit.py --tables   # merge every reports/data/usage-audit-*.json and print the tables above
```

Cross-platform (Windows `AppData/Local` and Linux/Mac `~/.cache` MCP log paths, backslash-safe skill path regex, UTF-8 reads). `Added` column = first git commit of the file. Tables in this report are pasted from `--tables` output. The dependency grep is a one-off (pattern `[/`:]name` over CLAUDE.md, AGENTS.md, settings.json, skills, agents, hooks, commands).

## Confirmed vs inferred

- Confirmed: every Forty-Two count (script run 2026-09-17 against live data on this machine); machine-a counts as printed in the first report; `Added` dates from `git log --follow`; dependency table from grep over the repo on 2026-09-17.
- Inferred: machine-a's platform (Linux or Mac — its report used `~/.cache/claude-cli-nodejs` and `~/.local/state/codex`); agent-copy diffs are frontmatter-only; omp read counts overstate deliberate use (skills-using auto-read mechanism confirmed, magnitude of inflation not measured).
- Not checked: whether omp `librarian`/`scout`/`reviewer`/`sonic` built-ins overlap with `explore`/`external-researcher`/`code-reviewer` in behavior; whether Claude's Aug gap on both machines was rate limits or a deliberate switch (`/rate-limit-options` typed 10 times suggests limits).
