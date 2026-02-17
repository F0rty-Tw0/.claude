# Phase 4 Plan: Advanced Features

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-4-introduction.md`

## Objectives

- `review_{provider}` tool (Codex initially, extensible)
- Sandbox parameter support (boolean and leveled)
- File context passing (`files` param → provider-specific `--file`/`@` syntax)
- Per-provider execution queues with FIFO ordering (global semaphore already in Phase 1)
- Per-provider `maxConcurrency` configuration (extends Phase 1's global limit)
- Separate `queueTimeoutMs` and `executionTimeoutMs` per provider
- NPX publish to npm registry with provenance attestation
- `--dry-run` mode (prints command without executing — for testing/debugging)
- `--audit-log` flag (structured log of all command invocations)

**Moved to Phase 1** (no longer in Phase 4):
- ~~Output size limits~~ (now Phase 1 with `maxOutputBytes: 10MB` default)
- ~~Concurrency limiting~~ (global semaphore now Phase 1; per-provider queues remain here)

## Recommended Implementation Sequence

1. Add `review_{provider}` in registry behind capability gate. Start with Codex-only support. Verify `review` config block is present when `capabilities.review: true`.
2. Implement sandbox schema extension from capability config (`boolean` vs enum levels) using Zod discriminated union. Enforce pass-through flags.
3. Add file context mapping layer (`files[]` → provider-specific flag or inline syntax). Apply path validation from Phase 1 (canonicalization + allowlist check). Enforce max 20 files.
4. Replace Phase 1's global spawn semaphore with per-provider FIFO queues. Each provider gets its own `maxConcurrency` (default: 1). Retain global `maxConcurrentSpawns` as a ceiling.
5. Implement dual timeout model: `queueTimeoutMs` (time waiting for a slot, default: 30s) and `executionTimeoutMs` (time running the command, from provider `timeout` field). Add `QueueTimeoutError` class.
6. Add `--dry-run` CLI flag: when set, `ask_*` tools print the exact spawn command array and env vars without executing. Essential for debugging and contributor testing.
7. Add `--audit-log <path>` CLI flag: when set, write structured JSONL log of all command invocations (timestamp, provider, command array, exit code, duration, truncated flag).
8. Finalize packaging: `bin`, `files`, `prepublishOnly`, `npm audit`, and installation validation via `npx` dry run. Publish with `--provenance` flag.

## Implementation Notes (Research-Backed)

- Tool annotations should be set intentionally per tool behavior (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) for client safety UX.
- Keep advanced parameters capability-gated so client schemas stay accurate and do not expose unsupported arguments.
- Per-provider queues should use the `maxConcurrency` field from provider config. If not specified, default to 1.
- Queue timeout and execution timeout are DISTINCT. `queueTimeoutMs` starts when the request enters the queue. `executionTimeoutMs` starts when the CLI process spawns. Both must be configurable per-provider.
- Output limits (from Phase 1) apply independently to stdout and stderr streams. The truncation metadata should include: `truncated: boolean`, `stdoutBytes: number`, `stderrBytes: number`, `limitBytes: number`.
- NPX publishing should ship only build artifacts and provider config templates required at runtime. Publish with npm provenance attestation (`--provenance`). Include `package-lock.json` with exact version pins.
- Recommend in documentation that users pin to a specific version rather than using `npx -y @f0rty-tw0/agentic-mcp` (unpinned latest).
- Add `"audit": "npm audit --audit-level=high"` to package.json scripts and require it to pass as part of `prepublishOnly`.
- The `review_{provider}` parameter `uncommitted` should be refactored into a `scope` enum: `scope: 'uncommitted' | 'commit' | 'range'` with a companion `ref?: string` for commit hash or range.
- `--dry-run` mode is critical for contributors testing new provider configs without needing real CLI binaries authenticated.

## New Error Classes (Phase 4)

| Error | When | MCP Response |
|---|---|---|
| `QueueTimeoutError` | Request waited longer than `queueTimeoutMs` for a slot | `{ isError: true, content: [{ text: "Queue timeout for {provider}: waited {ms}ms (limit: {limit}ms). Try again or increase maxConcurrency." }] }` |

This extends Phase 1's error taxonomy (ValidationError, CommandExecutionError, ProviderNotFoundError) and Phase 2's TimeoutError.

## Deliverables

- `review_{provider}` handler and schema (Codex first, with `scope` enum instead of boolean `uncommitted`).
- Sandbox and file-context support integrated in ask handler parameter extension.
- Per-provider FIFO queue replacing Phase 1's global semaphore.
- Dual timeout model (`queueTimeoutMs` + `executionTimeoutMs`) with `QueueTimeoutError`.
- `--dry-run` mode for command inspection without execution.
- `--audit-log` mode for structured invocation logging.
- Publish-ready package with provenance attestation and release checklist.
- `npm audit` integrated into `prepublishOnly` script.

## Exit Criteria

- Review tool works for Codex and is hidden for providers without review support.
- Sandbox and files parameters appear only when capability-enabled.
- Concurrent requests respect per-provider `maxConcurrency` AND global `maxConcurrentSpawns` ceiling.
- Queue timeout produces `QueueTimeoutError` distinct from execution timeout.
- `--dry-run` prints exact command array and env for any `ask_*` call without spawning.
- `--audit-log` writes valid JSONL with all required fields for every invocation.
- Oversized outputs are truncated deterministically with complete truncation metadata.
- `npx @f0rty-tw0/agentic-mcp` launches cleanly in a fresh environment.
- `npm audit` passes with no high/critical vulnerabilities before publish.
- Package published with npm provenance attestation.
