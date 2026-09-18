# Claude Code Configuration

Complete setup guide to reproduce this Claude Code environment on Windows 11.

## Prerequisites

| Tool                                                          | Version | Install                                                      |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| [NVM for Windows](https://github.com/coreybutler/nvm-windows) | 1.2.2   | `winget install CoreyButler.NVMforWindows`                   |
| [Node.js](https://nodejs.org/)                                | 24.13.0 | `nvm install 24.13.0 && nvm use 24.13.0`                     |
| [pnpm](https://pnpm.io/)                                      | latest  | `corepack enable && corepack prepare pnpm@latest --activate` |
| [Python](https://www.python.org/)                             | 3.14+   | `winget install Python.Python.3.14`                          |
| [uv](https://docs.astral.sh/uv/)                              | 0.10+   | `pip install uv` or `winget install astral-sh.uv`            |
| [GitHub CLI](https://cli.github.com/)                         | latest  | `winget install GitHub.cli`                                  |
| [Git](https://git-scm.com/)                                   | latest  | `winget install Git.Git`                                     |

---

## Step 1: Install Claude Code

```powershell
irm https://claude.ai/install.ps1 | iex
```

Verify: `claude --version` (should show `2.1.x`)

## Step 2: Install RTK (Rust Token Killer)

> Repo: [rtk-ai/rtk](https://github.com/rtk-ai/rtk) | Website: [rtk-ai.app](https://www.rtk-ai.app/)

RTK is a CLI proxy written in Rust that filters and compresses command outputs before they reach your LLM context, saving 60-90% of tokens on common dev commands (git, cargo, vitest, tsc, eslint, etc.).

**Option A: Pre-built binary (recommended for Windows)**

```powershell
# 1. Download the Windows binary from GitHub Releases
#    https://github.com/rtk-ai/rtk/releases
#    Get: rtk-x86_64-pc-windows-msvc.zip

# 2. Extract and place in ~/bin
mkdir "$HOME\bin" -Force
# Extract rtk.exe to ~/bin/

# 3. Add ~/bin to PATH (one-time)
[Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$HOME\bin", "User")
```

**Option B: Cargo install (requires Rust toolchain)**

```bash
cargo install --git https://github.com/rtk-ai/rtk
```

**Option C: Quick install script (Linux/macOS)**

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

**Post-install: Initialize for Claude Code**

```bash
rtk init --global
```

This installs the hook and creates `RTK.md` with instructions for `settings.json`.

Verify: `rtk --version` (should show `rtk 0.15.0+`) and `rtk gain` (must show token savings stats)

> **Name collision warning**: If `rtk gain` fails, you may have `reachingforthejack/rtk` (Rust Type Kit) installed instead. Uninstall it first.

## Step 3: Install mcp-proxy

> Repo: [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) | PyPI: [mcp-proxy](https://pypi.org/project/mcp-proxy/)

mcp-proxy bridges between stdio and SSE/Streamable HTTP transports for MCP servers. In aggregation mode it exposes multiple MCP servers behind a single HTTP endpoint.

**Option A: uv (recommended)**

```bash
uv tool install mcp-proxy
```

**Option B: Docker (from v0.3.2+)**

```bash
docker run --rm -t ghcr.io/sparfenyuk/mcp-proxy:latest --help
```

**Update an existing install:**

```bash
uv tool upgrade --reinstall mcp-proxy
```

Verify: `where mcp-proxy` (should show `~/.local/bin/mcp-proxy.exe`)

## Step 4: Install GitHub MCP Server

> Repo: [github/github-mcp-server](https://github.com/github/github-mcp-server)

```powershell
# Download the latest release for Windows from:
# https://github.com/github/github-mcp-server/releases
# Or build from source (requires Go): go build -o github-mcp-server.exe ./cmd/github-mcp-server
# Place github-mcp-server.exe in ~/bin/
```

Authenticate with GitHub CLI first: `gh auth login`

Create `~/bin/github-mcp-wrapper.cmd` for dynamic auth via `gh`:

```batch
@echo off
for /f "tokens=*" %%a in ('gh auth token 2^>nul') do set GITHUB_PERSONAL_ACCESS_TOKEN=%%a
"%~dp0github-mcp-server.exe" stdio
```

Create `~/bin/github-mcp-wrapper.sh` for Git Bash:

```bash
#!/bin/bash
export GITHUB_PERSONAL_ACCESS_TOKEN=$("/c/Program Files/GitHub CLI/gh" auth token 2>/dev/null)
exec "/c/Users/$USERNAME/bin/github-mcp-server.exe" stdio
```

## Step 5: Login

```
/login
```

---

## Configuration Files

### settings.json

The main Claude Code settings file. Key sections:

```jsonc
{
  // Git Bash doesn't obey .gitignore — disable for correct file access
  "respectGitignore": false,

  // Environment variables
  "env": {
    "BASH_MAX_TIMEOUT_MS": "1800000", // 30-minute bash timeout
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1", // Enable native agent teams
  },

  // Disable co-authored-by in commits
  "includeCoAuthoredBy": false,

  // Permission allow/deny lists
  "permissions": {
    "allow": [
      "Bash(find:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "WebFetch(domain:github.com)",
      "WebFetch(domain:www.typescriptlang.org)",
      "Bash(git log:*)",
      "Bash(gh issue list:*)",
      "Bash(gh issue view:*)",
      "Bash(npx prettier:*)",
      "Bash(nx prepush:*)",
      "Bash(pnpm commit:*)",
      "Bash(rg:*)",
      "mcp__nx__nx_docs",
      "mcp__nx__nx_workspace",
      "mcp__nx__nx_project_details",
      "Bash(nx show projects:*)",
      "Bash(nx run-many:*)",
      "Bash(nx run:*)",
      "Bash(nx affected:*)",
      "Bash(nx lint:*)",
      "Bash(nx test:*)",
      "Bash(nx build:*)",
      "Bash(nx documentation:*)",
    ],
    "deny": [
      "Bash(git push origin main:*)",
      "Bash(git push origin master:*)",
      "Bash(rm -rf:*)",
      "Bash(curl:*)",
      "Bash(wget:*)",
    ],
  },

  // Auto-discover .mcp.json in projects
  "enableAllProjectMcpServers": true,

  // Status line — provided by the claude-hud plugin (see HUD section)
  "statusLine": {
    "type": "command",
    "command": "node <resolved claude-hud plugin>/dist/index.js",
  },

  // Enabled plugins
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true,
    "marksman-lsp": true,
    "lua-lsp@claude-plugins-official": true,
    "rust-analyzer-lsp@claude-plugins-official": true,
    "claude-hud@claude-hud": true,
  },

  // Hooks — nul-guard + RTK auto-rewrite and suggest
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node C:/Users/<YOUR_USERNAME>/.claude/hooks/nul-guard.js",
          },
          {
            "type": "command",
            "command": "node C:/Users/<YOUR_USERNAME>/.claude/hooks/rtk/rtk-rewrite.js",
          },
          {
            "type": "command",
            "command": "node C:/Users/<YOUR_USERNAME>/.claude/hooks/rtk/rtk-suggest.js",
          },
        ],
      },
    ],
  },
}
```

### mcp-proxy-servers.json

Copy from `mcp-proxy-servers.example.json` and fill in your API keys:

```powershell
Copy-Item mcp-proxy-servers.example.json mcp-proxy-servers.json
# Then edit mcp-proxy-servers.json with your actual keys
```

The proxy config defines these MCP servers:

| Server          | Package / Binary                                       | Requires                       |
| --------------- | ------------------------------------------------------ | ------------------------------ |
| **github**      | `~/bin/github-mcp-server.exe`                          | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| **codex-cli**   | `pnpm dlx @cexll/codex-mcp-server`                     | `OPENAI_API_KEY` (env)         |
| **gemini-cli**  | `pnpm dlx gemini-mcp-tool`                             | `GEMINI_API_KEY` (env)         |
| **angular-cli** | `pnpm dlx @angular/cli mcp`                            | -                              |
| **context7**    | `pnpm dlx @upstash/context7-mcp`                       | `CONTEXT7_API_KEY`             |
| **exa**         | `pnpm dlx exa-mcp-server`                              | `EXA_API_KEY`                  |
| **filesystem**  | `pnpm dlx @modelcontextprotocol/server-filesystem D:\` | -                              |
| **greb-mcp**    | `greb-mcp-js` (from `cheetah-greb`)                    | `GREB_API_KEY`                 |
| **taigaApi**    | `uv run src/server.py` (from `D:/pytaiga-mcp`)         | -                              |

### Installing Each MCP Server

All `pnpm dlx` servers run on-demand (no global install needed) as long as **pnpm** is on PATH. The proxy launches them automatically. You only need to install the standalone binaries and obtain API keys.

#### GitHub MCP Server (binary)

> Repo: [github/github-mcp-server](https://github.com/github/github-mcp-server)

```powershell
# 1. Download the latest release for Windows
#    https://github.com/github/github-mcp-server/releases
# 2. Place in ~/bin
Copy-Item github-mcp-server.exe "$HOME\bin\"

# 3. Authenticate with GitHub CLI (the wrapper uses `gh auth token`)
gh auth login
```

Alternative: use the remote server at `https://api.githubcopilot.com/mcp/` (requires OAuth or PAT).

#### Codex CLI (OpenAI)

> Repo: [cexll/codex-mcp-server](https://github.com/cexll/codex-mcp-server) | npm: [@cexll/codex-mcp-server](https://www.npmjs.com/package/@cexll/codex-mcp-server)

MCP server that connects to OpenAI's Codex CLI for code analysis, refactoring, and automation. Runs on-demand via `pnpm dlx` (no global install needed).

```bash
# Quick add to Claude Code:
claude mcp add codex-cli -- npx -y @cexll/codex-mcp-server

# Or global install:
npm install -g @cexll/codex-mcp-server
```

Prerequisite: [OpenAI Codex CLI](https://github.com/openai/codex) installed and authenticated.

#### Gemini CLI (Google)

> Repo: [jamubc/gemini-mcp-tool](https://github.com/jamubc/gemini-mcp-tool) | npm: [gemini-mcp-tool](https://www.npmjs.com/package/gemini-mcp-tool)

MCP server that connects to Google's Gemini CLI, leveraging Gemini's 1M token window for large file analysis and codebase understanding. Runs on-demand via `pnpm dlx`.

```bash
# Quick add to Claude Code:
claude mcp add gemini-cli -- npx -y gemini-mcp-tool

# Or global install:
npm install -g gemini-mcp-tool
```

Prerequisite: [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) installed and configured.

#### Angular CLI

> Repo: [angular/angular-cli](https://github.com/angular/angular-cli) | npm: [@angular/cli](https://www.npmjs.com/package/@angular/cli)

Built-in MCP server in Angular CLI for project introspection, documentation, and best practices. No API key required.

```powershell
# Verify it works standalone:
pnpm dlx @angular/cli mcp --help
```

#### Context7 (Upstash)

> Repo: [upstash/context7-mcp](https://github.com/upstash/context7-mcp) | npm: [@upstash/context7-mcp](https://www.npmjs.com/package/@upstash/context7-mcp)

Provides up-to-date code documentation for LLMs, avoiding hallucinated APIs and outdated examples. Works without a key (rate-limited) or with a free API key for higher limits.

```bash
# Quick add to Claude Code:
claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp --api-key YOUR_API_KEY
```

Get a free API key at: https://context7.com/dashboard

Add to `mcp-proxy-servers.json`:

```json
"env": { "CONTEXT7_API_KEY": "ctx7sk-..." }
```

#### Exa (Web Search)

> Repo: [exa-labs/exa-mcp-server](https://github.com/exa-labs/exa-mcp-server) | npm: [exa-mcp-server](https://www.npmjs.com/package/exa-mcp-server)

Web search and crawling MCP server powered by Exa's neural search. Runs on-demand via `pnpm dlx`.

```bash
# Quick add to Claude Code:
claude mcp add --transport http exa https://mcp.exa.ai/mcp
```

Get an API key at: https://dashboard.exa.ai/api-keys

Add to `mcp-proxy-servers.json`:

```json
"env": { "EXA_API_KEY": "..." }
```

The config uses `--tools=web_search_advanced_exa,crawling_exa` to expose only search and crawling tools.

#### Filesystem (MCP Reference Server)

> Repo: [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) | npm: [@modelcontextprotocol/server-filesystem](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem)

Node.js filesystem operations server with directory access controls. No API key required. Runs on-demand via `pnpm dlx`. The `D:\` argument grants read/write access to the D: drive.

```powershell
# Verify it works standalone:
pnpm dlx @modelcontextprotocol/server-filesystem D:\
```

> **Security note**: This grants the MCP server access to the entire D: drive. Adjust the path argument to limit scope if needed.

#### Greb MCP (Code Search)

> Repo: [VaibhavRaina/greb](https://github.com/VaibhavRaina/greb) | npm: [cheetah-greb](https://www.npmjs.com/package/cheetah-greb) | Website: [grebmcp.com](https://grebmcp.com/)

Semantic code search via MCP using natural language queries. Searches your codebase with AI-powered ranking — no indexing required. Works with Claude Code, Cursor, Windsurf, and other MCP clients.

```bash
pnpm install -g cheetah-greb
```

This installs the `greb-mcp-js` binary globally.

Get an API key at: https://grebmcp.com/dashboard/api-keys

Add to `mcp-proxy-servers.json`:

```json
"env": { "GREB_API_KEY": "grb_..." }
```

#### Taiga API (Project Management)

> Repo: [talhaorak/pytaiga-mcp](https://github.com/talhaorak/pytaiga-mcp)

MCP server for [Taiga](https://taiga.io/) project management. Provides access to projects, user stories, tasks, issues, sprints, and more. Runs locally via `uv`.

```powershell
# 1. Clone the repo to D:\
git clone https://github.com/talhaorak/pytaiga-mcp.git D:\pytaiga-mcp

# 2. Install dependencies
uv --directory D:\pytaiga-mcp sync

# 3. Configure your Taiga instance — create D:\pytaiga-mcp\.env
#    TAIGA_URL=https://your-taiga-instance.com
#    TAIGA_USERNAME=your-username
#    TAIGA_PASSWORD=your-password
```

The proxy launches the server automatically via `uv --directory D:/pytaiga-mcp run src/server.py`. No API key needed in the proxy config — authentication is handled by the `.env` file in the repo.

### ~/.claude.json (Client-Side MCP Config)

Claude Code connects to the MCP servers through the proxy. Add this `mcpServers` block to `~/.claude.json`:

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/github/sse"]
    },
    "codex-cli": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/codex-cli/sse"]
    },
    "gemini-cli": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/gemini-cli/sse"]
    },
    "angular-cli": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/angular-cli/sse"]
    },
    "context7": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/context7/sse"]
    },
    "exa": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/exa/sse"]
    },
    "filesystem": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/filesystem/sse"]
    },
    "greb-mcp": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/greb-mcp/sse"]
    },
    "taigaApi": {
      "type": "stdio",
      "command": "mcp-proxy",
      "args": ["http://127.0.0.1:8808/servers/taigaApi/sse"]
    }
  }
}
```

Each entry uses `mcp-proxy` as a stdio-to-SSE bridge, pointing at the aggregation server. The proxy must be running first (see below).

### Starting the MCP Proxy

Use the slash command inside Claude Code:

```
/start-mcp-proxy
```

Or manually via PowerShell:

```powershell
mcp-proxy --port 8808 --pass-environment --named-server-config "$HOME\.claude\mcp-proxy-servers.json"
```

Status: `http://127.0.0.1:8808/status`
Servers: `http://127.0.0.1:8808/servers/<name>/sse`

---

## Hooks

### NUL Guard (`hooks/nul-guard.js`)

A `PreToolUse:Bash` hook that prevents creation of literal `nul` files on Windows. The model sometimes emits `2>nul` (Windows CMD syntax) in bash, which creates a file named "nul" instead of discarding output.

Rewrites:

- `2>nul` -> `2>/dev/null`
- `>nul` -> `>/dev/null`
- `1>nul` -> `1>/dev/null`
- `2>>nul` -> `2>>/dev/null`

Uses word-boundary matching (`\bnul\b`) so it won't affect `null`, `nulcheck.log`, etc.

### RTK Auto-Rewrite (`hooks/rtk/rtk-rewrite.js`)

A `PreToolUse:Bash` hook that transparently rewrites commands to RTK equivalents before execution. Covers:

- **Git**: `git status/diff/log/add/commit/push/pull/branch/fetch/stash/show`
- **GitHub CLI**: `gh pr/issue/run`
- **JS/TS**: `vitest`, `tsc`, `eslint`, `prettier`, `playwright`, `prisma`
- **Cargo**: `cargo test/build/clippy`
- **File ops**: `cat` -> `rtk read`, `rg/grep` -> `rtk grep`, `ls` -> `rtk ls`
- **Containers**: `docker ps/images/logs`, `kubectl get/logs`
- **Python**: `pytest`, `ruff`, `pip`
- **Go**: `go test/build/vet`, `golangci-lint`

### RTK Suggest (`hooks/rtk/rtk-suggest.js`)

Same pattern matching as rewrite, but emits a `systemMessage` suggestion instead of modifying the command. Acts as a fallback awareness layer.

---

## Commands (Slash Commands)

| Command            | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| `/clean-claude`    | Cleanup `~/.claude` (debug logs, transcripts, cache). Runs `scripts/clean-claude.mjs` |
| `/delete-nul`      | Delete Windows reserved `nul` files via PowerShell `\\?\` path prefix                 |
| `/start-mcp-proxy` | Start/verify the mcp-proxy aggregation server on port 8808                            |

---

## Agents

### `agents/code-reviewer.md`

Custom agent triggered after major project steps are completed. Reviews implementation against the original plan for:

- Plan alignment and deviation analysis
- Code quality (error handling, type safety, naming)
- Architecture (SOLID, separation of concerns)
- Issue categorization: Critical / Important / Suggestion

---

## Skills (19 installed)

### Custom Skills

| Skill                            | Description                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| `dotnet`                         | .NET 10 development with clean architecture, Minimal APIs, SignalR |
| `systematic-debugging`           | Root-cause tracing, defense-in-depth, condition-based waiting      |
| `test-driven-development`        | TDD workflow with anti-pattern detection                           |
| `verification-before-completion` | Evidence-based completion checks before claiming done              |

### Community Skills (from skill packs)

| Skill                            | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `brainstorming`                  | Creative exploration before implementation     |
| `code-review-receiving`          | Technical rigor when receiving review feedback |
| `code-review-requesting`         | Structured review requests on completed work   |
| `dispatching-parallel-agents`    | Parallelization of independent tasks           |
| `finishing-a-development-branch` | Merge/PR/cleanup decision guide                |
| `frontend-design`                | Production-grade web component design          |
| `kaizen`                         | Continuous improvement and error proofing      |
| `nextjs-best-practices`          | Next.js App Router patterns                    |
| `plans-executing`                | Execute implementation plans with checkpoints  |
| `plans-writing`                  | Write implementation plans from specs          |
| `prompt-engineer`                | LLM prompt design and evaluation               |
| `skills-using`                   | Skill discovery and invocation                 |
| `skills-creating`                | Create and edit skills                         |
| `subagent-driven-development`    | Multi-agent implementation with spec review    |
| `using-git-worktrees`            | Isolated feature work via git worktrees        |

---

## Scripts

### `scripts/clean-claude.mjs`

Node.js cleanup utility targeting bloated `~/.claude` directories:

```bash
node ~/.claude/scripts/clean-claude.mjs                    # dry-run report
node ~/.claude/scripts/clean-claude.mjs --apply        # execute cleanup
node ~/.claude/scripts/clean-claude.mjs --deep         # also prune JSONL content
node ~/.claude/scripts/clean-claude.mjs --days 7      # override max age
```

Targets: `debug/`, `transcripts/`, `projects/`, `file-history/`, `shell-snapshots/`, `todos/`, `cache/`, `paste-cache/`. Deep mode truncates bloated JSONL fields (normalizedMessages, agent_progress, bash_progress, toolUseResult, thinking blocks).

---

## Profiles (Shell Configuration)

### The cross-shell problem on Windows

Claude Code uses **Git Bash** internally for all `Bash()` tool calls, but most Windows tools (pnpm globals, Python, LSP servers, etc.) are installed into Windows-style PATH entries that Git Bash doesn't inherit by default. This causes "command not found" errors for tools that work fine in PowerShell.

**The solution has two parts:**

1. **`profiles/bash_profile`** — syncs the full Windows PATH (Machine + User) into Git Bash at startup using `cygpath` to convert paths. This ensures `pnpm`, `rtk`, `mcp-proxy`, `python`, `uv`, and all global npm packages are findable.

2. **`settings.json: "respectGitignore": false`** — Git Bash doesn't handle `.gitignore` the same way, so this prevents file access issues.

**To install the bash profile:**

```powershell
# Copy to Git Bash's profile location
Copy-Item "$HOME\.claude\profiles\bash_profile" "$HOME\.bash_profile" -Force
```

How it works:

```bash
# Reads Windows PATH via powershell.exe, splits on ";", converts each
# entry to Unix-style path via cygpath, and appends missing entries
_sync_win_path() {
  local win_path
  win_path=$(powershell.exe -NoProfile -NonInteractive -Command \
    '([Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH","User")).TrimEnd(";")' \
    2>/dev/null | tr -d '\r')
  # ... converts and appends each missing entry to $PATH
}
```

Without this, Claude Code's bash shell won't find globally installed tools like `typescript-language-server`, `pnpm`, `rtk`, etc.

### PowerShell (`profiles/Microsoft.PowerShell_profile.ps1`)

Copy to your PowerShell profile location:

```powershell
Copy-Item "$HOME\.claude\profiles\Microsoft.PowerShell_profile.ps1" $PROFILE -Force
```

Features:

- Default working directory `D:\` (skipped in VS Code and Claude Code via `$env:TERM_PROGRAM` / `$env:CLAUDECODE` guards)
- Lazy-loaded Terminal-Icons (deferred import on first `ls`/`dir` for fast startup)
- Claude Code alias: `cc` -> `claude`
- Git aliases: `gcm` (checkout master), `gcb` (checkout -b), `gc` (checkout), `gp` (pull), `gpm` (pull master), `gfm` (fetch --prune), `gs` (status -sb)
- `rmnm` - recursively remove `node_modules`, `.nx`, `.angular`, `dist`, `tmp`, `coverage`, and lockfiles

### Terminal Defaults (`profiles/terminal-defaults.md`)

All terminals open in `D:\` by default:

- **Command Prompt**: shortcut WorkingDirectory set via `profiles/set-shortcut.ps1`
- **cmd.exe (Win+R)**: Registry `HKCU\Software\Microsoft\Command Processor\Autorun` = `cd /d D:\`
- **PowerShell**: `Set-Location D:\` guarded for non-VS-Code/Claude Code

---

## HUD (Status Line)

The status line is provided by the [claude-hud](https://github.com/jarrodwatts/claude-hud) plugin — it shows real-time info in Claude Code's status bar (model, context usage, cost, git branch, etc.).

Install it from its marketplace:

```
/plugin marketplace add jarrodwatts/claude-hud
/plugin install claude-hud
```

### How it works

The `statusLine.command` in `settings.json` resolves the latest installed claude-hud version under `~/.claude/plugins/cache/*/claude-hud/*/dist/index.js` and runs it with the active node binary. The plugin ships the renderer — no standalone wrapper script is needed.

To configure layout, presets, and which elements to display:

```
/claude-hud:setup        # set claude-hud as your status line
/claude-hud:configure    # adjust display options
```

---

## `~/bin` Directory

Standalone binaries on PATH:

| Binary                   | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `rtk.exe`                | RTK - Rust Token Killer (CLI proxy for token savings) |
| `github-mcp-server.exe`  | GitHub MCP Server binary                              |
| `github-mcp-wrapper.cmd` | Wrapper using `gh auth token` for dynamic auth        |
| `github-mcp-wrapper.sh`  | Same wrapper for Git Bash                             |
| `jq.exe`                 | JSON processor                                        |
| `marksman.exe`           | Markdown LSP server                                   |

---

## Language Servers (LSP)

Installed LSP servers used by the `typescript-lsp` plugin:

| Server | Binary | Extensions | Install |
|--------|--------|------------|---------|
| **TypeScript** | `typescript-language-server` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs` | `pnpm add -g typescript-language-server typescript` |
| **JSON** | `vscode-json-language-server` | `.json`, `.jsonc` | `pnpm add -g vscode-langservers-extracted` |
| **HTML** | `vscode-html-language-server` | `.html`, `.htm` | `pnpm add -g vscode-langservers-extracted` |
| **CSS** | `vscode-css-language-server` | `.css`, `.scss`, `.less` | `pnpm add -g vscode-langservers-extracted` |
| **YAML** | `yaml-language-server` | `.yaml`, `.yml` | `pnpm add -g yaml-language-server` |
| **Markdown** | `marksman` | `.md` | Download from [artempyanykh/marksman](https://github.com/artempyanykh/marksman/releases) to `~/bin/` |

**Install all at once:**

```powershell
pnpm add -g typescript-language-server typescript vscode-langservers-extracted yaml-language-server
```

**Optional servers** (install as needed):

```bash
pip install python-lsp-server          # Python (.py)
dotnet tool install -g omnisharp       # C# (.cs)
go install golang.org/x/tools/gopls@latest  # Go (.go)
rustup component add rust-analyzer     # Rust (.rs)
```

---

## Git Tracking

The `~/.claude` directory is a git repo. The `.gitignore` uses an invert pattern (ignore everything, then whitelist):

**Tracked**: `agents/`, `commands/`, `profiles/`, `skills/`, `hooks/`, `scripts/`, `settings.json`, `settings.local.json`, `.ignore`, `mcp-proxy-servers.example.json`, `.gitignore`, `README.md`, `CLAUDE.md`

**Not tracked** (secrets/ephemeral): `mcp-proxy-servers.json` (contains API keys), `debug/`, `transcripts/`, `projects/`, `cache/`, `plugins/`, etc.

---

## Quick Start (TL;DR)

```powershell
# 1. Install prerequisites
winget install CoreyButler.NVMforWindows GitHub.cli Git.Git
nvm install 24.13.0 && nvm use 24.13.0
corepack enable && corepack prepare pnpm@latest --activate

# 2. Install Claude Code
irm https://claude.ai/install.ps1 | iex

# 3. Set up ~/bin with RTK, GitHub MCP Server, jq, marksman
mkdir "$HOME\bin" -Force
# Download binaries and place in ~/bin
[Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$HOME\bin", "User")

# 4. Install mcp-proxy
pip install mcp-proxy   # or cargo install mcp-proxy

# 5. Clone this config repo
git clone <your-repo-url> "$HOME\.claude"

# 6. Copy and fill in secrets
Copy-Item "$HOME\.claude\mcp-proxy-servers.example.json" "$HOME\.claude\mcp-proxy-servers.json"
# Edit mcp-proxy-servers.json with your API keys

# 7. Update paths in settings.json to match your username
# Replace <YOUR_USERNAME> in statusLine.command and hooks

# 8. Install PowerShell profile
Copy-Item "$HOME\.claude\profiles\Microsoft.PowerShell_profile.ps1" $PROFILE -Force

# 9. Launch Claude Code and log in
claude
# Inside Claude Code:
#   /login
```
