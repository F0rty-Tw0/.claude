# Pipeline

Chains multiple agents together so one agent's output becomes the next agent's input, driven with sequential `Agent` tool calls. Includes ready-made recipes (Review, Implement, Debug, Research, Refactor, Security) and guidance on branching and parallel-then-merge stages.

## When to Use

- A task naturally decomposes into stages (explore -> analyze -> implement)
- Different findings should route to different follow-up agents
- Independent sub-tasks can run in parallel before merging into the next stage

---
