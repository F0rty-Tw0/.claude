# Rust Programming

Research-backed defaults for modern Rust development in 2025-2026. This skill focuses on the decisions generic advice often misses: Edition 2024 setup details, explicit MSRV policy, workspace/resolver choices, Tokio operational discipline, and supply-chain hygiene beyond a single audit command.

## What It Does

| Area | Coverage |
| --- | --- |
| Project setup | Edition 2024, `rust-version`, workspaces, resolver `"3"`, rustfmt style edition |
| Library design | API Guidelines, typed errors, docs, feature policy, SemVer/MSRV expectations |
| Tokio services | Cancellation, shutdown, tracing, bounded queues, deterministic tests, blocking-work separation |
| Tooling and CI | `fmt`, `clippy`, `check`, `test`, `doc`, docs.rs metadata, semver checks |
| Security | `unsafe` boundaries, FFI rules, `cargo audit`, `cargo deny`, `cargo vet`, dependency trust |

---

## When to Use

Triggers when you:

- start a new Rust crate or workspace
- review Rust project standards or CI
- design a public Rust library API
- build or review a Tokio-based service
- need a modern baseline for Rust security and supply-chain policy

---

## Core Principle

Modern Rust defaults should be explicit. Stable + Edition 2024 is the starting point, not the whole answer: pin the formatting style, declare MSRV, supervise async work, and treat dependency trust as part of the design.

---
