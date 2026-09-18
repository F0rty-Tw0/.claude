# Module Size

## Contents

- [Core Principle](#core-principle)
- [Quick Reference](#quick-reference)
- [Procedure](#procedure)
- [Example](#example)
- [Spec Files](#spec-files)
- [Rationalizations](#rationalizations)
- [Red Flags](#red-flags)
- [Common Mistakes](#common-mistakes)

## Core Principle

A file is one nameable responsibility. 150 lines is the ceiling that forces a split; the cut is chosen by behavior, never by line position.

## Quick Reference

| Concern | Rule |
|---|---|
| Ceiling | Any source `.ts` file over 150 lines, blank and comment lines skipped, must be split before the work is done. Spec files get 300. Fixtures are exempt. Enforce with ESLint `max-lines` (`{ max: 150, skipBlankLines: true, skipComments: true }`, and 300 for `**/*.spec.ts`). |
| Function size | One function stays under 50 lines, complexity 10, nesting depth 4, and 4 parameters (ESLint `max-lines-per-function`, `complexity`, `max-depth`, `max-params`). A fifth parameter becomes a typed options object. |
| Boundary | Group declarations by the concern they serve. Every chunk has a noun-phrase name describing what it computes. |
| Routing | Route each group through the ladder, top rung wins: cross-file type → `common/<feature>.type.ts`; shared runtime constant → `common/<feature>.const.ts`; pure behavior passing the purity gate → `utils/<behavior>.util.ts`; anything else → sibling `<feature>-<concern>.ts` in the same folder. |
| Entry file | The original file keeps its public API and orchestration. It imports every chunk directly. |
| Exports | Export only what another file now imports. A helper with exactly one consumer moves into that consumer's chunk instead of being exported. |
| Crossing types | A type that crosses a file boundary because of the split moves to `common/<feature>.type.ts` per `typescript-style.md`. |
| Constants | A runtime constant used by one chunk stays in that chunk. Only a constant imported by two or more files goes to `<feature>.const.ts`. |
| Names | Name chunks by output: `order-pricing.ts`, `invoice-reconciliation.ts`. Never `helpers`, `utils` (as a sibling), `misc`, `internal`, `shared`, `part-2`. |
| Barrels | None. Import each chunk directly. |
| Gate | Same tests pass, typecheck clean, lint clean, and the line list is re-run to prove no file is over the ceiling. |

## Procedure

1. List offenders:

   ```sh
   npx eslint --rule 'max-lines: [error, { max: 150, skipBlankLines: true, skipComments: true }]' --no-inline-config . 2>/dev/null | grep -B1 max-lines
   ```

2. Map every top-level declaration in the file to a concern. Write the table before touching code:

   | Declaration | Concern | Destination |
   |---|---|---|
   | `parseLine`, `parseHeader`, `parseOrderFile` | turning raw text into order records | `order-parsing.ts` |
   | `applyDiscounts`, `applyTax`, `priceOrder` | computing totals | `order-pricing.ts` |
   | `OrderRecord`, `PricedOrder` | shapes now imported by two chunks | `common/order-import.type.ts` |

3. Route each concern by the ladder in the quick reference.
4. Move declarations, fix imports, delete imports that no longer resolve to anything.
5. Re-run the offender list and the gate.

A group that is still over the ceiling after step 3 hides more than one concern. Split it again.

## Example

Before, one file parses an order file, prices the orders, validates them against stock, and writes the import report:

```text
orders/import/
  order-import.ts                  431 lines
```

After, each concern owns a file and the entry keeps orchestration:

```text
orders/import/common/
  order-import.type.ts             OrderRecord, PricedOrder, ImportContext
orders/import/
  order-parsing.ts                 parseLine, parseHeader, parseOrderFile
  order-pricing.ts                 applyDiscounts, applyTax, priceOrder
  order-validation.ts              validateStock
  order-import.ts                  importOrders (entry)
```

`order-import.ts` imports the three siblings directly. `ImportContext` moved to `common/` because two chunks now take it as a parameter. No `index.ts` appeared.

## Spec Files

The ceiling applies to specs. Split by behavior group, not by `valid`/`invalid`:

| Concern | Rule |
|---|---|
| Naming | Sibling `<module>.spec.ts` beside each module the cases blame; see `unit-testing.md` Spec Per Module. A split module hands each chunk its cases. |
| Shared setup | Rule lookup, tester wiring, source builders, and temp-project copy go to `test/utils/<behavior>.spec.util.ts`; typed base values to `test/stubs/`; behavior doubles to `test/mocks/`; on-disk samples to `test/fixtures/`. See `unit-testing.md`. Never a `.spec-support.ts` file, never test-only code in `common/` or `utils/`. |
| Runner globs | Check the test runner's glob before naming. A new file that the glob misses is a silently deleted test. |
| Cleanup | A spec that owns a temp directory owns its `after` hook. Do not centralize cleanup for directories created elsewhere. |
| Gate | The test count after the split equals the count before it. |

## Rationalizations

| Excuse | Counter |
|---|---|
| “The file is cohesive, it is just long.” | 150 lines means at least two concerns hide in it. Name them. |
| “Splitting only adds imports.” | Imports are the map of the architecture. A file with no imports hides its dependencies inside itself. |
| “Export the helper so the other chunk compiles.” | If one chunk uses it, move it there. Export only what two files need. |
| “Put the overflow in `helpers.ts`.” | A name that describes nothing is a dumping ground. Name the concern or the split is wrong. |
| “Specs are allowed to be long.” | Specs get 300, not unlimited. The ceiling applies. |
| “It is only a few lines over.” | 150 is the cap the linter enforces. Over is over. |
| “Split after the feature lands.” | The split is part of the feature. Unsplit files never get split later. |
| “A pure function is in the file, so the whole file is a util.” | Route each group separately. One I/O call keeps that group out of `utils/`. |

## Red Flags

Stop and re-check this reference when reasoning includes:

- “Move the bottom half.”
- “Call it `helpers`, `misc`, `shared`, or `part-2`.”
- “Export it so the split compiles.”
- “Add `index.ts` so the folder looks small again.”
- “The line count is close enough.”
- “I will split it in a follow-up.”

## Common Mistakes

| Mistake | Fix |
|---|---|
| Cutting at a line number | Cut at a concern boundary. |
| Naming the chunk after the split | Name it after what it computes. |
| Leaving a now-shared type exported from a sibling chunk | Move it to `common/<feature>.type.ts`. |
| Moving a pure transformation into a sibling chunk | `utils/<behavior>.util.ts`. |
| Moving orchestration, I/O, or caches into `utils/` | Sibling chunk in the owning folder. |
| Exporting a single-consumer helper | Move it into its consumer's chunk. |
| Adding a barrel to hide the chunk count | Import directly. |
| Splitting a spec into a file the runner glob misses | Check the glob first. |
