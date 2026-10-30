#!/usr/bin/env node
// PreToolUse hook on WebFetch: library docs go through context7 first. Nudges, never blocks.
// docs.google.com is the user's own documents, not library docs.
const fs = require('fs');

const DOCS_HOSTS = new Set(['react.dev', 'angular.dev', 'nx.dev', 'turborepo.dev', 'vite.dev', 'developer.mozilla.org', 'nodejs.org', 'www.typescriptlang.org', 'tailwindcss.com', 'learn.microsoft.com']);
const DOCS_PATH_HOSTS = new Set(['supabase.com', 'vercel.com', 'nextjs.org']);

function docsHost(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const { hostname: host, pathname } = parsed;
  const isDocs = (host.startsWith('docs.') && host !== 'docs.google.com') || host.endsWith('.readthedocs.io') || DOCS_HOSTS.has(host) || (DOCS_PATH_HOSTS.has(host) && pathname.startsWith('/docs'));

  return isDocs ? host : null;
}

if (require.main === module) {
  try {
    const host = docsHost(JSON.parse(fs.readFileSync(0, 'utf8'))?.tool_input?.url);
    if (host) {
      const additionalContext = `WebFetch of ${host}: library docs go through context7 first (mcp__context7__resolve-library-id, then query-docs; load them with ToolSearch). Fetch only if context7 has no match or is unavailable.`;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext } }));
    }
  } catch { /* unparsable stdin: stay silent */ }
}

module.exports = { docsHost };
