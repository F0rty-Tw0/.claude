---
name: test-driven-development
description: Red-green-refactor cycle with a watched failing test, wired to artification spec conventions. Use when implementing a feature or bug fix in production code that has a test harness.
---

# Test-Driven Development (TDD)

Write the test first, watch it fail, write the minimal code to pass. A test you never saw fail may not test anything: a test written after the code passes immediately, and it checks what you built rather than what was required.

Applies to new features, bug fixes, refactoring, and behavior changes. Throwaway prototypes, generated code, and configuration files are exceptions — confirm with the user.

Wrote implementation before its test? Set it aside, write the test, watch it fail for the right reason, then implement from the test. Never delete code you didn't write this session.

## The cycle

### RED — one failing test

One behavior, `FEATURE` / `GIVEN` / `WHEN` / `THEN` names, real code (mocks only when unavoidable).

```typescript
describe('FEATURE: retry operation', () => {
  describe('GIVEN an operation that fails twice then succeeds', () => {
    it('WHEN it is retried THEN the third attempt result is returned', async () => {
      let attempts = 0;
      const operation = () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      };

      const result = await retryOperation(operation);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });
  });
});
```

A `jest.fn()` chain asserting `toHaveBeenCalledTimes(3)` would test the mock, not the retry.

### Verify RED

Run it (`pnpm test path/to/test.spec.ts`). It must **fail** (not error), with the expected message, because the feature is missing. Passes → it tests existing behavior; fix the test. Errors → fix the error and re-run.

### GREEN — minimal code

The simplest code that passes. No options, features, or refactors beyond the test.

### Verify GREEN

The test passes, other tests still pass, and output is clean (no errors or warnings). Test fails → fix the code, not the test.

### REFACTOR

Only when green: remove duplication, improve names, extract helpers. Stay green; add no behavior. Then the next failing test.

## Bug fixes

Write a failing test that reproduces the bug, then follow the cycle. The test proves the fix and guards against regression.

## Angular components

TestBed plus component harnesses; test rendered behavior, not component internals like `componentInstance.hasError`.

```typescript
describe('FEATURE: LoginComponent', () => {
  describe('GIVEN the auth service is stubbed', () => {
    let fixture: ComponentFixture<LoginComponent>;

    beforeEach(async () => {
      TestBed.configureTestingModule({ imports: [LoginComponent] });
      TestBed.overrideProvider(AuthService, { useValue: authServiceMock() });
      await TestBed.compileComponents();

      fixture = TestBed.createComponent(LoginComponent);
    });

    it('WHEN the form is submitted with an empty email THEN an error message is displayed', async () => {
      const harness = await TestbedHarnessEnvironment.harnessForFixture(fixture, LoginComponentHarness);

      await harness.submitForm({ email: '', password: 'secret' });

      expect(await harness.getErrorText()).toBe('Email required');
    });
  });
});
```

E2E: Playwright, `pnpm exec playwright test`.

## When stuck

| Problem | Try |
|---|---|
| Don't know how to test it | Write the wished-for API and the assertion first; ask the user |
| Test too complicated | The design is too complicated; simplify the interface |
| Must mock everything | Code too coupled; use dependency injection |
| Setup is huge | Extract helpers; still complex → simplify the design |

## Project conventions (TypeScript / Angular)

This file owns the cycle. The `artification` skill owns spec shape and placement; examples here show the cycle only.

| Concern | Reference |
|---|---|
| Where the spec, stubs, mocks, fixtures, spec utils live | `skills/artification/references/unit-testing.md` |
| `describe` / `it` tree (`FEATURE` / `GIVEN` / `WHEN` / `THEN`), branch coverage, `TestBed` overrides | `skills/artification/references/spec-style.md` |

Adding mocks or test utilities? Read `testing-anti-patterns.md` first: testing mock behavior, test-only methods on production classes, and mocking without understanding the dependency.
