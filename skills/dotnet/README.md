# .NET 10 & C# 14 Development

High-fidelity guidelines for building scalable .NET 10 and C# 14 applications. Prioritizes Declarative Logic and Clean Architecture with strong typing and zero-allocation patterns.

## What It Does

Covers modern .NET development patterns across key areas:

| Area                  | Key Patterns                                                    |
| --------------------- | --------------------------------------------------------------- |
| **C# 14 Features**   | Extension Blocks, Field-Backed Properties, Span conversions     |
| **Minimal APIs**      | TypedResults, EndpointFilter, strongly-typed SignalR Hubs       |
| **EF Core 10**        | Named Query Filters, ExecuteUpdateAsync, AsNoTracking           |
| **Performance**       | Zero-allocation (Spans, SearchValues), JIT optimizations        |
| **Real-Time**         | WebSocketStream, Task.WhenEach                                  |

---

## When to Use

Triggers when you:

- Develop modern .NET 10 applications
- Need clean architecture with Minimal APIs
- Implement real-time communication
- Work with EF Core or need performance optimization

---

## Common Mistakes

- Sync-over-async with `.Result` or `.Wait()`
- Anemic domain models (logic in services instead of entities)

---
