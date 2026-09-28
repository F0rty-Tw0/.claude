import { sessionFromHeaders } from './auth.js';
import { canRead, canWrite } from './access.js';
import * as store from './store.js';
import { publicDoc } from './views.js';

const SHARE_ROLES = new Set(['viewer', 'editor']);

const json = (status, body) => ({ status, body });
const notFound = () => json(404, { error: 'not found' });
const forbidden = () => json(403, { error: 'forbidden' });

export async function handle({ method, path, headers = {}, body = {} }) {
  const session = sessionFromHeaders(headers);
  if (!session) return json(401, { error: 'unauthenticated' });

  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'documents') return notFound();

  if (parts.length === 1) {
    if (method === 'GET') {
      const docs = store.listDocuments(session.tenantId).filter((doc) => canRead(session, doc));
      return json(200, { documents: docs.map(publicDoc) });
    }
    if (method === 'POST') {
      if (typeof body.title !== 'string' || body.title.length === 0 || body.title.length > 200) {
        return json(400, { error: 'invalid title' });
      }
      const doc = store.createDocument({
        tenantId: session.tenantId,
        ownerId: session.userId,
        title: body.title,
        body: String(body.body ?? ''),
      });
      return json(201, { document: publicDoc(doc) });
    }
    return json(405, { error: 'method not allowed' });
  }

  const doc = store.getDocument(parts[1]);
  if (!canRead(session, doc)) return notFound();

  if (parts.length === 2) {
    if (method === 'GET') return json(200, { document: publicDoc(doc) });
    if (method === 'PATCH') {
      if (!canWrite(session, doc)) return forbidden();
      const patch = {};
      if (typeof body.title === 'string') patch.title = body.title;
      if (typeof body.body === 'string') patch.body = body.body;
      return json(200, { document: publicDoc(store.updateDocument(doc.id, patch)) });
    }
    return json(405, { error: 'method not allowed' });
  }

  if (parts[2] === 'shares') {
    if (parts.length === 3 && method === 'GET') {
      return json(200, { shares: store.listShares(doc.id) });
    }
    if (parts.length === 3 && method === 'POST') {
      if (!canWrite(session, doc)) return forbidden();
      if (typeof body.userId !== 'string' || !SHARE_ROLES.has(body.role)) {
        return json(400, { error: 'invalid share' });
      }
      store.addShare(doc.id, body.userId, body.role);
      return json(201, { share: { userId: body.userId, role: body.role } });
    }
    if (parts.length === 4 && method === 'DELETE') {
      if (!canWrite(session, doc)) return forbidden();
      return store.removeShare(doc.id, parts[3]) ? json(204, null) : notFound();
    }
  }

  return notFound();
}
