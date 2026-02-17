# Phase 2 Plan: Sessions + Streaming

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-2-introduction.md`

## Objectives

- In-memory session store (Tier 1: context prepend)
- Native session passthrough (Tier 2: `--resume`/`--continue`)
- `sessions_{provider}` tool
- Streaming execution with MCP progress notifications
- Structured output parsing for JSON-outputting CLIs
- Request cancellation handler (`notifications/cancelled` → SIGTERM/taskkill on spawned process)
- Per-session mutex to prevent concurrent requests on same sessionId
- Context size budget for Tier 1 prepend (`maxContextBytes` in addition to `maxContextTurns`)
- Session ID extraction specification per provider
- `sessionMode` response metadata field

## Recommended Implementation Sequence

1. Implement `InMemorySessionStore` with TTL + LRU cleanup first (deterministic behavior before CLI integration). Add per-session mutex (promise-chain lock) — reject concurrent requests on same session with clear error "session in use".
2. Add Tier 1 context-prepend flow for providers without native resume; cap to last N turns.
2a. Add `maxContextBytes` limit (default: 32KB) in addition to `maxContextTurns`. Truncate oldest turn content first to fit within budget. Each individual turn capped at 32KB at storage time.
3. Add Tier 2 mapping `mcpSessionId → nativeSessionId` for providers with resume/continue capabilities. CRITICAL: Tiers are mutually exclusive per invocation. Decision logic: if `nativeSessionId` mapping exists for this session → use Tier 2 ONLY (no context prepend). If no mapping exists → use Tier 1 ONLY. Never apply both. If Tier 2 fails (non-zero exit), retry with Tier 1 in a separate invocation attempt. Add `sessionMode` field to response metadata: `tier1-prepend` | `tier2-native` | `tier2-fallback-to-tier1`.
4. Add `sessions_{provider}` tool to inspect active server-side session state.
5. Extend executor to stream stdout/stderr chunks and emit MCP `notifications/progress` when client passes `_meta.progressToken`.
6. Add JSON output parsing path and fallback to text for malformed JSON or text-only providers.
7. Implement MCP `notifications/cancelled` handler. When a cancellation notification is received for an in-flight request, send SIGTERM (POSIX) or `taskkill /T` (Windows) to the spawned CLI process. Wait grace period (5s), then SIGKILL/`taskkill /F`. Clean up any session state for the interrupted turn.

## Native Session ID Extraction

For Tier 2 native resume, the server must extract the CLI's own session/conversation ID from its output. This is provider-specific:

| Provider | Output Format | Extraction Method | Field/Pattern |
|---|---|---|---|
| Claude | JSON | Parse JSON stdout | `.session_id` or `.conversation_id` field |
| Codex | NDJSON | Parse last JSON line | `.conversation_id` field |
| Copilot | Text | Regex on stdout | Pattern: `Session: ([a-zA-Z0-9-]+)` |
| Gemini | JSON | Parse JSON stdout | `.session_id` field (if present) |
| Goose | JSON | Parse JSON stdout | `.session.id` field |
| OpenCode | JSON | Parse JSON stdout | `.session_id` field |

**Fallback**: If extraction fails (field missing, parse error), log a warning and fall back to Tier 1 for subsequent calls on this session. Do not crash or return an error — the current call's output is still valid.

**Validation**: Apply the same `sessionId` regex (`^[a-zA-Z0-9][a-zA-Z0-9._:\-]{0,63}$`) to extracted native IDs before storing them.

NOTE: These extraction patterns should be verified against actual CLI output during implementation. They may need updates as CLIs evolve.

## Implementation Notes (Research-Backed)

- MCP progress flow is token-driven: only send `notifications/progress` when a valid request progress token exists, and stop updates after completion.
- Progress should be rate-limited/debounced to prevent flooding clients.
- Structured output should return both text `content` and `structuredContent` metadata when parse succeeds, preserving backward compatibility.
- Native session passthrough should fail soft: if provider resume fails, fallback to Tier 1 context prepend in the same call.
- Keep session storage provider-scoped to avoid cross-provider session contamination.
- The `context` parameter from the MCP client and Tier 1 session prepend interact as follows: `"Previous context:\n{session_turns}\n\nAdditional context:\n{context}\n\nCurrent request:\n{prompt}"`. Session turns come first, then user-provided context, then the current prompt.
- Progress notifications should include a `description` field with a human-readable status: "Waiting for {provider}..." → "Processing..." → "Parsing output...".
- When parsing NDJSON (Codex), use a line-buffered parser that handles incomplete lines at chunk boundaries. Do not attempt to parse until a complete newline-terminated line is available.
- ANSI escape codes must be stripped from ALL output before returning to MCP clients, not just the JSON parsing path. Regex: `/\x1b\[[0-9;]*[a-zA-Z]/g`.

## Deliverables

- Session storage module with `create/get/update/list` + periodic cleanup.
- Tier 1 and Tier 2 session flows integrated in `ask_{provider}` handler.
- `sessions_{provider}` tool for supported providers.
- Streaming execution path with progress notification support.
- Structured output parser for JSON and stream-json providers.
- Request cancellation handler with graceful process termination.
- Per-session mutex preventing concurrent access.
- Context size budget enforcement (maxContextBytes + maxContextTurns).
- Session ID extraction module with per-provider patterns.
- `sessionMode` and `outputFormatObserved` response metadata fields.

## Exit Criteria

- Repeated calls with same `sessionId` keep prior context for non-native providers.
- Native resume providers receive mapped resume IDs when available.
- Long-running calls emit progress updates when token present; no token means no-op.
- JSON-capable providers return parseable metadata and graceful fallback on parse failure.
- Concurrent requests on the same sessionId are rejected with a clear "session in use" error.
- Tier 1 and Tier 2 are never both applied to a single invocation (verified by test checking sessionMode metadata).
- Prepended context never exceeds maxContextBytes (verified by test with large turn content).
- MCP cancellation notification triggers process termination within grace period.
- Native session IDs extracted from CLI output match validation regex.
