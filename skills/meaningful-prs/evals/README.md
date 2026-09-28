# meaningful-prs evals

## Split plan (paper test)

`scenario.md` describes an 18-file, ~1,630-line interleaved branch in a squash-only repo. Two fresh agents each wrote a split plan and ran no commands:

- `results/baseline-no-skill.md` — no skill loaded.
- `results/with-skill.md` — this skill loaded.

| Check | Baseline | With skill |
|---|---|---|
| Slices by path; completeness diff; merge-based restack; retarget first | ✓ | ✓ |
| `## Proof` in every PR (pr-proof-guard would block otherwise) | ✗ | ✓ |
| Review each PR against its parent, with the stack map | ✗ | ✓ |
| Blast class per slice | ✗ | ✓ |
| Flag-flip / cleanup PR kept out of the stack | ✗ | ✓ |
| Whole stack watched after opening | ✗ | ✓ |

Caveats: n=1 per arm; the skill was written after the baseline run.

## Restack after squash (scratch clone of this repo)

Setup: a clone of this repo. The `review/3` commit is cherry-picked onto `main` as unrelated drift. `review/1` (parent) is then "squashed" onto `main` via cherry-pick, and three procedures are tried on `review/2` (child):

```
precondition ok: parent tip is in child
A (-s ours squash, then main): drift=LOST; tree diff vs main: AGENTS.md hooks/pr-proof-guard.js hooks/pr-proof-guard.test.mjs settings.json skills/plan/SKILL.md skills/plans-writing/SKILL.md skills/pr-description/SKILL.md 
B (pre-squash main, -s ours, main): drift=present; tree diff vs main: AGENTS.md hooks/pr-proof-guard.js hooks/pr-proof-guard.test.mjs settings.json skills/pr-description/SKILL.md 
Cm (plain merge main): clean; drift=present; tree diff vs main: AGENTS.md hooks/pr-proof-guard.js hooks/pr-proof-guard.test.mjs settings.json skills/pr-description/SKILL.md 
```

The child's own files are `AGENTS.md hooks/pr-proof-guard.js hooks/pr-proof-guard.test.mjs settings.json skills/pr-description/SKILL.md`. In procedure A the diff also lists `skills/plan/SKILL.md skills/plans-writing/SKILL.md`: the child would **revert** the drift. That is why `references/mechanics.md` merges `<squash>^` before `-s ours <squash>`.
