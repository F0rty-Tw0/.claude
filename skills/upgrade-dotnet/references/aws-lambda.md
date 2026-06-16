# AWS Lambda .NET 10 Reference

Use this file to validate Lambda configuration files and Dockerfiles for AWS Lambda functions.

---

## 1. Managed Runtime Identifier

When using **managed runtimes** (ZIP deployment, not container images), update the runtime string to `dotnet10`.

| File                                  | .NET 8 value                    | .NET 9 value                    | .NET 10 value                    |
| ------------------------------------- | ------------------------------- | ------------------------------- | -------------------------------- |
| AWS SAM `template.yaml`               | `Runtime: dotnet8`              | `Runtime: dotnet9`              | `Runtime: dotnet10`              |
| Serverless Framework `serverless.yml` | `runtime: dotnet8`              | `runtime: dotnet9`              | `runtime: dotnet10`              |
| `aws-lambda-tools-defaults.json`      | `"function-runtime": "dotnet8"` | `"function-runtime": "dotnet9"` | `"function-runtime": "dotnet10"` |
| AWS CDK (C#)                          | `Runtime.DOTNET_8`              | `Runtime.DOTNET_9`              | `Runtime.DOTNET_10`              |
| AWS CDK (TypeScript)                  | `lambda.Runtime.DOTNET_8`       | `lambda.Runtime.DOTNET_9`       | `lambda.Runtime.DOTNET_10`       |

---

## 2. `aws-lambda-tools-defaults.json` Changes

No schema changes in .NET 10. Ensure these fields are aligned (updating from `dotnet8`/`net8.0` or `dotnet9`/`net9.0`):

```json
{
  "function-runtime": "dotnet10",
  "framework": "net10.0",
  "function-architecture": "x86_64"
}
```

If the project uses Native AOT, use `provided.al2023` instead (see section 4).

---

## 3. AWS SAM `template.yaml` Example

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: dotnet10 # was: dotnet8
      Handler: MyAssembly::MyNamespace.Function::FunctionHandler
      CodeUri: ./src/MyLambda/
```

---

## 4. NativeAOT Lambda

For NativeAOT-compiled Lambda functions, use the `provided.al2023` runtime — **not** `dotnet10`.

### `.csproj` requirements

```xml
<PropertyGroup>
  <TargetFramework>net10.0</TargetFramework>
  <PublishAot>true</PublishAot>
  <AssemblyName>bootstrap</AssemblyName>  <!-- Lambda expects the binary to be named 'bootstrap' -->
</PropertyGroup>

<ItemGroup>
  <PackageReference Include="Amazon.Lambda.RuntimeSupport" Version="1.12.0" />
  <PackageReference Include="Amazon.Lambda.Serialization.SystemTextJson" Version="2.4.0" />
</ItemGroup>
```

### `template.yaml` for NativeAOT

```yaml
MyNativeAotFunction:
  Type: AWS::Serverless::Function
  Properties:
    Runtime: provided.al2023 # NOT dotnet10
    Architectures: [arm64] # arm64 recommended for cost/performance
    Handler: bootstrap
```

### `aws-lambda-tools-defaults.json` for NativeAOT

```json
{
  "function-runtime": "provided.al2023",
  "framework": "net10.0",
  "function-architecture": "arm64"
}
```

---

## 5. Container Image Lambda

For Lambda functions deployed as container images, see [./docker-images.md](./docker-images.md) — section 4.

Key points:

- Use `public.ecr.aws/lambda/dotnet:10` as the final-stage base image.
- The SAM/CDK resource does **not** specify a `Runtime` when using `PackageType: Image`.
- Build stage should use `mcr.microsoft.com/dotnet/sdk:10.0`.

```yaml
MyContainerFunction:
  Type: AWS::Serverless::Function
  Properties:
    PackageType: Image # No 'Runtime' field needed
    Architectures: [x86_64]
  Metadata:
    DockerfileContext: ./src/MyLambda
    Dockerfile: Dockerfile
```

---

## 6. Lambda Package Versions

See [./nuget-packages.md](./nuget-packages.md) — section 4 for the full table.

Summary of minimum versions required:

| Package                                      | Minimum version |
| -------------------------------------------- | --------------- |
| `Amazon.Lambda.Core`                         | `2.5.0`         |
| `Amazon.Lambda.RuntimeSupport`               | `1.12.0`        |
| `Amazon.Lambda.AspNetCoreServer`             | `9.1.0`         |
| `Amazon.Lambda.Serialization.SystemTextJson` | `2.4.0`         |
| `Amazon.Lambda.Tools` (global tool)          | `5.11.0`        |

---

## 7. Architecture Notes

- **arm64 (`Graviton`)** is recommended for new .NET 10 Lambda functions — typically 20% cheaper and faster for .NET
  workloads.
- If upgrading an existing `x86_64` function, verify any native dependencies (e.g., SQLite native libs, image
  processing) are available for arm64 before switching.
- For container images, use the architecture-specific tags (`10-x86_64`, `10-arm64`) to avoid multi-arch resolution
  ambiguity in production deployments.
