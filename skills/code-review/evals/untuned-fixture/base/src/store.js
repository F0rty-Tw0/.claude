// In-memory adapter. Mirrors migrations/001_init.sql; the Postgres adapter
// implements the same interface.
const documents = new Map();
const shares = new Map();
let seq = 0;

export function createDocument({ tenantId, ownerId, title, body = '' }) {
  const doc = {
    id: `doc_${++seq}`,
    tenantId,
    ownerId,
    title,
    body,
    createdAt: new Date().toISOString(),
    _version: 1,
  };
  documents.set(doc.id, doc);
  return doc;
}

export function getDocument(id) {
  return documents.get(id) ?? null;
}

export function listDocuments(tenantId) {
  return [...documents.values()].filter((doc) => doc.tenantId === tenantId);
}

export function updateDocument(id, patch) {
  const doc = documents.get(id);
  if (!doc) return null;
  Object.assign(doc, patch, { _version: doc._version + 1 });
  return doc;
}

export function addShare(docId, userId, role) {
  shares.set(`${docId}:${userId}`, { docId, userId, role });
}

export function getShare(docId, userId) {
  return shares.get(`${docId}:${userId}`) ?? null;
}

export function removeShare(docId, userId) {
  return shares.delete(`${docId}:${userId}`);
}

export function listShares(docId) {
  return [...shares.values()]
    .filter((share) => share.docId === docId)
    .map(({ userId, role }) => ({ userId, role }));
}

export function reset() {
  documents.clear();
  shares.clear();
  seq = 0;
}
