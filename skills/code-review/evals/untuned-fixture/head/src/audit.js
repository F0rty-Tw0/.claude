import { appendFile } from 'node:fs/promises';

// Append-only audit trail, one JSON object per line.
export function audit(event, data = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...data });
  appendFile(process.env.AUDIT_LOG ?? 'audit.log', line + '\n');
}
