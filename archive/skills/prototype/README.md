# Prototype

Builds throwaway code that answers one question before a design gets committed to. The question decides the shape: a runnable terminal app for state/logic questions, or several toggleable UI variations on one route for "what should this look like" questions.

## What It Does

| Branch | Question | Output |
| --- | --- | --- |
| LOGIC.md | "Does this state model feel right?" | Tiny interactive terminal app exercising edge cases |
| UI.md | "What should this look like?" | Several radically different UI variants, switchable via a URL param and a floating bottom bar |

Both branches follow the same rules: clearly marked as throwaway, one command to run, no persistence by default, no polish (no tests, minimal error handling), full state surfaced after every action or variant switch. When the question is answered, the prototype is deleted or its decision is absorbed into real code — never left rotting in the repo.

---

## When to Use

Trigger when you:
- want to sanity-check a data model or state machine before building it for real
- need to compare several UI directions side by side instead of committing to one
- hear "prototype this", "let me play with it", or "try a few designs"
