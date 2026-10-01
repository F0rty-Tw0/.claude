# Component Testing

Playwright 1.62 replaced the `@playwright/experimental-ct-*` runtime with **stories and a gallery**: plain `@playwright/test` specs, the built-in `mount` fixture, and a gallery page served by your own dev server. New suites start here; existing CT suites see [Legacy experimental-ct](#legacy-experimental-ct).

## Table of Contents

1. [Model](#model)
2. [Setup & Configuration](#setup--configuration)
3. [Mounting Stories](#mounting-stories)
4. [Props & Updates](#props--updates)
5. [Callbacks & Events](#callbacks--events)
6. [Providers, Slots & Mocks](#providers-slots--mocks)
7. [Framework Notes](#framework-notes)
8. [Legacy experimental-ct](#legacy-experimental-ct)

## Model

| Piece | What it is | Owner |
|---|---|---|
| Story | A wrapper component exported from a `*.story.tsx` (or `.ts` / `.vue`) file. One named export per scenario: hard-coded props, providers, state, recorded callbacks. Runs in the browser. | `e2e/<feature>/test/stories/` |
| Gallery | One page under `playwright/gallery/`, served by the app's dev server. Exposes `window.mount({ story, props })` and `window.unmount()`, renders into `#root`. | You; framework-specific glue |
| `mount(storyId, props?)` | Built-in fixture (1.62). Navigates to `baseURL`, calls `window.mount`, returns a `Locator` for `#root` with `update(props)` and `unmount()` added. | `@playwright/test` |

Everything the component needs is set up inside the story. Everything the test asserts is observable through the page: DOM, URL, network. `props` cross the boundary as plain serializable data; callbacks never do.

## Setup & Configuration

### Gallery

The gallery is yours to own; there is no template package. `npx playwright init-skills` installs Playwright's agent skills; a coding agent with them scaffolds one for the detected framework and bundler. It must honour this contract:

| Contract | Rule |
|---|---|
| `window.mount({ story, props })` | Resolves the id to a story export (typically `import.meta.glob`), renders it with `props` into `#root`, returns a promise that rejects on an unknown story or a render throw. The rejection surfaces as the test's `mount()` throwing. |
| Root reuse | Create the framework root on the first call and render into it on every call. `update(props)` calls `window.mount` again without navigating; reusing the root is what preserves component state. |
| `window.unmount()` | Unmounts the current story. Only needed to assert teardown effects; every `mount` navigates fresh. |
| Global setup | App-wide providers, plugins, styles, and an in-browser mock worker go in the `window.mount` body. This replaces `beforeMount` / `afterMount`. |
| Story ids | The gallery owns resolution. Recommended: file path without `.story.*`, plus the export name; any unique suffix resolves. With stories under `e2e/<feature>/test/stories/`, point the glob and the id rule at `e2e/`, so `button/Default` resolves `e2e/button/test/stories/button.story.tsx` export `Default`. |

To debug a story, open the gallery URL and run `await window.mount({ story: 'button/Default' })` in the devtools console; that is the call the fixture makes.

### Configuration

Component specs end in `.test.tsx`, so the E2E config (`**/*.@(e2e|test).ts`) never collects them. `mount` navigates to `baseURL`, so `baseURL` is the gallery URL. `serviceWorkers: 'block'` keeps the app's service worker from shadowing `page.route` mocks; `reuseContext: true` (experimental) reuses the context across tests in a worker; its reset is best-effort and leaves granted permissions, geolocation, and offline state in place, so a story that sets them needs its own context. `GALLERY_URL` lives in `common/playwright.const.ts`.

```ts
// e2e/playwright-ct.config.ts
import { defineConfig, devices } from '@playwright/test';

import { GALLERY_URL } from './common/playwright.const';

const use = { ...devices['Desktop Chrome'], baseURL: GALLERY_URL, reuseContext: true, serviceWorkers: 'block' } as const;

const webServer = { command: 'npm run dev', reuseExistingServer: !process.env.CI, url: GALLERY_URL };

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  snapshotDir: './__snapshots__',
  testMatch: '**/*.test.tsx',
  use,
  webServer
});
```

Run with `npx playwright test -c e2e/playwright-ct.config.ts`. A project in the main config works the same way; give it its own `testMatch`, `baseURL`, and `use`.

### Project Structure

```text
playwright/
  gallery/
    index.html                  #root plus the entry module
    main.tsx                    window.mount / window.unmount, story glob
e2e/
  playwright-ct.config.ts
  common/
    playwright.type.ts          Mount, StoryRoot, RouteHandler
  button/
    button.test.tsx
    helpers/
      button.helper.ts
    test/
      stories/
        button.story.tsx
      utils/
        button-mount.spec.util.ts
```

`mount` is generic, so its type is read off the fixture args once and shared:

```ts
// e2e/common/playwright.type.ts
import type { PlaywrightTestArgs, Route } from '@playwright/test';

export type Mount = PlaywrightTestArgs['mount'];

export type RouteHandler = (route: Route) => Promise<void>;

export type StoryRoot = Awaited<ReturnType<Mount>>;
```

## Mounting Stories

A story file exports one component per scenario. `Default` spreads whatever data props the test passes; the label is the button's `children`.

```tsx
// e2e/button/test/stories/button.story.tsx
import type { ReactElement } from 'react';

import type { ButtonProps } from '@/components/Button';
import { Button } from '@/components/Button';

export const Default = (props: ButtonProps): ReactElement => <Button {...props} />;

export const WithIcon = (): ReactElement => <Button icon='check'>Submit</Button>;
```

A helper object in `helpers/` takes the `#root` locator `mount` returns, owns every child locator, and holds each assertion in an `expect*` method.

```ts
// e2e/button/helpers/button.helper.ts
import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class ButtonHelper {
  public readonly button: Locator;
  public readonly icon: Locator;

  public constructor(root: Locator) {
    this.button = root.getByRole('button');
    this.icon = root.locator('svg');
  }

  public async click(): Promise<void> {
    await this.button.click();
  }

  public async expectText(text: string): Promise<void> {
    await expect(this.button).toContainText(text);
  }

  public async expectVariant(variant: string): Promise<void> {
    await expect(this.button).toHaveClass(new RegExp(variant));
  }

  public async expectIcon(): Promise<void> {
    await expect(this.icon).toBeVisible();
  }
}
```

The mount util makes the opening step one call. `mount<typeof Default>` type-checks `props` against the story's signature; the type-only import is erased, so the spec never loads JSX.

```ts
// e2e/button/test/utils/button-mount.spec.util.ts
import type { ButtonProps } from '@/components/Button';

import type { Mount } from '../../../common/playwright.type';
import { ButtonHelper } from '../../helpers/button.helper';
import type { Default } from '../stories/button.story';

export const mountButton = async (mount: Mount, props: ButtonProps): Promise<ButtonHelper> => {
  const root = await mount<typeof Default>('button/Default', props);

  return new ButtonHelper(root);
};
```

No fixture file exists for component specs, so the spec imports `test` from `@playwright/test`. Props are a typed const above the first step.

```tsx
// e2e/button/button.test.tsx
import { test } from '@playwright/test';

import type { ButtonProps } from '@/components/Button';

import type { ButtonHelper } from './helpers/button.helper';
import { mountButton } from './test/utils/button-mount.spec.util';

test.describe('FEATURE: button', () => {
  test('GIVEN a label, mounting renders it', async ({ mount }): Promise<void> => {
    const props: ButtonProps = { children: 'Click me' };
    const button = await test.step('WHEN the default story is mounted', (): Promise<ButtonHelper> => mountButton(mount, props));

    await test.step('THEN the label reads Click me', (): Promise<void> => button.expectText('Click me'));
  });

  test('GIVEN primary large props, mounting applies both variant classes', async ({ mount }): Promise<void> => {
    const props: ButtonProps = { children: 'Submit', size: 'large', variant: 'primary' };
    const button = await test.step('WHEN the default story is mounted', (): Promise<ButtonHelper> => mountButton(mount, props));

    await test.step('THEN the primary class is applied', (): Promise<void> => button.expectVariant('primary'));

    await test.step('AND the large class is applied', (): Promise<void> => button.expectVariant('large'));
  });
});
```

| Variant | Shape |
|---|---|
| Prop matrix | A `for` loop over an `as const` tuple, one `test` per value, title and step interpolating it; each passes `{ variant }` to `mountButton`. |
| Fixed composition (icon, children tree) | Its own story export (`WithIcon`), mounted by id with no props. A JSX tree never crosses from the spec. |
| Visual diff | `expect(root).toHaveScreenshot()` inside an `expect*` helper method, on the `#root` locator, not the page. |

## Props & Updates

`update(props)` re-renders the same story with new props without remounting, so component state survives. The helper keeps the `StoryRoot` (the augmented locator) and owns `update`; the spec step stays one call. Internal state is asserted through the DOM, never through an instance.

```ts
// e2e/counter/helpers/counter.helper.ts
import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';

import type { CounterProps } from '@/components/Counter';

import type { StoryRoot } from '../../common/playwright.type';

export class CounterHelper {
  public readonly count: Locator;
  public readonly incrementButton: Locator;

  private readonly root: StoryRoot;

  public constructor(root: StoryRoot) {
    this.root = root;
    this.count = root.getByTestId('count');
    this.incrementButton = root.getByRole('button', { name: '+' });
  }

  public async increment(): Promise<void> {
    await this.incrementButton.click();
  }

  public async update(props: CounterProps): Promise<void> {
    await this.root.update(props);
  }

  public async expectCount(count: number): Promise<void> {
    await expect(this.count).toHaveText(String(count));
  }
}
```

`mountCounter(mount, props)` in `test/utils/counter-mount.spec.util.ts` has the `mountButton` shape over `counter/Default`.

```tsx
// e2e/counter/counter.test.tsx
import { test } from '@playwright/test';

import type { CounterHelper } from './helpers/counter.helper';
import { mountCounter } from './test/utils/counter-mount.spec.util';

test.describe('FEATURE: counter', () => {
  test('GIVEN a step of 1, raising the step prop keeps the count already reached', async ({ mount }): Promise<void> => {
    const counter = await test.step('WHEN the counter is mounted', (): Promise<CounterHelper> => mountCounter(mount, { step: 1 }));

    await test.step('AND + is clicked', (): Promise<void> => counter.increment());

    await test.step('THEN the count reads 1', (): Promise<void> => counter.expectCount(1));

    await test.step('WHEN the step prop is updated to 5', (): Promise<void> => counter.update({ step: 5 }));

    await test.step('AND + is clicked', (): Promise<void> => counter.increment());

    await test.step('THEN the count reads 6', (): Promise<void> => counter.expectCount(6));
  });
});
```

## Callbacks & Events

A callback cannot cross from Node to the browser. The story owns the state, provides the callback, and records each payload into a hidden input; the test asserts the recorded value with `toHaveValue`, which retries until the state lands. `Credentials` is named in `common/login-form.type.ts`.

```tsx
// e2e/login-form/test/stories/login-form.story.tsx
import type { ReactElement } from 'react';
import { useState } from 'react';

import { LoginForm } from '@/components/LoginForm';

import type { Credentials } from '../../common/login-form.type';

export const Recorded = (): ReactElement => {
  const [submissions, setSubmissions] = useState<Credentials[]>([]);
  const recorded = JSON.stringify(submissions);
  const record = (credentials: Credentials): void => {
    const next = [...submissions, credentials];

    setSubmissions(next);
  };

  return (
    <>
      <LoginForm onSubmit={record} />
      <form hidden>
        <input data-testid='submissions' readOnly value={recorded} />
      </form>
    </>
  );
};
```

`LoginFormHelper` gains `submissions` (`root.getByTestId('submissions')`) and `expectSubmissions(expected: Credentials[])`, which asserts `toHaveValue` against `JSON.stringify(expected)`. The spec mounts `login-form/Recorded`, submits `CREDENTIALS_STUB`, and checks `'THEN the form recorded the credentials once'` with `form.expectSubmissions([CREDENTIALS_STUB])`. The negative case is the same shape: act, then assert the recorded value did not change.

| Interaction | Story records | Helper assertion |
|---|---|---|
| Click count | `onClick` increments a counter into `data-testid='clicks'` | `toHaveValue('1')` |
| Select payload | `onChange` value into `data-testid='selected'` | `toHaveValue('b')` |
| Keyboard navigation | Nothing extra; the trigger shows the selection | `pickSecondByKeyboard()` presses `ArrowDown` twice and `Enter`; `expectSelected('Banana')` asserts `toHaveText` |

## Providers, Slots & Mocks

| Need | Where it goes |
|---|---|
| App-wide providers (theme, query client, i18n, store) and global CSS | The gallery's `window.mount` body, wrapping every story. |
| A provider for some stories only | A shared `decorator` component next to the gallery; the story wraps itself in it. |
| Per-test variation (feature flag, route, initial user) | A data prop the story or decorator reads: `mount('feature-banner/Default', { newFeature: true })`. Replaces `hooksConfig`. |
| Children, slots, render props, refs | One story export per composition. A render prop or ref lives inside the story, where it runs in the browser. |
| API calls on mount | `page.route` before `mount`, since `mount` navigates. The mount util routes, so the route is part of the opening call. |
| Browser globals (`analytics`, `featureFlags`) | Installed in `window.mount` or the story, from props. |

A component that fetches on mount: the util takes `page` and routes the stub-defaulted mock first. `User` is in `common/user-profile.type.ts`; `userMock(user)` in `test/mocks/user.mock.ts` has the `sessionMock` shape from [house-style.md](../core/house-style.md#test-data-and-mocks).

```ts
// e2e/user-profile/test/utils/user-profile-mount.spec.util.ts
import type { Page } from '@playwright/test';

import type { Mount } from '../../../common/playwright.type';
import type { User } from '../../common/user-profile.type';
import { UserProfileHelper } from '../../helpers/user-profile.helper';
import { userMock } from '../mocks/user.mock';

export const mountUserProfile = async (mount: Mount, page: Page, user: User): Promise<UserProfileHelper> => {
  await page.route('**/api/users/*', userMock(user));
  const root = await mount('user-profile/Default', { userId: user.id });

  return new UserProfileHelper(root);
};
```

The spec's opening step is `'WHEN the profile is mounted'` with `mountUserProfile(mount, page, USER_STUB)`; the title names the state (`'GIVEN a stubbed user api, mounting shows the user name'`).

## Framework Notes

The gallery's `window.mount` is the only framework-specific code. Specs, helpers, and utils are identical across frameworks.

| Framework | Story file | Notes |
|---|---|---|
| React | `*.story.tsx`, named exports | The gallery reuses one `createRoot` so `update` reconciles. |
| Vue | `*.story.ts` exporting `defineComponent` stories, or `*.story.vue` (one story, default export, id is the path alone) | The gallery mounts a reactive host once and swaps a `shallowRef` story and props; recreating the app resets state on `update`. Pinia and Vue Router install in `window.mount`. `v-model`: a stateful story binds it and records `modelValue` into a hidden input. Slots: a `.story.vue` per composition. |
| Svelte, Solid, others | Whatever the dev server compiles | Same contract; only the gallery's render call differs. |

## Legacy experimental-ct

| Package | Status |
|---|---|
| `@playwright/experimental-ct-react`, `-react17`, `-vue` | No longer updated since 1.62. |
| `@playwright/experimental-ct-svelte` | Removed in 1.59. |
| `@playwright/experimental-ct-vue2`, `-solid` | No longer updated since 1.49. |

Existing suites keep running on a pinned Playwright version and get no fixes. Migrate with the [official guide](https://playwright.dev/docs/test-components#migration-from-the-experimental-packages): keep the old CT config running until the last spec is ported, then drop the package, `playwright/index.html`, `playwright/index.ts*`, and the version pin.

| experimental-ct | Stories |
|---|---|
| `mount(<Button onClick={spy} />)` | Stateful story recording into a hidden input; helper asserts `toHaveValue` |
| JSX children or slots from the spec | One story export per composition |
| `update(<Counter step={5} />)` | `update({ step: 5 })` |
| `beforeMount` / `afterMount`, `hooksConfig` | Gallery `window.mount` body; per-test variation as props |
| `ctViteConfig`, `ctPort`, `ctTemplateDir` | Gone; the app's dev server serves the gallery, port lives in `webServer` and `baseURL` |
| `defineConfig` from the CT package | `defineConfig` from `@playwright/test` |

Story ids are strings: a rename breaks specs at run time, and suffix matching can resolve a different story after one. Keep ids unique per feature folder.

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|---|---|---|
| Passing a callback or JSX through `mount` props | Props are serialized; functions and elements do not survive | Record into a hidden input inside a story; one story per composition |
| `page.getByRole` on a component spec | The gallery page holds only `#root`, but the spec now knows the DOM | Helper object built from the `mount` root |
| Routing after `mount` | `mount` navigates; the component already fetched | Route in the mount util before `mount` |
| Testing implementation details | Brittle tests | Assert what the DOM shows or the story recorded |
| New suite on `@playwright/experimental-ct-*` | Frozen packages, no fixes | Stories and the built-in `mount` |
| Skipping accessibility | Misses real issues | Aria snapshots or axe on the `#root` locator; see [accessibility.md](accessibility.md) |

## Related References

- **Accessibility**: See [accessibility.md](accessibility.md) for a11y testing in components
- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for shared test setup
- **React / Vue**: See [react.md](../frameworks/react.md) and [vue.md](../frameworks/vue.md) for framework-specific stories
