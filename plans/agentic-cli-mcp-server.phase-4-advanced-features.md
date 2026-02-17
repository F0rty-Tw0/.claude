# Phase 4 Plan: Advanced Features

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-4-introduction.md`

## Objectives

- `review_{provider}` tool (Codex initially, extensible)
- Sandbox parameter support
- File context passing (`files` param -> `--file`/`@` syntax)
- Concurrency limiting (configurable `maxConcurrency` per provider)
- Output size limits (configurable `maxOutputBytes`)
- NPX publish to npm registry

## Recommended Implementation Sequence

1. Add `review_{provider}` in registry behind capability gate and start with Codex-only support.
2. Implement sandbox schema extension from capability config (`boolean` vs enum levels) and enforce pass-through flags.
3. Add file context mapping layer (`files[]` -> provider-specific flag or inline syntax) with path existence checks.
4. Introduce provider-scoped execution queues (`maxConcurrency`) before enabling higher provider count in production.
5. Add output truncation policy with explicit metadata (`truncated`, byte count, limit used).
6. Finalize packaging: `bin`, `files`, `prepublishOnly`, and installation validation via `npx` dry run.

## Implementation Notes (Research-Backed)

- Tool annotations should be set intentionally per tool behavior (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) for client safety UX.
- Keep advanced parameters capability-gated so client schemas stay accurate and do not expose unsupported arguments.
- Concurrency should be per-provider first; add global caps only if contention appears in production telemetry.
- Output limits should apply independently to stdout and stderr streams and preserve partial output for debugging.
- NPX publishing should ship only build artifacts and provider config templates required at runtime.

## Deliverables

- `review_{provider}` handler and schema (Codex first, extensible for other providers).
- Sandbox and file-context support integrated in ask handler parameter extension.
- Queue-based execution limiter with configurable provider concurrency.
- Output size limit guardrails with truncation metadata in responses.
- Publish-ready package metadata and release checklist.

## Exit Criteria

- Review tool works for Codex and is hidden for providers without review support.
- Sandbox and files parameters appear only when capability-enabled.
- Concurrent requests respect configured limits without process starvation.
- Oversized outputs are truncated deterministically and flagged in response metadata.
- `npx @f0rty-tw0/agentic-mcp` launches cleanly in a fresh environment.
