# docshare-api

Multi-tenant document-sharing API. Every request is scoped to the caller's
tenant; a document is visible only to members of its tenant who own it, have a
share on it, or are tenant admins.

Consumers: the web app, the mobile app (v2.x, pinned for 6 months), and the
Zapier integration.

## Auth

`Authorization: Bearer <session token>`. Sessions carry `{ userId, tenantId, role }`
where `role` is `member` or `admin` (admin of **their own tenant** only).

## Endpoints

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| GET | `/documents` | | `{ documents: Document[] }` |
| POST | `/documents` | `{ title, body? }` | `201 { document }` |
| GET | `/documents/:id` | | `{ document }` |
| PATCH | `/documents/:id` | `{ title?, body? }` | `{ document }` (editors only) |
| GET | `/documents/:id/shares` | | `{ shares: [{ userId, role }] }` |
| POST | `/documents/:id/shares` | `{ userId, role }` | `201 { share }` (editors only) |
| DELETE | `/documents/:id/shares/:userId` | | `204` (editors only) |

`role` on a share is `viewer` or `editor`. Documents the caller cannot read
return `404`, not `403`, so ids cannot be probed across tenants.

## Storage

`src/store.js` is the in-memory adapter used in dev and tests. The Postgres
adapter implements the same interface against `migrations/`.
