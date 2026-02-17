# Plan: Universal Agentic CLI MCP Server (v2)

> Enhanced from v1 after analyzing [codex-mcp-server](https://github.com/tuannvm/codex-mcp-server), [@leonardommello/copilot-mcp-server](https://lobehub.com/mcp/leonardommello-copilot-mcp-server), [gemini-mcp-tool](https://github.com/jamubc/gemini-mcp-tool), [opencode-mcp-tool](https://github.com/frap129/opencode-mcp-tool), and 16 agentic CLI tools.

## Goal

A **config-driven, capability-gated MCP server** that wraps **any** agentic CLI tool. Adding a new CLI = adding a JSON entry, zero code changes. Unlike the v1 plan (single `ask_*` tool, 3 params, ~80 lines), this version provides:

- **Multiple tool types per provider** (ask, review, sessions, sandbox, ping, help) — registered only when the CLI supports them
- **Session management** across heterogeneous CLIs (two-tier: context-prepend + native passthrough)
- **Streaming** with MCP progress notifications
- **Structured output** with metadata (model, sessionId, threadId)
- **16 CLI providers** (up from 5)
- **TypeScript + Zod** for config validation and type safety
- **NPX distribution** (`npx @f0rty-tw0/agentic-mcp`)

## Architecture Overview

```
Claude Code / Any MCP Client
        │
        ▼
┌─────────────────────────────────┐
│   agentic-mcp (MCP Server)     │
│                                 │
│  ┌───────────┐  ┌────────────┐ │
│  │  Config    │  │   Tool     │ │
│  │  Loader    │──│  Registry  │ │
│  │  (Zod)    │  │ (dynamic)  │ │
│  └───────────┘  └────────────┘ │
│        │              │        │
│  ┌───────────┐  ┌────────────┐ │
│  │  Session   │  │  Command   │ │
│  │  Store     │  │  Executor  │ │
│  │ (in-mem)  │  │ (spawn)    │ │
│  └───────────┘  └────────────┘ │
└────────────┬────────────────────┘
             │
    ┌────────┼────────┬──────────┬──────────┐
    ▼        ▼        ▼          ▼          ▼
 claude   codex    gemini    copilot    goose  ...
```

**Four-layer architecture** (modeled after codex-mcp-server):

1. **Config Layer** — Load + validate `providers.json` with Zod schemas
2. **Tool Layer** — Dynamic tool registration based on provider capabilities
3. **Session Layer** — In-memory session store with TTL and LRU eviction
4. **Execution Layer** — spawn-based command execution with streaming + buffer limits

---

## Supported CLIs (16 providers)

### Tier 1: Production-Ready (stable non-interactive modes)

| Provider     | Command    | Prompt Flag         | Model Flag | Auto/Silent Flags      | Output Format     | Session Support          |
| ------------ | ---------- | ------------------- | ---------- | ---------------------- | ----------------- | ------------------------ |
| **Claude**   | `claude`   | `-p`                | `--model`  | `--output-format json` | json, stream-json | `--resume`, `--continue` |
| **Copilot**  | `copilot`  | `-p`                | `--model`  | `-s --allow-all-tools` | text (via `-s`)   | `--continue`, `--resume` |
| **Gemini**   | `gemini`   | `-p`                | `-m`       | `--output-format json` | json, stream-json | —                        |
| **Codex**    | `codex`    | `exec` (positional) | `-m`       | `--full-auto --json`   | NDJSON            | `exec resume`            |
| **Aider**    | `aider`    | `--message` / `-m`  | `--model`  | `--yes --no-stream`    | text only         | — (git-based)            |
| **Goose**    | `goose`    | `run -t`            | `--model`  | `--no-session -q`      | json, stream-json | `--resume`, `-n`         |
| **Amp**      | `amp`      | `-x` (stdin)        | —          | `--stream-json`        | stream-json       | `threads continue`       |
| **OpenCode** | `opencode` | `run` (positional)  | `-m`       | `--format json`        | json              | `--continue`, `-s`       |

### Tier 2: Newer/Emerging (mature non-interactive modes)

| Provider      | Command        | Prompt Flag         | Model Flag      | Auto/Silent Flags                    | Output Format        | Session Support      |
| ------------- | -------------- | ------------------- | --------------- | ------------------------------------ | -------------------- | -------------------- |
| **Cline**     | `cline`        | positional          | `-m`            | `-y --json`                          | json                 | `history`            |
| **Cursor**    | `cursor-agent` | `-p`                | `-m`            | `--force --output-format json`       | json, stream-json    | `--resume`           |
| **Droid**     | `droid`        | `exec` (positional) | `-m`            | `--auto high --output-format json`   | json, stream-json    | `-s SESSION_ID`      |
| **Plandex**   | `plandex`      | `tell` (positional) | — (model packs) | `--full --skip-menu`                 | text (via `--plain`) | `continue`, branches |
| **Amazon Q**  | `q`            | `chat` (positional) | —               | `--no-interactive --trust-all-tools` | text only            | `--resume`           |
| **OpenHands** | `openhands`    | `--headless -t`     | — (env-based)   | `--json`                             | JSONL                | `--resume`           |
| **Qwen Code** | `qwen-code`    | `-p`                | — (config)      | —                                    | text                 | —                    |
| **Tabnine**   | `tabnine`      | `-p`                | — (managed)     | `--output-format json`               | json                 | `/resume`            |

### Tier 3: Not Viable (no non-interactive mode)

| Tool                  | Reason                                      |
| --------------------- | ------------------------------------------- |
| Windsurf/Codeium      | IDE-only, no standalone CLI                 |
| Devin                 | Cloud/API-only, no local CLI                |
| Zed                   | Editor with headless mode, not an agent CLI |
| Sourcegraph Cody      | JSON-RPC for IDE plugins, not standalone    |
| Crush (Charmbracelet) | No non-interactive mode yet (Issue #1030)   |
| Grok CLI              | Community-built, too immature               |

Sources: [Claude CLI](https://code.claude.com/docs/en/cli-reference), [Copilot CLI](https://docs.github.com/en/copilot/reference/cli-command-reference), [Gemini CLI](https://geminicli.com/docs/cli/headless/), [Codex CLI](https://developers.openai.com/codex/cli/reference/), [Aider](https://aider.chat/docs/scripting.html), [Goose CLI](https://block.github.io/goose/docs/guides/running-tasks/), [Amp Manual](https://ampcode.com/manual), [OpenCode](https://opencode.ai/docs/cli/), [Cline CLI](https://docs.cline.bot/cline-cli/cli-reference), [Droid CLI](https://docs.factory.ai/reference/cli-reference), [Plandex](https://docs.plandex.ai/cli-reference/), [OpenHands](https://docs.openhands.dev/openhands/usage/cli/headless)

---

## Design Principles

1. **Config-driven providers** — each CLI defined in `providers.json`, dynamically registered at startup
2. **Capability-gated tools** — tools registered only when the CLI declares support (no dead tools)
3. **No hardcoded model enums** — model param is free-form string, passed through to CLI
4. **Stdin-first prompt delivery** — prefer piping prompt via stdin over argument passing (avoids shell escaping, arg-length limits)
5. **Two-tier session management** — context prepend for all CLIs + native passthrough for CLIs with `--resume`
6. **Streaming by default** — spawn-based execution with MCP progress notifications
7. **TypeScript + Zod** — config validation at startup, runtime input validation, type-safe handlers
8. **Stdio MCP transport** — works with mcp-proxy, `claude mcp add`, VS Code, Cursor
9. **NPX distribution** — zero-install via `npx @f0rty-tw0/agentic-mcp`
10. **Graceful degradation** — missing CLIs don't crash the server; tools return clear error messages

---

## File Structure

```
agentic-mcp/
├── package.json              # bin, dependencies, scripts
├── tsconfig.json             # ES2022, strict, NodeNext modules
├── providers.json            # Provider config (user-editable, ships with all 16)
├── src/
│   ├── index.ts              # Entry point — shebang, start server
│   ├── server.ts             # MCP server setup, ListTools/CallTool handlers
│   ├── types.ts              # Zod schemas, interfaces, constants
│   ├── errors.ts             # ToolExecutionError, CommandError, ValidationError
│   ├── config/
│   │   ├── loader.ts         # Load + validate providers.json at startup
│   │   └── schema.ts         # Zod schema for ProviderConfig
│   ├── tools/
│   │   ├── registry.ts       # Dynamic tool registration from capabilities
│   │   ├── definitions.ts    # Tool definition builders (JSON Schema generation)
│   │   └── handlers/
│   │       ├── ask.ts        # Generic ask handler (all providers)
│   │       ├── review.ts     # Code review handler (capability-gated)
│   │       ├── sessions.ts   # Session list/management handler
│   │       ├── ping.ts       # Ping handler (checks CLI availability)
│   │       ├── help.ts       # Help handler (runs CLI --help)
│   │       └── meta.ts       # list_providers meta-tool
│   ├── session/
│   │   └── storage.ts        # InMemorySessionStore (100 max, 24h TTL, LRU)
│   └── utils/
│       ├── command.ts         # spawn wrapper, streaming, buffer limits
│       └── platform.ts        # Windows/POSIX signal handling, path normalization
├── tests/                     # Jest unit tests
└── dist/                      # Build output (gitignored)
```

**Estimated size**: ~800-1000 lines TypeScript (vs ~80 lines .mjs in v1)

---

## Provider Config Schema (`providers.json`)

### Full TypeScript Interface

```typescript
interface ProviderConfig {
  enabled: boolean;
  description: string;
  command: string; // CLI binary name
  defaultModel: string; // Empty string if not applicable
  timeout: number; // ms, default 120000
  env: Record<string, string>; // Extra env vars (e.g. CLAUDECODE: "")

  // Capability declarations — gate which tools get registered
  capabilities: {
    ask: true; // Always required
    review?: boolean; // Code review tool
    sessions?: boolean; // Session management
    sandbox?: boolean | 'leveled'; // Sandbox control
    autoMode?: boolean; // Auto-approve execution
    workingDirectory?: boolean; // Per-call working directory
    fileContext?: boolean; // File reference support
    outputFormat?: 'json' | 'stream-json' | 'text';
  };

  // Command builders per capability
  commands: {
    ask: {
      prePrompt: string[]; // Args before prompt
      postPrompt: string[]; // Args after prompt
      modelFlag: string | null; // "--model", "-m", or null
      outputFlags?: string[]; // e.g. ["--output-format", "json"]
      autoModeFlags?: string[]; // e.g. ["--full-auto"]
      workingDirFlag?: string; // e.g. "-C", "--cwd"
      fileFlag?: string; // e.g. "--file", "--read"
    };
    review?: {
      subcommand?: string; // e.g. "review" (Codex)
      prePrompt?: string[]; // Args for review mode
      uncommittedFlag?: string;
      baseFlag?: string;
      commitFlag?: string;
      modelFlag?: string;
    };
    sessions?: {
      resumeFlag?: string; // e.g. "--resume", "exec resume"
      continueFlag?: string; // e.g. "--continue", "-c"
      listCommand?: string[]; // e.g. ["session", "list"]
    };
    sandbox?: {
      flag: string; // e.g. "--sandbox", "--auto"
      levels?: string[]; // e.g. ["read-only", "workspace-write", "danger-full-access"]
    };
  };

  // Input handling
  input: {
    method: 'flag' | 'positional' | 'stdin';
    // flag: passed via flag (e.g. -p "prompt")
    // positional: positional arg (e.g. exec "prompt")
    // stdin: piped to stdin (e.g. amp -x)
  };
}
```

### Example Configs

<details>
<summary><b>Claude Code</b></summary>

```json
"claude": {
  "enabled": true,
  "description": "Claude Code CLI (Anthropic) — autonomous coding agent",
  "command": "claude",
  "defaultModel": "claude-opus-4-6",
  "timeout": 180000,
  "env": { "CLAUDECODE": "" },
  "capabilities": {
    "ask": true,
    "sessions": true,
    "autoMode": true,
    "workingDirectory": true,
    "fileContext": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["-p"],
      "postPrompt": ["--output-format", "json"],
      "modelFlag": "--model",
      "autoModeFlags": ["--dangerously-skip-permissions"],
      "workingDirFlag": "--add-dir",
      "fileFlag": null
    },
    "sessions": {
      "resumeFlag": "--resume",
      "continueFlag": "--continue"
    }
  },
  "input": { "method": "flag" }
}
```

</details>

<details>
<summary><b>Codex CLI</b></summary>

```json
"codex": {
  "enabled": true,
  "description": "OpenAI Codex CLI — AI coding assistant with session management",
  "command": "codex",
  "defaultModel": "gpt-5.3-codex",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "review": true,
    "sessions": true,
    "sandbox": "leveled",
    "autoMode": true,
    "workingDirectory": true,
    "fileContext": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["exec"],
      "postPrompt": ["--full-auto", "--json"],
      "modelFlag": "-m",
      "workingDirFlag": "-C",
      "fileFlag": "--image"
    },
    "review": {
      "subcommand": "review",
      "uncommittedFlag": "--uncommitted",
      "baseFlag": "--base",
      "commitFlag": "--commit",
      "modelFlag": "-m"
    },
    "sessions": {
      "resumeFlag": "exec resume",
      "continueFlag": "exec resume --last"
    },
    "sandbox": {
      "flag": "--sandbox",
      "levels": ["read-only", "workspace-write", "danger-full-access"]
    }
  },
  "input": { "method": "positional" }
}
```

</details>

<details>
<summary><b>Copilot CLI</b></summary>

```json
"copilot": {
  "enabled": true,
  "description": "GitHub Copilot CLI — AI pair programmer",
  "command": "copilot",
  "defaultModel": "gpt-5.3-codex",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "autoMode": true,
    "outputFormat": "text"
  },
  "commands": {
    "ask": {
      "prePrompt": ["-p"],
      "postPrompt": ["-s", "--allow-all-tools"],
      "modelFlag": "--model",
      "autoModeFlags": ["--allow-all", "--no-ask-user"]
    },
    "sessions": {
      "resumeFlag": "--resume",
      "continueFlag": "--continue"
    }
  },
  "input": { "method": "flag" }
}
```

</details>

<details>
<summary><b>Gemini CLI</b></summary>

```json
"gemini": {
  "enabled": true,
  "description": "Google Gemini CLI — large-context AI assistant",
  "command": "gemini",
  "defaultModel": "gemini-2.5-pro",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "autoMode": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["-p"],
      "postPrompt": ["--output-format", "json"],
      "modelFlag": "-m",
      "autoModeFlags": ["-y"]
    }
  },
  "input": { "method": "flag" }
}
```

</details>

<details>
<summary><b>Aider</b></summary>

```json
"aider": {
  "enabled": false,
  "description": "Aider — AI pair programming in your terminal",
  "command": "aider",
  "defaultModel": "claude-sonnet-4-5-20250929",
  "timeout": 180000,
  "env": {},
  "capabilities": {
    "ask": true,
    "autoMode": true,
    "fileContext": true,
    "outputFormat": "text"
  },
  "commands": {
    "ask": {
      "prePrompt": ["--message"],
      "postPrompt": ["--yes", "--no-stream", "--no-pretty"],
      "modelFlag": "--model",
      "autoModeFlags": ["--yes-always", "--auto-commits"],
      "fileFlag": "--file"
    }
  },
  "input": { "method": "flag" }
}
```

</details>

<details>
<summary><b>Goose</b></summary>

```json
"goose": {
  "enabled": false,
  "description": "Goose (Block) — extensible AI agent",
  "command": "goose",
  "defaultModel": "",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["run", "-t"],
      "postPrompt": ["--no-session", "-q", "--output-format", "json"],
      "modelFlag": "--model"
    },
    "sessions": {
      "resumeFlag": "--resume",
      "listCommand": ["session", "list"]
    }
  },
  "input": { "method": "flag" }
}
```

</details>

<details>
<summary><b>Amp</b></summary>

```json
"amp": {
  "enabled": false,
  "description": "Amp (Sourcegraph) — AI coding agent",
  "command": "amp",
  "defaultModel": "",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "outputFormat": "stream-json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["-x"],
      "postPrompt": ["--stream-json"],
      "modelFlag": null
    },
    "sessions": {
      "resumeFlag": "threads continue -x"
    }
  },
  "input": { "method": "stdin" }
}
```

</details>

<details>
<summary><b>Cline</b></summary>

```json
"cline": {
  "enabled": false,
  "description": "Cline — autonomous coding agent CLI",
  "command": "cline",
  "defaultModel": "",
  "timeout": 180000,
  "env": {},
  "capabilities": {
    "ask": true,
    "workingDirectory": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": [],
      "postPrompt": ["-y", "--json"],
      "modelFlag": "-m",
      "workingDirFlag": "-c"
    }
  },
  "input": { "method": "positional" }
}
```

</details>

<details>
<summary><b>Cursor Agent</b></summary>

```json
"cursor": {
  "enabled": false,
  "description": "Cursor Agent — AI-first editor CLI",
  "command": "cursor-agent",
  "defaultModel": "",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "autoMode": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["-p"],
      "postPrompt": ["--force", "--output-format", "json"],
      "modelFlag": "-m",
      "autoModeFlags": ["--force"]
    },
    "sessions": {
      "resumeFlag": "--resume"
    }
  },
  "input": { "method": "flag" }
}
```

</details>

<details>
<summary><b>Droid</b></summary>

```json
"droid": {
  "enabled": false,
  "description": "Droid (Factory.ai) — autonomous coding agent",
  "command": "droid",
  "defaultModel": "claude-opus-4-6",
  "timeout": 180000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "sandbox": "leveled",
    "workingDirectory": true,
    "fileContext": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["exec"],
      "postPrompt": ["--auto", "high", "--output-format", "json"],
      "modelFlag": "-m",
      "workingDirFlag": "--cwd",
      "fileFlag": "--file"
    },
    "sessions": {
      "resumeFlag": "--session-id"
    },
    "sandbox": {
      "flag": "--auto",
      "levels": ["low", "medium", "high"]
    }
  },
  "input": { "method": "positional" }
}
```

</details>

<details>
<summary><b>Amazon Q</b></summary>

```json
"amazon-q": {
  "enabled": false,
  "description": "Amazon Q Developer CLI — AWS-integrated AI assistant",
  "command": "q",
  "defaultModel": "",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "outputFormat": "text"
  },
  "commands": {
    "ask": {
      "prePrompt": ["chat"],
      "postPrompt": ["--no-interactive", "--trust-all-tools"],
      "modelFlag": null
    },
    "sessions": {
      "resumeFlag": "--resume"
    }
  },
  "input": { "method": "positional" }
}
```

</details>

<details>
<summary><b>OpenCode</b></summary>

```json
"opencode": {
  "enabled": true,
  "description": "OpenCode — multi-model CLI coding assistant",
  "command": "opencode",
  "defaultModel": "anthropic/claude-sonnet-4-5",
  "timeout": 120000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "fileContext": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["run"],
      "postPrompt": ["--format", "json"],
      "modelFlag": "-m",
      "fileFlag": "--file"
    },
    "sessions": {
      "continueFlag": "--continue"
    }
  },
  "input": { "method": "positional" }
}
```

</details>

<details>
<summary><b>Plandex</b></summary>

```json
"plandex": {
  "enabled": false,
  "description": "Plandex — plan-oriented AI development",
  "command": "plandex",
  "defaultModel": "",
  "timeout": 300000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "autoMode": true,
    "outputFormat": "text"
  },
  "commands": {
    "ask": {
      "prePrompt": ["tell"],
      "postPrompt": ["--full", "--skip-menu", "--plain"],
      "modelFlag": null,
      "autoModeFlags": ["--full"]
    },
    "sessions": {
      "resumeFlag": "continue"
    }
  },
  "input": { "method": "positional" }
}
```

</details>

<details>
<summary><b>OpenHands</b></summary>

```json
"openhands": {
  "enabled": false,
  "description": "OpenHands — autonomous software engineer",
  "command": "openhands",
  "defaultModel": "",
  "timeout": 300000,
  "env": {},
  "capabilities": {
    "ask": true,
    "sessions": true,
    "outputFormat": "json"
  },
  "commands": {
    "ask": {
      "prePrompt": ["--headless", "-t"],
      "postPrompt": ["--json"],
      "modelFlag": null
    },
    "sessions": {
      "resumeFlag": "--resume"
    }
  },
  "input": { "method": "flag" }
}
```

</details>

---

## Tool Registration (Capability-Gated)

Tools are registered **dynamically** based on each provider's `capabilities` declaration:

### Universal Tools (always registered)

| Tool              | Description                               | Params     |
| ----------------- | ----------------------------------------- | ---------- |
| `list_providers`  | List all configured providers with status | —          |
| `ping_{provider}` | Test CLI availability                     | `message?` |
| `help_{provider}` | Show CLI help documentation               | —          |

### Primary Tool (always registered per provider)

| Tool             | Description            | Params                                                                            |
| ---------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `ask_{provider}` | Execute prompt via CLI | `prompt` (req), `context?`, `model?`, `sessionId?`, `workingDirectory?`, `files?` |

### Capability-Gated Tools

| Tool                  | Capability Gate               | Params                                                  |
| --------------------- | ----------------------------- | ------------------------------------------------------- |
| `review_{provider}`   | `capabilities.review: true`   | `prompt?`, `uncommitted?`, `base?`, `commit?`, `model?` |
| `sessions_{provider}` | `capabilities.sessions: true` | — (lists active sessions)                               |

### Dynamic Parameter Extension

The `ask_{provider}` tool schema is **dynamically extended** based on capabilities:

```
Base schema (all providers):
  prompt: string (required)
  context: string (optional)
  model: string (optional, default from config)
  sessionId: string (optional, max 256 chars)

+ if capabilities.workingDirectory:
  workingDirectory: string (optional)

+ if capabilities.sandbox === 'leveled':
  sandbox: enum (provider-specific levels)

+ if capabilities.sandbox === true:
  sandbox: boolean

+ if capabilities.autoMode:
  autoMode: boolean (optional)

+ if capabilities.fileContext:
  files: string[] (optional, file paths to include)
```

**Example**: `ask_codex` gets `prompt`, `context`, `model`, `sessionId`, `workingDirectory`, `sandbox` (enum: read-only/workspace-write/danger-full-access), `autoMode`, `files` — 8 params total.

**Example**: `ask_aider` gets `prompt`, `context`, `model`, `autoMode`, `files` — 5 params total.

**Example**: `ask_amp` gets `prompt`, `context`, `sessionId` — 3 params total (minimal).

---

## Session Management (Two-Tier)

### Tier 1: MCP-Level Context Prepend (all providers)

For CLIs **without** native session support (Gemini, Aider, Cline, etc.):

- In-memory store tracks conversation turns per `sessionId`
- Previous turns prepended to prompt: `"Previous context:\n{turns}\n\nCurrent request:\n{prompt}"`
- Configurable context window: last N turns (default: 5)

### Tier 2: CLI-Native Passthrough (capability-gated)

For CLIs **with** native session support (Codex, Claude, Goose, Cursor, etc.):

- Store maps MCP `sessionId` → CLI conversation ID
- Resume via native flag (e.g. `codex exec resume <convId>`, `claude --resume <id>`)
- Falls back to Tier 1 if native resume fails

### Session Store Configuration

```typescript
const SESSION_CONFIG = {
  maxSessions: 100, // Max concurrent sessions
  ttlMs: 24 * 60 * 60 * 1000, // 24h TTL
  maxContextTurns: 5, // Tier 1: max turns to prepend
  cleanupIntervalMs: 60000, // Cleanup every 60s
};
```

### Session Data Structure

```typescript
interface Session {
  id: string;
  providerId: string;
  createdAt: Date;
  lastAccessedAt: Date;
  turnCount: number;
  turns: Array<{ role: 'user' | 'assistant'; content: string }>;
  nativeSessionId?: string; // CLI's own session/conversation ID
}
```

---

## Command Execution

### Spawn-Based with Streaming

All CLI invocations use `child_process.spawn()` (not `execFile`) for streaming:

```typescript
interface ExecutionConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  timeout: number;
  stdin?: string; // For stdin-based CLIs (Amp)
  maxOutputBytes: number; // Default: 10MB per stream
  progressDebounceMs: number; // Default: 100ms
}
```

### Arg Building Logic

```
For input.method === 'flag':
  [...prePrompt, fullPrompt, ...modelArgs, ...postPrompt]

For input.method === 'positional':
  [...prePrompt, fullPrompt, ...modelArgs, ...postPrompt]

For input.method === 'stdin':
  [...prePrompt, ...modelArgs, ...postPrompt]
  + pipe fullPrompt to child.stdin
```

Where:

- `fullPrompt` = `context ? context + "\n\n" + prompt : prompt`
- `modelArgs` = `modelFlag ? [modelFlag, model || defaultModel] : []`
- Model args omitted entirely when `modelFlag` is null/empty and no model specified

### Progress Notifications

For long-running CLIs, intermediate output sent via MCP `notifications/progress`:

- 100ms debounce (matches codex-mcp-server)
- Requires client to pass `_meta.progressToken` in request
- Gracefully degrades (no-op if client doesn't support progress)

### Platform Handling

```typescript
// Windows: no POSIX signals, use taskkill
if (process.platform === 'win32') {
  spawn('taskkill', ['/pid', child.pid, '/T', '/F']);
} else {
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 5000);
}
```

---

## Structured Output

When a CLI returns JSON (`capabilities.outputFormat === 'json' | 'stream-json'`), the server parses it and returns structured content:

```typescript
interface ToolResponse {
  content: [{ type: 'text'; text: string }];
  structuredContent?: {
    provider: string;
    model: string;
    sessionId?: string;
    nativeSessionId?: string;
    executionTimeMs: number;
    truncated: boolean;
  };
  _meta?: {
    provider: string;
    model: string;
  };
}
```

For CLIs returning plain text, stdout is returned as-is in a text content block.

---

## Error Handling

Three error classes (modeled after codex-mcp-server):

| Error                   | When                                               | MCP Response                                                    |
| ----------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `ValidationError`       | Invalid tool params, bad config                    | `{ isError: true, content: [{ text: "Validation: ..." }] }`     |
| `CommandExecutionError` | CLI process fails (non-zero exit, timeout, signal) | `{ isError: true, content: [{ text: "Command failed: ..." }] }` |
| `ProviderNotFoundError` | CLI binary not on PATH                             | `{ isError: true, content: [{ text: "CLI not found: ..." }] }`  |

### Startup Validation

On server start:

1. Validate `providers.json` against Zod schema — fail fast on invalid config
2. For each enabled provider, check CLI availability via `which`/`where`
3. Auto-disable unavailable CLIs with warning log (don't crash)
4. Register tools only for validated, available providers

---

## MCP Tool Annotations

Following the MCP 2025-11-25 specification (as codex-mcp-server does):

```typescript
// ask_{provider}
{ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }

// review_{provider}
{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }

// sessions_{provider}, list_providers, help_{provider}
{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

// ping_{provider}
{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
```

---

## Package Configuration

```json
{
  "name": "@f0rty-tw0/agentic-mcp",
  "version": "1.0.0",
  "description": "Universal MCP server wrapping any agentic CLI tool",
  "type": "module",
  "bin": {
    "agentic-mcp": "./dist/index.js"
  },
  "files": ["dist", "providers.json"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src/",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.24.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "tsx": "^4.0.0",
    "@types/node": "^22.0.0",
    "jest": "^30.0.0",
    "ts-jest": "^29.0.0",
    "eslint": "^9.0.0"
  }
}
```

---

## Integration

### With mcp-proxy (current setup)

In `~/.claude/mcp-proxy-servers.json`:

```json
"agentic": {
  "command": "node",
  "args": ["C:/Users/ArtiomTofan/.claude/agentic-mcp/dist/index.js"]
}
```

### With claude mcp add (direct)

```bash
claude mcp add agentic -- npx -y @f0rty-tw0/agentic-mcp
```

### With VS Code / Cursor

```json
{
  "mcpServers": {
    "agentic": {
      "command": "npx",
      "args": ["-y", "@f0rty-tw0/agentic-mcp"]
    }
  }
}
```

---

## Implementation Phases

### Phase 1: Core (MVP)

- [ ] TypeScript project setup (package.json, tsconfig.json)
- [ ] Zod schema for `providers.json` + config loader
- [ ] `ask_{provider}` tool with dynamic param extension
- [ ] spawn-based command execution (blocking, no streaming yet)
- [ ] `ping_{provider}` and `help_{provider}` tools
- [ ] `list_providers` meta-tool
- [ ] 5 core providers: Claude, Codex, Copilot, Gemini, OpenCode
- [ ] Error handling (3 error classes)
- [ ] Startup CLI availability check
- [ ] Platform handling (Windows signals, path normalization)

### Phase 2: Sessions + Streaming

- [ ] In-memory session store (Tier 1: context prepend)
- [ ] Native session passthrough (Tier 2: --resume/--continue)
- [ ] `sessions_{provider}` tool
- [ ] Streaming execution with MCP progress notifications
- [ ] Structured output parsing for JSON-outputting CLIs

### Phase 3: Extended Providers

- [ ] Aider, Goose, Amp providers
- [ ] Cline, Cursor, Droid providers
- [ ] Amazon Q, Plandex, OpenHands providers
- [ ] Qwen Code, Tabnine providers (community)

### Phase 4: Advanced Features

- [ ] `review_{provider}` tool (Codex initially, extensible)
- [ ] Sandbox parameter support
- [ ] File context passing (`files` param → `--file`/`@` syntax)
- [ ] Concurrency limiting (configurable `maxConcurrency` per provider)
- [ ] Output size limits (configurable `maxOutputBytes`)
- [ ] NPX publish to npm registry

---

## Adding a New CLI Provider (zero code changes)

1. Open `providers.json`
2. Add entry with CLI flags and capabilities:

```json
"newcli": {
  "enabled": true,
  "description": "Ask NewCLI",
  "command": "newcli",
  "defaultModel": "some-model",
  "timeout": 120000,
  "env": {},
  "capabilities": { "ask": true, "sessions": true },
  "commands": {
    "ask": {
      "prePrompt": ["-p"],
      "postPrompt": ["--silent"],
      "modelFlag": "--model"
    },
    "sessions": {
      "resumeFlag": "--resume"
    }
  },
  "input": { "method": "flag" }
}
```

3. Restart server. Tools `ask_newcli`, `sessions_newcli`, `ping_newcli`, `help_newcli` are now available.

---

## Risks & Mitigations

| Risk                            | Mitigation                                                               |
| ------------------------------- | ------------------------------------------------------------------------ |
| CLI not installed               | Auto-detect on startup, disable with warning, `ping_*` for runtime check |
| Long response timeout           | Configurable per provider, streaming prevents blocking                   |
| MCP SDK breaking changes        | Pinned to `^1.24.0`, semver-safe                                         |
| CLI flag changes                | Edit one entry in `providers.json`                                       |
| Claude nested session           | `env: { "CLAUDECODE": "" }` unsets guard var                             |
| Shell injection via prompt      | Use `spawn()` with array args (no shell), stdin for complex prompts      |
| Windows arg length limit (32K)  | Prefer stdin-based prompt delivery for long prompts                      |
| Large CLI output (>10MB)        | Configurable `maxOutputBytes` with truncation + flag in response         |
| Concurrent CLI processes        | Configurable `maxConcurrency` per provider (default: 1)                  |
| CLI hangs waiting for auth      | Timeout is sole safeguard; clear error message                           |
| JSON output includes ANSI codes | Strip ANSI before parsing (regex: `/\x1b\[[0-9;]*m/g`)                   |
| Plandex needs running server    | Document as prerequisite; `ping_plandex` checks availability             |
| OpenHands needs Docker          | Document as prerequisite; `ping_openhands` checks availability           |
| Amazon Q non-interactive bugs   | Known issues (#1951, #1995); document as "beta" provider                 |

---

## Comparison: v1 vs v2

| Dimension          | v1 (Current)               | v2 (Enhanced)                                 |
| ------------------ | -------------------------- | --------------------------------------------- |
| Providers          | 5                          | 16 (8 stable + 8 emerging)                    |
| Tools per provider | 1 (`ask_*`)                | 3-6 (ask, review, sessions, ping, help, list) |
| Params per tool    | 3 (prompt, context, model) | 3-8 (dynamically extended by capability)      |
| Type safety        | None (.mjs)                | TypeScript + Zod validation                   |
| Sessions           | None                       | Two-tier (context prepend + native)           |
| Streaming          | None (execFile blocks)     | spawn + MCP progress notifications            |
| Structured output  | None                       | Model/session metadata                        |
| Error handling     | Basic isError              | 3 error classes + startup validation          |
| Distribution       | Local only                 | NPX + local                                   |
| Input handling     | Arg only                   | flag / positional / stdin                     |
| Tool annotations   | None                       | MCP 2025-11-25 spec                           |
| Platform support   | Basic                      | Windows signals, path normalization           |
| Lines of code      | ~80                        | ~800-1000                                     |
| Build step         | None                       | `tsc` (one-time)                              |

---

## Open Questions

- [ ] Should `providers.json` ship with all 16 providers (disabled by default) or just the 5 core?
- [ ] Should stdin piping be the default prompt delivery for all CLIs that support it?
- [ ] Should the server parse JSON output from CLIs or pass raw stdout through?
- [ ] How should model fallback work when user-specified model isn't available?
- [ ] Maximum concurrent CLI invocations: global limit or per-provider?
