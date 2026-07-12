---
name: rdx-review
description: Use when reviewing a diff, pull request, or file to identify over-engineering, speculative abstractions, or reinvented stdlib without producing fabricated findings.
---

# RDX Review

Review the diff or file for what could be deleted or simplified.

## What to flag

- Confirmed redundant abstractions: interfaces, factories, or wrappers with only one implementation, *if* caller search and contract checks verify no other code depends on the abstraction.
- Reinvented stdlib or runtime features: hand-rolled debounce, deep-clone, or date math.
- Speculative code: features or parameters with no current callers.

## What NOT to flag

- Trust boundaries: input validation, error handling, security, or accessibility.
- Ambiguous boundaries: do not order deletion of single-use components if callers or public contracts are unknown; mark these as conditional checks instead.

## Verification rules

1. No diff or file provided? State that review material is absent. Do not produce an empty findings list or claim zero savings.
2. Unverified savings? Do not estimate line savings unless backed by a concrete replacement. If unverified, mark the estimate as `unverified`.

## Output format

One finding per line. No preamble, no praise.

```
path:line: [code|prose] <what's over-built>. <the lazier replacement>.
```

End with a one-line verdict:
```
N findings. Est. <X> lines removable (Y unverified).
```
