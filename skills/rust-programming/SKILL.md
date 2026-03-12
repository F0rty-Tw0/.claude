---
name: rust-programming
description: Use when you need modern Rust 2025-2026 defaults for Edition 2024 crates, Tokio services, testing, and dependency hygiene.
---

# Rust Programming

## Overview

Modern Rust defaults are opinionated: use stable Rust with Edition 2024, declare `rust-version` intentionally, keep public APIs small and typed, treat tests and docs as release gates, use async for I/O concurrency rather than as a universal speed tool, and keep `unsafe` plus dependency trust boundaries narrow and explicit.

This skill exists to prevent the common gaps in generic Rust advice: forgetting `style_edition = "2024"`, omitting resolver `"3"` in virtual workspaces, under-specifying docs.rs metadata, treating `spawn_blocking` as a free CPU pool, and stopping supply-chain hygiene at `cargo audit`.

## When to Use

Use this skill when you:

- start a new Rust crate or workspace
- review Rust project structure, CI, testing, or release policy
- design a public Rust library API
- build or review a Tokio-based service
- need security-sensitive Rust defaults for `unsafe`, FFI, and dependencies

Do not use this skill as the only authority for embedded-only, `no_std`, proc-macro internals, or platform-specific ABI work. Use it as the default baseline, then layer domain-specific references on top.

## Quick Reference

| Area | Default | Notes |
| --- | --- | --- |
| Toolchain | stable Rust + `edition = "2024"` | New work should start on Edition 2024. |
| MSRV | set `rust-version` explicitly | Edition 2024 implies at least Rust 1.85. |
| Workspace | use Cargo workspaces for multi-crate repos | In virtual workspaces, set `resolver = "3"` explicitly because there is no root package edition to infer it from. |
| Formatting | `cargo fmt` + `style_edition = "2024"` | Prevent editor/CI formatting drift. |
| Linting | `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Add stricter lints deliberately, not blindly. |
| Testing | unit + integration + doctest + regression tests | Add property tests for parsers, state machines, and normalization logic. |
| Docs | crate-level rustdoc, examples, `cargo doc --no-deps` | Configure docs.rs metadata when features or targets matter. |
| Async | Tokio for I/O concurrency, not CPU throughput | Use cancellation, bounded queues, tracing, and deterministic tests. |
| Security | `cargo audit` + `cargo deny` baseline | Add `cargo vet` in higher-assurance environments. |
| Release | SemVer + explicit MSRV policy + locked builds | Use semver checks for public crates. |

## Core Patterns

### Project Defaults

Use these as the starting point for a new library or service:

```toml
# Cargo.toml
[package]
name = "your_crate"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"
description = "..."
license = "MIT OR Apache-2.0"
repository = "https://github.com/you/your_crate"
readme = "README.md"
keywords = ["rust"]
categories = ["development-tools"]

[package.metadata.docs.rs]
all-features = true
# Add `rustdoc-args` only if you use `#[cfg(docsrs)]` in your docs/tests.
```

```toml
# rustfmt.toml
style_edition = "2024"
```

```toml
# Cargo.toml for a virtual workspace
[workspace]
members = ["crates/*"]
resolver = "3"

[workspace.lints.rust]
unsafe_code = "forbid"
```

Use `rust-version = "1.85"` only as the Edition 2024 floor. Raise it intentionally when your dependency graph or platform policy requires it.

### Library Defaults

For public crates:

- follow the Rust API Guidelines for naming, conversions, error types, documentation, and future-proofing
- expose the smallest public surface that solves the problem
- prefer enums/newtypes/builders over `String`/`bool`-driven APIs when invariants matter
- avoid exposing dependency types in public APIs unless they are part of the contract you want to support long-term
- return typed errors for library-facing failures; reserve panics for broken invariants or documented misuse
- use examples that compile and prefer `?` over `unwrap`
- add `#![deny(missing_docs)]` once the public API shape is real
- prefer `#[expect(lint)]` over long-lived `#[allow(lint)]` suppressions so stale waivers surface automatically
- if features change documented behavior, make that explicit in rustdoc and docs.rs metadata

### Service Defaults

For Tokio services:

- keep the runtime boundary at the binary; libraries should expose `async fn` and stay runtime-agnostic when practical
- use `CancellationToken` or equivalent explicit cancellation channels
- structure shutdown in phases: stop intake, signal cancellation, drain with timeouts, flush telemetry, then force-stop stragglers
- treat `tokio::spawn` as supervised work; keep handles for important tasks
- use bounded channels and backpressure by default
- use `tracing` with structured fields instead of ad hoc string logging
- use `#[tokio::test(start_paused = true)]` and synchronization primitives instead of sleep-based tests
- use `spawn_blocking` only for bounded blocking work; use dedicated threads or Rayon for sustained CPU-heavy work

### Security and Supply Chain Defaults

- keep `unsafe` isolated in tiny modules with safe wrappers and documented `# Safety` sections
- use explicit `unsafe { ... }` blocks even inside `unsafe fn`; do not hide large regions of unsafe behavior
- keep FFI boundaries narrow, validate foreign inputs immediately, and never let panics unwind across the boundary
- run `cargo audit` and `cargo deny` in CI
- use `cargo vet` when the environment is high-assurance or you need auditable trust decisions on dependencies
- prefer approved registries and reviewed sources; avoid production Git dependencies by default
- pay extra attention to proc-macros, build scripts, `-sys` crates, parsers, crypto, and crates with significant unsafe code
- for shipped binaries, consider `cargo auditable` so downstream scanning has accurate dependency metadata

## CI Baseline

Use this command set as the default floor:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo check --workspace --all-targets
cargo check --workspace --all-targets --all-features
cargo test --workspace --all-targets
cargo test --workspace --doc
cargo doc --workspace --no-deps
```

Add these when they apply:

- `cargo +1.85 check --workspace --all-targets` or your real MSRV toolchain
- `cargo check --workspace --all-targets --no-default-features`
- `cargo deny check`
- `cargo audit`
- `cargo semver-checks check-release` for public crates

For libraries, test stable + MSRV at minimum. For ecosystem-facing crates, add beta as an early-warning job.

## Common Mistakes

| Mistake | Better default |
| --- | --- |
| Using Edition 2024 but forgetting rustfmt style edition | Add `style_edition = "2024"` to `rustfmt.toml`. |
| Creating a virtual workspace without `resolver = "3"` | Set it explicitly in the root workspace manifest. |
| Treating `cargo audit` as the whole security story | Add `cargo deny`; add `cargo vet` when trust and provenance matter. |
| Treating `spawn_blocking` as a CPU executor | Use it for bounded blocking work only; use dedicated CPU workers for sustained compute. |
| Detaching critical tasks with `tokio::spawn` and forgetting them | Supervise important tasks and make shutdown explicit. |
| Writing examples with `unwrap` everywhere | Prefer `?` and realistic examples that model library use. |
| Silencing warnings with long-lived `#[allow(lint)]` | Prefer `#[expect(lint)]` when you intentionally suppress a known lint so stale waivers surface automatically. |
| Publishing a crate without an MSRV policy | Declare `rust-version` and document the policy in README/release notes. |
| Only testing default features | Test `--all-features`, `--no-default-features`, and important feature combinations. |

## Last Verified

2026-03 against Rust 1.85 / Edition 2024 docs, Cargo docs, Tokio docs, Rust API Guidelines, and RustSec tooling docs.

## Bottom Line

Default to stable + Edition 2024, explicit MSRV, small typed APIs, aggressive automated verification, supervised async, and explicit trust boundaries. In modern Rust, the usual failures are no longer syntax or borrow checking—they are operational: docs drift, feature drift, detached tasks, hidden blocking work, and unexamined dependencies.