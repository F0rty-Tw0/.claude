# NuGet Package Version Reference for .NET 10

Use this file to validate `<PackageReference>` entries in all `.csproj` files.

> **Rule of thumb**: Microsoft first-party packages follow the major version number of .NET. All
> `Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore.*`, and `Microsoft.Extensions.*` packages must be on `10.x.x`
> when targeting `net10.0`.

> **Version resolution**: The versions listed below are **minimum floors** used to detect outdated packages. When
> applying upgrades, always resolve the **latest available stable patch** rather than pinning to the minimum. Use
> `dotnet add package <PackageName>` without a version (the SDK queries NuGet and resolves the latest compatible version
> automatically), or run `dotnet list package --outdated` after updating TFMs to see the full set of available upgrades.

---

## 1. Microsoft ASP.NET Core Packages

| Package                                 | Minimum version floor | Notes                                                                                  |
| --------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `Microsoft.AspNetCore.*` (all)          | `10.0.0`              | Included in the shared framework; explicit references only needed for non-web projects |
| `Microsoft.AspNetCore.Authentication.*` | `10.0.0`              |                                                                                        |
| `Microsoft.AspNetCore.Identity.*`       | `10.0.0`              |                                                                                        |
| `Microsoft.AspNetCore.SignalR.*`        | `10.0.0`              |                                                                                        |
| `Microsoft.AspNetCore.Mvc.*`            | `10.0.0`              |                                                                                        |
| `Microsoft.OpenApi`                     | `2.0.0`               | **Breaking change** — see note below                                                   |

> **`Microsoft.OpenApi` 2.0.0 breaking change**: The `OpenApiSchema` model and all transformer interfaces
> (`IOpenApiSchemaTransformer`, `IOpenApiOperationTransformer`, `IOpenApiDocumentTransformer`) have changed their API
> surface. Custom transformers must be updated. Consult the
> [OpenAPI.NET 2.x migration guide](https://github.com/microsoft/OpenAPI.NET/releases).

---

## 2. Microsoft Entity Framework Core Packages

| Package                                   | Minimum version floor | Notes                                                                      |
| ----------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `Microsoft.EntityFrameworkCore`           | `10.0.0`              |                                                                            |
| `Microsoft.EntityFrameworkCore.SqlServer` | `10.0.0`              | JSON columns now use native `json` type on Azure SQL ≥ compat level 170    |
| `Microsoft.EntityFrameworkCore.Sqlite`    | `10.0.0`              | Datetime UTC behaviour change — see breaking-changes.md                    |
| `Microsoft.EntityFrameworkCore.InMemory`  | `10.0.0`              |                                                                            |
| `Microsoft.EntityFrameworkCore.Tools`     | `10.0.0`              | Must pair with `dotnet-ef` tool version `10.0.x`                           |
| `Microsoft.EntityFrameworkCore.Design`    | `10.0.0`              |                                                                            |
| `dotnet-ef` (global tool)                 | `10.0.x`              | Install: `dotnet tool install --global dotnet-ef` (installs latest stable) |

---

## 3. Microsoft Extensions Packages

| Package                                    | Minimum version floor |
| ------------------------------------------ | --------------------- |
| `Microsoft.Extensions.DependencyInjection` | `10.0.0`              |
| `Microsoft.Extensions.Logging`             | `10.0.0`              |
| `Microsoft.Extensions.Configuration.*`     | `10.0.0`              |
| `Microsoft.Extensions.Hosting`             | `10.0.0`              |
| `Microsoft.Extensions.Http`                | `10.0.0`              |
| `Microsoft.Extensions.Caching.*`           | `10.0.0`              |
| `Microsoft.Extensions.Options`             | `10.0.0`              |

---

## 4. Amazon Lambda Packages

These packages must be upgraded alongside the .NET 10 TFM change.

### Runtime packages (add to Lambda function `.csproj`)

| Package                                      | Minimum version | Notes                                                                                      |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `Amazon.Lambda.Core`                         | `2.5.0`         | Adds .NET 10 support constants                                                             |
| `Amazon.Lambda.RuntimeSupport`               | `1.12.0`        | Optimised for .NET 10 runtime; required for custom runtime (NativeAOT / `provided.al2023`) |
| `Amazon.Lambda.Serialization.SystemTextJson` | `2.4.0`         | Preferred serialiser for .NET 10 AOT compatibility                                         |
| `Amazon.Lambda.AspNetCoreServer`             | `9.1.0`         | Supports ASP.NET Core 10 middleware pipeline                                               |
| `Amazon.Lambda.AspNetCoreServer.Hosting`     | `1.7.0`         | Minimal API / hosted service Lambda integration                                            |
| `Amazon.Lambda.SQSEvents`                    | `3.1.0`         |                                                                                            |
| `Amazon.Lambda.SNSEvents`                    | `3.1.0`         |                                                                                            |
| `Amazon.Lambda.S3Events`                     | `3.1.0`         |                                                                                            |
| `Amazon.Lambda.APIGatewayEvents`             | `2.7.0`         |                                                                                            |

### Global tool

| Tool                  | Minimum version | Update command                              |
| --------------------- | --------------- | ------------------------------------------- |
| `Amazon.Lambda.Tools` | `5.11.0`        | `dotnet tool update -g Amazon.Lambda.Tools` |

---

## 5. Incompatible / Redundant Packages

| Package                                     | Action                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `System.Linq.AsyncEnumerable`               | **Remove** — now built into the BCL in .NET 10. Keeping it causes source-level name collisions.                                                                                  |
| `Swashbuckle.AspNetCore`                    | **Remove** — unmaintained; does not support .NET 10. Migrate to `Microsoft.AspNetCore.OpenApi` (built-in). See [breaking-changes.md](./breaking-changes.md) for migration steps. |
| `Swashbuckle.AspNetCore.Annotations`        | **Remove** — part of Swashbuckle. Replace with standard attributes (`[EndpointSummary]`, `[ProducesResponseType]`, etc.).                                                        |
| `Swashbuckle.AspNetCore.Filters`            | **Remove** — part of Swashbuckle ecosystem. Rewrite as `IOpenApiOperationTransformer`.                                                                                           |
| `Swashbuckle.AspNetCore.SwaggerUI`          | **Review** — can optionally be kept as a standalone UI pointing at the new `/openapi/v1.json` endpoint. Alternatives: Scalar, Redoc.                                             |
| Any package targeting `netstandard2.0` only | **Verify compatibility** — most work via .NET compatibility shim, but check for `PlatformNotSupportedException` at runtime.                                                      |

---

## 6. Third-Party Packages — Compatibility Notes

These packages are not managed by Microsoft but are commonly found in .NET projects. The skill does **not** attempt to
resolve target versions for these — flag them for manual review.

> **General guidance**: Run `dotnet list package --outdated` after updating TFMs to `net10.0` to see which third-party
> packages have newer versions available. Most actively maintained packages publish `net10.0`-compatible versions
> shortly after the .NET 10 release.

| Package family                  | Notes                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Serilog`, `Serilog.*` sinks    | Usually compatible via `netstandard2.0` target, but check for updated sinks that target `net10.0` for best performance. |
| `AutoMapper` / `Mapster`        | Check for major version bumps with breaking API changes.                                                                |
| `MediatR`                       | Recent versions are compatible; verify the version supports `net10.0`.                                                  |
| `FluentValidation`              | Usually compatible; check for any changes in DI registration.                                                           |
| `Polly`                         | Polly v8+ targets `netstandard2.0` and should be compatible.                                                            |
| `Dapper`                        | Compatible via `netstandard2.0`; check for `net10.0`-specific builds.                                                   |
| `Hangfire`                      | Verify server and dashboard packages support .NET 10.                                                                   |
| `MassTransit` / `NServiceBus`   | Check release notes for .NET 10 support announcements.                                                                  |
| `Grpc.Tools`, `Google.Protobuf` | Verify tooling generates code compatible with `net10.0`.                                                                |
| `xUnit` / `NUnit` / `MSTest`    | Test frameworks generally support new TFMs quickly; update test SDK packages.                                           |
