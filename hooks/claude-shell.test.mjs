import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const snippet = new URL('../linux/claude-shell.zsh', import.meta.url).pathname;
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
const zsh = (env, line) => spawnSync('zsh', ['-fc', `source ${snippet}; ${line}`], { env, encoding: 'utf8' });

test('agent shell: unmatched glob and arithmetic text pass through literally', { skip: !hasZsh }, () => {
  for (const arg of ['/nonexistent/x*', '100*141/118', 'review_v3/txt_*']) {
    const r = zsh({ CLAUDECODE: '1', PATH: process.env.PATH }, `echo ${arg}`);
    assert.equal(r.status, 0, arg);
    assert.equal(r.stdout.trim(), arg);
  }
});
test('human shell: still errors on an unmatched glob', { skip: !hasZsh }, () => {
  const r = zsh({ PATH: process.env.PATH }, 'echo /nonexistent/x*');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no matches found/);
});
test('zshrc backup sources the snippet and AGENTS.md carries the find rule', () => {
  assert.match(readFileSync(new URL('../linux/.zshrc', import.meta.url), 'utf8'), /claude-shell\.zsh/);
  assert.match(readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8'), /find \.\/-/);
});
