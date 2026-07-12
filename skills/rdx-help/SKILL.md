---
name: rdx-help
description: Use when the user requests help, options, commands, or quick reference information for RDX efficiency mode.
---

# RDX Help

Quick-reference card for RDX modes, levels, and commands.

## Commands

| Command | Effect |
| --- | --- |
| `/rdx` | Activate rdx mode at default level (full); persists until "stop rdx" / "normal mode" |
| `/rdx lite` | Tighter prose; name smaller alternative |
| `/rdx full` | Tight prose; enforce YAGNI decision ladder |
| `/rdx ultra` | Shortest unambiguous wording; challenge requirement |
| `/rdx-audit [path]` | Discovery sweep: code AND prose bloat, ranked cut list (diff/file/repo) |
| `/rdx-review` | Pre-merge gate: code-only over-engineering pass on a diff/PR |
| `/rdx-help` | This card |

Audit vs review: audit sweeps both axes anywhere; review is the focused code lens on a diff before merge.

## Decision ladder

YAGNI → Reuse → Stdlib → Native → Installed dep → Direct code.

## Never minimal about

Trust boundaries: input validation, error handling, security, accessibility, and requested behavior.
