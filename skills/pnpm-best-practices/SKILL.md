---
name: pnpm-best-practices
description: Use when setting up a new pnpm project, migrating a repo from npm/yarn to pnpm, scaffolding pnpm-workspace.yaml, configuring CI for pnpm, hardening a pnpm project against supply-chain attacks, debugging corepack "Invalid package manager specification" errors, or aligning @nx/* versions in an Nx workspace
---

# pnpm best practices

> Current as of **pnpm 11** (stable, latest patch 11.9+ as of July 2026). pnpm 11 requires Node.js 22+, blocks lifecycle scripts by default (`strictDepBuilds`), and adds a SQLite-backed store index — the defaults below assume it. If the project is pinned to pnpm 10 or earlier, `allowBuilds`/`minimumReleaseAge` gating still applies but lifecycle scripts are allowed by default, so audit `.npmrc`/`pnpm-workspace.yaml` explicitly instead of assuming v11 defaults are in effect.

## Overview

Proactive defaults for pnpm projects: corepack pinning, workspace catalogs, supply-chain gates, CI pipeline shape, and strict-isolation import hygiene. A fresh agent can usually diagnose pnpm/corepack errors from first principles — but rarely produces these specific hardened defaults without prompting. This skill is for setup time.

## When to use

- Initializing or migrating a repo to pnpm
- Writing or reviewing `pnpm-workspace.yaml`
- Designing CI install steps that use pnpm
- Auditing a pnpm project for supply-chain posture
- Diagnosing `corepack` failures around the `packageManager` field
- Reconciling `@nx/*` version drift after a partial Nx upgrade

## Corepack `packageManager` field

Pin the package manager in `package.json`. Corepack reads this and downloads the exact version transparently — no global installs.

| Format | Accepted? | Notes |
|---|---|---|
| `"pnpm@11.1.3"` | yes | Simplest; lockfile covers transitive integrity |
| `"pnpm@11.1.3+sha512.<hex>"` | yes | Optional integrity. Generate with `corepack use pnpm@X.Y.Z` |
| `"pnpm@11.1.3+sha512-<base64>=="` | **no** | npm SRI integrity format; corepack regex rejects `/`, `+`, `=` in the hash group |

**Common pitfall:** copy-pasting the `sha512-...` integrity field from `https://registry.npmjs.org/pnpm/<ver>` into `packageManager`. That's npm's SRI format, not corepack's. Symptom — corepack throws `Invalid package manager specification ... expected a semver version` even though the version itself is valid semver. Upgrading corepack does NOT fix this; newer versions are stricter, not more permissive.

**Fix:** drop the hash, or regenerate via `corepack use pnpm@X.Y.Z`.

## Minimal CI pipeline step shape

```yaml
- script: |
    set -e
    corepack enable
    corepack prepare --activate
  displayName: 'Enable Corepack (pins pnpm to packageManager field)'

- script: pnpm config set store-dir "$(Pipeline.Workspace)/.pnpm-store"
  displayName: 'Point pnpm store at pipeline cache path'

- task: Cache@2
  inputs:
    key: 'pnpm-store | "$(Agent.OS)" | <workingDir>/pnpm-lock.yaml'
    restoreKeys: 'pnpm-store | "$(Agent.OS)"'
    path: $(Pipeline.Workspace)/.pnpm-store

- script: pnpm install --frozen-lockfile --prefer-offline
  displayName: 'Install dependencies (pnpm, frozen lockfile)'
```

No `npm i -g corepack@latest` workaround. No `hash -r`. If `corepack prepare` fails, the `packageManager` field is malformed — fix the field, not the pipeline.

## `pnpm-workspace.yaml` — catalogs + supply-chain gates

```yaml
packages:
  - '.'
  - 'packages/*'

# Named catalogs. Group by dep type (devDependencies, dependencies,
# peerDependencies) so intent is obvious at a glance. Catalog names
# are opaque labels to pnpm — naming is for humans.
catalogs:
  devDependencies:
    '@nx/eslint': 22.7.2
    '@nx/js': 22.7.2
    '@nx/playwright': 22.7.2
    nx: 22.7.2
    # ... other dev deps

# Skip packages published less than 48h ago. Defends against fresh
# account-takeover / typosquat attacks — malicious versions usually
# get pulled within 24-48h. Exact pins in the catalog aren't affected;
# this gate only kicks in on `pnpm update` / fresh resolution.
minimumReleaseAge: 2880

# Trusted first-party scopes bypass the gate.
minimumReleaseAgeExclude:
  - '@your-org/*'

# pnpm v11 blocks lifecycle scripts by default (strictDepBuilds: true).
# Allowlist only packages that genuinely need postinstall — every entry
# is a supply-chain trust decision.
allowBuilds:
  nx: true
  '@swc/core': true
  esbuild: true
  '@playwright/test': true
  # Platform-specific native binaries for whatever Nx targets:
  '@nx/nx-linux-x64-gnu': true
  '@nx/nx-win32-x64-msvc': true
  '@nx/nx-darwin-arm64': true

# Fail `pnpm audit` on anything moderate or worse. Keep ignoreCves
# empty unless a known false-positive needs suppressing — with a
# tracked ticket and an expiry date.
auditConfig:
  ignoreCves: []
```

## `@nx/*` version alignment (Nx workspaces)

**Rule:** every `@nx/*` package must match the `nx` package's minor version exactly. Nx plugins reach into `node_modules/nx/dist/...` internals; private paths get renamed between minors.

Symptom of drift: `Cannot find module 'nx/dist/src/command-line/release/config/use-legacy-versioning.js'` (or similar internal-path errors).

Fix: bump every `@nx/*` together — never piecemeal. Use `nx migrate latest` for major bumps, or sync versions manually in the catalog and run `pnpm install`.

## Lockfile hygiene

**`.gitignore`** — ignore `package-lock.json` with an explanatory comment:

```gitignore
# npm lockfile — repo uses pnpm. If this reappears, someone ran `npm install`
# by mistake; delete it and run `pnpm install`.
package-lock.json
```

**`.prettierignore`** — ignore both lockfiles so prettier never touches them:

```gitignore
package-lock.json
pnpm-lock.yaml
```

Verify with `./node_modules/.bin/prettier --file-info pnpm-lock.yaml` — should return `{ "ignored": true, ... }`.

## Strict isolation — import only what you declare

pnpm's default `node_modules` layout exposes ONLY direct dependencies at the top level. Transitive deps live in `node_modules/.pnpm/` and are unreachable from app code.

Three responses when a needed type/value only exists transitively:

| Situation | Response |
|---|---|
| You actually need the package | Add it as a direct dep |
| You only use a generic type that has a built-in equivalent | Use the built-in (e.g. `AsyncIterable<T>` instead of `Paginator<T>` from `@smithy/types` / `@aws-sdk/types`) |
| You can drop the annotation entirely and let TS infer | Drop the import |

**Do NOT** set `shamefully-hoist=true` or broad `public-hoist-pattern=*` to "fix" missing imports — that papers over the missing declaration and hides the same bug from the next developer.

**Concrete: AWS SDK v3.700+.** `@aws-sdk/types` was removed from the public surface; types moved to `@smithy/types`. Neither is exposed under strict isolation unless declared directly. For `paginate*` functions, the parameter is typically just iterated with `for await ... of`, so `AsyncIterable<TOutput>` (built-in) replaces `Paginator<TOutput>` cleanly.

## Major-version bumps

Before bulk-updating: `pnpm outdated`. Categorize the output.

- **Patch / minor across `@nx/*`:** safe to bump together; align minors per the rule above.
- **Major bumps of `eslint`, `typescript`, `prettier`:** defer when an internal lint preset or shared config peers on the old major. Bump the preset first (or in the same change), not in isolation.
- **Releases newer than 48h:** blocked by `minimumReleaseAge` — let them age, don't lower the gate.

## pnpm 11 CLI additions worth reaching for

| Command | Use |
|---|---|
| `pnpm ci` | CI-optimized install — stricter than `--frozen-lockfile`; prefer over hand-tuned install flags in pipeline steps |
| `pnpm sbom` | Generate a software bill of materials — reach for this if the org needs supply-chain attestation |
| `pnpm clean` | Prune the store/cache in one step instead of manually clearing `node_modules/.pnpm` |
| `pnpm peers check` | Surface peer-dependency mismatches before they cause a runtime error |

## Common mistakes

- **"Upgrade corepack to fix the spec error."** Wrong layer. Newer corepack is stricter. Fix the `packageManager` field.
- **Bumping `@nx/eslint` without `nx`.** Internal-path error on next install.
- **Adding `shamefully-hoist=true`** to silence missing-import errors. Hides supply-chain shape and breaks the next developer's IDE.
- **Lowering `minimumReleaseAge` because a release is "just barely too new".** Wait or use an older version; the gate is a security control, not friction.
- **Committing `package-lock.json` alongside `pnpm-lock.yaml`.** Means somebody ran `npm install`. Both as sources of truth is undefined behavior.

## Red flags

- `Invalid package manager specification ... expected a semver version` → bad hash format in `packageManager`
- `Cannot find module 'nx/dist/.../use-legacy-versioning.js'` (or any internal nx path) → `@nx/*` version drift
- `Cannot find module '@aws-sdk/types'` / `@smithy/types` → strict isolation, not a missing install
- `ERR_PNPM_NO_MATURE_MATCHING_VERSION` → `minimumReleaseAge` gate working as designed
