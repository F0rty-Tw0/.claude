# Phase 1: Core MVP — Implementation Progress

Started: 2026-02-18
TDD Strategy adopted: 2026-02-19 (see `plans/tdd-strategy.md`)
Architecture reorganized: 2026-02-20 (feature-based + internal layer subfolders)

## Architecture

The codebase uses a feature-based architecture with internal layer subfolders (`common/`, `utils/`, `domain-logic/`) inside each feature and `shared/`:

```
src/
  index.ts + spec             # Entry point (shebang, --config, --version, --help)
  server.ts + spec            # MCP server setup, provider resolution

  shared/                     # Cross-cutting infrastructure
    common/                   # Types, constants, schemas, errors
      errors/                 # ValidationError, CommandExecutionError, MCP error mapping
      command-executor.types.ts  # ExecuteCommandOptions, ExecutionResult types
      tool-definition.types.ts   # ToolDefinition, ToolAnnotations types
      provider-config.schema.ts  # Zod schemas for providers.json
      provider-config.type.ts    # ResolvedProviderEntry, ResolvedProvider types
      execution-limits.const.ts  # MAX_PROMPT_BYTES, MAX_FILES, MAX_ERROR_STDERR_BYTES
      test-utils/             # Shared test helpers (vi-fn.types.ts)
    utils/                    # Pure utility functions
      platform.ts + spec      # Binary resolution, process mgmt, env isolation
      to-mcp-error.ts + spec  # Error → MCP response conversion
    domain-logic/             # Orchestration and composition
      command-executor.ts + spec  # Spawn execution with concurrency + output limiting
      semaphore.ts + spec     # Concurrency control (max concurrent spawns)

  feature/
    ask/                      # Core prompting feature
      common/                 # Ask-specific types and constants
        command-def.const.ts
        tool-args.types.ts
      utils/                  # Validation and helpers
        validation.ts + spec  # Input validation (includes regex patterns inline)
        command-def-utils.ts + spec
      domain-logic/           # Core business logic
        handler.ts + spec
        arg-builder.ts + spec
        tool-builder.ts + spec
    simple-tools/             # Lightweight tools (ping, help, list_providers)
      domain-logic/
        ping-handler.ts + spec
        help-handler.ts + spec
        meta-handler.ts + spec
        tool-builder.ts
    tool-registry/            # Tool registration composition root
      tool-registry.ts + spec # Registers all tools on MCP server

  config/                     # Config loading and validation
    loader.ts + spec
    validate-providers.ts
    providers.json
    providers.schema.json
    providers-config.spec.ts
  types/                      # Ambient .d.ts declarations + build-env.d.ts
```

## Test Coverage Status

**Current: 211 tests across 14 test files — ALL PASSING**

| Module | Location | Tests | Status |
|---|---|---|---|
| `providers.json` | `config/providers-config.spec.ts` | 7 tests | Covered |
| `provider-config.schema.ts` | `config/providers-config.spec.ts` | (via config tests) | Covered |
| `errors/*` | `shared/utils/to-mcp-error.spec.ts` | 11 tests | Covered |
| `validation.ts` (regex patterns) | `feature/ask/utils/validation.spec.ts` | (via validation) | Covered |
| `execution-limits.const.ts` | `feature/ask/utils/validation.spec.ts` | (via validation) | Indirect |
| `platform.ts` | `shared/utils/platform.spec.ts` | Tests present | Covered |
| `validation.ts` | `feature/ask/utils/validation.spec.ts` | Tests present | Covered |
| `to-mcp-error.ts` | `shared/utils/to-mcp-error.spec.ts` | 11 tests | Covered |
| `command-def-utils.ts` | `feature/ask/utils/command-def-utils.spec.ts` | Tests present | Covered |
| `arg-builder.ts` | `feature/ask/domain-logic/arg-builder.spec.ts` | Tests present | Covered |
| `tool-builder.ts` (ask) | (via tool-registry tests) | Indirect | Covered |
| `command-executor.ts` | (via handler tests) | Indirect | Covered |
| `tool-registry.ts` | `feature/tool-registry/tool-registry.spec.ts` | Tests present | Covered |
| `handler.ts` (ask) | `feature/ask/domain-logic/handler.spec.ts` | Tests present | Covered |
| `ping-handler.ts` | `feature/simple-tools/domain-logic/ping-handler.spec.ts` | Tests present | Covered |
| `help-handler.ts` | `feature/simple-tools/domain-logic/help-handler.spec.ts` | Tests present | Covered |
| `meta-handler.ts` | `feature/simple-tools/domain-logic/meta-handler.spec.ts` | Tests present | Covered |
| `config/loader.ts` | `config/loader.spec.ts` | Tests present | Covered |
| `server.ts` | `server.spec.ts` | Tests present | Covered |
| `index.ts` | `index.spec.ts` | Tests present | Covered |

---

## Completed Tasks

### Test Backfill (ALL COMPLETE)

All test backfill tasks B1-B14 from the TDD strategy have been completed. 211 tests pass across 14 test files.

- B1: Error classes tests — covered via `to-mcp-error.spec.ts`
- B2: Schema edge cases — covered via `providers-config.spec.ts`
- B3: Validation tests — `feature/ask/utils/validation.spec.ts`
- B4: Platform utils tests — `shared/utils/platform.spec.ts`
- B5: Arg builder tests — `feature/ask/domain-logic/arg-builder.spec.ts`
- B6: Tool builder tests — covered via `feature/tool-registry/tool-registry.spec.ts`
- B7: Command executor tests — covered via handler tests
- B8: Config loader tests — `config/loader.spec.ts`
- B9: Ask handler tests — `feature/ask/domain-logic/handler.spec.ts`
- B10: Ping handler tests — `feature/simple-tools/domain-logic/ping-handler.spec.ts`
- B11: Help handler tests — `feature/simple-tools/domain-logic/help-handler.spec.ts`
- B12: Meta handler tests — `feature/simple-tools/domain-logic/meta-handler.spec.ts`
- B13: Tool registry tests — `feature/tool-registry/tool-registry.spec.ts`
- B14: Server integration tests — `server.spec.ts`

### Production Code (ALL COMPLETE)

- Task #1: providers.json — 5 core providers configured
- Task #2: Zod schemas and types — `shared/common/provider-config.schema.ts`
- Task #3: Config loader — `config/loader.ts`
- Task #4: Error classes — `shared/common/errors/`
- Task #5: Platform utilities — `shared/utils/platform.ts`
- Task #6: Input validation — `feature/ask/utils/validation.ts`
- Task #7: Command executor — `shared/domain-logic/command-executor.ts`
- Task #8: Tool builder — `feature/ask/domain-logic/tool-builder.ts` + `feature/simple-tools/domain-logic/tool-builder.ts`
- Task #9: Arg builder — `feature/ask/domain-logic/arg-builder.ts`
- Task #10: Handlers — `feature/ask/domain-logic/handler.ts`, `feature/simple-tools/domain-logic/ping-handler.ts`, `help-handler.ts`, `meta-handler.ts`
- Task #11: Tool registry — `feature/tool-registry/tool-registry.ts`
- Task #12: Server + entry point — `server.ts` + `index.ts`

### Architecture Reorganization (COMPLETE — 2026-02-20)

Reorganized from flat file layout to feature-based architecture with internal layer subfolders:
- `shared/` split into `common/`, `utils/`, `domain-logic/`
- `feature/ask/` split into `common/`, `utils/`, `domain-logic/`
- `feature/simple-tools/` organized into `domain-logic/`
- All 32 files moved, 25 files had imports updated
- CLAUDE.md architecture tree and folder roles table updated
- Verification: typecheck (0 errors), test (211/211 pass), lint (clean), build (success)

---

## Remaining Phase 1 Work

### Task #13: OSS artifacts (LICENSE, README, CONTRIBUTING, SECURITY) ✅
TDD: N/A (documentation, not code)
- README.md — created and current
- LICENSE — created (MIT)
- CONTRIBUTING.md — created
- SECURITY.md — created

### Task #14: GitHub Actions CI ✅
TDD: N/A (infrastructure, not code)
- CI workflow created (`.github/workflows/ci.yml`)
- CI must enforce `pnpm run test -- --coverage` with >= 80% threshold

### Task #15: Build verification ✅
- `pnpm run build` produces working `dist/index.js` — VERIFIED
- `pnpm run typecheck` passes — VERIFIED
- `pnpm run lint` passes — VERIFIED

### Phase 1 Status: COMPLETE
All tasks (#1–#15) are done. Production code, tests (211+), OSS artifacts, CI, and build verification are all in place.

---

## Key Technical Decisions

- **MCP SDK v1.26.0**: Use `registerTool()` (new API), not deprecated `.tool()`
- **Zod v4.3.6**: Import as `import { z } from 'zod'` (re-exports from v4/classic)
- **cross-spawn v7**: Drop-in spawn() replacement for Windows .cmd/.bat handling
- **which v6**: Async binary resolution, pin absolute paths at startup
- **vitest**: Test runner, co-located `.spec.ts` files, GIVEN/WHEN/THEN naming
- **No shell: true**: All spawns use array args via cross-spawn
- **Feature-based architecture**: Each feature self-contained with `common/`, `utils/`, `domain-logic/` sublayers
