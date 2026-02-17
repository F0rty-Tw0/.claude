# Phase 2 Introduction (No Implementation)

Source context:
- `plans/agentic-cli-mcp-server.phase-2-sessions-streaming.md`
- `plans/agentic-cli-mcp-server.phases-2-3-4-research-brief.md`
- MCP Progress spec: `https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress`
- MCP Tasks spec: `https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks`

## Purpose

Phase 2 introduces continuity and responsiveness: session memory across calls,
progress-aware execution, and structured output handling for capable providers.
The goal is to keep the MVP predictable while enabling long-running workflows.

## What Phase 2 Must Guarantee

- Session behavior is deterministic and provider-scoped.
- Tier 2 native resume is preferred when available, with explicit Tier 1 fallback behavior.
- Progress notifications are optional previews; final tool result remains authoritative.
- Structured output parsing is safe, bounded, and falls back gracefully to text.

## Non-Goals for This Introduction

- No code changes.
- No provider expansion waves (Phase 3).
- No advanced review/sandbox/files/concurrency rollout (Phase 4).

## Decision Baseline for Later Implementation

- Keep one explicit session contract (`sessionMode`) visible in response metadata.
- Keep progress token semantics strict (`_meta.progressToken` gates notifications).
- Treat streaming parser failures as recoverable (fallback to text, no silent corruption).
- Keep output-budget metadata visible early, even if full tuning lands later.

## Acceptance Intent (Planning-Level)

By the end of Phase 2 implementation, users should be able to make repeated calls with
stable session behavior, observe progress on long calls when supported, and receive
consistent result metadata for both structured and text outputs.

## Trace to Main Plan Checklist

- In-memory session store aligns to `plans/agentic-cli-mcp-server.md:1028`.
- Native session passthrough aligns to `plans/agentic-cli-mcp-server.md:1029`.
- `sessions_{provider}` tool aligns to `plans/agentic-cli-mcp-server.md:1030`.
- Streaming progress aligns to `plans/agentic-cli-mcp-server.md:1031`.
- Structured output parsing aligns to `plans/agentic-cli-mcp-server.md:1032`.
