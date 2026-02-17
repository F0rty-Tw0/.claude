# Phase 1 Plan: Core (MVP)

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

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

## Recommended Implementation Sequence

1. Create skeleton files from the target structure in `plans/agentic-cli-mcp-server.md` (`src/index.ts`, `src/server.ts`, `src/types.ts`, `src/config/loader.ts`, `src/tools/registry.ts`, `src/utils/command.ts`).
2. Implement Zod schemas first (`ProviderConfig`, capability blocks, command blocks), then make `config/loader.ts` fail-fast for invalid config.
3. Build dynamic `ask_{provider}` schema generation from capability flags, then register handlers via one registry function.
4. Implement command execution with `spawn()` and argument-array safety (no shell mode), with timeout and output-size guardrails.
5. Add core tools (`ask_*`, `ping_*`, `help_*`, `list_providers`) and basic startup provider availability checks.
6. Add typed error classes and map them to MCP tool error responses (`isError: true` for execution-level failures).

## Implementation Notes (Research-Backed)

- MCP tools contract should be driven by `tools/list` + `tools/call` and declared under `capabilities.tools` in server init (MCP spec tools, 2025-11-25).
- Input schemas should stay strict JSON Schema objects; for tools with no args use `{ "type": "object", "additionalProperties": false }` (MCP tools spec).
- Use TypeScript SDK v1.x for production stability; SDK `main` is v2 pre-alpha and not the default production recommendation.
- Keep provider onboarding config-driven: adding a provider must only require a `providers.json` entry, not code changes in handlers.
- For command execution, keep prompt handling mode explicit per provider (`flag`, `positional`, `stdin`) and normalize path/cwd handling for Windows.

## Deliverables

- `package.json` + `tsconfig.json` + build/test/lint scripts wired.
- Zod-validated loader for `providers.json`.
- Dynamic registration for `ask_{provider}`, `ping_{provider}`, `help_{provider}`, and `list_providers`.
- Working adapters for Claude, Codex, Copilot, Gemini, OpenCode.
- Error class set: validation, command execution, provider missing.

## Exit Criteria

- Server starts with invalid config rejected at boot.
- `tools/list` only exposes tools for enabled and available providers.
- `ask_*` calls run for all 5 core providers with model passthrough and timeout enforcement.
- Missing CLI binary produces clear non-crashing tool error.
