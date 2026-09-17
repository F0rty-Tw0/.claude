# Docker Image Reference for .NET 10

Use this file to validate every `FROM` line in every `Dockerfile` and `Dockerfile.*` in the workspace.

---

## 1. Microsoft Container Registry (MCR) — Version Upgrades

Replace the version tag in any `mcr.microsoft.com/dotnet/*` image.

| Image                | .NET 8 tag                                  | .NET 9 tag                                  | .NET 10 tag                                  |
| -------------------- | ------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| ASP.NET Core runtime | `mcr.microsoft.com/dotnet/aspnet:8.0`       | `mcr.microsoft.com/dotnet/aspnet:9.0`       | `mcr.microsoft.com/dotnet/aspnet:10.0`       |
| .NET SDK             | `mcr.microsoft.com/dotnet/sdk:8.0`          | `mcr.microsoft.com/dotnet/sdk:9.0`          | `mcr.microsoft.com/dotnet/sdk:10.0`          |
| .NET Runtime         | `mcr.microsoft.com/dotnet/runtime:8.0`      | `mcr.microsoft.com/dotnet/runtime:9.0`      | `mcr.microsoft.com/dotnet/runtime:10.0`      |
| Runtime dependencies | `mcr.microsoft.com/dotnet/runtime-deps:8.0` | `mcr.microsoft.com/dotnet/runtime-deps:9.0` | `mcr.microsoft.com/dotnet/runtime-deps:10.0` |
| NativeAOT SDK (new)  | _(not available)_                           | _(not available)_                           | `mcr.microsoft.com/dotnet/sdk:10.0-aot`      |

---

## 2. MCR — Removed and Deprecated OS Tags

> **CRITICAL**: The following OS-specific tag variants were removed in .NET 10. A Dockerfile using these tags will fail
> to pull.

### Debian tags — REMOVED in .NET 10

Debian was the default Linux distribution for .NET 8 and .NET 9. It is **no longer available** in .NET 10.

| .NET 8 / .NET 9 tag (removed)                | .NET 10 replacement                           |
| -------------------------------------------- | --------------------------------------------- |
| `8.0-bookworm-slim`                          | `10.0-noble`                                  |
| `9.0-bookworm-slim`                          | `10.0-noble`                                  |
| `8.0-bullseye-slim`                          | `10.0-noble`                                  |
| `9.0-bullseye-slim`                          | `10.0-noble`                                  |
| `8.0` _(bare — resolved to Debian Bookworm)_ | `10.0` _(now resolves to Ubuntu 24.04 Noble)_ |
| `9.0` _(bare — resolved to Debian Bookworm)_ | `10.0` _(now resolves to Ubuntu 24.04 Noble)_ |

> **Warning — OS package changes**: If the Dockerfile contains `apt-get install` commands, audit the package names after
> switching from Debian to Ubuntu Noble. Most packages are identical, but Debian-specific package names or repository
> paths may differ.

### Ubuntu Jammy — superseded

| .NET 8 / .NET 9 tag  | .NET 10 replacement   |
| -------------------- | --------------------- |
| `8.0-jammy`          | `10.0-noble`          |
| `9.0-jammy`          | `10.0-noble`          |
| `8.0-jammy-chiseled` | `10.0-noble-chiseled` |
| `9.0-jammy-chiseled` | `10.0-noble-chiseled` |

### Alpine — version bumped (tag unchanged)

| .NET 8 / .NET 9 tag                                | .NET 10 tag                  |
| -------------------------------------------------- | ---------------------------- |
| `8.0-alpine` / `8.0-alpine3.18` / `8.0-alpine3.19` | `10.0-alpine` (Alpine 3.22+) |
| `9.0-alpine` / `9.0-alpine3.20`                    | `10.0-alpine`                |

---

## 3. MCR — Available .NET 10 Tags

### Linux

| Tag                             | Base OS                      | Notes                                                                                            |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `10.0`                          | Ubuntu 24.04 (Noble)         | **Default** — changed from Debian in .NET 8/9                                                    |
| `10.0-noble`                    | Ubuntu 24.04 LTS             | Explicit Ubuntu Noble                                                                            |
| `10.0-noble-chiseled`           | Ubuntu Noble (Chiseled)      | Ultra-minimal distroless; requires `InvariantGlobalization=true` or use `-extra` variant for ICU |
| `10.0-alpine`                   | Alpine 3.22+                 | Smallest image; statically linked                                                                |
| `10.0-azurelinux3.0`            | Azure Linux 3.0              | Microsoft-maintained distro                                                                      |
| `10.0-azurelinux3.0-distroless` | Azure Linux 3.0 (Distroless) | No shell, minimal surface                                                                        |
| `sdk:10.0-aot`                  | Ubuntu Noble                 | Includes `clang` and NativeAOT build toolchain                                                   |

### Windows

| Tag                               | Notes                                 |
| --------------------------------- | ------------------------------------- |
| `10.0-nanoserver-ltsc2025`        | Nano Server, Windows Server 2025 LTSC |
| `10.0-nanoserver-ltsc2022`        | Nano Server, Windows Server 2022 LTSC |
| `10.0-windowsservercore-ltsc2025` | Full Windows Server Core              |
| `10.0-windowsservercore-ltsc2022` | Full Windows Server Core              |

### Architectures supported (Linux)

`linux/amd64`, `linux/arm64`, `linux/arm/v7`

---

## 4. AWS Lambda — ECR Public Gallery Images

AWS Lambda base images for .NET use [ECR Public Gallery](https://gallery.ecr.aws/lambda/dotnet).

### Version upgrade

| .NET 8 tag                       | .NET 10 tag                       |
| -------------------------------- | --------------------------------- |
| `public.ecr.aws/lambda/dotnet:8` | `public.ecr.aws/lambda/dotnet:10` |

### Available .NET 10 Lambda image tags

| Tag                                      | OS                           | Architecture |
| ---------------------------------------- | ---------------------------- | ------------ |
| `public.ecr.aws/lambda/dotnet:10`        | Amazon Linux 2023 (AL2023)   | multi-arch   |
| `public.ecr.aws/lambda/dotnet:10-al2023` | Amazon Linux 2023 (explicit) | multi-arch   |
| `public.ecr.aws/lambda/dotnet:10-x86_64` | Amazon Linux 2023            | x86_64 only  |
| `public.ecr.aws/lambda/dotnet:10-arm64`  | Amazon Linux 2023            | arm64 only   |

> **Note**: Amazon Linux 2 (`-al2`) Lambda base images are deprecated. .NET 10 exclusively uses Amazon Linux 2023.

### Example: containerised Lambda Dockerfile

```dockerfile
# Build stage — use Microsoft SDK image
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build-env
WORKDIR /src
COPY ["MyLambda.csproj", "./"]
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app

# Final stage — use AWS Lambda base image
FROM public.ecr.aws/lambda/dotnet:10
WORKDIR /var/task
COPY --from=build-env /app .
# Handler format: [Assembly]::[Namespace.ClassName]::[MethodName]
CMD ["MyLambda::MyLambda.Function::FunctionHandler"]
```

### NativeAOT Lambda

For NativeAOT Lambda functions, use the managed runtime `provided.al2023` instead of a container image. See
[./aws-lambda.md](./aws-lambda.md).
