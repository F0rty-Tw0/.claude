import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const H = fileURLToPath(new URL('../../head/src/', import.meta.url));
process.env.AUDIT_LOG = join(tmpdir(), 'untuned-fixture-audit.log');
const { handle } = await import(H + 'app.js');
const { createSession } = await import(H + 'auth.js');
const store = await import(H + 'store.js');
const auth = (t) => ({ authorization: `Bearer ${t}` });
const alice = createSession({ userId: 'alice', tenantId: 'acme' });
const bob = createSession({ userId: 'bob', tenantId: 'acme' });
const evilAdmin = createSession({ userId: 'mallory', tenantId: 'evilcorp', role: 'admin' });

// 1. anonymous open mutates stored doc
const d = (await handle({ method: 'POST', path: '/documents', headers: auth(alice), body: { title: 'Roadmap' } })).body.document;
const l = (await handle({ method: 'POST', path: `/documents/${d.id}/links`, headers: auth(alice), body: {} })).body.link;
console.log('owner GET before open:', (await handle({ method: 'GET', path: `/documents/${d.id}`, headers: auth(alice) })).status);
await handle({ method: 'GET', path: l.url });
console.log('stored doc after anon open:', JSON.stringify(store.getDocument(d.id)));
console.log('owner GET after open:', (await handle({ method: 'GET', path: `/documents/${d.id}`, headers: auth(alice) })).status);
console.log('owner list after open:', (await handle({ method: 'GET', path: '/documents', headers: auth(alice) })).body.documents.length);

// 2. revoke after open -> cache still serves
const d2 = (await handle({ method: 'POST', path: '/documents', headers: auth(alice), body: { title: 'Secret' } })).body.document;
const l2 = (await handle({ method: 'POST', path: `/documents/${d2.id}/links`, headers: auth(alice), body: {} })).body.link;
await handle({ method: 'GET', path: l2.url });
console.log('revoke status:', (await handle({ method: 'DELETE', path: l2.url, headers: auth(alice) })).status);
console.log('GET after revoke:', (await handle({ method: 'GET', path: l2.url })).status);
console.log('second revoke:', (await handle({ method: 'DELETE', path: l2.url, headers: auth(alice) })).status);

// 3. ISO expiresAt never expires
const d3 = (await handle({ method: 'POST', path: '/documents', headers: auth(alice), body: { title: 'Exp' } })).body.document;
const l3 = (await handle({ method: 'POST', path: `/documents/${d3.id}/links`, headers: auth(alice), body: { expiresAt: '2000-01-01T00:00:00Z' } })).body.link;
console.log('GET ISO-expired (2000) link:', (await handle({ method: 'GET', path: l3.url })).status);

// 4. cross-tenant admin revokes acme link
const d4 = (await handle({ method: 'POST', path: '/documents', headers: auth(alice), body: { title: 'X' } })).body.document;
const l4 = (await handle({ method: 'POST', path: `/documents/${d4.id}/links`, headers: auth(alice), body: {} })).body.link;
console.log('evilcorp admin revokes acme link:', (await handle({ method: 'DELETE', path: l4.url, headers: auth(evilAdmin) })).status);

// 5. viewer mints public link
const d5 = (await handle({ method: 'POST', path: '/documents', headers: auth(alice), body: { title: 'ViewOnly' } })).body.document;
await handle({ method: 'POST', path: `/documents/${d5.id}/shares`, headers: auth(alice), body: { userId: 'bob', role: 'viewer' } });
const vr = await handle({ method: 'POST', path: `/documents/${d5.id}/links`, headers: auth(bob), body: {} });
console.log('viewer bob creates public link:', vr.status);
console.log('viewer bob PATCH (control):', (await handle({ method: 'PATCH', path: `/documents/${d5.id}`, headers: auth(bob), body: { title: 'x' } })).status);

// 6. bulk share role not validated
const d6 = (await handle({ method: 'POST', path: '/documents', headers: auth(alice), body: { title: 'Bulk' } })).body.document;
const br = await handle({ method: 'POST', path: `/documents/${d6.id}/shares/bulk`, headers: auth(alice), body: { userIds: ['carol', 42, {x:1}], role: 'owner' } });
console.log('bulk invalid role/ids:', br.status, JSON.stringify(br.body));
console.log('shares stored:', JSON.stringify((await handle({ method: 'GET', path: `/documents/${d6.id}/shares`, headers: auth(alice) })).body));
const single = await handle({ method: 'POST', path: `/documents/${d6.id}/shares`, headers: auth(alice), body: { userId: 'carol', role: 'owner' } });
console.log('single-share same role (control):', single.status);

// 7. token entropy
const tokens = [];
for (let i = 0; i < 2000; i++) tokens.push((await handle({ method: 'POST', path: `/documents/${d6.id}/links`, headers: auth(alice), body: {} })).body.link.token);
const lens = {}; for (const t of tokens) lens[t.length] = (lens[t.length] ?? 0) + 1;
console.log('token length histogram:', JSON.stringify(lens), 'sample:', tokens[0]);
await new Promise(r => setTimeout(r, 100));
