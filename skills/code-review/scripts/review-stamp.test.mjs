// Run: node --test skills/code-review/scripts/review-stamp.test.mjs
import { after, describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./review-stamp.mjs', import.meta.url));
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
const run = (cwd, ...args) => spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' });
const lookup = (cwd, ...args) => JSON.parse(run(cwd, 'lookup', ...args).stdout);
const head = (cwd) => git(cwd, 'rev-parse', 'HEAD').stdout.trim();
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

const temps = [];
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const tmp = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);

  return dir;
};

const commit = (cwd, name) => {
  writeFileSync(join(cwd, name), name);
  git(cwd, 'add', name);
  git(cwd, 'commit', '-m', name);
};

const repo = () => {
  const dir = tmp('stamp-repo-');
  git(dir, 'init', '-b', 'main');
  commit(dir, 'a.txt');
  git(dir, 'switch', '-c', 'feat');
  commit(dir, 'b.txt');

  return dir;
};

const files = () => {
  const dir = tmp('stamp-mat-');
  const pr = join(dir, 'pr.md');
  const pr2 = join(dir, 'pr2.md');
  const plan = join(dir, 'plan.md');
  const plan2 = join(dir, 'plan2.md');
  const report = join(dir, 'report.md');
  writeFileSync(pr, 'pr v1');
  writeFileSync(pr2, 'pr v2');
  writeFileSync(plan, 'plan v1');
  writeFileSync(plan2, 'plan v2');
  writeFileSync(report, '## 1. Summary\nbody\n\n## 7. Verdict\nSHIP\n');

  return { dir, pr, pr2, plan, plan2, report };
};

const stampPath = (cwd, sha) => join(cwd, '.git', 'claude-review', `${sha}.md`);

const stamp = (cwd, sha, mode, report, ...material) => {
  const result = run(cwd, 'write', 'main', sha, mode, report, ...material);
  assert.strictEqual(result.status, 0, result.stderr);
};

describe('FEATURE: review-stamp', () => {
  describe('GIVEN a stamp on HEAD', () => {
    it('WHEN the material is the same THEN case 1, unchanged (check 1)', () => {
      const dir = repo();
      const { pr, report } = files();
      stamp(dir, head(dir), 'full', report, pr);

      const result = lookup(dir, 'main', pr);

      assert.deepStrictEqual(pick(result, ['case', 'materialChanged']), { case: 1, materialChanged: false });
    });

    it('WHEN the material differs THEN case 1, changed (check 2)', () => {
      const dir = repo();
      const { pr, pr2, report } = files();
      stamp(dir, head(dir), 'full', report, pr);

      const result = lookup(dir, 'main', pr2);

      assert.deepStrictEqual(pick(result, ['case', 'materialChanged']), { case: 1, materialChanged: true });
    });

    it('WHEN written THEN the file is the header plus the report verbatim', () => {
      const dir = repo();
      const { pr, report } = files();
      const sha = head(dir);
      stamp(dir, sha, 'delta', report, pr);

      const text = readFileSync(stampPath(dir, sha), 'utf8');
      const headerShape = /^mb: [0-9a-f]{40}\ndigest: [0-9a-f]{64}\ndate: \S+\nmode: delta\n\n/;

      assert.match(text, headerShape);
      assert.ok(text.endsWith(readFileSync(report, 'utf8')));
    });

    it('WHEN only the second of two materials differs THEN case 1, changed (M11)', () => {
      const dir = repo();
      const { pr, plan, plan2, report } = files();
      stamp(dir, head(dir), 'full', report, pr, plan);

      const result = lookup(dir, 'main', pr, plan2);

      assert.deepStrictEqual(pick(result, ['case', 'materialChanged']), { case: 1, materialChanged: true });
    });

    it('WHEN written THEN the stamp dir holds no .tmp leftover (atomic write)', () => {
      const dir = repo();
      const { pr, report } = files();
      const sha = head(dir);
      stamp(dir, sha, 'full', report, pr);

      const names = readdirSync(join(dir, '.git', 'claude-review'));

      assert.deepStrictEqual(names, [`${sha}.md`]);
    });

    it('WHEN a worktree is added at that commit THEN case 1 from the worktree (RF2)', () => {
      const dir = repo();
      const { pr, report } = files();
      const sha = head(dir);
      stamp(dir, sha, 'full', report, pr);
      const wt = join(tmp('stamp-wt-'), 'wt');
      git(dir, 'worktree', 'add', '-b', 'feat-wt', wt, sha);

      const result = lookup(wt, 'main', pr);

      assert.strictEqual(result.case, 1);
    });

    it('WHEN run from a subdirectory THEN the same case 1 as from the toplevel (RF1)', () => {
      const dir = repo();
      const { pr, report } = files();
      stamp(dir, head(dir), 'full', report, pr);
      mkdirSync(join(dir, 'sub'));

      const fromSub = lookup(join(dir, 'sub'), 'main', pr);
      const fromTop = lookup(dir, 'main', pr);

      assert.deepStrictEqual(fromSub, fromTop);
      assert.strictEqual(fromSub.case, 1);
    });

    it('WHEN run from a subdirectory with an untracked file at the toplevel THEN dirty (M13)', () => {
      const dir = repo();
      const { pr } = files();
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'x.txt'), 'x');

      const result = lookup(join(dir, 'sub'), 'main', pr);

      assert.deepStrictEqual(result, { case: 3, reason: 'dirty' });
    });

    it('WHEN the commit is amended THEN case 3 (check 5)', () => {
      const dir = repo();
      const { pr, report } = files();
      stamp(dir, head(dir), 'full', report, pr);
      git(dir, 'commit', '--amend', '-m', 'amended');

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(result.case, 3);
    });

    it('WHEN the base differs and its fork point differs THEN case 3 (check 7)', () => {
      const dir = repo();
      const { pr, report } = files();
      commit(dir, 'c.txt');
      stamp(dir, head(dir), 'full', report, pr);

      const result = lookup(dir, 'HEAD~1', pr);

      assert.strictEqual(result.case, 3);
    });
  });

  describe('GIVEN commits on top of a stamped commit', () => {
    it('WHEN two commits sit on top THEN case 2 with range S..HEAD (check 3)', () => {
      const dir = repo();
      const { pr, report } = files();
      const stamped = head(dir);
      stamp(dir, stamped, 'full', report, pr);
      commit(dir, 'c.txt');
      commit(dir, 'd.txt');

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(result.case, 2);
      assert.strictEqual(result.range, `${stamped}..${head(dir)}`);
      assert.strictEqual(result.materialChanged, false);
    });

    it('WHEN the material differs THEN case 2, changed (check 3)', () => {
      const dir = repo();
      const { pr, pr2, report } = files();
      stamp(dir, head(dir), 'full', report, pr);
      commit(dir, 'c.txt');
      commit(dir, 'd.txt');

      const result = lookup(dir, 'main', pr2);

      assert.strictEqual(result.case, 2);
      assert.strictEqual(result.materialChanged, true);
    });

    it('WHEN two ancestors are stamped THEN case 2 picks the nearer (check 4)', () => {
      const dir = repo();
      const { pr, report } = files();
      commit(dir, 'c.txt');
      stamp(dir, head(dir), 'full', report, pr);
      commit(dir, 'd.txt');
      const nearer = head(dir);
      stamp(dir, nearer, 'full', report, pr);
      commit(dir, 'e.txt');

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(result.case, 2);
      assert.ok(result.stamp.endsWith(`${nearer}.md`));
    });

    it('WHEN the only stamp has a different fork point THEN case 3 (M5)', () => {
      const dir = repo();
      const { pr, report } = files();
      commit(dir, 'c.txt');
      const mid = head(dir);
      const written = run(dir, 'write', mid, mid, 'full', report, pr);
      commit(dir, 'd.txt');

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(written.status, 0, written.stderr);
      assert.strictEqual(result.case, 3);
    });

    it('WHEN a nearer stamp has a different fork point THEN case 2 on the farther one (M5)', () => {
      const dir = repo();
      const { pr, report } = files();
      const farther = head(dir);
      stamp(dir, farther, 'full', report, pr);
      commit(dir, 'c.txt');
      const mid = head(dir);
      const written = run(dir, 'write', mid, mid, 'full', report, pr);
      commit(dir, 'd.txt');

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(written.status, 0, written.stderr);
      assert.strictEqual(result.case, 2);
      assert.ok(result.stamp.endsWith(`${farther}.md`));
    });

    it('WHEN a side branch is merged back THEN case 3 (check 6)', () => {
      const dir = repo();
      const { pr, report } = files();
      stamp(dir, head(dir), 'full', report, pr);
      git(dir, 'switch', '-c', 'side');
      commit(dir, 's.txt');
      git(dir, 'switch', 'feat');
      commit(dir, 'f.txt');
      git(dir, 'merge', '--no-ff', 'side', '-m', 'merge side');

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(result.case, 3);
    });

    it('WHEN stamps are stale or unknown beside a valid ancestor THEN case 2 on the valid one (7b)', () => {
      const dir = repo();
      const { pr, report } = files();
      const valid = head(dir);
      stamp(dir, valid, 'full', report, pr);
      commit(dir, 'c.txt');
      stamp(dir, head(dir), 'full', report, pr);
      git(dir, 'reset', '--hard', 'HEAD~1');
      commit(dir, 'd.txt');
      copyFileSync(stampPath(dir, valid), stampPath(dir, 'f'.repeat(40)));

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(result.case, 2);
      assert.ok(result.stamp.endsWith(`${valid}.md`));
    });

    it('WHEN the stamp dir holds a non-stamp file and a mangled stamp THEN they are ignored (RF4)', () => {
      const dir = repo();
      const { pr, report } = files();
      const valid = head(dir);
      stamp(dir, valid, 'full', report, pr);
      commit(dir, 'c.txt');
      const mangled = head(dir);
      commit(dir, 'd.txt');
      writeFileSync(join(dir, '.git', 'claude-review', 'notes.txt'), 'hello');
      writeFileSync(stampPath(dir, mangled), 'garbage without header');

      const run1 = run(dir, 'lookup', 'main', pr);
      const result = JSON.parse(run1.stdout);

      assert.strictEqual(run1.status, 0);
      assert.strictEqual(result.case, 2);
      assert.ok(result.stamp.endsWith(`${valid}.md`));
    });
  });

  describe('GIVEN an unresolvable base or an empty repo', () => {
    it('WHEN the base does not resolve THEN lookup is case 3 and write exits 1, no stack trace (RF3)', () => {
      const dir = repo();
      const { pr, report } = files();

      const looked = run(dir, 'lookup', 'nope', pr);
      const written = run(dir, 'write', 'nope', head(dir), 'full', report, pr);

      assert.strictEqual(JSON.parse(looked.stdout).case, 3);
      assert.strictEqual(written.status, 1);
      assert.doesNotMatch(looked.stderr + written.stderr, /^\s+at /m);
      assert.ok(!existsSync(stampPath(dir, head(dir))));
    });

    it('WHEN the repo has no commits THEN lookup is case 3, no stack trace (RF3)', () => {
      const dir = tmp('stamp-empty-');
      git(dir, 'init', '-b', 'main');
      const { pr } = files();

      const result = run(dir, 'lookup', 'main', pr);

      assert.strictEqual(result.status, 0);
      assert.strictEqual(JSON.parse(result.stdout).case, 3);
      assert.doesNotMatch(result.stderr, /^\s+at /m);
    });
  });

  describe('GIVEN untracked files', () => {
    it('WHEN one sits outside the planning dirs THEN lookup is dirty and write exits 1 (8a)', () => {
      const dir = repo();
      const { pr, report } = files();
      writeFileSync(join(dir, 'x.txt'), 'x');

      const looked = lookup(dir, 'main', pr);
      const written = run(dir, 'write', 'main', head(dir), 'full', report, pr);

      assert.deepStrictEqual(looked, { case: 3, reason: 'dirty' });
      assert.strictEqual(written.status, 1);
      assert.ok(!existsSync(stampPath(dir, head(dir))));
    });

    it('WHEN only .claude/local/plan.md is untracked in a wholly untracked .claude THEN clean (8b)', () => {
      const dir = repo();
      const { pr, report } = files();
      mkdirSync(join(dir, '.claude', 'local'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'local', 'plan.md'), 'plan');

      const written = run(dir, 'write', 'main', head(dir), 'full', report, pr);
      const looked = lookup(dir, 'main', pr);

      assert.strictEqual(written.status, 0);
      assert.strictEqual(looked.case, 1);
    });

    it('WHEN .claude/other.txt is untracked THEN lookup is case 3 (8c)', () => {
      const dir = repo();
      const { pr } = files();
      mkdirSync(join(dir, '.claude'));
      writeFileSync(join(dir, '.claude', 'other.txt'), 'x');

      const result = lookup(dir, 'main', pr);

      assert.strictEqual(result.case, 3);
    });

    it('WHEN only docs/specs/x-design.md is untracked THEN clean (8d)', () => {
      const dir = repo();
      const { pr, report } = files();
      mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'specs', 'x-design.md'), 'spec');

      const written = run(dir, 'write', 'main', head(dir), 'full', report, pr);
      const looked = lookup(dir, 'main', pr);

      assert.strictEqual(written.status, 0);
      assert.strictEqual(looked.case, 1);
    });
  });

  describe('GIVEN tracked changes under the planning dirs', () => {
    it('WHEN a committed docs/specs file is modified THEN lookup is dirty and write exits 1', () => {
      const dir = repo();
      const { pr, report } = files();
      mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
      commit(dir, join('docs', 'specs', 'x.md'));
      writeFileSync(join(dir, 'docs', 'specs', 'x.md'), 'edited');

      const looked = lookup(dir, 'main', pr);
      const written = run(dir, 'write', 'main', head(dir), 'full', report, pr);

      assert.deepStrictEqual(looked, { case: 3, reason: 'dirty' });
      assert.strictEqual(written.status, 1);
    });

    it('WHEN an untracked docs/specs file has a space in its name THEN clean (quoted path)', () => {
      const dir = repo();
      const { pr, report } = files();
      mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'specs', 'my spec.md'), 'spec');

      const written = run(dir, 'write', 'main', head(dir), 'full', report, pr);

      assert.strictEqual(written.status, 0, written.stderr);
      assert.strictEqual(lookup(dir, 'main', pr).case, 1);
    });
  });

  describe('GIVEN a material path', () => {
    it('WHEN its parent directory is missing THEN lookup and write exit 2 naming the path (unset $SCRATCH)', () => {
      const dir = repo();
      const { report } = files();
      const orphan = join(dir, 'no-such-dir', 'pr.md');

      const looked = run(dir, 'lookup', 'main', orphan);
      const written = run(dir, 'write', 'main', head(dir), 'full', report, orphan);

      assert.strictEqual(looked.status, 2);
      assert.ok(looked.stderr.includes(orphan), looked.stderr);
      assert.strictEqual(written.status, 2);
      assert.ok(written.stderr.includes(orphan), written.stderr);
      assert.ok(!existsSync(stampPath(dir, head(dir))));
    });

    it('WHEN the file is missing inside an existing directory THEN it is skipped, exit 0', () => {
      const dir = repo();
      const { dir: matDir, pr, report } = files();
      const absent = join(matDir, 'absent.md');

      const written = run(dir, 'write', 'main', head(dir), 'full', report, pr, absent);
      const looked = run(dir, 'lookup', 'main', pr, absent);

      assert.strictEqual(written.status, 0, written.stderr);
      assert.strictEqual(looked.status, 0);
      assert.deepStrictEqual(pick(JSON.parse(looked.stdout), ['case', 'materialChanged']), { case: 1, materialChanged: false });
    });
  });

  describe('GIVEN bad write arguments', () => {
    it('WHEN reviewed-sha is not HEAD THEN exit 1 and no file (check 9)', () => {
      const dir = repo();
      const { pr, report } = files();
      const parent = git(dir, 'rev-parse', 'HEAD~1').stdout.trim();

      const result = run(dir, 'write', 'main', parent, 'full', report, pr);

      assert.strictEqual(result.status, 1);
      assert.ok(!existsSync(stampPath(dir, parent)));
    });

    it('WHEN the mode is unknown THEN exit 2 with usage', () => {
      const dir = repo();
      const { report } = files();

      const result = run(dir, 'write', 'main', head(dir), 'bogus', report);

      assert.strictEqual(result.status, 2);
      assert.match(result.stderr, /usage/i);
    });

    it('WHEN the report file is missing THEN exit 2', () => {
      const dir = repo();

      const result = run(dir, 'write', 'main', head(dir), 'full', join(dir, 'no-such-report.md'));

      assert.strictEqual(result.status, 2);
    });

    it('WHEN the subcommand is unknown THEN exit 2', () => {
      const dir = repo();

      const result = run(dir, 'frobnicate');

      assert.strictEqual(result.status, 2);
    });
  });
});
