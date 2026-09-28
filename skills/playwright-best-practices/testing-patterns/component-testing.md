# Component Testing

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Mounting Components](#mounting-components)
3. [Props & State Testing](#props--state-testing)
4. [Events & Interactions](#events--interactions)
5. [Slots & Children](#slots--children)
6. [Mocking Dependencies](#mocking-dependencies)
7. [Framework-Specific Patterns](#framework-specific-patterns)

## Setup & Configuration

### Installation

One command scaffolds React, Vue, Svelte, or Solid; the prompt picks the framework.

```bash
npm init playwright@latest -- --ct
```

### Configuration

Every nested object is a named const. `ctViteConfig` carries the `@` alias, resolved from the config's folder (a bare `'/src'` means the filesystem root to Vite), so component imports match the app. Specs end in `.test.tsx`; the E2E config collects `**/*.@(e2e|test).ts`, so it never runs them. The config sits in `e2e/`, so it sets no `testDir` and `snapshotDir` is relative to that folder.

```ts
// e2e/playwright-ct.config.ts
import { resolve as resolvePath } from 'node:path';

import { defineConfig, devices } from '@playwright/experimental-ct-react';

const alias = { '@': resolvePath(__dirname, '../src') };

const resolve = { alias };

const ctViteConfig = { resolve };

const use = { ctPort: 3100, ctViteConfig } as const;

const projects = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] }
];

export default defineConfig({
  projects,
  snapshotDir: './__snapshots__',
  testMatch: '**/*.test.tsx',
  use
});
```

### Project Structure

`e2e/playwright/index.html` and `e2e/playwright/index.tsx` are the CT entry point and setup (providers, styles, hooks); CT looks for the `playwright/` folder next to its config. The setup file nests providers in JSX, so it is `.tsx` and `index.html` loads `./index.tsx`. Each component gets a feature folder: the spec, a helper object in `helpers/`, and a `.tsx` mount util in `test/utils/`.

```text
src/
  components/
    Button.tsx
    Counter.tsx
e2e/
  playwright-ct.config.ts
  button/
    button.test.tsx
    helpers/
      button.helper.ts
    test/
      utils/
        button-mount.spec.util.tsx
  playwright/
    index.html
    index.tsx
```

## Mounting Components

### Basic Mount

`mount` returns a `MountResult`: a `Locator` with `update` and `unmount`. A helper object in `helpers/` takes that root, owns every child locator, and holds each assertion in an `expect*` method as a plain `await expect(…)` line; only the spec opens steps. A mount util in `test/utils/` renders the component as JSX, so the mount step is one call. React CT mounts JSX only: the CT transform rewrites JSX in the spec and in every `.tsx` file it imports, so the util is a `.tsx` file. `ButtonProps` is the component's exported props type; the label is its `children`.

```ts
// e2e/button/helpers/button.helper.ts
import { expect } from '@playwright/experimental-ct-react';
import type { Locator } from '@playwright/test';

export class ButtonHelper {
  public readonly icon: Locator;

  private readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.icon = root.locator('svg');
  }

  public async click(): Promise<void> {
    await this.root.click();
  }

  public async expectText(text: string): Promise<void> {
    await expect(this.root).toContainText(text);
  }

  public async expectVariant(variant: string): Promise<void> {
    await expect(this.root).toHaveClass(new RegExp(variant));
  }

  public async expectIcon(): Promise<void> {
    await expect(this.icon).toBeVisible();
  }
}
```

```tsx
// e2e/button/test/utils/button-mount.spec.util.tsx
import type { ComponentFixtures } from '@playwright/experimental-ct-react';

import type { ButtonProps } from '@/components/Button';
import { Button } from '@/components/Button';

import { ButtonHelper } from '../../helpers/button.helper';

type Mount = ComponentFixtures['mount'];

export const mountButton = async (mount: Mount, props: ButtonProps, label: string): Promise<ButtonHelper> => {
  const root = await mount(<Button {...props}>{label}</Button>);

  return new ButtonHelper(root);
};
```

### Mount with Props

No fixture file exists for CT, so the spec imports `test` from the CT package. Props are a typed const above the first step.

```tsx
// e2e/button/button.test.tsx
import { test } from '@playwright/experimental-ct-react';

import type { ButtonProps } from '@/components/Button';

import type { ButtonHelper } from './helpers/button.helper';
import { mountButton } from './test/utils/button-mount.spec.util';

test.describe('FEATURE: button', () => {
  test('GIVEN default props, mounting renders the label', async ({ mount }): Promise<void> => {
    const button = await test.step('WHEN the button is mounted', (): Promise<ButtonHelper> => mountButton(mount, {}, 'Click me'));

    await test.step('THEN the label reads Click me', (): Promise<void> => button.expectText('Click me'));
  });

  test('GIVEN a primary large button with an icon, mounting renders the variant classes and the icon', async ({ mount }): Promise<void> => {
    const props: ButtonProps = { icon: 'check', size: 'large', variant: 'primary' };

    const button = await test.step('WHEN the button is mounted', (): Promise<ButtonHelper> => mountButton(mount, props, 'Submit'));

    await test.step('THEN the primary class is applied', (): Promise<void> => button.expectVariant('primary'));

    await test.step('AND the large class is applied', (): Promise<void> => button.expectVariant('large'));

    await test.step('AND the icon is visible', (): Promise<void> => button.expectIcon());
  });
});
```

### Mount with Wrapper/Provider

Global providers live in the CT setup file, `e2e/playwright/index.tsx`. `beforeMount` receives the component as `App` and returns it nested in the providers as JSX; `hooksConfig` is the per-test object a spec passes to `mount`, typed once in `e2e/common/hooks-config.type.ts`. The same hook installs browser globals a component reads (`analyticsMock()` in `e2e/test/mocks/analytics.mock.ts` returns no-op `track` and `identify`).

```ts
// e2e/common/hooks-config.type.ts
export type FeatureFlags = {
  readonly newFeature: boolean;
};

export type HooksConfig = {
  readonly featureFlags?: FeatureFlags;
};
```

```tsx
// e2e/playwright/index.tsx
import { beforeMount } from '@playwright/experimental-ct-react/hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { ThemeProvider } from '@/providers/theme';
import '@/styles/globals.css';

import type { HooksConfig } from '../e2e/common/hooks-config.type';
import { analyticsMock } from '../e2e/test/mocks/analytics.mock';

const queryClient = new QueryClient();

beforeMount<HooksConfig>(async ({ App, hooksConfig }): Promise<ReactElement> => {
  Object.assign(window, { analytics: analyticsMock(), featureFlags: hooksConfig?.featureFlags });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  );
});
```

| Variant | Where |
|---|---|
| Per-test provider (`AuthProvider` around `UserProfile`) | The `.tsx` mount util nests `<AuthProvider initialUser={initialUser}><UserProfile /></AuthProvider>`; the spec passes the user. |
| Global styles | `import '@/styles/globals.css'` in `e2e/playwright/index.tsx`, as above. |

## Props & State Testing

### Testing Prop Variations

A `for` loop over an `as const` tuple generates one `test` per variant. The title interpolates the variant so each case names itself.

```tsx
// e2e/button/button-variants.test.tsx
import { test } from '@playwright/experimental-ct-react';

import type { ButtonHelper } from './helpers/button.helper';
import { mountButton } from './test/utils/button-mount.spec.util';

const VARIANTS = ['danger', 'ghost', 'primary', 'secondary'] as const;

test.describe('FEATURE: button variants', () => {
  for (const variant of VARIANTS) {
    test(`GIVEN the ${variant} variant, mounting applies the ${variant} class`, async ({ mount }): Promise<void> => {
      const button = await test.step(`WHEN the ${variant} button is mounted`, (): Promise<ButtonHelper> => mountButton(mount, { variant }, 'Button'));

      await test.step(`THEN the ${variant} class is applied`, (): Promise<void> => button.expectVariant(variant));
    });
  }
});
```

### Updating Props and Internal State

`MountResult.update` re-renders with a new JSX element. It ignores anything else: a non-JSX argument re-renders the original element and drops the new props without an error. The helper object keeps the root as `MountResult` and owns `update`, so it is a `.helper.tsx` file and the spec step stays one call. Internal state is asserted through the DOM (`aria-checked`, text), never through the instance. `mountCounter(mount, props)` in `test/utils/counter-mount.spec.util.tsx` has the `mountButton` shape and returns a `CounterHelper`.

```tsx
// e2e/counter/helpers/counter.helper.tsx
import type { MountResult } from '@playwright/experimental-ct-react';
import { expect } from '@playwright/experimental-ct-react';
import type { Locator } from '@playwright/test';

import type { CounterProps } from '@/components/Counter';
import { Counter } from '@/components/Counter';

export class CounterHelper {
  public readonly count: Locator;
  public readonly incrementButton: Locator;

  private readonly root: MountResult;

  public constructor(root: MountResult) {
    this.root = root;
    this.count = root.getByTestId('count');
    this.incrementButton = root.getByRole('button', { name: '+' });
  }

  public async increment(): Promise<void> {
    await this.incrementButton.click();
  }

  public async update(props: CounterProps): Promise<void> {
    await this.root.update(<Counter {...props} />);
  }

  public async expectCount(count: number): Promise<void> {
    await expect(this.count).toHaveText(String(count));
  }
}
```

```tsx
// e2e/counter/counter.test.tsx
import { test } from '@playwright/experimental-ct-react';

import type { CounterHelper } from './helpers/counter.helper';
import { mountCounter } from './test/utils/counter-mount.spec.util';

test.describe('FEATURE: counter', () => {
  test('GIVEN a count of 0, updating initialCount to 10 makes the count read 10', async ({ mount }): Promise<void> => {
    const counter = await test.step('WHEN the counter is mounted', (): Promise<CounterHelper> => mountCounter(mount, { initialCount: 0 }));

    await test.step('THEN the count reads 0', (): Promise<void> => counter.expectCount(0));

    await test.step('WHEN initialCount is updated to 10', (): Promise<void> => counter.update({ initialCount: 10 }));

    await test.step('THEN the count reads 10', (): Promise<void> => counter.expectCount(10));
  });

  test('GIVEN a count of 0, clicking + makes the count read 1', async ({ mount }): Promise<void> => {
    const counter = await test.step('WHEN the counter is mounted', (): Promise<CounterHelper> => mountCounter(mount, { initialCount: 0 }));

    await test.step('AND + is clicked', (): Promise<void> => counter.increment());

    await test.step('THEN the count reads 1', (): Promise<void> => counter.expectCount(1));
  });
});
```

| Variant | Helper-object method body |
|---|---|
| Controlled input | `fill('hello')` on the input, then `update` with `value: 'hello'`; the spec asserts `toHaveValue('hello')` through `expectValue`. |
| Toggle with `role="switch"` | `click()` on the root; `expectChecked(true)` asserts `toHaveAttribute('aria-checked', 'true')` on `root.getByRole('switch')`. |

## Events & Interactions

### Testing Callbacks and Payloads

Callback props are recorded into a typed array the spec owns. `recordInto` in the mount util returns a handler that pushes each payload; the assertion step compares the array. `Credentials` and `SubmitHandler` are named in `common/login-form.type.ts`; `CREDENTIALS_STUB` is in `test/stubs/login-form.stub.ts`.

```ts
// e2e/login-form/helpers/login-form.helper.ts
import type { Locator } from '@playwright/test';

import type { Credentials } from '../common/login-form.type';

export class LoginFormHelper {
  public readonly emailInput: Locator;
  public readonly passwordInput: Locator;
  public readonly submitButton: Locator;

  private readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.emailInput = root.getByLabel('Email');
    this.passwordInput = root.getByLabel('Password');
    this.submitButton = root.getByRole('button', { name: 'Sign in' });
  }

  public async submit(credentials: Credentials): Promise<void> {
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.submitButton.click();
  }
}
```

```tsx
// e2e/login-form/test/utils/login-form-mount.spec.util.tsx
import type { ComponentFixtures } from '@playwright/experimental-ct-react';

import { LoginForm } from '@/components/LoginForm';

import type { Credentials, SubmitHandler } from '../../common/login-form.type';
import { LoginFormHelper } from '../../helpers/login-form.helper';

type Mount = ComponentFixtures['mount'];

export const recordInto = (submissions: Credentials[]): SubmitHandler => {
  return (data: Credentials): void => {
    submissions.push(data);
  };
};

export const mountLoginForm = async (mount: Mount, onSubmit: SubmitHandler): Promise<LoginFormHelper> => {
  const root = await mount(<LoginForm onSubmit={onSubmit} />);

  return new LoginFormHelper(root);
};
```

```tsx
// e2e/login-form/login-form.test.tsx
import { expect, test } from '@playwright/experimental-ct-react';

import type { Credentials } from './common/login-form.type';
import type { LoginFormHelper } from './helpers/login-form.helper';
import { CREDENTIALS_STUB } from './test/stubs/login-form.stub';
import { mountLoginForm, recordInto } from './test/utils/login-form-mount.spec.util';

test.describe('FEATURE: login form', () => {
  test('GIVEN valid credentials, submitting them passes them to onSubmit once', async ({ mount }): Promise<void> => {
    const submissions: Credentials[] = [];
    const form = await test.step('WHEN the form is mounted', (): Promise<LoginFormHelper> => mountLoginForm(mount, recordInto(submissions)));

    await test.step('AND credentials are submitted', (): Promise<void> => form.submit(CREDENTIALS_STUB));

    await test.step('THEN onSubmit received the credentials once', (): void => expect(submissions).toEqual([CREDENTIALS_STUB]));
  });
});
```

| Interaction | Helper-object method body | Spec assertion |
|---|---|---|
| Click event | `this.root.click()` with `onClick` recorded through `recordInto` | `expect(clicks).toHaveLength(1)` |
| Select payload | `this.root.getByRole('combobox').click()` then `this.root.getByRole('option', { name }).click()` | `expect(values).toEqual(['b'])` |
| Keyboard navigation | `this.trigger.click()`, then `this.root.press('ArrowDown')` twice and `this.root.press('Enter')` in `pickSecondByKeyboard()` | `expectSelected('Banana')` asserts `toHaveText` on the trigger |

## Slots & Children

### Testing Named Slots (Vue)

Vue's `mount` takes a `slots` option keyed by slot name with HTML strings. The slot set is a typed stub so a spec overrides one slot at a time.

```ts
// e2e/modal/test/stubs/modal.stub.ts
import type { ModalSlots } from '../../common/modal.type';

export const MODAL_SLOTS_STUB: ModalSlots = {
  default: '<p>Modal content</p>',
  footer: '<button>Close</button>',
  header: '<h2>Modal Title</h2>'
};
```

```ts
// e2e/modal/test/utils/modal-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-vue';

import Modal from '@/components/Modal.vue';

import type { ModalSlots } from '../../common/modal.type';
import { ModalHelper } from '../../helpers/modal.helper';

type Mount = ComponentFixtures['mount'];

export const mountModal = async (mount: Mount, slots: ModalSlots): Promise<ModalHelper> => {
  const root = await mount(Modal, { slots });

  return new ModalHelper(root);
};
```

```tsx
// e2e/modal/modal.test.tsx
import { test } from '@playwright/experimental-ct-vue';

import type { ModalHelper } from './helpers/modal.helper';
import { MODAL_SLOTS_STUB } from './test/stubs/modal.stub';
import { mountModal } from './test/utils/modal-mount.spec.util';

test.describe('FEATURE: modal slots', () => {
  test('GIVEN all slots filled, mounting renders each slot', async ({ mount }): Promise<void> => {
    const modal = await test.step('WHEN the modal is mounted', (): Promise<ModalHelper> => mountModal(mount, MODAL_SLOTS_STUB));

    await test.step('THEN the heading reads Modal Title', (): Promise<void> => modal.expectHeading('Modal Title'));

    await test.step('AND the footer button reads Close', (): Promise<void> => modal.expectButton('Close'));
  });
});
```

`ModalHelper` exposes `heading` (`root.getByRole('heading')`) and `closeButton` (`root.getByRole('button')`) and asserts them in `expectHeading` / `expectButton` as plain `await expect(…)` lines.

| Variant | Mount util body |
|---|---|
| React children | `<Card><h2>Title</h2><p>Description</p></Card>`; the helper object asserts `getByRole('heading')` and `getByText('Description')`. |
| Render prop | A function child runs in the test process, so the browser gets a promise back and React renders nothing. A story component in `test/stories/data-fetcher.story.tsx` renders `<DataFetcher url={url}>{renderUser}</DataFetcher>` in the browser, where `renderUser` returns a `Loading...` span while `loading` and the name span after; the util mounts `<DataFetcherStory url={url} />`. Assert `Loading...` visible, then the name visible. |

## Mocking Dependencies

### Mocking Imports

`e2e/playwright/index.tsx` above installs globals and reads `hooksConfig` in `beforeMount`. A spec passes `hooksConfig` through the mount util; the generic on `mount` types it.

```tsx
// e2e/feature-banner/test/utils/feature-banner-mount.spec.util.tsx
import type { ComponentFixtures } from '@playwright/experimental-ct-react';

import { FeatureBanner } from '@/components/FeatureBanner';

import type { HooksConfig } from '../../../common/hooks-config.type';
import { FeatureBannerHelper } from '../../helpers/feature-banner.helper';

type Mount = ComponentFixtures['mount'];

export const mountFeatureBanner = async (mount: Mount, hooksConfig: HooksConfig): Promise<FeatureBannerHelper> => {
  const root = await mount<HooksConfig>(<FeatureBanner />, { hooksConfig });

  return new FeatureBannerHelper(root);
};
```

```tsx
// e2e/feature-banner/feature-banner.test.tsx
import { test } from '@playwright/experimental-ct-react';

import type { FeatureFlags, HooksConfig } from '../common/hooks-config.type';
import type { FeatureBannerHelper } from './helpers/feature-banner.helper';
import { mountFeatureBanner } from './test/utils/feature-banner-mount.spec.util';

test.describe('FEATURE: feature banner', () => {
  test('GIVEN the newFeature flag on, mounting shows the new feature text', async ({ mount }): Promise<void> => {
    const featureFlags: FeatureFlags = { newFeature: true };
    const hooksConfig: HooksConfig = { featureFlags };
    const banner = await test.step('WHEN the banner is mounted', (): Promise<FeatureBannerHelper> => mountFeatureBanner(mount, hooksConfig));

    await test.step('THEN the new feature text is shown', (): Promise<void> => banner.expectText('New Feature'));
  });
});
```

### Mocking API Calls

A component that fetches on mount needs the route installed before `mount`. The handler is a factory in `test/mocks/`; the mount util `mountUserProfile(mount, page, user)` routes `userMock(user)` on `page` before it mounts with `user.id`, so the route is part of the opening call and no step or hook installs it. `User` is named in `common/user-profile.type.ts`; `USER_STUB` is in `test/stubs/user.stub.ts`.

```ts
// e2e/user-profile/test/mocks/user.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { User } from '../../common/user-profile.type';
import { USER_STUB } from '../stubs/user.stub';

export const userMock = (user: User = USER_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: user });
};
```

```tsx
// e2e/user-profile/user-profile.test.tsx
import { test } from '@playwright/experimental-ct-react';

import type { UserProfileHelper } from './helpers/user-profile.helper';
import { USER_STUB } from './test/stubs/user.stub';
import { mountUserProfile } from './test/utils/user-profile-mount.spec.util';

test.describe('FEATURE: user profile', () => {
  test('GIVEN a stubbed user api, mounting shows the user name', async ({ mount, page }): Promise<void> => {
    const profile = await test.step('WHEN the profile is mounted', (): Promise<UserProfileHelper> => mountUserProfile(mount, page, USER_STUB));

    await test.step('THEN the user name is shown', (): Promise<void> => profile.expectName(USER_STUB.name));
  });
});
```

### Mocking Hooks

A custom hook that reads a global is mocked the same way as a feature flag: add the field to `HooksConfig` (`readonly mockAuth?: AuthState`), have `beforeMount` assign it to the global the hook reads, and pass it through `hooksConfig` in the mount util. The spec then asserts on the rendered result (`Admin Panel` visible), not on the hook.

## Framework-Specific Patterns

| Framework | Package | Mount signature | Notes |
|---|---|---|---|
| React | `@playwright/experimental-ct-react` | `mount(<Comp {...props} />)` in a `.tsx` mount util | Refs: a callback ref runs in the test process and receives the string `ref: <Node>`, not the element; assert what the ref drives (focus, scroll) through the helper object. Context: the mount util nests `<UserContext.Provider value={value}><UserGreeting /></UserContext.Provider>`. |
| Vue | `@playwright/experimental-ct-vue` | `mount(Comp, { props, slots, on })` | `v-model` binds through `modelValue` plus an `'onUpdate:modelValue'` listener in `props`. |
| Svelte | `@playwright/experimental-ct-svelte` | `mount(Comp, { props })` | Same helper-object and mount-util shape; `on` carries event listeners. |
| Solid | `@playwright/experimental-ct-solid` (last published at 1.48.2; no newer release) | `mount(<Comp {...props} />)` in a `.tsx` mount util | Same shape as React: JSX only. |

### Vue v-model

The listener key needs quotes, so it stays in the props object; the mount util owns it.

```ts
// e2e/text-input/test/utils/text-input-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-vue';

import TextInput from '@/components/TextInput.vue';

import type { ModelListener } from '../../common/text-input.type';
import { TextInputHelper } from '../../helpers/text-input.helper';

type Mount = ComponentFixtures['mount'];

export const mountTextInput = async (mount: Mount, modelValue: string, onUpdate: ModelListener): Promise<TextInputHelper> => {
  const props = { modelValue, 'onUpdate:modelValue': onUpdate };
  const root = await mount(TextInput, { props });

  return new TextInputHelper(root);
};
```

```tsx
// e2e/text-input/text-input.test.tsx
import { expect, test } from '@playwright/experimental-ct-vue';

import type { TextInputHelper } from './helpers/text-input.helper';
import { mountTextInput } from './test/utils/text-input-mount.spec.util';

test.describe('FEATURE: text input v-model', () => {
  test('GIVEN an empty model, typing text emits update:modelValue with the text', async ({ mount }): Promise<void> => {
    const values: string[] = [];
    const onUpdate = (value: string): number => values.push(value);
    const input = await test.step('WHEN the input is mounted', (): Promise<TextInputHelper> => mountTextInput(mount, '', onUpdate));

    await test.step('AND test is typed', (): Promise<void> => input.fill('test'));

    await test.step('THEN the model received test', (): void => expect(values).toEqual(['test']));
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                   | Problem             | Solution                          |
| ------------------------------ | ------------------- | --------------------------------- |
| Testing implementation details | Brittle tests       | Test behavior, not internal state |
| Snapshot testing everything    | Maintenance burden  | Use for visual regression only    |
| Not isolating components       | Hidden dependencies | Mock all external dependencies    |
| Testing framework behavior     | Redundant           | Focus on your component logic     |
| Skipping accessibility         | Misses real issues  | Include a11y checks in CT         |
| `createElement` or object notation for React | `mount` throws `Object mount notation is not supported`; `update` keeps the old element | JSX in a `.tsx` mount util; spec passes props |

## Related References

- **Accessibility**: See [accessibility.md](accessibility.md) for a11y testing in components
- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for shared test setup
- **React / Vue**: See [react.md](../frameworks/react.md) and [vue.md](../frameworks/vue.md) for full helper-object classes
