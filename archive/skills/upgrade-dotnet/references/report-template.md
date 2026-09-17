# .NET 10 Migration & Execution Report Templates

Copy these structures verbatim when emitting the Phase 1 migration report (Step 10) and the Phase 2 post-upgrade summary (Step 21). Fill counts (`N`) and per-item lines from actual findings.

## Phase 1 — Migration Report (Step 10)

```
# .NET 10 Migration Report

## Summary
| Category | Required changes | Recommended / Review |
|----------|-----------------|----------------------|
| Target Framework Monikers | N | N |
| Central Build Config | N | N |
| Docker / Container Images | N | N |
| global.json SDK Version | N | N |
| NuGet Packages | N | N |
| AWS Lambda Configuration | N | N |
| CI/CD Pipelines | N | N |
| Dotnet Tools & Publish Profiles | N | N |
| Source Breaking Changes | N | N |
| Library Packages | N | N |

---

## Required Changes

### Target Framework Monikers
- [ ] `path/to/file.csproj` line N: change `net8.0` -> `net10.0`
- [ ] `Directory.Build.props` line N: change `net8.0` -> `net10.0`

### C# Language Version
- [ ] `path/to/file.csproj` line N: `<LangVersion>12</LangVersion>` -> remove or update to `14` / `latest`

### Docker / Container Images
- [ ] `path/to/Dockerfile` line N: `mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim`
      -> REMOVED in .NET 10. Replace with: `mcr.microsoft.com/dotnet/aspnet:10.0-noble`
      Also audit `apt-get install` commands in this file for Ubuntu Noble compatibility.
- [ ] `path/to/Dockerfile` line N: `public.ecr.aws/lambda/dotnet:8`
      -> Update to: `public.ecr.aws/lambda/dotnet:10`
- [ ] `docker-compose.yml` line N: `image: mcr.microsoft.com/dotnet/sdk:8.0` -> `10.0`

### global.json SDK Version
- [ ] `path/to/global.json`: sdk.version `8.0.xxx` -> `10.0.100`

### NuGet Packages
- [ ] `path/to/project.csproj`: Remove `System.Linq.AsyncEnumerable` package reference (now built into BCL)
- [ ] `path/to/project.csproj`: Remove `Swashbuckle.AspNetCore` — migrate to `Microsoft.AspNetCore.OpenApi`
- [ ] `path/to/project.csproj`: `Microsoft.EntityFrameworkCore` 8.x.x -> 10.0.0+
- [ ] `path/to/project.csproj`: `Microsoft.OpenApi` 1.x -> 2.0.0+  Breaking API changes to transformers
- [ ] `Directory.Packages.props` line N: `<PackageVersion Include="..." Version="8.x.x" />` -> update

### AWS Lambda Configuration
- [ ] `template.yaml` line N: `Runtime: dotnet8` -> `Runtime: dotnet10`
- [ ] `aws-lambda-tools-defaults.json`: `"function-runtime": "dotnet8"` -> `"dotnet10"`

### CI/CD Pipelines
- [ ] `azure-pipelines.yml` line N: `version: '8.0.x'` -> `'10.0.x'`

### Dotnet Tools
- [ ] `.config/dotnet-tools.json`: `dotnet-ef` version `8.x.x` -> `10.0.x`

### Publish Profiles
- [ ] `Properties/PublishProfiles/Release.pubxml` line N: `<TargetFramework>net8.0</TargetFramework>` -> `net10.0`

---

## Recommended / Review Items

### Source Breaking Changes
- [ ] Review `path/to/File.cs` line N: `AddSwaggerGen` — migrate from Swashbuckle to built-in OpenAPI
- [ ] Review `path/to/File.cs` line N: `ExecuteUpdateAsync` — check if `Expression<Func<` wrapper needs removing
- [ ] Review `path/to/File.cs` line N: `CoseSigner.Key` — add null-check

### Third-Party Package Compatibility
- [ ] Verify `Serilog` 4.x.x is compatible with .NET 10
- [ ] Verify `AutoMapper` 13.x.x is compatible with .NET 10

### Library Packages (Downstream Impact)
- [ ] `path/to/MyLibrary.csproj`: **Packable library** — `PackageId: MyCompany.MyLibrary`, current TFM: `net8.0`
      -> **Required**: Multi-target to `<TargetFrameworks>net8.0;net10.0</TargetFrameworks>`
      -> Do NOT drop `net8.0` until all consumers have upgraded (requires new major version)
      -> Consumers to notify (search Azure DevOps Code Search):
        - `PackageReference Include="MyCompany.MyLibrary" ext:csproj`
        - `PackageVersion Include="MyCompany.MyLibrary" ext:props`
        - `package id="MyCompany.MyLibrary" ext:config`
- [ ] `path/to/MyLibrary.csproj`: Check dependency `SomePackage` supports both `net8.0` and `net10.0` —
      may need conditional `<PackageReference>` per TFM

### Docker OS Changes
- [ ] `path/to/Dockerfile`: switched from Debian to Ubuntu Noble — audit apt-get package names
```

## Phase 2 — Post-Upgrade Summary (Step 21)

```
# .NET 10 Upgrade — Execution Summary

## Changes Applied
- [x] Updated N project files: TFM -> `net10.0`
- [x] Updated N library projects: multi-targeted -> `net8.0;net10.0`
- [x] Updated N `Directory.Build.props`: TFM -> `net10.0`
- [x] Updated `global.json`: SDK version -> `10.0.100`
- [x] Updated N Dockerfiles: base images -> .NET 10
- [x] Updated N Docker Compose files
- [x] Updated N NuGet packages to latest stable versions
- [x] Removed `System.Linq.AsyncEnumerable` package reference
- [x] Removed `Swashbuckle.AspNetCore` (manual OpenAPI migration required)
- [x] Updated N Lambda configuration files
- [x] Updated N CI/CD pipeline files
- [x] Updated N dotnet tool versions
- [x] Updated N publish profiles

## Library Packages — Downstream Impact
- [ ] `MyCompany.MyLibrary` — multi-targeted to `net8.0;net10.0`, pending version bump and publish
      Consumers: search `PackageReference Include="MyCompany.MyLibrary" ext:csproj` in Azure DevOps

## Build Status
- `dotnet build`: PASS / FAIL (details)

## Test Status
- `dotnet test`: X passed, Y failed, Z skipped
- Failures requiring manual attention: (list)

## Manual Review Still Required
- [ ] Migrate Swashbuckle/Swagger code to `Microsoft.AspNetCore.OpenApi` (see breaking-changes.md)
- [ ] Verify third-party package compatibility
- [ ] Publish updated library packages and notify downstream consumers
- [ ] (any other Recommended/Review items from the report that were not auto-fixed)
```
