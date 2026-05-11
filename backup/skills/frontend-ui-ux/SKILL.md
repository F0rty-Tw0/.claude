---
name: frontend-ui-ux
description: Designer-developer for UI/UX work
version: 1.0.0
---

# Frontend UI/UX Command

Routes to the designer agent or Copilot MCP for frontend work.

## Usage

```
frontend-ui-ux <design task>
```

## Routing

### Preferred: MCP Direct

Before first MCP tool use, call `ToolSearch("mcp")` to discover deferred MCP tools. Use `mcp__copilot__ask-copilot` with
`agent_role: "designer"` for design tasks. If ToolSearch finds no MCP tools, use the Claude agent fallback below.

### Fallback: Claude Agent

```
Task(subagent_type="designer", model="sonnet", prompt="{{ARGUMENTS}}")
```

## Capabilities

- Component design and implementation
- Responsive layouts
- Design system consistency
- Accessibility compliance

Task: {{ARGUMENTS}}
