import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const LOCK_SCRIPT = join(import.meta.dirname, 'cpu-lock');
const env = { ...process.env, CPU_LOCK_FILE: join(mkdtempSync(join(tmpdir(), 'cpu-lock-')), 'l.lock') };
const run = (...args) => spawnSync('timeout', ['1', LOCK_SCRIPT, ...args], { env, encoding: 'utf8' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const held = () => spawnSync('flock', ['-n', '-x', env.CPU_LOCK_FILE, 'true']).status !== 0;
async function untilHeld() {
  for (let tries = 0; tries < 100 && !held(); tries++) await sleep(20);
  assert.ok(held(), 'the gate never took the lock');
}

describe('cpu-lock', () => {
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
});
