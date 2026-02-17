# Phase 3 Introduction (No Implementation)

Source context:
- `plans/agentic-cli-mcp-server.phase-3-extended-providers.md`
- `plans/agentic-cli-mcp-server.phases-2-3-4-research-brief.md`
- MCP Tools spec: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`

## Purpose

Phase 3 scales provider coverage while preserving the config-driven architecture.
It focuses on disciplined onboarding and compatibility transparency, not special-case logic.

## What Phase 3 Must Guarantee

- New providers are onboarded through configuration and capability gates.
- Tool exposure matches real provider capability and runtime availability.
- Provider support levels and prerequisites are explicit and visible.
- Expansion remains reversible (unstable providers can stay disabled by default).

## Non-Goals for This Introduction

- No code changes.
- No new session architecture or streaming protocol changes (Phase 2).
- No advanced queue/output/review feature rollout (Phase 4).

## Decision Baseline for Later Implementation

- Onboard providers in waves by I/O mode similarity.
- Use one compatibility matrix as the acceptance gate before enabling a provider.
- Prefer richer provider config over branching core handlers.
- Keep `list_providers` as the source of truth for support status and prerequisites.

## Acceptance Intent (Planning-Level)

By the end of Phase 3 implementation, provider expansion should be repeatable,
auditable, and safe: every enabled provider passes a shared checklist, and every
exposed tool/parameter reflects actual supported behavior.

## Trace to Main Plan Checklist

- Aider/Goose/Amp onboarding aligns to `plans/agentic-cli-mcp-server.md:1036`.
- Cline/Cursor/Droid onboarding aligns to `plans/agentic-cli-mcp-server.md:1037`.
- Amazon Q/Plandex/OpenHands onboarding aligns to `plans/agentic-cli-mcp-server.md:1038`.
- Qwen Code/Tabnine onboarding aligns to `plans/agentic-cli-mcp-server.md:1039`.
