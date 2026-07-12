---
name: rdx-help
description: Use when the user requests help, options, commands, or quick reference information for RDX efficiency mode.
---

# RDX Help

Quick-reference card for RDX modes, levels, and commands.

## Commands

| Command | Effect |
| --- | --- |
| `/rdx` | Use rdx mode at default level (full) |
| `/rdx lite` | Tighter prose; name smaller alternative |
| `/rdx full` | Tight prose; enforce YAGNI decision ladder |
| `/rdx ultra` | Shortest unambiguous wording; challenge requirement |
| `/rdx-audit [path]` | Audit a diff/file/repo for code and prose bloat |
| `/rdx-review` | Review a diff/file for over-engineering and abstractions |

## Decision ladder

YAGNI → Reuse → Stdlib → Native → Installed dep → Direct code.

## Never minimal about

Trust boundaries: input validation, error handling, security, accessibility, and requested behavior.
