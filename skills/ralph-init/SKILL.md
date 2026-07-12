---
name: ralph-init
description: Use when the user wants to start autonomous goal-driven iteration (a ralph loop) but no PRD or requirements document exists yet, or when acceptance criteria need to be defined and written down before implementation begins.
---

# Ralph Init

Initialize a PRD (Product Requirements Document) for structured ralph-loop execution. Creates a structured requirements
document that Ralph can use for goal-driven iteration.

## Usage

```
ralph-init "project or feature description"
```

## Behavior

1. **Gather requirements** via interactive interview or from the provided description
2. **Create PRD** at `.claude/local/plans/prd-{slug}.md` with:
   - Problem statement
   - Goals and non-goals
   - Acceptance criteria (testable)
   - Technical constraints
   - Implementation phases
3. **Link to Ralph** so that `ralph` can use the PRD as its completion criteria

## Output

A structured PRD file saved to `.claude/local/plans/` that serves as the definition of done for Ralph execution.

## Next Steps

After creating the PRD, start execution with:

```
ralph "implement the PRD"
```

Ralph will iterate until all acceptance criteria in the PRD are met and architect-verified.
