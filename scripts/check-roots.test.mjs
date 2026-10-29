import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const SCRIPTS = ['check-skill-refs.js', 'check-portability.js'];
// Without GIT_* vars: under a git hook, GIT_INDEX_FILE or GIT_DIR would point the fixture's git at the outer repo.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const dirs = [];
const tempDir = (prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); dirs.push(dir); return dir; };
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false'];

// A throwaway checkout holding copies of both scripts; only a script that resolves its own checkout can see it.
function fixture({ skillText = 'ok\n', agentsText = 'ok\n' }) {
  const repo = tempDir('check-roots-');
  mkdirSync(join(repo, 'scripts'));
  mkdirSync(join(repo, 'skills', 'a'), { recursive: true });
  mkdirSync(join(repo, 'agents'));
  for (const script of SCRIPTS) copyFileSync(join(import.meta.dirname, script), join(repo, 'scripts', script));
  writeFileSync(join(repo, 'skills', 'a', 'SKILL.md'), skillText);
  writeFileSync(join(repo, 'agents', 'x.md'), 'x\n');
  writeFileSync(join(repo, 'AGENTS.md'), agentsText);
  execFileSync('git', ['init', '-q'], { cwd: repo, env });
  execFileSync('git', [...GIT, 'add', '.'], { cwd: repo, env });
  execFileSync('git', [...GIT, 'commit', '-qm', 'fixture'], { cwd: repo, env });
  return repo;
}

function run(repo, script) {
  // cwd is the empty HOME, not the repo: only a root resolved from the script's own path finds the fixture.
  const home = tempDir('check-roots-home-');
  return spawnSync('node', [join(repo, 'scripts', script)], { cwd: home, env: { ...env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
}

describe('check scripts', () => {
  it('check-skill-refs lints its own checkout, not $HOME/.claude', () => {
    const broken = run(fixture({ skillText: 'see skill:ghost-skill\n' }), 'check-skill-refs.js');
    assert.equal(broken.status, 1);
    assert.match(broken.stdout, /unresolved skill "ghost-skill"/);
    const clean = run(fixture({ skillText: 'ok\n' }), 'check-skill-refs.js');
    assert.equal(clean.status, 0);
    assert.match(clean.stdout, /skill-refs: clean/);
  });

  it('check-portability lints its own checkout, not $HOME/.claude', () => {
    // Split so this test file passes check-portability itself.
    const broken = run(fixture({ agentsText: 'cd /ho' + 'me/someone/repo\n' }), 'check-portability.js');
    assert.equal(broken.status, 1);
    assert.match(broken.stdout, /AGENTS\.md:1 .*hardcoded Linux home path/);
    const clean = run(fixture({ agentsText: 'ok\n' }), 'check-portability.js');
    assert.equal(clean.status, 0);
    assert.match(clean.stdout, /portability: clean/);
  });
});
