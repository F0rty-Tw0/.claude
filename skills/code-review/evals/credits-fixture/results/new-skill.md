## 1. Classification & Blast Radius
- **Class:** Trunk. The highest-risk hunk is `head/src/billing/checkout.mjs:5`. It adds an un-awaited `applyCredit(user, total * 0.05)` on the checkout hot path, which does a read-modify-write on the shared wallet store (`store.mjs:1`: "Used by checkout, refunds, admin tools"). The PR also ships a `NOT NULL` migration (`migrations/003_add_credit_limit.sql:1`) and a new event type that no consumer handles.
- **Blast radius:** 10/10.
  - Base 9: balance and money writes on shared state, plus a migration.
  - +1 because it is ungated on a trunk path in a repo that has flags.
  - +1 because rollback needs data repair.
  - Capped at 10.
- **Failure mode:**
  - **Throws:** a rejection from `store.get` or `store.save` inside the fire-and-forget `applyCredit` becomes an unhandled rejection and crashes the Node process. Every in-flight request fails, not just this checkout.
  - **Silently wrong:**
    - Concurrent credits are lost.
    - `checkout` returns a stale `walletBalance`.
    - Negative or `NaN` totals debit the wallet or poison it.
    - Float money drifts.
    - Ledger entries are silently dropped.
    - No alert fires for any of these.
  - **Concurrent:** 50 parallel credits of 1 give a balance of 2, not 50. Refunds and admin writes on the same store can also clobber each other.
- **Gating:** Ungated on the checkout path (HIGH RISK). `flags.mjs:2` has a flag mechanism, but `checkout.mjs:5` never checks it. Only the badge is gated (`creditBadge`, default OFF, checked at `ui/creditBadge.mjs:3`). The migration cannot be gated.
- **Rollback:** Reverting the deploy stops new damage, but the rollback also needs data repair:
  - wallet balances inflated, deflated or `NaN` from credits already applied
  - lost updates
  - credits missing from the ledger
  - a migration with no down path

## 2. Blockers
- **head/src/billing/checkout.mjs:5** [Confirmed: `green-scratch/reject.mjs` makes the first `store.get` reject, then calls `checkout` → process dies with `Error: db down` at `applyCredit (wallet.mjs:5)` ← `checkout (checkout.mjs:5)`, exit 1] — `applyCredit` is not awaited. Any store error becomes an unhandled rejection and kills the process. If the process survives (for example with a global handler), the credit is lost silently while `checkout` still returns success. → Fix: `await applyCredit(...)` inside try/catch with an explicit failure policy, or send it through a durable job with an idempotency key (order id).
- **head/src/billing/checkout.mjs:5-7** [Confirmed: `green-scratch/repro.mjs` → `checkoutReturned: 0`, `balanceAfterSettle: 5`] — `checkout` reads the wallet while the credit write is still in flight, so it returns a stale (and nondeterministic) `walletBalance`. → Fix: await the credit and return the balance it produced.
- **head/src/billing/wallet.mjs:5-7** [Confirmed: `repro.mjs`, 50 concurrent `applyCredit({id:'race'},1)` against the real store → `concurrent50: 2`] — the read-modify-write (`get` → `+amount` → `save`) has no lock, transaction or atomic increment. Concurrent checkouts lose credits. Refunds and admin tools write the same store, so their updates can be overwritten too. → Fix: use an atomic increment or transaction in the store, or a per-user lock. Add the concurrent-credit invariant test against the real store.
- **head/src/billing/wallet.mjs:4-6 / checkout.mjs:5** [Confirmed: `repro.mjs` → `negative: -5`, `nan: null` (NaN persisted)] — `amount` is never validated.
  - A negative `total` (refund, bad input) turns the credit into a debit.
  - A `NaN` total writes `NaN` into the balance. From then on every later arithmetic result is `NaN`, so the wallet is permanently corrupted.
  - → Fix: reject a non-finite amount or one ≤ 0 at `applyCredit`.
- **head/src/billing/checkout.mjs:5, wallet.mjs:6** [Confirmed: `repro.mjs`, 3 × `19.99*0.05` → `float3x: 2.9985`] — money is float dollars with no rounding rule. Sub-cent fractions build up in stored balances. → Fix: use integer cents with a defined rounding rule (for example `Math.floor(totalCents * 5 / 100)`).
- **head/src/billing/wallet.mjs:9 → head/src/events/consumer.mjs:7** (consumer outside the diff) [Confirmed: `repro.mjs` imports the consumer, then runs credits → `ledgerCreditedEntries: 0`, `ledgerTotal: 0`] — the new `wallet.credited` event reaches `default: return` and is discarded. The ledger no longer reconciles with balances. → Fix: add a `case 'wallet.credited'` ledger branch, and make the default throw or log unknown types.
- **head/migrations/003_add_credit_limit.sql:1** [Inferred: running it on a Postgres or SQLite `wallets` table that has rows would confirm] — `ADD COLUMN ... NOT NULL` with no `DEFAULT` fails on a populated table. There is no down migration. Nothing reads `credit_limit` (grep of `src/` finds 0 hits), so it is dead on arrival. → Fix: drop it from this PR, or use expand→contract (nullable or `DEFAULT 0`, backfill, then constrain) with a down path.
- **head/src/billing/wallet.mjs:8** [Confirmed: `node --test` stdout prints `credit applied { id: 'u1', email: 'a@b.c' }`] — the whole `user` object, including email (PII), is logged on every checkout. → Fix: log `user.id` only.
- **head/src/billing/checkout.mjs:4-5** [Confirmed: read; `flags.mjs:2` has no loyalty flag, and `checkout.mjs` never calls `isEnabled`] — new money behavior is ungated in a repo whose `flags.mjs:1` says "Every new user-facing behavior ships dark behind one". → Fix: add `loyaltyCredits: false` and guard `checkout.mjs:5` with it.

## 3. Should-fix / Notes
- **head/src/ui/creditBadge.mjs:6** [Confirmed: read] — `b.toFixed(2)` throws `TypeError` if `b` is a truthy non-number (for example the string `"5"`). A negative balance renders "No credit". The code is gated OFF and has zero callers (grep finds no import of `renderCreditBadge`), so it is dead on arrival. → Fix: coerce or validate `b`, handle negatives, and wire up a caller or drop it.
- **head/src/billing/wallet.mjs:10** [Confirmed: read] — the function returns a computed `next` rather than the persisted state, so callers can't tell whether the save succeeded. This is minor once the await and error handling are fixed.
- **head/package.json:1** [Confirmed: read] — `"lint": "echo lint ok"` is a fake linter and there is no type checker. This is a process gap, reported once.

## 4. Vanity Test & Invariant Audit
- **Tests run:** `node --test` in `head/` → 2 pass, 0 fail, exit 0.
- **Mutation probes** (scratch copy `green-scratch/head`, restored afterwards; `diff -r` against the fixture shows it identical):
  - M1: delete the `applyCredit` call in `checkout.mjs:5` → still green (2/2). **No test covers checkout at all.**
  - M2: credit `total * 5` (500%) → still green. The 5% rate is untested.
  - M3: delete `bus.emit` (`wallet.mjs:9`) → still green.
  - M4: save without the new balance (`store.save({...wallet})`) → still green. **`applyCredit calls save` should have failed.**
  - M5: flip `+` to `-` (`wallet.mjs:6`) → 1 fail. This is the only mutation caught.
- **Per test:**
  - **`applyCredit works` (wallet.test.mjs:6-12)** — mocks the subject's collaborators and echoes the mock. `store.get` is mocked to 10 and the test asserts 15; `assert.ok(result)` is a tautology. The real store round-trip, where the race lives, is never exercised. The only behavior it proves is `10+5=15`.
  - **`applyCredit calls save` (wallet.test.mjs:14-18)** — call-count only. It never checks what was saved (M4 passes). It also has a leaky mock: the top-level `mock.method` from test 1 is never restored, so in the full run test 2 still sees the mocked `store.get`. This is inferred from `node:test` semantics; test 2 alone also passes, on the real empty store.
- **Missing invariants:**
  1. N concurrent credits of `a` raise the balance by exactly N·a, tested against the real store. It fails today (2 ≠ 50).
  2. After `await checkout(user, total)`, `walletBalance` equals the persisted balance.
  3. A negative, zero, `NaN` or `Infinity` amount is rejected and the balance is unchanged.
  4. Every emitted event type has a consumer branch: after one credit, the ledger holds exactly one `wallet.credited` entry.
  5. A store rejection inside checkout does not crash the process and surfaces an error.
  6. With the flag OFF, the checkout output and the store are identical to base.
  7. The credit for a given total, in cents, matches the defined rounding rule.

## 5. Proof Gaps & Required Proof Before Merge
- **Claim "Fixed crediting"** → base has no crediting code (`wallet.mjs` is new in head), so no bug was fixed. There is no reproduction test and no base-failure check is possible. The claim has no referent.
- **Claim "All tests pass"** → reproduces (2/2, exit 0), but the tests are vanity: 4 of 5 mutations survive.
- **Claim "Verified end to end"** → no artifact at all: no runtime log, order id or ledger rows. The reviewer's own end-to-end run shows a stale balance, lost credits and an empty ledger.
- **Claim "Ready to merge"** → contradicted by the blockers above.

Required before merge:
1. `node --test` passes with the missing invariant tests above, against the real `store.mjs` (no mocks of `get` or `save`), including the 50-way concurrent-credit test.
2. The concurrent-credit test is shown failing on the current head before the fix and passing after it.
3. The migration runs against a populated `wallets` table, with the up and down log attached. Or the migration is removed.
4. A non-mocked runtime log of `checkout` with the flag ON (order id, persisted balance, ledger row) and with the flag OFF (behavior identical to base).
5. A proof bundle with non-empty Verified and Not verified lists and a rollback plan.

## 6. Launch Safety
- **Canary metric:** Sum of wallet balances minus the sum of ledger credit entries (drift should be 0), plus the process crash / unhandled-rejection rate on checkout workers. Roll back on any non-zero drift or any crash above baseline.
- **Not rollback-able by flag:**
  - the `003_add_credit_limit` migration
  - wallet balance writes already applied (credits, negative debits, `NaN`)
  - lost updates to refunds and admin writes on the shared store
  - PII already written to logs
- **Human must deep-read:**
  - `head/src/billing/checkout.mjs:1-8`
  - `head/src/billing/wallet.mjs:4-11`
  - `head/src/billing/store.mjs:1-7` (shared store contract, atomicity)
  - `head/src/events/consumer.mjs:3-9` (outside the diff)
  - `head/migrations/003_add_credit_limit.sql:1`

## 7. Verdict
BLOCK — HIGH BLAST RADIUS DEFECT
**State:** not merge-ready · launch-ready: no — see `launch` mode

Discarded findings: `var` usage, the if/else string build and missing semicolons in `creditBadge.mjs:4-9`. These are style, so they are out of scope.

Scratch artifacts: `/tmp/claude-1000/-home-fortytwo--claude/e371bc24-f417-4457-968a-96e9e05dcea4/scratchpad/green-scratch/{repro.mjs,reject.mjs,review.diff,head/}`. The fixture `base/` and `head/` trees were not modified.
