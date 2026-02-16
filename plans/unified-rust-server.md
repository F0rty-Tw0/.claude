# Unified Rust Server: RTK + MCP Proxy

**Date**: 2026-02-16
**Status**: Analysis Complete / Pre-Planning

---

## Overview

Rewrite RTK (Rust Token Killer) and MCP Proxy into a single Rust binary that serves as both a CLI token-compression proxy and an MCP aggregation server.

---

## Current Systems

### RTK (Rust Token Killer)

- **Source**: [rtk-ai/rtk](https://github.com/rtk-ai/rtk) -- **already Rust**
- **Version**: 0.15.0 (local) / 0.18.0 (latest upstream)
- **Size**: 55 `.rs` source files, ~5,000-8,000 LOC
- **Binary**: `C:/Users/artio/bin/rtk.exe` (5.2 MB)
- **Dependencies**: clap 4, anyhow, regex, serde/serde_json, rusqlite (bundled SQLite), walkdir, ignore, colored, dirs, chrono, toml, thiserror, tempfile
- **Architecture**: CLI binary with ~40 subcommand parsers, each in its own module. Dispatches via a massive `match` in `main.rs`. Uses SQLite for token savings tracking. Each command module runs the underlying tool, captures output, then filters/compresses it.
- **Token savings**: 60-90% compression (measured 63.2% over 139 commands locally)

#### RTK Source Files

```
src/main.rs              src/cargo_cmd.rs        src/cc_economics.rs
src/ccusage.rs           src/config.rs           src/container.rs
src/curl_cmd.rs          src/deps.rs             src/diff_cmd.rs
src/discover/mod.rs      src/discover/provider.rs src/discover/registry.rs
src/discover/report.rs   src/display_helpers.rs  src/env_cmd.rs
src/filter.rs            src/find_cmd.rs         src/format_cmd.rs
src/gain.rs              src/gh_cmd.rs           src/git.rs
src/go_cmd.rs            src/golangci_cmd.rs     src/grep_cmd.rs
src/init.rs              src/json_cmd.rs         src/learn/detector.rs
src/learn/mod.rs         src/learn/report.rs     src/lint_cmd.rs
src/local_llm.rs         src/log_cmd.rs          src/ls.rs
src/next_cmd.rs          src/npm_cmd.rs          src/parser/error.rs
src/parser/formatter.rs  src/parser/mod.rs       src/parser/types.rs
src/pip_cmd.rs           src/playwright_cmd.rs   src/pnpm_cmd.rs
src/prettier_cmd.rs      src/prisma_cmd.rs       src/pytest_cmd.rs
src/read.rs              src/ruff_cmd.rs         src/runner.rs
src/summary.rs           src/tracking.rs         src/tree.rs
src/tsc_cmd.rs           src/utils.rs            src/vitest_cmd.rs
src/wget_cmd.rs
```

#### RTK Command Coverage

- **File ops**: ls, tree, read, find, grep, diff, json, log
- **Git**: status, log, diff, add, commit, push, pull, branch, fetch, stash, show
- **GitHub CLI**: pr, issue, run
- **JS/TS**: vitest, tsc, eslint, prettier, playwright, prisma, next, npm, npx, pnpm
- **Rust**: cargo test, cargo build, cargo clippy
- **Python**: pytest, ruff, pip
- **Go**: go test, go build, go vet, golangci-lint
- **Containers**: docker, kubectl
- **Network**: curl, wget
- **Analytics**: gain, cc-economics, discover, learn

### MCP Proxy (Python)

- **Source**: [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) -- **Python**
- **Version**: 0.11.0
- **Size**: ~1,215 lines across 8 Python files
- **Dependencies**: mcp SDK, starlette, uvicorn, httpx, httpx_auth (OAuth2)
- **Architecture**: Async Python server using Starlette/uvicorn. Spawns stdio child processes for each MCP server, creates `ClientSession` per server, proxies all MCP protocol messages (tools, resources, prompts, completions) through dynamically-created `Server` instances. Exposes SSE + StreamableHTTP endpoints.

#### MCP Proxy Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `__init__.py` | 1 | Package marker |
| `__main__.py` | 509 | Entry point, CLI arg parsing, mode dispatch |
| `config_loader.py` | 103 | Parse `mcpServers` JSON config |
| `httpx_client.py` | 122 | Custom httpx client with logging |
| `mcp_server.py` | 262 | Starlette app, SSE/StreamableHTTP endpoints, uvicorn server |
| `proxy_server.py` | 128 | MCP protocol proxy (tools, resources, prompts, completions) |
| `sse_client.py` | 45 | SSE client mode (stdio -> SSE bridge) |
| `streamablehttp_client.py` | 45 | StreamableHTTP client mode |

#### MCP Proxy Protocol Support

- **Transports**: stdio, SSE, StreamableHTTP
- **MCP capabilities proxied**: tools, resources, resource templates, prompts, logging, subscriptions, completions, progress notifications
- **Auth**: OAuth2 client credentials, header-based Bearer tokens
- **Features**: named servers (`/servers/{name}/sse`), CORS, health check (`/status`), environment passthrough

#### Current Config (9 servers)

```json
{
  "mcpServers": {
    "github": { "command": "github-mcp-server.exe", "args": ["stdio"] },
    "codex-cli": { "command": "cmd", "args": ["/c", "pnpm", "dlx", "@cexll/codex-mcp-server"] },
    "gemini-cli": { "command": "cmd", "args": ["/c", "pnpm", "dlx", "gemini-mcp-tool"] },
    "angular-cli": { "command": "cmd", "args": ["/c", "pnpm", "dlx", "@angular/cli", "mcp"] },
    "context7": { "command": "cmd", "args": ["/c", "pnpm", "dlx", "@upstash/context7-mcp"] },
    "exa": { "command": "cmd", "args": ["/c", "pnpm", "dlx", "exa-mcp-server", "--tools=..."] },
    "filesystem": { "command": "cmd", "args": ["/c", "pnpm", "dlx", "@modelcontextprotocol/server-filesystem", "D:\\"] },
    "greb-mcp": { "command": "greb-mcp-js" },
    "taigaApi": { "command": "uv", "args": ["--directory", "D:/pytaiga-mcp", "run", "src/server.py"] }
  }
}
```

### Integration Layer (Node.js hooks)

- `hooks/rtk/rtk-rewrite.js` (~160 LOC): PreToolUse:Bash hook that intercepts commands and rewrites them to `rtk ...` equivalents. Handles compound commands (`&&`, `||`, `;`, `|`), quote-aware splitting, 50+ rewrite patterns.
- `hooks/rtk/rtk-suggest.js`: Suggestion-only variant (currently unused per recent commit `e4acf06`).

---

## Effort Estimate: Unified Rust Server

### Component 1 -- RTK Integration (LOW: 4-6 days)

RTK is already Rust. The work is adapting it:

| Task | Days | Notes |
|------|------|-------|
| Fork/vendor RTK source | 1 | Copy src/, Cargo.toml, adapt module structure |
| Refactor into library API | 2-3 | Extract `main.rs` dispatch into callable library so MCP server can invoke RTK filters programmatically |
| Expose RTK as MCP tool | 1-2 | Register `rtk_run` as an MCP tool callable through the proxy |

### Component 2 -- MCP Proxy Rewrite (MEDIUM-HIGH: 20-27 days)

This is the core rewrite from Python to Rust:

| Task | Days | Notes |
|------|------|-------|
| MCP Protocol implementation | 5-7 | JSON-RPC 2.0 framing, request/response routing, capability negotiation. Check if `mcp-rs` SDK is mature enough |
| stdio transport (child processes) | 3-4 | Spawn processes via `tokio::process`, pipe stdin/stdout, lifecycle management, env injection, graceful shutdown |
| SSE transport (server-side) | 3-4 | Server-Sent Events via `axum::response::Sse`, session management, connection cleanup |
| StreamableHTTP transport | 2-3 | Bidirectional HTTP with stateless mode |
| Proxy routing layer | 3-4 | Route MCP requests to correct backend, namespace tools/resources per server, aggregate `list_tools`/`list_resources` |
| Config loader | 1 | Parse `mcpServers` JSON (trivial with serde) |
| OAuth2 / auth | 1-2 | Client credentials flow, header-based auth |
| CORS, health check, logging | 1 | Standard axum middleware |
| Named server URL routing | 1-2 | `/servers/{name}/sse`, `/servers/{name}/mcp` |

### Component 3 -- Unification & Testing (MEDIUM: 12-15 days)

| Task | Days | Notes |
|------|------|-------|
| Unified binary with subcommands | 2 | `server serve` (proxy) + `server rtk <cmd>` (CLI) via clap |
| RTK as built-in MCP tool | 2-3 | LLMs call RTK directly via proxy, no hook needed |
| Hook elimination | 1 | JS hooks become unnecessary |
| Config unification | 1 | Single TOML/JSON for MCP servers + RTK settings |
| Testing & stabilization | 5-7 | Integration tests, Windows compat, edge cases |
| Documentation | 1-2 | README, migration guide |

### Total

| Component | Estimate |
|-----------|----------|
| RTK integration (already Rust) | 4-6 days |
| MCP Proxy rewrite (Python -> Rust) | 20-27 days |
| Unification & testing | 12-15 days |
| **Total** | **36-48 days** (1 developer) |

---

## Key Risk: MCP Protocol in Rust

The biggest risk is the MCP protocol implementation. The Python `mcp` SDK handles:

- JSON-RPC 2.0 framing
- Capability negotiation (tools, resources, prompts, logging, completions)
- Session lifecycle (initialize -> operational -> shutdown)
- Bidirectional notifications and progress tracking
- Stream multiplexing for SSE

Options:
1. **Use Rust MCP SDK** (`mcp-rs`) if mature enough -- saves ~10 days but dependency risk
2. **Build on raw JSON-RPC** with serde + axum -- full control, more work

---

## Recommended Rust Crate Stack

| Concern | Crate |
|---------|-------|
| HTTP server | `axum` |
| SSE | `axum::response::Sse` |
| Async runtime | `tokio` |
| Child process mgmt | `tokio::process` |
| JSON-RPC | `serde_json` (manual) or `jsonrpc-core` |
| HTTP client | `reqwest` |
| CLI | `clap` (already used by RTK) |
| Config | `serde` + `serde_json` / `toml` |
| SQLite | `rusqlite` (already used by RTK) |

---

## Phased MVP Approach (Recommended)

### Phase 1 -- Minimal MCP Proxy (2 weeks)

Rust MCP aggregation proxy: stdio -> SSE bridging + multi-server config. Skip StreamableHTTP, OAuth2. Covers the actual use case (9 stdio servers behind one SSE endpoint).

### Phase 2 -- Bundle RTK (1 week)

Integrate RTK into the same binary as a subcommand. Single binary replaces both tools.

### Phase 3 -- RTK as MCP Tool (1 week)

Expose RTK as a built-in MCP tool. LLMs call it directly via the proxy. Eliminate the JS hooks entirely.

### Phase 4 -- Advanced Features (as needed)

StreamableHTTP, OAuth2, stateless mode, CORS -- add only when actually needed.

**MVP timeline: ~4 weeks**

---

## What You'd Gain

1. **Single binary** (~5-10 MB) instead of Python + Rust + Node.js hooks
2. **Instant startup** vs Python/uv cold start (~2-5s for mcp-proxy)
3. **Lower memory** (~10-30 MB vs ~80-150 MB for the proxy layer)
4. **No Python/uv dependency** for the proxy
5. **RTK as native MCP tool** -- no hook rewriting needed
6. **Single config** -- one file for everything

## What You'd Lose

1. **Upstream updates** from both projects (maintenance burden)
2. **6-10 weeks of development** time
3. **MCP protocol maintenance** as the spec evolves

---

## Research: Building MCP in Rust (2026-02-16)

### Finding 1: Official `rmcp` SDK is Production-Ready

The official Rust MCP SDK ([modelcontextprotocol/rust-sdk](https://github.com/modelcontextprotocol/rust-sdk)) is **the clear winner**. No need to build from scratch.

| Metric | Value |
|--------|-------|
| GitHub stars | 3,000+ |
| Contributors | 136 |
| Latest version | 0.15.0 (Feb 10, 2026) |
| Stable version | 0.12.0 (Dec 18, 2025) |
| Protocol coverage | 100% of MCP 2025-11-25 spec |
| Performance | 4,700+ QPS native, 1,700+ QPS in Docker |
| Production servers | 9+ known (filesystem, security, dev tools, automation) |

**Supported features:**
- Tools (`#[tool]` derive macros -- ~90% less boilerplate)
- Resources (full read/list)
- Prompts (`#[prompt]` macros)
- Sampling, Completions, Tasks (SEP-1686)
- Logging (stderr notifications)

**Transport support:**
- stdio -- full support
- Streamable HTTP -- full support (recommended for production)
- SSE -- available but **deprecated** in MCP spec
- WebSocket -- not built-in (by design)

**Cargo.toml:**
```toml
# Stable
rmcp = { version = "0.12.0", features = ["server", "macros", "transport-io"] }

# Latest
rmcp = { version = "0.15.0", features = ["server", "macros", "transport-io"] }
```

**Community alternatives assessed (all inferior):**
- `4t145/rmcp` -- archived April 2025, merged into official SDK
- `Derek-X-Wang/mcp-rust-sdk` -- archived July 2025, "not production ready"
- `prism-mcp-rs` -- 229 tests but unclear adoption
- `rust-mcp-sdk` -- full spec support but unclear adoption

### Finding 2: MCP Protocol Minimum Viable Implementation

**Minimum viable server = 5 message handlers (~500-800 LOC):**
1. `initialize` -- capability negotiation
2. `initialized` notification -- begin operation
3. `tools/list` -- return available tools
4. `tools/call` -- execute a tool
5. Error handling (13 standard + MCP-specific error codes)

**Initialize handshake:**
```json
// Client -> Server
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion":"2025-11-25",
  "capabilities":{"roots":{},"sampling":{}},
  "clientInfo":{"name":"claude-code","version":"1.0"}
}}

// Server -> Client
{"jsonrpc":"2.0","id":1,"result":{
  "protocolVersion":"2025-11-25",
  "capabilities":{"tools":{"listChanged":true}},
  "serverInfo":{"name":"unified-server","version":"0.1.0"}
}}

// Client -> Server (notification, no response)
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**Transport framing:**
- **stdio**: Newline-delimited JSON (NOT Content-Length like LSP)
- **Streamable HTTP**: POST for client messages, GET for SSE stream, `Mcp-Session-Id` header
- **SSE (deprecated)**: GET `/sse` for event stream, POST `/messages/` for client messages

**Proxy aggregation concerns:**
- **Namespacing**: `server_name__tool_name` pattern (e.g., `github__create_issue`)
- **Capability merging**: Conservative (only declare what ALL backends support) or Permissive (declare if ANY has it)
- **Sessions**: Independent per-backend sessions recommended
- **Routing**: `HashMap<String, (BackendId, OriginalToolName)>` for fast lookup

### Finding 3: Recommended Rust Architecture

**Updated crate stack (incorporating `rmcp`):**

```toml
[dependencies]
# MCP protocol
rmcp = { version = "0.15.0", features = ["server", "client", "macros", "transport-io", "transport-streamable-http"] }

# HTTP server
axum = { version = "0.7", features = ["sse"] }
tokio = { version = "1", features = ["full"] }
tokio-stream = "0.1"
async-stream = "0.3"

# Data
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dashmap = "6"

# CLI (shared with RTK)
clap = { version = "4", features = ["derive"] }
anyhow = "1.0"

# RTK dependencies
rusqlite = { version = "0.31", features = ["bundled"] }
regex = "1"
colored = "2"
chrono = "0.4"

# Utilities
uuid = { version = "1", features = ["v4", "serde"] }
tokio-util = { version = "0.7", features = ["sync"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

**Core architecture pattern:**

```rust
// ProxyState manages all MCP backends
#[derive(Clone)]
struct ProxyState {
    backends: Arc<DashMap<String, BackendHandle>>,  // name -> handle
    tool_registry: Arc<DashMap<String, (String, String)>>,  // namespaced -> (backend, original)
}

// Each backend manages a stdio child process
struct BackendHandle {
    tx: mpsc::Sender<BackendCommand>,
    capabilities: ServerCapabilities,
}

// SSE endpoint (axum)
async fn sse_handler(State(state): State<ProxyState>) -> Sse<impl Stream<...>> {
    let mut rx = state.event_bus.subscribe();
    Sse::new(try_stream! {
        loop {
            match rx.recv().await {
                Ok(msg) => yield Event::default().data(msg),
                Err(_) => break,
            }
        }
    }).keep_alive(KeepAlive::default())
}

// POST endpoint for MCP messages
async fn message_handler(
    State(state): State<ProxyState>,
    Json(req): Json<JsonRpcRequest>,
) -> Result<Json<JsonRpcResponse>, StatusCode> {
    let (backend_name, original_tool) = state.tool_registry.get(&req.tool_name)?;
    let backend = state.backends.get(&backend_name)?;
    let (response_tx, response_rx) = oneshot::channel();
    backend.tx.send(BackendCommand::Call { req, response_tx }).await?;
    Ok(Json(response_rx.await?))
}
```

**Graceful shutdown:**
```rust
use tokio_util::sync::CancellationToken;

let token = CancellationToken::new();
tokio::select! {
    _ = token.cancelled() => { /* shutdown backends */ }
    _ = server.serve() => {}
}
```

**Performance expectations:**
- SSE connection establishment: 50-200ms
- JSON-RPC proxy latency: 5-20ms
- Backend spawn time: 2-5ms
- Throughput: ~1,000 req/sec single backend, ~4,500 req/sec with 5 pooled

### Revised Effort Estimate (with `rmcp`)

Using the official SDK dramatically reduces the MCP proxy rewrite effort:

| Component | Original Estimate | With `rmcp` | Savings |
|-----------|-------------------|-------------|---------|
| MCP Protocol implementation | 5-7 days | 1-2 days | ~5 days |
| stdio transport | 3-4 days | 1 day | ~2-3 days |
| SSE/StreamableHTTP transport | 5-7 days | 2-3 days | ~3-4 days |
| Proxy routing layer | 3-4 days | 2-3 days | ~1 day |
| **MCP Proxy subtotal** | **20-27 days** | **8-12 days** | **~12-15 days** |

**Revised total:**

| Component | Revised Estimate |
|-----------|-----------------|
| RTK integration | 4-6 days |
| MCP Proxy rewrite (with `rmcp`) | 8-12 days |
| Unification & testing | 10-12 days |
| **Total** | **22-30 days** (~4-6 weeks) |

**Revised MVP (phased):**

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: MCP proxy with `rmcp` | 1.5 weeks | Stdio -> Streamable HTTP aggregation, multi-server config |
| Phase 2: Bundle RTK | 1 week | Single binary, shared clap CLI |
| Phase 3: RTK as MCP tool | 0.5 weeks | LLMs call RTK directly, eliminate JS hooks |
| **MVP Total** | **~3 weeks** | |

### Key Decision: SSE vs Streamable HTTP

The MCP spec has **deprecated SSE** in favor of Streamable HTTP. However:
- Claude Code currently connects via SSE (`/sse` endpoint)
- `rmcp` supports Streamable HTTP natively (recommended)
- SSE is still available in `rmcp` for backward compatibility

**Recommendation**: Implement Streamable HTTP as primary, keep SSE as fallback for Claude Code compatibility until it migrates.

### Sources

- [Official Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk)
- [rmcp on docs.rs](https://docs.rs/rmcp/latest/rmcp/)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP Transport Protocols Comparison](https://mcpcat.io/guides/comparing-stdio-sse-streamablehttp/)
- [Why MCP Deprecated SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [Build MCP Server in Rust (Shuttle)](https://www.shuttle.dev/blog/2025/07/18/how-to-build-a-stdio-mcp-server-in-rust)
- [Build MCP Server in Rust (MCPcat)](https://mcpcat.io/guides/building-mcp-server-rust/)
- [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)
- [RTK (rtk-ai/rtk)](https://github.com/rtk-ai/rtk)
- [axum SSE examples](https://github.com/tokio-rs/axum/blob/main/examples/sse/src/main.rs)
- [DashMap docs](https://docs.rs/dashmap/latest/dashmap/)
- [jsonrpsee](https://github.com/paritytech/jsonrpsee)
