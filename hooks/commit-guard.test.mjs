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
const runRaw = (input) => spawnSync('node', [hook], {
  input,
  env: { ...process.env, HOME: home },
  encoding: 'utf8',
}).status;
const run = (command, session) => runRaw(JSON.stringify({ session_id: session, tool_input: { command } }));

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

test('the old shared flag no longer authorizes, and is left alone', () => {
  writeFileSync(join(home, '.claude', '.allow-commit'), '');
  assert.strictEqual(run('git push', 'a'), 2);
  assert.ok(existsSync(join(home, '.claude', '.allow-commit')));
  rmSync(join(home, '.claude', '.allow-commit'));
});

test('a session id with path characters stays blocked and deletes nothing', () => {
  const outside = join(home, 'keep.txt');
  writeFileSync(outside, '');
  assert.strictEqual(run('git push', '../../../keep.txt'), 2);
  assert.ok(existsSync(outside));
  rmSync(outside);
});

test('a directory in place of the flag never authorizes', () => {
  mkdirSync(flag('a'));
  assert.strictEqual(run('git push', 'a'), 2);
  rmSync(flag('a'), { recursive: true });
});

test('a null payload does not crash the hook', () => {
  assert.strictEqual(runRaw('null'), 0);
});
