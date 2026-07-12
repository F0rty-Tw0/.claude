# Upgrade .NET to Version 10

Scans a .NET 8 or .NET 9 codebase for everything that must change to reach .NET 10, produces a structured migration report, and — after user confirmation — applies the changes and validates with a build and test run. Covers TFMs, Docker/container images, `global.json`, NuGet packages, AWS Lambda config, CI/CD pipelines, dotnet tools, publish profiles, source-level breaking changes, and packable-library multi-targeting.

Phase 1 (scan & plan) is always safe — read-only. Phase 2 (execute) modifies files and runs CLI commands, and only runs after explicit confirmation. Detailed tables live in `references/` (breaking-changes, docker-images, nuget-packages, aws-lambda) and report templates in `references/report-template.md`.

## When to Use

- Migrating a .NET 8 or .NET 9 codebase to .NET 10
- Checking a project for .NET 10 readiness or breaking changes
- Updating Docker images, Lambda runtimes, or NuGet packages for .NET 10
- Producing a .NET upgrade checklist or migration report

---
