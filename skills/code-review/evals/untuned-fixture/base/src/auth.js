import { randomBytes } from 'node:crypto';

const sessions = new Map();

export function createSession({ userId, tenantId, role = 'member' }) {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, { userId, tenantId, role });
  return token;
}

export function sessionFromHeaders(headers = {}) {
  const match = /^Bearer (\S+)$/.exec(headers.authorization ?? '');
  return match ? sessions.get(match[1]) ?? null : null;
}

export function resetSessions() {
  sessions.clear();
}
