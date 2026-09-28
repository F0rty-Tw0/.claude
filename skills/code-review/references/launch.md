# Launch Mode — Gate, Polish, Ramp, Roll Back

Covers the lifecycle around the review: plan the gate **before** code, the human polish pass **after** merge, and the canary launch.

**Merge-ready ≠ launch-ready.** Agents get code merge-ready (the broad 80%). Humans make it launch-ready (the last 20%: taste, refactor, integration).

## Phase 1 — Plan and isolate (before any code)

Produce a gate plan:

```
Feature: <name>
Flag: <flagName>, default OFF, owner <who>
Checked at: <every entry point — route, API handler, job, UI mount>   # a UI-only check is not a gate
OFF behavior: identical to today (assert this in a test)
Kill switch: flip without deploy? <yes/no — how>
Cannot be gated (stays trunk, review at max knob):
  - migrations → expand/contract: add nullable/defaulted → backfill → switch reads → contract later
  - shared helper / payload / dependency changes
Cleanup: remove flag + dead branch by <date/ticket>
```

Repo already has a flag mechanism? Use it. None? Say so; a boolean env/config read is the minimal gate — don't build a flag platform.

## Phase 2 — Merge-ready checklist

- [ ] CI green: build, type-check, lint, tests (re-run, output pasted)
- [ ] Review verdict is not BLOCK (SKILL.md review mode)
- [ ] New behavior dark behind OFF flag; OFF path = base behavior
- [ ] No regression on existing trunk paths (tests for them ran, not just new tests)
- [ ] Migrations backward-compatible with the **currently deployed** code (old code + new schema must work)
- [ ] Proof bundle present (`proof.md`)

## Phase 3 — Human polish (the final 20%)

Output a **handoff list** for the human — things agents are bad at and should not be trusted with alone:

- Architectural fit: does this belong where it was put? Duplicate of an existing module?
- Naming and API shape a teammate will live with for years.
- Integration seams: error messages users see, retries, timeouts, empty states, copy.
- Refactors the agent avoided (or over-did); abstractions with one caller.
- Taste calls on UX: spacing, motion, wording.

List specific files/areas, not generic advice. Style is fair game **here** — this is where taste lives, not in the merge review.

## Phase 4 — Attack

Run attack mode (`attack.md`) in staging with the gate ON. Verdict must be GO FOR CANARY.

## Phase 5 — Launch as an experiment

```
Ramp: internal/dogfood → 1% → 5% → 25% → 100%
Hold at each step: ≥ <1 business day / N sessions / N transactions>
Watch (with pre-launch baseline from attack report):
  - error rate on <endpoints>        rollback if > baseline + <x>%
  - p95 latency on <endpoints>       rollback if > <n> ms
  - business invariant, e.g. ledger sum vs balances    rollback on ANY mismatch
  - crash/exception logs tagged with the flag
  - product signal: <conversion / usage / support tickets>
Rollback: flag OFF (tested in staging? <yes/no>)
Not covered by flag rollback: <migrations, emails sent, charges made, data written> → repair plan: <...>
Decision owner at each step: <human>
```

- A/B test instead of pure ramp when the question is "is it better?", not just "is it safe?".
- Name what still speaks the old contract during the ramp: old app versions in the wild, caches, queued jobs, downstream consumers.
- Flip the flag only with explicit human approval — it is an outward-facing action.
