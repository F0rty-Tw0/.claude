---
name: rdx-audit
description: Use when auditing a codebase, diff, or file to locate over-engineered code and verbose prose without introducing speculative claims.
---
# RDX Audit

Scan the target (a diff, a file, or the repo tree) and report what to cut, on
both axes. One-shot. Read-only — never edit, never write a flag, never apply fixes.

Sibling boundary: `rdx-review` is the code-only pre-merge gate on a diff/PR; this skill is the discovery sweep across both axes. For a whole-repo sweep too large to read serially, fan out one read-only explore agent per top-level dir (all Agent calls in one message) and merge their findings into the single ranked list.

## Scope

- No argument → audit the current `git diff` (staged + unstaged). Empty diff → audit `HEAD~1..HEAD`.
- A path → audit that file or directory.
- "repo" / "whole repo" → walk the tree (skip vendored/generated/`node_modules`/`dist`/lockfiles).

## What to flag

**Code (the YAGNI axis):**
- Reinvented stdlib (hand-rolled debounce, deep-clone, groupBy, retry loop, date math)
- Abstraction with one implementation (interface/factory/wrapper for a single case)
- New dependency for what a few lines or an installed dep already covers
- Config/option/flag that never varies
- Speculative "for later" scaffolding with no current caller
- Verbose code where a native platform feature (CSS, DB constraint, `<input type>`) does it

**Prose (the compression axis) — the half a code-only auditor misses:**
- Comments that restate the code (`i += 1  // increment i`)
- Docstrings/READMEs padded with filler, hedging, ceremony, or duplicated content
- Multi-paragraph explanations where one tight sentence carries the meaning
- Decorative tables/emoji/headings that add tokens, not information
- Dead prose: TODO graveyards, stale "see also" links, obsolete sections

## What NOT to flag

Input validation at trust boundaries, error handling that prevents data loss,
security, accessibility, deliberate `// rdx:` / `// ponytail:` shortcuts already
documented, or domain comments that explain *why* (not *what*).

## Output

One ranked list, biggest cut first. One finding per line. No preamble, no praise.

```
path:line  [code|prose]  <what's bloated> → <the lean replacement>. (~N lines/tokens)
```

End with a two-line summary:

```
N findings: X code, Y prose. Est. removable: ~A lines code, ~B lines prose.
Biggest win: <the single highest-impact cut>.
```

Report every candidate you find, including uncertain ones. Mark a finding `(check)`
if cutting it might lose behavior you can't verify from the snippet, so the reader
can filter by confidence.
