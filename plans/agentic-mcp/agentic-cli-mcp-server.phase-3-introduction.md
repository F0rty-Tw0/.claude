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
- Provider onboarding follows a documented compatibility checklist before enabling.
- Providers are onboarded in priority waves (3a: popular, 3b: IDE-adjacent, 3c: experimental/deferred).
- `supportLevel` field distinguishes `stable`, `beta`, `experimental`, and `community` providers.
- `resumeFlag`/`continueFlag` values are `string[]` arrays in all new configs.

## Non-Goals for This Introduction

- No code changes.
- No new session architecture or streaming protocol changes (Phase 2).
- No advanced queue/output/review feature rollout (Phase 4).

## Decision Baseline for Later Implementation

- Onboard providers in waves by I/O mode similarity.
- Use one compatibility matrix as the acceptance gate before enabling a provider.
- Prefer richer provider config over branching core handlers.
- Keep `list_providers` as the source of truth for support status and prerequisites.
- Phase 3 can run in parallel with Phase 2 (both depend only on Phase 1).
- Providers with native session support will use Tier 1 fallback until Phase 2 ships Tier 2.
- Wave 3c providers (Amazon Q, Plandex, OpenHands, Qwen Code, Tabnine) are deferred to post-stabilization.
- Good first issues for contributors: adding Wave 3c provider configs, verifying compatibility checklists.

## Acceptance Intent (Planning-Level)

By the end of Phase 3 implementation, provider expansion should be repeatable,
auditable, and safe: every enabled provider passes a shared compatibility checklist,
every exposed tool/parameter reflects actual supported behavior, and providers are
classified by support level. Wave 3a/3b providers are tested and enabled; Wave 3c
providers ship as disabled templates ready for community contribution.

## Trace to Main Plan Checklist

- Aider/Goose/Amp onboarding aligns to `plans/agentic-cli-mcp-server.md:1036`.
- Cline/Cursor/Droid onboarding aligns to `plans/agentic-cli-mcp-server.md:1037`.
- Amazon Q/Plandex/OpenHands onboarding aligns to `plans/agentic-cli-mcp-server.md:1038`.
- Qwen Code/Tabnine onboarding aligns to `plans/agentic-cli-mcp-server.md:1039`.
- Provider compatibility checklist enforces consistent onboarding quality.
- `supportLevel` field enables clear communication of provider maturity.
- Wave structure enables parallel development and community contribution.
