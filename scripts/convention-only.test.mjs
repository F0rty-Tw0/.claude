// Run: node --test scripts/convention-only.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./convention-only.mjs', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'convention-only-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const stub = (name, body) => {
  const file = join(tmp, name);
  writeFileSync(file, body);

  return `"${process.execPath}" "${file}"`;
};
const QUOTES = stub('quotes.cjs', "process.stdin.on('data', (d) => process.stdout.write(String(d).replaceAll('\"', \"'\")));");
const CRASH = stub('crash.cjs', 'process.exit(3);');

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
const write = (repo, files) => {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, name)), { recursive: true });
    writeFileSync(join(repo, name), text);
  }
};
let n = 0;
// Temp repo with two commits: `base` files, then `head` files on top.
const repo = (base, head) => {
  const dir = join(tmp, `repo-${n++}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'master');
  write(dir, base);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  write(dir, head);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'head');

  return dir;
};
const run = (cwd, range, fmtCmd = '') => spawnSync(process.execPath, [SCRIPT, ...(range ? [range] : [])], {
  cwd, encoding: 'utf8', env: { ...process.env, CONVENTION_FMT_CMD: fmtCmd },
});

const RANGE = 'HEAD~1..HEAD';
// [name, base files, head files, fmt command, expected exit, offending file]
const rows = [
  ['whitespace-only', { 'a.js': 'const a = 1;\n' }, { 'a.js': 'const  a = 1;\n\n' }, '', 0],
  ['quote-style only, formatter explains it', { 'a.js': 'const a = "x";\n' }, { 'a.js': "const a = 'x';\n" }, QUOTES, 0],
  ['one real token change', { 'a.js': "const a = 'x';\n" }, { 'a.js': "const a = 'y';\n" }, QUOTES, 1, 'a.js'],
  ['added file', { 'a.js': 'const a = 1;\n' }, { 'b.js': 'const b = 1;\n' }, QUOTES, 1, 'b.js'],
  ['formatter crash', { 'a.js': 'const a = "x";\n' }, { 'a.js': "const a = 'x';\n" }, CRASH, 1, 'a.js', /formatter error/],
  ['no formatter, whitespace-only', { 'a.txt': 'a b\n' }, { 'a.txt': 'a  b\n\n' }, '', 0],
  ['indentation-sensitive, no formatter', { 'a.py': 'if x:\n    y()\nz()\n' }, { 'a.py': 'if x:\n    y()\n    z()\n' }, '', 1, 'a.py', /indentation-sensitive/],
  ['in-token whitespace', { 'a.txt': "m = 'a b'\n" }, { 'a.txt': "m = 'ab'\n" }, '', 1, 'a.txt'],
];

describe('convention-only.mjs', () => {
  for (const [name, base, head, fmt, code, file, reason] of rows) {
    it(name, () => {
      const r = run(repo(base, head), RANGE, fmt);
      assert.equal(r.status, code, r.stdout + r.stderr);
      if (file) assert.match(r.stdout, new RegExp(`^not convention-only: ${file}`, 'm'));
      if (reason) assert.match(r.stdout, reason);
    });
  }
  it('run from a subdirectory', () => {
    const dir = repo({ 'sub/a.js': "const a = 'x';\n" }, { 'sub/a.js': "const a = 'y';\n" });
    const r = run(join(dir, 'sub'), RANGE);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^not convention-only: sub\/a\.js/m);
  });
  it('no range is a usage error', () => {
    const r = run(repo({ 'a.js': '1\n' }, { 'a.js': '2\n' }), '');
    assert.equal(r.status, 2, r.stdout + r.stderr);
  });
});
