import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const { decide } = createRequire(import.meta.url)('./cpu-guard.js');
const WRAP = '~/.claude/scripts/cpu-lock gate nice -n 19 "${SHELL:-bash}" -c ';
const root = mkdtempSync(join(tmpdir(), 'cpu-guard-'));
const ctx = { cwd: root, platform: 'linux' };
const HEAVY_EXAMPLES = ['cargo test -p a', 'pnpm turbo run test', 'pnpm -r test', 'pnpm --filter x test', 'npm test', 'pnpm nx test x', 'node --test hooks/*.test.mjs'];
const JS_EXAMPLES = ['pnpm vitest run', 'pnpm tsc --noEmit', 'npx playwright test', 'pnpm exec turbo run test', 'pnpm run build'];

describe('cpu-guard', () => {
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
    const off = mkdtempSync(join(tmpdir(), 'cpu-guard-off-'));
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
    const config = mkdtempSync(join(tmpdir(), 'cpu-guard-rtk-'));
    mkdirSync(join(config, 'rtk'));
    writeFileSync(join(config, 'rtk', 'config.toml'), `[hooks]\n${line}\n`);
    const check = (cmd) => spawnSync('rtk', ['hook', 'check', ...cmd.split(' ')], { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: config } });
    if (check('ls').error) return t.skip('rtk not installed');
    for (const cmd of [...HEAVY_EXAMPLES, ...JS_EXAMPLES, 'cd x && pnpm vitest run', 'cd x && pnpm turbo run test']) {
      const result = check(cmd);
      assert.match(result.stdout + result.stderr, /No rewrite/, `${cmd}: add it to exclude_commands in cpu-guard.js's header`);
    }
    const mention = check('git log --grep tsc');
    assert.doesNotMatch(mention.stdout + mention.stderr, /No rewrite/, 'a mention of tsc must keep rtk compression');
  });

  it('9. WHEN the CLI gets a hook payload THEN it prints updatedInput and exits 0; garbage stdin prints nothing', { skip: process.platform === 'win32' }, () => {
    const run = (input) => spawnSync('node', [join(import.meta.dirname, 'cpu-guard.js')], { input, encoding: 'utf8' });
    const ok = run(JSON.stringify({ cwd: root, tool_input: { command: 'pnpm test' } }));
    assert.equal(ok.status, 0);
    assert.match(JSON.parse(ok.stdout).hookSpecificOutput.updatedInput.command, /cpu-lock gate/);
    const bad = run('not json');
    assert.deepEqual([bad.status, bad.stdout], [0, '']);
  });
});
