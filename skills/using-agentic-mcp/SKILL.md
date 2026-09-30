---
name: using-agentic-mcp
description: Command and flag reference for agentic-mcp, which routes prompts to external model CLIs (claude, codex, gemini, copilot, opencode). Use when getting an answer from an external model, comparing providers on one prompt, resuming a provider session, or reviewing provider metrics.
---

# Using agentic-mcp

**Availability:** the `mcp__agentic-mcp__*` tools exist only while the MCP proxy runs (`/start-mcp-proxy`); they may also be deferred, so load them with ToolSearch first. Without them, run any command below as `npx agentic-mcp <command>` in Bash.

Not for general skill authoring (`skills-creating`) or other MCP servers.

## Commands

| Need | MCP tool | CLI | Use when |
| --- | --- | --- | --- |
| One provider answers a task | `ask_<provider>` | `agentic-mcp ask_<provider> "..."` | Default path |
| Compare providers on one prompt | `ask_all` | `agentic-mcp ask_all "..." --providers claude,gemini` | Comparison is the goal |
| See detected providers | `list_providers` | `agentic-mcp list_providers` | An ask fails, or you don't know what's installed |
| Quick liveness check | `ping_<provider>` | `agentic-mcp ping_<provider>` | Diagnosing a failing provider; not proof of a real answer |
| Provider flags, models, behavior | `help_<provider>` | `agentic-mcp help_<provider>` | You need a flag or model not listed here |
| Continue multi-turn work | `sessions_<provider>`, then `ask_<provider>` with `session_id` | `agentic-mcp sessions_<provider>`, then `--session-id <id>` | Continuity matters |
| Usage, latency, success rate | `provider_metrics` | `agentic-mcp provider_metrics` | After a batch of runs or repeated failures |
| Install or update | - | `agentic-mcp init`, then `agentic-mcp setup --client claude-code --yes` | New machine or repo |

Providers: `claude`, `copilot`, `codex`, `gemini`, `opencode`.

Just ask. On an error, run `list_providers` (and `ping_<provider>`) to see what's wrong.

## ask_<provider> flags

- `--model <name>` when the user asks for a specific model
- `--file <path>` when the prompt refers to repository files
- `--context <text>` for extra steering or constraints
- `--stream-live` for live progress output
- `--session-id <id>` to continue a session
- `--async` for long requests, then `--job-id <id>` to fetch the result

```bash
npx agentic-mcp ask_claude "Review this implementation" --file src/cli/domain-logic/cli.router.ts
npx agentic-mcp ask_claude "Continue the earlier investigation" --session-id session-123
npx agentic-mcp ask_claude "Fix this bug" --async
npx agentic-mcp ask_claude --job-id job-123
```

## ask_all flags

- `--providers <list>` (comma- or space-separated) chooses the providers
- `--model <name>` sends one shared model hint to every selected provider. A provider that rejects it returns its error; there is no fallback model.
- `--context <text>` adds shared guidance

`--async` and `--session-id` belong to `ask_<provider>` only; `--providers` belongs to `ask_all` only. Other aliases: `help_<provider>`.

```bash
npx agentic-mcp ask_all "Compare bugfix approaches" --providers claude codex --context "Optimize for smallest safe diff"
```
