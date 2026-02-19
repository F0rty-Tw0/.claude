# Phase 2 Plan: Sessions + Streaming

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-2-introduction.md`

TDD strategy: `plans/tdd-strategy.md`

## Objectives

- In-memory session store (Tier 1: context prepend)
- Native session passthrough (Tier 2: `--resume`/`--continue`)
- `sessions_{provider}` tool
- Streaming execution with MCP progress notifications
- Structured output parsing for JSON-outputting CLIs
- Request cancellation handler (`notifications/cancelled` -> SIGTERM/taskkill on spawned process)
- Per-session mutex to prevent concurrent requests on same sessionId
- Context size budget for Tier 1 prepend (`maxContextBytes` in addition to `maxContextTurns`)
- Session ID extraction specification per provider
- `sessionMode` response metadata field

## TDD Implementation Sequence

Each step follows RED -> GREEN -> REFACTOR. Tests are written FIRST.

### Step 1: Session Store

**RED — Write tests first** `session/session-store.spec.ts`
- GIVEN an empty store WHEN creating a session THEN returns session with id and empty turns
- GIVEN an existing session WHEN getting by id THEN returns the session
- GIVEN a non-existent id WHEN getting THEN returns undefined
- GIVEN a session WHEN adding a turn THEN appends to turns array
- GIVEN MAX_SESSIONS sessions WHEN creating another THEN evicts least-recently-used
- GIVEN a session older than TTL WHEN cleanup runs THEN removes it
- GIVEN a session WHEN accessed THEN updates lastAccessedAt
- GIVEN a session exceeding maxContextTurns WHEN getting prepend context THEN returns only last N turns
- GIVEN turns exceeding maxContextBytes WHEN getting prepend context THEN truncates oldest turns first
- GIVEN a locked session WHEN a second request arrives THEN rejects with "session in use"
- GIVEN a released lock WHEN a new request arrives THEN succeeds

**GREEN — Implement** `session/session-store.ts`
- `InMemorySessionStore` with create/get/update/list/cleanup
- TTL (24h) + LRU eviction (max 100)
- Per-session promise-chain mutex
- Context budget enforcement (maxContextTurns + maxContextBytes)

**REFACTOR** — Extract mutex into utility, simplify eviction logic.

### Step 2: Tier 1 Context Prepend

**RED — Write tests first** (extend `handlers/ask.spec.ts`)
- GIVEN a sessionId and no prior turns WHEN handleAsk THEN executes without prepend
- GIVEN a sessionId with prior turns WHEN handleAsk THEN prepends context to prompt
- GIVEN session turns + client context WHEN handleAsk THEN orders: session turns -> context -> prompt
- GIVEN a session exceeding maxContextBytes WHEN handleAsk THEN truncates prepend
- GIVEN response text WHEN handleAsk THEN stores assistant turn in session

**GREEN — Implement** Tier 1 flow in ask handler:
- Create/get session from store
- Build prepended prompt: `"Previous context:\n{turns}\n\nAdditional context:\n{context}\n\nCurrent request:\n{prompt}"`
- Store response turn

**REFACTOR** — Extract context formatting into pure function.

### Step 3: Tier 2 Native Session Passthrough

**RED — Write tests first** `session/native-session.spec.ts`
- GIVEN a provider with resumeFlag and a mapped nativeSessionId WHEN building args THEN uses resume flag
- GIVEN a provider with continueFlag WHEN building args for continue THEN uses continue flag
- GIVEN no nativeSessionId mapping WHEN handleAsk THEN falls back to Tier 1
- GIVEN Tier 2 execution failure WHEN handleAsk THEN retries with Tier 1
- GIVEN successful Tier 2 execution WHEN response metadata THEN includes `sessionMode: 'tier2-native'`
- GIVEN Tier 2 fallback WHEN response metadata THEN includes `sessionMode: 'tier2-fallback-to-tier1'`
- GIVEN Tier 1 only WHEN response metadata THEN includes `sessionMode: 'tier1-prepend'`

**RED — Session ID extraction tests** `session/session-id-extractor.spec.ts`
- GIVEN Claude JSON output with session_id field WHEN extracting THEN returns the id
- GIVEN Codex NDJSON output WHEN extracting THEN parses last line for conversation_id
- GIVEN output without session id WHEN extracting THEN returns undefined (fallback to Tier 1)
- GIVEN extracted id failing regex validation WHEN extracting THEN returns undefined

**GREEN — Implement**
- `nativeSessionId` mapping in session store
- Session ID extraction per provider (configurable patterns)
- Tier decision logic: nativeSessionId exists -> Tier 2 only; else -> Tier 1 only
- Fallback: Tier 2 failure -> retry Tier 1

**REFACTOR** — Unify tier decision into a single function.

### Step 4: Sessions Tool

**RED — Write tests first** `handlers/sessions.spec.ts`
- GIVEN active sessions for a provider WHEN handleSessions THEN returns session list
- GIVEN no sessions WHEN handleSessions THEN returns empty list
- GIVEN sessions from multiple providers WHEN handleSessions THEN filters by requested provider

**RED — Tool builder tests** (extend `tool-builder.spec.ts`)
- GIVEN a provider with sessions command WHEN buildSessionsToolDefinition THEN returns tool with correct name

**GREEN — Implement**
- `sessions_{provider}` tool definition + handler
- Register in tool-registry when provider has sessions command

**REFACTOR** — Align response format with list_providers.

### Step 5: Streaming with Progress Notifications

**RED — Write tests first** `domain-logic/streaming-executor.spec.ts`
- GIVEN a progressToken WHEN executing THEN emits progress notifications on stdout chunks
- GIVEN no progressToken WHEN executing THEN does not emit progress notifications
- GIVEN rapid stdout chunks WHEN executing THEN debounces progress at 100ms
- GIVEN completion WHEN executing THEN sends final progress notification
- GIVEN progress descriptions THEN includes "Waiting for {provider}..." -> "Processing..." -> "Parsing output..."

**GREEN — Implement**
- Extend `executeCommand` with optional `progressToken` + `notifyProgress` callback
- Debounced progress emission (100ms)
- Human-readable progress descriptions

**REFACTOR** — Keep non-streaming path unchanged; streaming is opt-in.

### Step 6: Structured Output Parsing

**RED — Write tests first** `domain-logic/output-parser.spec.ts`
- GIVEN valid JSON output from a json provider WHEN parsing THEN returns parsed object
- GIVEN valid NDJSON output from a stream-json provider WHEN parsing THEN returns aggregated result
- GIVEN malformed JSON WHEN parsing THEN falls back to raw text
- GIVEN text-only provider output WHEN parsing THEN returns raw text unchanged
- GIVEN JSON with ANSI codes WHEN parsing THEN strips ANSI before parsing
- GIVEN parsed output WHEN building response THEN includes metadata content block
- GIVEN incomplete NDJSON line at chunk boundary WHEN parsing THEN buffers until complete

**GREEN — Implement**
- `parseProviderOutput(stdout, outputFormat)` -> `{ text, metadata? }`
- JSON parser with graceful fallback
- NDJSON line-buffered parser
- Response builder: `[textBlock, metadataBlock?]`

**REFACTOR** — Extract NDJSON parser into standalone utility.

### Step 7: Request Cancellation

**RED — Write tests first** `domain-logic/cancellation.spec.ts`
- GIVEN an in-flight request WHEN cancellation notification received THEN kills spawned process
- GIVEN a killed process on posix WHEN cancelled THEN sends SIGTERM then SIGKILL after 5s
- GIVEN a killed process on win32 WHEN cancelled THEN uses taskkill /T /F
- GIVEN a cancelled request with active session WHEN cancelled THEN does not store the turn
- GIVEN no in-flight request WHEN cancellation received THEN is a no-op

**GREEN — Implement**
- Map request IDs to spawned child PIDs
- Handle `notifications/cancelled` via MCP server handler
- Graceful kill with grace period (reuse `killProcess` from platform.ts)
- Clean up session state for interrupted turn

**REFACTOR** — Unify request tracking into a single registry.

## Native Session ID Extraction

| Provider | Output Format | Extraction Method | Field/Pattern |
|---|---|---|---|
| Claude | JSON | Parse JSON stdout | `.session_id` or `.conversation_id` field |
| Codex | NDJSON | Parse last JSON line | `.conversation_id` field |
| Copilot | Text | Regex on stdout | Pattern: `Session: ([a-zA-Z0-9-]+)` |
| Gemini | JSON | Parse JSON stdout | `.session_id` field (if present) |
| Goose | JSON | Parse JSON stdout | `.session.id` field |
| OpenCode | JSON | Parse JSON stdout | `.session_id` field |

**Fallback**: If extraction fails, log warning and fall back to Tier 1. Never crash.
**Validation**: Apply sessionId regex to extracted IDs before storing.

NOTE: These extraction patterns should be verified against actual CLI output during implementation.

## Implementation Notes (Research-Backed)

- MCP progress flow is token-driven: only send `notifications/progress` when a valid request progress token exists.
- Progress should be rate-limited/debounced to prevent flooding clients.
- Structured output should return both text `content` and metadata when parse succeeds.
- Native session passthrough should fail soft: if provider resume fails, fallback to Tier 1.
- Keep session storage provider-scoped to avoid cross-provider session contamination.
- Context parameter and session prepend interact in defined order: session turns -> user context -> prompt.
- ANSI escape codes must be stripped from ALL output before returning to MCP clients.
- When parsing NDJSON (Codex), use a line-buffered parser that handles incomplete lines at chunk boundaries.

## New Test Files (Phase 2)

```
src/
  session/
    session-store.spec.ts         <- Step 1
    native-session.spec.ts        <- Step 3
    session-id-extractor.spec.ts  <- Step 3
  domain-logic/
    streaming-executor.spec.ts    <- Step 5
    output-parser.spec.ts         <- Step 6
    cancellation.spec.ts          <- Step 7
    handlers/
      ask.spec.ts                 <- Step 2 (extended)
      sessions.spec.ts            <- Step 4
```

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
- **All deliverables have corresponding test suites written BEFORE implementation.**

## Exit Criteria

- All tests pass (`pnpm run test`).
- Coverage >= 80% for new Phase 2 modules.
- Repeated calls with same `sessionId` keep prior context for non-native providers.
- Native resume providers receive mapped resume IDs when available.
- Long-running calls emit progress updates when token present; no token means no-op.
- JSON-capable providers return parseable metadata and graceful fallback on parse failure.
- Concurrent requests on the same sessionId are rejected with a clear "session in use" error.
- Tier 1 and Tier 2 are never both applied to a single invocation.
- Prepended context never exceeds maxContextBytes.
- MCP cancellation notification triggers process termination within grace period.
- Native session IDs extracted from CLI output match validation regex.
