---
name: external-context
description: Use when a task needs external documentation, API references, library or framework research, or web information beyond what's in the codebase, or when comparing external libraries, tools, or approaches requires current, sourced information from the web rather than training-data recall.
argument-hint: <search query or topic>
---

# External Context Skill

Search the web for external documentation, references, and context.

## Overview

External Context decomposes a query into web search facets, each handled by a search pass:

1. **Decomposition** - Identify the independent search facets (often just one)
2. **Search** - See Parallel Agent Invocation
3. **Synthesis** - Aggregate findings into structured context

## Usage

```
external-context <topic or question>
```

### Examples

```
external-context What are the best practices for JWT token rotation in Node.js?
external-context Compare Prisma vs Drizzle ORM for PostgreSQL
external-context Latest React Server Components patterns and conventions
```

## Protocol

### Facet Decomposition

Given a query, decompose into independent search facets (at most 5):

```markdown
## Search Decomposition

**Query:** <original query>

### Facet 1: <facet-name>

- **Search focus:** What to search for
- **Sources:** Official docs, GitHub, blogs, etc.

### Facet 2: <facet-name>

...
```

### Parallel Agent Invocation

One facet, or lookups a few searches settle: run WebSearch/WebFetch yourself — a subagent re-establishes context and costs more than the search. Several independent facets that each need real digging: fire them in parallel via the Agent tool (send all calls in one message so they run concurrently):

```
Agent(subagent_type="general-purpose", prompt="Search for: <facet 1 description>. Use WebSearch and WebFetch to find official documentation and examples. Cite all sources with URLs.")

Agent(subagent_type="general-purpose", prompt="Search for: <facet 2 description>. Use WebSearch and WebFetch to find official documentation and examples. Cite all sources with URLs.")
```

### Synthesis

After all agents complete, synthesize findings:

```markdown
## External Context: <query>

### Key Findings

1. **<finding>** - Source: [title](url)
2. **<finding>** - Source: [title](url)

### Detailed Results

#### Facet 1: <name>

<aggregated findings with citations>

#### Facet 2: <name>

<aggregated findings with citations>

### Sources

- [Source 1](url)
- [Source 2](url)
```

## Configuration

- Maximum 5 parallel search agents
- Each agent uses WebSearch and WebFetch tools
- No magic keyword trigger - explicit invocation only

## Common Failure Modes

- **Overlapping facets** -- two agents searching near-identical terms waste calls and produce duplicate findings.
  Keep facets mutually exclusive (different sub-questions, not rephrasings of the same one).
- **Uncited claims slip into synthesis** -- every finding in the output must carry a source URL; drop findings an
  agent returned without one rather than presenting them as fact.
- **Treating recall as current** -- if an agent's answer reads like training-data recall rather than a fetched
  page, it didn't do the research; re-run it with an explicit instruction to fetch and quote the source.
- **Too many facets, thin synthesis** -- more than 5 facets dilutes each agent's search budget and the final
  synthesis becomes a list instead of an answer. Prefer fewer, sharper facets.
