# Phase 4 Introduction (No Implementation)

Source context:
- `plans/agentic-cli-mcp-server.phase-4-advanced-features.md`
- `plans/agentic-cli-mcp-server.phases-2-3-4-research-brief.md`
- MCP Tools spec: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`

## Purpose

Phase 4 adds advanced controls and production hardening: review tools,
sandbox/files parameter support, concurrency governance, output budgets,
and publish readiness.

## What Phase 4 Must Guarantee

- Advanced tools/parameters are exposed only when capability-enabled.
- Concurrency behavior is bounded and predictable per provider.
- Output truncation is deterministic and always communicated in metadata.
- Packaging for NPX distribution is reproducible and minimal.

## Non-Goals for This Introduction

- No code changes.
- No base session/streaming contract redesign (Phase 2).
- No provider-wave onboarding strategy changes (Phase 3).

## Decision Baseline for Later Implementation

- Apply queue and output guardrails before widening advanced feature usage.
- Treat `review_{provider}` as high-cost output path with strict limits.
- Keep sandbox/files schema extensions capability-gated to avoid dead interfaces.
- Ship only runtime-required artifacts in package publishing.

## Acceptance Intent (Planning-Level)

By the end of Phase 4 implementation, advanced capabilities should be safe-by-default,
operationally bounded, and release-ready for broader consumption through NPX.

## Trace to Main Plan Checklist

- `review_{provider}` aligns to `plans/agentic-cli-mcp-server.md:1043`.
- Sandbox parameter support aligns to `plans/agentic-cli-mcp-server.md:1044`.
- File context passing aligns to `plans/agentic-cli-mcp-server.md:1045`.
- Concurrency limiting aligns to `plans/agentic-cli-mcp-server.md:1046`.
- Output size limits aligns to `plans/agentic-cli-mcp-server.md:1047`.
- NPX publish aligns to `plans/agentic-cli-mcp-server.md:1048`.
