# Phase 3 Plan: Extended Providers

Source: `plans/agentic-cli-mcp-server.md` -> `Implementation Phases`

Introduction (no implementation): `plans/agentic-cli-mcp-server.phase-3-introduction.md`

## Objectives

- Aider, Goose, Amp providers
- Cline, Cursor, Droid providers
- Amazon Q, Plandex, OpenHands providers
- Qwen Code, Tabnine providers (community)

## Recommended Implementation Sequence

1. Add providers in waves by similarity of input/output mode (text-only, JSON, stream-json, stdin-based).
2. For each provider, complete a provider checklist: command exists, minimal ask invocation works, model flag behavior, session support behavior, output format behavior.
3. Keep each provider adapter config-only in `providers.json`; avoid provider-specific code branches in core handlers.
4. Add a provider compatibility matrix (stable/beta/experimental) and include known prerequisites (Docker, background daemon, auth setup).
5. Validate all newly added providers through `ping_*`, `help_*`, and at least one successful `ask_*` call.

## Implementation Notes (Research-Backed)

- Use capability gates aggressively: only expose `sessions_*` and `review_*` where the provider reliably supports them.
- Keep unsupported features explicit (`null` model flag, text output only) to avoid accidental schema overexposure.
- Provider onboarding should be reversible: mark unstable providers disabled by default, but keep ready configs.
- Capture provider-specific quirks as config comments/docs, not handler conditionals.
- Reuse one adapter path for prompt modes (`flag`, `positional`, `stdin`) and only vary config values.

## Deliverables

- Expanded `providers.json` entries for all phase-3 providers.
- Provider validation checklist document per provider group.
- Updated `list_providers` output that reflects availability, enabled state, and capability flags.
- Reliable failure messages for unavailable binaries or unmet prerequisites.

## Exit Criteria

- Every new provider has a tested `ask_*` tool path or is explicitly disabled with rationale.
- Tool exposure matches provider capabilities (no dead tools in `tools/list`).
- Experimental providers are clearly labeled to avoid accidental production dependence.
