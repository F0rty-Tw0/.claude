# Dispatching Parallel Agents

Handle multiple independent failures or tasks by dispatching one agent per problem domain concurrently, instead of investigating sequentially.

## What It Does

Identifies independent problem domains and dispatches focused agents in parallel:

1. **Identify** independent domains (group failures by what's broken)
2. **Create** focused agent tasks with specific scope, goals, and constraints
3. **Dispatch** all agents in parallel
4. **Review and integrate** results - check for conflicts, run full suite

Agent prompts should be: focused (one domain), self-contained (all context included), and specific about expected output.

---

## When to Use

Triggers when you:

- Face 3+ test files failing with different root causes
- Have multiple subsystems broken independently
- Each problem can be understood without context from others

---

## When NOT to Use

- Failures are related (fix one might fix others)
- Need full system context to understand
- Agents would interfere with each other (shared state, same files)

---

## Real-World Impact

From debugging sessions: 6 failures across 3 files, 3 agents dispatched in parallel, all fixes integrated with zero conflicts. 3 problems solved in the time of 1.

---
