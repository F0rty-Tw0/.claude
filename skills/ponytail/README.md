# Ponytail

Forces the laziest solution that actually works — the simplest, shortest, most minimal path. It channels a senior dev who has been paged at 3am for someone else's over-engineering: the best code is the code never written.

Core principle: lazy means *efficient*, not careless. The skill never simplifies away validation, error handling, security, accessibility, or anything explicitly requested.

## What It Does

| Piece | Purpose |
| --- | --- |
| **The ladder** | Stop at the first rung that holds: YAGNI → stdlib → native platform feature → installed dependency → one line → minimum code |
| **Rules** | No unrequested abstractions, deletion over addition, shortest working diff, `ponytail:` comments to mark deliberate simplifications |
| **Output discipline** | Code first, then at most three lines: what was skipped and when to add it |
| **Intensity levels** | `lite` (name the lazier option), `full` (ladder enforced, default), `ultra` (YAGNI extremist) |

---

## When to Use

Triggers when you:

- Want the simplest, shortest, most minimal solution that works
- Are fighting over-engineering, bloat, boilerplate, or unnecessary dependencies
- Type "ponytail", "be lazy", "yagni", "do less", "shortest path", or `/ponytail`

Do **not** apply it to trust-boundary validation, data-loss-preventing error handling, security, accessibility, or anything the user explicitly asked for in full.

---

## Boundaries

Ponytail governs **what you build**, not how you talk — pair it with Caveman for terse prose. Switch levels with `/ponytail lite|full|ultra`; turn it off with "stop ponytail" or "normal mode". The level persists until changed or session end.

---
