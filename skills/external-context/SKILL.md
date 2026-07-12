---
name: external-context
description: Use when a task needs external documentation, API references, library or framework research, or web information beyond what's in the codebase, or when comparing external libraries, tools, or approaches requires current, sourced information from the web rather than training-data recall.
argument-hint: <search query or topic>
---

# External Context Skill

Invoke parallel external-researcher agents to search the web for external documentation, references, and context.

## Overview

External Context decomposes a query into parallel web search facets, each handled by an independent external-researcher
agent:

1. **Decomposition** - Break query into 2-5 independent search facets
2. **Parallel Search** - Spawn external-researcher agents for each facet
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

Given a query, decompose into 2-5 independent search facets:

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

Fire independent facets in parallel via the Agent tool (send all calls in one message so they run concurrently):

```
Agent(subagent_type="external-researcher", model="sonnet", prompt="Search for: <facet 1 description>. Use WebSearch and WebFetch to find official documentation and examples. Cite all sources with URLs.")

Agent(subagent_type="external-researcher", model="sonnet", prompt="Search for: <facet 2 description>. Use WebSearch and WebFetch to find official documentation and examples. Cite all sources with URLs.")
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

- Maximum 5 parallel external-researcher agents
- Each agent uses WebSearch and WebFetch tools
- No magic keyword trigger - explicit invocation only
