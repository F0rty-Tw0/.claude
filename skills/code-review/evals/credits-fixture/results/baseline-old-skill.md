CODE REVIEW REPORT
==================

Files Reviewed: 7 (PR.md, migrations/003_add_credit_limit.sql, src/billing/checkout.mjs, src/billing/wallet.mjs, src/billing/wallet.test.mjs, src/ui/creditBadge.mjs, plus unchanged context: store.mjs, bus.mjs, consumer.mjs, flags.mjs)
Total Issues: 11

Evidence gathered:
- `node --test` in head/: 2 pass, 0 fail, exit 0. Both tests are unit tests on applyCredit only. Nothing tests checkout.
- I wrote a repro script in the scratchpad (not in the PR tree) that calls the real checkout/store/consumer modules:
  - 45 of 50 sequential checkouts returned a stale walletBalance (0 instead of 5).
  - 20 concurrent checkouts for one user left a balance of 10; it should be 100.
  - The ledger got 0 entries.
- I ran the migration against an SQLite table that already had a row (Python sqlite3). Error: "Cannot add a NOT NULL column with default value NULL".

CRITICAL (0)
-----------
(none)

HIGH (5)
--------
1. src/billing/checkout.mjs:5
   Issue: `applyCredit(user, total * 0.05)` is called without `await`. checkout then runs `store.get` right away and returns before the credit is saved.
   Risk:
   - walletBalance comes back stale most of the time (45/50 in the repro).
   - If applyCredit rejects (store failure), the rejection is unhandled. That can crash the Node process, and the order still looks successful.
   Fix: `await applyCredit(...)` and return its wallet, instead of reading from the store a second time.

2. src/billing/wallet.mjs:5-7
   Issue: The credit is a read-modify-write (get balance, add, save) with no lock and no atomic increment.
   Risk: Concurrent checkouts for the same user overwrite each other's credit. The repro lost 90% of credits (10 instead of 100). store.mjs:1 says refunds and admin tools share this store, so their writes race with this one too.
   Fix: Use an atomic increment in the store, or serialize writes per user (a per-user lock or queue).

3. migrations/003_add_credit_limit.sql:1
   Issue: `ADD COLUMN credit_limit INTEGER NOT NULL` has no DEFAULT.
   Risk: It fails on any wallets table that already has rows (reproduced on SQLite; Postgres rejects it the same way). The deploy migration breaks in production.
   Also:
   - Nothing in the code reads or writes credit_limit (grep confirms).
   - There is no down migration.
   Fix: `ADD COLUMN credit_limit INTEGER NOT NULL DEFAULT 0`, or add it nullable, backfill, then add the constraint. Or drop the column from this PR until something uses it.

4. src/billing/checkout.mjs:4-5
   Issue: The loyalty credit is live for every order and not behind a flag.
   Risk: src/flags.mjs:1 states the project rule: "Every new user-facing behavior ships dark behind one." The badge follows it (`creditBadge` flag); the money-moving part does not. No kill switch if crediting misbehaves.
   Fix: Add a `loyaltyCredit` flag, default false, and gate the applyCredit call on it.

5. src/billing/wallet.mjs:9 + src/events/consumer.mjs:4-7
   Issue: applyCredit emits `wallet.credited`, but the consumer's switch only handles `wallet.debited` and `order.placed`. Everything else hits `default: return`.
   Risk: Credits change balances but never reach the ledger, so there is no audit trail for money added (repro: 0 ledger entries).
   Fix: Add a `wallet.credited` case to the consumer, plus a test that asserts a ledger entry after checkout.

MEDIUM (4)
----------
6. src/billing/wallet.mjs:8
   Issue: `console.log('credit applied', user)` logs the whole user object. The test run shows email in stdout: `{ id: 'u1', email: 'a@b.c' }`.
   Risk: PII (personal data) leaks into logs, and stray console output lands in production.
   Fix: Log only `user.id` and `amount` through the project's logger, or remove the line.

7. src/billing/checkout.mjs:5
   Issue: Money is floating point: `total * 0.05` gives fractional, imprecise values (19.99 * 0.05 = 0.9994999999999999). These accumulate in balance. The new credit_limit column is INTEGER, which suggests integer cents is the intended unit.
   Fix: Work in integer cents with an explicit rounding rule, e.g. `Math.round(totalCents * 5 / 100)`.

8. src/billing/wallet.test.mjs:7-8, 15
   Issue: The mocks use the global `mock.method`, not `t.mock`, and are never restored.
   - Inferred from node:test semantics, not separately checked: the get mock from test 1 leaks into test 2, so test 2 only passes because of test order.
   - `assert.ok(result)` is redundant with the next assertion.
   - No test covers checkout, the missing await, concurrency, the emitted event, or the ledger. The tests pass while every HIGH above is live.
   Fix: Use `t.mock.method` per test (auto-restored). Add checkout-level tests: the returned balance includes the credit, N concurrent checkouts produce N credits, and a ledger entry is recorded.

9. PR.md:5
   Issue: The claims don't hold up.
   - "Fixed crediting" matches nothing in the diff; crediting is brand new here.
   - "Verified end to end" has no e2e test or evidence behind it.
   - "All tests pass" is true only for 2 shallow unit tests.
   Fix: Remove or back the claims with evidence. Say what was actually verified.

LOW (2)
-------
10. src/ui/creditBadge.mjs:2-10
    Issue: Style drift. It uses `var`, reassigns string concatenation, puts an if/else on one line, and misses semicolons. `b.toFixed` throws if b is undefined or a string. The function is not called anywhere and has no test.
    Fix: Use const plus a single template literal, e.g. `` `<span class="badge${b > 0 ? '' : ' badge--empty'}">${b > 0 ? `Credit: $${b.toFixed(2)}` : 'No credit'}</span>` ``. Either wire it up with a test or defer it. No XSS risk while b is a number.

11. src/billing/wallet.mjs:4
    Issue: Credits are never reversed. store.mjs:1 mentions refunds, but nothing claws back loyalty credit when an order is refunded. This is inferred: there is no refund code in the tree to confirm the flow. A refund could let the user keep the 5%.
    Fix: Define the refund behaviour, or document it as intended.

RECOMMENDATION: REQUEST CHANGES

Five HIGH issues must be fixed before merge. They are reproduced, not guessed:
- stale balance from the un-awaited credit (repro)
- lost-update race in applyCredit (repro)
- a migration that fails on a populated table (repro)
- the loyalty credit ships without a flag, against the flags.mjs rule
- credits never reach the ledger (repro)

The green test run doesn't cover any of these paths.
