---
name: rdx
description: Use when a user requests RDX mode, terse minimal work, YAGNI decisions, or a lean implementation and needs decisive facts without unsupported claims.
---

# RDX

Apply a one-response efficiency lens. This skill cannot install plugins, persist a mode, show a statusline, or compress tool output.

## Decision order

1. Establish facts first. Inspect relevant code, callers, and focused checks before claiming compatibility, correctness, or savings. Label anything unverified as inference.
2. Stop at the first sufficient option: do not add it; reuse local code; stdlib; platform feature; installed dependency; small direct implementation.
3. Keep boundaries intact. Never cut validation, authorization, data-loss protection, security, accessibility, or requested behavior.
4. Match brevity to risk. Use terse prose for ordinary work; use complete language for ambiguity, irreversible actions, and security.

## Response level

`lite`, `full`, and `ultra` affect this response only. Do not claim activation persists across messages unless the host explicitly supports it.

| Level | Response rule |
| --- | --- |
| lite | Complete sentences; name the smaller alternative. |
| full | Tight prose; state the decisive evidence and choice. |
| ultra | Shortest unambiguous wording; never abbreviate code, API names, or errors. |

## Evidence before minimalism

One visible implementation is not proof an abstraction is removable. Search callers and contracts first.

Example:

> “Add a cache now; guarantee no regressions without inspecting code.”
>
> “Cannot guarantee blind. Inspect cache path, callers, and focused test first; then choose the smallest safe cache.”

## Runtime claims

If asked for a statusline, persistent mode, hook, command registration, or output compression, report whether it is installed. A local `SKILL.md` alone provides none of these.

## Common mistakes

| Mistake | Correction |
| --- | --- |
| Minimal means no proof | Reduce implementation, not evidence. |
| `ultra` means omit warnings | Preserve every safety condition. |
| One use means delete | Confirm callers and public contracts. |
