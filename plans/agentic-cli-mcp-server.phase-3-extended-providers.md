# Phase 3 Plan: Extended Providers

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-3-introduction.md`

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
- Amazon Q provider (text output, known non-interactive bugs — beta status)
- Plandex provider (text output, requires running server — experimental status)
- OpenHands provider (JSONL output, requires Docker — experimental status)
- Qwen Code provider (text output, limited docs — community status)
- Tabnine provider (JSON output, managed model — community status)

## Phase Dependencies

- **Phase 3 can run in parallel with Phase 2.** Adding provider configs only requires Phase 1's config loader and tool registry.
- **However**: Providers with native session support (Goose, Amp, Cursor, Droid) will only have their `sessions_{provider}` tools fully functional after Phase 2 completes. During Phase 3 development:
  - Add session capability configs now (they are config-only).
  - Session tools will be registered but will use Tier 1 context-prepend until Phase 2 ships Tier 2 native passthrough.
  - Test with `sessionId` parameter to verify Tier 1 fallback works correctly.

## Recommended Implementation Sequence

1. **Wave 3a first** — Aider, Goose, Amp. These cover all three I/O modes (text, JSON, stream-json) and both remaining input methods (flag + stdin). This validates the full provider abstraction.
2. For each provider, complete the compatibility checklist (see below) before enabling.
3. **Wave 3b next** — Cline, Cursor, Droid. These add positional input with JSON output and test sandbox/session config combinations.
4. **Wave 3c deferred** — Amazon Q, Plandex, OpenHands, Qwen Code, Tabnine. These have known instabilities, external prerequisites (Docker, server daemons, AWS auth), or limited documentation. Ship as `enabled: false` with `supportLevel: "experimental"` or `"community"`.
5. Add a `supportLevel` field to each provider's config entry: `"stable"` | `"beta"` | `"experimental"` | `"community"`.
6. Validate all newly added providers through `ping_*`, `help_*`, and at least one successful `ask_*` call where the CLI is available.

## Provider Compatibility Checklist

Complete for each provider before setting `enabled: true`:

| # | Check | Pass? |
|---|---|---|
| 1 | CLI binary exists and responds to `--version` | |
| 2 | `--help` returns successfully (non-zero exit is a fail) | |
| 3 | Minimal `ask_*` invocation with a simple prompt returns output | |
| 4 | Model flag works (if declared) — pass a valid model name | |
| 5 | Output format matches declared `outputFormat` (parse JSON if declared) | |
| 6 | Session resume works (if declared) — create session, resume it | |
| 7 | Working directory flag works (if declared) — pass a valid path | |
| 8 | File context flag works (if declared) — pass a valid file | |
| 9 | Auto-mode flags work (if declared) — verify non-interactive execution | |
| 10 | Timeout is reasonable — command completes within declared timeout | |
| 11 | Provider config passes `npx agentic-mcp --validate-config` (Phase 1 deliverable) | |

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

## Implementation Notes (Research-Backed)

- Use capability gates aggressively: only expose `sessions_*` and `review_*` where the provider reliably supports them.
- Keep unsupported features explicit (`null` model flag, text output only) to avoid accidental schema overexposure.
- Provider onboarding should be reversible: mark unstable providers disabled by default, but keep ready configs.
- Capture provider-specific quirks as config comments/docs, not handler conditionals.
- Reuse one adapter path for prompt modes (`flag`, `positional`, `stdin`) and only vary config values.
- All `resumeFlag` and `continueFlag` values in new provider configs must be `string[]` arrays (e.g., `["--resume"]`, `["threads", "continue", "-x"]`), not space-delimited strings.
- Provider configs for experimental/community providers should include a `"prerequisites"` array documenting what the user needs installed/configured.
- When a provider has known non-interactive bugs (e.g., Amazon Q issues #1951, #1995), document them in a comment-friendly way and set `supportLevel: "beta"` or lower.
- Good first issues for community contributors: adding Wave 3c provider configs, verifying provider compatibility checklists, improving provider documentation.

## Deliverables

- Wave 3a provider configs: Aider, Goose, Amp (enabled, tested).
- Wave 3b provider configs: Cline, Cursor, Droid (enabled where CLI is accessible, tested).
- Wave 3c provider configs: Amazon Q, Plandex, OpenHands, Qwen Code, Tabnine (disabled by default, config templates ready).
- `supportLevel` field added to all provider configs (existing Phase 1 providers marked `"stable"`).
- Completed compatibility checklist per provider.
- Provider prerequisites matrix in documentation.
- Updated `list_providers` output reflecting support levels and prerequisites.

## Exit Criteria

- Every Wave 3a/3b provider has a completed compatibility checklist with documented results.
- Wave 3a/3b providers have tested `ask_*` tool paths.
- Wave 3c providers are explicitly disabled with documented rationale and prerequisites.
- Tool exposure matches provider capabilities — no dead tools in `tools/list`.
- `list_providers` returns accurate `supportLevel` and `prerequisites` for all providers.
- All new provider configs pass Zod schema validation in CI.
- `resumeFlag`/`continueFlag` values are `string[]` arrays in all configs.
