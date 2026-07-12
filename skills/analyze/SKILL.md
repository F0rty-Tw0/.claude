---
name: analyze
description: Use when the user asks to analyze, investigate, deep-dive, or root-cause a bug, system architecture, or performance issue, or needs cross-file reasoning and dependency/impact assessment before making changes.
---

# Analyze

## Purpose

Analyze performs deep investigation of architecture, bugs, performance issues, and dependencies. It routes to the architect agent or the agentic-mcp `ask_codex` tool for thorough analysis and returns structured findings with evidence.

## Use When

- User says "analyze", "investigate", "debug", "why does", or "what's causing"
- User needs to understand a system's architecture or behavior before making changes
- User wants root cause analysis of a bug or performance issue
- User needs dependency analysis or impact assessment for a proposed change
- A complex question requires reading multiple files and reasoning across them

## Do Not Use When

- User wants code changes made -- use executor agents or `ralph` instead
- User wants a full plan with acceptance criteria -- use `plan` skill instead
- User wants a quick file lookup or symbol search -- use `explore` agent instead
- User asks a simple factual question that can be answered from one file -- just read and answer directly

## Why This Exists

Deep investigation requires a different approach than quick lookups or code changes. Analysis tasks need broad context gathering, cross-file reasoning, and structured findings. Routing these to the architect agent or `ask_codex` ensures the right level of depth without the overhead of a full planning or execution workflow.

## Execution Policy

- Prefer `ask_codex` (agentic-mcp) for analysis when available -- faster, lower cost, and brings an independent model's read on the problem
- Fall back to the architect Claude agent when agentic-mcp is unavailable
- Always provide context files to the analysis tool for grounded reasoning
- Return structured findings, not just raw observations

## Steps

1. **Identify the analysis type**: Architecture, bug investigation, performance, or dependency analysis
2. **Gather relevant context**: Read or identify the key files involved
3. **Route to analyzer**:
   - Preferred: `mcp__agentic-mcp__ask_codex` with the investigation question, passing each relevant source file via `--file`
   - Fallback: `Agent(subagent_type="architect", model="opus", prompt="Analyze: ...")`
4. **Return structured findings**: Present the analysis with evidence, file references, and actionable recommendations

## Tool Usage

- Before first MCP tool use, call `ToolSearch("select:mcp__agentic-mcp__ask_codex")` to load the deferred tool
- Use `mcp__agentic-mcp__ask_codex` with relevant files passed via `--file` as the preferred analysis route
- Use `Agent(subagent_type="architect", model="opus", ...)` as fallback when agentic-mcp is unavailable
- For broad analysis, use the `explore` agent first to identify relevant files before routing to architect

## Examples

**Good** -- User: "analyze why the WebSocket connections drop after 30 seconds"
Action: Gather WebSocket-related files, route to architect with context, return root cause analysis with specific file:line references and a recommended fix.
Why good: Clear investigation target, structured output with evidence.

**Good** -- User: "investigate the dependency chain from src/api/routes.ts"
Action: Use explore agent to map the import graph, then route to architect for impact analysis.
Why good: Uses explore for fact-gathering, architect for reasoning.

**Bad** -- User: "analyze the auth module"
Action: Returning "The auth module handles authentication."
Why bad: Shallow summary without investigation. Should examine the module's structure, patterns, potential issues, and provide specific findings with file references.

**Bad** -- User: "fix the bug in the parser"
Action: Running analysis skill.
Why bad: This is a fix request, not an analysis request. Route to executor or ralph instead.

## Escalation And Stop Conditions

- If analysis reveals the issue requires code changes, report findings and recommend using `ralph` or executor for the fix
- If the analysis scope is too broad ("analyze everything"), ask the user to narrow the focus
- If agentic-mcp is unavailable and the architect agent also fails, report what context was gathered and suggest manual investigation paths

## Final Checklist

- [ ] Analysis addresses the specific question or investigation target
- [ ] Findings reference specific files and line numbers where applicable
- [ ] Root causes are identified (not just symptoms) for bug investigations
- [ ] Actionable recommendations are provided
- [ ] Analysis distinguishes between confirmed facts and hypotheses
