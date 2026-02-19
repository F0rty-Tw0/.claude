# Phase 1: Core MVP — Implementation Progress

Started: 2026-02-18
TDD Strategy adopted: 2026-02-19 (see `plans/tdd-strategy.md`)

## TDD Status

| Module | Production Code | Tests | Status |
|---|---|---|---|
| `config/providers.json` | Done | `providers-config.spec.ts` (7 tests) | Covered |
| `common/provider-config.schema.ts` | Done | Needs backfill | **TEST DEBT** |
| `common/errors/*` | Done | Needs backfill | **TEST DEBT** |
| `common/validation-patterns.const.ts` | Done | Tested via validation.spec | Indirect |
| `common/execution-limits.const.ts` | Done | Tested via validation.spec | Indirect |
| `utils/platform.ts` | Done | Needs backfill | **TEST DEBT** |
| `utils/validation.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/arg-builder.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/tool-builder.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/command-executor.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/tool-registry.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/handlers/ask.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/handlers/ping.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/handlers/help.ts` | Done | Needs backfill | **TEST DEBT** |
| `domain-logic/handlers/meta.ts` | Done | Needs backfill | **TEST DEBT** |
| `config/loader.ts` | Done | Needs backfill | **TEST DEBT** |
| `server.ts` | Done | Needs backfill | **TEST DEBT** |
| `index.ts` | Done | Excluded from coverage | Entry point |

**Current coverage: ~5% (1 test file / 17 modules)**
**Target: 80% line coverage**

---

## Priority 0: Test Backfill (BEFORE any new features)

All existing production code needs retroactive test coverage. Follow the layered order from `plans/tdd-strategy.md` → Test Backfill Strategy.

### Backfill Layer 0 — Pure modules (no internal deps)

**Task B1: Error classes tests** `common/errors/errors.spec.ts`
- GIVEN a message WHEN constructing ValidationError THEN stores message and name
- GIVEN details WHEN constructing CommandExecutionError THEN stores exitCode, signal, timedOut, stderr
- GIVEN a provider/command WHEN constructing ProviderNotFoundError THEN stores both
- GIVEN any error WHEN calling toMcpResponse THEN returns `{ isError: true, content: [{ type: 'text', text }] }`
- GIVEN an unknown error WHEN calling toMcpError THEN wraps it in a generic MCP response
- GIVEN a ValidationError WHEN calling toMcpError THEN delegates to toMcpResponse

**Task B2: Schema edge cases** `common/provider-config.schema.spec.ts`
- GIVEN a valid minimal provider config WHEN parsed THEN succeeds
- GIVEN missing required fields WHEN parsed THEN fails with specific paths
- GIVEN invalid outputFormat value WHEN parsed THEN fails
- GIVEN commands without ask WHEN parsed THEN fails with "ask" message
- GIVEN a leveled flag with empty values WHEN parsed THEN fails
- GIVEN a null flag value WHEN parsed THEN succeeds (null is valid FlagValue)
- GIVEN nested flags with mixed types WHEN parsed THEN succeeds

**Task B3: Validation tests** `utils/validation.spec.ts`
- GIVEN valid model strings WHEN validateModel THEN does not throw
- GIVEN invalid model strings (special chars, too long, empty) WHEN validateModel THEN throws ValidationError
- GIVEN valid session IDs WHEN validateSessionId THEN does not throw
- GIVEN invalid session IDs WHEN validateSessionId THEN throws ValidationError
- GIVEN prompt within limit WHEN validatePromptSize THEN does not throw
- GIVEN prompt exceeding 1MB WHEN validatePromptSize THEN throws ValidationError
- GIVEN context within limit WHEN validateContextSize THEN does not throw
- GIVEN context exceeding 512KB WHEN validateContextSize THEN throws ValidationError
- GIVEN a clean path WHEN validateWorkingDirectory THEN returns resolved path
- GIVEN a path with ".." WHEN validateWorkingDirectory THEN throws ValidationError
- GIVEN files within working dir WHEN validateFiles THEN returns resolved paths
- GIVEN files escaping working dir WHEN validateFiles THEN throws ValidationError
- GIVEN more than MAX_FILES WHEN validateFiles THEN throws ValidationError

### Backfill Layer 1 — Depends on Layer 0

**Task B4: Platform utils tests** `utils/platform.spec.ts`
- GIVEN a pid on win32 WHEN killProcess THEN spawns taskkill with /T /F
- GIVEN a pid on posix WHEN killProcess THEN sends SIGTERM then SIGKILL after delay
- GIVEN provider env overrides WHEN buildMinimalEnv THEN merges with base env
- GIVEN null env values WHEN buildMinimalEnv THEN excludes those keys
- GIVEN an existing binary WHEN resolveCliBinary THEN returns absolute path
- GIVEN a missing binary WHEN resolveCliBinary THEN throws ProviderNotFoundError
- GIVEN a string with ANSI codes WHEN stripAnsi THEN removes all escape sequences
- GIVEN a clean string WHEN stripAnsi THEN returns unchanged

**Task B5: Arg builder tests** `domain-logic/arg-builder.spec.ts`
- GIVEN a flag-method provider WHEN buildArgArray THEN places prompt after args
- GIVEN a positional-method provider WHEN buildArgArray THEN places prompt after args
- GIVEN a stdin-method provider WHEN buildArgArray THEN returns stdinInput and excludes prompt from args
- GIVEN a provider with model flag and model arg WHEN buildArgArray THEN includes model flag + value
- GIVEN a provider without model flag WHEN buildArgArray THEN omits model from args
- GIVEN a provider with workingDir flag WHEN buildArgArray THEN includes working dir flag + value
- GIVEN a provider with file flag and files WHEN buildArgArray THEN repeats flag per file
- GIVEN a provider with autoMode flag and autoMode=true WHEN buildArgArray THEN includes auto flags
- GIVEN a provider with sandbox leveled flag WHEN buildArgArray THEN includes sandbox flag + level
- GIVEN trailing args in config WHEN buildArgArray THEN appends them last

**Task B6: Tool builder tests** `domain-logic/tool-builder.spec.ts`
- GIVEN a provider name and config WHEN buildAskToolDefinition THEN returns name `ask_<name>`
- GIVEN a config with model flag WHEN buildAskToolDefinition THEN schema includes optional model
- GIVEN a config without model flag WHEN buildAskToolDefinition THEN schema excludes model
- GIVEN a config with sessions command WHEN buildAskToolDefinition THEN schema includes session_id
- GIVEN a config with leveled sandbox WHEN buildAskToolDefinition THEN schema includes string sandbox
- GIVEN a provider name WHEN buildPingToolDefinition THEN returns readOnlyHint=true
- GIVEN a provider name WHEN buildHelpToolDefinition THEN returns readOnlyHint=true
- GIVEN no args WHEN buildListProvidersDefinition THEN returns correct name and annotations

### Backfill Layer 2 — Depends on Layers 0-1

**Task B7: Command executor tests** `domain-logic/command-executor.spec.ts`
- GIVEN a command that succeeds WHEN executeCommand THEN returns stdout, exitCode=0
- GIVEN a command that fails WHEN executeCommand THEN returns non-zero exitCode + stderr
- GIVEN a command that exceeds timeout WHEN executeCommand THEN returns timedOut=true
- GIVEN a command producing >10MB stdout WHEN executeCommand THEN truncates and sets truncated=true
- GIVEN stdin input WHEN executeCommand THEN writes to child stdin
- GIVEN concurrent calls exceeding MAX_CONCURRENT_SPAWNS WHEN executeCommand THEN queues excess
- GIVEN a command that cannot spawn WHEN executeCommand THEN throws CommandExecutionError

**Task B8: Config loader tests** `config/loader.spec.ts`
- GIVEN a valid bundled config WHEN loadConfig THEN returns parsed providers
- GIVEN --config flag path WHEN loadConfig THEN uses that file
- GIVEN AGENTIC_MCP_CONFIG env WHEN loadConfig THEN uses that path
- GIVEN invalid JSON WHEN loadConfig THEN throws with parse error
- GIVEN schema-invalid config WHEN loadConfig THEN throws ValidationError
- GIVEN user config overrides WHEN loadConfig THEN deep-merges over defaults

### Backfill Layer 3 — Depends on Layers 0-2

**Task B9: Ask handler tests** `domain-logic/handlers/ask.spec.ts`
- GIVEN valid args WHEN handleAsk THEN calls executeCommand with correct args and returns text
- GIVEN a prompt exceeding size limit WHEN handleAsk THEN returns validation error
- GIVEN an invalid model WHEN handleAsk THEN returns validation error
- GIVEN a command that fails WHEN handleAsk THEN returns CommandExecutionError MCP response
- GIVEN output with ANSI codes WHEN handleAsk THEN strips them from response

**Task B10: Ping handler tests** `domain-logic/handlers/ping.spec.ts`
- GIVEN an available CLI WHEN handlePing THEN returns version text
- GIVEN an unavailable CLI WHEN handlePing THEN returns error response

**Task B11: Help handler tests** `domain-logic/handlers/help.spec.ts`
- GIVEN an available CLI WHEN handleHelp THEN returns help text
- GIVEN a CLI that fails --help WHEN handleHelp THEN returns error response

**Task B12: Meta handler tests** `domain-logic/handlers/meta.spec.ts`
- GIVEN multiple providers WHEN handleListProviders THEN returns formatted list
- GIVEN mix of available/unavailable WHEN handleListProviders THEN shows status per provider

### Backfill Layer 4 — Integration

**Task B13: Tool registry tests** `domain-logic/tool-registry.spec.ts`
- GIVEN resolved providers WHEN registerAllTools THEN calls registerTool for ask, ping, help per provider
- GIVEN resolved providers WHEN registerAllTools THEN always registers list_providers
- GIVEN an empty provider list WHEN registerAllTools THEN only registers list_providers

**Task B14: Server integration tests** `server.spec.ts`
- GIVEN a valid config WHEN server starts THEN tools/list returns expected tools
- GIVEN disabled providers WHEN server starts THEN their tools are not registered
- GIVEN an enabled provider WHEN tools/call ask THEN dispatches to handler

---

## Completed (Pre-TDD)

### Task #1: providers.json [DONE]
- Created `src/config/providers.json` with versioned wrapper (`configVersion: 1`)
- 5 core providers: Claude, Codex, Copilot, Gemini, OpenCode
- All CLI flags verified against official documentation

### Task #2: Zod schemas and types [DONE]
- `src/common/provider-config.schema.ts` — Zod v4 schemas
- `src/common/provider-config.types.ts` — inferred types
- `src/common/validation-patterns.const.ts` — regex patterns
- `src/common/execution-limits.const.ts` — size limits

### Task #3: Config loader [DONE]
- `src/config/loader.ts` — multi-source config resolution

### Task #4: Error classes [DONE]
- `src/common/errors/` — ValidationError, CommandExecutionError, ProviderNotFoundError, toMcpError

### Task #5: Platform utilities [DONE]
- `src/utils/platform.ts` — killProcess, buildMinimalEnv, resolveCliBinary, stripAnsi

### Task #6: Input validation [DONE]
- `src/utils/validation.ts` — model, sessionId, prompt size, context size, path, files

### Task #7: Command executor [DONE]
- `src/domain-logic/command-executor.ts` — spawn, semaphore, truncation, timeout

### Task #8: Tool builder [DONE]
- `src/domain-logic/tool-builder.ts` — dynamic schema generation per provider

### Task #9: Arg builder [DONE]
- `src/domain-logic/arg-builder.ts` — config -> CLI args array

### Task #10: Handlers [DONE]
- `src/domain-logic/handlers/ask.ts`, `ping.ts`, `help.ts`, `meta.ts`

### Task #11: Tool registry [DONE]
- `src/domain-logic/tool-registry.ts` — registerAllTools

### Task #12: Server + entry point [DONE]
- `src/server.ts` + `src/index.ts`

---

## Remaining Phase 1 Work

### Task #13: OSS artifacts (LICENSE, README, CONTRIBUTING, SECURITY)
TDD: N/A (documentation, not code)

### Task #14: GitHub Actions CI
TDD: N/A (infrastructure, not code)
CI must enforce `pnpm run test -- --coverage` with >= 80% threshold.

### Task #15: Build verification
- Verify `pnpm run build` produces working `dist/index.js`
- Verify `pnpm run typecheck` passes
- Verify `pnpm run lint` passes

---

## Implementation Order (Updated for TDD)

```
1. Test Backfill B1-B3  (Layer 0 — pure, no mocks)     <- START HERE
2. Test Backfill B4-B6  (Layer 1 — light mocks)
3. Test Backfill B7-B8  (Layer 2 — spawn/fs mocks)
4. Test Backfill B9-B12 (Layer 3 — handler mocks)
5. Test Backfill B13-B14 (Layer 4 — integration)
6. Task #13: OSS artifacts
7. Task #14: CI pipeline (with coverage gate)
8. Task #15: Build verification
```

All backfill tasks are parallelizable within each layer.

---

## Files Created So Far

```
src/
  index.ts              # Entry point
  server.ts             # MCP server setup
  common/
    provider-config.schema.ts  # Zod schemas
    provider-config.types.ts   # Inferred types
    validation-patterns.const.ts # Regex patterns
    execution-limits.const.ts    # Size limits
    errors/
      validation-error.ts
      command-execution.error.ts
      provider-not-found.error.ts
      mcp-error-response.ts
      to-mcp-error.ts
  config/
    loader.ts              # Config resolution
    providers.json         # 5 core provider configs
    providers-config.spec.ts # TESTED (7 tests)
    validate-providers.ts  # CLI validation script
  domain-logic/
    arg-builder.ts         # Config -> CLI args
    tool-builder.ts        # Config -> tool definitions
    command-executor.ts    # Spawn + semaphore
    tool-registry.ts       # Register tools on server
    handlers/
      ask.ts
      ping.ts
      help.ts
      meta.ts
  utils/
    platform.ts            # Cross-platform helpers
    validation.ts          # Input validation
  types/
    declarations.d.ts      # Ambient types for which v6
```

## Key Technical Decisions

- **MCP SDK v1.26.0**: Use `registerTool()` (new API), not deprecated `.tool()`
- **Zod v4.3.6**: Import as `import { z } from 'zod'` (re-exports from v4/classic)
- **cross-spawn v7**: Drop-in spawn() replacement for Windows .cmd/.bat handling
- **which v6**: Async binary resolution, pin absolute paths at startup
- **vitest**: Test runner, co-located `.spec.ts` files, GIVEN/WHEN/THEN naming
- **No shell: true**: All spawns use array args via cross-spawn
