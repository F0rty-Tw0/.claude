# Grill With Docs

A relentless interview session that stress-tests a plan against the project's existing domain model, sharpens vague terminology into precise language, and updates `CONTEXT.md` / ADRs (Architecture Decision Records) inline as decisions crystallize — not batched up for later.

## What It Does

- Walks the plan's design tree one question at a time, each with a recommended answer, waiting for feedback before moving on
- Challenges terminology that conflicts with `CONTEXT.md`, and pushes for a precise canonical term when the user's language is fuzzy or overloaded
- Cross-references claims against the actual code and surfaces contradictions on the spot
- Updates `CONTEXT.md` (glossary only, no implementation detail) the moment a term resolves
- Offers an ADR only when a decision is hard to reverse, surprising without context, AND the result of a genuine trade-off — skips it otherwise

---

## When to Use

Trigger when you:
- have a plan that needs to be checked against the project's existing domain language before implementation starts
- notice a term being used inconsistently with what's already documented
- want architectural decisions captured as ADRs at the moment they're made, not after the fact
