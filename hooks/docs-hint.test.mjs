import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { docsHost } = createRequire(import.meta.url)('./docs-hint.js');
const hook = fileURLToPath(new URL('./docs-hint.js', import.meta.url));

const docs = ['https://docs.rs/serde/latest/serde/', 'https://nx.dev/nx-api/js', 'https://angular.dev/guide/signals',
  'https://react.dev/reference/react/useEffect', 'https://supabase.com/docs/guides/auth', 'https://foo.readthedocs.io/en/stable/',
  'https://www.typescriptlang.org/docs/handbook/intro.html', 'https://typescriptlang.org/docs/handbook/intro.html'];
const notDocs = ['https://raw.githubusercontent.com/o/r/main/README.md', 'https://crates.io/crates/serde', 'https://github.com/o/r/issues/1',
  'https://supabase.com/pricing', 'https://www.mumsnet.com/x', 'https://docs.google.com/document/d/1/edit', 'not a url', ''];
for (const u of docs) test(`docs host: ${u}`, () => assert.ok(docsHost(u)));
for (const u of notDocs) test(`not docs: ${JSON.stringify(u)}`, () => assert.equal(docsHost(u), null));

test('CLI nudges once, never blocks, stays silent otherwise', () => {
  const run = (input) => spawnSync('node', [hook], { input, encoding: 'utf8' });
  const hit = run(JSON.stringify({ tool_input: { url: 'https://docs.rs/serde' } }));
  assert.equal(hit.status, 0);
  assert.match(JSON.parse(hit.stdout).hookSpecificOutput.additionalContext, /docs\.rs.*context7 first/s);
  const miss = run(JSON.stringify({ tool_input: { url: 'https://crates.io/crates/serde' } }));
  assert.equal(miss.status, 0);
  assert.equal(miss.stdout, '');
  assert.equal(run('not json').status, 0);
});

test('Task 6.7 AGENTS.md: context7 first, WebFetch only on no match', () => {
  const t = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.match(t, /Look up unfamiliar libraries rather than recalling them: context7 first/);
  assert.match(t, /WebFetch a docs page only when context7 has no match or is unavailable/);
});

test('settings.json wires the hint on WebFetch', () => {
  const entries = JSON.parse(readFileSync(new URL('../settings.json', import.meta.url), 'utf8')).hooks.PreToolUse;
  assert.ok(entries.some((e) => e.matcher === 'WebFetch' && e.hooks.some((h) => /hooks\/docs-hint\.js/.test(h.command))));
});
