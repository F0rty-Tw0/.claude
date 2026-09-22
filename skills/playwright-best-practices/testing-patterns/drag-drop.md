# Drag and Drop Testing

## Table of Contents

1. [Shared Drag Utilities](#shared-drag-utilities)
2. [Kanban Board (Cross-Column Movement)](#kanban-board-cross-column-movement)
3. [Sortable Lists (Reordering)](#sortable-lists-reordering)
4. [Native HTML5 Drag and Drop](#native-html5-drag-and-drop)
5. [File Drop Zone](#file-drop-zone)
6. [Canvas Coordinate-Based Dragging](#canvas-coordinate-based-dragging)
7. [Custom Drag Preview](#custom-drag-preview)
8. [Variations](#variations)
9. [Tips](#tips)

> **When to use**: Testing drag-and-drop interactions — sortable lists, kanban boards, file drop zones, or repositionable elements.

---

## Shared Drag Utilities

`locator.dragTo()` covers native HTML5 drag and drop. Custom libraries and coordinate-based editors need raw mouse events, so the pointer sequences live in one shared util that page objects call. `boundingBox()` returns `null` for an unrendered element; the util throws instead of using a non-null assertion.

```ts
// e2e/common/drag.type.ts
export type Point = {
  readonly x: number;
  readonly y: number;
};

export type BoundingBox = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type TouchPoint = {
  readonly clientX: number;
  readonly clientY: number;
};

export type TouchEventInit = {
  readonly touches: TouchPoint[];
};
```

```ts
// e2e/test/utils/bounding-box.spec.util.ts
import type { Locator } from '@playwright/test';

import type { BoundingBox, Point } from '../../common/drag.type';

export const boundingBoxOf = async (locator: Locator): Promise<BoundingBox> => {
  const box = await locator.boundingBox();

  if (box === null) throw new Error('element is not rendered, no bounding box');

  return box;
};

export const centerOf = (box: BoundingBox): Point => {
  const point: Point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  return point;
};

export const offsetOf = (box: BoundingBox, dx: number, dy: number): Point => {
  const point: Point = { x: box.x + dx, y: box.y + dy };

  return point;
};

export const midpointOf = (first: Point, second: Point): Point => {
  const point: Point = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };

  return point;
};
```

`dragToPoint` is one press, one move, one release; `mouse.move` with `steps` emits one `mousemove` per step, which react-beautiful-dnd, dnd-kit and SortableJS need because they ignore a single jump. `dragInSteps` is the same drag aimed at a locator's center. `holdBetween` starts a drag and parks the pointer between source and target so the spec can assert mid-drag state; `dropOn` finishes it.

```ts
// e2e/test/utils/drag.spec.util.ts
import type { Locator, Page } from '@playwright/test';

import type { Point } from '../../common/drag.type';
import { boundingBoxOf, centerOf, midpointOf } from './bounding-box.spec.util';

export const dragToPoint = async (page: Page, source: Locator, point: Point, steps: number): Promise<void> => {
  await source.hover();
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps });
  await page.mouse.up();
};

export const dragInSteps = async (page: Page, source: Locator, target: Locator, steps: number): Promise<void> => {
  const targetBox = await boundingBoxOf(target);

  await dragToPoint(page, source, centerOf(targetBox), steps);
};

export const holdBetween = async (page: Page, source: Locator, target: Locator): Promise<void> => {
  const sourceBox = await boundingBoxOf(source);
  const targetBox = await boundingBoxOf(target);
  const parkAt = midpointOf(centerOf(sourceBox), centerOf(targetBox));

  await source.hover();
  await page.mouse.down();
  await page.mouse.move(parkAt.x, parkAt.y, { steps: 5 });
};

export const dropOn = async (page: Page, target: Locator): Promise<void> => {
  const targetBox = await boundingBoxOf(target);
  const dropAt = centerOf(targetBox);

  await page.mouse.move(dropAt.x, dropAt.y, { steps: 5 });
  await page.mouse.up();
};
```

---

## Kanban Board (Cross-Column Movement)

Each column is a component object scoped to its `[data-column]` root. Card assertions are boxed steps on the column; the drag itself is `dragTo()` from the card to the target column root.

```ts
// e2e/board/components/board-column.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class BoardColumn {
  public readonly cards: Locator;
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.cards = root.getByRole('article');
  }

  public card(title: string): Locator {
    return this.cards.filter({ hasText: title });
  }

  public async dragCardTo(title: string, target: BoardColumn): Promise<void> {
    await this.card(title).dragTo(target.root);
  }

  public async expectCard(title: string): Promise<void> {
    await test.step(`column shows "${title}"`, (): Promise<void> => expect(this.card(title)).toBeVisible(), { box: true });
  }

  public async expectNoCard(title: string): Promise<void> {
    await test.step(`column hides "${title}"`, (): Promise<void> => expect(this.card(title)).toBeHidden(), { box: true });
  }
}
```

Workflow progression is `dragCardTo` once per stage, then `expectNoCard` on every earlier column. Same-column reorder is `card('Item Z').dragTo(card('Item X'))` followed by `expect(cards).toContainText(['Item Z', 'Item X'])`; the array form matches a subset in order, see `expectOrder` under [Sortable Lists](#sortable-lists-reordering). Card counts come from `cards.count()` in a value-returning `GIVEN` step and `expect(cards).toHaveCount(n)` after the drag.

The page object composes the columns and owns the persistence check: `waitForResponse` starts before the drag, and the parsed `PATCH` body is returned so the spec can assert on it.

```ts
// e2e/board/common/board.type.ts
export type Ticket = {
  readonly column: string;
  readonly id: string;
  readonly title: string;
};
```

```ts
// e2e/board/pages/board.page.ts
import type { Locator, Page, Response } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { Ticket } from '../common/board.type';
import { BoardColumn } from '../components/board-column.component';
import { DragPreview } from '../components/drag-preview.component';

const isTicketSaved = (response: Response): boolean => {
  const isTicketUrl = response.url().includes('/api/tickets');
  const isPatch = response.request().method() === 'PATCH';

  return isTicketUrl && isPatch && response.status() === 200;
};

export class BoardPage {
  public readonly activeColumn: BoardColumn;
  public readonly backlogColumn: BoardColumn;
  public readonly dragPreview: DragPreview;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.activeColumn = new BoardColumn(page.locator('[data-column="active"]'));
    this.backlogColumn = new BoardColumn(page.locator('[data-column="backlog"]'));
    this.dragPreview = new DragPreview(page.locator('.drag-preview'));
  }

  public ticket(id: string): Locator {
    return this.page.getByTestId(id);
  }

  public async goto(): Promise<void> {
    await this.page.goto('/board');
  }

  public async reload(): Promise<void> {
    await this.page.reload();
  }

  public async moveCardAndAwaitSave(title: string, from: BoardColumn, to: BoardColumn): Promise<Ticket> {
    const saved = this.page.waitForResponse(isTicketSaved);

    await from.dragCardTo(title, to);

    const response = await saved;
    const ticket: Ticket = await response.json();

    return ticket;
  }

  public async expectTicketDragging(id: string): Promise<void> {
    await test.step(`ticket ${id} shows its dragging state`, (): Promise<void> => expect(this.ticket(id)).toHaveClass(/dragging|placeholder/), { box: true });
  }
}
```

`DragPreview` is defined in [Custom Drag Preview](#custom-drag-preview). The fixture injects the page object; every other feature in this file uses the same fixture shape with its own page object.

```ts
// e2e/board/board.fixture.ts
import { test as base } from '@playwright/test';

import { BoardPage } from './pages/board.page';

type BoardFixtures = {
  readonly boardPage: BoardPage;
};

export const test = base.extend<BoardFixtures>({
  boardPage: async ({ page }, use): Promise<void> => {
    await use(new BoardPage(page));
  }
});

export { expect } from '@playwright/test';
```

| Feature | Fixture file | Fixture member |
|---|---|---|
| Kanban board | `e2e/board/board.fixture.ts` | `boardPage: BoardPage` |
| Sortable list | `e2e/priorities/priorities.fixture.ts` | `prioritiesPage: PrioritiesPage` |
| Native HTML5 | `e2e/drag-example/drag-example.fixture.ts` | `dragExamplePage: DragExamplePage` |
| Canvas editor | `e2e/design-tool/design-tool.fixture.ts` | `designToolPage: DesignToolPage` |
| Cross-frame | `e2e/composer/composer.fixture.ts` | `composerPage: ComposerPage` |

The second test returns the saved ticket from the drag step and reloads to prove persistence.

```ts
// e2e/board/board.spec.ts
import type { Ticket } from './common/board.type';
import { expect, test } from './board.fixture';

const TICKET = 'Update API docs';

test.describe('FEATURE: kanban board', () => {
  test.describe('GIVEN the backlog lists a ticket', () => {
    test.beforeEach(async ({ boardPage }): Promise<void> => {
      await test.step('GIVEN the board is open', (): Promise<void> => boardPage.goto());
    });

    test('dragging the ticket to active moves it out of the backlog', async ({ boardPage }): Promise<void> => {
      await test.step('WHEN the ticket is dragged to active', (): Promise<void> => boardPage.backlogColumn.dragCardTo(TICKET, boardPage.activeColumn));

      await test.step('THEN active shows the ticket', (): Promise<void> => boardPage.activeColumn.expectCard(TICKET));

      await test.step('AND the backlog hides the ticket', (): Promise<void> => boardPage.backlogColumn.expectNoCard(TICKET));
    });

    test('dragging the ticket to active saves the move across a reload', async ({ boardPage }): Promise<void> => {
      const ticket = await test.step('WHEN the ticket is dragged to active and the save completes', (): Promise<Ticket> => boardPage.moveCardAndAwaitSave(TICKET, boardPage.backlogColumn, boardPage.activeColumn));

      await test.step('THEN the saved ticket names the active column', (): void => expect(ticket.column).toBe('active'));

      await test.step('WHEN the board is reloaded', (): Promise<void> => boardPage.reload());

      await test.step('THEN active still shows the ticket', (): Promise<void> => boardPage.activeColumn.expectCard(TICKET));
    });
  });
});
```

---

## Sortable Lists (Reordering)

The list page object exposes `items` and an `item(name)` filter. `expectOrder` asserts the whole list with a web-first `toContainText` array so it retries until the DOM settles; no `allTextContents()` snapshot. Persistence is the same `waitForResponse` plus reload pattern as the board.

```ts
// e2e/priorities/pages/priorities.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class PrioritiesPage {
  public readonly items: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.items = page.getByRole('list', { name: 'Priority list' }).getByRole('listitem');
  }

  public item(name: string): Locator {
    return this.items.filter({ hasText: name });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/priorities');
  }

  public async dragItemBefore(name: string, target: string): Promise<void> {
    await this.item(name).dragTo(this.item(target));
  }

  public async expectOrder(names: string[]): Promise<void> {
    await test.step(`list reads ${names.join(', ')}`, (): Promise<void> => expect(this.items).toContainText(names), { box: true });
  }
}
```

```ts
// e2e/priorities/priorities.spec.ts
import { test } from './priorities.fixture';

const SEEDED_ORDER = ['Priority A', 'Priority B', 'Priority C'];
const REORDERED = ['Priority C', 'Priority A', 'Priority B'];

test.describe('FEATURE: priority list ordering', () => {
  test.describe('GIVEN the list reads A, B, C', () => {
    test.beforeEach(async ({ prioritiesPage }): Promise<void> => {
      await test.step('GIVEN the priorities page is open', (): Promise<void> => prioritiesPage.goto());

      await test.step('AND the list starts in the seeded order', (): Promise<void> => prioritiesPage.expectOrder(SEEDED_ORDER));
    });

    test('dropping C on A reorders the list to C, A, B', async ({ prioritiesPage }): Promise<void> => {
      await test.step('WHEN C is dragged onto A', (): Promise<void> => prioritiesPage.dragItemBefore('Priority C', 'Priority A'));

      await test.step('THEN the list reads C, A, B', (): Promise<void> => prioritiesPage.expectOrder(REORDERED));
    });
  });
});
```

Every other way of moving C onto A is the same spec with one different `WHEN` body; the `THEN` stays `expectOrder(REORDERED)`. Utils that take `page` need it destructured in the test signature.

| Variant | `WHEN` step body |
|---|---|
| Drag handle only | `prioritiesPage.dragHandleBefore('Priority C', 'Priority A')`, a page method that drags `item(name).getByRole('button', { name: /drag\|reorder\|grip/i })` onto `item(target)` |
| Stepped mouse (react-beautiful-dnd, dnd-kit, SortableJS) | `dragInSteps(page, prioritiesPage.item('Priority C'), prioritiesPage.item('Priority A'), 10)` |
| Keyboard, see [Variations](#keyboard-based-reordering) | `moveUpWithKeyboard(page, prioritiesPage.item('Priority C'), 2)` |
| Touch, see [Variations](#touch-based-drag-on-mobile) | `touchDrag(prioritiesPage.item('Priority C'), prioritiesPage.item('Priority A'), 5)` |

---

## Native HTML5 Drag and Drop

A `DropArea` component wraps every target zone, so the same assertions serve the target zone and the swap areas; `expect(root).not.toContainText(text)` covers the source area. `holdElementOverZone` presses and moves without releasing so the spec can assert the highlight, then `releaseElement` completes the drop.

```ts
// e2e/drag-example/components/drop-area.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class DropArea {
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
  }

  public async expectItem(text: string): Promise<void> {
    await test.step(`area lists "${text}"`, (): Promise<void> => expect(this.root).toContainText(text), { box: true });
  }

  public async expectHighlighted(): Promise<void> {
    await test.step('area shows the drag-over highlight', (): Promise<void> => expect(this.root).toHaveClass(/drag-over|highlight/), { box: true });
  }

  public async expectIdle(): Promise<void> {
    await test.step('area shows no highlight', (): Promise<void> => expect(this.root).not.toHaveClass(/drag-over|highlight/), { box: true });
  }
}
```

```ts
// e2e/drag-example/pages/drag-example.page.ts
import type { Locator, Page } from '@playwright/test';

import { boundingBoxOf, centerOf } from '../../test/utils/bounding-box.spec.util';
import { DropArea } from '../components/drop-area.component';

export class DragExamplePage {
  public readonly areaB: DropArea;
  public readonly dropZone: DropArea;
  public readonly element: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.areaB = new DropArea(page.getByTestId('area-b'));
    this.dropZone = new DropArea(page.locator('#target-zone'));
    this.element = page.getByTestId('element-1');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/drag-example');
  }

  public async dragElementTo(area: DropArea): Promise<void> {
    await this.element.dragTo(area.root);
  }

  public async holdElementOverZone(): Promise<void> {
    const zoneCenter = centerOf(await boundingBoxOf(this.dropZone.root));

    await this.element.hover();
    await this.page.mouse.down();
    await this.page.mouse.move(zoneCenter.x, zoneCenter.y);
  }

  public async releaseElement(): Promise<void> {
    await this.page.mouse.up();
  }
}
```

```ts
// e2e/drag-example/drag-example.spec.ts
import { test } from './drag-example.fixture';

test.describe('FEATURE: native HTML5 drag and drop', () => {
  test.describe('GIVEN the drag example page is open', () => {
    test.beforeEach(async ({ dragExamplePage }): Promise<void> => {
      await test.step('GIVEN the drag example is open', (): Promise<void> => dragExamplePage.goto());
    });

    test('dragging element 1 to area B lists it there', async ({ dragExamplePage }): Promise<void> => {
      await test.step('WHEN element 1 is dragged to area B', (): Promise<void> => dragExamplePage.dragElementTo(dragExamplePage.areaB));

      await test.step('THEN area B lists element 1', (): Promise<void> => dragExamplePage.areaB.expectItem('Element 1'));
    });

    test('holding the element over the zone highlights it until release', async ({ dragExamplePage }): Promise<void> => {
      await test.step('WHEN the element is held over the target zone', (): Promise<void> => dragExamplePage.holdElementOverZone());

      await test.step('THEN the target zone is highlighted', (): Promise<void> => dragExamplePage.dropZone.expectHighlighted());

      await test.step('WHEN the element is released', (): Promise<void> => dragExamplePage.releaseElement());

      await test.step('THEN the highlight is gone', (): Promise<void> => dragExamplePage.dropZone.expectIdle());

      await test.step('AND the target zone lists the element', (): Promise<void> => dragExamplePage.dropZone.expectItem('Element 1'));
    });
  });
});
```

---

## File Drop Zone

A file drop zone wraps a hidden `<input type="file">`, so `setInputFiles` on that input fires the same change handler as a real drop, and drag-over styling is exercised with `dispatchEvent('dragenter')` carrying a `dataTransfer` whose `types` include `Files`. The component and spec are in `file-upload-download.md` under "Drag-and-Drop Zones"; the rejected `.exe` payload is under "File Type and Size Restrictions" there.

---

## Canvas Coordinate-Based Dragging

A canvas editor has no drop target; the page object computes the target point from the canvas bounding box and drags with `dragToPoint`. Geometry assertions read `boundingBox()` once and compare with `toBeCloseTo(value, -1)`, which tolerates five pixels. `dragShapeToCanvasOffset` returns the absolute target point and `resizeShapeBy` returns the box before the resize, so each assertion step receives the value it compares against.

```ts
// e2e/design-tool/components/shape.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { BoundingBox, Point } from '../../common/drag.type';
import { boundingBoxOf, centerOf } from '../../test/utils/bounding-box.spec.util';

export class Shape {
  public readonly resizeHandle: Locator;
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.resizeHandle = root.locator('.resize-handle-se');
  }

  public async box(): Promise<BoundingBox> {
    return boundingBoxOf(this.root);
  }

  public async expectCenteredAt(target: Point): Promise<void> {
    const box = await this.box();
    const center = centerOf(box);

    await test.step(`shape center x is near ${target.x}`, (): void => expect(center.x).toBeCloseTo(target.x, -1), { box: true });
    await test.step(`shape center y is near ${target.y}`, (): void => expect(center.y).toBeCloseTo(target.y, -1), { box: true });
  }

  public async expectSize(width: number, height: number): Promise<void> {
    const box = await this.box();

    await test.step(`shape width is near ${width}`, (): void => expect(box.width).toBeCloseTo(width, -1), { box: true });
    await test.step(`shape height is near ${height}`, (): void => expect(box.height).toBeCloseTo(height, -1), { box: true });
  }
}
```

```ts
// e2e/design-tool/pages/design-tool.page.ts
import type { Locator, Page } from '@playwright/test';

import type { BoundingBox, Point } from '../../common/drag.type';
import { boundingBoxOf, offsetOf } from '../../test/utils/bounding-box.spec.util';
import { dragToPoint } from '../../test/utils/drag.spec.util';
import { Shape } from '../components/shape.component';

export class DesignToolPage {
  public readonly canvas: Locator;
  public readonly shape: Shape;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('#editor-canvas');
    this.shape = new Shape(page.getByTestId('shape-1'));
  }

  public async goto(): Promise<void> {
    await this.page.goto('/design-tool');
  }

  public async dragShapeToCanvasOffset(dx: number, dy: number): Promise<Point> {
    const target = offsetOf(await boundingBoxOf(this.canvas), dx, dy);

    await dragToPoint(this.page, this.shape.root, target, 10);

    return target;
  }

  public async resizeShapeBy(dx: number, dy: number): Promise<BoundingBox> {
    await this.shape.root.click();

    const before = await this.shape.box();
    const target = offsetOf(await boundingBoxOf(this.shape.resizeHandle), dx, dy);

    await dragToPoint(this.page, this.shape.resizeHandle, target, 5);

    return before;
  }
}
```

```ts
// e2e/design-tool/design-tool.spec.ts
import type { BoundingBox, Point } from '../common/drag.type';
import { test } from './design-tool.fixture';

test.describe('FEATURE: design tool shape dragging', () => {
  test.describe('GIVEN the editor is open', () => {
    test.beforeEach(async ({ designToolPage }): Promise<void> => {
      await test.step('GIVEN the design tool is open', (): Promise<void> => designToolPage.goto());
    });

    test('dragging the shape to a canvas point centers it there', async ({ designToolPage }): Promise<void> => {
      const target = await test.step('WHEN the shape is dragged 300px right and 200px down', (): Promise<Point> => designToolPage.dragShapeToCanvasOffset(300, 200));

      await test.step('THEN the shape is centered on the target', (): Promise<void> => designToolPage.shape.expectCenteredAt(target));
    });

    test('dragging the resize handle grows the shape by the drag distance', async ({ designToolPage }): Promise<void> => {
      const before = await test.step('WHEN the handle is dragged 100px right and 80px down', (): Promise<BoundingBox> => designToolPage.resizeShapeBy(100, 80));

      await test.step('THEN the shape grew by the drag distance', (): Promise<void> => designToolPage.shape.expectSize(before.width + 100, before.height + 80));
    });
  });
});
```

Other geometry checks are one more `Shape` method each, built from the same `box()` read:

| Check | Drag | Assertion |
|---|---|---|
| Grid snap | `dragShapeToCanvasOffset(147, 83)` | `expect({ x: Math.round(box.x) % 20, y: Math.round(box.y) % 20 }).toEqual({ x: 0, y: 0 })` |
| Bounded container | `dragToPoint` to `offsetOf(containerBox, containerBox.width + 500, -200)` | Every edge of the shape box inside the container box, `expect(isInside).toBe(true)` |

---

## Custom Drag Preview

The preview is a component object on `.drag-preview`. The spec holds a card between columns with `holdBetween`, asserts the preview and the card's dragging class, then finishes with `dropOn`.

```ts
// e2e/board/components/drag-preview.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class DragPreview {
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
  }

  public async expectVisible(): Promise<void> {
    await test.step('drag preview is shown', (): Promise<void> => expect(this.root).toBeVisible(), { box: true });
  }

  public async expectHidden(): Promise<void> {
    await test.step('drag preview is gone', (): Promise<void> => expect(this.root).toBeHidden(), { box: true });
  }
}
```

```ts
// e2e/board/board-preview.spec.ts
import { dropOn, holdBetween } from '../test/utils/drag.spec.util';
import { test } from './board.fixture';

test.describe('FEATURE: kanban drag preview', () => {
  test.describe('GIVEN the board is open', () => {
    test.beforeEach(async ({ boardPage }): Promise<void> => {
      await test.step('GIVEN the board is open', (): Promise<void> => boardPage.goto());
    });

    test('holding a card between columns shows the preview until the drop', async ({ boardPage, page }): Promise<void> => {
      await test.step('WHEN ticket 1 is held between backlog and active', (): Promise<void> => holdBetween(page, boardPage.ticket('ticket-1'), boardPage.activeColumn.root));

      await test.step('THEN the drag preview is shown', (): Promise<void> => boardPage.dragPreview.expectVisible());

      await test.step('AND ticket 1 shows its dragging state', (): Promise<void> => boardPage.expectTicketDragging('ticket-1'));

      await test.step('WHEN the card is dropped on the active column', (): Promise<void> => dropOn(page, boardPage.activeColumn.root));

      await test.step('THEN the drag preview is gone', (): Promise<void> => boardPage.dragPreview.expectHidden());
    });
  });
});
```

Multi-select drag is a `GIVEN` step that clicks ticket 1 then tickets 2 and 3 with `click({ modifiers: ['Shift'] })`, `holdBetween` on ticket 1 toward the target column root, `expect(dragPreview.root).toContainText('3 items')`, then `dropOn` and `expectCard` for each ticket. `BoardColumn.expectCard` filters by text; when tickets carry only a `data-testid`, add an `expectTicket(id)` method on the column that filters with `{ has: this.root.getByTestId(id) }` instead.

---

## Variations

### Keyboard-Based Reordering

Accessible sortable lists move a focused item with Space to lift, ArrowUp/ArrowDown to move, Space to drop. The sequence is a util so any list page can reuse it; the spec is the variant row under [Sortable Lists](#sortable-lists-reordering).

```ts
// e2e/test/utils/keyboard-reorder.spec.util.ts
import type { Locator, Page } from '@playwright/test';

export const moveUpWithKeyboard = async (page: Page, item: Locator, rows: number): Promise<void> => {
  await item.focus();
  await page.keyboard.press('Space');

  for (let row = 0; row < rows; row += 1) {
    await page.keyboard.press('ArrowUp');
  }

  await page.keyboard.press('Space');
};
```

### Cross-Frame Dragging

`dragTo()` cannot cross a frame boundary. The page object reads the iframe element's bounding box and drags to a point inside it, then asserts through a `frameLocator`. The spec is `WHEN composerPage.dragWidgetIntoPreview()` then `THEN composerPage.expectPreviewShows('Component A')`.

```ts
// e2e/composer/pages/composer.page.ts
import type { FrameLocator, Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { boundingBoxOf, offsetOf } from '../../test/utils/bounding-box.spec.util';
import { dragToPoint } from '../../test/utils/drag.spec.util';

export class ComposerPage {
  public readonly preview: FrameLocator;
  public readonly previewFrame: Locator;
  public readonly sourceWidget: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.preview = page.frameLocator('#preview-frame');
    this.previewFrame = page.locator('#preview-frame');
    this.sourceWidget = page.getByText('Component A');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/composer');
  }

  public async dragWidgetIntoPreview(): Promise<void> {
    const target = offsetOf(await boundingBoxOf(this.previewFrame), 100, 100);

    await dragToPoint(this.page, this.sourceWidget, target, 20);
  }

  public async expectPreviewShows(text: string): Promise<void> {
    await test.step(`preview frame shows "${text}"`, (): Promise<void> => expect(this.preview.getByText(text)).toBeVisible(), { box: true });
  }
}
```

### Touch-Based Drag on Mobile

Touch libraries listen for `touchstart` / `touchmove` / `touchend`, which `page.mouse` never emits. The util dispatches them on the source with `touches` payloads interpolated toward the target; the spec is the variant row under [Sortable Lists](#sortable-lists-reordering).

```ts
// e2e/test/utils/touch-drag.spec.util.ts
import type { Locator } from '@playwright/test';

import type { TouchEventInit } from '../../common/drag.type';
import { boundingBoxOf } from './bounding-box.spec.util';

const touchAt = (clientX: number, clientY: number): TouchEventInit => {
  const touchEventInit: TouchEventInit = { touches: [{ clientX, clientY }] };

  return touchEventInit;
};

export const touchDrag = async (source: Locator, target: Locator, steps: number): Promise<void> => {
  const sourceBox = await boundingBoxOf(source);
  const targetBox = await boundingBoxOf(target);

  await source.dispatchEvent('touchstart', touchAt(sourceBox.x + 10, sourceBox.y + 10));

  for (let index = 1; index <= steps; index += 1) {
    const y = sourceBox.y + (targetBox.y - sourceBox.y) * (index / steps);

    await source.dispatchEvent('touchmove', touchAt(sourceBox.x + 10, y));
  }

  await source.dispatchEvent('touchend');
};
```

---

## Tips

1. **Start with `dragTo()`, fall back to manual mouse events**. `dragTo()` handles most HTML5 drag-and-drop; use `page.mouse.down()` / `move()` / `up()` only for custom libraries (react-beautiful-dnd, dnd-kit, SortableJS) that need specific event sequences.
2. **Add intermediate mouse steps for drag libraries**. `{ steps: 10 }` or `dragInSteps`; a single jump often fails silently.
3. **Assert final state, not just the drop event**. Item order, column contents, position coordinates from `boundingBox()` compared with `toBeCloseTo()` for tolerance. Visual feedback during drag is secondary to the persisted state.
4. **Test undo after drag operations**. If the app supports Ctrl+Z, verify the drag is reversible; this catches state management bugs.
