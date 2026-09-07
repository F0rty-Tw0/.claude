# TypeScript Utility Style

## Core Principle

A utility is a pure behavior boundary, not helper storage. Extract only when purity and an independent contract both hold.

## Quick Reference

| Concern | Rule |
|---|---|
| Eligibility | Extract non-trivial pure behavior when reused across files or worth focused tests. |
| Placement | Use the nearest owner's `utils/`; never a global dumping ground. |
| Filename | Use `utils/<behavior>.util.ts`, never generic `utils.ts`. |
| Grouping | Group only cohesive behavior. |
| Imports | Import the `.util.ts` file directly; no barrel. |
| Local helpers | Keep trivial or caller-specific helpers with their caller. |
| Effects | Keep I/O, caches, time, randomness, environment, framework context, and orchestration outside `utils/`. |

## Purity Gate

A utility must:

- Depend only on explicit arguments.
- Avoid external mutable state, I/O, time, randomness, environment, and ambient framework/DI state.
- Avoid mutating arguments.

Local mutation is allowed when callers cannot observe it.
Deterministic library APIs stay pure with explicit state.

Then require non-trivial, nameable behavior. Parsers, normalizers, transformations, and classifiers qualify; forwarders, accessors, aliases, and caller predicates stay local.

Reuse is optional; single-caller algorithms qualify when independent boundaries and invariants deserve tests.

## Example
Names are illustrative; substitute nearest owner and behavior.

Before, transformation shares orchestration:

```ts
// search/search.service.ts
const normalizeSearchTerms = (terms: string[]): string[] => {
  const normalized = terms.map((term) => term.trim().toLowerCase());
  const unique = new Set(normalized.filter(Boolean));

  return [...unique];
};
```

After, utility owns behavior:

```ts
// search/utils/search-terms-normalization.util.ts
export const normalizeSearchTerms = (terms: string[]): string[] => {
  const normalized = terms.map((term) => term.trim().toLowerCase());
  const unique = new Set(normalized.filter(Boolean));

  return [...unique];
};
```

Import directly; no barrel. Keep private types here; place cross-file types per `typescript-style.md`.

**REQUIRED SUB-SKILL:** Use skill:test-driven-development for new behavior. Pure moves require observable coverage; add tests only for uncovered contracts.

## Advanced Example

This utility uses local mutation for multi-step aggregation without mutating inputs or accessing external state:

```ts
// metrics/common/metrics.type.ts
export type MetricSample = {
  readonly accepted: boolean;
  readonly category: string;
  readonly value: number;
};

export type MetricWeight = {
  readonly category: string;
  readonly multiplier: number;
};

export type MetricCategoryTotal = {
  readonly category: string;
  readonly total: number;
};

export type MetricSummary = {
  readonly categories: MetricCategoryTotal[];
  readonly total: number;
};
```

```ts
// metrics/utils/metric-summary.util.ts
import type {
  MetricCategoryTotal,
  MetricSample,
  MetricSummary,
  MetricWeight
} from '../common/metrics.type';

export const summarizeMetrics = (
  samples: MetricSample[],
  weights: MetricWeight[]
): MetricSummary => {
  const multiplierByCategory = new Map(
    weights.map(({ category, multiplier }) => [category, multiplier])
  );
  const totalByCategory = new Map<string, number>();

  for (const sample of samples) {
    if (!sample.accepted) {
      continue;
    }

    const total =
      sample.value * (multiplierByCategory.get(sample.category) ?? 1);

    totalByCategory.set(
      sample.category,
      (totalByCategory.get(sample.category) ?? 0) + total
    );
  }

  const categories: MetricCategoryTotal[] = [...totalByCategory].map(
    ([category, total]) => ({ category, total })
  );

  return {
    categories,
    total: categories.reduce((sum, category) => sum + category.total, 0)
  };
};
```

Test these boundaries: empty samples, rejected samples, repeated categories, missing weights, and unchanged inputs.

## Rationalizations

| Excuse | Counter |
|---|---|
| “The file is already feature-owned.” | Ownership does not replace the `utils/` boundary when extraction criteria hold. |
| “Anything testable belongs in utilities.” | Purity is necessary, not sufficient; trivial and caller-specific helpers stay local. |
| “Only reused functions deserve extraction.” | Single-caller algorithms may warrant tests. |
| “Put shared helpers in `common/`.” | `common/` owns shared types and constants; pure behavior belongs in the owning feature's `utils/`. |
| “Move the whole mixed module for consistency.” | One effect disqualifies that behavior from `utils/`; keep orchestration outside. |
| “Framework types make code impure.” | Types and deterministic APIs are fine; ambient state and effects are not. |

## Red Flags

Stop and re-check when reasoning includes:

- “Pure means move it.”
- “One caller means keep it embedded.”
- “`common/utils.ts` is fastest.”
- “Tests are easier if every helper is exported.”
- “A cache is effectively pure.”
- “Framework type means impure.”

## Common Mistakes

| Mistake | Fix |
|---|---|
| Moving stateful orchestration into `utils/` | Extract only pure calculation. |
| Splitting every predicate | Keep trivial, caller-specific functions local. |
| Exporting internals solely for coverage | Test behavior boundaries, not private steps. |
