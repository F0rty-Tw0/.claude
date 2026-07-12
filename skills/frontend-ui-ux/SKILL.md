---
name: frontend-ui-ux
description: Use when the user requests frontend UI/UX work -- designing or implementing components, responsive layouts, design-system consistency, or accessibility compliance.
---

# Frontend UI/UX Command

Routes to the designer agent or agentic-mcp for frontend work.

## Usage

```
frontend-ui-ux <design task>
```

## Routing

### Preferred: MCP Direct

Before first MCP tool use, call `ToolSearch("select:mcp__agentic-mcp__ask_codex")` to load the deferred tool. Use `mcp__agentic-mcp__ask_codex` (or `ask_claude`) with the design task, passing relevant component/style files via `--file`. If agentic-mcp is unavailable, use the Claude agent fallback below.

### Fallback: Claude Agent

```
Agent(subagent_type="designer", model="sonnet", prompt="<design task>")
```

## Capabilities

- Component design and implementation
- Responsive layouts
- Design system consistency
- Accessibility compliance
