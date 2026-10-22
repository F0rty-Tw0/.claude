import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { decide } = require('./cqt-guard.js');

const WRAP = '~/.claude/scripts/cpu-lock gate nice -n 19 "${SHELL:-bash}" -c ';

describe('cqt-guard', () => {
  it('WHEN pkill or pgrep runs with -f anywhere in its flags THEN it is blocked; a pid kill passes', () => {
    for (const cmd of ['pkill -f perf.sh', 'pgrep -af vitest', 'ls && pgrep -f x', 'pgrep -l -f perf', 'pkill --signal 9 -f x', 'pkill -9 --full x', 'sudo pkill -f x', 'env pkill -f x', 'xargs pkill -f x']) assert.ok(decide(cmd).block, cmd);
    for (const cmd of ['kill 1234', 'pgrep -x firefox']) assert.deepEqual(decide(cmd), {}, cmd);
  });

  it('WHEN a git command would drop uncommitted work THEN it is blocked; read-only and staged-only forms pass', () => {
    const wipes = [
      'git stash', 'git -C ../wt stash', 'git reset --hard', 'git -C ../wt reset --hard', 'git reset --merge',
      'git restore src/a.rs', 'git restore --staged --worktree a.rs', 'git checkout -- a.rs', 'git checkout HEAD -- a.rs',
      'git checkout .', 'git checkout -f', 'git clean -fdx', 'cd x && /usr/bin/git stash',
      'command git stash', 'sudo git reset --hard', 'time git stash', 'git -c a=b stash', 'git --git-dir=x stash',
      'git -C "dir with space" reset --hard', 'git checkout -qf main', 'git switch -f main', 'git switch --discard-changes main',
    ];
    for (const cmd of wipes) assert.ok(decide(cmd).block, cmd);
    const keeps = ['git stash list', 'git restore --staged a.rs', 'git checkout -b x', 'git reset HEAD~0 --soft', 'git clean -n', 'git checkout --theirs a.rs', 'git switch main'];
    for (const cmd of keeps) assert.deepEqual(decide(cmd), {}, cmd);
  });

  it('WHEN a commit message or a file name mentions a blocked command THEN nothing is blocked', () => {
    const prose = [
      'git commit -m "never git stash here"', 'git commit -m "a; git stash it"', "git commit -m 'run pkill -f x'",
      'cat scripts/e2e/perf.sh', 'git add scripts/e2e/perf.sh', "cat > notes.md <<'EOF'\ngit stash is banned\nEOF",
    ];
    for (const cmd of prose) assert.deepEqual(decide(cmd), {}, cmd);
  });

  it('WHEN a heredoc opener line also runs commands THEN those commands are still checked', () => {
    assert.ok(decide("cat > n.md <<'EOF'; git stash\nnotes\nEOF").block);
    assert.match(decide("cat > t.rs <<'EOF' && cargo test\nfn x() {}\nEOF").command, /cpu-lock gate/);
  });

  it('WHEN a perf run is outside cpu-lock bench THEN it is blocked with the override named; inside it passes unwrapped', () => {
    const runs = [
      './perfrun.sh B1 bin', 'STUDIO_BIN=x scripts/e2e/perf.sh', 'bash scripts/e2e/perf.sh', 'hyperfine a', 'timeout 600 ./perf.sh',
      'time ./perfrun.sh', 'taskset -c 2 ./perfrun.sh', 'taskset -c 2 cargo bench', 'nice -19 ./perf.sh', 'FOO="a b" ./perf.sh',
      '~/.claude/scripts/cpu-lock gate ./perf.sh', '~/.claude/scripts/cpu-lock bench true; ./perf.sh', 'nohup ./perf.sh &', 'exec ./perf.sh',
    ];
    for (const cmd of runs) {
      assert.ok(decide(cmd).block, cmd);
      assert.match(decide(cmd).block, /CQT_GUARD_OK=1/);
    }
    const locked = [
      '~/.claude/scripts/cpu-lock bench ./perfrun.sh B1 bin', "~/.claude/scripts/cpu-lock bench bash -c 'cd x && ./perf.sh'",
      "~/.claude/scripts/cpu-lock bench bash -c 'cd a && cargo bench'", "~/.claude/scripts/cpu-lock bench taskset -c 2 bash -c 'make; ./perfrun.sh B1'",
    ];
    for (const cmd of locked) assert.deepEqual(decide(cmd), {}, cmd);
  });

  it('WHEN cargo build or test runs bare THEN it is wrapped in the gate lock with rtk added at command position', () => {
    assert.equal(decide("cd x && cargo test -p a -- 'b c'").command, `${WRAP}'cd x && rtk cargo test -p a -- '\\''b c'\\'''`);
    assert.equal(decide('RUSTFLAGS=x cargo build').command, `${WRAP}'RUSTFLAGS=x rtk cargo build'`);
    assert.equal(decide('cargo run --bin x').command, `${WRAP}'cargo run --bin x'`);
    assert.equal(decide('RTK_DISABLED=1 cargo test').command, `${WRAP}'RTK_DISABLED=1 cargo test'`);
    assert.deepEqual(decide('~/.claude/scripts/cpu-lock gate cargo build'), {});
    assert.deepEqual(decide('cargo fmt --all'), {});
  });

  it('WHEN cargo bench only compiles (--no-run) THEN it is wrapped in the gate lock, not blocked', () => {
    assert.equal(decide('cargo bench --no-run').command, `${WRAP}'cargo bench --no-run'`);
    assert.ok(decide('cargo bench -p x').block);
    assert.ok(decide('cargo bench\necho --no-run').block);
  });

  it('WHEN the wrapped command is parsed by the shell THEN its -c argument is the original command', () => {
    const original = `cargo run -p a -- 'it'"'"'s' "$HOME" && echo done`;
    const quoted = decide(original).command.slice(WRAP.length);
    assert.equal(execFileSync('bash', ['-c', `printf %s ${quoted}`], { encoding: 'utf8' }), original);
  });

  it('WHEN rtk is installed THEN its hook leaves heavy cargo to this guard (exclude_commands)', (t) => {
    // `rtk hook check` exits 1 when it would not rewrite.
    const check = spawnSync('rtk', ['hook', 'check', 'cd', 'x', '&&', 'cargo', 'test'], { encoding: 'utf8' });
    if (check.error) return t.skip('rtk not installed');
    assert.match(check.stdout + check.stderr, /No rewrite/);
  });

  it('WHEN the command starts with CQT_GUARD_OK=1 THEN nothing is blocked or wrapped', () => {
    assert.deepEqual(decide('CQT_GUARD_OK=1 git stash'), {});
  });
});
