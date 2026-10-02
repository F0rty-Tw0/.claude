# meaningful-prs

Splits a large or mixed branch into small PRs, one reviewable unit each. It splits by blast radius first (trunk prep, then gated core, then leaf), then by module. PRs stay independent off `main` unless there is a real dependency; only then are they stacked.

## What It Does

| Part | Rule |
|---|---|
| Split or not | ≤ ~400 lines, one blast class, one concern → one PR |
| Slice order | Trunk prep → gated core → leaf; flag flip + cleanup come later as separate PRs |
| Topology | Independent off `main` by default; stack only on real import/migration dependencies; depth ≤ 3 |
| Build | Slice by path from a main-synced source branch; each slice builds + tests alone; completeness diff must be empty |
| Per PR | `open-pr` → `## Proof` + fresh review against the **parent**, with the stack map |
| Restack (squash) | Merge parent into child, normal push; retarget the child before the parent branch is deleted; force-push only with explicit approval |

Commands: `references/mechanics.md`.

---

## When to Use

Triggers when you:

- Open PRs for a branch of roughly 400+ changed lines
- Have a branch mixing a migration or shared-helper change with feature code
- Ask to split a PR, stack PRs, or restack after a parent merged

---
