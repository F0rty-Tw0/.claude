---
name: deepsearch
description: Use when locating code, usages, or patterns across many files and a single grep isn't enough -- thorough codebase search across components, utils, services, and hooks with a synthesized map of primary and related locations.
---

# Deep Search Mode

[DEEPSEARCH MODE ACTIVATED]

## Objective

Perform thorough search of the codebase for the specified query, pattern, or concept.

## Search Modality by Question Type

Pick the tool for the question -- don't default to one search style for everything:

| Question shape                                        | Tool                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Exact symbol, string, or known regex                    | `Grep` directly                                                                                                    |
| Filename or path pattern ("where's the config file")    | `Glob` directly                                                                                                    |
| "Where is X implemented" / fuzzy conceptual location     | `Agent(subagent_type="explore", model="haiku")` -- single call                                                    |
| Concept spans unrelated subsystems (e.g. pagination across API, frontend, and DB layers) | Decompose into 2-5 independent facets, fan out one `explore` agent per facet **in one message** so they run in parallel, then merge |
| Trace a call chain / data flow end to end                | `Grep` the entry point, then `Read` each hop yourself -- a summarizing agent loses the exact line-level chain     |

## Search Strategy

1. **Broad**: exact matches + related terms/variations; check common locations (components, utils, services, hooks)
2. **Deep dive**: read matching files, check imports/exports, follow the trail both directions
3. **Synthesize**: map where the concept lives, identify the main implementation, note related functionality

## Output Format

- **Primary Locations** (main implementations, file:line)
- **Related Files** (dependencies, consumers)
- **Usage Patterns** (how it's used across the codebase)
- **Key Insights** (patterns, conventions, gotchas)

Focus on being comprehensive but concise. Cite file paths and line numbers.

## Common Failure Modes

- **One grep, called it done** -- misses renamed variables, re-exports, dynamic usage. Follow imports/exports
  before concluding a location list is complete.
- **Overlapping fan-out facets** -- two agents both searching "auth" duplicates results and wastes tokens. Keep
  facets mutually exclusive (by layer, directory, or concern).
- **Losing line-level precision to a summarizing agent** -- for call-chain tracing, read the files yourself.
