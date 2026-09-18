# Spec Style

Living document. Rules are added as they come up. `unit-testing.md` says where a test file lives; this file says what a spec file contains.

## Contents

- [Core Principle](#core-principle)
- [Quick Reference](#quick-reference)
- [Gherkin Structure](#gherkin-structure)
- [Branch Coverage](#branch-coverage)
- [Angular TestBed](#angular-testbed)
- [Rationalizations](#rationalizations)
- [Red Flags](#red-flags)
- [Common Mistakes](#common-mistakes)

## Core Principle

Order of work: the `test-driven-development` skill decides when a case is written (red, then green). This file decides what the case looks like. Read both before the first `describe`.

A spec reads as a Gherkin tree: `FEATURE` → `GIVEN` → `WHEN` → `THEN`. Every branch in the subject has a case that walks it. Wallaby shows no yellow line.

## Quick Reference

| Concern | Rule |
|---|---|
| Root | One `describe('FEATURE: <name>')` per spec, named after the module under test. |
| Precondition | `describe('GIVEN <state>')`. One per distinct starting state: input shape, provider override, stub variant. |
| Action | `describe('WHEN <action>')` inside a `GIVEN`. |
| Outcome | `it('THEN <outcome>')` inside a `WHEN`. Body is Arrange → Act → Assert, in that order, one assertion group. |
| Collapse | A `WHEN` that would hold exactly one `it` collapses into `it('WHEN <action> THEN <outcome>')` under its `GIVEN`. Never collapse a `GIVEN`. |
| Scenario | `describe('SCENARIO: <flow>')` between `FEATURE` and `GIVEN` only when the feature has two or more independent flows that each need their own `GIVEN` set. One flow: no `SCENARIO`. |
| Branch coverage | Every `if`, `else`, early `return`, ternary arm, `switch` case, `??` / `||` / `?.` fallback, and `catch` gets its own case. Missing arm = Wallaby yellow = not done. |
| TestBed | Each `TestBed.overrideProvider(...)` on its own statement. Never chained, never inside `configureTestingModule` `providers` when overriding. |
| Naming | Keywords upper-case, exactly `FEATURE:`, `SCENARIO:`, `GIVEN`, `WHEN`, `THEN`. Text after the keyword is plain prose, present tense, no "should". |
| Gate | Spec tree reads top-down as sentences. Wallaby coverage for the module shows only green. |

## Gherkin Structure

```ts
describe('FEATURE: order pricing', () => {
  describe('GIVEN an order with one line', () => {
    describe('WHEN a discount code is applied', () => {
      it('THEN the total drops by the discount amount', () => {
        const order: Order = { ...ORDER_STUB, discountCode: 'TEN' };

        const total = priceOrder(order);

        expect(total).toBe(90);
      });

      it('THEN the discount is recorded on the receipt', () => {
        const order: Order = { ...ORDER_STUB, discountCode: 'TEN' };

        const receipt = priceOrder(order).receipt;

        expect(receipt.discount).toBe('TEN');
      });
    });

    it('WHEN no discount code is present THEN the total equals the line total', () => {
      const total = priceOrder(ORDER_STUB);

      expect(total).toBe(100);
    });
  });
});
```

| Concern | Rule |
|---|---|
| Arrange | Build the input. Spread a stub, override only what the case asserts on. Blank line after. |
| Act | One call to the subject. Blank line after. |
| Assert | `expect` lines only. Nothing computed here. |
| One `it`, one outcome | Two outcomes of the same `WHEN` are two `it` blocks, so the failing one names itself. |
| Shared arrange | Repeated across every `it` in a `GIVEN` → `beforeEach` at that `GIVEN`. Repeated across two `GIVEN`s → the input differs, keep it inline. |
| `SCENARIO` | Groups `GIVEN`s that share a flow, not a state: `SCENARIO: guest checkout` / `SCENARIO: member checkout`. |

## Branch Coverage

Every decision point in the subject is a `GIVEN` or a `WHEN`. Map before writing:

| Subject shape | Case it demands |
|---|---|
| `if (x) { ... }` with no `else` | One case where `x` holds, one where it does not. |
| Guard `if (!x) return` | A case that hits the guard and asserts the early result. |
| `a ? b : c` | Both arms. |
| `x ?? fallback`, `x \|\| fallback`, `x?.y` | One case with the value present, one with it absent. |
| `switch` | One case per `case`, plus `default` when it exists. |
| `try` / `catch` | One case that throws inside `try`. |
| Loop | Empty input, one item, many items. |

Wallaby yellow on a line means a branch on that line never ran. Add the missing case; do not restructure the subject to hide the branch.

## Angular TestBed

```ts
describe('FEATURE: LoginComponent', () => {
  describe('GIVEN the auth service rejects the credentials', () => {
    let fixture: ComponentFixture<LoginComponent>;

    beforeEach(async () => {
      TestBed.configureTestingModule({ imports: [LoginComponent] });
      TestBed.overrideProvider(AuthService, { useValue: authServiceMock() });
      TestBed.overrideProvider(Router, { useValue: routerMock() });
      await TestBed.compileComponents();

      fixture = TestBed.createComponent(LoginComponent);
    });

    it('WHEN the form is submitted THEN an error message is rendered', async () => {
      const harness = await TestbedHarnessEnvironment.harnessForFixture(fixture, LoginHarness);

      await harness.submit({ email: 'a@b.c', password: 'wrong' });

      expect(await harness.errorText()).toBe('Invalid credentials');
    });
  });
});
```

| Concern | Rule |
|---|---|
| Override | One `TestBed.overrideProvider` statement per provider. Each override is a scannable row. |
| Placement | Overrides sit in the `beforeEach` of the `GIVEN` whose state they create. A different override set is a different `GIVEN`. |
| Mock source | `useValue` takes a factory from `test/mocks/` (see `unit-testing.md`). Never an inline object literal. |
| Assert through | Harness or rendered DOM. Not `componentInstance` fields. |

## Rationalizations

| Excuse | Counter |
|---|---|
| "Flat `it` list is shorter." | Shorter and unreadable. The tree is the spec; a flat list hides which state a case assumes. |
| "The else branch is trivial." | Trivial branches ship bugs. Wallaby is yellow; add the case. |
| "Chain the overrides, it is one statement." | One override per row scans; a chain has to be read. |
| "`WHEN` with one `it` is still a describe." | Collapse it. An empty wrapper adds a nesting level for nothing. |
| "`SCENARIO` on every spec for consistency." | `SCENARIO` marks a flow split. Forcing it on a single-flow spec adds noise. |
| "Test the private method to hit the branch." | Reach the branch through the public boundary. Unreachable branch = dead code, delete it. |

## Red Flags

Stop and re-check this reference when reasoning includes:

- "`it('works')`" or any `it` without `THEN`.
- "should" in a test name.
- A `describe` whose text has no Gherkin keyword.
- "Coverage is fine, it is only one yellow line."
- `providers: [{ provide: X, useValue: ... }]` used to override in a component spec.
- Two `expect` groups separated by a second `act` inside one `it`.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `describe('OrderService')` root | `describe('FEATURE: order service')`. |
| `it('should return 90')` | `it('THEN the total drops by the discount amount')`. |
| `GIVEN` with a single collapsed `it` and no `WHEN` text | Keep the `GIVEN`; the `it` reads `WHEN … THEN …`. |
| Inline `{ provide, useValue }` in `configureTestingModule` for an override | `TestBed.overrideProvider(Token, { useValue: tokenMock() })` on its own line. |
| Ternary arm never exercised | Add the `GIVEN` that selects the other arm. |
| Arrange, act, assert interleaved | Three blocks, blank line between. |
