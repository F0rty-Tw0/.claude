process.env.AUDIT_LOG = '/nonexistent-dir/audit.log';
const H = new URL('../../head/src/', import.meta.url).pathname;
const { handle } = await import(H + 'app.js');
const { createSession } = await import(H + 'auth.js');
const a = createSession({ userId: 'alice', tenantId: 'acme' });
const d = (await handle({ method: 'POST', path: '/documents', headers: { authorization: `Bearer ${a}` }, body: { title: 't' } })).body.document;
const r = await handle({ method: 'POST', path: `/documents/${d.id}/links`, headers: { authorization: `Bearer ${a}` }, body: {} });
console.log('handler returned', r.status, '- now waiting for fs');
setTimeout(() => console.log('still alive'), 200);
