import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../src/app.js';
import { createSession, resetSessions } from '../src/auth.js';
import { reset } from '../src/store.js';
import { resetLinks } from '../src/links.js';

process.env.AUDIT_LOG = join(tmpdir(), 'docshare-audit-test.log');

let alice, bob, admin;
const auth = (token) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  reset();
  resetSessions();
  resetLinks();
  alice = createSession({ userId: 'alice', tenantId: 'acme' });
  bob = createSession({ userId: 'bob', tenantId: 'acme' });
  admin = createSession({ userId: 'root', tenantId: 'acme', role: 'admin' });
});

async function docWithLink(linkBody = {}) {
  const created = await handle({ method: 'POST', path: '/documents', headers: auth(alice), body: { title: 'Roadmap' } });
  const doc = created.body.document;
  const res = await handle({ method: 'POST', path: `/documents/${doc.id}/links`, headers: auth(alice), body: linkBody });
  return { doc, link: res.body.link, status: res.status };
}

test('owner creates a link that anonymous users can open', async () => {
  const { link, status } = await docWithLink();
  assert.equal(status, 201);
  const res = await handle({ method: 'GET', path: link.url });
  assert.equal(res.status, 200);
  assert.equal(res.body.document.title, 'Roadmap');
  assert.equal(res.body.document.ownerId, undefined);
  assert.equal(res.body.document.tenantId, undefined);
});

test('link tokens are unique', async () => {
  const { doc } = await docWithLink();
  const tokens = new Set();
  for (let i = 0; i < 100; i++) {
    const res = await handle({ method: 'POST', path: `/documents/${doc.id}/links`, headers: auth(alice) });
    tokens.add(res.body.link.token);
  }
  assert.equal(tokens.size, 100);
});

test('expired links are rejected', async () => {
  const { link } = await docWithLink({ expiresAt: Date.now() - 1000 });
  const res = await handle({ method: 'GET', path: link.url });
  assert.equal(res.status, 410);
});

test('revoked links stop working', async () => {
  const { link } = await docWithLink();
  const del = await handle({ method: 'DELETE', path: link.url, headers: auth(alice) });
  assert.equal(del.status, 204);
  const res = await handle({ method: 'GET', path: link.url });
  assert.equal(res.status, 404);
});

test('only the creator or an admin can revoke', async () => {
  const { link } = await docWithLink();
  const byBob = await handle({ method: 'DELETE', path: link.url, headers: auth(bob) });
  assert.equal(byBob.status, 403);
  const byAdmin = await handle({ method: 'DELETE', path: link.url, headers: auth(admin) });
  assert.equal(byAdmin.status, 204);
});

test('bulk share adds every user', async () => {
  const { doc } = await docWithLink();
  const res = await handle({ method: 'POST', path: `/documents/${doc.id}/shares/bulk`, headers: auth(alice), body: { userIds: ['bob', 'carol'] } });
  assert.equal(res.status, 201);
  const list = await handle({ method: 'GET', path: `/documents/${doc.id}/shares`, headers: auth(alice) });
  assert.equal(list.body.total, 2);
});
