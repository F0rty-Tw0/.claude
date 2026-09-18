# Verified workspace baseline

This Node ESM configuration was exercised with Node 24.16.0 in September 2026. The versions below are a compatible snapshot, not instructions to ignore newer compatible releases or an existing repository's choices. Rename `workspace-tools` and select the real default branch before use.

Check registry peer ranges, package engines, release age, and installed compiler defaults when selecting another stack. TypeScript 7.0.2's root module exports version information rather than the legacy compiler API; Nx 23.2.1 and typescript-eslint 8.x cannot use it as a drop-in replacement for TypeScript 6.0.3. A successful `tsc` invocation alone does not establish Nx or parser compatibility.

## Root files

### `package.json`

```json
{
  "name": "workspace-tools",
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=24.3.0"
  },
  "scripts": {
    "build": "nx run-many -t build",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix --max-warnings=0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "nx run-many -t test",
    "test:watch": "vitest --watch",
    "typecheck": "tsc --project tsconfig.tools.json && nx run-many -t typecheck",
    "graph": "nx graph"
  },
  "private": true,
  "devDependencies": {
    "@nx/eslint": "catalog:devDependencies",
    "@nx/js": "catalog:devDependencies",
    "@nx/vitest": "catalog:devDependencies",
    "@types/node": "catalog:devDependencies",
    "eslint": "catalog:devDependencies",
    "jiti": "catalog:devDependencies",
    "lint-suite": "catalog:devDependencies",
    "nx": "catalog:devDependencies",
    "prettier": "catalog:devDependencies",
    "typescript": "catalog:devDependencies",
    "vite": "catalog:devDependencies",
    "vitest": "catalog:devDependencies"
  }
}
```

The Node minimum permits Prettier's native TypeScript-config loading without experimental stripping flags. ESLint uses `jiti` instead of propagating an experimental loader flag through every caller. Vite/Vitest have their own config loader.

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'

catalogs:
  devDependencies:
    '@nx/eslint': 23.2.1
    '@nx/js': 23.2.1
    '@nx/vitest': 23.2.1
    '@types/node': 24.13.4
    eslint: 10.10.0
    jiti: 2.7.0
    lint-suite: 2.1.0
    nx: 23.2.1
    prettier: 3.9.6
    # Nx 23.2.1 and typescript-eslint 8.x require the pre-7 compiler API.
    typescript: 6.0.3
    vite: 8.2.2
    vitest: 4.1.11

minimumReleaseAge: 2880
strictDepBuilds: true
allowBuilds:
  nx: true
  unrs-resolver: true

overrides:
  'lint-suite>@nx/eslint-plugin': 23.2.1
  # https://github.com/advisories/GHSA-7w5x-hrqm-74c2
  'nx@23.2.1>smol-toml': 1.7.1
```

The Nx override aligns lint-suite's embedded Nx plugin. The narrowly scoped `smol-toml` override addresses the linked advisory for this Nx release. Reevaluate both when changing versions. Do not broadly override TypeScript peers to make an unsupported compiler appear compatible. Nx 23.2.1's Vitest integration supports Vitest 3/4, not every newer major.

Generate `pnpm-lock.yaml` with pnpm; do not hand-author it or add an npm lockfile. Respect an existing release-age policy rather than exempting a fresh package just to obtain its latest patch. Lifecycle allowlisting follows script inspection, not a blanket approval of all dependencies.

### `nx.json`

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "defaultBase": "main",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": ["default"],
    "sharedGlobals": []
  },
  "plugins": [
    {
      "plugin": "@nx/eslint/plugin",
      "options": {
        "targetName": "lint"
      }
    },
    {
      "plugin": "@nx/vitest",
      "options": {
        "testTargetName": "test",
        "testMode": "run"
      }
    },
    {
      "plugin": "@nx/js/typescript",
      "options": {
        "typecheck": {
          "targetName": "typecheck"
        },
        "build": {
          "targetName": "build",
          "configName": "tsconfig.lib.json",
          "buildDepsName": "build-deps",
          "watchDepsName": "watch-deps"
        }
      }
    }
  ],
  "analytics": false
}
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "declarationMap": true,
    "erasableSyntaxOnly": true,
    "exactOptionalPropertyTypes": true,
    "lib": ["es2024"],
    "module": "nodenext",
    "noEmitOnError": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "target": "es2024",
    "rewriteRelativeImportExtensions": true,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  }
}
```

These are intentional choices for this Node workspace, not universal requirements for browser applications. `composite` enables project references and implies declaration/incremental output. `lib` selects the non-DOM environment; `target` fixes the emitted-language baseline instead of following a moving compiler default. Add `customConditions` only alongside package exports that use those conditions; do not copy another workspace's namespace.

For this compiler, `strict`, casing consistency, and side-effect import checking already default to true. NodeNext infers NodeNext resolution, and verbatim module syntax supplies isolated-module constraints. Stronger optional-property, indexed-access, unused-code, and override checks still need their explicit settings.

### `tsconfig.json`

```json
{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": []
}
```

Keep this a root solution. Add references as packages are introduced; do not put root tool configs in `files` or `include`. The Nx solution-setup detector relies on an empty root file set and a composite base.

### `tsconfig.tools.json`

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "tsBuildInfoFile": ".nx/cache/tsconfig.tools.tsbuildinfo"
  },
  "include": ["*.config.ts"]
}
```

This project is for checking tooling configuration, not for loading it. Do not add it as a reference from the root solution merely to make `tsc` discover it; the explicit root script already checks it.

### `eslint.config.ts`

```typescript
import { defineConfig } from 'eslint/config';
import { base, javascript, json, prettier, typescript, vitest } from 'lint-suite/eslint';

export default defineConfig([
  ...base,
  ...javascript,
  ...typescript,
  ...json,
  ...vitest,
  ...prettier,
  {
    files: ['*.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.tools.json',
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    ignores: ['**/node_modules/**', '**/dist/**', '.nx/**', '**/coverage/**', '**/tmp/**']
  }
]);
```

The parser override is restricted to root config files and keeps them type-aware through the explicit tools project. Package sources retain the preset's project service. Do not disable typed rules globally to work around a missing project or unsupported compiler. Angular packages can be transitive dependencies of lint-suite without Angular rules being selected here.

### `prettier.config.ts`

```typescript
import { prettier } from 'lint-suite/prettier';

export default prettier;
```

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts']
  }
});
```

This is an aggregator, not a test project. Each package config defines its own root, environment, includes, and fixture exclusions. When migrating extensions, remove the superseded executable config rather than leaving competing `.mjs` and `.ts` files. Do not rename mandatory JSON/YAML files to TypeScript.

### `.gitignore`

```text
node_modules/
.nx/
dist/
tmp/
coverage/
*.tsbuildinfo
*.log
.env
.env.*
!.env.example

# This workspace uses pnpm; do not add npm lockfiles.
package-lock.json

.DS_Store
Thumbs.db
```

### `.prettierignore`

```text
package-lock.json
pnpm-lock.yaml
```

Create `packages/`; an empty `.gitkeep` is optional when version control needs to retain that directory. Initialize Git only when requested or part of the agreed new-repository setup; do not create a commit or remote as a side effect.

## Verification

Use [verification.md](verification.md) to exercise a real inferred package and remove it afterward. An empty project list is valid scaffolding, but its empty build/test runs are not proof that those integrations work.

## Upstream references

- [TypeScript defaults and migration changes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)
- [typescript-eslint dependency compatibility](https://typescript-eslint.io/users/dependency-versions/)
- [ESLint TypeScript configuration files](https://eslint.org/docs/latest/use/configure/configuration-files#typescript-configuration-files)
- [Prettier configuration loading](https://prettier.io/docs/configuration)
- [Vitest project configuration](https://vitest.dev/guide/projects)
