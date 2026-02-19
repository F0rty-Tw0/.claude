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
- Provider configuration is validated before registration or execution (versioned config with Zod).
- Command invocation is safe-by-default (no shell interpolation, bounded execution, global spawn semaphore).
- All user-supplied inputs are validated (model regex, sessionId regex, path canonicalization).
- Child process environments are isolated (minimal base + provider-declared env only).
- Output size is bounded (`maxOutputBytes`) with truncation metadata.
- Errors are understandable and correctly classified (protocol vs execution-level failures).
- Open-source infrastructure is in place (LICENSE, README, CONTRIBUTING, SECURITY, CI).

## Non-Goals for This Introduction

- No code changes.
- No provider rollout beyond the 5 core providers.
- No streaming/session architecture (belongs to Phase 2).
- No advanced capabilities (review, per-provider concurrency queues, publish flow; Phase 4).
- No provider expansion waves (Phase 3).

## Decision Baseline for Later Implementation

- Prefer SDK production branch guidance (`v1.x`) for initial implementation stability.
- Keep provider onboarding config-driven (minimal code branching per provider).
- Gate tool visibility by capability and runtime availability checks.
- Keep platform behavior explicit for Windows process and path handling.
- Use `cross-spawn` or `.cmd` detection for Windows CLI binary compatibility (no `shell: true`).
- Resolve CLI binary paths to absolute paths at startup; use absolute paths for all subsequent spawns.
- When `sessionId` is passed before Phase 2 ships: accept silently, return unchanged in metadata. Forward-compatible.
- Config uses versioned wrapper (`configVersion: 1`) with deep-merge resolution chain (`--config` > env var > user-local > bundled).

## Acceptance Intent (Planning-Level)

By the end of Phase 1 implementation, the project should have a production-safe MVP shell:
typed config loading with versioned schema, dynamic core tool registration, basic provider adapters,
input validation and security hardening (regex validators, path canonicalization, env isolation,
global spawn semaphore, output truncation), clear failure modes with typed error classes,
a full test suite with mock-spawn infrastructure, and open-source scaffolding
(LICENSE, README, CONTRIBUTING, SECURITY, CI pipeline).

## Trace to Main Plan Checklist

- TypeScript setup aligns to main plan → Implementation Phases → Phase 1.
- Zod config schema/loader with `configVersion` aligns to main plan → Provider Config Schema + Configuration Resolution.
- `ask_{provider}` dynamic params aligns to main plan → Tool Registration.
- spawn-based command execution aligns to main plan → Command Execution.
- `ping_{provider}` and `help_{provider}` aligns to main plan → Universal Tools.
- `list_providers` aligns to main plan → Universal Tools.
- Core provider set (Claude, Codex, Copilot, Gemini, OpenCode) aligns to main plan → Tier 1 Providers.
- Error handling (3 error classes) aligns to main plan → Error Handling.
- Startup CLI availability check aligns to main plan → Startup Validation.
- Windows/platform handling aligns to main plan → Platform Handling.
- Input validation (model, sessionId, paths) aligns to main plan → Security Model → Input Validation.
- Child process env isolation aligns to main plan → Security Model → Child Process Isolation.
- Global spawn semaphore aligns to main plan → Phase 1 checklist (moved from Phase 4).
- Output size limits aligns to main plan → Phase 1 checklist (moved from Phase 4).
- OSS artifacts (LICENSE, README, CONTRIBUTING, SECURITY, CI) aligns to main plan → Phase 1 checklist.
- Testing strategy aligns to `plans/agentic-cli-mcp-server.phase-1-core-mvp.md` → Testing Strategy.
