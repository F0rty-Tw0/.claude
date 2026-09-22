# Canvas & WebGL Testing

## Table of Contents

1. [Canvas Basics](#canvas-basics)
2. [Visual Comparison](#visual-comparison)
3. [Interaction Testing](#interaction-testing)
4. [WebGL Testing](#webgl-testing)
5. [Chart Libraries](#chart-libraries)
6. [Game & Animation Testing](#game--animation-testing)

Every sample below shares one feature folder. Pixel reads, gestures, and app globals live in `test/utils/`, page objects own the `canvas` locator, and specs only call those. Globals the app hangs on `window` (`chart`, `Chart`, `scene`, `camera`, `game`, `gameLoop`) are optional members of `CanvasGlobals`; `document` anchors the type so `window` assigns to it without a cast.

```ts
// e2e/canvas/common/canvas.type.ts
export type Point = { readonly x: number; readonly y: number };

export type CanvasBox = { readonly height: number; readonly width: number; readonly x: number; readonly y: number };

export type Rgba = { readonly a: number; readonly b: number; readonly g: number; readonly r: number };

export type AnimatedChart = {
  readonly isAnimating: boolean;
  readonly on: (event: string, handler: () => void) => void;
  readonly stop?: () => void;
};

export type ChartDataset = { readonly data: number[] };

export type ChartData = { readonly datasets: ChartDataset[] };

export type ChartInstance = { readonly data: ChartData };

export type ChartStatic = { readonly getChart: (canvas: HTMLCanvasElement) => ChartInstance | undefined };

export type Rotation = { readonly y: number };

export type ThreeCamera = { readonly rotation: Rotation };

export type ThreeScene = { readonly children: unknown[] };

export type Game = { readonly score: number };

export type GameLoop = { readonly pause: () => void; readonly tick: () => void };

export type CanvasGlobals = {
  readonly Chart?: ChartStatic;
  readonly camera?: ThreeCamera;
  readonly chart?: AnimatedChart;
  readonly document: Document;
  readonly game?: Game;
  readonly gameLoop?: GameLoop;
  readonly scene?: ThreeScene;
};
```

One fixture per page object. `ChartPage` and `MapPage` are shown below; `WhiteboardPage`, `ViewerPage`, and `GamePage` follow the same shape and are described where their spec uses them.

```ts
// e2e/canvas/canvas.fixture.ts
import { test as base } from '@playwright/test';

import { ChartPage } from './pages/chart.page';
import { GamePage } from './pages/game.page';
import { MapPage } from './pages/map.page';
import { ViewerPage } from './pages/viewer.page';
import { WhiteboardPage } from './pages/whiteboard.page';

type CanvasFixtures = {
  readonly chartPage: ChartPage;
  readonly gamePage: GamePage;
  readonly mapPage: MapPage;
  readonly viewerPage: ViewerPage;
  readonly whiteboardPage: WhiteboardPage;
};

export const test = base.extend<CanvasFixtures>({
  chartPage: async ({ page }, use): Promise<void> => {
    await use(new ChartPage(page));
  },
  gamePage: async ({ page }, use): Promise<void> => {
    await use(new GamePage(page));
  },
  mapPage: async ({ page }, use): Promise<void> => {
    await use(new MapPage(page));
  },
  viewerPage: async ({ page }, use): Promise<void> => {
    await use(new ViewerPage(page));
  },
  whiteboardPage: async ({ page }, use): Promise<void> => {
    await use(new WhiteboardPage(page));
  },
});

export { expect } from '@playwright/test';
```

## Canvas Basics

### Locating Canvas Elements

A canvas is located like any element: `page.locator('canvas')` for the only one on the page, `canvas#game` by id, `canvas.chart-canvas` by class. The page object owns the locator; `bars` and `tooltip` serve the SVG chart under [Chart Libraries](#chart-libraries).

```ts
// e2e/canvas/pages/chart.page.ts
import type { Locator, Page } from '@playwright/test';

import type { Point } from '../common/canvas.type';

export class ChartPage {
  public readonly bars: Locator;
  public readonly canvas: Locator;
  public readonly tooltip: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.bars = page.locator('svg.chart rect.bar');
    this.canvas = page.locator('canvas');
    this.tooltip = page.locator('.tooltip');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/chart');
  }

  public async clickAt(position: Point): Promise<void> {
    await this.canvas.click({ position });
  }

  public async hoverFirstBar(): Promise<void> {
    await this.bars.first().hover();
  }
}
```

The geometry util reads `boundingBox()` once, throws when the canvas has none, and derives the absolute origin, the absolute center, and the canvas-relative midpoint from it.

```ts
// e2e/canvas/test/utils/canvas-geometry.spec.util.ts
import type { Locator } from '@playwright/test';

import type { CanvasBox, Point } from '../../common/canvas.type';

const boxOf = async (canvas: Locator): Promise<CanvasBox> => {
  const box = await canvas.boundingBox();

  if (!box) throw new Error('canvas has no bounding box');

  return box;
};

export const canvasCenter = async (canvas: Locator): Promise<Point> => {
  const box = await boxOf(canvas);

  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  return point;
};

export const canvasMidpoint = async (canvas: Locator): Promise<Point> => {
  const box = await boxOf(canvas);

  const point = { x: box.width / 2, y: box.height / 2 };

  return point;
};

export const canvasOrigin = async (canvas: Locator): Promise<Point> => {
  const box = await boxOf(canvas);

  const point = { x: box.x, y: box.y };

  return point;
};
```

### Reading Canvas Pixels

A freshly mounted canvas is blank. `readHasContent` reports whether any colour channel differs from the `blank` value: `hasCanvasContent` passes `0` for a transparent canvas, `hasInk` passes `255` for a white one. `expect.poll` on either replaces `waitForFunction`. `canvasDataUrl` returns `toDataURL('image/png')`; `pixelAt` returns the RGBA of one pixel. `chart.spec.ts` under [Visual Comparison](#visual-comparison) uses both.

```ts
// e2e/canvas/test/utils/canvas-pixels.spec.util.ts
import type { Locator } from '@playwright/test';

import type { Point, Rgba } from '../../common/canvas.type';

const readHasContent = (canvas: HTMLCanvasElement, blank: number): boolean => {
  const context = canvas.getContext('2d');

  if (!context) return false;

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const isDrawnColorChannel = (value: number, index: number): boolean => index % 4 !== 3 && value !== blank;

  return data.some(isDrawnColorChannel);
};

const readDataUrl = (canvas: HTMLCanvasElement): string => canvas.toDataURL('image/png');

const readPixel = (canvas: HTMLCanvasElement, point: Point): Rgba => {
  const context = canvas.getContext('2d');

  if (!context) throw new Error('canvas has no 2d context');

  const [r, g, b, a] = context.getImageData(point.x, point.y, 1, 1).data;

  const rgba = { a, b, g, r };

  return rgba;
};

export const canvasDataUrl = (canvas: Locator): Promise<string> => canvas.evaluate(readDataUrl);

export const hasCanvasContent = (canvas: Locator): Promise<boolean> => canvas.evaluate(readHasContent, 0);

export const hasInk = (canvas: Locator): Promise<boolean> => canvas.evaluate(readHasContent, 255);

export const pixelAt = (canvas: Locator, point: Point): Promise<Rgba> => canvas.evaluate(readPixel, point);
```

## Visual Comparison

### Handling Animation

Two strategies, both in `chart-globals.spec.util.ts`: `freezeAnimation` calls the chart's `stop()` when it exposes one and replaces `requestAnimationFrame` with a no-op; `waitForAnimationComplete` resolves at once when `isAnimating` is already `false` and otherwise on the chart's `animationComplete` event. `chartData` (used under [Chart Libraries](#chart-libraries)) reads the first dataset through `Chart.getChart(canvas)`.

```ts
// e2e/canvas/test/utils/chart-globals.spec.util.ts
import type { Page } from '@playwright/test';

import type { CanvasGlobals } from '../../common/canvas.type';

const freeze = (): void => {
  const scope: CanvasGlobals = window;

  scope.chart?.stop?.();
  window.requestAnimationFrame = (): number => 0;
};

const awaitAnimation = (): Promise<void> => {
  const scope: CanvasGlobals = window;

  return new Promise((resolve): void => {
    if (scope.chart?.isAnimating === false) return resolve();

    scope.chart?.on('animationComplete', resolve);
  });
};

const readChartData = (): number[] | undefined => {
  const scope: CanvasGlobals = window;
  const canvas = document.querySelector('canvas');

  return canvas ? scope.Chart?.getChart(canvas)?.data.datasets[0]?.data : undefined;
};

export const chartData = (page: Page): Promise<number[] | undefined> => page.evaluate(readChartData);

export const freezeAnimation = (page: Page): Promise<void> => page.evaluate(freeze);

export const waitForAnimationComplete = (page: Page): Promise<void> => page.evaluate(awaitAnimation);
```

### Screenshot Assertions

`expect(page).toHaveScreenshot` may sit in a spec step because it takes `page`; an element screenshot uses the page-object locator. Tolerance is a named const passed as the options argument. The last test swaps `freezeAnimation` for `waitForAnimationComplete` when the app must finish the animation first. Canvas output differs by anti-aliasing across machines, so the project-wide `toHaveScreenshot` defaults (`animations: 'disabled', maxDiffPixelRatio: 0.02, threshold: 0.3`) are looser than for DOM screenshots; option meanings and the `defineConfig` shape are in [visual-regression.md](visual-regression.md).

```ts
// e2e/canvas/chart.spec.ts
import type { Point, Rgba } from './common/canvas.type';
import { expect, test } from './canvas.fixture';
import { freezeAnimation } from './test/utils/chart-globals.spec.util';
import { canvasDataUrl, hasCanvasContent, pixelAt } from './test/utils/canvas-pixels.spec.util';

const SAMPLE_POINT: Point = { x: 100, y: 100 };
const PAGE_TOLERANCE = { maxDiffPixels: 100 } as const;
const CANVAS_TOLERANCE = { maxDiffPixelRatio: 0.01 } as const;

test.describe('FEATURE: chart canvas', () => {
  test.describe('GIVEN the chart page', () => {
    test.beforeEach(async ({ chartPage }): Promise<void> => {
      await test.step('GIVEN the chart page is open', (): Promise<void> => chartPage.goto());
    });

    test('the canvas holds a red pixel at 100,100', async ({ chartPage }): Promise<void> => {
      const dataUrl = await test.step('WHEN the canvas is read as a data url', (): Promise<string> => canvasDataUrl(chartPage.canvas));

      await test.step('THEN data url is a png', (): void => expect(dataUrl).toMatch(/^data:image\/png;base64,.+/));

      const pixel = await test.step('WHEN the pixel at 100,100 is read', (): Promise<Rgba> => pixelAt(chartPage.canvas, SAMPLE_POINT));

      await test.step('THEN pixel is red', (): void => expect(pixel.r).toBeGreaterThan(200));
    });

    test('the drawn chart matches the page and canvas baselines', async ({ chartPage, page }): Promise<void> => {
      await test.step('THEN canvas has content', (): Promise<void> => expect.poll((): Promise<boolean> => hasCanvasContent(chartPage.canvas)).toBe(true));

      await test.step('AND page matches dashboard.png', (): Promise<void> => expect(page).toHaveScreenshot('dashboard.png', PAGE_TOLERANCE));

      await test.step('AND canvas matches sales-chart.png', (): Promise<void> => expect(chartPage.canvas).toHaveScreenshot('sales-chart.png', CANVAS_TOLERANCE));
    });

    test('a frozen animation matches the canvas baseline', async ({ chartPage, page }): Promise<void> => {
      await test.step('WHEN the chart animation is frozen', (): Promise<void> => freezeAnimation(page));

      await test.step('THEN canvas matches frozen-chart.png', (): Promise<void> => expect(chartPage.canvas).toHaveScreenshot('frozen-chart.png'));
    });
  });
});
```

## Interaction Testing

`dragAcross` moves the mouse from one canvas-relative point to another with `mouse.down` / `mouse.move` / `mouse.up`; `pinchOut` dispatches synthetic `touchstart`, `touchmove`, and `touchend` events with two `Touch` points that spread apart, because `page.touchscreen` exposes only `tap`. Coordinates are relative to the canvas so a resize does not break the test.

```ts
// e2e/canvas/test/utils/canvas-gesture.spec.util.ts
import type { Locator, Page } from '@playwright/test';

import type { Point } from '../../common/canvas.type';
import { canvasOrigin } from './canvas-geometry.spec.util';

const dispatchPinch = (target: HTMLCanvasElement, spread: number): void => {
  const rect = target.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const touch = (identifier: number, clientX: number): Touch => new Touch({ clientX, clientY: y, identifier, target });
  const fire = (type: string, touches: Touch[]): void => {
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, targetTouches: touches, touches }));
  };

  fire('touchstart', [touch(1, x - 50), touch(2, x + 50)]);
  fire('touchmove', [touch(1, x - spread), touch(2, x + spread)]);
  fire('touchend', []);
};

export const dragAcross = async (page: Page, canvas: Locator, from: Point, to: Point, steps: number): Promise<void> => {
  const origin = await canvasOrigin(canvas);

  await page.mouse.move(origin.x + from.x, origin.y + from.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + to.x, origin.y + to.y, { steps });
  await page.mouse.up();
};

export const pinchOut = (canvas: Locator, spread: number): Promise<void> => canvas.evaluate(dispatchPinch, spread);
```

`MapPage` owns the info panel and the zoom indicator the map updates. `canvas.click({ position })` clicks at a canvas-relative offset. Touch events need `hasTouch: true` in the project `use`; a single tap is `locator.tap()`, see [mobile-testing.md](../advanced/mobile-testing.md).

```ts
// e2e/canvas/pages/map.page.ts
import type { Locator, Page } from '@playwright/test';

import type { Point } from '../common/canvas.type';
import { pinchOut } from '../test/utils/canvas-gesture.spec.util';

export class MapPage {
  public readonly canvas: Locator;
  public readonly infoPanel: Locator;
  public readonly zoomIndicator: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('canvas');
    this.infoPanel = page.locator('#info-panel');
    this.zoomIndicator = page.locator('#zoom-indicator');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/map');
  }

  public async clickAt(position: Point): Promise<void> {
    await this.canvas.click({ position });
  }

  public async pinchOut(spread: number): Promise<void> {
    await pinchOut(this.canvas, spread);
  }

  public async zoomLevel(): Promise<number> {
    const text = await this.zoomIndicator.innerText();

    return Number.parseFloat(text);
  }
}
```

`WhiteboardPage` has the same shape with `goto('/whiteboard')` and two `dragAcross` wrappers; the zoom level is polled because the map animates the change.

| Gesture | Page-object method | Body | Assertion |
|---|---|---|---|
| Click | `mapPage.clickAt(PARIS)` | `canvas.click({ position })` | `expect(mapPage.infoPanel).toContainText(...)` |
| Pinch | `mapPage.pinchOut(100)` | `pinchOut` util | `expect.poll(() => mapPage.zoomLevel()).toBeGreaterThan(1)` |
| Draw | `whiteboardPage.drawLine(from, to)` | `dragAcross(page, canvas, from, to, 10)` | `expect.poll(() => hasInk(canvas)).toBe(true)` |
| Drag a shape | `whiteboardPage.dragShape(from, to)` | `dragAcross(page, canvas, from, to, 20)` so a diagram editor registers intermediate positions | `expect(canvas).toHaveScreenshot('shape-moved.png')` |

```ts
// e2e/canvas/interaction.spec.ts
import type { Point } from './common/canvas.type';
import { expect, test } from './canvas.fixture';
import { hasInk } from './test/utils/canvas-pixels.spec.util';

const PARIS: Point = { x: 150, y: 200 };
const LINE_START: Point = { x: 50, y: 50 };
const LINE_END: Point = { x: 200, y: 200 };

test.describe('FEATURE: canvas interaction', () => {
  test.describe('GIVEN the map page', () => {
    test.beforeEach(async ({ mapPage }): Promise<void> => {
      await test.step('GIVEN the map page is open', (): Promise<void> => mapPage.goto());
    });

    test('clicking Paris names it in the info panel', async ({ mapPage }): Promise<void> => {
      await test.step('WHEN the Paris marker is clicked', (): Promise<void> => mapPage.clickAt(PARIS));

      await test.step('THEN info panel names Paris', (): Promise<void> => expect(mapPage.infoPanel).toContainText('Location: Paris'));
    });

    test('pinching out raises the zoom level above 1', async ({ mapPage }): Promise<void> => {
      await test.step('WHEN the map is pinched out by 100 pixels', (): Promise<void> => mapPage.pinchOut(100));

      await test.step('THEN zoom level is above 1', (): Promise<void> => expect.poll((): Promise<number> => mapPage.zoomLevel()).toBeGreaterThan(1));
    });
  });

  test.describe('GIVEN the whiteboard page', () => {
    test.beforeEach(async ({ whiteboardPage }): Promise<void> => {
      await test.step('GIVEN the whiteboard page is open', (): Promise<void> => whiteboardPage.goto());
    });

    test('drawing a line puts ink on the canvas', async ({ whiteboardPage }): Promise<void> => {
      await test.step('WHEN a diagonal line is drawn', (): Promise<void> => whiteboardPage.drawLine(LINE_START, LINE_END));

      await test.step('THEN canvas has ink', (): Promise<void> => expect.poll((): Promise<boolean> => hasInk(whiteboardPage.canvas)).toBe(true));
    });
  });
});
```

## WebGL Testing

`isWebglSupported` creates a detached canvas and asks for a `webgl` context, falling back to `experimental-webgl`. `hasWebglContent` reads the center pixel with `gl.readPixels` and reports whether anything was drawn. `isSceneReady` and `cameraRotationY` read the Three.js `scene` and `camera` globals.

```ts
// e2e/canvas/test/utils/webgl.spec.util.ts
import type { Locator, Page } from '@playwright/test';

import type { CanvasGlobals } from '../../common/canvas.type';

const readSupport = (): boolean => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');

  return context !== null;
};

const readHasContent = (canvas: HTMLCanvasElement): boolean => {
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');

  if (!gl) return false;

  const pixels = new Uint8Array(4);

  gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  return pixels.some((channel: number): boolean => channel > 0);
};

const readSceneReady = (): boolean => {
  const scope: CanvasGlobals = window;

  return (scope.scene?.children.length ?? 0) > 0;
};

const readCameraRotationY = (): number | undefined => {
  const scope: CanvasGlobals = window;

  return scope.camera?.rotation.y;
};

export const cameraRotationY = (page: Page): Promise<number | undefined> => page.evaluate(readCameraRotationY);

export const hasWebglContent = (canvas: Locator): Promise<boolean> => canvas.evaluate(readHasContent);

export const isSceneReady = (page: Page): Promise<boolean> => page.evaluate(readSceneReady);

export const isWebglSupported = (page: Page): Promise<boolean> => page.evaluate(readSupport);
```

`ViewerPage` has `goto('/3d-viewer')` and `orbit(deltaX)`, which reads `canvasMidpoint(this.canvas)` and calls `dragAcross(this.page, this.canvas, midpoint, { x: midpoint.x + deltaX, y: midpoint.y }, 10)`; orbit controls turn the horizontal drag into a camera rotation. WebGL output varies more between GPUs than 2D canvas output, so the screenshot tolerance is wider.

```ts
// e2e/canvas/webgl.spec.ts
import { expect, test } from './canvas.fixture';
import { cameraRotationY, hasWebglContent, isSceneReady, isWebglSupported } from './test/utils/webgl.spec.util';

const WEBGL_TOLERANCE = { maxDiffPixelRatio: 0.05 } as const;

test.describe('FEATURE: webgl viewer', () => {
  test.describe('GIVEN the 3D viewer page', () => {
    test.beforeEach(async ({ viewerPage }): Promise<void> => {
      await test.step('GIVEN the viewer page is open', (): Promise<void> => viewerPage.goto());
    });

    test('the loaded page supports WebGL', async ({ page }): Promise<void> => {
      const supported = await test.step('WHEN a webgl context is probed', (): Promise<boolean> => isWebglSupported(page));

      await test.step('THEN webgl is available', (): void => expect(supported).toBe(true));
    });

    test('the rendered scene matches 3d-scene.png', async ({ viewerPage }): Promise<void> => {
      await test.step('THEN center pixel is drawn', (): Promise<void> => expect.poll((): Promise<boolean> => hasWebglContent(viewerPage.canvas)).toBe(true));

      await test.step('AND canvas matches 3d-scene.png', (): Promise<void> => expect(viewerPage.canvas).toHaveScreenshot('3d-scene.png', WEBGL_TOLERANCE));
    });

    test('orbiting the camera changes its rotation', async ({ page, viewerPage }): Promise<void> => {
      await test.step('THEN scene has children', (): Promise<void> => expect.poll((): Promise<boolean> => isSceneReady(page)).toBe(true));

      await test.step('WHEN the camera is dragged 100 pixels to the right', (): Promise<void> => viewerPage.orbit(100));

      const rotation = await test.step('AND the camera rotation is read', (): Promise<number | undefined> => cameraRotationY(page));

      await test.step('THEN rotation is not zero', (): void => expect(rotation).not.toBe(0));
    });
  });
});
```

## Chart Libraries

Chart.js registers each instance on its canvas; `Chart.getChart(canvas)` returns it and `chartData` reads the first dataset. `expect.poll` until the data arrives replaces waiting for `window.Chart` by hand. SVG charts (D3) expose real elements: hover a bar and assert the tooltip. Canvas charts (ECharts, Chart.js) take `chartPage.clickAt(BAR_POSITION)` in the `WHEN` step instead of `hoverFirstBar()`, with the same tooltip assertion. One test per renderer replaces a branch on `bars.count()`.

```ts
// e2e/canvas/chart-libraries.spec.ts
import { expect, test } from './canvas.fixture';
import { chartData } from './test/utils/chart-globals.spec.util';

const EXPECTED_DATA = [12, 19, 3, 5, 2, 3];

test.describe('FEATURE: chart libraries', () => {
  test.describe('GIVEN the chart page', () => {
    test.beforeEach(async ({ chartPage }): Promise<void> => {
      await test.step('GIVEN the chart page is open', (): Promise<void> => chartPage.goto());
    });

    test('an initialised Chart.js matches its dataset and canvas', async ({ chartPage, page }): Promise<void> => {
      await test.step('THEN first dataset holds the expected values', (): Promise<void> => expect.poll((): Promise<number[] | undefined> => chartData(page)).toEqual(EXPECTED_DATA));

      await test.step('AND canvas matches chartjs.png', (): Promise<void> => expect(chartPage.canvas).toHaveScreenshot('chartjs.png'));
    });

    test('hovering the first D3 bar shows the tooltip', async ({ chartPage }): Promise<void> => {
      await test.step('WHEN the first bar is hovered', (): Promise<void> => chartPage.hoverFirstBar());

      await test.step('THEN tooltip is visible', (): Promise<void> => expect(chartPage.tooltip).toBeVisible());
    });
  });
});
```

## Game & Animation Testing

The game exposes `gameLoop.pause()` and `gameLoop.tick()`; `tickGame` runs the ticks inside one `evaluate` so ten frames cost one round trip. `GamePage` wraps them as `pause()`, `tick(count)`, and `score()`, and adds `pressAction()` for `page.keyboard.press('Space')`. The score is polled after the key press instead of sleeping.

```ts
// e2e/canvas/test/utils/game-globals.spec.util.ts
import type { Page } from '@playwright/test';

import type { CanvasGlobals } from '../../common/canvas.type';

const pauseLoop = (): void => {
  const scope: CanvasGlobals = window;

  scope.gameLoop?.pause();
};

const tickLoop = (count: number): void => {
  const scope: CanvasGlobals = window;

  for (let frame = 0; frame < count; frame += 1) {
    scope.gameLoop?.tick();
  }
};

const readScore = (): number | undefined => {
  const scope: CanvasGlobals = window;

  return scope.game?.score;
};

export const gameScore = (page: Page): Promise<number | undefined> => page.evaluate(readScore);

export const pauseGame = (page: Page): Promise<void> => page.evaluate(pauseLoop);

export const tickGame = (page: Page, count: number): Promise<void> => page.evaluate(tickLoop, count);
```

```ts
// e2e/canvas/game.spec.ts
import { expect, test } from './canvas.fixture';

test.describe('FEATURE: canvas game', () => {
  test.describe('GIVEN the game page', () => {
    test.beforeEach(async ({ gamePage }): Promise<void> => {
      await test.step('GIVEN the game page is open', (): Promise<void> => gamePage.goto());
    });

    test('stepping the loop matches the frame baseline', async ({ gamePage }): Promise<void> => {
      await test.step('WHEN the game loop is paused', (): Promise<void> => gamePage.pause());

      await test.step('AND one frame is advanced', (): Promise<void> => gamePage.tick(1));

      await test.step('THEN canvas matches frame-1.png', (): Promise<void> => expect(gamePage.canvas).toHaveScreenshot('frame-1.png'));
    });

    test('pressing the action key raises the score', async ({ gamePage }): Promise<void> => {
      await test.step('WHEN Space is pressed', (): Promise<void> => gamePage.pressAction());

      await test.step('THEN score is above zero', (): Promise<void> => expect.poll((): Promise<number | undefined> => gamePage.score()).toBeGreaterThan(0));
    });
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern             | Problem                  | Solution                            |
| ------------------------ | ------------------------ | ----------------------------------- |
| Pixel-perfect assertions | Fails across browsers/OS | Use maxDiffPixelRatio threshold     |
| Not waiting for render   | Blank canvas screenshots | `expect.poll` on `hasCanvasContent` |
| Testing raw pixel data   | Brittle and slow         | Use visual comparison               |
| Ignoring animation       | Flaky screenshots        | Pause/disable animations            |
| Hardcoded coordinates    | Breaks on resize         | Calculate relative to canvas bounds |

## Related References

- **Visual Testing**: See [test-suite-structure.md](../core/test-suite-structure.md) for visual regression setup
- **Mobile Gestures**: See [mobile-testing.md](../advanced/mobile-testing.md) for touch interactions
- **Performance**: See [performance-testing.md](performance-testing.md) for FPS monitoring
