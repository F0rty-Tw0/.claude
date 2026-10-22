import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { decide } = require('./cqt-guard.js');

describe('cqt-guard', () => {
  it('WHEN pkill or pgrep runs with -f THEN it is blocked; a pid kill passes', () => {
    for (const cmd of ['pkill -f perf.sh', 'pgrep -af vitest', 'ls && pgrep -f x']) assert.ok(decide(cmd).block, cmd);
    assert.deepEqual(decide('kill 1234'), {});
  });

  it('WHEN git stash, reset --hard, restore or checkout -- runs THEN it is blocked; read-only forms pass', () => {
    for (const cmd of ['git stash', 'git reset --hard', 'git restore src/a.rs', 'git checkout -- a.rs', 'git checkout .']) assert.ok(decide(cmd).block, cmd);
    for (const cmd of ['git stash list', 'git restore --staged a.rs', 'git checkout -b x', 'git reset HEAD~0 --soft']) assert.deepEqual(decide(cmd), {}, cmd);
  });

  it('WHEN a perf run is outside cpu-lock bench THEN it is blocked; inside it passes unwrapped', () => {
    assert.ok(decide('./perfrun.sh B1 bin').block);
    assert.deepEqual(decide('~/.claude/scripts/cpu-lock bench ./perfrun.sh B1 bin'), {});
  });

  it('WHEN cargo test runs bare THEN it is wrapped in the gate lock with quotes kept', () => {
    assert.equal(decide("cd x && cargo test -p a -- 'b c'").command, `~/.claude/scripts/cpu-lock gate nice -n 19 bash -c 'cd x && cargo test -p a -- '\\''b c'\\'''`);
    assert.deepEqual(decide('~/.claude/scripts/cpu-lock gate cargo build'), {});
    assert.deepEqual(decide('cargo fmt --all'), {});
  });

  it('WHEN cargo bench only compiles (--no-run) THEN it is wrapped in the gate lock, not blocked', () => {
    assert.equal(decide('cargo bench --no-run').command, `~/.claude/scripts/cpu-lock gate nice -n 19 bash -c 'cargo bench --no-run'`);
    assert.ok(decide('cargo bench -p x').block);
    assert.ok(decide('cargo bench\necho --no-run').block);
  });

  it('WHEN the wrapped command is parsed by bash THEN its bash -c argument is the original command', () => {
    const original = `cargo test -p a -- 'it'"'"'s' "$HOME" && echo done`;
    const quoted = decide(original).command.replace(/^.*? bash -c /, '');
    assert.equal(execFileSync('bash', ['-c', `printf %s ${quoted}`], { encoding: 'utf8' }), original);
  });

  it('WHEN the user prefixes CQT_GUARD_OK=1 THEN nothing is blocked or wrapped', () => {
    assert.deepEqual(decide('CQT_GUARD_OK=1 git stash'), {});
  });
});
