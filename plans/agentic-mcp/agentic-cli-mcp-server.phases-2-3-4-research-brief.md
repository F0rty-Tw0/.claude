# Deep Research Brief: Phases 2, 3, 4

Source plans:
- `plans/agentic-cli-mcp-server.phase-2-sessions-streaming.md`
- `plans/agentic-cli-mcp-server.phase-3-extended-providers.md`
- `plans/agentic-cli-mcp-server.phase-4-advanced-features.md`
- `plans/agentic-cli-mcp-server.md`

## Resolved Decisions (Post-Review)

The following decisions were resolved by 5 specialist review agents (Architect, API Reviewer, Security Reviewer, Critic, OSS Analyst) before implementation:

1. **Open Questions (from main plan)**: All 5 resolved. See `plans/agentic-cli-mcp-server.md` → "Resolved Design Decisions".
2. **Version**: Start at `0.1.0`, not `1.0.0`. SemVer 1.0 signals stability that doesn't yet exist.
3. **`resumeFlag`/`continueFlag` type**: Changed from `string` to `string[]` throughout all configs. Honors the "token arrays only" guardrail in Guardrails section.
4. **`structuredContent`/`_meta` fields**: Removed. Metadata returned as second text content block (MCP-spec-compliant).
5. **Config versioning**: Added `configVersion: 1` wrapper to `providers.json`.
6. **Config override**: Resolution chain: `--config` flag > `AGENTIC_MCP_CONFIG` env > user-local file > bundled default.
7. **Child process env isolation**: Minimal base (`PATH`, `HOME`, `TEMP`) + provider `env` only. Never full `process.env`.
8. **Session tier mutual exclusivity**: Tiers are never both applied. Decision made before execution based on `nativeSessionId` mapping existence.
9. **Phase restructuring**: Output limits + global concurrency moved from Phase 4 to Phase 1. Phase 3 split into waves (3a/3b/3c).
10. **Input validation**: Regex for `model`, `sessionId`. Path canonicalization + allowlist for `workingDirectory`, `files`.

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
- Argument injection via prompt content in positional-method providers (mitigated: `--` separator or mandatory stdin).
- Path traversal via `workingDirectory` and `files` parameters (mitigated: canonicalization + allowlist).
- Environment variable leakage to child processes (mitigated: minimal base env construction).
- Windows `.cmd` wrapper incompatibility with `spawn()` without `shell: true` (mitigated: use `cross-spawn` or detect `.cmd` extension).
- `sessionId` used as CLI flag value enabling second-order argument injection (mitigated: strict regex validation).

## Guardrails to Lock Before Implementation

- Command templates are token arrays only (`string[]`), never split from space-delimited strings.
- One canonical session key namespace: `{providerId}:{sessionId}`.
- Explicit timeout model: queue-wait timeout and execution timeout are distinct.
- Output limits always return partial output + truncation metadata.
- Capability matrix drives both tool exposure and parameter schema exposure.
- Input validation regex locked before Phase 1: `model` = `^[a-zA-Z0-9][a-zA-Z0-9._:\-/]{0,127}$`, `sessionId` = `^[a-zA-Z0-9][a-zA-Z0-9._:\-]{0,63}$`.
- Child process environment: minimal base + declared env only. Full `process.env` never inherited.
- `providers.json` must use versioned wrapper: `{ "configVersion": 1, "providers": { ... } }`.
- Path parameters canonicalized and validated against allowlist before use.
- All MCP responses use only spec-compliant fields. No custom `structuredContent` or `_meta` overrides.
- `resumeFlag`/`continueFlag` are `string[]` arrays, never space-delimited strings.

## Decision Summary

Phases 2 to 4 are feasible without architecture rewrites. All critical contracts are now fixed:
session tier mutual exclusivity, input validation regex, tokenized command templates (`string[]`),
provider matrix gating with `supportLevel` field, queue/output guardrails (global semaphore in Phase 1,
per-provider queues in Phase 4), child process environment isolation, and MCP-spec-compliant response format.

Phase 3 is split into three waves (3a: popular, 3b: IDE-adjacent, 3c: experimental/deferred) and can
run in parallel with Phase 2. The project starts at version 0.1.0 with full OSS infrastructure
(LICENSE, README, CONTRIBUTING, SECURITY, CI pipeline).
