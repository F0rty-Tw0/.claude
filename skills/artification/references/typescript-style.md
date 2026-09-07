# TypeScript Style

## Contents

- [Core Principle](#core-principle)
- [Quick Reference](#quick-reference)
- [Example](#example)
- [Advanced Example](#advanced-example)
- [Additional Examples](#additional-examples)
  - [Shared Type Used by Sibling Modules](#shared-type-used-by-sibling-modules)
  - [Named Nested Type Used Locally](#named-nested-type-used-locally)
  - [Shared Types and Runtime Constants](#shared-types-and-runtime-constants)
- [Declarations and Imports](#declarations-and-imports)
- [Statement Layout](#statement-layout)
- [Rationalizations](#rationalizations)
- [Red Flags](#red-flags)
- [Common Mistakes](#common-mistakes)

## Core Principle

Types expose architecture. Make ownership, mutability, and nested concepts explicit even when a smaller diff would preserve an older convention.

## Quick Reference

| Concern | Rule |
|---|---|
| Shared placement | Put any project-authored type exported from its declaring module or imported by another project file in the nearest owning domain or package's `common/` folder. Never use a global dumping ground. |
| Feature type file | Group every type meeting the placement rule in one `<feature>.type.ts` file. |
| Runtime constants | Add at most one `<feature>.const.ts` only when the feature has shared runtime constants. Omit it otherwise. |
| Object syntax | Use `type`, never `interface`, for authored shapes. Do not rewrite dependency declarations. |
| Properties | Mark every object property `readonly`. |
| Arrays | Keep arrays mutable as `T[]`; never use `readonly T[]` or `ReadonlyArray<T>`. |
| Inline object types | No object type literal anywhere except as the body of a `type` alias: not as a property type, parameter type, return type, generic argument, or inside a `declare module` block. Name it. Reuse is not required. |
| Local types | Keep a non-exported type in the only file that uses it. Naming a nested shape does not require exporting it. |
| Imports | Import `<feature>.type.ts` and optional `<feature>.const.ts` directly. Do not create an index barrel for this pair. |
| Type imports | A type-only import is `import type { X }` on its own line, separate from value imports of the same module. |
| Import order | Groups in order, one blank line between: builtin, external, internal, parent + sibling, index. Alphabetical inside a group, case-insensitive. Named members alphabetical inside the braces. One import per module. |
| Return types | Every function, arrow, and method declares its return type, test code included. |
| Derived types | Never `ReturnType<typeof fn>`, `Parameters<typeof fn>`, or `typeof value` as a type. Name the type: import the library's exported type, or export the alias the function already returns. |
| Class members | Every member carries `public`, `private`, or `protected`. Fields assigned only in the constructor are `readonly`. No parameter properties. Methods that do not use `this` become functions outside the class. |
| Naming | `camelCase` for variables, functions, parameters, and members; `PascalCase` for types and classes; `UPPER_CASE` allowed for module-level consts; `PascalCase` allowed for object keys and methods that mirror an external key (AST node kinds, HTTP headers). Keys that need quotes are exempt. No leading or trailing `_`. |
| Blank lines | One blank line after a `const`/`let` group before anything that is not another declaration; before every `if`, `for`, `switch`, `try`, `return`, `throw`, `class`, and `function`; between exports. |
| Dead conditions | Never test what the type already guarantees. If the compiler says a check is always true or the types have no overlap, delete the check or fix the type at the boundary. |
| Switches | A `switch` over a union lists every member or has a `default`. |
| Node-native syntax | Only erasable TypeScript: no parameter properties, no `enum`, no `namespace`. Relative imports carry the `.ts` extension with `rewriteRelativeImportExtensions`. |
| Return spacing | Put one blank line before every `return` that follows another statement in the same block. A `return` that opens a block gets no blank line. |
| Lone guards | An `if` with no `else` whose only body is `return`, `continue`, `break`, or `throw` goes on one line without braces when the whole line, indentation included, fits the project `printWidth`. Otherwise keep braces with the body on its own line. |
| Condition size | An `if` condition holds at most 3 operands joined by `&&` or `\|\|`. Four or more: move the whole condition into a named `const` boolean above the `if`. |
| Calls in conditions | No function call inside an `if` condition or a boolean const feeding one. Assign each call result to a named `const` first. Type-predicate calls the body needs for narrowing stay inline. |
| Grouped operands | A parenthesized `(a \|\| b)` group inside a condition becomes its own named `const`. |
| Spread expressions | Never `...(expr)`. Assign the expression to a `const`, then spread the name. |
| Ternaries | A branch holds a name, literal, or plain member access; anything else moves to a `const` or a guard. Never nest a ternary. |
| Chains | A member chain starts on a name, never `(expr).method()`. A chain Prettier wraps gets named intermediates. |
| Callbacks | Inline arrow callbacks hold one short expression. Longer bodies become a named function above the call. |
| Arrow bodies | Expression body only when the whole arrow fits one line; otherwise block body with named steps. |
| Casts | No `as` casts except `as const`. Narrow with type predicates, fix declared types, never `as unknown as`. |
| Nested values | A property value that is an object literal, an array of objects, a call chain, or a ternary moves to a `const` and is referenced by name. Empty `{}`/`[]` stay inline. |
| Comments | Only comments that carry a fact the code cannot: external-bug workaround with link, directive with reason, invariant the types cannot state, JSDoc on a public export. Delete restatements, narration, and `// ponytail:` markers. Not lint-enforced; judged per comment. |
| Returned objects | Never return an object literal inline. Assign it to a named `const`, blank line, then `return` the name. Applies to `return` statements and to arrow expression bodies `() => ({ ... })`. |

`readonly items: Item[]` means the property reference cannot be replaced while array contents remain mutable. This is intentional.

## Example

Before:

```ts
// checkout/client.ts
export interface ClientConfig {
  retry: {
    attempts: number;
    delays: readonly number[];
  };
}

export interface ClientResult {
  messages: readonly string[];
}
```

After:

```ts
// checkout/common/checkout.type.ts
type RetryConfig = {
  readonly attempts: number;
  readonly delays: number[];
};

export type ClientConfig = {
  readonly retry: RetryConfig;
};

export type ClientResult = {
  readonly messages: string[];
};
```

## Advanced Example

This combines shared ownership, nested names, mutable arrays, and a local-only type:

```ts
// catalog/common/catalog.type.ts
type PriceRange = {
  readonly minimum: number;
  readonly maximum: number;
};

type FilterOption = {
  readonly key: string;
  readonly aliases: string[];
};

type FilterGroup = {
  readonly title: string;
  readonly options: FilterOption[];
};

export type CatalogConfig = {
  readonly price: PriceRange;
  readonly filters: FilterGroup[];
};
```

```ts
// catalog/catalog.store.ts
import type { CatalogConfig } from './common/catalog.type';

type CatalogDraft = {
  readonly config: CatalogConfig;
  readonly selectedKeys: string[];
};
```

`CatalogDraft` stays local because only the store uses it. Import `catalog.type.ts` directly; do not add `common/index.ts`.

## Additional Examples

### Shared Type Used by Sibling Modules

Two consumers establish the shared boundary:

```ts
// reports/common/report.type.ts
export type ReportRow = {
  readonly label: string;
  readonly values: number[];
};
```

```ts
// reports/report.mapper.ts
import type { ReportRow } from './common/report.type';

export const totalReportRow = (row: ReportRow): number => {
  return row.values.reduce((total, value) => total + value, 0);
};
```

```ts
// reports/report.presenter.ts
import type { ReportRow } from './common/report.type';

export const reportLabel = (row: ReportRow): string => {
  return `${row.label}: ${row.values.length}`;
};
```

Keep `ReportRow` in `reports/common/report.type.ts`; both sibling modules import that file directly.

### Named Nested Type Used Locally

A nested shape still gets a name when only one file uses it:

```ts
// editor/editor.state.ts
type SelectionRange = {
  readonly start: number;
  readonly end: number;
};

type EditorDraft = {
  readonly title: string;
  readonly selection: SelectionRange;
};

const initialDraft: EditorDraft = {
  title: '',
  selection: { start: 0, end: 0 }
};
```

Neither type leaves `editor.state.ts`, so neither belongs in `editor/common/`.

### Shared Types and Runtime Constants

Keep compile-time shapes and shared runtime values in separate feature files:

```ts
// workspace/common/workspace.type.ts
type Accent = 'blue' | 'green';

export type WorkspacePreferences = {
  readonly accent: Accent;
  readonly shortcuts: string[];
};
```

```ts
// workspace/common/workspace.const.ts
import type { WorkspacePreferences } from './workspace.type';

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  accent: 'blue',
  shortcuts: []
};
```

```ts
// workspace/workspace.store.ts
import { DEFAULT_WORKSPACE_PREFERENCES } from './common/workspace.const';
import type { WorkspacePreferences } from './common/workspace.type';

export const initialPreferences: WorkspacePreferences = {
  ...DEFAULT_WORKSPACE_PREFERENCES,
  shortcuts: [...DEFAULT_WORKSPACE_PREFERENCES.shortcuts]
};
```

Import `workspace.type.ts` and `workspace.const.ts` directly; do not add `workspace/common/index.ts`.

## Declarations and Imports

These are the rules a strict linter catches first. Each was found by linting a codebase that already followed every rule above, so none of them is optional.

### Imports

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';
import type { Document } from 'yaml';

import { ORDER_DEFAULTS } from '../common/order.const.ts';
import type { Order, OrderLine } from '../common/order.type.ts';
import { priceOrder } from './order-pricing.ts';
```

Builtin, external, then project imports, one blank line between groups, alphabetical inside a group. A module imported for both values and types gets two lines: the value import, then `import type`. Members inside braces are alphabetical. Relative paths end in `.ts`.

### Return Types and Members

```ts
export const orderTotal = (order: Order): number => {
  return order.lines.reduce(addLineTotal, 0);
};

class OrderBook {
  private readonly orders = new Map<string, Order>();
  private readonly clock: Clock;

  public constructor(clock: Clock) {
    this.clock = clock;
  }

  public add(order: Order): void {
    this.orders.set(order.id, order);
  }
}
```

Every function states its return type, even `void`, even in specs. Every class member states its accessibility. A constructor takes plain parameters and assigns them; `constructor(private readonly clock: Clock)` is not erasable syntax and is banned. A method that never reads `this` is a function outside the class.

### Derived Types

Never derive a type from a value: no `ReturnType<typeof fn>`, `Parameters<typeof fn>`, `Awaited<ReturnType<typeof fn>>`, or `typeof value` in a type position. A derived type has no name, so the reader must open the function to learn the shape, and the shape silently changes when the function does.

The type already exists. Every function declares its return type (rule above), so name that type and import it:

| Instead of | Use |
|---|---|
| `ReturnType<typeof parseTemplate>` on a library function | The library's exported type: `import type { ParsedTemplate } from '@angular/compiler'` |
| `ReturnType<typeof createProject>` on a project function | `export type Project = { ... }` in `common/<feature>.type.ts`, then `import type { Project }` in both the function's file and the caller |
| `Parameters<typeof fn>[0]` | The parameter's declared type, exported |
| `typeof CONFIG` | A `type Config = { ... }` alias, and annotate `CONFIG: Config` |

Before:

```ts
let project: ReturnType<typeof createIncrementalProject>;
```

After:

```ts
import type { IncrementalProject } from './common/incremental-project.type.ts';

let project: IncrementalProject;
```

Placement follows the shared-type rule with no exception: a type imported by another file lives in `common/<feature>.type.ts`; a type only test files import lives in `test/common/<feature>.type.ts`. A `.spec.util.ts` file exports functions, never types. `as const` plus `typeof` on a literal tuple to build a union (`type Kind = (typeof KINDS)[number]`) is the one allowed derivation, because the const is the single source of the members.

### Naming

| Thing | Format |
|---|---|
| variable, function, parameter, member | `camelCase` |
| module-level constant | `camelCase` or `UPPER_CASE` |
| type, class, type parameter | `PascalCase` |
| object key or method mirroring an external name | `camelCase` or `PascalCase` (`TSTypeLiteral`, `ContentType`); keys that need quotes (`'Program:exit'`) are exempt |
| anything with a leading or trailing `_` | not allowed |

### Blank Lines

One blank line:

- after a `const`/`let` group, before the first statement that is not a declaration;
- before every `if`, `for`, `switch`, `try`, `return`, `throw`, `class`, and `function`;
- between consecutive `export`s.

None between consecutive declarations. This is `padding-line-between-statements`; the "blank line before `return`" rule in Statement Layout is one case of it.

### Dead Conditions and Switches

```ts
// the type is `Identifier`; the check can only be true
if (node.type === 'Identifier') { ... }

// the types have no overlap; the branch can never run
if (metadata === undefined) { ... }
```

When the compiler proves a condition constant, the condition is a lie about the code. Delete it, or, if the runtime really can violate the type (untyped input, a library that lies), fix the type where the value enters. A `switch` over a union either lists every member or has a `default` that returns the fall-through value.

### Node-Native Syntax

Code runs through Node's type stripping. Only erasable syntax is allowed: no parameter properties, no `enum` (use a union of literals or an `as const` object), no `namespace`. Type-only imports use `import type`. `erasableSyntaxOnly` and `verbatimModuleSyntax` in `tsconfig` enforce both.

## Statement Layout

Exits must be visible by shape. A blank line marks a `return`; a one-line guard keeps an early exit on the same row as its condition.

Width limit is the project `printWidth` (Prettier default 80; read the project's Prettier config). Measure the full line including indentation.

Before:

```ts
const resolveAccount = (key: string | null, seen: Set<string>): Account | null => {
  if (!key) {
    return null;
  }
  if (seen.has(key)) {
    throw new Error(`duplicate ${key}`);
  }
  const account = lookup(key);
  return account ?? null;
};
```

After:

```ts
const resolveAccount = (key: string | null, seen: Set<string>): Account | null => {
  if (!key) return null;

  const isDuplicate = seen.has(key);

  if (isDuplicate) throw new Error(`duplicate ${key}`);

  const account = lookup(key);

  return account ?? null;
};
```

A guard that does not fit keeps braces; never split a brace-less guard across two lines:

```ts
if (hasNoBillingAddress) {
  throw new CheckoutError(order, 'missing-billing-address', { cause: previousError });
}
```

A guard with `else`, more than one statement, or a comment inside keeps braces.

### Condition Size

Count operands joined by `&&` or `||`. Three is the ceiling; four or more move into a named `const`:

```ts
// 4 operands: extract
const isShippable =
  order.address !== undefined &&
  order.items.length > 0 &&
  !order.cancelled &&
  order.balance === 0;

if (isShippable) return shipOrder(order);
```

Name the const as the question it answers (`isShippable`, `hasUnpaidItems`). Nested parentheses count each leaf operand.

### Calls, Groups, and Spreads

An `if` condition, and any boolean const that feeds one, holds only names, literals, comparisons, and `!`. Three things leave it:

| Shape | Move to |
|---|---|
| Function call `f(x)` | `const <answer> = f(x);` above, then use the name |
| Parenthesized group `(a \|\| b)` | `const <answer> = a \|\| b;` above, then use the name |
| Spread of an expression `...(cond ? a : b)`, `...(await x)` | `const <items> = ...;` above, then `...items` |

Before:

```ts
if (!hasCredit(accountFor(order, 'billing'), ledger, currency)) return null;

const isFulfillable =
  (isGift && recipients.every((recipient) => stock.has(recipient.sku))) ||
  !isGift ||
  reserveWarehouseStock(order, stock, region) ||
  !requireStock;

const isNamedLine =
  isLineItem(entry) &&
  (isSkuCode(entry.code) || isBarcode(entry.code) || isSerial(entry.code)) &&
  entry.code.value === wanted;

const config = { ...(options.strict ? STRICT_DEFAULTS : DEFAULTS), name };
```

After:

```ts
const billingAccount = accountFor(order, 'billing');
const hasBillingCredit = hasCredit(billingAccount, ledger, currency);

if (!hasBillingCredit) return null;

if (!isGift) return stock;

const hasRecipientStock = recipients.every((recipient) => stock.has(recipient.sku));

if (hasRecipientStock) return stock;

const hasReservedStock = reserveWarehouseStock(order, stock, region);

if (hasReservedStock) return stock;
if (!requireStock) return stock;

const isLine = isLineItem(entry);

if (!isLine) continue;

const isSku = isSkuCode(entry.code);
const isBar = isBarcode(entry.code);
const isSerialCode = isSerial(entry.code);
const isCodedLine = isSku || isBar || isSerialCode;
const isNamedLine = isCodedLine && entry.code.value === wanted;

const defaults = options.strict ? STRICT_DEFAULTS : DEFAULTS;
const config = { ...defaults, name };
```

Three limits:

- Hoisting runs the call unconditionally. When a call must not run unless an earlier operand holds (cost, side effect, or a null it would throw on), split into sequential guards instead of one combined condition. `isFulfillable` above became a guard chain for that reason: `reserveWarehouseStock` talks to a warehouse and mutates `stock`, so it may only run after the cheaper checks fail.
- A boolean const only narrows a `const` binding, a never-reassigned parameter, or a `readonly` path. A `let` reassigned in a loop never narrows through an alias; a type-guard call on such a variable stays inline in the `if`.
- A type-predicate call whose narrowing the body needs stays inline in the `if` (see below).

When the condition narrows a type the body relies on (`instanceof`, `.kind ===`, `typeof`), extract the check as a type-predicate function instead of a boolean, and share it through `utils/` when two files need it:

```ts
export const isPaidLine = (
  line: Line
): line is CardLine | TransferLine | VoucherLine | CreditLine => {
  const isCard = line instanceof CardLine;
  const isTransfer = line instanceof TransferLine;
  const isVoucher = line instanceof VoucherLine;
  const isCredit = line instanceof CreditLine;

  return isCard || isTransfer || isVoucher || isCredit;
};
```

```ts
if (isPaidLine(invoice.line)) {
  this.settle(invoice.line.account);
}
```

The body is not an exit, so braces stay even though the line would fit.

### Ternaries, Chains, and Callbacks

One expression does one thing. Each of these gets a name or a guard of its own:

| Shape | Rule |
|---|---|
| Ternary branch | Holds a name, a literal, `undefined`/`null`, or a plain member access. An object literal, a call, or an arrow inside a branch moves to a `const` above. When the branch is only valid under the condition, split into a guard and a const instead. |
| Nested ternary | Never. Use guards, or one `const` per level. |
| Chain receiver | A member chain starts on a name: `(a ?? b).split()` → `const value = a ?? b;` then `value.split()`. Never on a parenthesized expression or an object literal. |
| Chain length | A chain Prettier wraps across lines gets its intermediate results named. |
| Callback body | An inline arrow callback holds one short expression, no `&&`/`\|\|`, no wrapped chain. Anything longer becomes a named function above the call. |
| Arrow body | Expression body only when the whole arrow fits on one line. Otherwise a block body with named steps and a `return`. |

Before:

```ts
const attachmentSource = (path: string | null, baseDir: string) =>
  path === null
    ? undefined
    : { kind: 'external', fileName: resolve(baseDir, path) };

export const tagsOf = (
  record: Record<string, unknown>,
  defaults: Defaults
): string[] =>
  (stringField(fieldOf(record, 'tags'), defaults) ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const labels = entry.alias
  ? aliasLabels(registry, entry.alias)
  : isNamed(entry.target)
    ? [entry.target.name]
    : null;

const isVendorHandler = (route: Route): boolean =>
  (route.handlers ?? []).some(
    (handler) =>
      isHttpHandler(handler) &&
      handler
        .module()
        .path.replaceAll('\\', '/')
        .includes('/node_modules/@vendor/')
  );
```

After:

```ts
const attachmentSource = (
  path: string | null,
  baseDir: string
): AttachmentSource | undefined => {
  if (path === null) return undefined;

  const fileName = resolve(baseDir, path);
  const source: AttachmentSource = { kind: 'external', fileName };

  return source;
};

export const tagsOf = (
  record: Record<string, unknown>,
  defaults: Defaults
): string[] => {
  const tagsField = fieldOf(record, 'tags');
  const tags = stringField(tagsField, defaults) ?? '';
  const trimmed = tags.split(',').map((tag) => tag.trim());

  return trimmed.filter(Boolean);
};

const entryLabels = (registry: Registry, entry: Entry): string[] | null => {
  if (entry.alias) return aliasLabels(registry, entry.alias);

  const isNamedTarget = isNamed(entry.target);

  if (!isNamedTarget) return null;

  const labels = [entry.target.name];

  return labels;
};

const isVendorHttpHandler = (handler: Handler): boolean => {
  const isHttp = isHttpHandler(handler);

  if (!isHttp) return false;

  const modulePath = handler.module().path.replaceAll('\\', '/');

  return modulePath.includes('/node_modules/@vendor/');
};

const isVendorHandler = (route: Route): boolean => {
  const handlers = route.handlers ?? [];

  return handlers.some(isVendorHttpHandler);
};
```

`attachmentSource` could not hoist the object above the ternary: `resolve` would run with `null`. The guard runs first, then the object is built and named.

### Casts

No `as` casts. A cast silences the compiler instead of informing it. Fix the typing:

| Instead of | Use |
|---|---|
| `value as Narrow` after a check | A type predicate `(value: Wide): value is Narrow` that holds the check |
| `x as SomeLibraryType` | The library's own guard, or a predicate on its discriminant flags |
| `as unknown as T` | Never. Fix the source type or the target type. |
| `{} as T`, `[] as T[]` | `const value: T = { ... }`, `const items: T[] = []` |
| `obj as Record<string, X>` | An index signature on the declared type |
| Test double `{ a, b } as Wide` | Narrow the parameter type to what the function reads (`Pick<Wide, 'a' \| 'b'>`), or a typed stub |
| `as const` | Allowed. It narrows, it does not lie. |

Before:

```ts
const shape = node as ShapeNode;
const target =
  (shape.shapeFlags & ShapeFlags.Reference) !== 0
    ? (node as ReferenceNode).target
    : shape;
```

After:

```ts
const isShapeNode = (node: Node): node is ShapeNode => {
  return (node.flags & NodeFlags.Shape) !== 0;
};

const isReferenceNode = (node: Node): node is ReferenceNode => {
  const isShape = isShapeNode(node);

  if (!isShape) return false;

  return (node.shapeFlags & ShapeFlags.Reference) !== 0;
};

const isReference = isReferenceNode(node);
const target = isReference ? node.target : node;
```

A predicate's body may test flags on the wide type; that is what predicates are for. Put shared predicates in `utils/<subject>.util.ts`.

A predicate that checks three keys to bless an `unknown` value as a large type is a cast with extra steps. Prefer fixing the source type (a better-typed import, a narrower return type) over a structural predicate.

### Nested Values

An object literal holds names and scalars. A property value that is an object literal, an array literal with object elements, a call chain, or a ternary moves to a `const` above and is referenced by name. Empty `{}` and `[]` stay inline.

Before:

```ts
notifier.send({
  to: recipient,
  template: 'order-delayed',
  data: { name: displayName(recipient, locale) },
  ...retryPolicy,
  actions: channels
    .filter((channel) => channel !== primaryChannel)
    .map((channel) => {
      const action: NotificationAction = {
        template: 'switch-channel',
        data: { channel },
        run: switchChannel(recipient, channel, locale)
      };

      return action;
    })
});
```

After:

```ts
const switchActionFor = (channel: Channel): NotificationAction => {
  const data = { channel };
  const run = switchChannel(recipient, channel, locale);
  const action: NotificationAction = { template: 'switch-channel', data, run };

  return action;
};

const isSecondaryChannel = (channel: Channel): boolean => {
  return channel !== primaryChannel;
};

const name = displayName(recipient, locale);
const data = { name };
const actions = channels.filter(isSecondaryChannel).map(switchActionFor);
const notification: Notification = {
  to: recipient,
  template: 'order-delayed',
  data,
  ...retryPolicy,
  actions
};

notifier.send(notification);
```

The same applies to test cases: `errors: [ { ... } ]` becomes `const errors = [error];` with `error` built above. The rule is recursive: the extracted `error` names its own `data`.

Extracting a string literal into a const widens it to `string`. Annotate the const with the contract type (`const error: ExpectedError<MessageId> = { ... }`) so the literal keeps its type at the use site.

Exempt: configuration files whose whole content is one nested settings literal (a lint preset, a bundler config, a `rules` map). Naming `rules` as `rules` adds nothing.

### Comments

Code carries its intent in names. A useless comment is one the reader could regenerate from the code beside it. A useful comment carries a fact the code cannot:

- A workaround for an external bug, with the tracking link.
- A lint or compiler directive, with its reason on the same line.
- A non-obvious invariant the type system cannot state (array order that is load-bearing, an empty object a library requires).
- A `/** JSDoc */` on a public export that documents the contract, not the implementation.

Everything else is deleted: `// ponytail:` markers, restatements of what the next line does, `// TODO` without a ticket, and narrative about why an approach was chosen. If a comment explains a block, the block wants a named function. There is no lint rule for this; the test is whether deleting the comment loses a fact.

### Returned Objects

Name the object before returning it. The name says what the function produces; the blank line marks the exit.

Before:

```ts
const describeField = (field: Field): FieldSummary => ({
  name: field.name,
  read: field.reads > 0
});
```

After:

```ts
const describeField = (field: Field): FieldSummary => {
  const summary: FieldSummary = {
    name: field.name,
    read: field.reads > 0
  };

  return summary;
};
```

Same for `return { ... }` inside a block body, including `return {};` (name it, e.g. `noListeners`). Returning an existing variable, a call result, or a non-object value stays inline.

### Enforcement

ESLint enforces these. The `lint-suite` plugin ships every row in its `base` and `typescript` presets; a project on those presets adds nothing. Any other project sets them by hand:

| Rule | Setting |
|---|---|
| `@stylistic/padding-line-between-statements` | the Blank Lines list above |
| `curly` | `multi-line` |
| `import-x/order` | groups builtin, external, internal, parent+sibling, index; `newlines-between: always`; alphabetize case-insensitive |
| `sort-imports` | members only (`ignoreDeclarationSort: true`) |
| `@typescript-eslint/consistent-type-imports` | `prefer: type-imports`, `fixStyle: separate-type-imports` |
| `@typescript-eslint/consistent-type-definitions` | `type` |
| `@typescript-eslint/explicit-function-return-type`, `explicit-module-boundary-types` | error |
| `@typescript-eslint/explicit-member-accessibility` or an equivalent | error |
| `@typescript-eslint/prefer-readonly` | error |
| `@typescript-eslint/naming-convention` | the Naming table above |
| `@typescript-eslint/no-unnecessary-condition`, `switch-exhaustiveness-check` | error |
| `@typescript-eslint/no-unsafe-*`, `no-explicit-any`, `no-non-null-assertion` | error |
| `no-nested-ternary`, `no-else-return`, `no-lonely-if`, `class-methods-use-this`, `no-underscore-dangle` | error |
| `max-lines` 150 (300 for specs), `max-lines-per-function` 50, `complexity` 10, `max-depth` 4, `max-params` 4 | see module-size.md |
| `import-x/no-anonymous-default-export` | error |

Everything else in this reference is applied by hand, by codemod over the TypeScript AST, or by review. `tsc` is the judge for every narrowing question: try the extraction, typecheck, and keep the call inline only when the compiler proves it must stay.


## Rationalizations

| Excuse | Counter |
|---|---|
| “A type alias adds no capability here.” | Consistent authored object syntax is the capability. Use `type`. |
| “Do not create a folder solely for one declaration.” | Export from its declaring module or import from another project file establishes the boundary immediately. Use the nearest owning `common/`. |
| “Readonly would forbid replacing the policy.” | Replacement is intentionally explicit: create a new containing value. |
| “Readonly arrays are safer at read-only boundaries.” | This style keeps arrays mutable. Do not substitute another immutability policy. |
| “The nested shape is only used once.” | Nesting, not reuse count, requires a name. |
| “`common/` becomes a dumping ground.” | Only types meeting the placement rule belong in the nearest owning domain or package's `common/`. |
| “One exported type per file is more discoverable.” | The feature is the discovery unit. Group its exported and cross-file types in `<feature>.type.ts`. |
| “The one-file cap conflicts with the skill.” | The corrected rule requires one feature type file; no conflict remains. |
| “A barrel centralizes type imports.” | Import the feature type file directly. Another file adds no ownership boundary. |
| “The blank line before `return` is noise in a short function.” | The blank line is the exit marker. Length does not change that. |
| “Braces on every `if` are safer.” | A one-line guard that fits is the rule. Braces return only when width forces them. |
| “Prettier decides layout.” | Prettier wraps; it does not add blank lines or drop braces. These rules sit above it. |
| “The four-operand condition is still readable.” | Three is the ceiling. The const name is the explanation the reader would otherwise reconstruct. |
| “Naming the returned object is an extra line.” | The name is the function's output in one word. An inline literal has no name. |
| “The call in the `if` is self-explanatory.” | A call in a condition mixes doing with deciding. The const name states what was decided. |
| “The parentheses already group it.” | Parentheses group for the parser. A name groups for the reader. |
| “`...(cond ? a : b)` is idiomatic.” | The spread says what is merged. Name it first. |
| “A nested ternary is compact.” | Compact is not readable. Two guards say the same thing in order. |
| “The chain reads top to bottom.” | A chain on `(a ?? b)` reads inside-out. Name the receiver first. |
| “Inlining the callback avoids a one-use function.” | A named callback is the only place its behavior has a name. |
| “Expression-bodied arrows are more functional.” | A wrapped expression body hides its steps. Name them in a block. |
| “The cast is safe here, I checked the flag.” | Then the check is a predicate. Write it once and the compiler checks it everywhere. |
| “The nested object is small.” | Size is not the point. The name is. `data`, `errors`, `suggest` each say what they are. |
| “The comment explains the trade-off.” | A trade-off the code cannot show (an external constraint, a bug link) stays. A trade-off between two ways of writing the same code belongs in the commit message or a named function. |

## Red Flags

Stop and re-check this reference when reasoning includes:

- “Existing interfaces are already readable.”
- “Keep it inline until a second use.”
- “Readonly arrays are more accurate.”
- “Each exported type deserves its own file.”
- “Add an index barrel for convenience.”
- “Use a global `types.ts` dumping ground.”
- “Deadline or minimal diff makes this case different.”
- “`ReturnType<typeof fn>` stays in sync automatically.”

## Common Mistakes

| Mistake | Fix |
|---|---|
| Moving every private helper type to `common/` | Move only exported or cross-file types. |
| Splitting each exported type into its own file | Group feature-owned shared types in `<feature>.type.ts`. |
| Naming the file only `types.ts` | Name ownership explicitly: `<feature>.type.ts`. |
| Adding a const file without shared runtime values | Omit `<feature>.const.ts`. |
| Adding an index barrel for the type/const pair | Import the feature files directly. |
| Marking properties readonly and arrays readonly | Use `readonly items: Item[]`. |
| Leaving a one-off nested property object inline | Name it and type the property with that name. |
| `return` glued to the statement above it | Insert one blank line before the `return`. |
| Braced three-line guard that fits in one line | Collapse to `if (cond) return x;`. |
| Brace-less guard wrapped onto a second line | Restore braces; the body goes on its own line. |
| `if (a && b && c && d)` | Move the condition into `const isX = ...;` and test `isX`. |
| `return { ... }` or `=> ({ ... })` | Assign to a typed `const`, blank line, `return` the name. |
| `if (!check(a, b))` | `const isChecked = check(a, b);` then `if (!isChecked)`. |
| `a && (b \|\| c)` inside a condition | `const isBOrC = b \|\| c;` then `a && isBOrC`. |
| `{ ...(x ? y : z) }` | `const base = x ? y : z;` then `{ ...base }`. |
| `cond ? undefined : { ... }` | Guard on `cond`, then build and name the object, then return it. |
| `a ? b : c ? d : e` | Two guards, or one const per level. |
| `(a ?? []).some(...)` | `const items = a ?? [];` then `items.some(...)`. |
| Multi-line arrow passed to `.some`/`.map`/`.filter` | Name it above the call and pass the name. |
| `=> expr` wrapped over several lines | Block body: name the steps, then `return`. |
| `value as Narrow` | A `(value: Wide): value is Narrow` predicate, then `if (isNarrow(value))`. |
| `ReturnType<typeof fn>` or `typeof value` as a type | Import the library's exported type, or export the alias `fn` already returns. |
| `report({ data: { name }, errors: [{ ... }] })` | `const data = { name }; const errors = [error];` then reference by name. |
| `// ponytail: ...` or a comment restating the next line | Delete it. Name the const or function instead. Keep a comment only if deleting it loses a fact. |
