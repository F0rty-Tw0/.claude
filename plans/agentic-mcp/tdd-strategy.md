# TDD Strategy: agentic-mcp

> Cross-cutting methodology document. Applies to ALL phases.

## Iron Law

**NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

Every feature, bugfix, and refactor follows Red-Green-Refactor. Code written before its test is deleted and restarted. No exceptions.

## Red-Green-Refactor Cycle

```
1. RED    — Write a failing test for the NEXT piece of functionality
            Run tests → MUST FAIL (if it passes, the test is wrong)

2. GREEN  — Write ONLY enough code to pass the test
            No extras, no "while I'm here" improvements
            Run tests → MUST PASS

3. REFACTOR — Improve code quality (naming, duplication, structure)
              Run tests after EVERY change → MUST STAY GREEN

4. REPEAT — Next failing test for next increment
```

## Test File Conventions

### Co-location

Tests live next to their source files, using `.spec.ts` suffix:

```
src/
  config/
    loader.ts
    loader.spec.ts              ← unit tests for loader
    providers-config.spec.ts    ← existing: providers.json validation
  domain-logic/
    arg-builder.ts
    arg-builder.spec.ts         ← unit tests for arg builder
    command-executor.ts
    command-executor.spec.ts    ← unit tests for command executor
    tool-builder.ts
    tool-builder.spec.ts        ← unit tests for tool builder
    tool-registry.ts
    tool-registry.spec.ts       ← unit tests for tool registry
    handlers/
      ask.ts
      ask.spec.ts               ← unit tests for ask handler
      help.ts
      help.spec.ts              ← unit tests for help handler
      ping.ts
      ping.spec.ts              ← unit tests for ping handler
      meta.ts
      meta.spec.ts              ← unit tests for meta handler
  common/
    errors/
      errors.spec.ts            ← unit tests for all error classes
    provider-config.schema.ts
    provider-config.schema.spec.ts ← schema validation edge cases
  utils/
    platform.ts
    platform.spec.ts            ← unit tests for platform utils
    validation.ts
    validation.spec.ts          ← unit tests for input validation
  server.ts
  server.spec.ts                ← integration: server setup + tool registration
```

### Naming Pattern: GIVEN/WHEN/THEN

Use **GIVEN/WHEN/THEN** phrasing for test cases (as mandated in CLAUDE.md → Code Style → Testing Style).
The keywords are CAPITALIZED in the test name for visual scanning:

```typescript
describe('<module-name>', () => {
  describe('<function-name>', () => {
    it('GIVEN <context> WHEN <action> THEN <expected outcome>', () => { ... });
    it('GIVEN <invalid input> WHEN <action> THEN throws <ErrorType>', () => { ... });
  });
});
```

**Examples:**

```typescript
describe('validation', () => {
  describe('validateModel', () => {
    it('GIVEN a valid model string WHEN validated THEN does not throw', () => { ... });
    it('GIVEN a model with special chars WHEN validated THEN throws ValidationError', () => { ... });
  });
});

describe('arg-builder', () => {
  describe('buildArgArray', () => {
    it('GIVEN a flag-method provider WHEN building args THEN places prompt after pre-args', () => { ... });
    it('GIVEN a stdin-method provider WHEN building args THEN returns stdinInput', () => { ... });
  });
});
```

## Test Categories

### Unit Tests (per-module, fast, isolated)

- **Pure function tests** — deterministic input/output, no mocks needed
  - `validation.ts`, `arg-builder.ts`, `tool-builder.ts`, error classes, schemas
- **Side-effect tests** — mock external dependencies (spawn, fs, which)
  - `command-executor.ts`, `platform.ts`, `loader.ts`, handlers
- **Schema tests** — Zod parse/safeParse with valid and invalid inputs
  - `provider-config.schema.ts`, `providers-config.spec.ts` (existing)

### Integration Tests (cross-module, MCP protocol)

- **Server registration** — MCP SDK test client sends `tools/list`, verifies tool exposure
- **Tool call flow** — MCP client sends `tools/call`, verifies handler dispatch + response shape
- **Config → Tool chain** — load config → register tools → call tool → get response

## Mock Strategy

### What to Mock

| Dependency | Mock Approach | Used By |
|---|---|---|
| `cross-spawn` | `vi.mock('cross-spawn')` — return mock ChildProcess | `command-executor.ts` |
| `which` | `vi.mock('which')` — return paths or throw | `platform.ts` (`resolveCliBinary`) |
| `fs/promises` | `vi.mock('node:fs/promises')` — mock readFile | `loader.ts` |
| `child_process` | Already covered by cross-spawn mock | - |
| `McpServer` | Mock object with `registerTool` spy | `tool-registry.ts` |
| `process.platform` | `vi.stubGlobal` or conditional mock | `platform.ts` |

### What NOT to Mock

- **Zod schemas** — test the real schema, never mock validation
- **Error classes** — test real error construction and `toMcpResponse()`
- **Arg builder** — test real argument array generation
- **Tool builder** — test real schema generation from config
- **Validation functions** — test real regex and path logic

### Mock Helper: Fake CLI Process

For command-executor tests, create a helper that simulates CLI behavior:

```typescript
// test-helpers/mock-spawn.ts
export const createMockChildProcess = (options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  signal?: string;
  delay?: number;
}) => { ... };
```

## Test Backfill Strategy (Phase 1 Debt)

The following modules were written before TDD was adopted. They need retroactive test coverage before any further feature work proceeds.

### Priority Order (test from leaf → root)

Tests for leaf modules (no internal dependencies) are written first, then modules that depend on them, building confidence bottom-up:

```
Layer 0 — No dependencies (pure):
  1. common/errors/*.spec.ts         (error classes + toMcpError)
  2. common/provider-config.schema.spec.ts  (schema edge cases)
  3. utils/validation.spec.ts        (regex, path validation)

Layer 1 — Depends on Layer 0:
  4. utils/platform.spec.ts          (mock: which, child_process)
  5. domain-logic/arg-builder.spec.ts (pure: config → args array)
  6. domain-logic/tool-builder.spec.ts (pure: config → tool definitions)

Layer 2 — Depends on Layers 0-1:
  7. domain-logic/command-executor.spec.ts (mock: cross-spawn)
  8. config/loader.spec.ts           (mock: fs)

Layer 3 — Depends on Layers 0-2:
  9. domain-logic/handlers/ask.spec.ts     (mock: executeCommand, validation)
  10. domain-logic/handlers/ping.spec.ts   (mock: executeCommand)
  11. domain-logic/handlers/help.spec.ts   (mock: executeCommand)
  12. domain-logic/handlers/meta.spec.ts   (pure: provider list → result)

Layer 4 — Integration:
  13. domain-logic/tool-registry.spec.ts   (mock: McpServer)
  14. server.spec.ts                       (integration: full registration)
```

### Backfill TDD Adaptation

Even for retroactive tests, apply TDD discipline:

1. **Write the test** describing expected behavior of the existing code
2. **Run the test** — it SHOULD pass (since code exists). If it fails, you found a bug.
3. **If the test passes trivially** (e.g., testing the wrong thing), refine it until it meaningfully exercises the code.
4. **Add edge case tests** that push boundaries — these may reveal bugs.

## Per-Phase TDD Integration

### Phase 1 Remaining Work

Every remaining task follows this sequence:
1. Write `.spec.ts` file with failing tests
2. Run `pnpm run test` — confirm failures
3. Implement minimal code to pass
4. Run `pnpm run test` — confirm pass
5. Refactor
6. Run `pnpm run test` + `pnpm run lint` + `pnpm run typecheck` — all green

### Phases 2-4

Each objective in the phase plan has a **TDD Cycle** section specifying:
- **Test scenarios** — what tests to write first
- **Expected failures** — what error/assertion to expect from the RED phase
- **Minimal implementation** — scope of the GREEN phase
- **Refactor targets** — what to clean up

## Coverage Targets

| Scope | Target | Notes |
|---|---|---|
| `src/common/` | 95% | Pure schemas, types, errors — easy to test |
| `src/utils/` | 90% | Validation is pure, platform needs mocks |
| `src/domain-logic/` | 85% | Handlers need spawn mocks, arg-builder is pure |
| `src/config/` | 85% | Loader needs fs mock |
| `src/server.ts` | 70% | Integration-heavy, some paths hard to test |
| `src/index.ts` | Excluded | Entry point, tested via integration |
| **Overall** | **80%** | Enforced in CI |

## Commands

```bash
pnpm run test              # Run all tests
pnpm run test -- --watch   # Watch mode during TDD cycles
pnpm run test -- --coverage # Coverage report
pnpm run test -- <pattern>  # Run specific test file
```

## Enforcement

- **CI gate**: `pnpm run test -- --coverage` must pass with >= 80% line coverage
- **PR reviews**: every PR with production code must include corresponding tests
- **No test skips**: `it.skip()` / `describe.skip()` are not allowed in committed code
- **Lint rule**: consider `eslint-plugin-vitest` for test quality enforcement
