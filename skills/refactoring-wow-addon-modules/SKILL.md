---
name: refactoring-wow-addon-modules
description: Use when refactoring Lua 5.1 World of Warcraft addon modules to remove duplication, split oversized files, simplify brittle UI logic, or improve readability and maintainability without changing behavior
---

# Refactoring WoW Addon Modules

## Overview

Refactor from seams that already exist. Preserve behavior and public contracts first; shorten files by extracting the next obvious responsibility, not by inventing a framework.

**REQUIRED SUB-SKILL:** Use skill:test-driven-development

## When to Use

- Files are too long or do more than one job
- The same frame setup, state restoration, or policy logic appears twice
- A function mixes layout, rendering, policy, and mutation
- A Blizzard-client quirk is buried inside unrelated logic
- You need cleaner Lua 5.1 addon code without changing addon behavior

Do not use for net-new features or speculative architecture. If behavior changes, treat it as feature work and go back to TDD.

## Core Pattern

<Before>
```lua
function LayoutBuilder.Build(factory, frame, initialState)
  -- sizing
  -- contacts pane creation
  -- content pane creation
  -- options panel creation
  -- theme wiring
  return { -- flat public layout table }
end
```
</Before>

<After>
```lua
local function buildContactsSection(factory, frame, sizing)
  return { pane = ..., search = ..., list = ..., resizeHandle = ... }
end

local function buildContentSection(factory, frame, sizing)
  return { pane = ..., thread = ..., composer = ... }
end

function LayoutBuilder.Build(factory, frame, initialState)
  local sizing = calculateSizing(initialState)
  local contacts = buildContactsSection(factory, frame, sizing)
  local content = buildContentSection(factory, frame, sizing)
  return buildPublicLayout(contacts, content)
end
```
</After>

First pass: keep the exported contract stable. Split internals first, callers second.

## Quick Reference

| Smell | First move | Avoid |
| --- | --- | --- |
| 40+ line function with one responsibility | Extract local helpers in the same file | Jumping straight to a shared framework |
| 300+ line module with clear clusters | Split into private submodules in the same feature folder | Dumping helpers into a generic `Util` file |
| Duplicate logic inside one feature | Extract a feature-local helper | Sharing it repo-wide too early |
| Duplicate logic across unrelated features | Share only the invariant, name it by behavior | Copying UI-specific baggage into a common helper |
| Blizzard/UI quirk with a long comment | Isolate behind one named helper and keep the comment + test | “Cleaning up” the explanation away |
| Hot path loop or per-frame update | Localize globals, avoid new tables/closures, keep data flow obvious | Clever abstractions that allocate more |

## Implementation

### Extraction ladder

Choose the lowest level that removes the duplication cleanly:

1. Local helper
2. Private child module in the same folder
3. Feature-local shared helper
4. Cross-feature utility

Do not skip to step 4 unless the invariant is truly shared.

### Refactor checklist

1. Write or extend a failing test around the behavior you are about to preserve.
2. Read callers before changing any exported function, return table, or module shape.
3. Name the responsibility split in plain language: layout, policy, rendering, persistence, transport.
4. Move one responsibility at a time.
5. Delete the old duplicate path immediately once the new one is proven.
6. Re-run the focused test, then the closest integration coverage, then lint/format.

### Lua + WoW rules

- Target Lua 5.1, not modern Lua conveniences.
- Keep addon modules explicit: `local addonName, ns = ...` in production files, explicit export at the end.
- Access WoW globals through `_G` in addon code when the project already does that.
- Keep client-specific comments when they explain anchor bugs, template quirks, or live-client crashes.
- Guard frame method calls when test stubs may not implement the full WoW API.
- Prefer early returns, local functions, and local constants over deep nesting.
- Split policy from widget mutation: compute what should happen, then paint/apply it.

## Common Mistakes

- **Refactoring without tests** -> Lock behavior first; cleanup still breaks addons.
- **Changing the public shape too early** -> Preserve call sites on pass one.
- **Extracting a generic UI framework** -> Prefer explicit helpers and feature-local modules.
- **Merging unlike responsibilities because they both touch frames** -> Shared syntax is not shared responsibility.
- **Deleting “weird” comments** -> Those comments often encode real Blizzard/client behavior.
- **Using refactor time to sneak in behavior changes** -> Split behavior work into a separate TDD cycle.

## Red Flags

Stop and reassess if you hear yourself thinking:

- “It is just cleanup, I do not need tests.”
- “I can fix callers later.”
- “This should become a reusable framework.”
- “The WoW-specific workaround is ugly; I will remove it while I am here.”
- “These two blocks look similar, so they must share a helper.”

## Remember

Good addon refactors make the next edit safer. Shorter files are a result of better boundaries, not the goal by themselves.
