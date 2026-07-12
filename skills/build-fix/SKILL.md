---
name: build-fix
description: Use when the user says the build is broken, a type checker or build command reports errors, or asks for a minimal fix to compilation/build failures without refactoring.
---

# Build Fix Skill

Thin wrapper around the `build-fixer` agent -- delegates the whole task instead of duplicating its instructions here.

## When to Use

- User says "fix the build", "build is broken"
- TypeScript compilation fails
- The build command or type checker reports errors
- User requests "minimal fixes" for errors

## Delegation

```
Agent(
  subagent_type="build-fixer",
  model="sonnet",
  prompt="Fix all build and TypeScript errors with minimal changes. Run the project's type check / build command to collect errors, fix them one at a time, verify each fix doesn't introduce new errors, and stop when the build passes. No refactoring, no architectural changes."
)
```

The `build-fixer` agent owns error collection, fix strategy, minimal-diff discipline, and verification -- see its agent definition for details. Report back the errors fixed, files touched, and final build status.

## Use with Other Skills

- **Ultrawork**: spawn multiple `build-fixer` agents in parallel for different files
- **Ralph**: keep retrying `build-fixer` until the build passes
- **Pipeline**: `explore` -> `architect` -> `build-fixer` for root-cause-first debugging
