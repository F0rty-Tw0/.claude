# Ultrawork

A parallel execution engine: fires multiple independent agent calls simultaneously and routes each to the
appropriate model tier (haiku/sonnet/opus). It provides parallelism only -- no persistence, verification loops, or
state management. `ralph` layers persistence on top of it; `autopilot` layers the full autonomous pipeline on top of
`ralph`.

## When to Use

- Multiple independent tasks can run simultaneously
- The user says "ulw" or "ultrawork", or wants parallel execution
- Work needs to be delegated to multiple agents at once and the user will manage completion themselves

Not for: guaranteed completion with verification (use `ralph`), a full autonomous pipeline (use `autopilot`), or a
single sequential task with no parallelism opportunity.

---
