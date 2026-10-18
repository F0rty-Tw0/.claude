// Run: node --test skills/code-review/scripts/watch-pr-checks.test.mjs
import { after, describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./watch-pr-checks.mjs', import.meta.url));
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const NO_CHECKS = [1, "no checks reported on the 'feat/x' branch"];
const PASSED = { view: [[0, SHA]], checks: [[0, 'build pass']], watch: [[0]], buckets: [[0, 'pass']] };
const SIGNAL_SKIP = process.platform === 'win32' && 'Windows reports a self-killed child as exit 1, never a null status';

// Fake gh: answers each call kind from a scenario, repeating its last answer, and logs every argv with a timestamp.
// An answer whose code is "signal" kills the fake gh with SIGKILL.
const FAKE_GH = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const scenario = JSON.parse(readFileSync(process.env.FAKE_GH_SCENARIO, 'utf8'));
const statePath = process.env.FAKE_GH_SCENARIO + '.state';
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
appendFileSync(process.env.FAKE_GH_SCENARIO + '.log', JSON.stringify({ at: Date.now(), args }) + '\\n');
const kind = args[1] === 'view' ? 'view' : args.includes('--watch') ? 'watch' : args.includes('--json') ? 'buckets' : 'checks';
const answers = scenario[kind];
const n = state[kind] ?? 0;
state[kind] = n + 1;
writeFileSync(statePath, JSON.stringify(state));
const [rc, out] = answers[Math.min(n, answers.length - 1)];
if (rc === 'signal') process.kill(process.pid, 'SIGKILL');
if (out) (rc === 0 ? process.stdout : process.stderr).write(out + '\\n');
process.exit(rc);
`;

const temps = [];
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const setup = (scenario, env = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-'));
  const fake = join(dir, 'fake-gh.mjs');
  const scenarioPath = join(dir, 'scenario.json');
  const exitFile = join(dir, 'jobs', 'pr-watch.exit');
  temps.push(dir);
  writeFileSync(fake, FAKE_GH);
  writeFileSync(scenarioPath, JSON.stringify(scenario));

  const runEnv = { ...process.env, WATCH_PR_GH_SCRIPT: fake, WATCH_PR_POLL_MS: '1', FAKE_GH_SCENARIO: scenarioPath, ...env };
  const run = (...args) => spawnSync('node', [script, ...args], { encoding: 'utf8', env: runEnv });
  const log = () => readFileSync(`${scenarioPath}.log`, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const calls = () => log().map((entry) => entry.args);
  const readExit = () => readFileSync(exitFile, 'utf8').trim();
  const harness = { dir, run, log, calls, readExit, exitFile };

  return harness;
};

const isWatch = (args) => args.includes('--watch');
const isPoll = (args) => args[1] === 'checks' && !args.includes('--json') && !isWatch(args);

describe('FEATURE: watch-pr-checks', () => {
  describe('GIVEN the head is SHA and its checks have registered', () => {
    it('WHEN watch passes and no check was cancelled THEN exit 0 and write 0', () => {
      const t = setup(PASSED);

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 0);
      assert.equal(t.readExit(), '0');
    });

    it('WHEN watch passes but a check was cancelled THEN exit 7 and write 7', () => {
      const t = setup({ ...PASSED, buckets: [[0, 'pass\ncancel\nskipping']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 7);
      assert.equal(t.readExit(), '7');
    });

    it('WHEN watch passes but a bucket reads fail THEN exit 1', () => {
      const t = setup({ ...PASSED, buckets: [[0, 'cancel\nfail']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 1);
    });

    it('WHEN watch passes but the bucket read fails THEN exit 6', () => {
      const t = setup({ ...PASSED, buckets: [[1, 'HTTP 502']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 6);
    });

    for (const [label, code] of [['fails', 1], ['exits 4 (auth)', 4], ['is interrupted', 2]]) {
      it(`WHEN watch ${label} THEN exit ${code} and write ${code} without reading buckets`, () => {
        const t = setup({ ...PASSED, watch: [[code]] });

        const r = t.run('9', SHA, t.exitFile);

        assert.equal(r.status, code);
        assert.equal(t.readExit(), String(code));
        assert.equal(t.calls().some((a) => a.includes('--json') && a[1] === 'checks'), false);
      });
    }

    it('WHEN watch is killed by a signal THEN exit 2', { skip: SIGNAL_SKIP }, () => {
      const t = setup({ ...PASSED, watch: [['signal']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 2);
    });
  });

  describe('GIVEN checks have not registered yet', () => {
    it('WHEN "no checks reported" turns into pending THEN poll twice and watch', () => {
      const t = setup({ ...PASSED, checks: [NO_CHECKS, [8, 'build pending']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 0);
      assert.equal(t.calls().filter(isPoll).length, 2);
    });

    it('WHEN no checks ever register THEN exit 3 without watching', () => {
      const t = setup({ ...PASSED, checks: [NO_CHECKS] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 3);
      assert.equal(t.readExit(), '3');
      assert.equal(t.calls().some(isWatch), false);
    });

    it('WHEN WATCH_PR_POLL_MS is 500 THEN the second poll starts at least 500 ms after the first', () => {
      const t = setup({ ...PASSED, checks: [NO_CHECKS, [8, 'build pending']] }, { WATCH_PR_POLL_MS: '500' });

      t.run('9', SHA, t.exitFile);
      const [first, second] = t.log().filter((entry) => entry.args[1] === 'view');

      assert.ok(second.at - first.at >= 500, `gap ${second.at - first.at} ms`);
    });
  });

  describe('GIVEN the head is not SHA yet', () => {
    it('WHEN the head becomes SHA mid-poll THEN exit 0 after 2 view calls', () => {
      const t = setup({ ...PASSED, view: [[0, OTHER], [0, SHA]], checks: [[8, 'build pending']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 0);
      assert.equal(t.calls().filter((a) => a[1] === 'view').length, 2);
    });

    it('WHEN the head never becomes SHA THEN exit 5 and write 5', () => {
      const t = setup({ ...PASSED, view: [[0, OTHER]] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 5);
      assert.equal(t.readExit(), '5');
    });
  });

  describe('GIVEN gh fails while waiting', () => {
    it('WHEN gh pr view fails THEN exit 6 and write 6', () => {
      const t = setup({ ...PASSED, view: [[1, 'HTTP 502']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 6);
      assert.equal(t.readExit(), '6');
    });

    it('WHEN gh pr checks returns an unexpected code THEN exit 6', () => {
      const t = setup({ ...PASSED, checks: [[4, 'authentication required']] });

      const r = t.run('9', SHA, t.exitFile);

      assert.equal(r.status, 6);
    });
  });

  describe('GIVEN the exit file cannot be written', () => {
    it('WHEN its parent is a file THEN exit 6 with a watch-pr-checks: message', () => {
      const t = setup(PASSED);
      const blocker = join(t.dir, 'blocker');
      writeFileSync(blocker, '');

      const r = t.run('9', SHA, join(blocker, 'pr-watch.exit'));

      assert.equal(r.status, 6);
      assert.match(r.stderr, /^watch-pr-checks: /m);
    });
  });

  describe('GIVEN valid flags', () => {
    it('WHEN --no-fail-fast is absent THEN watch gets --fail-fast', () => {
      const t = setup(PASSED);

      t.run('9', SHA, t.exitFile);

      assert.equal(t.calls().find(isWatch).includes('--fail-fast'), true);
    });

    it('WHEN --no-fail-fast is passed THEN watch gets no --fail-fast', () => {
      const t = setup(PASSED);

      t.run('9', SHA, t.exitFile, '--no-fail-fast');

      assert.equal(t.calls().find(isWatch).includes('--fail-fast'), false);
    });

    it('WHEN --repo is passed THEN every gh call ends with -R and the repo', () => {
      const t = setup(PASSED);

      t.run('9', SHA, t.exitFile, '--repo', 'owner/repo');
      const calls = t.calls();

      assert.equal(calls.length, 4);
      assert.equal(calls.every((a) => a.at(-2) === '-R' && a.at(-1) === 'owner/repo'), true);
    });
  });

  describe('GIVEN bad args', () => {
    for (const [label, args] of [
      ['missing the exit file', ['9', SHA]],
      ['a non-numeric PR', ['nine', SHA, 'EXIT']],
      ['a non-hex SHA', ['9', 'not-a-sha', 'EXIT']],
      ['a short SHA', ['9', 'abc1234', 'EXIT']],
      ['--repo without a value', ['9', SHA, 'EXIT', '--repo']],
      ['--repo followed by a flag', ['9', SHA, 'EXIT', '--repo', '--no-fail-fast']],
    ]) {
      it(`WHEN the args have ${label} THEN exit 64 with usage and no exit file`, () => {
        const t = setup(PASSED);
        const resolved = args.map((arg) => (arg === 'EXIT' ? t.exitFile : arg));

        const r = t.run(...resolved);

        assert.equal(r.status, 64);
        assert.match(r.stderr, /usage:/);
        assert.equal(existsSync(t.exitFile), false);
      });
    }
  });
});
