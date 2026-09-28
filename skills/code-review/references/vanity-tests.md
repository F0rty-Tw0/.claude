# AI Vanity Tests — Audit the Assertions, Not the Coverage

AI authors default to tests that raise coverage while proving almost nothing. Green + high coverage is **not** evidence. Judge each test by one question: **would this test fail if the code were wrong?**

## Patterns to flag

| Pattern | Looks like | Why it proves nothing |
|---|---|---|
| **Mocking the subject** | The function under test, or the exact collaborator whose behavior is the point, is stubbed | You are testing the mock |
| **Mock-echo** | Mock configured to return X, test asserts result is X (or is "derived" from X by trivial math) | Asserts the setup, not the logic |
| **Tautology** | `assert.ok(result)`, `toBeDefined()`, `toBeTruthy()`, `not.toThrow()` as the only check | Almost any output passes |
| **Call-count only** | `expect(save).toHaveBeenCalledTimes(1)` with no check of **what** was saved | Wrong data saved once still passes |
| **Happy path only** | One valid input per function | Bugs live at boundaries |
| **Snapshot as oracle** | Large snapshot written on first run, never reviewed | Freezes current bugs as "expected" |
| **Leaky mocks** | `mock.method` / `jest.spyOn` never restored; test B passes only because test A's mock is still active | Order-dependent; hides real behavior |
| **Timing luck** | Async code tested with no concurrency, or with `sleep` | Races never exercised |
| **Swallowed failures** | `try { ... } catch {}` in test, or missing `await` on an assertion promise | Test cannot fail |
| **Test written after, never red** | Bug-fix PR whose "regression test" also passes on base | Did not reproduce the bug |

## Boundaries the tests should hit (check each is present or consciously skipped)

- null / undefined / empty string / empty array / missing key
- zero, negative, `NaN`, `Infinity`, very large, float precision (money!)
- unexpected type (string where number expected), unexpected UTF-8 / emoji / RTL / 10k-char input
- rejected promise / thrown error from every I/O collaborator; timeout; partial failure mid-sequence
- concurrent calls on the same key; duplicate delivery; out-of-order events
- permission denied / wrong tenant / expired session (when auth is near)

## Invariant tests — what "good" looks like

Assert a **rule of the system**, not an output shape.

```js
// Invariant: N concurrent credits of `amount` raise the balance by exactly N * amount.
// Uses the REAL store (no mocks) — the race lives in the store round-trip.
test('concurrent credits are not lost', async () => {
  const user = { id: 'u-race' };
  await Promise.all(Array.from({ length: 50 }, () => applyCredit(user, 1)));
  const wallet = await store.get(user.id);
  assert.strictEqual(wallet.balance, 50);   // fails today with a read-modify-write race
});
```

Other invariant shapes: "balance never negative", "sum of ledger entries = balance", "every emitted event type has a consumer branch", "flag OFF → output identical to base", "round-trip serialize → parse = original".

## Fast audit procedure

1. For each test: name the **one behavior** it proves. Can't name one → vanity.
2. Circle every mock. Is the mocked thing the subject, or the behavior at risk? → mocking the subject.
3. Mutation probe (see `proof.md` step 5): break the code in a scratch copy; tests still green → vanity, cite which test should have failed.
4. List missing boundaries from the table above that the diff's risky hunk actually touches. Only list relevant ones — a pure formatting helper does not need concurrency tests.

## Reporting

Report vanity tests on trunk/branch code as a **Proof gap** (the tier in `adversarial-inspection.md`), with the exact missing assertion:

`wallet.test.mjs:9 — mock-echo: store.get mocked to balance 10, asserts 15. Never exercises real store round-trip, so the race at wallet.mjs:5-7 is invisible. Add the concurrent-credit invariant test against the real store.`
