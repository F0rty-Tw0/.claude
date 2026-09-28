import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { createSession, resetSessions } from '../src/auth.js';
import { reset } from '../src/store.js';

let alice, bob, mallory;
const auth = (token) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  reset();
  resetSessions();
  alice = createSession({ userId: 'alice', tenantId: 'acme' });
  bob = createSession({ userId: 'bob', tenantId: 'acme' });
  mallory = createSession({ userId: 'mallory', tenantId: 'evil', role: 'admin' });
});

async function createDoc(token, title = 'Plan') {
  const res = await handle({ method: 'POST', path: '/documents', headers: auth(token), body: { title } });
  return res.body.document;
}

test('rejects requests without a session', async () => {
  const res = await handle({ method: 'GET', path: '/documents' });
  assert.equal(res.status, 401);
});

test('owner can create and list documents', async () => {
  await createDoc(alice);
  const res = await handle({ method: 'GET', path: '/documents', headers: auth(alice) });
  assert.equal(res.status, 200);
  assert.equal(res.body.documents.length, 1);
  assert.equal(res.body.documents[0]._version, undefined);
});

test('admins of another tenant cannot read the document', async () => {
  const doc = await createDoc(alice);
  const res = await handle({ method: 'GET', path: `/documents/${doc.id}`, headers: auth(mallory) });
  assert.equal(res.status, 404);
});

test('viewer share can read but not edit', async () => {
  const doc = await createDoc(alice);
  await handle({ method: 'POST', path: `/documents/${doc.id}/shares`, headers: auth(alice), body: { userId: 'bob', role: 'viewer' } });
  const read = await handle({ method: 'GET', path: `/documents/${doc.id}`, headers: auth(bob) });
  assert.equal(read.status, 200);
  const edit = await handle({ method: 'PATCH', path: `/documents/${doc.id}`, headers: auth(bob), body: { title: 'x' } });
  assert.equal(edit.status, 403);
});

test('lists shares', async () => {
  const doc = await createDoc(alice);
  await handle({ method: 'POST', path: `/documents/${doc.id}/shares`, headers: auth(alice), body: { userId: 'bob', role: 'editor' } });
  const res = await handle({ method: 'GET', path: `/documents/${doc.id}/shares`, headers: auth(alice) });
  assert.deepEqual(res.body, { items: [{ userId: 'bob', permission: 'editor' }], total: 1 });
});

test('removing a share revokes access', async () => {
  const doc = await createDoc(alice);
  await handle({ method: 'POST', path: `/documents/${doc.id}/shares`, headers: auth(alice), body: { userId: 'bob', role: 'viewer' } });
  const del = await handle({ method: 'DELETE', path: `/documents/${doc.id}/shares/bob`, headers: auth(alice) });
  assert.equal(del.status, 204);
  const read = await handle({ method: 'GET', path: `/documents/${doc.id}`, headers: auth(bob) });
  assert.equal(read.status, 404);
});
