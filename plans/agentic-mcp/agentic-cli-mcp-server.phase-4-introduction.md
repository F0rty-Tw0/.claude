# Phase 4 Introduction (No Implementation)

Source context:
- `plans/agentic-cli-mcp-server.phase-4-advanced-features.md`
- `plans/agentic-cli-mcp-server.phases-2-3-4-research-brief.md`
- MCP Tools spec: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`

## Purpose

Phase 4 adds advanced controls, operational tooling, and production hardening: review tools,
sandbox/files parameter support, per-provider concurrency queues (extending Phase 1's global limit),
dual timeout model, dry-run mode for debugging, audit logging for security,
and publish readiness with npm provenance attestation.

## What Phase 4 Must Guarantee

- Advanced tools/parameters are exposed only when capability-enabled.
- Per-provider concurrency queues respect both provider limits and global ceiling.
- Queue timeout and execution timeout are distinct with separate error types.
- `--dry-run` mode enables command inspection without execution.
- `--audit-log` produces structured invocation records for security audit.
- Packaging for NPX distribution is reproducible, minimal, and provenance-attested.

## Non-Goals for This Introduction

- No code changes.
- No base session/streaming contract redesign (Phase 2).
- No provider-wave onboarding strategy changes (Phase 3).

## Decision Baseline for Later Implementation

- Apply queue and output guardrails before widening advanced feature usage.
- Treat `review_{provider}` as high-cost output path with strict limits.
- Keep sandbox/files schema extensions capability-gated to avoid dead interfaces.
- Ship only runtime-required artifacts in package publishing.
- `review_{provider}` uses `scope` enum (`uncommitted | commit | range`) instead of boolean `uncommitted`.
- Queue timeout produces `QueueTimeoutError` distinct from `CommandExecutionError`.
- `--dry-run` and `--audit-log` are CLI flags, not provider capabilities.
- npm publish requires `npm audit` pass and `--provenance` flag.

## Acceptance Intent (Planning-Level)

By the end of Phase 4 implementation, advanced capabilities should be safe-by-default,
operationally bounded, fully auditable, and release-ready for broader consumption
through NPX with provenance attestation. Contributors can test provider configs
using `--dry-run` without needing authenticated CLI binaries.

## Trace to Main Plan Checklist

- `review_{provider}` aligns to `plans/agentic-cli-mcp-server.md:1043`.
- Sandbox parameter support aligns to `plans/agentic-cli-mcp-server.md:1044`.
- File context passing aligns to `plans/agentic-cli-mcp-server.md:1045`.
- Per-provider concurrency queues extend Phase 1's global semaphore.
- Dual timeout model (`queueTimeoutMs` + `executionTimeoutMs`).
- `--dry-run` and `--audit-log` CLI flags for operational tooling.
- NPX publish with provenance attestation.
