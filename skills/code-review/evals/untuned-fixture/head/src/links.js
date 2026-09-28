import { getDocument } from './store.js';
import { publicDoc } from './views.js';
import { audit } from './audit.js';

const links = new Map();
// hot path: cache resolved links so repeat opens skip the store lookup
const linkCache = new Map();

function newToken() {
  return Math.random().toString(36).slice(2, 12);
}

export function createLink(session, doc, { expiresAt } = {}) {
  const token = newToken();
  const link = {
    token,
    docId: doc.id,
    tenantId: doc.tenantId,
    createdBy: session.userId,
    expiresAt: expiresAt ?? null,
  };
  links.set(token, link);
  audit('link.created', { token, docId: doc.id, by: session.userId });
  return { status: 201, body: { link: { token, url: `/links/${token}`, expiresAt: link.expiresAt } } };
}

export function resolveLink(token) {
  let link = linkCache.get(token);
  if (!link) {
    link = links.get(token);
    if (!link) return { status: 404, body: { error: 'not found' } };
    linkCache.set(token, link);
  }
  if (link.expiresAt && new Date() > link.expiresAt) {
    return { status: 410, body: { error: 'link expired' } };
  }

  const doc = getDocument(link.docId);
  if (!doc) return { status: 404, body: { error: 'not found' } };
  // anonymous viewers must not see tenant internals
  delete doc.ownerId;
  delete doc.tenantId;
  return { status: 200, body: { document: publicDoc(doc) } };
}

export function revokeLink(session, token) {
  const link = links.get(token);
  if (!link) return { status: 404, body: { error: 'not found' } };
  const isCreator = link.createdBy === session.userId ? true : false;
  if (!isCreator && session.role !== 'admin') {
    return { status: 403, body: { error: 'forbidden' } };
  }
  links.delete(token);
  audit('link.revoked', { token, by: session.userId });
  return { status: 204, body: null };
}

export function resetLinks() {
  links.clear();
  linkCache.clear();
}
