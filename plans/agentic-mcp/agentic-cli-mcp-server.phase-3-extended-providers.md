# Phase 3 Plan: Extended Providers

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-3-introduction.md`

TDD strategy: `plans/tdd-strategy.md`

## Objectives

### Wave 3a: Popular Tools (stable CLIs, good documentation)
- Aider provider (text output, flag-based input, widely used)
- Goose provider (JSON output, flag-based input, session support)
- Amp provider (stream-json, stdin-based input, thread sessions)

### Wave 3b: IDE-Adjacent Tools (newer CLIs, JSON output)
- Cline provider (JSON output, positional input)
- Cursor Agent provider (JSON output, flag-based input, session support)
- Droid provider (JSON output, positional input, leveled sandbox, sessions)

### Wave 3c: Specialized/Experimental (defer to post-stabilization)
- Amazon Q, Plandex, OpenHands, Qwen Code, Tabnine (disabled by default)

## Phase Dependencies

- Phase 3 can run in parallel with Phase 2 (both depend only on Phase 1).
- Providers with native session support use Tier 1 fallback until Phase 2 ships Tier 2.

## TDD Implementation Sequence

### Step 1: Schema Extension for `supportLevel`

**RED — Write tests first** (extend `providers-config.spec.ts`)
- GIVEN a provider with supportLevel "stable" WHEN parsed THEN succeeds
- GIVEN a provider with supportLevel "beta" WHEN parsed THEN succeeds
- GIVEN a provider with supportLevel "experimental" WHEN parsed THEN succeeds
- GIVEN a provider with supportLevel "community" WHEN parsed THEN succeeds
- GIVEN a provider with invalid supportLevel WHEN parsed THEN fails
- GIVEN a provider without supportLevel WHEN parsed THEN succeeds (optional field)

**GREEN — Implement**
- Add optional `supportLevel` field to `providerConfigSchema`
- Add to existing Phase 1 providers as `"stable"`

**REFACTOR** — Update `list_providers` handler to include supportLevel in output.

### Step 2: Wave 3a Providers — Config + Validation Tests

For each provider (Aider, Goose, Amp), follow the same pattern:

**RED — Write tests first** (extend `providers-config.spec.ts`)
- GIVEN the aider provider config WHEN parsed against Zod schema THEN succeeds
- GIVEN the goose provider config WHEN parsed against Zod schema THEN succeeds
- GIVEN the amp provider config WHEN parsed against Zod schema THEN succeeds

**RED — Arg builder tests** (extend `arg-builder.spec.ts`)
- GIVEN aider config (flag method) WHEN buildArgArray with prompt THEN produces correct args
- GIVEN goose config (flag method) WHEN buildArgArray with prompt THEN produces correct args
- GIVEN amp config (stdin method) WHEN buildArgArray with prompt THEN returns stdinInput

**RED — Tool builder tests** (extend `tool-builder.spec.ts`)
- GIVEN aider config WHEN buildAskToolDefinition THEN includes model, autoMode, files params
- GIVEN goose config WHEN buildAskToolDefinition THEN includes model, session_id params
- GIVEN amp config WHEN buildAskToolDefinition THEN includes session_id param only (minimal)

**GREEN — Implement**
- Add Aider, Goose, Amp entries to `providers.json`
- Verify all tests pass with new configs

**REFACTOR** — Ensure consistent config patterns across providers.

### Step 3: Wave 3a Compatibility Verification

For each Wave 3a provider, run the compatibility checklist:

| # | Check | Aider | Goose | Amp |
|---|---|---|---|---|
| 1 | CLI binary responds to `--version` | | | |
| 2 | `--help` returns successfully | | | |
| 3 | Minimal ask invocation returns output | | | |
| 4 | Model flag works (if declared) | | | |
| 5 | Output format matches declared type | | | |
| 6 | Session resume works (if declared) | | | |
| 7 | Config passes Zod validation | | | |

### Step 4: Wave 3b Providers — Config + Validation Tests

Same pattern as Wave 3a:

**RED — Write tests first** (extend `providers-config.spec.ts`)
- GIVEN the cline provider config WHEN parsed THEN succeeds
- GIVEN the cursor provider config WHEN parsed THEN succeeds
- GIVEN the droid provider config WHEN parsed THEN succeeds

**RED — Arg builder tests** (extend `arg-builder.spec.ts`)
- GIVEN cline config (positional) WHEN buildArgArray THEN places prompt positionally
- GIVEN cursor config (flag) WHEN buildArgArray THEN includes resume flags when session active
- GIVEN droid config (positional, leveled sandbox) WHEN buildArgArray THEN includes sandbox level

**RED — Tool builder tests** (extend `tool-builder.spec.ts`)
- GIVEN droid config with leveled sandbox WHEN buildAskToolDefinition THEN includes sandbox enum

**GREEN — Implement** — Add Cline, Cursor, Droid entries to `providers.json`.

### Step 5: Wave 3c Providers — Disabled Templates

**RED — Write tests first** (extend `providers-config.spec.ts`)
- GIVEN each Wave 3c provider config WHEN parsed THEN succeeds (schema-valid even if disabled)
- GIVEN Wave 3c providers WHEN checking enabled THEN all are false
- GIVEN Wave 3c providers WHEN checking supportLevel THEN all are "experimental" or "community"
- GIVEN Wave 3c providers WHEN checking prerequisites THEN all have non-empty prerequisites array

**GREEN — Implement** — Add disabled provider configs with prerequisites documented.

### Step 6: `list_providers` Enhancement

**RED — Write tests first** (extend `handlers/meta.spec.ts`)
- GIVEN providers with supportLevel WHEN handleListProviders THEN includes supportLevel in output
- GIVEN providers with prerequisites WHEN handleListProviders THEN includes prerequisites in output
- GIVEN a mix of stable/beta/experimental WHEN handleListProviders THEN groups or labels them

**GREEN — Implement** — Update `handleListProviders` to include new fields.

## Provider Compatibility Checklist

Complete for each provider before setting `enabled: true`:

| # | Check |
|---|---|
| 1 | CLI binary exists and responds to `--version` |
| 2 | `--help` returns successfully |
| 3 | Minimal `ask_*` invocation returns output |
| 4 | Model flag works (if declared) |
| 5 | Output format matches declared `outputFormat` |
| 6 | Session resume works (if declared) |
| 7 | Working directory flag works (if declared) |
| 8 | File context flag works (if declared) |
| 9 | Auto-mode flags work (if declared) |
| 10 | Timeout is reasonable |
| 11 | Config passes Zod schema validation |

### Provider Prerequisites Matrix

| Provider | Prerequisites | Auth Method | Startup Check |
|---|---|---|---|
| Aider | Python, pip install | API key env var | `aider --version` |
| Goose | Homebrew/cargo install | Config file | `goose --version` |
| Amp | npm install | Sourcegraph auth | `amp --version` |
| Cline | npm install | VS Code extension config | `cline --version` |
| Cursor | Cursor IDE install | Cursor auth | `cursor-agent --version` |
| Droid | npm/pip install | Factory.ai auth | `droid --version` |
| Amazon Q | AWS CLI v2 | AWS SSO/credentials | `q --version` |
| Plandex | Go install + server running | Self-hosted auth | `plandex --version` |
| OpenHands | Docker running | None (local) | `openhands --version` |
| Qwen Code | pip install | Alibaba Cloud auth | `qwen-code --version` |
| Tabnine | npm install | Tabnine account | `tabnine --version` |

## New/Extended Test Files (Phase 3)

```
src/
  config/
    providers-config.spec.ts     <- Extended: Wave 3a/3b/3c config validation
  domain-logic/
    arg-builder.spec.ts          <- Extended: new provider arg patterns
    tool-builder.spec.ts         <- Extended: new provider tool definitions
    handlers/
      meta.spec.ts               <- Extended: supportLevel, prerequisites
```

## Implementation Notes (Research-Backed)

- Use capability gates aggressively: only expose tools where the provider reliably supports them.
- Keep unsupported features explicit (`null` model flag, text output only).
- Provider onboarding should be reversible: unstable providers disabled by default.
- All `resumeFlag` and `continueFlag` values must be `string[]` arrays.
- Provider configs for experimental providers should include `prerequisites` array.

## Deliverables

- Wave 3a provider configs: Aider, Goose, Amp (enabled, tested).
- Wave 3b provider configs: Cline, Cursor, Droid (enabled where CLI accessible, tested).
- Wave 3c provider configs: Amazon Q, Plandex, OpenHands, Qwen Code, Tabnine (disabled, templates ready).
- `supportLevel` field added to all provider configs.
- Completed compatibility checklist per provider.
- Updated `list_providers` output reflecting support levels and prerequisites.
- **All config additions have corresponding test cases written BEFORE the config is added.**

## Exit Criteria

- All tests pass (`pnpm run test`).
- Every Wave 3a/3b provider has test cases for config validation, arg building, and tool building.
- Wave 3c providers are explicitly disabled with documented rationale and prerequisites.
- Tool exposure matches provider capabilities — no dead tools.
- `list_providers` returns accurate `supportLevel` and `prerequisites`.
- All new provider configs pass Zod schema validation.
