---
name: using-agentic-mcp
description: Use when getting a real answer from an external model via agentic-mcp, comparing multiple providers on the same prompt, resuming a multi-turn provider session, or reviewing agentic-mcp usage/latency/success metrics.
---

# Using agentic-mcp

## Overview

Use this skill when the goal is a working outcome: get a real answer from the provider already installed on the machine, compare multiple providers on one prompt, or configure one MCP client entry instead of wiring providers separately. Start by discovering providers, prove one provider works with `ask_<provider>`, then use `ask_all` only for deliberate comparison.

## When to Use

- Getting to a first successful provider answer through `agentic-mcp`
- Comparing multiple providers on the same prompt without bespoke glue
- Using one repeatable workflow for MCP tools and CLI fallback
- Resuming or inspecting multi-turn provider sessions
- Reviewing usage, latency, and success metrics

Do NOT use for: general skill authoring (`skills-writing`), non-agentic-mcp MCP servers.

## Command Selection

| Need | MCP tool | CLI command | When to use |
| --- | --- | --- | --- |
| Need to discover detected providers | `list_providers` | `agentic-mcp list_providers` | Before any provider-specific work |
| Need limited proof for one provider | `ping_<provider>` | `agentic-mcp ping_<provider>` | Before the first real ask, not as final proof |
| Need to inspect provider-specific capabilities | `help_<provider>` | `agentic-mcp help_<provider>` | Only when you need flags, models, or behavior details |
| Need one provider to answer a task | `ask_<provider>` | `agentic-mcp ask_<provider> "..."` | Default path for normal work and the first real proof |
| Need to compare providers on the same prompt | `ask_all` | `agentic-mcp ask_all "..." --providers claude,gemini` | Only when comparison itself is the goal |
| Need to resume or inspect multi-turn work | `sessions_<provider>` then `ask_<provider>` with `session_id` | `agentic-mcp sessions_<provider>` then `agentic-mcp ask_<provider> "..." --session-id <id>` | Continue existing context instead of starting over |
| Need usage and reliability metrics | `provider_metrics` | `agentic-mcp provider_metrics` | After runs, debugging, or performance review |
| Need to install or update the integration | setup CLI | `agentic-mcp init` or `agentic-mcp setup --client claude-code --yes` | New machine, fresh repo, or before choosing a client config |

Providers: `claude`, `copilot`, `codex`, `gemini`, `opencode`

## Discovery-First Workflow

1. **Load tools**: `ToolSearch("select:mcp__agentic-mcp__list_providers")` if the MCP tool surface is deferred.
2. **Discover**: `list_providers` to see which providers are detected.
3. **Check limited proof**: `ping_<provider>` for the provider you intend to use first.
4. **Understand**: `help_<provider>` only when you need supported models, flags, or behavior details.
5. **Prove real usage**: `ask_<provider>` for focused work, `ask_all` only for side-by-side comparison.
6. **Continue**: `sessions_<provider>` and `--session-id <id>` when you need multi-turn continuity.
7. **Review**: `provider_metrics` when you need latency, success, or usage data.

## Setup (New Environment)

```bash
npx agentic-mcp init
npx agentic-mcp setup --minimal
npx agentic-mcp setup --client claude-code --yes
```

Use `init` to install the skill first, then run the full client-specific setup command when you are ready to write MCP config.

Then verify in order: `list_providers` -> `ping_claude` -> `ask_claude "Reply with OK and your provider name."`

## ask_<provider> Command Guide

Use `ask_<provider>` when one provider should do the work.

Important flags and when to use them:

- `--model <name>` when the user asks for a specific model
- `--file <path>` when the prompt refers to repository files or artifacts
- `--context <text>` when extra steering or constraints are needed
- `--stream-live` when the user wants live progress output
- `--session-id <id>` when continuing an existing multi-turn session
- `--async` when the request may take a while and should return immediately
- `--job-id <id>` when checking the status or result of a prior async job

Examples:

```bash
npx agentic-mcp ask_claude "Review this implementation" --file src/cli/domain-logic/cli.router.ts
npx agentic-mcp ask_claude "Summarize the risks" --context "Focus on edge cases"
npx agentic-mcp ask_claude "Show progress while reasoning" --stream-live
npx agentic-mcp ask_claude "Continue the earlier investigation" --session-id session-123
npx agentic-mcp ask_claude "Fix this bug" --async
npx agentic-mcp ask_claude --job-id job-123
```

## ask_all Command Guide

Use `ask_all` only when the same prompt should be sent to multiple providers for comparison.

Important flags and when to use them:

- `--provider <list>` is an alias for `--providers`; use either form to choose providers
- `--providers <list>` limits the comparison set; values may be comma-separated or space-separated
- `--model <name>` passes one shared model hint to every selected provider
- `--models <name>` is an alias for `--model`
- Use `--providers` for provider selection and `--model` for the shared model hint
- If `--providers` and `--model` are combined, `--providers` chooses the providers and `--model` applies the shared model hint to those providers
- When a selected provider rejects the shared model as unavailable or unsupported, `ask_all` returns that provider error directly instead of falling back to a different model
- `--context <text>` adds shared guidance to the comparison prompt

Examples:

```bash
npx agentic-mcp ask_all "Explain this architecture" --providers claude,gemini
npx agentic-mcp ask_all "Compare bugfix approaches" --providers claude codex --context "Optimize for smallest safe diff"
npx agentic-mcp ask_all "Compare providers" --providers gemini codex
npx agentic-mcp ask_all "Use one shared model" --providers claude,gemini --model claude-sonnet-4
```

## Sessions and Metrics

- `sessions_<provider>` lists known sessions for a provider.
- `provider_metrics` shows which providers you actually used, how often they succeeded, and how long they took.
- Use sessions before starting a new thread if continuity matters.
- Use metrics after a batch of runs, during debugging, or when comparing provider behavior.

Examples:

```bash
npx agentic-mcp sessions_claude
npx agentic-mcp provider_metrics
```

## CLI Fallback

When MCP tools are unavailable, prefix any command above with `npx agentic-mcp` and run it directly in the shell (e.g. `npx agentic-mcp ask_claude "..."`).

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Calling `ask_<provider>` before `list_providers` | Discover detected providers first |
| Treating `ping_<provider>` as final proof | Use it only for limited proof before a real ask |
| Skipping `help_<provider>` and guessing provider capabilities | Read provider help only when you need flags or model details |
| Using `ask_all` for single-provider work | Use `ask_<provider>` unless comparison is the actual goal |
| Passing `--providers` to `ask_<provider>` or `--async` to `ask_all` | Match flags to the command family that supports them |
| Starting a new thread when an existing session should continue | Check `sessions_<provider>` and reuse `--session-id <id>` |
| Ignoring `provider_metrics` after repeated failures or slow runs | Use metrics to inspect success rate and latency |
| Calling MCP tools without loading deferred tool surfaces first | Run `ToolSearch(...)` before invoking deferred tools |