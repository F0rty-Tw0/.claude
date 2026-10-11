// Run: node --test hooks/commit-guard.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./commit-guard.js', import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'commit-guard-'));
mkdirSync(join(home, '.claude'));
after(() => rmSync(home, { recursive: true, force: true }));

const flag = (session) => join(home, '.claude', `.allow-commit-${session}`);
const run = (command, session) => spawnSync('node', [hook], {
  input: JSON.stringify({ session_id: session, tool_input: { command } }),
  env: { ...process.env, HOME: home },
  encoding: 'utf8',
}).status;

test('non-git commands pass without a flag', () => {
  assert.strictEqual(run('git log --oneline', 'a'), 0);
});

test('push is blocked without a flag', () => {
  assert.strictEqual(run('git push', 'a'), 2);
});

test("another session's flag does not authorize, and is left for its owner", () => {
  writeFileSync(flag('b'), '');
  assert.strictEqual(run('git commit -m x', 'a'), 2);
  assert.ok(existsSync(flag('b')));
  rmSync(flag('b'));
});

test("the session's own flag authorizes exactly one push", () => {
  writeFileSync(flag('a'), '');
  assert.strictEqual(run('git push', 'a'), 0);
  assert.ok(!existsSync(flag('a')));
  assert.strictEqual(run('git push', 'a'), 2);
});

test('a missing session id stays blocked', () => {
  writeFileSync(flag('undefined'), '');
  assert.strictEqual(run('git push', undefined), 2);
  rmSync(flag('undefined'));
});
