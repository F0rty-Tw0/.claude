# pnpm best practices

Hardened defaults for pnpm projects: corepack pinning, workspace catalogs, supply-chain gates, minimal CI shape, and strict-isolation import hygiene. A fresh agent can usually diagnose pnpm errors from first principles — but rarely produces these specific defaults without being prompted. This skill is for setup time, not for one-off debugging.

## What it covers

| Area | Default |
|---|---|
| Corepack `packageManager` field | Hash-free or `+sha512.<hex>`; never npm SRI `+sha512-<base64>==` |
| CI install step | Bare `corepack enable` + `corepack prepare --activate` — no version workarounds |
| Store cache | Azure Pipelines `Cache@2`, keyed by `pnpm-lock.yaml` |
| Catalog structure | Grouped by dep type (`devDependencies`, `dependencies`, ...) for human readability |
| `@nx/*` alignment | All `@nx/*` packages MUST match `nx`'s minor exactly |
| Fresh-publish gate | `minimumReleaseAge: 2880` (48h) with internal-scope exclusion |
| Lifecycle scripts | Explicit `allowBuilds:` allowlist (pnpm v11 default-deny) |
| Audit gate | `auditConfig.ignoreCves: []` — empty unless ticketed |
| `.gitignore` | `package-lock.json` ignored with explanatory comment |
| `.prettierignore` | Both lockfiles ignored |
| Strict isolation | Add direct dep, swap to built-in type, or drop annotation — never `shamefully-hoist` |

---

## When to use

Triggers when you:

- Initialize a new pnpm project or migrate from npm/yarn
- Write or audit `pnpm-workspace.yaml`
- Design CI install steps for a pnpm repo
- Harden a project's supply-chain posture
- Hit `Invalid package manager specification` from corepack
- Reconcile `@nx/*` version drift after a partial Nx upgrade

---

## Philosophy

Three principles drive the defaults:

1. **Fix the layer, not the symptom.** Corepack errors come from the `packageManager` field, not corepack's version. Strict-isolation errors come from a missing direct dep, not from hoisting.
2. **Defaults are security controls, not friction.** `minimumReleaseAge` and `allowBuilds` exist to defend against a specific class of supply-chain attack. Lowering them silently is a security regression.
3. **Lockfile is the source of truth.** Both lockfiles present means somebody ran the wrong package manager — the repo should make that hard to do accidentally.

---
