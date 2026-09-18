---
name: nx-workspace-scafold
description: Use when scaffolding a pnpm/Nx TypeScript monorepo or establishing its root TypeScript, ESLint, Prettier, and Vitest configuration, especially for Node ESM packages.
---

# Nx Workspace Scaffold

Scaffold a compatible toolchain with minimal, intentional configuration.

## Select a compatible stack

- Preserve existing files, framework choices, package-manager policy, and explicit versions. Otherwise default to minimal Node ESM; do not generate an application just to populate Nx.
- Check peer ranges and installed compiler defaults. Align `nx` with direct `@nx/*` versions. Select the latest compatible releases unless the user explicitly chooses otherwise.
- Verified: Nx 23.2.1, TypeScript 6.0.3, lint-suite 2.1.0, and Vitest 4.1.11. Treat this snapshot as evidence, not permanent version policy. TypeScript 7.0.2 lacks the legacy API required by this stack; `ts.readConfigFile is not a function` is a dependency mismatch, not a tsconfig defect.
- If an explicit version has no supported combination, explain the conflict and obtain a decision. Do not silently downgrade, suppress peer warnings, or patch dependency internals.
- Pin the package manager and catalogs. Preserve release-age and lifecycle gates; allow only required, inspected install scripts. Retain overrides only while their version-specific need remains.

## Keep configuration deliberate

Use [the complete workspace baseline](references/workspace.md) when creating files; adapt its name, runtime target, versions, and default branch.

| File                  | Responsibility                                    |
| --------------------- | ------------------------------------------------- |
| `tsconfig.base.json`  | Shared, non-default compiler policy               |
| `tsconfig.json`       | Empty root solution and project references        |
| `tsconfig.tools.json` | Root `*.config.ts` type-checking without emission |

Keep root `files: []`; adding tool configs breaks this Nx solution-setup convention. Use a tools project only when those configs need checking.

With TypeScript 6/7, `strict`, `forceConsistentCasingInFileNames`, and `noUncheckedSideEffectImports` default to true. NodeNext infers resolution; `verbatimModuleSyntax` implies isolated-module checking. Omit `compileOnSave: false`. Recheck defaults for other compiler versions.

`strict` does not enable `exactOptionalPropertyTypes`, indexed-access, unused-code, or override checks. Keep those intentionally. Explicit `lib` can exclude browser globals even when matching `target`; `types: ["node"]` controls ambient types.

## Wire tooling

- Prefer supported `.ts` executable configs. Keep required JSON/YAML formats for TypeScript projects, Nx, package manifests, and pnpm.
- Use `jiti` for ESLint's `.ts` config and a supported Node version for Prettier's native loader. Restrict ESLint's explicit tools project to root configs.
- For non-Angular work, select lint-suite's base, JavaScript, TypeScript, JSON, Vitest, and Prettier presets. Do not activate Angular rules incidentally.
- Use Nx inference. Set Vitest's `testMode` to `run`, with separate watch mode. Root Vitest projects discover package configs; they do not make root test options inherited defaults.

## Verify an actual workspace

Follow [the smoke example](references/verification.md). Verify a cold Nx graph, typed linting, package build/type-check/tests, and Node execution. `No tasks were run` proves none of these package behaviors.

Cross-project tests should consume package exports, not relative `.ts` imports whose output locations differ. Build first when those exports target `dist`.

After verification, remove temporary packages and restore references without disturbing user files. Check frozen installation, formatting, and audit; report remaining failures. No implicit commits, remotes, or publishing.
