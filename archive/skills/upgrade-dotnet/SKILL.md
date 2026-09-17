---
name: upgrade-dotnet
description:
  "Upgrade .NET codebase to version 10. Use when migrating from .NET 8 or .NET 9 to .NET 10, checking for breaking
  changes, updating Docker base images (MCR and AWS ECR Lambda), fixing deprecated Debian image tags, updating NuGet
  package versions, updating AWS Lambda runtime identifiers, auditing global.json SDK versions, scanning CI/CD
  pipelines, and running unit tests to validate the upgrade. Produces a structured migration checklist report and
  optionally executes the upgrade."
argument-hint: "Optional: source version to upgrade from (8 or 9). Defaults to detecting automatically."
---

# Upgrade .NET to Version 10

## When to Use

Invoke this skill when asked to:

- Migrate a .NET 8 or .NET 9 codebase to .NET 10
- Check a project for .NET 10 readiness or breaking changes
- Update Docker images, Lambda runtimes, or NuGet packages for .NET 10
- Produce a .NET upgrade checklist or migration report

---

## Overview

This skill operates in two phases:

1. **Phase 1 — Scan & Plan**: Analyse the codebase and produce a migration report with all required and recommended
   changes.
2. **Phase 2 — Execute**: After user confirmation, apply the changes and validate with a build and test run.

Always complete Phase 1 fully before asking the user whether to proceed with Phase 2.

---

## Phase 1 — Scan & Plan

Work through each scan step in order. Collect all findings first, then emit the full report at the end.

### Step 1 — Target Framework Monikers & Central Build Configuration

#### 1a — Project files (`.csproj`, `.fsproj`, `.vbproj`)

1. Find all `*.csproj`, `*.fsproj`, and `*.vbproj` files in the workspace.
2. For each file, locate every `<TargetFramework>` and `<TargetFrameworks>` element.
3. Flag any value that is **not** `net10.0`:
   - `net8.0` → **Required**: change to `net10.0`
   - `net9.0` → **Required**: change to `net10.0`
   - `netstandard*` → **Note**: compatible via shim; no change required unless you want to modernise.
4. Note the file path and line number for each finding.

#### 1b — `Directory.Build.props`

1. Find all `Directory.Build.props` files in the workspace (root and subdirectories).
2. Check for shared `<TargetFramework>` or `<TargetFrameworks>` definitions — these override or supplement values in
   individual project files.
3. Flag any old TFM values as **Required** changes.
4. Also check for `<LangVersion>` here (see Step 1d).

#### 1c — `Directory.Packages.props` (Central Package Management)

1. Find all `Directory.Packages.props` files.
2. If present, the project uses **Central Package Management (CPM)** — package versions are defined here via
   `<PackageVersion>` elements rather than in individual `.csproj` files.
3. Note this for Step 4 — NuGet package version updates must target this file instead of (or in addition to) individual
   project files.
4. Flag any `<PackageVersion>` entries that match packages listed in
   [./references/nuget-packages.md](./references/nuget-packages.md) with outdated versions.

#### 1d — C# Language Version (`<LangVersion>`)

1. Search all project files (`*.csproj`, `*.fsproj`, `*.vbproj`) and `Directory.Build.props` for `<LangVersion>`
   elements.
2. .NET 10 ships with **C# 14** by default. Flag:
   - Explicit pinning to an older version (e.g. `<LangVersion>12</LangVersion>`) → **Recommended**: remove or update to
     `14` / `latest` to use the default.
   - `<LangVersion>preview</LangVersion>` → **Note**: can be changed to `latest` or `14` now that .NET 10 is released.
   - No `<LangVersion>` set → No action needed (SDK defaults to C# 14).

---

### Step 2 — Docker & Container Images

Load [./references/docker-images.md](./references/docker-images.md) for the full tag reference.

#### 2a — Dockerfiles (`Dockerfile`, `Dockerfile.*`, `*.dockerfile`)

1. Find all Dockerfile variants in the workspace (case-insensitive match: `Dockerfile`, `Dockerfile.*`, `*.dockerfile`).
2. For each file, examine every `FROM` instruction.

**MCR images (`mcr.microsoft.com/dotnet/*`)**

a. **Version tag**: If the version is `8.0` or `9.0`, flag as **Required** — update to `10.0`.

b. **Removed Debian tags**: If the tag contains any of the following suffixes, flag as **Required** — Debian images do
not exist in .NET 10:

- `-bookworm-slim`
- `-bullseye-slim`
- `-trixie-slim`

Suggest replacement:

- `*-bookworm-slim` → `10.0-noble`
- `*-bullseye-slim` → `10.0-noble`
- `*-jammy` → `10.0-noble`
- `*-jammy-chiseled` → `10.0-noble-chiseled`

c. **Bare version tag** (`aspnet:8.0` or `aspnet:9.0` with no OS suffix): Flag as **Required**. Note that the bare
`:10.0` tag now resolves to **Ubuntu 24.04 Noble**, not Debian. This is a behaviour change even if the version number is
the only thing changed.

d. **Alpine tags**: If using `8.0-alpine3.18`, `8.0-alpine3.19`, `9.0-alpine3.20`, etc., update to `10.0-alpine`
(**Required**).

e. **`apt-get` audit**: If the same Dockerfile also contains `apt-get install` commands, add a **Recommended** warning
to audit those package names after switching OS base from Debian to Ubuntu Noble.

**AWS Lambda ECR images (`public.ecr.aws/lambda/dotnet`)**

a. Flag any tag using `:8` or `:9` as **Required** — update to `:10` or `:10-al2023`. b. Note available
architecture-specific tags: `:10-x86_64`, `:10-arm64`. c. Note that .NET 10 Lambda images use Amazon Linux 2023
exclusively; Amazon Linux 2 variants are deprecated.

#### 2b — Docker Compose Files

1. Find all `docker-compose.yml`, `docker-compose.*.yml`, and `compose.yml` / `compose.*.yml` files.
2. Check for:
   - `image:` values referencing .NET 8/9 images (MCR or ECR).
   - `build.args:` passing SDK or runtime version numbers.
   - `build.dockerfile:` pointing to Dockerfiles (cross-reference with 2a findings).
3. Flag any version references as **Required**.

---

### Step 3 — `global.json` SDK Version

1. Find `global.json` files in the workspace root and any subdirectory.
2. Check the `sdk.version` field:
   - `8.x.xxx` → **Required**: update to `10.0.100` (or latest `10.0.x` patch)
   - `9.x.xxx` → **Required**: update to `10.0.100`
   - `rollForward` policy: `latestMinor` or `latestFeature` is recommended.
3. Note file path for each finding.

---

### Step 4 — NuGet Package References

Load [./references/nuget-packages.md](./references/nuget-packages.md) for the full version table.

#### 4a — Identify outdated packages

1. Find all project files (`*.csproj`, `*.fsproj`, `*.vbproj`) and `Directory.Packages.props` files.
2. For each `<PackageReference>` or `<PackageVersion>` element, use the minimum version floors in `nuget-packages.md` to
   flag packages that need attention:

   a. **`System.Linq.AsyncEnumerable`** — **Required**: Remove this package reference. It is now part of the BCL in .NET
   10 and causes name collisions.

   b. **`Swashbuckle.AspNetCore`** — **Required**: Remove and migrate to `Microsoft.AspNetCore.OpenApi` (the built-in
   OpenAPI support in .NET 10). Swashbuckle is unmaintained and does not support .NET 10. See
   [./references/breaking-changes.md](./references/breaking-changes.md) for migration guidance.

   c. **`Microsoft.AspNetCore.*`** — Flag as needing upgrade if version < `10.0.0`.

   d. **`Microsoft.EntityFrameworkCore.*`** — Flag as needing upgrade if version < `10.0.0`.

   e. **`Microsoft.Extensions.*`** — Flag as needing upgrade if version < `10.0.0`.

   f. **`Microsoft.OpenApi`** — Flag as needing upgrade if version < `2.0.0`. Also flag as a **breaking change** — the
   `2.0.0` release has API changes to transformers (see
   [./references/breaking-changes.md](./references/breaking-changes.md)).

   g. **Amazon Lambda packages** (if present): flag if below the minimum floors in section 4 of `nuget-packages.md`.

3. Note file path and current version for each flagged package.

#### 4b — Third-party package compatibility

1. For all other `<PackageReference>` / `<PackageVersion>` entries not covered above, flag a **Recommended** reminder to
   verify .NET 10 compatibility — especially for:
   - Serilog and sinks (`Serilog.*`)
   - AutoMapper / Mapster
   - MediatR
   - FluentValidation
   - Polly
   - Dapper
   - Hangfire
   - MassTransit / NServiceBus
   - gRPC tooling (`Grpc.Tools`, `Google.Protobuf`)
   - Any package that has not published a version targeting `net10.0`

2. Do **not** attempt to resolve specific target versions for third-party packages — just flag them for review. The user
   or `dotnet list package --outdated` will determine the correct version.

#### 4c — Resolve latest available versions

For every Microsoft/Amazon flagged package, determine the **latest stable patch** version — do not default to the
minimum floor (e.g. `10.0.0`).

> **Important**: In Phase 1, TFMs have not been updated yet. Running `dotnet list package --outdated` against the
> current TFM will not report .NET 10 package versions. Instead, use the minimum floors from `nuget-packages.md` as the
> baseline for the report. Exact latest versions will be resolved during Phase 2 execution when TFMs have been updated
> and `dotnet add package` / `dotnet list package --outdated` can query NuGet against the `net10.0` target.

For the report, list:

- The **current version** found in the project file.
- The **minimum floor** from `nuget-packages.md`.
- A note that the exact latest version will be resolved during execution.

---

### Step 5 — AWS Lambda Configuration Files

Load [./references/aws-lambda.md](./references/aws-lambda.md) for the full reference.

1. Find `template.yaml` / `template.yml` (AWS SAM), `serverless.yml` / `serverless.yaml` (Serverless Framework), and
   `aws-lambda-tools-defaults.json`.
2. In each file, check:

   a. **Runtime string** — Flag `dotnet8` or `dotnet9` as **Required** → update to `dotnet10`.
   - Exception: NativeAOT functions use `provided.al2023` — this is correct and should **not** be changed to `dotnet10`.

   b. **`aws-lambda-tools-defaults.json`** — check `"function-runtime"` and `"framework"` fields:
   - `"framework": "net8.0"` or `"net9.0"` → **Required**: update to `"net10.0"`
   - `"function-runtime": "dotnet8"` or `"dotnet9"` → **Required**: update to `"dotnet10"`

   c. **AWS CDK** (scan `.cs`, `.ts`, `.py` files for Lambda definitions) — flag `Runtime.DOTNET_8` or
   `Runtime.DOTNET_9` as **Required** → `Runtime.DOTNET_10`.

3. Note file path and line number for each finding.

---

### Step 6 — CI/CD Pipelines

Scan for pipeline configuration files and flag any .NET SDK version references or Docker image tags that need updating.

#### 6b — Azure DevOps Pipelines

1. Find `azure-pipelines.yml` and any files matching `pipelines/*.yml`, `*.azure-pipelines.yml`.
2. Flag:
   - `UseDotNet@2` task with `version: '8.0.x'` or `'9.0.x'` → **Required**: update to `'10.0.x'`
   - `DotNetCoreCLI@2` tasks that reference specific SDK versions.
   - `pool.vmImage` or container references using .NET 8/9 images.

### Step 7 — Dotnet Tools Manifest & Publish Profiles

#### 7a — Dotnet Tools (`.config/dotnet-tools.json`)

1. Find `.config/dotnet-tools.json` files.
2. Check tool versions:
   - `dotnet-ef` → **Required** if version < `10.0.0`: update to `10.0.x`
   - `Amazon.Lambda.Tools` → **Required** if version < `5.11.0`
   - Other tools → **Recommended**: verify compatibility with .NET 10 SDK.
3. Note file path and current version for each flagged tool.

#### 7b — Publish Profiles (`Properties/PublishProfiles/*.pubxml`)

1. Find all `*.pubxml` files under `Properties/PublishProfiles/` directories.
2. Check for:
   - `<TargetFramework>` overrides set to `net8.0` or `net9.0` → **Required**: update to `net10.0`.
   - `<RuntimeIdentifier>` values using Debian-specific RIDs (e.g. `debian.11-x64`, `debian.12-x64`) → **Required**:
     replace with `linux-x64` or `ubuntu.24.04-x64`.
   - `<PublishTrimmed>true</PublishTrimmed>` combined with HTTP/3 usage (cross-reference with Step 8 findings).
3. Note file path and line number for each finding.

---

### Step 8 — Source-Level Breaking Changes

Load [./references/breaking-changes.md](./references/breaking-changes.md) for the full list of patterns.

Scan `.cs` (and `.fs` / `.vb` where applicable) source files for the following patterns. These are **not exhaustive** —
flag as **Recommended** items requiring manual review:

| Pattern to search for                                                                    | Breaking change                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `System.Linq.AsyncEnumerable` (import/using)                                             | Name collision with BCL type                                                    |
| `Swashbuckle` / `AddSwaggerGen` / `UseSwagger` / `UseSwaggerUI`                          | Swashbuckle is unmaintained; migrate to built-in `Microsoft.AspNetCore.OpenApi` |
| `CookieAuthenticationOptions` + `LoginPath` or `OnRedirectToLogin`                       | Auth redirect behaviour changed for API endpoints                               |
| `IExceptionHandler` implementation                                                       | ExceptionHandlerMiddleware no longer logs handled exceptions automatically      |
| `ExecuteUpdate` / `ExecuteUpdateAsync` with `Expression<Func<`                           | Signature changed to plain `Func<`                                              |
| `CoseSigner.Key`, `X509Certificate.Key`, `PublicKey.Key`                                 | Now nullable; add null-checks                                                   |
| `ReadAsStreamAsync` in Blazor WASM                                                       | Returns `BrowserHttpReadStream` (no sync ops)                                   |
| `dotnet ef` in scripts (`Makefile`, `*.sh`, `*.ps1`, `*.yml`) without `--framework`      | Multi-targeting requires `--framework net10.0` flag                             |
| `PublishTrimmed` + HTTP/3 usage (`UseHttp3`, `HttpVersionPolicy.RequestVersionOrHigher`) | HTTP/3 disabled in trimmed builds by default                                    |
| `OpenSSL` PInvoke on macOS build targets                                                 | OpenSSL not supported on macOS in .NET 10                                       |

---

### Step 9 — Library Package Detection

Identify projects that **produce** NuGet packages (i.e. are library packages consumed by other repositories or
services). These require special handling because upgrading their TFM can break downstream consumers.

#### 9a — Identify library projects

1. Search all project files (`.csproj`, `.fsproj`, `.vbproj`) for indicators that a project is a packable library:
   - `<IsPackable>true</IsPackable>`
   - `<GeneratePackageOnBuild>true</GeneratePackageOnBuild>`
   - `<PackageId>` element present
   - `<NuspecFile>` element present
   - A corresponding `.nuspec` file exists alongside the project
2. Also check `Directory.Build.props` for any of these properties set globally.
3. For each identified library project, record:
   - File path
   - Current `<PackageId>` (or assembly name if no explicit PackageId)
   - Current `<TargetFramework>` / `<TargetFrameworks>`
   - Current `<Version>` / `<PackageVersion>` (the library's own version, not its dependencies)

#### 9b — Multi-targeting recommendation

For each library project, flag as **Required**:

- **Best practice**: Library packages should **multi-target** to include both the current and new TFM during the
  transition period. For example:
  ```xml
  <TargetFrameworks>net8.0;net10.0</TargetFrameworks>
  ```
  This ensures consumers still on `net8.0` continue to work while consumers on `net10.0` get the optimised build. NuGet
  automatically selects the best-fit TFM for each consuming project.
- **When to drop the old TFM**: Only remove `net8.0` in a new **major version** of the library, after confirming all
  consumers have upgraded. Dropping a TFM is a breaking change — consumers still on the old framework will get a NuGet
  compatibility error.
- **LTS consideration**: `net8.0` is LTS (supported until November 2026). During the overlap period with `net10.0` (also
  LTS), multi-targeting across both is the community-standard approach.

#### 9c — Dependency impact assessment

1. Check if the library's **own dependencies** (its `<PackageReference>` entries) have versions that support both target
   frameworks. If a dependency only supports `net10.0`, multi-targeting will fail at build time.
2. Flag any dependencies that may need **conditional references** using MSBuild conditions:
   ```xml
   <ItemGroup Condition="'$(TargetFramework)' == 'net8.0'">
     <PackageReference Include="SomePackage" Version="8.x.x" />
   </ItemGroup>
   <ItemGroup Condition="'$(TargetFramework)' == 'net10.0'">
     <PackageReference Include="SomePackage" Version="10.x.x" />
   </ItemGroup>
   ```
3. Note: This conditional referencing pattern is standard .NET practice for multi-targeted libraries with
   framework-specific dependencies.

#### 9d — Downstream consumer discovery

For each library package, provide search queries to identify all consumers across the organisation:

**Azure DevOps Code Search queries** (requires the
[Code Search extension](https://marketplace.visualstudio.com/items?itemName=ms.vss-code-search)):

| Query                                               | What it finds                                           |
| --------------------------------------------------- | ------------------------------------------------------- |
| `PackageReference Include="<PackageId>" ext:csproj` | SDK-style project files with direct references          |
| `PackageVersion Include="<PackageId>" ext:props`    | Central Package Management (`Directory.Packages.props`) |
| `package id="<PackageId>" ext:config`               | Legacy `packages.config` references                     |
| `"<PackageId>" ext:props`                           | Any `.props` file importing or pinning the package      |

Replace `<PackageId>` with the actual package ID from step 9a.

> **Note**: Azure DevOps Code Search only indexes the **default branch** (typically `main`) of each repository by
> default. Feature branches or `develop` branches will not appear unless branch indexing is explicitly configured in
> project settings.

Flag all identified library packages as **Required: Review** in the migration report — the upgrade cannot be completed
in isolation without considering the impact on downstream consumers.

---

### Step 10 — Generate Migration Report

Output a single Markdown report using the **Phase 1 — Migration Report** template in
[./references/report-template.md](./references/report-template.md). It has a Summary table
(Required vs. Recommended/Review counts per category) followed by two sections — **Required
Changes** (Target Framework Monikers, C# Language Version, Docker/Container Images, global.json,
NuGet Packages, AWS Lambda, CI/CD Pipelines, Dotnet Tools, Publish Profiles) and **Recommended /
Review Items** (Source Breaking Changes, Third-Party Package Compatibility, Library Packages
downstream impact, Docker OS changes). Every line item is a checkbox with file path, line number,
and the concrete before → after change.

---

## Prompt User for Confirmation

After presenting the migration report, ask the user:

> **The migration plan above lists all required and recommended changes. Would you like me to proceed with executing the
> upgrade?**
>
> I will:
>
> 1. Apply all **Required** changes (TFMs, Docker images, global.json, NuGet packages, Lambda config, CI/CD pipelines,
>    dotnet tools, publish profiles, library package multi-targeting)
> 2. Run `dotnet restore` and `dotnet build` to validate
> 3. Run `dotnet test` to check for regressions
> 4. Flag any **Recommended / Review** items that need your manual attention
>
> You can also choose to execute only specific categories (e.g. "only update TFMs and NuGet packages").

Wait for the user's response before proceeding to Phase 2. If the user declines or wants to review first, stop here —
the report is the deliverable.

---

## Phase 2 — Execute the Upgrade

Only proceed with this phase after the user explicitly confirms. Apply changes in dependency order so the build remains
valid at each stage.

### Step 11 — Apply Target Framework Moniker Changes

1. For each project file (`.csproj`, `.fsproj`, `.vbproj`) flagged in Step 1a, update `<TargetFramework>` /
   `<TargetFrameworks>` values to `net10.0`.
2. For each `Directory.Build.props` flagged in Step 1b, update shared TFM values.
3. If multi-targeting, add `net10.0` to the list or replace the old moniker depending on user intent.
4. If `<LangVersion>` is explicitly pinned to an older version (Step 1d), remove it or update to `14` / `latest`.
5. **Exception — library packages**: For projects flagged in Step 9 as packable libraries, update to multi-target
   (`<TargetFrameworks>net8.0;net10.0</TargetFrameworks>`) rather than replacing the old TFM. Only replace outright if
   the user explicitly confirms all consumers have upgraded.

### Step 12 — Update `global.json`

1. For each `global.json` flagged in Step 3, update `sdk.version` to `10.0.100` (or the latest known patch).
2. If no `rollForward` policy exists, add `"rollForward": "latestFeature"`.

### Step 13 — Update Docker & Container Images

1. For each Dockerfile flagged in Step 2a, update `FROM` lines to their .NET 10 equivalents using the replacement table
   from the migration report.
2. If switching from Debian to Ubuntu Noble, add a comment above `apt-get install` lines:
   `# NOTE: Verify package names are available on Ubuntu Noble after .NET 10 migration`.
3. For each Docker Compose file flagged in Step 2b, update image tags and build args.

### Step 14 — Update NuGet Packages

1. Run `dotnet restore` from the solution/project root.
2. For packages that need removal:
   - Remove `System.Linq.AsyncEnumerable` `<PackageReference>` / `<PackageVersion>` elements.
   - Remove `Swashbuckle.AspNetCore` and related Swashbuckle packages. Add `Microsoft.AspNetCore.OpenApi` if not already
     present. Flag Swagger/OpenAPI source code for manual migration (do not auto-rewrite Swagger configuration code — it
     requires careful manual work).
3. For packages that need upgrading, run `dotnet add <project.csproj> package <PackageName>` (without a version flag) to
   pull the latest stable version.
4. If using Central Package Management (`Directory.Packages.props`), update `<PackageVersion>` elements there instead.
   Run `dotnet add package` against a project to resolve the latest version, then move the version to
   `Directory.Packages.props`.
5. If `dotnet add package` is not available or fails, edit the project file directly with the resolved version.

### Step 15 — Update AWS Lambda Configuration

1. For each Lambda config file flagged in Step 5, update runtime strings and framework values.
2. Skip any NativeAOT functions using `provided.al2023` — these are already correct.

### Step 16 — Update CI/CD Pipelines

1. For each pipeline file flagged in Step 6, update SDK version references to `10.0.x`.
2. Update any Docker image references in pipeline configs to .NET 10 tags.
3. Update any hardcoded `dotnet` download URLs or version variables.

### Step 17 — Update Dotnet Tools & Publish Profiles

1. For each tool in `.config/dotnet-tools.json` flagged in Step 7a, run `dotnet tool update <tool-name>` or edit the
   version directly.
2. For each publish profile flagged in Step 7b, update TFMs and runtime identifiers.

### Step 18 — Handle Library Package Dependencies

For each library project flagged in Step 9:

1. After multi-targeting has been applied (Step 11), run `dotnet build` on the library project to verify both TFMs
   compile successfully.
2. If a dependency does not support both TFMs, add conditional `<PackageReference>` elements with MSBuild conditions (as
   described in Step 9c).
3. If the library uses `#if` preprocessor directives for framework-specific code, verify both code paths compile.
4. **Do not** publish updated library packages automatically — flag the library for a separate versioning and release
   decision by the user.

### Step 19 — Build Validation

1. Run `dotnet restore` followed by `dotnet build` from the solution root.
2. If the build fails:
   - Read the error output and identify which changes caused the failure.
   - Attempt to fix straightforward issues (e.g. missing package, wrong version).
   - For breaking-change errors (e.g. `Expression<Func<>>` → `Func<>`, nullable key access), apply the fixes described
     in [./references/breaking-changes.md](./references/breaking-changes.md).
   - Report any errors that cannot be automatically fixed and suggest manual resolution steps.
3. Repeat until the build succeeds or all auto-fixable issues are resolved.

### Step 20 — Run Tests

1. Run `dotnet test` from the solution root.
2. Report results:
   - If all tests pass: confirm the upgrade is validated.
   - If tests fail: analyse failures and categorise them:
     - **Upgrade-related**: Attempt to fix (e.g. updated API signatures, changed default behaviour).
     - **Pre-existing**: Note that these failures are not caused by the upgrade.
   - Report any test failures that cannot be automatically fixed.

### Step 21 — Post-Upgrade Summary

Output a summary of what was done using the **Phase 2 — Post-Upgrade Summary** template in
[./references/report-template.md](./references/report-template.md). It covers: Changes Applied
(per-category checklist with counts), Library Packages downstream impact, Build Status
(`dotnet build` result), Test Status (`dotnet test` pass/fail/skip counts + failures needing
attention), and Manual Review Still Required.

---

## Notes

- Phase 1 is always safe — it only reads files and produces a report.
- Phase 2 modifies files and runs CLI commands. All changes are local and can be reverted with `git checkout .` if the
  workspace is under version control.
- All findings include file paths and line numbers so each item can be actioned directly.
- For EF Core migrations and JSON column type changes, run `dotnet ef migrations add` after upgrading and carefully
  review the generated migration SQL before applying to production databases.
- For `Microsoft.OpenApi` 2.0.0 transformer changes, consult the
  [OpenAPI.NET 2.x release notes](https://github.com/microsoft/OpenAPI.NET/releases).
- For Swashbuckle → built-in OpenAPI migration, consult the
  [ASP.NET Core OpenAPI documentation](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/overview).
- For Docker image tag validity, the authoritative source is the
  [dotnet/dotnet-docker GitHub repository](https://github.com/dotnet/dotnet-docker).
- For AWS Lambda runtime availability, consult the
  [AWS Lambda runtimes documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).
