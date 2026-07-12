# Build Fix

Thin wrapper around the `build-fixer` agent. Collects type-check/build errors and fixes them with the smallest possible diff -- no refactoring, no architectural changes.

## When to Use

- The build or type check is failing
- User asks for a "minimal fix" to get the build green
- A compilation error is blocking other work

---
