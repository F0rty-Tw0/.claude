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

Every nested object is a named const. `ctViteConfig` carries the `@` alias so component imports match the app. Specs end in `.ct.ts` so they never run under the E2E config.

```ts
// e2e/playwright-ct.config.ts
import { defineConfig, devices } from '@playwright/experimental-ct-react';

const alias = { '@': '/src' };

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
  snapshotDir: './e2e/__snapshots__',
  testDir: './e2e',
  testMatch: '**/*.ct.ts',
  use
});
```

### Project Structure

`playwright/index.html` and `playwright/index.ts` are the CT entry point and setup (providers, styles, hooks). Each component gets a feature folder: the spec, a component object in `components/`, and a mount util in `test/utils/`.

```text
src/
  components/
    Button.tsx
    Counter.tsx
e2e/
  playwright-ct.config.ts
  button/
    button.ct.ts
    components/
      button.component.ts
    test/
      utils/
        button-mount.spec.util.ts
playwright/
  index.html
  index.ts
```

## Mounting Components

### Basic Mount

`mount` returns a `MountResult`: a `Locator` with `update` and `unmount`. A component object in `components/` takes that root, owns every child locator, and wraps each assertion in a boxed step. A mount util in `test/utils/` builds the element with `createElement`, so the file stays `.ts` and the mount step is one call. `ButtonProps` is the component's exported props type.

```ts
// e2e/button/components/button.component.ts
import { expect, test } from '@playwright/experimental-ct-react';
import type { Locator } from '@playwright/test';

export class ButtonComponent {
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
    await test.step(`button reads ${text}`, (): Promise<void> => expect(this.root).toContainText(text), { box: true });
  }

  public async expectVariant(variant: string): Promise<void> {
    await test.step(`button has the ${variant} class`, (): Promise<void> => expect(this.root).toHaveClass(new RegExp(variant)), { box: true });
  }

  public async expectIcon(): Promise<void> {
    await test.step('icon is visible', (): Promise<void> => expect(this.icon).toBeVisible(), { box: true });
  }
}
```

```ts
// e2e/button/test/utils/button-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-react';
import { createElement } from 'react';

import type { ButtonProps } from '@/components/Button';
import { Button } from '@/components/Button';

import { ButtonComponent } from '../../components/button.component';

type Mount = ComponentFixtures['mount'];

export const mountButton = async (mount: Mount, props: ButtonProps, label: string): Promise<ButtonComponent> => {
  const root = await mount(createElement(Button, props, label));

  return new ButtonComponent(root);
};
```

### Mount with Props

No fixture file exists for CT, so the spec imports `test` from the CT package. Props are a typed const above the first step.

```ts
// e2e/button/button.ct.ts
import { test } from '@playwright/experimental-ct-react';

import type { ButtonProps } from '@/components/Button';

import type { ButtonComponent } from './components/button.component';
import { mountButton } from './test/utils/button-mount.spec.util';

test.describe('FEATURE: button', () => {
  test.describe('GIVEN default props', () => {
    test('SCENARIO: mounting renders the label', async ({ mount }): Promise<void> => {
      const button = await test.step('WHEN the button is mounted', (): Promise<ButtonComponent> => mountButton(mount, {}, 'Click me'));

      await test.step('THEN the label reads Click me', (): Promise<void> => button.expectText('Click me'));
    });
  });

  test.describe('GIVEN a primary large button with an icon', () => {
    test('SCENARIO: mounting renders the variant classes and the icon', async ({ mount }): Promise<void> => {
      const props: ButtonProps = { icon: 'check', size: 'large', variant: 'primary' };
      const button = await test.step('WHEN the button is mounted', (): Promise<ButtonComponent> => mountButton(mount, props, 'Submit'));

      await test.step('THEN the primary class is applied', (): Promise<void> => button.expectVariant('primary'));

      await test.step('AND the large class is applied', (): Promise<void> => button.expectVariant('large'));

      await test.step('AND the icon is visible', (): Promise<void> => button.expectIcon());
    });
  });
});
```

### Mount with Wrapper/Provider

Global providers live in the CT setup file. `beforeMount` receives the component as `App` and returns the wrapped element; `hooksConfig` is the per-test object a spec passes to `mount`, typed once in `e2e/common/hooks-config.type.ts`. The same hook installs browser globals a component reads (`analyticsMock()` in `e2e/test/mocks/analytics.mock.ts` returns no-op `track` and `identify`).

```ts
// e2e/common/hooks-config.type.ts
export type FeatureFlags = {
  readonly newFeature: boolean;
};

export type HooksConfig = {
  readonly featureFlags?: FeatureFlags;
};
```

```ts
// playwright/index.ts
import { beforeMount } from '@playwright/experimental-ct-react/hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { createElement } from 'react';

import { ThemeProvider } from '@/providers/theme';
import '@/styles/globals.css';

import type { HooksConfig } from '../e2e/common/hooks-config.type';
import { analyticsMock } from '../e2e/test/mocks/analytics.mock';

const queryClient = new QueryClient();

beforeMount<HooksConfig>(async ({ App, hooksConfig }): Promise<ReactElement> => {
  Object.assign(window, { analytics: analyticsMock(), featureFlags: hooksConfig?.featureFlags });

  const app = createElement(App);
  const themed = createElement(ThemeProvider, null, app);

  return createElement(QueryClientProvider, { client: queryClient }, themed);
});
```

| Variant | Where |
|---|---|
| Per-test provider (`AuthProvider` around `UserProfile`) | The mount util nests `createElement(AuthProvider, { initialUser }, createElement(UserProfile))`; the spec passes the user. |
| Global styles | `import '@/styles/globals.css'` in `playwright/index.ts`, as above. |

## Props & State Testing

### Testing Prop Variations

A `for` loop over an `as const` tuple generates one `test` per variant. The title interpolates the variant so each case names itself.

```ts
// e2e/button/button-variants.ct.ts
import { test } from '@playwright/experimental-ct-react';

import type { ButtonComponent } from './components/button.component';
import { mountButton } from './test/utils/button-mount.spec.util';

const VARIANTS = ['danger', 'ghost', 'primary', 'secondary'] as const;

test.describe('FEATURE: button variants', () => {
  test.describe('GIVEN each variant', () => {
    for (const variant of VARIANTS) {
      test(`SCENARIO: mounting the ${variant} variant applies the ${variant} class`, async ({ mount }): Promise<void> => {
        const button = await test.step(`WHEN the ${variant} button is mounted`, (): Promise<ButtonComponent> => mountButton(mount, { variant }, 'Button'));

        await test.step(`THEN the ${variant} class is applied`, (): Promise<void> => button.expectVariant(variant));
      });
    }
  });
});
```

### Updating Props and Internal State

`MountResult.update` re-renders with new props. The component object keeps the root as `MountResult` and owns `update`, so the spec step stays one call. Internal state is asserted through the DOM (`aria-checked`, text), never through the instance.

```ts
// e2e/counter/components/counter.component.ts
import type { MountResult } from '@playwright/experimental-ct-react';
import { expect, test } from '@playwright/experimental-ct-react';
import type { Locator } from '@playwright/test';
import { createElement } from 'react';

import type { CounterProps } from '@/components/Counter';
import { Counter } from '@/components/Counter';

export class CounterComponent {
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
    await this.root.update(createElement(Counter, props));
  }

  public async expectCount(count: number): Promise<void> {
    await test.step(`count reads ${count}`, (): Promise<void> => expect(this.count).toHaveText(String(count)), { box: true });
  }
}
```

```ts
// e2e/counter/counter.ct.ts
import { test } from '@playwright/experimental-ct-react';

import type { CounterComponent } from './components/counter.component';
import { mountCounter } from './test/utils/counter-mount.spec.util';

test.describe('FEATURE: counter', () => {
  test.describe('GIVEN a counter mounted at 0', () => {
    test('SCENARIO: updating initialCount to 10 makes the count read 10', async ({ mount }): Promise<void> => {
      const counter = await test.step('GIVEN the counter is mounted at 0', (): Promise<CounterComponent> => mountCounter(mount, { initialCount: 0 }));

      await test.step('AND the count reads 0', (): Promise<void> => counter.expectCount(0));

      await test.step('WHEN initialCount is updated to 10', (): Promise<void> => counter.update({ initialCount: 10 }));

      await test.step('THEN the count reads 10', (): Promise<void> => counter.expectCount(10));
    });

    test('SCENARIO: clicking + makes the count read 1', async ({ mount }): Promise<void> => {
      const counter = await test.step('GIVEN the counter is mounted at 0', (): Promise<CounterComponent> => mountCounter(mount, { initialCount: 0 }));

      await test.step('WHEN + is clicked', (): Promise<void> => counter.increment());

      await test.step('THEN the count reads 1', (): Promise<void> => counter.expectCount(1));
    });
  });
});
```

| Variant | Component-object method body |
|---|---|
| Controlled input | `fill('hello')` on the input, then `update` with `value: 'hello'`; the spec asserts `toHaveValue('hello')` through `expectValue`. |
| Toggle with `role="switch"` | `click()` on the root; `expectChecked(true)` asserts `toHaveAttribute('aria-checked', 'true')` on `root.getByRole('switch')`. |

## Events & Interactions

### Testing Callbacks and Payloads

Callback props are recorded into a typed array the spec owns. `recordInto` in the mount util returns a handler that pushes each payload; the assertion step compares the array. `Credentials` and `SubmitHandler` are named in `common/login-form.type.ts`; `CREDENTIALS_STUB` is in `test/stubs/login-form.stub.ts`.

```ts
// e2e/login-form/components/login-form.component.ts
import type { Locator } from '@playwright/test';

import type { Credentials } from '../common/login-form.type';

export class LoginFormComponent {
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

```ts
// e2e/login-form/test/utils/login-form-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-react';
import { createElement } from 'react';

import { LoginForm } from '@/components/LoginForm';

import type { Credentials, SubmitHandler } from '../../common/login-form.type';
import { LoginFormComponent } from '../../components/login-form.component';

type Mount = ComponentFixtures['mount'];

export const recordInto = (submissions: Credentials[]): SubmitHandler => {
  return (data: Credentials): void => {
    submissions.push(data);
  };
};

export const mountLoginForm = async (mount: Mount, onSubmit: SubmitHandler): Promise<LoginFormComponent> => {
  const root = await mount(createElement(LoginForm, { onSubmit }));

  return new LoginFormComponent(root);
};
```

```ts
// e2e/login-form/login-form.ct.ts
import { expect, test } from '@playwright/experimental-ct-react';

import type { Credentials } from './common/login-form.type';
import type { LoginFormComponent } from './components/login-form.component';
import { CREDENTIALS_STUB } from './test/stubs/login-form.stub';
import { mountLoginForm, recordInto } from './test/utils/login-form-mount.spec.util';

test.describe('FEATURE: login form', () => {
  test.describe('GIVEN a form with a recording onSubmit', () => {
    test('SCENARIO: submitting credentials passes them to onSubmit once', async ({ mount }): Promise<void> => {
      const submissions: Credentials[] = [];
      const form = await test.step('GIVEN the form is mounted', (): Promise<LoginFormComponent> => mountLoginForm(mount, recordInto(submissions)));

      await test.step('WHEN credentials are submitted', (): Promise<void> => form.submit(CREDENTIALS_STUB));

      await test.step('THEN onSubmit received the credentials once', (): void => expect(submissions).toEqual([CREDENTIALS_STUB]));
    });
  });
});
```

| Interaction | Component-object method body | Spec assertion |
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
import { ModalComponent } from '../../components/modal.component';

type Mount = ComponentFixtures['mount'];

export const mountModal = async (mount: Mount, slots: ModalSlots): Promise<ModalComponent> => {
  const root = await mount(Modal, { slots });

  return new ModalComponent(root);
};
```

```ts
// e2e/modal/modal.ct.ts
import { test } from '@playwright/experimental-ct-vue';

import type { ModalComponent } from './components/modal.component';
import { MODAL_SLOTS_STUB } from './test/stubs/modal.stub';
import { mountModal } from './test/utils/modal-mount.spec.util';

test.describe('FEATURE: modal slots', () => {
  test.describe('GIVEN header, default, and footer slots', () => {
    test('SCENARIO: mounting renders each slot', async ({ mount }): Promise<void> => {
      const modal = await test.step('WHEN the modal is mounted with all slots', (): Promise<ModalComponent> => mountModal(mount, MODAL_SLOTS_STUB));

      await test.step('THEN the heading reads Modal Title', (): Promise<void> => modal.expectHeading('Modal Title'));

      await test.step('AND the footer button reads Close', (): Promise<void> => modal.expectButton('Close'));
    });
  });
});
```

`ModalComponent` exposes `heading` (`root.getByRole('heading')`) and `closeButton` (`root.getByRole('button')`) and wraps `expectHeading` / `expectButton` in boxed steps.

| Variant | Mount util body |
|---|---|
| React children | `createElement(Card, null, createElement('h2', null, 'Title'), createElement('p', null, 'Description'))`; the component object asserts `getByRole('heading')` and `getByText('Description')`. |
| Render prop | Pass a function child: `createElement(DataFetcher, { url }, renderUser)` where `renderUser` returns a `Loading...` span while `loading` and the name span after; assert `Loading...` visible, then the name visible. |

## Mocking Dependencies

### Mocking Imports

`playwright/index.ts` above installs globals and reads `hooksConfig` in `beforeMount`. A spec passes `hooksConfig` through the mount util; the generic on `mount` types it.

```ts
// e2e/feature-banner/test/utils/feature-banner-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-react';
import { createElement } from 'react';

import { FeatureBanner } from '@/components/FeatureBanner';

import type { HooksConfig } from '../../../common/hooks-config.type';
import { FeatureBannerComponent } from '../../components/feature-banner.component';

type Mount = ComponentFixtures['mount'];

export const mountFeatureBanner = async (mount: Mount, hooksConfig: HooksConfig): Promise<FeatureBannerComponent> => {
  const root = await mount<HooksConfig>(createElement(FeatureBanner), { hooksConfig });

  return new FeatureBannerComponent(root);
};
```

```ts
// e2e/feature-banner/feature-banner.ct.ts
import { test } from '@playwright/experimental-ct-react';

import type { FeatureFlags, HooksConfig } from '../common/hooks-config.type';
import type { FeatureBannerComponent } from './components/feature-banner.component';
import { mountFeatureBanner } from './test/utils/feature-banner-mount.spec.util';

test.describe('FEATURE: feature banner', () => {
  test.describe('GIVEN the newFeature flag is on', () => {
    test('SCENARIO: mounting shows the new feature text', async ({ mount }): Promise<void> => {
      const featureFlags: FeatureFlags = { newFeature: true };
      const hooksConfig: HooksConfig = { featureFlags };
      const banner = await test.step('WHEN the banner is mounted with the flag on', (): Promise<FeatureBannerComponent> => mountFeatureBanner(mount, hooksConfig));

      await test.step('THEN the new feature text is shown', (): Promise<void> => banner.expectText('New Feature'));
    });
  });
});
```

### Mocking API Calls

A component that fetches on mount needs the route installed before `mount`. The handler is a factory in `test/mocks/`; the `GIVEN` installs it in `beforeEach` as a step. `User` is named in `common/user-profile.type.ts`; `USER_STUB` is in `test/stubs/user.stub.ts`.

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

```ts
// e2e/user-profile/user-profile.ct.ts
import { test } from '@playwright/experimental-ct-react';

import type { UserProfileComponent } from './components/user-profile.component';
import { userMock } from './test/mocks/user.mock';
import { USER_STUB } from './test/stubs/user.stub';
import { mountUserProfile } from './test/utils/user-profile-mount.spec.util';

test.describe('FEATURE: user profile', () => {
  test.describe('GIVEN the user api returns a user', () => {
    test.beforeEach(async ({ page }): Promise<void> => {
      await test.step('GIVEN the user api is stubbed', async (): Promise<void> => {
        await page.route('**/api/user', userMock(USER_STUB));
      });
    });

    test('SCENARIO: mounting shows the user name', async ({ mount }): Promise<void> => {
      const profile = await test.step('WHEN the profile is mounted', (): Promise<UserProfileComponent> => mountUserProfile(mount, USER_STUB.id));

      await test.step('THEN the user name is shown', (): Promise<void> => profile.expectName(USER_STUB.name));
    });
  });
});
```

### Mocking Hooks

A custom hook that reads a global is mocked the same way as a feature flag: add the field to `HooksConfig` (`readonly mockAuth?: AuthState`), have `beforeMount` assign it to the global the hook reads, and pass it through `hooksConfig` in the mount util. The spec then asserts on the rendered result (`Admin Panel` visible), not on the hook.

## Framework-Specific Patterns

| Framework | Package | Mount signature | Notes |
|---|---|---|---|
| React | `@playwright/experimental-ct-react` | `mount(createElement(Comp, props, ...children))` | Refs: pass a callback ref that stores the element in a spec-owned variable. Context: the mount util nests `createElement(UserContext.Provider, { value }, createElement(UserGreeting))`. |
| Vue | `@playwright/experimental-ct-vue` | `mount(Comp, { props, slots, on })` | `v-model` binds through `modelValue` plus an `'onUpdate:modelValue'` listener in `props`. |
| Svelte | `@playwright/experimental-ct-svelte` | `mount(Comp, { props })` | Same component-object and mount-util shape; `on` carries event listeners. |
| Solid | `@playwright/experimental-ct-solid` | `mount(createComponent(Comp, props))` | Same shape as React with Solid's `createComponent`. |

### Vue v-model

The listener key needs quotes, so it stays in the props object; the mount util owns it.

```ts
// e2e/text-input/test/utils/text-input-mount.spec.util.ts
import type { ComponentFixtures } from '@playwright/experimental-ct-vue';

import TextInput from '@/components/TextInput.vue';

import type { ModelListener } from '../../common/text-input.type';
import { TextInputComponent } from '../../components/text-input.component';

type Mount = ComponentFixtures['mount'];

export const mountTextInput = async (mount: Mount, modelValue: string, onUpdate: ModelListener): Promise<TextInputComponent> => {
  const props = { modelValue, 'onUpdate:modelValue': onUpdate };
  const root = await mount(TextInput, { props });

  return new TextInputComponent(root);
};
```

```ts
// e2e/text-input/text-input.ct.ts
import { expect, test } from '@playwright/experimental-ct-vue';

import type { TextInputComponent } from './components/text-input.component';
import { mountTextInput } from './test/utils/text-input-mount.spec.util';

test.describe('FEATURE: text input v-model', () => {
  test.describe('GIVEN an empty model', () => {
    test('SCENARIO: typing text emits update:modelValue with the text', async ({ mount }): Promise<void> => {
      const values: string[] = [];
      const onUpdate = (value: string): number => values.push(value);
      const input = await test.step('GIVEN the input is mounted with an empty model', (): Promise<TextInputComponent> => mountTextInput(mount, '', onUpdate));

      await test.step('WHEN test is typed', (): Promise<void> => input.fill('test'));

      await test.step('THEN the model received test', (): void => expect(values).toEqual(['test']));
    });
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
| JSX inside a spec              | Spec knows the element tree | Mount util builds it with `createElement`; spec passes props |

## Related References

- **Accessibility**: See [accessibility.md](accessibility.md) for a11y testing in components
- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for shared test setup
- **React / Vue**: See [react.md](../frameworks/react.md) and [vue.md](../frameworks/vue.md) for full component-object classes
