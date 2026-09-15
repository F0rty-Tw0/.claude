# Verify the inferred workspace

Use an isolated temporary workspace for evaluating this skill. When verifying a newly scaffolded real workspace, use a temporary package only if no suitable real package exists. Do not overwrite an existing `nx-smoke` directory. Save the original root references and restore only the changes made for the probe.

Install the selected dependencies, then start with a cold graph after changing the compiler stack:

```sh
pnpm install --no-frozen-lockfile
pnpm exec nx reset
pnpm exec nx show projects --json
pnpm typecheck
pnpm lint
```

A successful empty graph confirms startup, not package build/test behavior. Use the following small package to exercise those paths. Its spec consumes the public package export; importing another composite project's `.ts` source with different output placement can cause TS2878. Its test target builds the package because those exports point to `dist`.

## Temporary package files

### `packages/nx-smoke/package.json`

```json
{
  "name": "@workspace-tools/nx-smoke",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "nx": {
    "targets": {
      "test": {
        "dependsOn": ["build"]
      }
    }
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

### `packages/nx-smoke/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "references": [{ "path": "./tsconfig.lib.json" }, { "path": "./tsconfig.spec.json" }]
}
```

### `packages/nx-smoke/tsconfig.lib.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.lib.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/test/**"]
}
```

### `packages/nx-smoke/tsconfig.spec.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist/spec",
    "tsBuildInfoFile": "dist/tsconfig.spec.tsbuildinfo"
  },
  "include": ["src/**/*.spec.ts", "vitest.config.ts"],
  "references": [{ "path": "./tsconfig.lib.json" }]
}
```

### `packages/nx-smoke/vitest.config.ts`

```typescript
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, '**/fixtures/**']
  }
});
```

### `packages/nx-smoke/src/index.ts`

```typescript
export { FIXTURE_PATH } from './fixture-path.const.ts';
```

### `packages/nx-smoke/src/fixture-path.const.ts`

```typescript
export const FIXTURE_PATH = 'fixtures/example.json';
```

### `packages/nx-smoke/src/compiler.integration.spec.ts`

```typescript
import { basename } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURE_PATH } from '@workspace-tools/nx-smoke';

describe('FEATURE: Compiler compatibility', (): void => {
  describe('GIVEN a TypeScript module dependency', (): void => {
    it('WHEN Node resolves the fixture path THEN the basename is returned', (): void => {
      const fixtureName = basename(FIXTURE_PATH);

      expect(fixtureName).toBe('example.json');
    });
  });
});
```

## Exercise the integration

Add `{ "path": "./packages/nx-smoke" }` to the root solution's references without removing existing entries. The temporary package has no dependencies to install; the root already owns this workspace's testing/compiler tooling.

```sh
pnpm build --output-style=static --skip-nx-cache
pnpm typecheck
pnpm test --output-style=static --skip-nx-cache
pnpm lint
node packages/nx-smoke/dist/index.js
```

Require an actual named Nx build and type-check task, one executed passing test, and successful native Node module loading. Inspect the emitted declaration and JavaScript artifacts. An empty task set, a cached report without an initial real execution, or an allowed-empty test run does not establish these behaviors.

When adding the test workflow for the first time, temporarily make the expected basename wrong and confirm `pnpm test` fails; restore it and obtain a passing result. Do not weaken test discovery or add `passWithNoTests` to mask missing tests. If root watch mode is part of the setup, launch `pnpm test:watch`, observe the same test, exercise a rerun, and stop the process. On Windows, a process supervisor may need `cmd.exe /d /c pnpm.cmd test:watch` instead of launching the extensionless pnpm shim.

For smoke runs, `NX_DAEMON=false` and `NX_TUI=false` can make process lifetime and captured output predictable. Keep these as execution-environment choices, not mandatory global settings.

## Cleanup and final gate

Restore the original root references and remove only the temporary package and its outputs. If installing while the temporary package existed added a lockfile importer, regenerate the lockfile after removal. Do not leave fake packages or permanent tests whose only purpose was proving the scaffold.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm audit
```

Report which real tasks ran and any remaining incompatibilities. `ts.readConfigFile is not a function` requires a compatible compiler/API combination; changing tsconfig flags or clearing caches alone cannot repair it.
