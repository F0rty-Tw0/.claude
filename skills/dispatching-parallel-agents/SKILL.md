---
name: dispatching-parallel-agents
description: Runs 2+ independent tasks or failures as parallel subagents, at most 3 per wave, with worktree isolation when they touch the same files. Use for unrelated test failures, independent bugs or components, or when the user says 'ultrawork' or 'ulw'.
---

# Dispatching Parallel Agents

One agent per independent problem domain, running concurrently.

## When it fits

- Tasks or failures with different root causes in different files or subsystems.
- Not when failures are related (one fix may fix the rest), the cause is still unknown, or each fix takes a handful of tool calls: a subagent re-reads context and costs more than the fix.

## Cap: 3 agents per wave

7 and 14 parallel agents both hit the session rate limit (HTTP 429). More work → run it in waves.

## Partitioning

- One agent per component, each with an exclusive file set (`src/api/**`, `src/ui/**`). No file is owned by two agents.
- Same files, or a real risk of collision → give each agent `isolation: "worktree"`. Its own checkout turns the ownership map into a merge plan instead of an honor-system lock.
- Shared boundary files (`package.json`, `tsconfig.json`, shared types) are not edited by parallel agents; update them sequentially at merge time.
- Merge worktree branches at the end. A merge conflict is a decomposition miss — note it.
- An agent that contradicts another's boundary assumptions is re-dispatched, not merged.

## Dispatch

1. **Baseline first:** run the suite and record the exact failing test names and count. The merged result must beat it.
2. Send the wave in one message. Use `executor` for well-scoped fixes, `deep-executor` for cross-system work, `debugger` only to diagnose (it does not implement fixes). Add `run_in_background: true` for long runs.

```
Agent(subagent_type="executor", description="Fix abort test failures",
      prompt="""Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts:
1. "should abort tool with partial output capture" - expects 'interrupted at' in message
2. "should properly track pendingToolCount" - expects 3 results, gets 0
Find the root cause; don't just raise timeouts. Change only src/agents/abort*.
Return: root cause and the files you changed.""")
```

Each prompt: one scope, the pasted errors and test names, a constraint on what may change, and the expected return.

## Integrate

1. Read each summary; check whether agents touched the same code.
2. Run the full suite and compare to the baseline (e.g. "6 failing {a..f} -> 0 failing").
3. Spot-check the diffs; agents make systematic errors.
