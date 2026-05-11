# .NET 10 Breaking Changes Reference

Use this file to scan source code for patterns that may break when upgrading from .NET 8 or .NET 9 to .NET 10.

---

## 1. BCL (Base Class Library)

### `System.Linq.AsyncEnumerable` name collision

- **What changed**: `System.Linq.AsyncEnumerable` is now part of the BCL in .NET 10.
- **Affected pattern**: Projects that reference the `System.Linq.AsyncEnumerable` NuGet package (standalone) will get
  source-level name collisions.
- **Mitigation**: Remove the `System.Linq.AsyncEnumerable` NuGet `<PackageReference>`. The type is now built-in.

### `BufferedStream.WriteByte` — no implicit flush

- **What changed**: Writing via `BufferedStream.WriteByte` no longer implicitly flushes.
- **Affected pattern**: Code that writes one byte then immediately reads back or sends the data without an explicit
  `Flush()`.
- **Mitigation**: Add explicit `await stream.FlushAsync()` / `stream.Flush()` after byte-level writes where immediate
  delivery is expected.

### Generic math shift consistency

- **What changed**: Shift operators (`<<`, `>>`) in generic math now behave consistently across all numeric types.
- **Affected pattern**: Custom `INumber<T>` implementations or generic code performing bitwise shifts on mixed numeric
  types.
- **Mitigation**: Verify shift semantics in any generic numeric algorithms and add targeted unit tests.

### C# 14 overload resolution with `Span<T>`

- **What changed**: C# 14 (shipped with .NET 10 SDK) resolves certain overloads differently when `Span<T>` variants are
  available.
- **Affected pattern**: Methods with both `T[]` and `Span<T>` overloads — previously the array overload was preferred;
  now `Span<T>` may be selected.
- **Mitigation**: Review overload-ambiguous call sites; add explicit casts or method call syntax to disambiguate.

---

## 2. ASP.NET Core 10

### Auth redirects replaced with 401/403 for API endpoints

- **What changed**: When using Cookie authentication, unauthenticated/unauthorized requests to "known API" endpoints
  (`[ApiController]`, SignalR hubs, Minimal APIs returning JSON) now return **401 Unauthorized** or **403 Forbidden**
  instead of redirecting to a login page.
- **Affected pattern**: Any API that relies on the redirect behaviour for browser-facing flows.
- **Mitigation**: If redirect behaviour is required, explicitly configure `OnRedirectToLogin` in
  `CookieAuthenticationEvents`. For pure APIs this is the correct behaviour — no change needed.

### `blazor.web.js` is now a Static Web Asset

- **What changed**: The Blazor script is no longer an embedded resource; it is a Static Web Asset that is automatically
  compressed and fingerprinted.
- **Affected pattern**: Projects that reference `_framework/blazor.web.js` with a hardcoded path, or Blazor projects
  without components that don't set `<RequiresAspNetWebAssets>true</RequiresAspNetWebAssets>`.
- **Mitigation**: Remove hardcoded script path references; let the Blazor framework inject the tag. For non-component
  projects, add `<RequiresAspNetWebAssets>true</RequiresAspNetWebAssets>` to the `.csproj`.

### `ExceptionHandlerMiddleware` no longer logs handled exceptions

- **What changed**: If an `IExceptionHandler` marks an exception as handled, `ExceptionHandlerMiddleware` no longer logs
  it.
- **Affected pattern**: Code that relies on the middleware's built-in logging as the only log point for exceptions.
- **Mitigation**: Add logging inside your `IExceptionHandler` implementation if the log entry is still required.

### Minimal API form — empty string treated as `null`

- **What changed**: An empty string posted via a form is now treated as `null` for nullable value-type parameters.
- **Affected pattern**: Minimal API endpoints accepting `string?` or `int?` form fields where `""` was expected to
  arrive as an empty string.
- **Mitigation**: Update validation/model-binding logic to treat `null` and `""` equivalently for nullable types.

### `Microsoft.OpenApi` upgraded to 2.0.0

- **What changed**: ASP.NET Core 10's built-in OpenAPI support uses `Microsoft.OpenApi` 2.0.0, which contains breaking
  API changes to the OpenApiSchema model and custom transformers.
- **Affected pattern**: Custom `IOpenApiSchemaTransformer`, `IOpenApiDocumentTransformer`, or
  `IOpenApiOperationTransformer` implementations.
- **Mitigation**: Upgrade transformer code to the `Microsoft.OpenApi` 2.x API surface. Consult the
  [Microsoft.OpenApi 2.0 migration guide](https://github.com/microsoft/OpenAPI.NET/releases).

---

## 3. EF Core 10

### `dotnet ef` multi-targeting requires `--framework`

- **What changed**: Projects that multi-target (e.g., `<TargetFrameworks>net8.0;net10.0</TargetFrameworks>`) now require
  the `--framework` flag for all `dotnet ef` commands.
- **Affected pattern**: CI scripts or developer runbooks that run `dotnet ef migrations add` without specifying a
  framework.
- **Mitigation**: Update all `dotnet ef` invocations: `dotnet ef migrations add MyMigration --framework net10.0`.

### JSON columns mapped to native `json` type (SQL Server / Azure SQL)

- **What changed**: For SQL Server with compatibility level 170+ (Azure SQL default), EF Core 10 maps JSON/collection
  properties to the native `json` column type instead of `nvarchar(max)`.
- **Affected pattern**: Existing databases with `nvarchar(max)` JSON columns will receive an `ALTER COLUMN` migration.
- **Mitigation**: Review generated migrations before applying. If you want to keep `nvarchar(max)`, configure
  explicitly: `.HasColumnType("nvarchar(max)")`.

### `Contains()` translates to scalar parameters instead of `OPENJSON`

- **What changed**: LINQ `.Contains()` on in-memory collections now translates to multiple `IN (@p1, @p2, …)` parameters
  instead of a single JSON array with `OPENJSON`.
- **Affected pattern**: Queries using `.Contains()` on large collections — performance characteristics may differ.
- **Mitigation**: Test query performance; for very large sets consider `.Join()` with a temp table or raw SQL.

### `ExecuteUpdateAsync` accepts `Func<>` instead of `Expression<Func<>>`

- **What changed**: The `ExecuteUpdateAsync` / `ExecuteUpdate` setter parameter changed from `Expression<Func<…>>` to
  `Func<…>`.
- **Affected pattern**: Code explicitly typed as `Expression<Func<SetPropertyCalls<T>, SetPropertyCalls<T>>>` passed to
  `ExecuteUpdate`.
- **Mitigation**: Remove the `Expression<…>` wrapper — pass a plain lambda.

### SQLite — textual timestamps assumed UTC

- **What changed**: `Microsoft.Data.Sqlite` now treats textual datetime strings without a timezone offset as UTC
  (previously treated as Local).
- **Affected pattern**: SQLite databases storing datetime strings without explicit offsets, where local time was
  expected.
- **Mitigation**: Audit SQLite datetime storage; add explicit UTC offset (`Z`) or switch to `DateTimeOffset`.

---

## 4. Cryptography

### OpenSSL no longer supported on macOS

- **What changed**: OpenSSL-based cryptographic primitives are no longer supported on macOS. The Apple Security
  framework is used exclusively.
- **Affected pattern**: macOS builds that explicitly reference `System.Security.Cryptography.OpenSsl` or PInvoke into
  `libssl`.
- **Mitigation**: Remove OpenSSL-specific code paths on macOS; rely on the standard `System.Security.Cryptography` API,
  which will route to the platform provider.

### `CoseKey`, `X509Certificate.Key`, `PublicKey.Key` can be null

- **What changed**: `CoseSigner.Key`, `X509Certificate.Key`, and `PublicKey.Key` are now nullable in their type
  signatures.
- **Affected pattern**: Code that dereferences these properties without null checks.
- **Mitigation**: Add null checks or null-coalescing guards before accessing key properties.

### Minimum OpenSSL version on Linux: 1.1.1

- **What changed**: The minimum supported OpenSSL version on Linux/Unix is now 1.1.1.
- **Affected pattern**: Very old Linux distribution base images that ship OpenSSL 1.0.x.
- **Mitigation**: Ensure Docker base images and host OS are on OpenSSL 1.1.1 or later.

---

## 5. Swashbuckle / OpenAPI Tooling

### Swashbuckle.AspNetCore is unmaintained — migrate to built-in OpenAPI

- **What changed**: ASP.NET Core 10 has built-in OpenAPI document generation via `Microsoft.AspNetCore.OpenApi`.
  Swashbuckle.AspNetCore has not been updated to support .NET 10 and is effectively unmaintained.
- **Affected pattern**: Any project using `Swashbuckle.AspNetCore`, `AddSwaggerGen()`, `UseSwagger()`, or
  `UseSwaggerUI()`.
- **Mitigation**:
  1. Remove all Swashbuckle NuGet packages (`Swashbuckle.AspNetCore`, `Swashbuckle.AspNetCore.Annotations`,
     `Swashbuckle.AspNetCore.Filters`, etc.).
  2. Add `Microsoft.AspNetCore.OpenApi` if not already present.
  3. Replace `builder.Services.AddSwaggerGen(...)` with `builder.Services.AddOpenApi()`.
  4. Replace `app.UseSwagger()` / `app.UseSwaggerUI()` with `app.MapOpenApi()`.
  5. Migrate any Swashbuckle-specific configuration:
     - `SwaggerDoc` → configure via `AddOpenApi(options => { options.AddDocumentTransformer(...) })`.
     - `IncludeXmlComments` → XML comments are included automatically when
       `<GenerateDocumentationFile>true</GenerateDocumentationFile>` is set.
     - Custom `IOperationFilter` / `IDocumentFilter` → rewrite as `IOpenApiOperationTransformer` /
       `IOpenApiDocumentTransformer`.
     - `[SwaggerOperation]`, `[SwaggerResponse]` annotations → use standard `[EndpointSummary]`,
       `[EndpointDescription]`, `[ProducesResponseType]` attributes or the `WithOpenApi()` extension.
  6. For Swagger UI: the built-in OpenAPI endpoint serves the JSON document at `/openapi/v1.json`. If a UI is still
     needed, add `Swashbuckle.AspNetCore.SwaggerUI` as a standalone UI package pointing at the new endpoint, or use
     Scalar / Redoc.
- **Note**: This is a significant migration for projects with heavily customised Swagger configuration. Flag for manual
  review rather than auto-rewriting.

---

## 6. C# 14 Language Changes

### `field` keyword in properties

- **What changed**: C# 14 introduces the `field` contextual keyword for semi-auto properties. If existing code uses a
  variable named `field` inside a property accessor, it will now bind to the backing field instead.
- **Affected pattern**: Properties that use a local or parameter named `field` in their getter/setter body.
- **Mitigation**: Rename the conflicting identifier to avoid the contextual keyword, or use `@field` to escape it.

---

## 7. Networking

### Browser HTTP streaming enabled by default (Blazor WASM)

- **What changed**: `ReadAsStreamAsync` in browser HTTP clients (Blazor WebAssembly) now returns `BrowserHttpReadStream`
  instead of `MemoryStream`. `BrowserHttpReadStream` does **not** support synchronous read operations.
- **Affected pattern**: Blazor WASM code that reads HTTP response streams synchronously (`.Read()` instead of
  `await ReadAsync()`).
- **Mitigation**: Replace all synchronous `.Read()` calls with `await .ReadAsync()` in Blazor WASM HTTP handlers.

### HTTP/3 disabled in `PublishTrimmed` builds

- **What changed**: HTTP/3 support is disabled by default when `<PublishTrimmed>true</PublishTrimmed>` is set.
- **Affected pattern**: Trimmed or NativeAOT apps that rely on HTTP/3.
- **Mitigation**: Explicitly re-enable: `<EnablePreviewFeatures>true</EnablePreviewFeatures>` or configure via
  `UseHttp3()` with trimming annotations, or avoid trimming for HTTP/3 workloads.
