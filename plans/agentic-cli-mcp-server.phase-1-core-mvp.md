# Phase 1 Plan: Core (MVP)

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-1-introduction.md`

## Objectives

- TypeScript project setup (`package.json`, `tsconfig.json`)
- Zod schema for `providers.json` + config loader
- `ask_{provider}` tool with dynamic param extension
- spawn-based command execution (blocking, no streaming yet)
- `ping_{provider}` and `help_{provider}` tools
- `list_providers` meta-tool
- 5 core providers: Claude, Codex, Copilot, Gemini, OpenCode
- Error handling (3 error classes)
- Startup CLI availability check
- Platform handling (Windows signals, path normalization)
- Global spawn semaphore (`maxConcurrentSpawns: 5` default)
- Output size limits (`maxOutputBytes: 10MB` per stream, with truncation metadata)
- Input validation: model regex, sessionId regex, workingDirectory/files path canonicalization
- Child process environment isolation (minimal base + provider-declared env only)
- Open-source artifacts: README.md, LICENSE (MIT), CONTRIBUTING.md, SECURITY.md
- GitHub Actions CI pipeline (lint, typecheck, unit tests; matrix: Node 20/22, Ubuntu/Windows/macOS)

## Recommended Implementation Sequence

1. Create skeleton files from the target structure in `plans/agentic-cli-mcp-server.md` (`src/index.ts`, `src/server.ts`, `src/types.ts`, `src/config/loader.ts`, `src/tools/registry.ts`, `src/utils/command.ts`).
2. Implement Zod schemas first (`ProviderConfig`, capability blocks, command blocks), then make `config/loader.ts` fail-fast for invalid config.
3. Build dynamic `ask_{provider}` schema generation from capability flags, then register handlers via one registry function.
4. Implement command execution with `spawn()` and argument-array safety (no shell mode), with timeout and output-size guardrails.
5. Add core tools (`ask_*`, `ping_*`, `help_*`, `list_providers`) and basic startup provider availability checks.
6. Add typed error classes and map them to MCP tool error responses (`isError: true` for execution-level failures).
7. Add input validation layer: regex for `model` (`^[a-zA-Z0-9][a-zA-Z0-9._:\-/]{0,127}$`), `sessionId` (`^[a-zA-Z0-9][a-zA-Z0-9._:\-]{0,63}$`), and path canonicalization for `workingDirectory` and `files` params against configured allowlist.
8. Add global spawn semaphore (promise-based, max 5 concurrent) wrapping all CLI invocations.
9. Add output size guardrails: truncate stdout/stderr independently at `maxOutputBytes`, include `truncated: boolean` and byte counts in response metadata.
10. Implement child process environment isolation: construct env from minimal base (`PATH`, `HOME`, `TEMP`) + provider `env` entries. Never pass full `process.env`.
11. Set up project CI: GitHub Actions workflow for lint + typecheck + unit tests on PR.
12. Create open-source artifacts: LICENSE (MIT), README with quick start + provider matrix, CONTRIBUTING.md with "How to add a provider" tutorial, SECURITY.md with trust model.

## Implementation Notes (Research-Backed)

- MCP tools contract should be driven by `tools/list` + `tools/call` and declared under `capabilities.tools` in server init (MCP spec tools, 2025-11-25).
- Input schemas should stay strict JSON Schema objects; for tools with no args use `{ "type": "object", "additionalProperties": false }` (MCP tools spec).
- Use TypeScript SDK v1.x for production stability; SDK `main` is v2 pre-alpha and not the default production recommendation.
- Keep provider onboarding config-driven: adding a provider must only require a `providers.json` entry, not code changes in handlers.
- For command execution, keep prompt handling mode explicit per provider (`flag`, `positional`, `stdin`) and normalize path/cwd handling for Windows.
- On Windows, many Node CLIs are installed as `.cmd` wrappers. `spawn()` without `shell: true` will fail for these. Use `cross-spawn` package or detect `.cmd` extension and adjust spawn options accordingly. Do NOT use `shell: true` (security risk).
- For `which`/`where` CLI detection, use Node's `fs.accessSync` with PATH resolution rather than spawning a shell. Consider using the `which` npm package for cross-platform compatibility.
- Resolve CLI binary paths to absolute paths at startup and store them. Use absolute paths for ALL subsequent spawns (prevents PATH manipulation attacks).
- When `sessionId` is passed in Phase 1 (before Phase 2 sessions exist): accept and ignore it silently. Return it in response metadata unchanged. This preserves forward compatibility without confusing users.

## Testing Strategy

### Unit Tests
- **Config validation**: Validate all 16 shipped provider configs against Zod schema. Test rejection of invalid configs (missing required fields, type mismatches, cross-field invariant violations like `capabilities.review: true` without `commands.review`).
- **Arg builder**: Test command array generation for each `input.method` (`flag`, `positional`, `stdin`) with varying combinations of model, context, sessionId, workingDirectory, files.
- **Input validation**: Test regex acceptance/rejection for model names, session IDs. Test path canonicalization and traversal rejection.
- **Error classes**: Test that each error class produces correct MCP error response shape.

### Mock Strategy
- Use `jest.mock('child_process')` to mock `spawn()` for all command execution tests.
- Create a `mock-cli.js` test helper that simulates CLI behavior (echo args, return JSON, return text, timeout, non-zero exit).
- Mock `which`/`where` for startup availability checks.

### Integration Tests
- Use MCP SDK's test client to send `tools/list` and `tools/call` requests to the server in-process.
- Validate that tool registration matches enabled provider capabilities.
- Validate that disabled/unavailable providers produce no tools.

### CI Pipeline
- GitHub Actions: lint + typecheck + `jest --coverage` on every PR.
- Matrix: Node 20, Node 22 × Ubuntu, Windows, macOS.
- Coverage target: 80% line coverage for `src/` (excluding `index.ts` entry point).

## Deliverables

- `package.json` + `tsconfig.json` + build/test/lint scripts wired.
- Zod-validated loader for `providers.json`.
- Dynamic registration for `ask_{provider}`, `ping_{provider}`, `help_{provider}`, and `list_providers`.
- Working adapters for Claude, Codex, Copilot, Gemini, OpenCode.
- Error class set: validation, command execution, provider missing.
- Input validation module with regex validators and path canonicalization.
- Global spawn semaphore with configurable limit.
- Output truncation with metadata in responses.
- Child process environment isolation.
- README.md, LICENSE, CONTRIBUTING.md, SECURITY.md.
- GitHub Actions CI workflow.
- Unit test suite with mock-spawn infrastructure.

## Exit Criteria

- Server starts with invalid config rejected at boot.
- `tools/list` only exposes tools for enabled and available providers.
- `ask_*` calls run for all 5 core providers with model passthrough and timeout enforcement.
- Missing CLI binary produces clear non-crashing tool error.
- Input validation rejects malicious model names, session IDs, and path traversal attempts.
- Concurrent spawn count never exceeds configured limit (verified by test).
- Oversized CLI output is truncated with `truncated: true` in response metadata.
- Child processes receive only declared env vars, not full `process.env`.
- CI pipeline passes on all matrix combinations (Node 20/22, Ubuntu/Windows/macOS).
- Unit test coverage ≥80% for `src/`.
