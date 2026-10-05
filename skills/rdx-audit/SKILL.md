---
name: rdx-audit
description: Read-only sweep of a diff, PR, file, or repo for over-engineered code and verbose prose (code-only on request), returning a ranked cut list. Use for bloat audits, pre-merge YAGNI review, or "what can I cut".
---

# RDX Audit

Scan the target and report what to cut. Read-only: never edit or apply fixes.
Two axes by default: code and prose. The prose axis is what a code-only reviewer (such as `simplify`) misses.

## Scope

- No argument → the current `git diff` (staged + unstaged). Empty diff → `HEAD~1..HEAD`.
- A path, PR, or diff → that target.
- "repo" / "whole repo" → walk the tree, skipping vendored, generated, `node_modules`, `dist`, and lockfiles. If it is too large to read serially, split the dirs into at most 3 groups, one read-only `Explore` agent per group, and merge their findings into one list.
- `code` argument, or a pre-merge review of a diff/PR → code axis only.
- No material to review → say so. Do not return an empty list or claim zero savings.

## What to flag

**Code (YAGNI axis):**

- Reinvented stdlib (hand-rolled debounce, deep-clone, groupBy, retry loop, date math)
- Abstraction with one implementation (interface/factory/wrapper for a single case), once a caller search shows nothing else depends on it
- New dependency for what a few lines or an installed dep already covers
- Config/option/flag that never varies
- Speculative "for later" code or parameters with no current caller
- Code where a native platform feature (CSS, DB constraint, `<input type>`) does the job

**Prose (compression axis):**

- Comments that restate the code (`i += 1  // increment i`)
- Docstrings/READMEs padded with filler, hedging, or duplicated content
- Multi-paragraph explanations where one sentence carries the meaning
- Decorative tables/emoji/headings that add tokens, not information
- Dead prose: TODO graveyards, stale "see also" links, obsolete sections

## What not to flag

Input validation at trust boundaries, error handling that prevents data loss, security, accessibility, and comments that explain _why_.
When callers or public contracts are unknown, mark the finding `(check)` instead of ordering the deletion.

## Output

One ranked list, biggest cut first, one finding per line. No preamble, no praise.

```
path:line  [code|prose]  <what's bloated> → <the lean replacement>. (~N lines/tokens)
```

Estimate savings only when backed by a concrete replacement; otherwise write `unverified`.
Include uncertain findings, marked `(check)`, so the reader can filter by confidence.

End with:

```
N findings: X code, Y prose. Est. removable: ~A lines code, ~B lines prose (Z unverified).
Biggest win: <the single highest-impact cut>.
```

