# Copilot Agent Roster

A multi-agent orchestration system for **VS Code GitHub Copilot** (custom `.agent.md` agents). One conductor (`orchestrator`) coordinates a roster of focused, single-responsibility subagents across the full development lifecycle: **Plan → Implement → Review → Commit**.

> Origin: rebuilt from [bigguy345/Github-Copilot-Atlas](https://github.com/bigguy345/Github-Copilot-Atlas) (itself based on [copilot-orchestra](https://github.com/ShepAlderson/copilot-orchestra)), with the role taxonomy and prompt structure of [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) folded in, and every agent infused with this repo's engineering laws (see **Operating Laws** below).

---

## What changed vs the original Atlas set

- **Plain role names** instead of mythological codenames (`orchestrator`, `planner`, `executor`, … ) — clear at the point of use.
- **Expanded roster:** 7 → 18 agents, adding the roles the original lacked (analyst, architect, critic, debugger, refactorer, test-engineer, security-reviewer, git-master, tracer, technical-writer, scientist).
- **OMC prompt structure** in every agent: a memorable **Core Principle**, **Task Classification**, **Success Criteria**, **Failure Prevention** anti-patterns, explicit **Handoffs**, and evidence-based output.
- **Operating Laws** (this repo's standards) baked into every agent: Critical Honesty + 🟢🟡🔴 Narrate-Intent + right-sized/DRY-after-2 + evidence-over-assertion.
- **Latest models** via ordered fallback lists (`Claude Opus 4.8` → `Claude Opus 4.5` → `Sonnet 4.6` → `Auto`), so an agent always resolves to the best available model.
- **Correct VS Code frontmatter:** `name`, `tools` (namespaced groups), `model` (array), `agents` (delegation whitelist), `handoffs` with `send`.

---

## The Roster

| Agent | Role | Tier (model) | Edits? |
|---|---|---|---|
| **orchestrator** | Conductor — runs Plan→Implement→Review→Commit, delegates everything | Opus | via subagents |
| **planner** | Autonomous TDD planner; hands off to orchestrator | Opus | plans only |
| **analyst** | Pre-planning requirements validation → testable acceptance criteria | Opus | read-only |
| **architect** | System design & complex-refactor strategy (ADR-style options) | Opus | read-only |
| **critic** | Adversarial review of plans/designs *before* implementation | Opus | read-only |
| **researcher** | Deep subsystem analysis → high-signal structured findings | Sonnet | read-only |
| **explorer** | Fast parallel file/usage discovery | Haiku | read-only |
| **tracer** | Causal investigation — symptom → origin, link by link | Sonnet | read-only |
| **executor** | Strict-TDD implementer; smallest correct diff | Sonnet | ✅ |
| **frontend-engineer** | UI/UX, styling, responsive, accessible (component-test-first) | Gemini Pro | ✅ |
| **debugger** | Root-cause diagnosis & fix of failing builds/tests | Sonnet | ✅ |
| **refactorer** | Behavior-preserving simplification & de-duplication | Sonnet | ✅ |
| **test-engineer** | Comprehensive behavior-focused test suites (+ QA) | Sonnet | ✅ |
| **code-reviewer** | Correctness/quality/coverage verdict (APPROVED/NEEDS_REVISION/FAILED) | Opus | read-only |
| **security-reviewer** | Vulnerability & auth/secret/crypto audit | Opus | read-only |
| **git-master** | Atomic commits, branches, PRs; history as documentation | Sonnet | git only |
| **technical-writer** | Docs/READMEs/API refs grounded in real code | Gemini Pro | docs only |
| **scientist** | Data/ML, hypothesis-driven reproducible experiments | Opus | ✅ |

Models are **fallback lists** — e.g. `['Claude Opus 4.8 (copilot)', 'Claude Opus 4.5 (copilot)', 'Claude Sonnet 4.6 (copilot)', 'Auto (copilot)']`. VS Code tries each in order, so the agent works regardless of which models your Copilot plan exposes.

---

## Operating Laws (in every agent)

1. **Critical Honesty (LAW)** — skeptical, brutally honest, not accommodating. Each agent runs a forcing function (`Strongest objection: …` / `Checked for objections, none found.`) before agreeing to anything non-trivial. Banned soft-openers.
2. **Narrate Intent (LAW)** — one 5–15 word line (*what* + *why*) before each non-trivial action, prefixed 🟢 reversible · 🟡 recoverable state change · 🔴 destructive/outward-facing.
3. **Right-sized & explicit** — DRY after the 2nd repeat, no over-abstraction, explicit over clever.
4. **Evidence over assertion** — never claim done without fresh build/test output and `file:line` citations.

---

## Installation

These are **VS Code custom agents** (`.agent.md`). Install at the **user level** (available in every workspace) or per-workspace.

**Workspace:** copy the `*.agent.md` files into `.github/agents/` at your repo root.

**User level:** point VS Code at this folder via `settings.json`:
```json
{
  "chat.agentFilesLocations": ["<absolute path to this folder — e.g. ~/.claude/copilot or C:\\Users\\<user>\\.claude\\copilot>"],
  "chat.customAgentInSubagent.enabled": true
}
```
Then reload VS Code. Verify the agents appear in the Agent-mode dropdown.

> **Deploy the whole set together.** Each agent's `agents:` whitelist and `handoffs:` reference sibling agents by name. Until all files are installed in the same agents directory, VS Code shows benign *"Unknown agent 'x' will be ignored"* warnings — these clear once the roster is fully installed.

---

## Usage

**Full lifecycle (recommended for features):**
```
@planner add OAuth login with refresh tokens
```
`planner` researches (via `explorer`/`researcher`), optionally consults `analyst`/`critic`, writes a TDD plan to `plans/`, then offers a handoff button → **Start implementation with the orchestrator**. The `orchestrator` then loops per phase: `executor`/`frontend-engineer` → `code-reviewer` (+`security-reviewer`) → commit gate (you approve) → next phase.

**Direct single-agent calls:**
```
@architect how should we structure the offline sync layer?
@explorer find everything involved in session handling
@tracer why is user.role undefined by the time the guard runs?
@debugger the checkout test fails intermittently in CI
@security-reviewer audit the new file-upload endpoint
@refactorer simplify the order-service module
```

**Delegation graph** (who can call whom):
- `orchestrator` → everyone.
- `planner` → analyst, explorer, researcher, tracer (research only — never implementation agents).
- `architect`/`critic`/`researcher`/`analyst`/`tracer`/`security-reviewer` → explorer (+ researcher).
- implementation agents (`executor`, `debugger`, `frontend-engineer`, `test-engineer`, `scientist`) → explorer/researcher for read-only discovery.

---

## Plan Directory

Agents look for a plan directory in this order:
1. A spec in the workspace `AGENTS.md` (e.g. `.sisyphus/plans`).
2. Default: `plans/`.

---

## Adding / editing an agent

Each file is a standalone `.agent.md`:
```yaml
---
name: your-agent
description: 'One line — what it does and when to use it.'
argument-hint: 'What to pass it'
tools: ['search', 'read', 'web', 'edit', 'agent']   # namespaced groups; 'agent' enables delegation
agents: ['explorer']                                  # delegation whitelist (requires 'agent' tool); omit for none
model: ['Claude Opus 4.8 (copilot)', 'Claude Opus 4.5 (copilot)', 'Claude Sonnet 4.6 (copilot)', 'Auto (copilot)']
---
You are the YOUR-AGENT — …

## Core Principle
> "<memorable one-liner>"

## Operating Laws (apply to every action)
1. Critical Honesty …  2. Narrate Intent 🟢🟡🔴 …  3. Right-sized …  4. Evidence over assertion …

## Scope / Task Classification / Workflow / Success Criteria / Failure Prevention / Handoffs / Output Format
```
Keep it single-responsibility, give it a sharp Core Principle, and wire its Handoffs to the rest of the roster.

## License
MIT — see original [Github-Copilot-Atlas](https://github.com/bigguy345/Github-Copilot-Atlas).
