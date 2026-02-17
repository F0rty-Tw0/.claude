# Phase 2 Plan: Sessions + Streaming

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

## Objectives

- In-memory session store (Tier 1: context prepend)
- Native session passthrough (Tier 2: `--resume`/`--continue`)
- `sessions_{provider}` tool
- Streaming execution with MCP progress notifications
- Structured output parsing for JSON-outputting CLIs

## Recommended Implementation Sequence

1. Implement `InMemorySessionStore` with TTL + LRU cleanup first (deterministic behavior before CLI integration).
2. Add Tier 1 context-prepend flow for providers without native resume; cap to last N turns.
3. Add Tier 2 mapping `mcpSessionId -> nativeSessionId` for providers with resume/continue capabilities.
4. Add `sessions_{provider}` tool to inspect active server-side session state.
5. Extend executor to stream stdout/stderr chunks and emit MCP `notifications/progress` when client passes `_meta.progressToken`.
6. Add JSON output parsing path and fallback to text for malformed JSON or text-only providers.

## Implementation Notes (Research-Backed)

- MCP progress flow is token-driven: only send `notifications/progress` when a valid request progress token exists, and stop updates after completion.
- Progress should be rate-limited/debounced to prevent flooding clients.
- Structured output should return both text `content` and `structuredContent` metadata when parse succeeds, preserving backward compatibility.
- Native session passthrough should fail soft: if provider resume fails, fallback to Tier 1 context prepend in the same call.
- Keep session storage provider-scoped to avoid cross-provider session contamination.

## Deliverables

- Session storage module with `create/get/update/list` + periodic cleanup.
- Tier 1 and Tier 2 session flows integrated in `ask_{provider}` handler.
- `sessions_{provider}` tool for supported providers.
- Streaming execution path with progress notification support.
- Structured output parser for JSON and stream-json providers.

## Exit Criteria

- Repeated calls with same `sessionId` keep prior context for non-native providers.
- Native resume providers receive mapped resume IDs when available.
- Long-running calls emit progress updates when token present; no token means no-op.
- JSON-capable providers return parseable metadata and graceful fallback on parse failure.
