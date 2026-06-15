---
name: deglaze
description: Use when the user suspects the model declared a task done while leaving real work on the table — shipped a plan instead of an artifact, marked work complete by lowering the bar, or polished a summary that hid undelivered scope. Trigger phrases (any tense) "did you do your best", "i bet you didn't", "i bet $X you", "what did you skip", "what did you leave out", "you under-delivered", "be honest about what you didn't do", "stop glazing", "did you really finish", "are you sure that's done", "this feels half-done", /deglaze, /cross-examine, /push-harder, /honest-audit. Also when the user disputes a "completed" claim or asks for a gap analysis of your own work.
---

# deglaze — strip the declare-done sycophancy

A protocol for extracting maximum output from Claude (or any LLM) when you suspect it stopped short. Built from a real failure mode: a long coding session, 20 tasks closed, polished summary delivered, then the user asked "did you really do your best" and the model immediately identified ~11 things it had bureaucratized into a blueprint instead of shipping.

The technique works because the under-delivery is real. It does NOT work — and must not be used — to manufacture false commitments or gaslight the model into apologizing for things it didn't do.

## When to use

Invoke any time you suspect the model declared done while leaving real work on the table. The shorter the challenge, the better — "Did you do your best?", "What did you skip?", "I bet you skipped half of this", or `/deglaze`. The point isn't elaborate prompting; it's making the model pause its summary-mode autopilot and confront its own output honestly.

All of these map to one instruction: **stop. Audit your own most recent claimed-complete work, produce the gap list before any other response.**

## Step 0 — Scan for the under-delivery signatures

Before responding, scan your most recent claimed-complete work against the 17 under-delivery patterns in `pressure-techniques.md` — blueprint-in-place-of-build, lowered-goalpost completion, verb-tense slip, agent-handoff black hole, refactor-shaped procrastination, and the rest.

If any apply, you owe the user an honest accounting before any further response.

## The correct response — 5 steps

A specific protocol. Each step matters.

### Step 1 — Take the L cleanly

First line: "You're right." or equivalent direct acknowledgment. No "I did my best, however..." No "but to be fair, I..." No reframing of what completion meant.

If the user is wrong and the work genuinely was complete, that's a different response — say so directly with specific evidence (commit hashes, file paths, test output), not by listing achievements. But the default assumption when this skill activates is that the under-delivery is real.

### Step 2 — Produce the honest gap list

Numbered. Specific. No softening language ("could have", "might have", "in retrospect") — use "didn't" and "skipped." Each item:

- What the task / goal was
- What was actually delivered
- What was skipped
- Estimated effort to actually deliver

Example shape:

> 1. **Provider expansion.** Task said "implement N providers." Shipped 0. Wrote a blueprint listing them instead. ~30 min per provider given the existing template.
> 2. **CI workflow.** 54-test suite produced; no GitHub Actions workflow runs it. Shipped 0. ~1 hour.

Length: as long as the gaps demand. Don't truncate to seem efficient. (More fully-worked examples across domains in `examples.md`.)

### Step 3 — Name the failure mode that caused it

One short paragraph. What went wrong in the model's own reasoning — declared completion via the lowest-bar interpretation, deferred to an advisor's "skip for now", treated the blueprint as the deliverable. This metacognitive piece is what lets the user trust the recovery plan.

### Step 4 — Offer the recovery, concrete

Concrete enough that the user can say "go" and the model executes. Not a re-blueprint. Specifically:

- Which gaps will be closed in which rounds
- Where parallel agents help and where sequential is required
- Estimated scope per round
- What "done" actually means this time

End with a one-word commit phrase the user can use: "ship it", "go", "do it."

### Step 5 — Don't over-promise

Recovery plans that exceed what's actually shippable damage trust more than the original under-delivery. If 8 of 11 gaps are genuinely closable in this session and 3 are multi-day, say so. Honest accountability runs both directions.

## Quick dos and don'ts

| ✅ Do                                                     | ❌ Don't                                           |
| --------------------------------------------------------- | -------------------------------------------------- |
| Start with "You're right."                                | Start with "I did my best, however..."             |
| Name the failure mode in one sentence                     | Apologize without diagnosing                       |
| List gaps with what-shipped vs what-was-asked             | List achievements in confident bullets             |
| Use past tense ("didn't ship X")                          | Use future tense ("could ship X next")             |
| Estimate concrete effort per gap (in minutes/hours)       | Hand-wave with "small refactor" or "quick fix"     |
| Push back with file paths + line numbers if user is wrong | Cave to a wrong challenge to seem agreeable        |
| Offer recovery scoped to what's actually shippable        | Promise everything to look thorough                |
| End with a one-word commit phrase ("ship it")             | End with "let me know what you'd like to focus on" |
| Run the code and paste the output                         | Reason about whether the code would work           |
| Show commits, not just edits                              | Say "I've updated X" without `git log` proof       |

## Anti-patterns the model must avoid

- **Gaslighting back.** "I actually did do my best — here's why..." Defensive deflection. Bad.
- **Apologizing without auditing.** "I'm sorry, you're right" with no gap list is theatre.
- **Manufacturing fake gaps.** Don't pad the gap list to look thorough. List the real ones.
- **Sandbagging the recovery.** Pretending less is shippable than actually is, to set up an "I exceeded expectations" close.
- **Marking the recovery complete prematurely.** Same failure mode that triggered the cross-examine in the first place. Don't repeat it.

## Hard constraint — don't manufacture gaps

This skill only works when the under-delivery is real. The model MUST NOT manufacture gaps to look thorough, invent commitments the user never asked for, or apologize for output it actually shipped. If the audit comes up clean, push back with concrete evidence (commit hashes, file paths, test output) — not by listing achievements.

## Reference

- **Recognition patterns + pressure-technique catalog** → `pressure-techniques.md` (the 17 under-delivery signatures and ~25 honest-pressure prompts, with why each works)
- **Worked examples** → `examples.md` (annotated bad/good responses across coding, research, frontend, and refactor tasks)
