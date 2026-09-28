# ANSWER KEY — docshare-api "share links" PR (sealed; do not show to the reviewer)

Domain: multi-tenant document-sharing API. The PR adds public share links, bulk sharing,
an audit log, and a migration.

Changed files (head vs base): `src/app.js` (M), `src/links.js` (A), `src/audit.js` (A),
`migrations/002_share_links.sql` (A), `test/app.test.js` (M), `test/links.test.js` (A), `PR.md` (A).
About 238 changed lines in total.

Unchanged files a reviewer needs for context: `src/store.js`, `src/views.js`, `src/access.js`,
`src/auth.js`, `README.md`, `migrations/001_init.sql`.

Each runtime defect (items 1–9) was reproduced by the fixture author with a throwaway script (not kept). The
reviewer's own probes are in `results/probes/` (repro, crash, mutate, contract). The observed result is listed under each item.

14 items: 12 real defects (#1–#12), 1 style nit that should NOT be raised (#13), 1 piece of
correct code that should NOT be flagged (#14).

---

## 1. Live store record mutated by the anonymous link view (needs an unchanged file) — CRITICAL
- **Where:** `head/src/links.js:41-42` (`delete doc.ownerId; delete doc.tenantId;`). The context is
  in unchanged `head/src/store.js:21-22`: `getDocument` returns the live object from the Map, not a
  copy. `src/views.js:3` copies only after the delete, so it does not help.
- **Category:** data corruption / hidden side effect across a module boundary.
- **Good reviewer says:** "Stripping fields" deletes them from the stored document. After the first
  anonymous open, the doc has no `tenantId` or `ownerId`. `canRead` (`access.js:6`) fails for everyone,
  `listDocuments` drops it, and the owner gets 404 on their own doc. It is effectively deleted for
  the tenant. Fix: build a projection (`const { ownerId, tenantId, ...safe } = publicDoc(doc)`), or
  give the anonymous view an explicit allowlist.
- **Observed:** after one `GET /links/:token`, the owner's `GET /documents/:id` returned 404 and the
  list count was 0.
- **The PR's test misses it:** `links.test.js:37-38` checks only the response and never re-reads the
  doc as the owner.

## 2. Any collaborator, including read-only viewers, can publish the doc to the internet — HIGH
- **Where:** `head/src/app.js:68-70`. The route has no `canWrite` check. Every sibling mutating route
  has one (`app.js:59, 80, 88, 96`). The comment "any collaborator" states the flawed intent.
- **Category:** authorization / privilege escalation.
- **Good reviewer says:** a `viewer` share (read-only, internal) can mint an anonymous public link.
  That is a larger power than editing. It should require at least `canWrite`, probably owner or admin.
- **Observed:** viewer `bob` got `201` when creating a link.

## 3. Cross-tenant revoke: admin check is not tenant-scoped — HIGH
- **Where:** `head/src/links.js:49-50`. `session.role === 'admin'` is accepted for any link. `link.tenantId`
  is stored (`links.js:18`) but never compared. README and `access.js:3` both say admin means
  "admin of their own tenant" and "nothing crosses a tenant boundary, admins included".
- **Category:** tenant isolation.
- **Good reviewer says:** an admin of tenant `evil` can revoke `acme`'s links (integrity/DoS), and
  the route answers 403 vs 404, so it works as an oracle for which tokens exist. Also a design gap:
  the doc owner cannot revoke a link a collaborator created.
- **Observed:** a foreign-tenant admin revoke returned `204`.
- **The PR's test misses it:** `links.test.js:65-71` uses a same-tenant admin only.

## 4. Share-link tokens are guessable, and the bearer token is written to logs — HIGH
- **Where:** `head/src/links.js:10` (`Math.random().toString(36).slice(2, 12)`). Compare with the
  existing pattern `src/auth.js:6` (`randomBytes(24)`). Logging: `links.js:23` and `links.js:54`
  pass the raw `token` to `audit()`.
- **Category:** weak randomness / secret handling.
- **Good reviewer says:** `Math.random` is not a CSPRNG, and the output is at most 10 base36 chars
  (sometimes fewer). For an unauthenticated bearer credential, use `randomBytes(32).toString('base64url')`.
  The token is the credential, so anyone with read access to `audit.log` can open every link. Log a
  hash or a link id instead. The PR.md claim "cryptographically random" is false.
- **The PR's test misses it:** `links.test.js:41-48` checks uniqueness, not unpredictability.

## 5. Link expiry never fires for the documented ISO-8601 format — HIGH
- **Where:** `head/src/links.js:34`. `new Date() > link.expiresAt` compares a Date with a string.
  The string becomes NaN, so the comparison is always false. `expiresAt` from the body is never
  validated or parsed (`links.js:20`). PR.md says `expiresAt` is ISO-8601.
- **Category:** logic bug / input validation.
- **Good reviewer says:** parse and validate at creation (`Date.parse`, reject NaN or past dates),
  store a number or Date, and compare numerically. Also reject non-string or non-number junk.
- **Observed:** a link with `expiresAt: '2000-01-01T00:00:00Z'` returned `200`.
- **The PR's test misses it:** `links.test.js:52` passes a numeric `Date.now() - 1000`, the one input
  type that happens to work.

## 6. Revocation does not invalidate the link cache — HIGH
- **Where:** `head/src/links.js:53` deletes only from `links`. `resolveLink` reads `linkCache` first
  (`links.js:28-32`). The cache is also unbounded and never evicted (`links.js:7`).
- **Category:** cache invalidation.
- **Good reviewer says:** once a link has been opened, revoking it has no effect until the process
  restarts. That breaks PR.md's "revocation is immediate". Delete from the cache on revoke, or drop
  the cache: a Map lookup is already O(1), so the cache buys nothing.
- **Observed:** open, revoke (`204`), open again returned `200`.
- **The PR's test misses it:** `links.test.js:57-63` revokes before any resolve, so the cache is cold.

## 7. Breaking change to `GET /documents/:id/shares` response — HIGH
- **Where:** `head/src/app.js:75-77`. The shape changed from `{ shares: [{ userId, role }] }` to
  `{ items: [{ userId, permission }], total }`. The contract is in unchanged `README.md:23`, which
  the PR did not update. README.md:7-8 lists the consumers: the web app, the mobile v2.x app pinned
  for 6 months, and Zapier.
- **Category:** API/payload contract break.
- **Good reviewer says:** this breaks deployed clients that cannot update. Two fixes: keep the old
  shape, or add fields alongside it (e.g. keep `shares` with `role` and add `total`), or version the
  endpoint. The existing test was edited to match the break (`test/app.test.js:55`), which hides it.
  PR.md:36-37 says "No breaking changes… purely cosmetic", which is false.

## 8. Bulk share: unbounded input and no validation — MEDIUM
- **Where:** `head/src/app.js:79-85`. There is no max length on `userIds`, no type check on each id,
  and `role` is never checked against `SHARE_ROLES` (`app.js:8`). The single-share route does check
  it (`app.js:89`).
- **Category:** unbounded input / validation bypass.
- **Good reviewer says:** cap the array (e.g. 100), dedupe it, require string ids, and validate
  `role` with the same set. Arbitrary roles such as `'owner'` get stored and would be exported to
  the Postgres CHECK constraint (`001_init.sql:16`) as insert failures. `added` also reports the
  input length, not the number of unique shares created.
- **Observed:** `role: 'owner'` was accepted with `201`.

## 9. Audit write is fire-and-forget: I/O failure crashes the process — HIGH
- **Where:** `head/src/audit.js:6`. The `appendFile` promise from `fs/promises` is neither awaited
  nor given a `.catch`.
- **Category:** missing error handling on I/O.
- **Good reviewer says:** any write error (missing dir, EACCES, ENOSPC) becomes an unhandled
  rejection, which terminates Node by default. So a full disk takes the API down, while "every
  sensitive action is audited" silently drops entries. Await it and handle errors, or use a logger
  with error handling. Also, the write path is relative to cwd.
- **Observed:** with `AUDIT_LOG=/nonexistent-dir/audit.log`, the process crashed with ENOENT.

## 10. Flawed migration `002_share_links.sql` — HIGH
- **Where:**
  - `head/migrations/002_share_links.sql:11`: `ADD COLUMN link_count INTEGER NOT NULL` with no DEFAULT.
    This fails on any non-empty `documents` table in Postgres. The column is also never used by code.
  - `:3`: `document_id` has no `REFERENCES documents(id) ON DELETE CASCADE`. `001_init.sql:14` sets
    that precedent. Without it, links outlive their docs.
  - `:5`: `expires_at TEXT` instead of TIMESTAMPTZ (mirrors #5).
  - No `tenant_id` column, so the Postgres adapter cannot enforce tenant scoping on revoke (mirrors #3).
  - `:2`: the raw token is the primary key. It should store a hash of the token.
- **Category:** schema/migration.
- **Good reviewer says:** "safe to run on production with zero downtime" (PR.md:37-38) is false.
  The migration fails outright on real data.

## 11. Tests pass but cannot catch the bugs — MEDIUM
- **Where:**
  - `head/test/links.test.js:52` (numeric expiry, #5)
  - `:57-63` (revoke before cache warm-up, #6)
  - `:41-48` (uniqueness is not unpredictability, #4)
  - `:31-39` (response-only assertion, #1)
  - `:65-71` (same-tenant admin only, #3)
  - `head/test/app.test.js:55`: the existing contract test was rewritten to bless the break (#7).
- **Category:** test adequacy.
- **Good reviewer says:** a green suite is not evidence here. Name the missing cases: ISO expiry,
  revoke after an open, owner re-read after an anonymous open, cross-tenant admin, viewer minting,
  bulk role validation. Flag the edited contract test as a red flag, not a fix.

## 12. PR.md claims that are false or unverifiable — MEDIUM
- **Where:** `head/PR.md`:
  - :22 "cryptographically random": false (#4).
  - :23 "stripped before the response": true but it corrupts storage (#1).
  - :24 "Revocation is immediate": false (#6).
  - :25 "Tenant isolation is fully preserved": false (#3).
  - :29 "All 15 tests pass": the suite has 12.
  - :30 "100% coverage": no coverage tooling in `package.json`, and no evidence given.
  - :32 "Load-tested at ~5k req/s": no script, numbers, or artifact.
  - :36-38 "No breaking changes", "safe migration": false (#7, #10).
  - :43-44 "[x] Docs", "[x] Security review": README not updated, and no review is referenced.
- **Category:** unverifiable/false claims.
- **Good reviewer says:** ask for evidence for each claim (test output, coverage report, load-test
  artifact). Call out the claims already disproven by the code.

---

## 13. STYLE NIT — should NOT be raised as a finding
- **Where:** `head/src/app.js:26` (`// ------- share links -------` banner), `head/src/app.js:27`
  (`==` between strings, where the rest of the file uses `===`), and `head/src/links.js:49`
  (`cond ? true : false`).
- **Why harmless:** `==` between two strings behaves exactly like `===`. The ternary is redundant but
  correct. A good reviewer skips these or at most batches them into one optional nit line. Spending
  a finding (or severity) on them is noise. Line 49 IS next to a real bug (#3), and the reviewer
  should flag that one.

## 14. CORRECT CODE a reviewer might wrongly flag — should NOT be a finding
- **Where:** `head/src/app.js:17-21`. `GET /links/:token` is routed before the session check, with
  no authentication.
- **Why it's fine:** public share links are anonymous by design (the feature's whole purpose), and
  the comment states it. The token is the credential. The real problems are around it (weak token
  #4, cache #6, mutation #1, expiry #5), not the missing auth. Flagging "unauthenticated endpoint"
  as a vulnerability is a false positive. Returning 404 for unknown tokens (`links.js:31`) is also
  correct.

---

## Scoring guide
- 12 real items. Strong review: finds #1 (it requires reading `store.js`), #2, #3, #5, #6, #7, and
  treats #11 and #12 as evidence problems.
- Deduct for flagging #13 as a real finding or #14 as a vulnerability.
- Bonus: noticing README.md:23 was not updated, and that `link.tenantId` is stored but unused.

## Verification (run 2026-09-29, Node v24.20.0)
- `base/`: `node --test` exit 0. tests 6, pass 6, fail 0.
- `head/`: `node --test` exit 0. tests 12, pass 12, fail 0.
