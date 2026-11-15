import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const { decide } = createRequire(import.meta.url)('./cpu-guard.js');
const WRAP = '~/.claude/scripts/cpu-lock gate nice -n 19 "${SHELL:-bash}" -c ';
const root = mkdtempSync(join(tmpdir(), 'cpu-guard-'));
// The PATH lookup is injected: these cases hold on a machine without rtk or flock.
const ctx = { cwd: root, platform: 'linux', onPath: () => true };
const UNIX = ['linux', 'darwin'];
const RTK_EXAMPLES = [['cd x && cargo test -p a', 'cd x && rtk cargo test -p a'], ['pnpm vitest run', 'rtk vitest'], ['pnpm tsc --noEmit', 'rtk tsc --noEmit']];
// A PATH directory holding an empty executable per name: the CLI cases scan it for real.
const binWith = (...programs) => {
  const bin = mkdtempSync(join(root, 'bin-'));
  for (const program of programs) writeFileSync(join(bin, program), '#!/bin/sh\n', { mode: 0o755 });

  return bin;
};
const runCli = (input, bin) => spawnSync(process.execPath, [join(import.meta.dirname, 'cpu-guard.js')], { input, encoding: 'utf8', env: { PATH: bin } });
// The command the CLI hands back for a hook payload, or null when it prints nothing.
const cliCommand = (command, bin) => {
  const { stdout } = runCli(JSON.stringify({ cwd: root, tool_input: { command } }), bin);

  return stdout ? JSON.parse(stdout).hookSpecificOutput.updatedInput.command : null;
};
const HEAVY_EXAMPLES = ['cargo test -p a', 'pnpm turbo run test', 'pnpm -r test', 'pnpm --filter x test', 'npm test', 'pnpm nx test x', 'node --test hooks/*.test.mjs'];
const JS_EXAMPLES = ['pnpm vitest run', 'pnpm tsc --noEmit', 'npx playwright test', 'pnpm exec turbo run test', 'pnpm run build'];

describe('cpu-guard', () => {
  after(() => rmSync(root, { recursive: true, force: true }));

  it('1. WHEN cargo or an rtk-excluded JS command runs bare THEN it is wrapped in the gate lock with rtk\'s form at command position', () => {
    assert.equal(decide("cd x && cargo test -p a -- 'b c'", ctx).command, `${WRAP}'cd x && rtk cargo test -p a -- '\\''b c'\\'''`);
    assert.equal(decide('RUSTFLAGS=x cargo build', ctx).command, `${WRAP}'RUSTFLAGS=x rtk cargo build'`);
    assert.equal(decide('cargo bench --no-run', ctx).command, `${WRAP}'cargo bench --no-run'`);
    assert.equal(decide('RTK_DISABLED=1 cargo test', ctx).command, `${WRAP}'RTK_DISABLED=1 cargo test'`);
    // oracles: `rtk rewrite` output measured before the exclusion (static map table)
    assert.equal(decide('pnpm vitest run', ctx).command, `${WRAP}'rtk vitest'`);
    assert.equal(decide('cd x && pnpm vitest run a.spec.ts', ctx).command, `${WRAP}'cd x && rtk vitest a.spec.ts'`);
    assert.equal(decide('pnpm tsc --noEmit', ctx).command, `${WRAP}'rtk tsc --noEmit'`);
    assert.equal(decide('npx playwright test', ctx).command, `${WRAP}'rtk playwright test'`);
    assert.equal(decide('pnpm exec turbo run test', ctx).command, `${WRAP}'rtk pnpm exec turbo run test'`);
    assert.equal(decide('pnpm run build', ctx).command, `${WRAP}'rtk pnpm run build'`);
    assert.equal(decide('RTK_DISABLED=1 pnpm vitest run', ctx).command, `${WRAP}'RTK_DISABLED=1 pnpm vitest run'`);
  });

  it('2. WHEN a turbo-console or other JS test command runs THEN it is wrapped unchanged', () => {
    assert.equal(decide('pnpm turbo run test', ctx).command, `${WRAP}'pnpm turbo run test'`);
    for (const cmd of HEAVY_EXAMPLES) assert.match(decide(cmd, ctx).command, /cpu-lock gate/, cmd);
  });

  it('3. WHEN a light, install, formatter, or watch command runs THEN nothing is wrapped', () => {
    for (const cmd of ['ls', 'git status', 'pnpm install', 'cargo fmt --all', 'pnpm test --watch', 'pnpm dev', 'pnpm run lint', 'git log --grep tsc', 'rg vitest src']) assert.deepEqual(decide(cmd, ctx), {}, cmd);
  });

  it('4. WHEN a commit message or heredoc body mentions a heavy command THEN nothing is wrapped; a command on the opener line still is', () => {
    assert.deepEqual(decide('git commit -m "pnpm test is green"', ctx), {});
    assert.deepEqual(decide("cat > n.md <<'EOF'\ncargo test\nEOF", ctx), {});
    assert.match(decide("cat > t.rs <<'EOF' && cargo test\nfn x() {}\nEOF", ctx).command, /cpu-lock gate/);
  });

  it('5. WHEN the cwd or an ancestor has .claude/cpu-guard.off THEN nothing is wrapped; a sibling repo is still wrapped', () => {
    const off = mkdtempSync(join(root, 'off-'));
    mkdirSync(join(off, '.claude'), { recursive: true });
    writeFileSync(join(off, '.claude', 'cpu-guard.off'), '');
    mkdirSync(join(off, 'pkg', 'a'), { recursive: true });
    assert.deepEqual(decide('pnpm turbo run test', { ...ctx, cwd: join(off, 'pkg', 'a') }), {});
    assert.match(decide('pnpm turbo run test', ctx).command, /cpu-lock gate/);
  });

  it('6. WHEN on win32, already locked, or given an exception prefix THEN nothing is wrapped', () => {
    assert.deepEqual(decide('cargo test', { ...ctx, platform: 'win32' }), {});
    for (const cmd of ['~/.claude/scripts/cpu-lock gate cargo build', 'CQT_GUARD_OK=1 cargo test', 'CPU_GUARD_OFF=1 pnpm test']) assert.deepEqual(decide(cmd, ctx), {}, cmd);
  });

  it('7. WHEN the wrapped command is parsed by the shell THEN its -c argument is the original command', () => {
    const original = `cargo run -p a -- 'it'"'"'s' "$HOME" && echo done`;
    const quoted = decide(original, ctx).command.slice(WRAP.length);
    assert.equal(execFileSync('bash', ['-c', `printf %s ${quoted}`], { encoding: 'utf8' }), original);
  });

  it('8. WHEN rtk runs with the exclude_commands line from cpu-guard.js\'s header THEN its hook leaves every bare and cd-prefixed example to this guard', { skip: process.platform !== 'linux' && 'rtk reads XDG_CONFIG_HOME only on Linux' }, (t) => {
    // `rtk hook check` prints "No rewrite for: …" when it would not rewrite. Compounds like `git status && <heavy>` are a known gap (cpu-guard.js header).
    const line = readFileSync(join(import.meta.dirname, 'cpu-guard.js'), 'utf8').match(/^\/\/ (exclude_commands = .*)$/m)[1];
    const config = mkdtempSync(join(root, 'rtk-'));
    mkdirSync(join(config, 'rtk'));
    writeFileSync(join(config, 'rtk', 'config.toml'), `[hooks]\n${line}\n`);
    const check = (cmd) => spawnSync('rtk', ['hook', 'check', ...cmd.split(' ')], { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: config } });
    if (check('ls').error) return t.skip('rtk not installed');
    for (const cmd of [...HEAVY_EXAMPLES, ...JS_EXAMPLES, 'cd x && pnpm vitest run', 'cd x && pnpm turbo run test']) {
      const result = check(cmd);
      assert.match(result.stdout + result.stderr, /No rewrite/, `${cmd}: add it to exclude_commands in cpu-guard.js's header`);
    }
    for (const cmd of ['git log --grep tsc', 'git log --grep pnpm test']) {
      const mention = check(cmd);
      assert.doesNotMatch(mention.stdout + mention.stderr, /No rewrite/, `${cmd}: a mention must keep rtk compression`);
    }
  });

  it('9. WHEN the CLI gets a hook payload THEN it prints updatedInput and exits 0; garbage stdin prints nothing', { skip: process.platform === 'win32' }, () => {
    const bin = binWith('flock');
    const ok = runCli(JSON.stringify({ cwd: root, tool_input: { command: 'pnpm test' } }), bin);
    assert.equal(ok.status, 0);
    assert.match(JSON.parse(ok.stdout).hookSpecificOutput.updatedInput.command, /cpu-lock gate/);
    const bad = runCli('not json', bin);
    assert.deepEqual([bad.status, bad.stdout], [0, '']);
  });

  it('10. WHEN a heavy command is only mentioned, in quotes or as an argument THEN nothing is wrapped; at command position it is', () => {
    const mentions = ['echo "pnpm test"', 'git log --grep "cargo test"', 'grep -r "npm test" .', 'rg "node --test" hooks', 'man cargo test', "bash -c 'x' # pnpm turbo run test", 'cat scripts/gates.sh', 'echo "cd x && pnpm test"', "rg 'a; cargo test' src"];
    for (const cmd of mentions) assert.deepEqual(decide(cmd, ctx), {}, cmd);
    const real = ['pnpm test', 'cd x && npm test', 'FOO=1 cargo test -p a', 'pnpm vitest run', 'git status; node --test a', 'echo "a" | pnpm nx test x', 'bash scripts/gates.sh', 'time cargo test', 'timeout 600 pnpm test', 'nice -n 5 cargo build'];
    for (const cmd of real) assert.match(decide(cmd, ctx).command ?? '', /cpu-lock gate/, cmd);
  });

  it('11. WHEN rtk vitest or rtk tsc is typed, a script is a :watch one, or a quote names cpu-lock THEN the watch is left alone and the rest are wrapped', () => {
    assert.equal(decide('rtk vitest', ctx).command, `${WRAP}'rtk vitest'`);
    assert.equal(decide('cd x && rtk tsc --noEmit', ctx).command, `${WRAP}'cd x && rtk tsc --noEmit'`);
    for (const cmd of ['pnpm test:watch', 'pnpm -r test:watch']) assert.deepEqual(decide(cmd, ctx), {}, cmd);
    assert.match(decide('echo "cpu-lock gate is next" && cargo test', ctx).command ?? '', /^~\/\.claude\/scripts\/cpu-lock gate/);
  });

  it('12. WHEN a heavy command follows leading space, a shell keyword or brace, or an env, sudo, xargs, time, nice or timeout prefix THEN it is wrapped with rtk\'s form', () => {
    const cases = [
      [' cargo test', ' rtk cargo test'],
      ['\tpnpm vitest run', '\trtk vitest'],
      ['if true; then cargo test; fi', 'if true; then rtk cargo test; fi'],
      ['for d in a b; do cargo build; done', 'for d in a b; do rtk cargo build; done'],
      ['{ cargo test; }', '{ rtk cargo test; }'],
      ['! cargo test', '! rtk cargo test'],
      // env and sudo can reset PATH, which may not hold rtk: locked, no rtk form
      ['env FOO=1 cargo test', 'env FOO=1 cargo test'],
      ['env -i cargo test', 'env -i cargo test'],
      ['sudo cargo build', 'sudo cargo build'],
      ['ls | xargs -n1 cargo test', 'ls | xargs -n1 rtk cargo test'],
      ['time -p cargo test', 'time -p rtk cargo test'],
      ['nice --adjustment=5 cargo test', 'nice --adjustment=5 rtk cargo test'],
      ['timeout -s KILL 5 cargo test', 'timeout -s KILL 5 rtk cargo test'],
      ['timeout --signal=KILL 5 cargo test', 'timeout --signal=KILL 5 rtk cargo test'],
    ];
    for (const [cmd, inner] of cases) assert.equal(decide(cmd, ctx).command, `${WRAP}'${inner}'`, cmd);
    assert.match(decide('timeout -k 5 600 pnpm test', ctx).command ?? '', /cpu-lock gate/);
  });

  it('13. WHEN quoted text or a heredoc body names a command rtk rewrites THEN that text reaches the shell unchanged; the real command still gets rtk\'s form', () => {
    assert.equal(decide('echo "a; cargo test" && pnpm test', ctx).command, `${WRAP}'echo "a; cargo test" && pnpm test'`);
    assert.equal(decide('FOO="a b" cargo test', ctx).command, `${WRAP}'FOO="a b" rtk cargo test'`);
    const heredoc = 'cat > run.sh <<EOF\ncargo test\npnpm vitest run\nEOF\npnpm vitest run';
    assert.equal(decide(heredoc, ctx).command, `${WRAP}'cat > run.sh <<EOF\ncargo test\npnpm vitest run\nEOF\nrtk vitest'`);
    const bodies = [
      'cat > f <<-EOF\n\tcargo test\n\tEOF\npnpm vitest run',
      'cat > f <<EOF\r\ncargo test\r\nEOF\r\npnpm vitest run',
      "cat > f <<'END-X'\ncargo test\nEND-X\npnpm vitest run",
      'cat > f <<\\EOF\ncargo test\nEOF\npnpm vitest run',
      // a <<- inside a plain heredoc body is body text: the outer heredoc ends at EOF
      "cat <<'EOF' > gen.sh\ncargo test\ncat <<-EOF\nx\nEOF\npnpm vitest run",
    ];
    for (const cmd of bodies) assert.equal(decide(cmd, ctx).command, `${WRAP}'${cmd.replace(/pnpm vitest run$/, 'rtk vitest').replaceAll("'", "'\\''")}'`, JSON.stringify(cmd));
    assert.equal(decide('out=$(cargo test 2>&1); echo "$out"', ctx).command, `${WRAP}'out=$(cargo test 2>&1); echo "$out"'`);
    assert.equal(decide('cat <<< "x"\ncargo test', ctx).command, `${WRAP}'cat <<< "x"\nrtk cargo test'`);
    assert.equal(decide('cat <<EOF; cargo build\nx\nEOF', ctx).command, `${WRAP}'cat <<EOF; rtk cargo build\nx\nEOF'`);
  });

  describe('GIVEN flock is on PATH and rtk is not', () => {
    const onPath = (program) => program === 'flock';

    for (const platform of UNIX) {
      it(`14. WHEN a command with an rtk form runs on ${platform} THEN it is wrapped in the gate lock as typed, with no rtk in front`, () => {
        for (const [cmd] of RTK_EXAMPLES) assert.equal(decide(cmd, { ...ctx, platform, onPath }).command, `${WRAP}'${cmd}'`, cmd);
      });
    }

    it('15. WHEN the same command runs on win32 THEN nothing is wrapped', () => {
      for (const [cmd] of RTK_EXAMPLES) assert.deepEqual(decide(cmd, { ...ctx, platform: 'win32', onPath }), {}, cmd);
    });
  });

  describe('GIVEN flock and rtk are both on PATH', () => {
    for (const platform of UNIX) {
      it(`16. WHEN a command with an rtk form runs on ${platform} THEN it is wrapped with rtk's form`, () => {
        for (const [cmd, inner] of RTK_EXAMPLES) assert.equal(decide(cmd, { ...ctx, platform }).command, `${WRAP}'${inner}'`, cmd);
      });
    }
  });

  describe('GIVEN flock is not on PATH', () => {
    const onPath = (program) => program === 'rtk';

    for (const platform of [...UNIX, 'win32']) {
      it(`17. WHEN a heavy command runs on ${platform} THEN nothing is wrapped`, () => {
        for (const cmd of [...HEAVY_EXAMPLES, ...JS_EXAMPLES]) assert.deepEqual(decide(cmd, { ...ctx, platform, onPath }), {}, cmd);
      });
    }
  });

  describe('GIVEN a PATH lookup that throws when called', () => {
    const onPath = (program) => { throw new Error(`looked up ${program}`); };

    it('18. WHEN a light command runs THEN PATH is not scanned', () => {
      assert.deepEqual(decide('git status', { ...ctx, onPath }), {});
    });

    it('19. WHEN a heavy command runs on win32 THEN PATH is not scanned', () => {
      assert.deepEqual(decide('cargo test', { ...ctx, platform: 'win32', onPath }), {});
    });
  });

  describe('GIVEN the CLI scans a real PATH directory', { skip: process.platform === 'win32' && 'the hook never wraps on win32' }, () => {
    it('20. WHEN it holds flock and rtk THEN the heavy command is wrapped with rtk\'s form', () => {
      assert.equal(cliCommand('cargo test -p a', binWith('flock', 'rtk')), `${WRAP}'rtk cargo test -p a'`);
    });

    it('21. WHEN it holds flock only THEN the heavy command is wrapped as typed', () => {
      assert.equal(cliCommand('cargo test -p a', binWith('flock')), `${WRAP}'cargo test -p a'`);
    });

    it('22. WHEN it holds rtk only THEN nothing is printed', () => {
      assert.equal(cliCommand('cargo test -p a', binWith('rtk')), null);
    });

    it('23. WHEN its flock file is not executable THEN nothing is printed', () => {
      const bin = binWith('rtk');
      writeFileSync(join(bin, 'flock'), '', { mode: 0o644 });

      assert.equal(cliCommand('cargo test -p a', bin), null);
    });
  });
});
