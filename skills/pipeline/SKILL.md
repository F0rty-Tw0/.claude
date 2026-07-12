---
name: pipeline
description: Use when the user wants to chain multiple agents into a sequential or branching workflow, passing one agent's findings as context into the next -- e.g. explore then architect then executor.
---

# Pipeline Skill

## Overview

The pipeline skill chains multiple agents together so the output of one agent becomes the input to the next -- similar to Unix pipes, but for agent orchestration. There is no separate pipeline engine: you drive this yourself with sequential `Agent` tool calls, carrying each stage's findings forward into the next stage's prompt.

## Core Concepts

### 1. Sequential Pipelines

Agent A's output flows into Agent B's prompt, which flows into Agent C's prompt.

```
explore -> architect -> executor
```

1. `explore` searches the codebase and produces findings
2. `architect` receives those findings (pasted into its prompt) and produces analysis/recommendations
3. `executor` receives the recommendations and implements changes

### 2. Branching Pipelines

Route to different agents based on what an earlier stage found:

- Complex refactoring -> `architect` -> `deep-executor`
- Simple change -> `executor`
- UI work -> `designer` -> `executor`

### 3. Parallel-Then-Merge Pipelines

Run independent agents in parallel (multiple `Agent` calls in one message), then feed both outputs into the next stage:

```
parallel(explore, external-researcher) -> architect -> executor
```

## Built-in Pipeline Presets

Each preset is a recipe: a fixed stage order you replicate with `Agent` calls, carrying context forward manually between stages.

### Review Pipeline

**Purpose:** Comprehensive code review and implementation
**Stages:** `explore` -> `architect` -> `critic` -> `executor`
**Use for:** Major features, refactorings, complex changes

### Implement Pipeline

**Purpose:** Planned implementation with testing
**Stages:** `planner` -> `executor` -> `test-engineer`
**Use for:** New features with clear requirements

### Debug Pipeline

**Purpose:** Systematic debugging workflow
**Stages:** `explore` -> `architect` -> `build-fixer`
**Use for:** Bugs, build errors, test failures

### Research Pipeline

**Purpose:** External research + internal analysis
**Stages:** `parallel(external-researcher, explore)` -> `architect` -> `writer`
**Use for:** Technology decisions, API integrations

### Refactor Pipeline

**Purpose:** Safe, verified refactoring
**Stages:** `explore` -> `architect` -> `deep-executor` -> `qa-tester`
**Use for:** Architectural changes, API redesigns

### Security Pipeline

**Purpose:** Security audit and fixes
**Stages:** `explore` -> `security-reviewer` -> `executor` -> `security-reviewer` (re-verify)
**Use for:** Security reviews, vulnerability fixes

## Running a Pipeline

There is no `/pipeline agent1 -> agent2` parser -- describe the chain in your own task breakdown and drive it with real tool calls:

1. Call the first-stage agent: `Agent(subagent_type="explore", prompt="...")`
2. Read its returned findings
3. Call the next-stage agent, folding stage 1's findings into the prompt: `Agent(subagent_type="architect", model="opus", prompt="<task> + <stage 1 findings>")`
4. Repeat until the chain completes
5. For parallel stages, issue multiple `Agent` calls in the same message

Match model to complexity: don't spend opus on a simple stage, and reach for `deep-executor` (opus) instead of `executor` only when the task is genuinely multi-file or fuzzy.

## Error Handling

When a stage fails:

- **Retry** the same agent with a clarified prompt
- **Fallback to a higher tier**: `executor` -> `deep-executor`
- **Consult architect**: on repeated `executor` failure, run `architect` to diagnose before retrying
- **Ask the user**: if a stage is blocked on a decision only they can make, stop and ask

## Verification Rules

Before treating a pipeline as complete, verify:

- [ ] All stages completed successfully
- [ ] Output from the final stage addresses the original task
- [ ] No unhandled errors in any stage
- [ ] All files modified pass lsp_diagnostics
- [ ] Tests pass (if applicable)

## Best Practices

1. **Start with presets** -- use the built-in recipes above before improvising a custom chain
2. **Match model to complexity** -- don't waste opus on simple stages
3. **Keep stages focused** -- each agent should have one clear responsibility
4. **Use parallel stages** -- run independent work simultaneously in one message
5. **Verify at checkpoints** -- use `architect` or `critic` to check progress between stages

## Integration with Other Skills

- **Ralph**: loop a pipeline's stages until verified complete
- **Ultrawork**: run multiple pipelines in parallel
- **Autopilot**: use pipeline stages as building blocks
