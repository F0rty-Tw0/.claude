---
name: external-context
description: Gets current, cited external information - library docs via context7, else web search and fetch, with a URL on every claim. Use when a task needs API references, framework docs, or tool comparisons beyond the codebase or training recall.
argument-hint: <search query or topic>
---

# External Context

1. **Library or framework API** → context7 first (`mcp__context7__resolve-library-id`, then `mcp__context7__query-docs`; load them with `ToolSearch` if deferred).
2. **Anything else, or context7 has no match** → `WebSearch` + `WebFetch`, preferring official docs, changelogs, and source repos.
3. **Search yourself** for one question or a few lookups; a subagent re-reads context and costs more than the search. Only several independent sub-questions that each need real digging go to parallel `general-purpose` agents — at most 3, with non-overlapping questions — each told to fetch and cite. A full multi-source report is `anthropic-skills:deep-research`.

## Rules

- Every claim carries the URL it came from. Drop findings that have none rather than presenting them as fact.
- A fetched page beats recall. An answer that reads like training data wasn't researched: fetch and quote the source.
- Note the version and date of what you cite when the API has changed across releases.
