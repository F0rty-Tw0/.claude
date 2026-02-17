# Phase 1 Introduction (No Implementation)

Source context:
- `plans/agentic-cli-mcp-server.phase-1-core-mvp.md`
- MCP spec: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`
- MCP lifecycle: `https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle`
- TypeScript SDK docs/examples: `modelcontextprotocol/typescript-sdk`

## Purpose

Phase 1 establishes a stable MVP foundation for a config-driven MCP server that wraps CLI providers.
This phase is about defining reliable boundaries: strict config validation, predictable tool exposure,
safe command execution, and explicit error semantics.

## What Phase 1 Must Guarantee

- Tools are exposed through MCP-compliant contracts (`tools/list`, `tools/call`).
- Only enabled and available providers are exposed as tools.
- Provider configuration is validated before registration or execution.
- Command invocation is safe-by-default (no shell interpolation, bounded execution).
- Errors are understandable and correctly classified (protocol vs execution-level failures).

## Non-Goals for This Introduction

- No code changes.
- No provider rollout beyond the 5 core providers.
- No streaming/session architecture (belongs to Phase 2).
- No advanced capabilities (review, concurrency controls, publish flow; Phase 4).

## Decision Baseline for Later Implementation

- Prefer SDK production branch guidance (`v1.x`) for initial implementation stability.
- Keep provider onboarding config-driven (minimal code branching per provider).
- Gate tool visibility by capability and runtime availability checks.
- Keep platform behavior explicit for Windows process and path handling.

## Acceptance Intent (Planning-Level)

By the end of Phase 1 implementation, the project should have a production-safe MVP shell:
typed config loading, dynamic core tool registration, basic provider adapters, and clear failure modes.

## Trace to Main Plan Checklist

- TypeScript setup aligns to `plans/agentic-cli-mcp-server.md:1015`.
- Zod config schema/loader aligns to `plans/agentic-cli-mcp-server.md:1016`.
- `ask_{provider}` dynamic params aligns to `plans/agentic-cli-mcp-server.md:1017`.
- spawn-based command execution aligns to `plans/agentic-cli-mcp-server.md:1018`.
- `ping_{provider}` and `help_{provider}` aligns to `plans/agentic-cli-mcp-server.md:1019`.
- `list_providers` aligns to `plans/agentic-cli-mcp-server.md:1020`.
- Core provider set aligns to `plans/agentic-cli-mcp-server.md:1021`.
- Error handling aligns to `plans/agentic-cli-mcp-server.md:1022`.
- Startup CLI availability check aligns to `plans/agentic-cli-mcp-server.md:1023`.
- Windows/platform handling aligns to `plans/agentic-cli-mcp-server.md:1024`.
