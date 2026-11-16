import assert from 'node:assert/strict';
import { chmodSync, linkSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

const PRUNE_SCRIPT = join(import.meta.dirname, 'build-prune');
const SIGNATURE = 'Signature: 8a477f597d28d172789f06886806bc55';
const MB = 1024 * 1024;
const dir = mkdtempSync(join(tmpdir(), 'build-prune-'));
const root = () => mkdtempSync(join(dir, 'root-'));
const lockFile = join(dir, 'l.lock');
// Two ways a busy check stops a run that is already deleting: exit 0 (a match) and any other exit but 1 (a fault).
const MID_RUN = [[0, 'cargo starts'], [2, 'the busy check breaks']];
const LOCK_SKIP = 'build-prune: skipped, a gate or bench holds the cpu lock';
const BUSY_SKIP = 'build-prune: skipped, cargo or rustc is running';

function put(file, bytes, stamp) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  utimesSync(file, stamp, stamp);
}

const TEST_TAG = `${SIGNATURE}\n# test\n`;
const ago = (minutes) => (Date.now() - minutes * 60_000) / 1000;

// Real bytes, not sparse: du counts blocks.
function unit(base, rel, { mb, ageMin, incrementalMb = 0, tag = TEST_TAG }) {
  const stamp = ago(ageMin);
  const path = join(base, rel);
  if (tag !== null) put(join(path, 'CACHEDIR.TAG'), tag, stamp);
  put(join(path, 'debug/deps/blob'), Buffer.alloc(mb * MB, 1), stamp);
  if (incrementalMb > 0) put(join(path, 'debug/incremental/blob'), Buffer.alloc(incrementalMb * MB, 1), stamp);

  return path;
}

function prune(env, ...args) {
  const fixed = { BUILD_PRUNE_UNIT_MB: '100000', CPU_LOCK_FILE: lockFile, BUILD_PRUNE_BUSY: 'false', HOME: dir };

  return spawnSync(PRUNE_SCRIPT, args, { env: { ...process.env, ...fixed, ...env }, encoding: 'utf8' });
}

const lastLine = (result) => result.stdout.trim().split('\n').at(-1);
const linesOf = (result, prefix) => result.stdout.split('\n').filter((line) => line.startsWith(prefix));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const held = () => spawnSync('flock', ['-n', '-x', lockFile, 'true']).status !== 0;

async function holdLock(flag) {
  const holder = spawn('flock', ['-o', flag, lockFile, 'sleep', '2'], { stdio: 'ignore' });
  for (let tries = 0; tries < 100 && !held(); tries++) await sleep(20);
  assert.ok(held(), 'the holder never took the lock');

  return holder;
}

// A child that already ended fires no second exit event: waiting for one would hang the test.
async function release(holder) {
  if (holder.exitCode !== null || holder.signalCode !== null) return;
  const exited = once(holder, 'exit');
  holder.kill();
  await exited;
}

// Shell text for a busy command: sets $n to the number of earlier calls of that command in one test.
function callCount() {
  const counter = join(mkdtempSync(join(dir, 'busy-')), 'calls');

  return `n=$(cat "${counter}" 2>/dev/null || echo 0); echo $((n+1)) > "${counter}"`;
}

// A busy command that answers idle (exit 1) for the first `idleCalls` calls and exits with `code` from then on.
function busyAfter(idleCalls, code = 0) {
  return `${callCount()}; [ "$n" -lt ${idleCalls} ] && exit 1; exit ${code}`;
}

// A process named `name` that lives until release(). Resolves once the kernel shows that name.
async function standIn(name) {
  const fake = join(mkdtempSync(join(dir, 'bin-')), name);
  writeFileSync(fake, '#!/bin/sh\nread _\n', { mode: 0o755 });
  const child = spawn(fake, { stdio: ['pipe', 'ignore', 'ignore'] });
  const comm = () => (existsSync(`/proc/${child.pid}/comm`) ? readFileSync(`/proc/${child.pid}/comm`, 'utf8').trim() : '');
  for (let tries = 0; tries < 100 && comm() !== name; tries++) await sleep(20);
  if (comm() !== name) {
    await release(child);
    assert.fail(`the stand-in process never took the name ${name}`);
  }

  return child;
}

// The oldest unit holds 6 MB that can go and 1 MB under a directory that refuses deletion; a 3 MB unit is newer.
// Call unlock() before the test ends, or the temp dir cannot be cleaned.
function stuckUnit() {
  const base = root();
  const stuck = unit(base, 'aa/u1', { mb: 6, ageMin: 100 });
  const locked = join(stuck, 'debug/locked');
  put(join(locked, 'blob'), Buffer.alloc(MB, 1), ago(100));
  const fresh = unit(base, 'bb/u2', { mb: 3, ageMin: 1 });
  chmodSync(locked, 0o555);

  return { base, stuck, fresh, unlock: () => chmodSync(locked, 0o755) };
}

// A stand-in on PATH for one tool: `body` runs first, then the real tool unless body exits.
function wrapTool(name, body) {
  const bin = mkdtempSync(join(dir, 'bin-'));
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\nexec /usr/bin/${name} "$@"\n`, { mode: 0o755 });

  return `${bin}:${process.env.PATH}`;
}

// A PATH whose pgrep sees only children of this test process: a real cargo or rustc of another session
// on this machine must not decide the tests of the default busy command.
const OWN_CHILDREN = wrapTool('pgrep', `exec /usr/bin/pgrep -P ${process.pid} "$@"`);

function overCap() {
  const base = root();
  const u1 = unit(base, 'aa/u1', { mb: 4, ageMin: 180 });
  const u2 = unit(base, 'bb/u2', { mb: 4, ageMin: 120 });
  const u3 = unit(base, 'cc/u3', { mb: 4, ageMin: 60 });

  return { base, u1, u2, u3, env: { BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '10' } };
}

describe('build-prune', () => {
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('WHEN the sum is under the cap THEN nothing is removed and the summary counts the units', () => {
    const base = root();
    const a = unit(base, 'aa/u1', { mb: 3, ageMin: 10 });
    const b = unit(base, 'bb/u2', { mb: 3, ageMin: 20 });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '20' });
    assert.equal(existsSync(a) && existsSync(b), true);
    assert.match(lastLine(result), /^build-prune: 2 units, \d+ MB of 20 MB$/);
  });

  it('WHEN the sum is over the cap THEN the least recently compiled unit goes first and removal stops once the sum fits', () => {
    const { u1, u2, u3, env } = overCap();
    const result = prune(env);
    const removed = linesOf(result, 'removed ');
    assert.deepEqual([existsSync(u1), existsSync(u2), existsSync(u3)], [false, true, true]);
    assert.equal(removed.length, 1);
    assert.match(removed[0], /^removed \S*\/aa\/u1 \d+ MB, last compiled \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC$/);
    assert.match(lastLine(result), /^build-prune: 2 units, /);
  });

  it('WHEN a removed unit leaves its parent empty THEN the parent goes and the root stays', () => {
    const { base, env } = overCap();
    prune(env);
    assert.equal(existsSync(join(base, 'aa')), false);
    assert.equal(existsSync(base), true);
  });

  it('WHEN a unit is over the unit limit and its incremental dirs bring it under THEN only they go', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 6 });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6' });
    assert.equal(existsSync(join(path, 'debug/incremental')), false);
    assert.equal(existsSync(join(path, 'debug/deps/blob')), true);
    assert.match(result.stdout, new RegExp(`^removed ${path}/\\*/incremental \\d+ MB$`, 'm'));
    assert.equal(linesOf(result, 'build-prune: could not remove all of ').length, 0);
  });

  it('WHEN a unit stays over the unit limit without incremental THEN the unit goes', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 8, ageMin: 10 });
    prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6' });
    assert.equal(existsSync(path), false);
  });

  it('WHEN --dry-run THEN the lines say would remove and every path still exists', () => {
    const { u1, u2, u3, env } = overCap();
    const result = prune(env, '--dry-run');
    assert.match(result.stdout, /^would remove /m);
    assert.equal(linesOf(result, 'removed ').length, 0);
    assert.equal([u1, u2, u3].every(existsSync), true);
    assert.match(lastLine(result), /^build-prune: 2 units, /);
  });

  it('WHEN a root is missing THEN it counts as empty', () => {
    const empty = root();
    const result = prune({ BUILD_PRUNE_ROOTS: `${empty}:${join(dir, 'nope')}`, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(result.status, 0);
    assert.match(lastLine(result), /^build-prune: 0 units, /);
  });

  it('WHEN an argument is unknown THEN usage and exit 2', () => {
    const result = prune({ BUILD_PRUNE_ROOTS: root(), BUILD_PRUNE_CAP_MB: '5' }, '--frobnicate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage: build-prune/);
  });

  it('WHEN a file is hard-linked outside the unit THEN it survives the unit', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 4, ageMin: 10 });
    const kept = join(dir, 'kept');
    linkSync(join(path, 'debug/deps/blob'), kept);
    prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '1' });
    assert.equal(existsSync(path), false);
    assert.equal(statSync(kept).size, 4 * MB);
  });

  it('WHEN a unit name holds a space THEN it is handled like any other', () => {
    const base = root();
    const old = unit(base, 'aa/u 1', { mb: 4, ageMin: 100 });
    const fresh = unit(base, 'bb/u2', { mb: 4, ageMin: 1 });
    prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '6' });
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(fresh), true);
  });

  it('WHEN a unit vanishes while the run measures it THEN the run still ends with a summary', () => {
    const base = root();
    unit(base, 'aa/u1', { mb: 4, ageMin: 10 });
    const PATH = wrapTool('du', 'for last; do :; done\nrm -rf -- "$last"');
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', PATH });
    assert.equal(result.status, 0);
    assert.match(lastLine(result), /^build-prune: 0 units, /);
  });

  it('WHEN a directory has no tag THEN it is neither counted nor removed', () => {
    const base = root();
    const big = unit(base, 'logs/big', { mb: 8, ageMin: 500, tag: null });
    const tagged = unit(base, 'aa/u1', { mb: 3, ageMin: 10 });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(existsSync(big) && existsSync(tagged), true);
    assert.match(lastLine(result), /^build-prune: 1 units, /);
  });

  it("WHEN the tag's first line differs THEN the directory is not a unit", () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 8, ageMin: 10, tag: 'Signature: 0000\n' });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(existsSync(path), true);
    assert.match(lastLine(result), /^build-prune: 0 units, /);
  });

  it('WHEN a tagged directory lies under tmp THEN it is not a unit', () => {
    const base = root();
    const path = unit(base, 'tmp/run1/x', { mb: 8, ageMin: 10 });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(existsSync(path), true);
    assert.match(lastLine(result), /^build-prune: 0 units, /);
  });

  it('WHEN a tagged directory lies inside a unit THEN it is counted once', () => {
    const base = root();
    unit(base, 'aa/u1', { mb: 4, ageMin: 10 });
    unit(base, 'aa/u1/inner', { mb: 1, ageMin: 10 });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100' });
    assert.match(lastLine(result), /^build-prune: 1 units, /);
  });

  it('WHEN a tagged directory is four levels down THEN it is not a unit', () => {
    const base = root();
    const path = unit(base, 'a/b/c/d', { mb: 8, ageMin: 10 });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(existsSync(path), true);
    assert.match(lastLine(result), /^build-prune: 0 units, /);
  });

  it('WHEN a gate holds the cpu lock THEN the run skips and removes nothing', async () => {
    const { u1, u2, u3, env } = overCap();
    const holder = await holdLock('-s');
    try {
      const result = prune(env);
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), LOCK_SKIP);
      assert.equal([u1, u2, u3].every(existsSync), true);
    } finally {
      await release(holder);
    }
  });

  it('WHEN another prune holds the lock exclusively THEN the run skips', async () => {
    const { u1, u2, u3, env } = overCap();
    const holder = await holdLock('-x');
    try {
      const result = prune(env);
      assert.equal(result.stdout.trim(), LOCK_SKIP);
      assert.equal([u1, u2, u3].every(existsSync), true);
    } finally {
      await release(holder);
    }
  });

  it('WHEN the busy command says cargo runs THEN the run skips and removes nothing', () => {
    const { u1, u2, u3, env } = overCap();
    const result = prune({ ...env, BUILD_PRUNE_BUSY: 'true' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), BUSY_SKIP);
    assert.equal([u1, u2, u3].every(existsSync), true);
  });

  for (const [code, what] of MID_RUN) {
    it(`WHEN ${what} after the first deletion THEN the run stops deleting and prints the summary`, () => {
      const { u1, u2, u3, env } = overCap();
      const busy = busyAfter(2, code);
      const result = prune({ ...env, BUILD_PRUNE_CAP_MB: '5', BUILD_PRUNE_UNIT_MB: '100', BUILD_PRUNE_BUSY: busy });
      assert.deepEqual([existsSync(u1), existsSync(u2), existsSync(u3)], [false, true, true]);
      assert.match(lastLine(result), /^build-prune: 2 units, /);
      assert.equal(result.status, 0);
    });
  }

  it('WHEN --dry-run runs under a held lock and a busy machine THEN it still reports', async () => {
    const { u1, u2, u3, env } = overCap();
    const holder = await holdLock('-s');
    try {
      const result = prune({ ...env, BUILD_PRUNE_BUSY: 'true' }, '--dry-run');
      assert.match(result.stdout, /^would remove /m);
      assert.equal([u1, u2, u3].every(existsSync), true);
    } finally {
      await release(holder);
    }
  });

  it('WHEN a unit is a symlink that leads out of the root THEN the target survives', () => {
    const base = root();
    const outside = unit(mkdtempSync(join(dir, 'out-')), 'tagged', { mb: 3, ageMin: 10, incrementalMb: 6 });
    const link = join(base, 'aa/out');
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(outside, link);
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '1', BUILD_PRUNE_UNIT_MB: '6' });
    assert.equal(existsSync(join(outside, 'debug/deps/blob')) && existsSync(join(outside, 'debug/incremental/blob')), true);
    assert.equal(existsSync(link), true);
    assert.match(lastLine(result), /^build-prune: 0 units, /);
  });

  it('WHEN a root is not an absolute path THEN usage and exit 2', () => {
    const result = prune({ BUILD_PRUNE_ROOTS: 'relative/dir', BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage: build-prune/);
  });

  it('WHEN a tag cannot be read THEN the directory is not a unit and the run still ends with a summary', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 8, ageMin: 10 });
    chmodSync(join(path, 'CACHEDIR.TAG'), 0o000);
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(existsSync(path), true);
    assert.match(lastLine(result), /^build-prune: 0 units, /);
  });

  it('WHEN an incremental dir vanishes while it is measured THEN the run still ends with a summary', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 6 });
    const PATH = wrapTool('du', 'for last; do :; done\ncase "$last" in */incremental) rm -rf -- "$last" ;; esac');
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6', PATH });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(existsSync(join(path, 'debug/deps/blob')), true);
    assert.match(lastLine(result), /^build-prune: 1 units, /);
  });

  // The tag text is compared whole: a tag that was deleted and written back would hold the signature line only.
  it('WHEN part of a unit cannot be deleted THEN its tag is never touched and the next run still counts it', () => {
    const { base, stuck, fresh, unlock } = stuckUnit();
    try {
      const first = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '8' });
      const second = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100' });
      assert.equal(existsSync(join(stuck, 'debug/deps/blob')), false);
      assert.equal(readFileSync(join(stuck, 'CACHEDIR.TAG'), 'utf8'), TEST_TAG);
      assert.equal(existsSync(fresh), true);
      assert.equal(linesOf(first, 'removed ').length, 0);
      assert.match(first.stdout, new RegExp(`^build-prune: could not remove all of ${stuck}, [1-9]\\d* MB left$`, 'm'));
      assert.match(lastLine(first), /^build-prune: 2 units, /);
      assert.match(lastLine(second), /^build-prune: 2 units, /);
    } finally {
      unlock();
    }
  });

  it('WHEN the look for what is left of a unit fails THEN its tag is never touched', () => {
    const { base, stuck, unlock } = stuckUnit();
    const PATH = wrapTool('find', 'case "$*" in *-quit*) exit 1 ;; esac');
    try {
      const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '8', PATH });
      assert.equal(readFileSync(join(stuck, 'CACHEDIR.TAG'), 'utf8'), TEST_TAG);
      assert.match(lastLine(result), /^build-prune: 2 units, /);
    } finally {
      unlock();
    }
  });

  // The busy command swaps the unit for a link on its second call, just before the unit is deleted. The
  // read-only parent keeps the link in place, so the run ends with a path that exists and holds no tag.
  it('WHEN a unit turns into a link to an untagged directory mid-run THEN that directory gets no tag and keeps its files', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 4, ageMin: 10 });
    const plain = unit(base, 'logs/plain', { mb: 1, ageMin: 10, tag: null });
    const swap = `rm -rf "${path}"; ln -s "${plain}" "${path}"; chmod 555 "${join(base, 'aa')}"`;
    try {
      prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '1', BUILD_PRUNE_BUSY: `${callCount()}; [ "$n" = 1 ] && { ${swap}; }; exit 1` });
      const second = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '0' });
      assert.equal(existsSync(join(plain, 'CACHEDIR.TAG')), false);
      assert.equal(existsSync(join(plain, 'debug/deps/blob')), true);
      assert.match(lastLine(second), /^build-prune: 0 units, /);
    } finally {
      chmodSync(join(base, 'aa'), 0o755);
    }
  });

  for (const code of [2, 127]) {
    it(`WHEN the busy command exits ${code} THEN the run fails, says so and removes nothing`, () => {
      const { u1, u2, u3, env } = overCap();
      const result = prune({ ...env, BUILD_PRUNE_BUSY: `exit ${code}` });
      assert.equal(result.status, 1);
      assert.equal(result.stderr.trim(), `build-prune: the busy check failed with exit ${code}, nothing removed`);
      assert.equal(result.stdout, '');
      assert.equal([u1, u2, u3].every(existsSync), true);
    });
  }

  for (const name of ['cargo', 'rustc']) {
    it(`WHEN a process named ${name} runs and no busy command is set THEN the run skips`, async () => {
      const { u1, u2, u3, env } = overCap();
      const child = await standIn(name);
      try {
        const result = prune({ ...env, BUILD_PRUNE_BUSY: undefined, PATH: OWN_CHILDREN });
        assert.equal(result.stdout.trim(), BUSY_SKIP);
        assert.equal([u1, u2, u3].every(existsSync), true);
      } finally {
        await release(child);
      }
    });
  }

  it('WHEN nothing named cargo or rustc runs and no busy command is set THEN the run prunes', () => {
    const { u1, env } = overCap();
    const result = prune({ ...env, BUILD_PRUNE_BUSY: undefined, PATH: OWN_CHILDREN });
    assert.equal(existsSync(u1), false);
    assert.match(lastLine(result), /^build-prune: 2 units, /);
  });

  it('WHEN a process whose name only starts with cargo runs and no busy command is set THEN the run prunes', async () => {
    const { u1, env } = overCap();
    const child = await standIn('cargo-watch');
    try {
      const result = prune({ ...env, BUILD_PRUNE_BUSY: undefined, PATH: OWN_CHILDREN });
      assert.equal(existsSync(u1), false);
      assert.match(lastLine(result), /^build-prune: 2 units, /);
    } finally {
      await release(child);
    }
  });

  it('WHEN pgrep fails for cargo and no busy command is set THEN the run fails and removes nothing', () => {
    const { u1, u2, u3, env } = overCap();
    const PATH = wrapTool('pgrep', 'for last; do :; done\n[ "$last" = rustc ] && exit 1\nexit 3');
    const result = prune({ ...env, BUILD_PRUNE_BUSY: undefined, PATH });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /the busy check failed with exit 3/);
    assert.equal([u1, u2, u3].every(existsSync), true);
  });

  it('WHEN the busy command reads its input THEN every incremental dir still goes and the unit stays', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 3 });
    put(join(path, 'release/incremental/blob'), Buffer.alloc(3 * MB, 1), ago(10));
    const env = { BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6' };
    prune({ ...env, BUILD_PRUNE_BUSY: 'cat >/dev/null; exit 1' });
    assert.equal(existsSync(join(path, 'debug/incremental')) || existsSync(join(path, 'release/incremental')), false);
    assert.equal(existsSync(join(path, 'debug/deps/blob')), true);
  });

  it('WHEN a root lies inside another root THEN usage and exit 2', () => {
    const base = root();
    const result = prune({ BUILD_PRUNE_ROOTS: `${join(base, 'aa')}:${base}`, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /lies inside root/);
  });

  it('WHEN a root is a symlink into another root THEN usage and exit 2', () => {
    const base = root();
    const link = join(mkdtempSync(join(dir, 'link-')), 'r');
    mkdirSync(join(base, 'aa'));
    symlinkSync(join(base, 'aa'), link);
    const result = prune({ BUILD_PRUNE_ROOTS: `${link}:${base}`, BUILD_PRUNE_CAP_MB: '5' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /lies inside root/);
  });

  it('WHEN one root name starts with the name of another THEN both are read', () => {
    const base = root();
    unit(join(base, 'aa'), 'x/u1', { mb: 2, ageMin: 10 });
    unit(join(base, 'aab'), 'x/u2', { mb: 2, ageMin: 10 });
    const result = prune({ BUILD_PRUNE_ROOTS: `${join(base, 'aa')}:${join(base, 'aab')}`, BUILD_PRUNE_CAP_MB: '100' });
    assert.equal(result.status, 0);
    assert.match(lastLine(result), /^build-prune: 2 units, /);
  });

  it('WHEN --dry-run meets a unit over the unit limit THEN its incremental dirs stay', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 6 });
    const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6' }, '--dry-run');
    assert.match(result.stdout, new RegExp(`^would remove ${path}/\\*/incremental \\d+ MB$`, 'm'));
    assert.equal(existsSync(join(path, 'debug/incremental/blob')), true);
  });

  it('WHEN the only unit of a root is removed THEN its parent goes and the root stays', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 4, ageMin: 10 });
    prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '1' });
    assert.equal(existsSync(join(base, 'aa')), false);
    assert.equal(existsSync(base), true);
    assert.equal(existsSync(path), false);
  });

  for (const [code, what] of MID_RUN) {
    it(`WHEN ${what} before the first incremental dir goes THEN nothing is removed and the summary prints`, () => {
      const base = root();
      const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 6 });
      const env = { BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6' };
      const result = prune({ ...env, BUILD_PRUNE_BUSY: busyAfter(1, code) });
      assert.equal(existsSync(join(path, 'debug/incremental/blob')), true);
      assert.equal(linesOf(result, 'removed ').length, 0);
      assert.match(lastLine(result), /^build-prune: 1 units, /);
    });
  }

  it('WHEN a unit is emptied but its parent is read-only THEN its tag is never touched and it stays a unit', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 4, ageMin: 10 });
    chmodSync(join(base, 'aa'), 0o555);
    try {
      const first = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '1' });
      const second = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100' });
      assert.equal(existsSync(join(path, 'debug')), false);
      assert.equal(readFileSync(join(path, 'CACHEDIR.TAG'), 'utf8'), TEST_TAG);
      assert.match(first.stdout, new RegExp(`^build-prune: could not remove all of ${path}, `, 'm'));
      assert.match(lastLine(second), /^build-prune: 1 units, /);
    } finally {
      chmodSync(join(base, 'aa'), 0o755);
    }
  });

  it('WHEN the lock file cannot be opened THEN the run fails, says so and removes nothing', () => {
    const { u1, u2, u3, env } = overCap();
    const result = prune({ ...env, CPU_LOCK_FILE: root() });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^build-prune: cannot open the lock file /m);
    assert.equal(result.stdout, '');
    assert.equal([u1, u2, u3].every(existsSync), true);
  });

  it('WHEN an incremental dir cannot be deleted THEN no removed line claims it and nothing leaks to stderr', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 6 });
    const locked = join(path, 'debug/incremental');
    chmodSync(locked, 0o555);
    try {
      const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6' });
      assert.equal(result.stderr, '');
      assert.equal(linesOf(result, 'removed ').length, 0);
      assert.match(result.stdout, new RegExp(`^build-prune: could not remove all of ${path}/\\*/incremental$`, 'm'));
      assert.equal(readFileSync(join(path, 'CACHEDIR.TAG'), 'utf8'), TEST_TAG);
      assert.match(lastLine(result), /^build-prune: 1 units, /);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('WHEN one of two incremental dirs cannot be deleted THEN the removed line gives what was freed', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 3 });
    const locked = join(path, 'release/incremental');
    put(join(locked, 'blob'), Buffer.alloc(3 * MB, 1), ago(10));
    chmodSync(locked, 0o555);
    try {
      const result = prune({ BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '8' });
      assert.deepEqual(linesOf(result, 'removed '), [`removed ${path}/*/incremental 3 MB`]);
      assert.match(result.stdout, new RegExp(`^build-prune: could not remove all of ${path}/\\*/incremental$`, 'm'));
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('WHEN cargo starts between two incremental dirs THEN the one left is not reported as a failed removal', () => {
    const base = root();
    const path = unit(base, 'aa/u1', { mb: 3, ageMin: 10, incrementalMb: 6 });
    put(join(path, 'release/incremental/blob'), Buffer.alloc(6 * MB, 1), ago(10));
    const env = { BUILD_PRUNE_ROOTS: base, BUILD_PRUNE_CAP_MB: '100', BUILD_PRUNE_UNIT_MB: '6' };
    const result = prune({ ...env, BUILD_PRUNE_BUSY: busyAfter(2) });
    const left = ['debug', 'release'].filter((profile) => existsSync(join(path, profile, 'incremental')));
    assert.equal(left.length, 1);
    assert.equal(linesOf(result, 'build-prune: could not remove all of ').length, 0);
    assert.equal(linesOf(result, `removed ${path}/*/incremental `).length, 1);
    assert.match(lastLine(result), /^build-prune: 1 units, /);
  });
});
