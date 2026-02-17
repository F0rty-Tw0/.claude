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
- Session tiers are mutually exclusive per invocation — never both applied simultaneously.
- Request cancellation terminates spawned processes gracefully within a bounded grace period.
- Context prepend size is bounded by both turn count and byte budget.
- Per-session concurrency is protected by mutex — no concurrent writes to session state.

## Non-Goals for This Introduction

- No code changes.
- No provider expansion waves (Phase 3).
- No advanced review/sandbox/files/concurrency rollout (Phase 4).

## Decision Baseline for Later Implementation

- Keep one explicit session contract (`sessionMode`) visible in response metadata.
- Keep progress token semantics strict (`_meta.progressToken` gates notifications).
- Treat streaming parser failures as recoverable (fallback to text, no silent corruption).
- Keep output-budget metadata visible early, even if full tuning lands later.
- Session tiers decided BEFORE execution: if `nativeSessionId` mapping exists → Tier 2 only. Otherwise → Tier 1 only.
- `context` parameter from client and session prepend interact in defined order: session turns → user context → current prompt.
- ANSI escape codes stripped from ALL output paths, not just JSON parsing.
- `TimeoutError` added as a subclass of `CommandExecutionError` to distinguish timeout from crash.

## Acceptance Intent (Planning-Level)

By the end of Phase 2 implementation, users should be able to make repeated calls with
stable session behavior (no double-context injection, no concurrent-write corruption),
observe progress on long calls when supported, cancel in-flight requests that trigger
graceful process termination, and receive consistent result metadata for both structured
and text outputs with `sessionMode` and `outputFormatObserved` fields.

## Trace to Main Plan Checklist

- In-memory session store aligns to main plan → Implementation Phases → Phase 2.
- Native session passthrough aligns to main plan → Session Management → Tier 2.
- `sessions_{provider}` tool aligns to main plan → Capability-Gated Tools.
- Streaming progress aligns to main plan → Command Execution → Progress Notifications.
- Structured output parsing aligns to main plan → Structured Output.
- Request cancellation aligns to MCP `notifications/cancelled` spec.
- Per-session mutex prevents concurrent access corruption.
- Context size budget prevents prompt explosion from large turn history.
- Session ID extraction per provider enables reliable Tier 2 resume.
