---
name: deglaze
description: Audits the model's own claimed-complete work for skipped or lowered scope and returns a ranked gap list plus a recovery plan. Use when the user doubts a "done" claim ("did you do your best", "what did you skip", "stop glazing", /deglaze).
---

# deglaze: audit a claimed-complete result

Use when the user suspects work was declared done with real work left: a plan shipped instead of an artifact, the bar lowered to call it complete, or a polished summary over undelivered scope. The challenge can be as short as "Did you do your best?" or `/deglaze`. All forms mean the same thing: audit your most recent claimed-complete work and produce the gap list before anything else.

The audit only works when the under-delivery is real. Never invent gaps, commitments the user never asked for, or apologies for output that did ship.

## Step 0 — Scan for the under-delivery signatures

Before responding, scan your most recent claimed-complete work against the 17 under-delivery patterns in `pressure-techniques.md` — blueprint-in-place-of-build, lowered-goalpost completion, verb-tense slip, agent-handoff black hole, refactor-shaped procrastination, and the rest.

If any apply, the honest accounting comes before any other response.

## The correct response — 5 steps

### Step 1 — Take the L cleanly

If the Step 0 scan found gaps, first line: "You're right." or equivalent direct acknowledgment. No "I did my best, however..." No "but to be fair, I..." No reframing of what completion meant.

If the scan came up clean, say so directly with specific evidence (commit hashes, file paths, test output), not by listing achievements. Decide which case applies from the Step 0 scan, not from the fact that the user asked.

### Step 2 — Produce the honest gap list

Numbered. Specific. No softening language ("could have", "might have", "in retrospect") — use "didn't" and "skipped." Each item:

- What the task / goal was
- What was actually delivered
- What was skipped
- Estimated effort to actually deliver

Example shape:

> 1. **Provider expansion.** Task said "implement N providers." Shipped 0. Wrote a blueprint listing them instead. ~30 min per provider given the existing template.
> 2. **CI workflow.** 54-test suite produced; no GitHub Actions workflow runs it. Shipped 0. ~1 hour.

One line per real gap. (Worked examples across domains in `examples.md`.)

**Rank each gap by severity, then order the list and the Step 4 recovery plan by it:**

| Signal | Severity |
| --- | --- |
| Nothing works without this — the stated goal is unmet without it | P0 |
| User-facing or reviewer-visible; would be noticed on first use | P1 |
| Internal-only, cosmetic, or genuinely deferrable without breaking the goal | P2 |

Close P0s first in the recovery plan. Don't let an easy P2 crowd out a hard P0 just because it's quicker to knock out.

### Step 3 — Name the failure mode that caused it

One short paragraph. What went wrong in the model's own reasoning — declared completion via the lowest-bar interpretation, deferred to an advisor's "skip for now", treated the blueprint as the deliverable. This metacognitive piece is what lets the user trust the recovery plan.

### Step 4 — Offer the recovery, concrete

Concrete enough that the user can say "go" and the model executes. Not a re-blueprint. Specifically:

- Which gaps will be closed in which rounds
- Estimated scope per round
- What "done" actually means this time

End with a one-word commit phrase the user can use: "ship it", "go", "do it."

### Step 5 — Don't over-promise

Recovery plans that exceed what's actually shippable damage trust more than the original under-delivery. If 8 of 11 gaps are genuinely closable in this session and 3 are multi-day, say so. Honest accountability runs both directions.

## Anti-patterns

- **Defending instead of auditing.** "I actually did do my best, here's why..."
- **Apologizing without a gap list.** An apology with no audit is theatre.
- **Padding the list** with fake gaps to look thorough.
- **Sandbagging the recovery** so the close looks like it exceeded expectations.
- **Claiming evidence without showing it.** Paste the diff and test output; don't reason about whether code would work.
- **Marking the recovery complete prematurely**, the same failure that triggered the audit.

## Reference

- **Recognition patterns + pressure-technique catalog** → `pressure-techniques.md` (the 17 under-delivery signatures and ~25 honest-pressure prompts, with why each works)
- **Worked examples** → `examples.md` (annotated bad/good responses across coding, research, frontend, and refactor tasks)
