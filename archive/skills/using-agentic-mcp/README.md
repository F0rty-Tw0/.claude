# Using agentic-mcp

Reference skill for using agentic-mcp, a multi-model AI gateway that wraps CLI tools (Claude, Copilot, Codex, Gemini, OpenCode) as MCP servers. Enforces a discovery-first workflow: always check providers before querying them.

## What It Does

- Provides the correct MCP tool invocation order (`list_providers` -> `ping` -> `help` -> `ask`)
- Documents all available tools: `ask_<provider>`, `ask_all`, `ping_<provider>`, `help_<provider>`, `list_providers`, `provider_metrics`, `sessions_<provider>`
- Covers setup, MCP usage, and CLI fallback modes
- Prevents common mistakes like querying before discovering

---

## When to Use

Triggers when you:

- Need to set up agentic-mcp in a new environment
- Want to query AI providers through MCP tools or CLI
- Need to compare responses across multiple providers
- Are checking provider availability or capabilities

---
