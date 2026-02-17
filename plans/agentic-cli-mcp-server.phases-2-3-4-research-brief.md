# Deep Research Brief: Phases 2, 3, 4

Source plans:
- `plans/agentic-cli-mcp-server.phase-2-sessions-streaming.md`
- `plans/agentic-cli-mcp-server.phase-3-extended-providers.md`
- `plans/agentic-cli-mcp-server.phase-4-advanced-features.md`
- `plans/agentic-cli-mcp-server.md`

External references:
- MCP Tools spec: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`
- MCP Progress spec: `https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress`
- MCP Tasks spec: `https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks`
- TypeScript SDK: `modelcontextprotocol/typescript-sdk`

## Internal Anchors (Phase-by-Phase)

### Phase 2: Sessions + Streaming

Plan anchors:
- `plans/agentic-cli-mcp-server.phase-2-sessions-streaming.md:15`
- `plans/agentic-cli-mcp-server.md:1028`

Implementation anchors:
- Session store contract: provider-scoped in-memory store, TTL cleanup, bounded history.
- Tier policy: Tier 2 native resume path first; Tier 1 prepend only on explicit fallback.
- Streaming contract: progress is preview only, final tool result is authoritative.
- Structured output: parse JSON/NDJSON when declared, otherwise fallback to text.

Required response metadata (contract):
- `sessionMode` (`tier1-prepend` | `tier2-native` | `tier2-fallback-to-tier1`)
- `truncated` + byte counts when output limits apply
- `outputFormatObserved` for parser/debug visibility

### Phase 3: Extended Providers

Plan anchors:
- `plans/agentic-cli-mcp-server.phase-3-extended-providers.md:14`
- `plans/agentic-cli-mcp-server.md:1034`

Implementation anchors:
- Add providers in waves by I/O behavior (text, json, stream-json, stdin mode).
- Keep onboarding config-driven (`providers.json` + capability gates), not handler branches.
- Require one compatibility matrix row per provider before enabling.

Provider matrix fields (minimum):
- `supportLevel` (`stable` | `beta` | `experimental`)
- `input.method`, `outputFormat`, native session support, review support
- prerequisites (auth, daemon, docker, env)

### Phase 4: Advanced Features

Plan anchors:
- `plans/agentic-cli-mcp-server.phase-4-advanced-features.md:16`
- `plans/agentic-cli-mcp-server.md:1041`

Implementation anchors:
- `review_{provider}` behind capability gates (Codex first).
- Sandbox/files parameters only when capability-enabled.
- Per-provider FIFO queues before enabling higher concurrency.
- Output limits applied independently to stdout/stderr with deterministic truncation.

Recommended order refinement:
1. Queue + timeout semantics
2. Output budgeting + truncation metadata
3. Review tool
4. Sandbox/files extensions
5. Packaging/publish hardening

## Spec-Level Requirements That Affect Design

- Declare `capabilities.tools` and implement `tools/list` and `tools/call` contracts.
- `inputSchema` must be valid JSON Schema object; empty-param tools use object schema.
- Tool execution failures should use tool results with `isError: true`; protocol errors remain JSON-RPC errors.
- Progress notifications are token-gated (`_meta.progressToken`), monotonic, and must stop after completion.
- If task-augmented tool calls are used, capability negotiation and `execution.taskSupport` rules must be respected.

## High-Risk Failure Modes

- Double context injection when Tier 1 prepend runs alongside Tier 2 native resume.
- Ambiguous native session ID extraction (stdout vs stderr vs structured output).
- JSON/NDJSON parse breakage due to chunk boundaries in stream processing.
- Progress flooding that overwhelms clients or creates duplicate UX output.
- Dead tool exposure from capability drift during provider expansion.
- Queue timeout ambiguity (start at enqueue vs start at process launch).

## Guardrails to Lock Before Implementation

- Command templates are token arrays only (`string[]`), never split from space-delimited strings.
- One canonical session key namespace: `{providerId}:{sessionId}`.
- Explicit timeout model: queue-wait timeout and execution timeout are distinct.
- Output limits always return partial output + truncation metadata.
- Capability matrix drives both tool exposure and parameter schema exposure.

## Decision Summary

Phases 2 to 4 are feasible without architecture rewrites if contracts are fixed early:
session mode, streaming semantics, tokenized command templates, provider matrix gating,
and queue/output guardrails.
