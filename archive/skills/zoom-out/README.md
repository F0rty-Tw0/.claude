# Zoom Out

A one-line prompt that asks the agent to step back from an unfamiliar code area and produce a higher-level map instead of diving straight into implementation details.

## What It Does

Instructs the agent to go up one layer of abstraction and describe the relevant modules and callers using the project's own domain vocabulary — not generic architecture terms, the actual glossary this codebase uses.

---

## When to Use

Trigger when you:
- are unfamiliar with a section of code and need orientation before making changes
- need to see how a module fits into the bigger picture before editing it
- want a map of callers and dependents instead of a deep dive into one file
