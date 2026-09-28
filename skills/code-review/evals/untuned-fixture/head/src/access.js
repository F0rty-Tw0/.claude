import { getShare } from './store.js';

// Tenant check first: nothing crosses a tenant boundary, admins included.
export function canRead(session, doc) {
  if (!session || !doc) return false;
  if (doc.tenantId !== session.tenantId) return false;
  if (session.role === 'admin' || doc.ownerId === session.userId) return true;
  return getShare(doc.id, session.userId) !== null;
}

export function canWrite(session, doc) {
  if (!session || !doc) return false;
  if (doc.tenantId !== session.tenantId) return false;
  if (session.role === 'admin' || doc.ownerId === session.userId) return true;
  return getShare(doc.id, session.userId)?.role === 'editor';
}
