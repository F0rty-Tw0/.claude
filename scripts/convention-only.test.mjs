// Run: node --test scripts/convention-only.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
const COLLAPSE = stub('collapse.cjs', "process.stdin.on('data', (d) => process.stdout.write(String(d).replace(/[ \\t]+/g, ' ').replace(/\\n\\n+/g, '\\n')));");

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
const write = (repo, files) => {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, name)), { recursive: true });
    writeFileSync(join(repo, name), text);
  }
};
const stageAll = (dir) => git(dir, 'add', '-A');
const GITLINK_A = 'a'.repeat(40);
const GITLINK_B = 'b'.repeat(40);
const gitlink = (sha) => (dir) => git(dir, 'update-index', '--add', '--cacheinfo', `160000,${sha},sub`);
const chmodX = (dir) => git(dir, 'update-index', '--chmod=+x', 'a.js');
const relink = (target) => (dir) => {
  rmSync(join(dir, 'link'), { force: true });
  symlinkSync(target, join(dir, 'link'));
  stageAll(dir);
};
const rmFile = (name) => (dir) => {
  rmSync(join(dir, name));
  stageAll(dir);
};
let n = 0;
// Temp repo with two commits: `base` files staged by `stageBase`, then `head` files staged by `stageHead`.
const repo = (base, head, { stageBase = stageAll, stageHead = stageAll } = {}) => {
  const dir = join(tmp, `repo-${n++}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'master');
  write(dir, base);
  stageBase(dir);
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  write(dir, head);
  stageHead(dir);
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'head');

  return dir;
};
const run = (cwd, range, fmtCmd = '', seamOn = '1') => spawnSync(process.execPath, [SCRIPT, ...(range ? [range] : [])], {
  cwd, encoding: 'utf8', env: { ...process.env, CONVENTION_FMT_CMD: fmtCmd, CONVENTION_FMT_TEST: seamOn },
});

const RANGE = 'HEAD~1..HEAD';
const QUOTE_PAIR = [{ 'a.js': 'const a = "x";\n' }, { 'a.js': "const a = 'x';\n" }];
// [name, base files, head files, fmt command, expected exit, offending file, reason, repo options]
const rows = [
  ['quote-style only, formatter explains it', ...QUOTE_PAIR, QUOTES, 0],
  ['whitespace change the formatter normalises', { 'a.js': 'const a = 1;\n' }, { 'a.js': 'const  a = 1;\n\n' }, COLLAPSE, 0],
  ['one real token change', { 'a.js': "const a = 'x';\n" }, { 'a.js': "const a = 'y';\n" }, QUOTES, 1, 'a.js'],
  ['added file', { 'a.js': 'const a = 1;\n' }, { 'a.js': 'const a = 1;\n', 'b.js': 'const b = 1;\n' }, QUOTES, 1, 'b.js', /added/],
  ['deleted file', { 'a.js': 'const a = 1;\n', 'b.js': 'const b = 1;\n' }, { 'a.js': 'const a = 1;\n' }, QUOTES, 1, 'b.js', /deleted/, { stageHead: rmFile('b.js') }],
  ['formatter crash', ...QUOTE_PAIR, CRASH, 1, 'a.js', /formatter error/],
  ['mode change, same content', { 'a.js': 'const a = 1;\n' }, {}, QUOTES, 1, 'a.js', /mode change/, { stageHead: chmodX }],
  ['submodule bump', { 'a.js': 'const a = "x";\n' }, { 'a.js': "const a = 'x';\n" }, QUOTES, 1, 'sub', /submodule/, { stageBase: (d) => (stageAll(d), gitlink(GITLINK_A)(d)), stageHead: (d) => (stageAll(d), gitlink(GITLINK_B)(d)) }],
  ['submodule bump hidden by ignore=all in .gitmodules', { '.gitmodules': '[submodule "sub"]\n\tpath = sub\n\turl = ./x\n\tignore = all\n', 'a.js': 'const a = "x";\n' }, { 'a.js': "const a = 'x';\n" }, QUOTES, 1, 'sub', /submodule/, { stageBase: (d) => (stageAll(d), gitlink(GITLINK_A)(d)), stageHead: (d) => (stageAll(d), gitlink(GITLINK_B)(d)) }],
  ['symlink retargeted', {}, {}, QUOTES, 1, 'link', /symlink/, { stageBase: relink('"t"'), stageHead: relink("'t'") }],
  ['no formatter, whitespace-only', { 'a.txt': 'a b\n' }, { 'a.txt': 'a  b\n\n' }, '', 1, 'a.txt', /no formatter/],
  ['no formatter, whitespace-only, .js', { 'a.js': 'const a = 1;\n' }, { 'a.js': 'const  a = 1;\n\n' }, '', 1, 'a.js', /no formatter/],
  ['indentation-sensitive, no formatter', { 'a.py': 'if x:\n    y()\nz()\n' }, { 'a.py': 'if x:\n    y()\n    z()\n' }, '', 1, 'a.py', /no formatter/],
  ['in-token whitespace', { 'a.txt': "m = 'a b'\n" }, { 'a.txt': "m = 'ab'\n" }, '', 1, 'a.txt'],
  ['regex spacing', { 'a.js': 'const r = /a  b/;\n' }, { 'a.js': 'const r = /a b/;\n' }, QUOTES, 1, 'a.js'],
  ['blank line inside a template literal', { 'a.js': 'const t = `a\nb`;\n' }, { 'a.js': 'const t = `a\n\nb`;\n' }, QUOTES, 1, 'a.js'],
  ['LF to CRLF in a shell script', { 'a.sh': 'echo a\n' }, { 'a.sh': 'echo a\r\n' }, '', 1, 'a.sh'],
  ['markdown trailing double space (hard break)', { 'a.md': 'a\nb\n' }, { 'a.md': 'a  \nb\n' }, '', 1, 'a.md'],
  ['indent change in a .nim file', { 'a.nim': 'if x:\n  y()\n  z()\n' }, { 'a.nim': 'if x:\n  y()\n    z()\n' }, '', 1, 'a.nim'],
  ['test seam off without CONVENTION_FMT_TEST', ...QUOTE_PAIR, QUOTES, 1, 'a.js', /no formatter/, { seamOn: '' }],
];

describe('convention-only.mjs', () => {
  for (const [name, base, head, fmt, code, file, reason, options = {}] of rows) {
    it(name, () => {
      const r = run(repo(base, head, options), RANGE, fmt, options.seamOn);
      assert.equal(r.status, code, r.stdout + r.stderr);
      if (file) assert.match(r.stdout, new RegExp(`^not convention-only: ${file}`, 'm'));
      if (reason) assert.match(r.stdout, reason);
    });
  }
  it('empty diff is not convention-only', () => {
    const r = run(repo({ 'a.js': '1\n' }, { 'a.js': '2\n' }), 'HEAD..HEAD', QUOTES);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^not convention-only: \(empty diff\)/m);
  });
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
  it('a range that looks like an option is a usage error, never reaches git', () => {
    const r = run(repo({ 'a.js': '1\n' }, { 'a.js': '2\n' }), '--stat');
    assert.equal(r.status, 2, r.stdout + r.stderr);
  });
});
