import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const LOCK_SCRIPT = join(import.meta.dirname, 'cpu-lock');
const dir = mkdtempSync(join(tmpdir(), 'cpu-lock-'));
const env = { ...process.env, CPU_LOCK_FILE: join(dir, 'l.lock') };
const run = (...args) => spawnSync('timeout', ['1', LOCK_SCRIPT, ...args], { env, encoding: 'utf8' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const held = () => spawnSync('flock', ['-n', '-x', env.CPU_LOCK_FILE, 'true']).status !== 0;
async function untilHeld() {
  for (let tries = 0; tries < 100 && !held(); tries++) await sleep(20);
  assert.ok(held(), 'the gate never took the lock');
}

describe('cpu-lock', () => {
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('WHEN a gate command runs THEN a second gate runs alongside and a bench waits, saying so', async () => {
    const gate = spawn(LOCK_SCRIPT, ['gate', 'sleep', '2'], { env });
    await untilHeld();
    assert.equal(run('gate', 'true').status, 0);
    const bench = run('bench', 'true');
    assert.equal(bench.status, 124);
    assert.match(bench.stderr, /waiting for the bench lock/);
    gate.kill();
  });

  it('WHEN a gate command exits leaving a background child THEN the lock is free for a bench', async () => {
    // stdio ignored: an inherited pipe would make spawnSync wait for the child too.
    spawnSync(LOCK_SCRIPT, ['gate', 'bash', '-c', 'sleep 2 & true'], { env, stdio: 'ignore' });
    assert.equal(run('bench', 'true').status, 0);
    await sleep(2000);
  });

  it('WHEN flock is not installed THEN the command runs unlocked with its own exit code', () => {
    const noFlock = { CPU_LOCK_FILE: env.CPU_LOCK_FILE, PATH: dir };
    const result = spawnSync('/bin/bash', [LOCK_SCRIPT, 'gate', process.execPath, '-e', 'process.stdout.write("ran"); process.exit(3)'], { env: noFlock, encoding: 'utf8' });
    assert.deepEqual([result.status, result.stdout], [3, 'ran']);
  });

  it('WHEN flock is not installed THEN the command runs unlocked and says so', () => {
    const bin = mkdtempSync(join(tmpdir(), 'nobin-'));
    after(() => rmSync(bin, { recursive: true, force: true }));
    symlinkSync(spawnSync('which', ['bash'], { encoding: 'utf8' }).stdout.trim(), join(bin, 'bash'));
    const r = spawnSync(LOCK_SCRIPT, ['gate', '/bin/echo', 'hi'], { env: { PATH: bin, HOME: bin }, encoding: 'utf8' }); // cpu-lock:8 reads $HOME under set -u
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), 'hi');
    assert.match(r.stderr, /flock not found, running unlocked/);
  });
});
