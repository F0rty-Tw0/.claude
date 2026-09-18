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

## Quality Gate (before handing to Ralph)

Every acceptance criterion must be verifiable by a command or a concrete observation -- not a judgment call. Rewrite any criterion you cannot pair with a check:

- Bad: "auth works well" -> Good: "`npm test auth` exits 0" / "POST /login with valid creds returns 200 + a JWT"
- Each criterion names HOW it is checked. If you can't name the check, the criterion is not done being written.

A PRD whose criteria are all command-verifiable is Ralph-ready; one with vague criteria will loop forever because "done" is undecidable.

## Output

A structured PRD file saved to `.claude/local/plans/` that serves as the definition of done for Ralph execution.

## Next Steps

After creating the PRD, start execution with:

```
ralph "implement the PRD"
```

Ralph will iterate until all acceptance criteria in the PRD are met and architect-verified.
