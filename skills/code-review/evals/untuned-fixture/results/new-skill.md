## 1. Classification & Blast Radius
- **Class:** Trunk. The highest-risk hunk is `src/links.js:42-43`: an unauthenticated route mutates shared store state. Other trunk hunks:
  - a public API contract change at `src/app.js:76-77`
  - a migration at `migrations/002_share_links.sql:11`
  - a new route that skips the session check at `src/app.js:19-21`
  - new token/secret logic at `src/links.js:9-11`
- **Blast radius:** 10/10. The change touches auth, cross-tenant exposure, a stored-data change caused by anonymous traffic, a breaking API response change for pinned mobile and Zapier clients, and a migration that fails on populated tables. None of it is gated.
- **Failure mode:**
  - **Throws:** any audit write failure (bad path, disk full, permissions) is an unhandled promise rejection, and it kills the Node process. That is every tenant down, not one request.
  - **Silently wrong:** one anonymous link open strips `tenantId` and `ownerId` from the stored document. The owner then gets 404 and the doc drops out of their list. No error fires. Revoked links and ISO-dated expired links keep serving the document.
  - **Concurrent:** the audit log lines land out of order (seen in the repro). Links live in a per-process `Map`, so they will not resolve on other instances (Inferred).
- **Gating:** Ungated on every new path, including the unauthenticated `GET /links/:token` (HIGH RISK). The repo has no flag mechanism.
- **Rollback:** a deploy revert is not enough. Needs data repair: documents opened via a link have lost `tenantId`/`ownerId` (the in-memory store loses them until restart; a Postgres adapter would persist the loss). Audit logs contain live link tokens and must be purged. Any `link_count` column already applied must be removed.

## 2. Blockers
- **src/links.js:38-43** [Confirmed: `review-f2/repro.mjs`] — `getDocument` returns the live stored object, and `delete doc.ownerId; delete doc.tenantId` mutates it.
  - After one anonymous open, the stored doc became `{"id":"doc_1","title":"Roadmap",...}` with no tenant or owner fields.
  - Owner `GET /documents/doc_1` went from 200 to 404, and the owner's list count went to 0.
  - Any stranger holding a link can make the document disappear for its whole tenant.
  - Fix: never mutate. `const { ownerId, tenantId, ...safe } = doc; return publicDoc(safe);`. Add a test that the owner can still `GET` the doc after an anonymous open.

- **src/links.js:28-33, 54** [Confirmed: repro] — `revokeLink` deletes from `links` but never from `linkCache`.
  - Sequence: open, then `DELETE` (204), then `GET` still returns 200 with the document. A second `DELETE` returns 404, so the link cannot be killed at all.
  - The PR claims "Revocation is immediate", which is false.
  - Fix: `linkCache.delete(token)` in `revokeLink`. Better, delete the cache: a `Map.get` is already O(1), so the cache adds nothing.

- **src/links.js:9-11** [Confirmed: repro] — tokens come from `Math.random().toString(36).slice(2, 12)`. That is not a cryptographic source, gives about 51 bits at best, and is sometimes shorter: 16 of 2000 tokens had 9 characters.
  - This token is the only credential for anonymous document access.
  - The PR claims "cryptographically random", which is false.
  - Fix: `randomBytes(24).toString('base64url')` from `node:crypto`, as `auth.js:6` already does.

- **src/links.js:34** [Confirmed: repro] — `new Date() > link.expiresAt` compares a Date with a string. The string becomes `NaN`, so the check is always false.
  - A link with `expiresAt: '2000-01-01T00:00:00Z'` returned 200. The PR advertises ISO-8601 input, so every documented expiry is ignored.
  - Only the numeric form the test uses works.
  - Fix: at creation, `const ms = Date.parse(expiresAt)` and return 400 if it is `NaN`. Store `ms` and compare with `Date.now() > link.expiresAt`.

- **src/links.js:47-52** [Confirmed: repro] — revocation has no tenant check. An admin session of tenant `evilcorp` revoked an `acme` link and got 204.
  - The README (line 13) says admins act on their own tenant only, and `link.tenantId` is stored but never read.
  - Fix: `if (link.tenantId !== session.tenantId) return 404` before the role check.

- **src/app.js:68-71** [Confirmed: repro] [Intent: the comment says "any collaborator", so this may be deliberate] — `createLink` is gated only by `canRead`.
  - Viewer `bob` got 403 on `PATCH` but 201 on minting a public, anonymous link. Read-only access turns into "publish to the internet".
  - `resolveLink` never re-checks the creator's access, so the link outlives the viewer's revoked share (traced: `links.js:27-44`).
  - Fix: require `canWrite(session, doc)`, or owner/admin only. Consider invalidating links when the creator loses access.

- **src/app.js:79-86** [Confirmed: repro] — bulk share skips the validation that single share enforces.
  - `role: 'owner'` and `userIds: ['carol', 42, {x:1}]` returned `201 {"added":3}` and were stored.
  - The same role on single `POST /shares` returns 400 (`app.js:89`).
  - Against Postgres, the `CHECK (role IN ('viewer','editor'))` at `001_init.sql:16` makes the loop fail midway: some shares written, a 400 returned, audit never written (Inferred, no Postgres available).
  - Fix: `SHARE_ROLES.has(role)`, every id must be a non-empty string, cap the array length, and validate everything before the first `addShare`.

- **src/app.js:74-77** [Confirmed: base `test/app.test.js` run against head code fails the `lists shares` test; actual `{ items, total }`, expected `{ shares }`] — breaking change to a documented contract.
  - `shares` becomes `items`, and `role` becomes `permission`.
  - README lines 7 and 23 name the mobile v2.x client (pinned for 6 months) and Zapier as consumers of `{ shares: [{ userId, role }] }`.
  - The PR says "no breaking changes … all clients will keep working", which is false. The existing test was edited to match instead of catching the break.
  - Fix: keep `{ shares: [{ userId, role }] }`. If the new shape is wanted, add it under a new version or path, expand then contract.

- **migrations/002_share_links.sql:11** [Confirmed on SQLite: `Cannot add a NOT NULL column with default value NULL`. Postgres semantics Inferred: it fails with "contains null values" on any non-empty `documents` table, and no Postgres was available to run it] — `ADD COLUMN link_count INTEGER NOT NULL` has no default.
  - It fails on the production table, and nothing reads the column (grep for `link_count` in `src`/`test` returned no hits).
  - The PR claims it is "safe to run on production with zero downtime", which is false.
  - Fix: drop the line. If it is ever needed, use `NOT NULL DEFAULT 0`.

- **src/audit.js:6** [Confirmed: `review-f2/crash.mjs`, with `AUDIT_LOG=/nonexistent-dir/audit.log`, returns 201 and then the process exits with code 1] — `appendFile` is not awaited and has no `.catch`.
  - A single write failure crashes the whole server.
  - The same bug also loses write ordering: the repro log has a later line with an earlier timestamp.
  - Fix: `appendFile(...).catch(err => console.error('audit write failed', err.code))`. Ideally write to a stream, or await it on the security events.

- **src/links.js:23, 55** [Confirmed: `review-f2/audit.log` contains `"token":"vjqvrujz7m"`] — the audit log records the raw link token, which is the anonymous access credential.
  - Anyone with log read access can open every shared document.
  - Fix: log a hash (`sha256(token).slice(0,12)`) or a separate link id, never the token.

## 3. Should-fix / Notes
- **src/links.js:5-7** [Inferred: confirm with a restart or two instances] — links live only in a module-level `Map`, outside the `store.js` interface.
  - They are lost on restart and will not resolve across instances.
  - The Postgres adapter has no interface to implement, so `share_links` is a table nothing writes to.
  - Fix: add `createLink`/`getLink`/`deleteLink` to `store.js` and route `links.js` through it.
- **migrations/002_share_links.sql:1-7** [Confirmed: read] — the table has no `tenant_id` (the code relies on `link.tenantId`), no FK to `documents(id)` (links orphan when a document is deleted), and `expires_at TEXT` instead of `TIMESTAMPTZ`.
  - Fix: add `tenant_id TEXT NOT NULL`, `REFERENCES documents(id) ON DELETE CASCADE`, and `expires_at TIMESTAMPTZ`.
- **src/links.js:7, 32** [Confirmed: read] — `linkCache` is unbounded and never evicted. Revoked entries stay forever, and it adds no speedup over `links.get`.
  - Fix: delete it. That also closes the revoke blocker.
- **src/links.js:47-49** [Inferred] — `DELETE /links/:token` returns 404 for a missing token and 403 for someone else's. Any authenticated user can probe which tokens exist.
  - Fix: return 404 for both.
- **README.md:15-25** [Confirmed: read] — none of the 4 new endpoints are documented, and the shares row still shows the old shape. The PR ticks "Docs".
  - Fix: document the new endpoints and keep the old shares contract.
- **Pre-existing (Note), src/server.js:12 + src/app.js:14** — a JSON body of `null` bypasses the `body = {}` default, and `body.title` throws. The error is caught and returned as 400, so there is no crash. Author's call.

## 4. Vanity Test & Invariant Audit
- **Tests run:** `node --test` in `fixture2/head`: 12 tests, 12 pass, 0 fail, exit 0. Base: 6 tests, 6 pass.
- **Mutation probes** (`review-f2/mutate.mjs`, run on copies):
  - M1, remove the `canWrite` check on bulk share: still green (12/12). No test covers bulk authz.
  - M2, `audit()` writes nothing: still green. No test covers audit.
  - M3, expiry check replaced with `if (false)`: 1 test fails (good).
  - M4, bulk ignores `body.role`: still green.
  - M5, `revokeLink` skips `links.delete`: 1 test fails (good).
- **Per test:**
  - **owner creates a link that anonymous users can open** — it proves the response lacks `ownerId`/`tenantId`. But it passes because of the corrupting `delete` on the stored doc, so it treats the bug as expected behavior. It never checks the stored doc or that the owner can still read it.
  - **link tokens are unique** — vanity. 100 tokens colliding is not the risk, and `Math.random` passes it. It proves nothing about unguessability.
  - **expired links are rejected** — happy path with a numeric `expiresAt` only. The documented ISO-8601 input is untested and broken.
  - **revoked links stop working** — never opens the link before revoking, so the cache path, which is the real bug, is never exercised.
  - **only the creator or an admin can revoke** — same-tenant only. No cross-tenant admin case.
  - **bulk share adds every user** — owner-only happy path. Asserts `total` only, not the role, validation, or authz (M1 and M4 survive).
  - **lists shares (edited)** — rewritten to accept the breaking shape. It is the one test that would have caught the contract break, and it was changed to pass.
- **Missing invariants:**
  - Anonymous `GET /links/:t` must not change the store: after an open, the owner still gets 200 and `store.getDocument(id)` is deep-equal to before.
  - Open, then revoke, then open must give 404.
  - An ISO past `expiresAt` must give 410, and an invalid `expiresAt` must give 400.
  - A cross-tenant admin `DELETE` on a link must give 404.
  - A viewer `POST /links` must give 403, if the intent is editor-only.
  - Bulk share with an invalid role or non-string id must give 400 with no shares written. A non-editor must get 403.
  - Tokens must be at least 32 characters and come from crypto (assert length, and review the generator source).
  - Audit write failure must not crash (point `AUDIT_LOG` at a bad path and assert the process stays alive).
  - The shares response must match the README contract.

## 5. Proof Gaps & Required Proof Before Merge
- "All 15 tests pass" → did not reproduce. There are 12 tests.
- "100% coverage of the new code" → no coverage artifact. M1, M2 and M4 survive, and the bulk validation and audit error paths are untested.
- "Expiry, revocation, and permission edge cases are covered" → false. The ISO expiry, revoke-after-open, cross-tenant revoke and viewer-mint cases are all broken and all green.
- "Load-tested locally at ~5k req/s … zero errors" → no artifact.
- "Tokens are cryptographically random" → false (`links.js:10`).
- "Anonymous viewers never see ownerId/tenantId" → true only because the stored doc is destroyed.
- "Revocation is immediate" → false (cache).
- "Tenant isolation is fully preserved; I re-checked every route" → false (`links.js:47-52`, cross-tenant revoke).
- "No breaking changes … purely cosmetic" → false (the base contract test fails on head).
- "Migration is safe … zero downtime" → false (`002:11`).
- Checklist "Docs" and "Security review" → no artifact. README not updated.

Required before merge:
1. `node --test`, including every invariant test listed in section 4, each shown failing on the current head before the fix.
2. The base `test/app.test.js` `lists shares` must pass unchanged on the new head, proving the contract is kept.
3. The migration applied to a scratch Postgres with at least one existing `documents` row, with output shown. Plus the adapter code that reads and writes `share_links`.
4. A real `node src/server.js` log of the flow create link → anonymous open → owner `GET` (200) → revoke → open (404), with the audit log showing no raw tokens.
5. A **Not verified** list from the author, for example multi-instance behavior and Postgres adapter parity.

## 6. Launch Safety
- **Canary metric:** 404 rate on owner `GET /documents/:id`, and process restarts or exit code 1. Roll back on any rise above baseline.
- **Not rollback-able by flag:**
  - a migration (`002_share_links.sql`)
  - document fields destroyed by anonymous opens (needs data repair)
  - link tokens written to `audit.log` (needs log purge and token rotation)
  - public links already handed out to people outside the tenant
- **Human must deep-read:**
  - `src/links.js:1-61` (whole file)
  - `src/app.js:14-29`, `src/app.js:68-86`
  - `src/audit.js:1-7`
  - `migrations/002_share_links.sql:1-11`

## 7. Verdict
BLOCK — HIGH BLAST RADIUS DEFECT
**State:** not merge-ready · launch-ready: no — see `launch` mode

Discarded findings:
- `==` vs `===` at `app.js:27` — style, no coercion bug on string/number compare here.
- Mutation probe M6 — badly built (the filter was a no-op for a 2-item array), so the result means nothing.
- `revokeLink` 204 with `body: null` — `server.js:24` handles `null` correctly.

Scratch evidence is in `/tmp/claude-1000/-home-fortytwo--claude/e371bc24-f417-4457-968a-96e9e05dcea4/scratchpad/review-f2/`:
- `repro.mjs`
- `crash.mjs`
- `mutate.mjs`
- `audit.log`
- `contract/` (base test run against head)
- `m1..m6/` (mutation copies)
