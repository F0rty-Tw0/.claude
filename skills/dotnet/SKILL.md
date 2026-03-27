---
name: dotnet
description: Use when developing modern .NET 10 applications requiring clean architecture, Minimal APIs, and real-time communication.
---

# Expert .NET 10 & C# 14 Development

## Overview

High-fidelity guidelines for building scalable, high-performance systems with .NET 10 and C# 14. This skill prioritizes **Declarative Logic** and **Clean Architecture**. It emphasizes strong typing, zero-allocation patterns, and early validation through TDD-driven design.

## Principles

- **Declarative Excellence**: Define _what_ to achieve, not _how_. Use LINQ and C# 14 **Extension Blocks** over imperative logic.
- **Strong Typing & Safety**: No `dynamic` or `object`. Use `record`, `required`, and `readonly` by default. Leverage C# 14's improved `nameof` for unbound generics.
- **Modular Strategic Design**: Decouple logic into discrete modules. Domain logic must never depend on infrastructure.
- **Performance by Default**: Leverage .NET 10's zero-allocation patterns (Spans, SearchValues) and improved JIT optimizations.

## Coding Patterns

### Modern C# 14 & .NET 10 Features

- **Extension Blocks**: Use `extension SystemStreamExtensions for Stream { ... }` to add static and instance members cleanly.
- **Field-Backed Properties**: Use the `field` keyword for custom accessors without manual back-fields.
- **Span implicit conversion**: Take advantage of first-class support for `Span<T>` and `ReadOnlySpan<T>` implicit conversions.
- **Nameof Unbound Generics**: Use `nameof(List<>)` for cleaner reflection and logging.
- **Lambda Ref/In/Out**: Use parameter modifiers in lambdas without explicit types (e.g., `(ref x) => ...`).

### Clean Architecture & Minimal APIs

- **Minimal API**: Use `TypedResults` (e.g., `Results.Ok<T>`) for strongly-typed returns and better OpenAPI 10 generation.
- **Endpoint Filters**: Use `EndpointFilter` for cross-cutting concerns (Validation, Logging) instead of middleware for business logic.
- **Strongly Typed Hubs**: Use `Hub<TClient>` in SignalR to enforce interface-based client calls.

## Best Practices

### Observability & Monitoring

- Use `ActivitySource` and `Meter` for OpenTelemetry integration.
- Avoid manual string formatting in logs; use `LoggerMessage` source generators for efficiency.

### Entity Framework Core (EF 10)

- **Named Query Filters**: Use named filters to allow multiple filters per entity type with selective disabling.
- Use `ExecuteUpdateAsync` and `ExecuteDeleteAsync` for mass operations (bypass Change Tracker).
- Default to `AsNoTracking()` for read-only queries.

### Real-Time & Concurrency

- Use `WebSocketStream` in .NET 10 for simplified WebSocket management.
- Leverage `Task.WhenEach` for processing multiple tasks as they complete.

## Common Mistakes

- **Sync-over-Async**: Using `.Result` or `.Wait()`. Always propagate `async/await` up to the entry point.
- **Anemic Domain Models**: Placing logic in services instead of inside Domain entities.

## Verification Checklist

1. [ ] Is the logic declarative (LINQ/Extensions)?
2. [ ] Are .NET 10/C# 14 specific features (e.g., `extension` blocks, `field`) utilized?
4. [ ] Does the service layer return `IResult` or strongly-typed records?
5. [ ] Is there any `any` or `dynamic` usage? (Must be replaced with specific types).
