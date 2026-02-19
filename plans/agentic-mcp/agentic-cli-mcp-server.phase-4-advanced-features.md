# Phase 4 Plan: Advanced Features

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-4-introduction.md`

TDD strategy: `plans/tdd-strategy.md`

## Objectives

- `review_{provider}` tool (Codex initially, extensible)
- Sandbox parameter support (boolean and leveled)
- File context passing (`files` param -> provider-specific `--file`/`@` syntax)
- Per-provider execution queues with FIFO ordering (global semaphore already in Phase 1)
- Per-provider `maxConcurrency` configuration (extends Phase 1's global limit)
- Separate `queueTimeoutMs` and `executionTimeoutMs` per provider
- NPX publish to npm registry with provenance attestation
- `--dry-run` mode (prints command without executing)
- `--audit-log` flag (structured log of all command invocations)

**Moved to Phase 1** (no longer in Phase 4):
- ~~Output size limits~~ (Phase 1 with `maxOutputBytes: 10MB`)
- ~~Concurrency limiting~~ (global semaphore in Phase 1; per-provider queues remain here)

## TDD Implementation Sequence

### Step 1: Per-Provider Execution Queues

**RED — Write tests first** `domain-logic/provider-queue.spec.ts`
- GIVEN a provider with maxConcurrency=1 WHEN 2 concurrent requests THEN second waits for first
- GIVEN a provider with maxConcurrency=3 WHEN 4 concurrent requests THEN 4th waits
- GIVEN a request waiting longer than queueTimeoutMs WHEN timeout expires THEN throws QueueTimeoutError
- GIVEN a global ceiling of 5 WHEN 6 providers each run 1 THEN 6th waits for global slot
- GIVEN a completed request WHEN slot releases THEN next queued request proceeds (FIFO)
- GIVEN different providers WHEN concurrent requests THEN each has independent queue

**RED — QueueTimeoutError tests** (extend `errors.spec.ts`)
- GIVEN a provider and wait time WHEN constructing QueueTimeoutError THEN stores provider and waitMs
- GIVEN a QueueTimeoutError WHEN toMcpResponse THEN returns descriptive error with limit info

**GREEN — Implement** `domain-logic/provider-queue.ts`
- Per-provider FIFO queue with configurable `maxConcurrency` (default: 1)
- Global `maxConcurrentSpawns` ceiling retained as safety net
- `queueTimeoutMs` (default: 30s) per provider
- `QueueTimeoutError` class

**REFACTOR** — Replace Phase 1's global semaphore in `command-executor.ts` with the new queue system.

### Step 2: Dual Timeout Model

**RED — Write tests first** (extend `command-executor.spec.ts`)
- GIVEN a request that exceeds executionTimeoutMs WHEN executing THEN kills process and returns timedOut
- GIVEN a request that exceeds queueTimeoutMs WHEN waiting THEN throws QueueTimeoutError before spawning
- GIVEN a request within both timeouts WHEN executing THEN completes normally
- GIVEN executionTimeoutMs from provider config WHEN executing THEN uses provider-specific timeout

**GREEN — Implement**
- `queueTimeoutMs` starts when request enters queue
- `executionTimeoutMs` starts when CLI process spawns (uses provider `timeout` field)
- Both configurable per-provider

**REFACTOR** — Ensure timeout error messages clearly distinguish queue vs execution timeout.

### Step 3: Review Tool

**RED — Write tests first** `domain-logic/handlers/review.spec.ts`
- GIVEN a provider with review command WHEN handleReview with scope=uncommitted THEN includes uncommitted flag
- GIVEN a provider with review command WHEN handleReview with scope=commit and ref THEN includes commit flag + ref
- GIVEN a provider with review command WHEN handleReview with scope=range and ref THEN includes base flag + ref
- GIVEN a provider without review command WHEN tool registration THEN review tool is not registered
- GIVEN review execution success WHEN handleReview THEN returns review output text
- GIVEN review execution failure WHEN handleReview THEN returns error response

**RED — Tool builder tests** (extend `tool-builder.spec.ts`)
- GIVEN a provider with review command WHEN buildReviewToolDefinition THEN includes scope enum
- GIVEN a provider with review command WHEN buildReviewToolDefinition THEN has readOnlyHint=true
- GIVEN scope=commit WHEN buildReviewToolDefinition THEN ref is required

**RED — Arg builder tests** (extend `arg-builder.spec.ts`)
- GIVEN review command with scope=uncommitted WHEN buildReviewArgArray THEN includes uncommitted flag
- GIVEN review command with scope=commit and ref WHEN buildReviewArgArray THEN includes commit flag + ref

**GREEN — Implement**
- `review_{provider}` handler with `scope` enum (`uncommitted | commit | range`) + optional `ref`
- Tool definition with review-specific schema
- Arg builder for review commands
- Capability-gated registration

**REFACTOR** — Share common execution logic between ask and review handlers.

### Step 4: Sandbox Parameter Support

**RED — Write tests first** (extend `arg-builder.spec.ts`)
- GIVEN a provider with boolean sandbox WHEN sandbox=true THEN includes sandbox flag
- GIVEN a provider with leveled sandbox WHEN sandbox="read-only" THEN includes flag + level
- GIVEN a provider with leveled sandbox WHEN sandbox value not in allowed levels THEN throws ValidationError
- GIVEN a provider without sandbox capability WHEN sandbox param present THEN ignores it

**RED — Validation tests** (extend `validation.spec.ts`)
- GIVEN sandbox levels ["read-only", "workspace-write"] WHEN validating "read-only" THEN passes
- GIVEN sandbox levels WHEN validating "invalid-level" THEN throws ValidationError

**GREEN — Implement**
- Sandbox validation function
- Integration in ask handler arg building (already partially in arg-builder)

**REFACTOR** — Ensure sandbox validation is consistent across ask and review handlers.

### Step 5: File Context Passing

**RED — Write tests first** (extend `arg-builder.spec.ts`)
- GIVEN files and a string file flag WHEN buildArgArray THEN repeats flag per file
- GIVEN files and a null file flag WHEN buildArgArray THEN omits files from args
- GIVEN more than MAX_FILES WHEN validating THEN throws ValidationError
- GIVEN files outside working directory WHEN validating THEN throws ValidationError

**GREEN — Implement** (already partially done in Phase 1 arg-builder)
- Verify and extend file flag handling for all input methods
- Ensure path validation from Phase 1 applies

**REFACTOR** — Minimal; this builds on existing Phase 1 validation.

### Step 6: Dry-Run Mode

**RED — Write tests first** `domain-logic/dry-run.spec.ts`
- GIVEN --dry-run flag WHEN ask tool called THEN returns command array as text without executing
- GIVEN --dry-run flag WHEN ask tool called THEN returns env vars in response
- GIVEN --dry-run flag WHEN review tool called THEN returns review command array
- GIVEN --dry-run flag WHEN ping tool called THEN returns ping command array
- GIVEN no --dry-run flag WHEN ask tool called THEN executes normally

**GREEN — Implement**
- Check for `--dry-run` CLI flag at server startup
- When active: all tool handlers return command inspection instead of executing
- Output: `{ command, args, env, cwd, stdin? }`

**REFACTOR** — Extract dry-run interceptor to avoid duplicating logic in every handler.

### Step 7: Audit Log

**RED — Write tests first** `domain-logic/audit-log.spec.ts`
- GIVEN --audit-log flag WHEN command executes THEN writes JSONL entry to file
- GIVEN audit entry WHEN written THEN includes timestamp, provider, command, exitCode, duration, truncated
- GIVEN no --audit-log flag WHEN command executes THEN does not write
- GIVEN audit log path WHEN multiple commands execute THEN appends entries (not overwrite)
- GIVEN write failure WHEN logging THEN does not crash the server (best-effort)

**GREEN — Implement** `domain-logic/audit-log.ts`
- JSONL writer with structured entries
- Best-effort writes (catch and warn on failure)
- Integrated after command execution completes

**REFACTOR** — Make audit logging a post-execution hook, not inline in handler code.

### Step 8: NPX Packaging

TDD: N/A for packaging (infrastructure, not code). However:

**RED — Write tests first** for build verification:
- GIVEN `pnpm run build` WHEN completed THEN dist/index.js exists and is executable
- GIVEN `pnpm run build` WHEN completed THEN dist/providers.json exists
- GIVEN built package WHEN `npm pack --dry-run` THEN includes only runtime files
- GIVEN built package WHEN npm audit THEN no high/critical vulnerabilities

**GREEN — Implement**
- Finalize `package.json` `bin`, `files`, `prepublishOnly` configuration
- Add `npm audit` to prepublishOnly
- Publish with `--provenance` flag

## New Error Classes (Phase 4)

| Error | When | MCP Response |
|---|---|---|
| `QueueTimeoutError` | Request waited longer than `queueTimeoutMs` | `{ isError: true, content: [{ text: "Queue timeout for {provider}: waited {ms}ms (limit: {limit}ms)." }] }` |

## New Test Files (Phase 4)

```
src/
  domain-logic/
    provider-queue.spec.ts       <- Step 1
    handlers/
      review.spec.ts             <- Step 3
    dry-run.spec.ts              <- Step 6
    audit-log.spec.ts            <- Step 7
  common/
    errors/
      errors.spec.ts             <- Extended: QueueTimeoutError
  domain-logic/
    arg-builder.spec.ts          <- Extended: review args, sandbox, files
    tool-builder.spec.ts         <- Extended: review tool definition
    command-executor.spec.ts     <- Extended: dual timeout
  utils/
    validation.spec.ts           <- Extended: sandbox validation
```

## Implementation Notes (Research-Backed)

- Tool annotations should be set intentionally per tool behavior.
- Keep advanced parameters capability-gated.
- Per-provider queues use `maxConcurrency` from provider config (default: 1).
- Queue timeout and execution timeout are DISTINCT.
- `review_{provider}` uses `scope` enum instead of boolean `uncommitted`.
- `--dry-run` is critical for contributors testing provider configs without real CLIs.
- npm publish with `--provenance` flag for supply chain security.

## Deliverables

- `review_{provider}` handler and schema (Codex first, with `scope` enum).
- Per-provider FIFO queue replacing global semaphore.
- Dual timeout model with `QueueTimeoutError`.
- Sandbox and file-context integration verified end-to-end.
- `--dry-run` mode for command inspection.
- `--audit-log` mode for structured invocation logging.
- Publish-ready package with provenance attestation.
- **All deliverables have corresponding test suites written BEFORE implementation.**

## Exit Criteria

- All tests pass (`pnpm run test`).
- Coverage >= 80% for new Phase 4 modules.
- Review tool works for Codex and is hidden for providers without review support.
- Sandbox and files parameters appear only when capability-enabled.
- Concurrent requests respect per-provider `maxConcurrency` AND global ceiling.
- Queue timeout produces `QueueTimeoutError` distinct from execution timeout.
- `--dry-run` prints exact command array and env without spawning.
- `--audit-log` writes valid JSONL with all required fields.
- `npx @f0rty-tw0/agentic-mcp` launches cleanly in a fresh environment.
- `npm audit` passes with no high/critical vulnerabilities.
