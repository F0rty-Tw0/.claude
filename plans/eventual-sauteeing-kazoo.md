# Fix #291 — drag/drop ignores per-column reorder opt-in

## Context

Issue #291: a column with `meta.reorderable: true` while the surface `[enableReordering]` is **off** shows its drag affordance (`canReorderHeader` resolves per-column) and keyboard/menu moves work, but a completed drag/drop is **silently ignored** — `onHeaderDrop` early-returns on the surface flag.

Verified root cause: `libs/ng-advanced-table/src/reorder/table-reorder.service.ts:54`

```ts
if (!this.isReorderingEnabled() || !this.isLeafHeaderRow(headerGroup)) return;
```

Everything downstream is already per-column aware:

- line 67: `isColumnReorderable(movingColumn, this.isReorderingEnabled())` — the real per-column gate
- `applyVisibleZoneReorder` re-checks it (`table.state.ts:689`)
- keyboard (`handleKeyboardReorder:178`) and move menu (`natTableCanMoveColumn` → `canMoveColumnByDelta:651`) — per-column
- template: drop-list row gated by `hasReorderableColumns()` (per-column, `table.html:77`), `cdkDragDisabled` by `canReorderHeader` (`table.html:92`)

Docs were clarified in #292 to state the limitation "until #291 is fixed" — this issue tracks removing the limitation. Fix direction (issue's stated expectation): full drag/drop opt-in parity.

## Changes

### 1. Code fix (one line)

`libs/ng-advanced-table/src/reorder/table-reorder.service.ts:54` — remove the surface-flag clause:

```ts
if (!this.isLeafHeaderRow(headerGroup)) return;
```

Per-column check at line 67 becomes the sole reorder gate (matches keyboard/menu paths). No template or state changes needed.

### 2. Wording sweep — remove "drag/drop still requires the surface enabler; see #291"

- `libs/ng-advanced-table/src/utils/interaction.util.ts:24-28` (JSDoc of `isColumnReorderable`)
- `libs/ng-advanced-table/src/common/column-meta.type.ts:44`
- `libs/ng-advanced-table/components/common/column-meta.type.ts:40`
- `libs/ng-advanced-table/render-metrics/common/contracts.type.ts:103`
- `libs/ng-advanced-table/components/feature/table-surface/table-surface.ts:64`
- `AGENTS.md:60` ("Drag/drop still requires ... until #291 is fixed")
- `skills/nat-best-practises/table-patterns.md:120` ("keyboard/menu movement only ... until #291")
- `apps/showcase/public/docs/columns.md` — `reorderable` meta-table row ("opts keyboard/menu movement in") → full opt-in wording; then regenerate `docs-html-registry.ts` via the showcase `generate-docs` target (`tools/generate-showcase-docs.mjs`; known Windows path quirk — verify the registry diff only touches the columns doc)
- `libs/ng-advanced-table/CHANGELOG.md` — **leave as-is** (2.8.0 is released history; the new entry comes from the version plan)

New wording: `meta.reorderable: true` opts the column into drag/drop, keyboard, and menu movement while the surface is off. Keep the existing `false` = "not grabbed, but can be displaced" clarification.

### 3. Tests

Extend `libs/ng-advanced-table/src/reorder/table-reorder-optin.spec.ts` (GIVEN reorder-disabled block, `optInColumns` fixture):

- drop on opted-in `region` via `table.onHeaderDrop(createDropEvent('region', 1, 2), leafHeaderGroup)` → column order changes + state event emitted
- drop on non-opted `status` → ignored (no state event, order unchanged)

Reuse `createDropEvent` (`src/test-helpers/table-dom.helper.ts:28`) and the `getInternalTable` pattern from `table-reorder.spec.ts:113`.

Regression check: `table-reorder.spec.ts:159` "reordering is disabled → drop ignored" must still pass (columns there have no opt-in, per-column resolves false — expected green).

### 4. Version plan

Add `.nx/version-plans/<name>.md` fix entry (repo convention, cf. #290/#292 version plans).

## Verification

1. Baseline: run lib unit tests, capture pass/fail counts.
2. After change: rerun — new specs green, `table-reorder.spec.ts` + `table-reorder-optin.spec.ts` no regressions.
3. Lint (`pnpm run lint` scope or nx lint for the lib).
4. e2e reorder suites (`e2e/**/*reorder*`) unchanged behavior with surface on.
5. No commit — leave working tree dirty per standing rule.

## Execution notes

- Route `.ts`/`.html` edits through `executor` agent (user's standing delegation rule).
- Docs regen on Windows has a known path bug — hand-verify the registry diff.
