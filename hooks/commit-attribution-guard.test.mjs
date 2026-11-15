// Run: node --test hooks/commit-attribution-guard.test.mjs
import { after, describe, it, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./commit-attribution-guard.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'commit-attribution-guard-'));
writeFileSync(join(dir, 'trailer.md'), 'fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n');
writeFileSync(join(dir, 'clean.md'), 'fix\n');
mkdirSync(join(dir, 'sub'));
writeFileSync(join(dir, 'sub', 's.md'), 'fix\n\nClaude-Session: https://claude.ai/code/session_01X\n');
after(() => rmSync(dir, { recursive: true, force: true }));

const run = (command) => spawnSync('node', [hook], {
  input: JSON.stringify({ tool_input: { command }, cwd: dir }),
  encoding: 'utf8',
});

const ALLOW = 0;
const BLOCK = 2;
const cases = [
  ['-m with a co-author trailer', 'git commit -m "fix\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"', BLOCK],
  ['trailer in its own -m', 'git commit -m "fix" -m "Co-Authored-By: Claude <noreply@anthropic.com>"', BLOCK],
  ['heredoc session trailer', "git commit -F - <<'EOF'\nfix\n\nClaude-Session: https://claude.ai/code/session_01X\nEOF", BLOCK],
  ['-F file with a trailer', 'git commit -F trailer.md', BLOCK],
  ['--file= with a trailer', 'git commit --file=trailer.md', BLOCK],
  ['quoted -F path', 'git commit -F "trailer.md"', BLOCK],
  ['co-author by email only', 'git commit -m "a\n\nCo-Authored-By: Bot <noreply@anthropic.com>"', BLOCK],
  ['chained after cd', 'cd x && git commit -m "a\n\nCo-Authored-By: Claude <noreply@anthropic.com>"', BLOCK],
  ['git -C and --amend', 'git -C d commit --amend -m "a\n\nClaude-Session: x"', BLOCK],
  ['env prefix', 'GIT_EDITOR=true git commit -m "a\n\nco-authored-by: claude <noreply@anthropic.com>"', BLOCK],
  ['clean -m', 'git commit -m "fix: clean"', ALLOW],
  ['clean -F file', 'git commit -F clean.md', ALLOW],
  ['git commit only inside quotes', `echo "git commit -m 'Co-Authored-By: Claude'"`, ALLOW],
  ['quoted text that looks chained', `echo "a; git commit -m 'Co-Authored-By: Claude'"`, ALLOW],
  ['heredoc body that looks like a commit', "cat <<'EOF'\ngit commit -m x\nCo-Authored-By: Claude\nEOF", ALLOW],
  ['git log grep for the trailer', 'git log --grep "Co-Authored-By: Claude"', ALLOW],
  ['human co-author', 'git commit -m "a\n\nCo-Authored-By: Ann <ann@x.io>"', ALLOW],
  ['unreadable -F file', 'git commit -F missing.md', ALLOW],
  // -F resolves where git runs: after a leading cd, and under -C
  ['-F after cd', 'cd sub && git commit -F s.md', BLOCK],
  ['-F under git -C', 'git -C sub commit -F s.md', BLOCK],
  ['-F under cd then -C', 'cd sub && git -C .. commit -F trailer.md', BLOCK],
  // command prefixes
  ['env prefix command', 'env GIT_EDITOR=true git commit -m "a\n\nClaude-Session: x"', BLOCK],
  ['sudo prefix', 'sudo git commit -m "a\n\nClaude-Session: x"', BLOCK],
  ['inside if/then', 'if true; then git commit -m "a\n\nClaude-Session: x"; fi', BLOCK],
  ['inside a brace group', '{ git commit -m "a\n\nClaude-Session: x"; }', BLOCK],
  // messages not written as plain lines
  ['ANSI-C $\'…\\n\' message', "git commit -m $'fix\\n\\nCo-Authored-By: Claude <noreply@anthropic.com>'", BLOCK],
  ['--trailer= form', 'git commit -m fix --trailer=Claude-Session:x', BLOCK],
  ['variable set in the same command', `MSG='Co-Authored-By: Claude <noreply@anthropic.com>'; git commit -m "$MSG"`, BLOCK],
  // two heredocs on one line: both bodies are masked
  ['commit text inside the second heredoc', "cat <<A && cat <<B\nx\nA\ngit commit -m 'Claude-Session: x'\nB", ALLOW],
  ['real commit after two heredocs', "cat <<A && cat <<B\nx\nA\ny\nB\ngit commit -m 'a\n\nClaude-Session: x'", BLOCK],
  ['printf piped into -F -', "printf 'a\\n\\nClaude-Session: x' | git commit -F -", BLOCK],
  ['-F after cd with no spaces', 'cd sub&&git commit -F s.md', BLOCK],
  ['--trailer as a separate word', 'git commit -m fix --trailer Claude-Session:x', BLOCK],
  ['--trailer with key=value', 'git commit -m fix --trailer Claude-Session=x', BLOCK],
  ['echo -e piped into -F -', 'echo -e "a\\n\\nClaude-Session: x" | git commit -F -', BLOCK],
  ['printf -- inside $(…)', 'git commit -m "$(printf -- "a\\n\\nClaude-Session: x")"', BLOCK],
  ['-F after cd with a redirect', 'cd sub>/dev/null&&git commit -F s.md', BLOCK],
  // messages that only mention a trailer
  ['message naming the --trailer= form', 'git commit -m "fix: match --trailer=Claude-Session: lines"', ALLOW],
  ['literal \\n in a double-quoted message', 'git commit -m "docs: \\nClaude-Session: is blocked"', ALLOW],
];

for (const [name, command, expected] of cases) {
  test(`${expected === ALLOW ? 'allows' : 'blocks'}: ${name}`, () => {
    const { status, stderr } = run(command);
    assert.strictEqual(status, expected, stderr);
  });
}

test('block message names the line and how to fix it', () => {
  const { stderr } = run('git commit -m "a\n\nClaude-Session: x"');
  assert.match(stderr, /^commit-attribution-guard:/);
  assert.match(stderr, /Claude-Session: x/);
  assert.match(stderr, /attribution/);
});

test('a large heredoc full of `<<` stays fast', () => {
  const body = 'std::cout << x << "\\n";\n'.repeat(12000); // ~300 KB
  const started = Date.now();
  const { status } = run(`cat > a.cpp <<'EOF'\n${body}EOF\ngit commit -m "a\n\nClaude-Session: x"`);
  assert.strictEqual(status, BLOCK);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

test('allows unparseable input', () => {
  assert.strictEqual(spawnSync('node', [hook], { input: 'not json' }).status, ALLOW);
});

const { toNativePath } = createRequire(import.meta.url)('./commit-attribution-guard.js');
const WIN_TMP = 'C:\\Users\\me\\AppData\\Local\\Temp';
const GIT_BASH_PATHS = ['/c/Users/me/msg.md', '/mnt/c/Users/me/msg.md', '/tmp/msg.md', '/tmp', '/home/me/msg.md', 'sub/msg.md'];

describe('FEATURE: toNativePath', () => {
  describe('GIVEN win32 and a Git Bash path resolved from C:\\proj', () => {
    const cases = [
      ['/c/Users/me/msg.md', 'C:\\Users\\me\\msg.md'],
      ['/C/Users/me/msg.md', 'C:\\Users\\me\\msg.md'],
      ['/mnt/c/Users/me/msg.md', 'C:\\Users\\me\\msg.md'],
      ['/d', 'D:\\'],
      ['/mnt/d/', 'D:\\'],
      ['/tmp/msg.md', `${WIN_TMP}\\msg.md`],
      ['/tmp/a/msg.md', `${WIN_TMP}\\a\\msg.md`],
      ['/tmp', WIN_TMP],
    ];
    for (const [shellPath, expected] of cases) {
      it(`WHEN the path is ${shellPath} THEN it resolves to ${expected}`, () => {
        assert.strictEqual(win32.resolve('C:\\proj', toNativePath(shellPath, 'win32', WIN_TMP)), expected);
      });
    }
  });

  describe('GIVEN win32 and a path that is neither a drive nor /tmp', () => {
    for (const shellPath of ['msg.md', 'sub/msg.md', '../msg.md', 'C:\\Users\\me\\msg.md', 'C:/Users/me/msg.md', '/home/me/msg.md', '/tmpfiles/msg.md', '/mnt/data/msg.md', '/usr/bin', '-']) {
      it(`WHEN the path is ${shellPath} THEN it comes back unchanged`, () => {
        assert.strictEqual(toNativePath(shellPath, 'win32', WIN_TMP), shellPath);
      });
    }
  });

  for (const platform of ['linux', 'darwin']) {
    describe(`GIVEN ${platform}`, () => {
      for (const shellPath of GIT_BASH_PATHS) {
        it(`WHEN the path is ${shellPath} THEN it comes back unchanged`, () => {
          assert.strictEqual(toNativePath(shellPath, platform, WIN_TMP), shellPath);
        });
      }
    });
  }
});

// The child sees process.platform as win32 while its path and os modules stay the host's, and its temp dir is `dir`:
// only the Git Bash mapping differs from a plain run, so each -F and cd call site is checked on every OS.
describe('FEATURE: commit-attribution-guard under Git Bash', () => {
  const preload = join(dir, 'as-win32.cjs');
  writeFileSync(preload, "Object.defineProperty(process, 'platform', { value: 'win32' });\n");
  const runAsWin32 = (command) => spawnSync(process.execPath, ['--require', preload, hook], {
    input: JSON.stringify({ tool_input: { command }, cwd: join(dir, 'sub') }),
    env: { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir },
    encoding: 'utf8',
  });

  describe('GIVEN a message file with a trailer in the temp dir', () => {
    it('WHEN -F names it as /tmp/trailer.md THEN the commit is blocked', () => {
      assert.strictEqual(runAsWin32('git commit -F /tmp/trailer.md').status, BLOCK);
    });

    it('WHEN -F is relative after cd /tmp/sub THEN the commit is blocked', () => {
      assert.strictEqual(runAsWin32('cd /tmp/sub && git commit -F s.md').status, BLOCK);
    });

    it('WHEN -F is relative under git -C /tmp THEN the commit is blocked', () => {
      assert.strictEqual(runAsWin32('git -C /tmp commit -F trailer.md').status, BLOCK);
    });
  });

  describe('GIVEN a clean message file in the temp dir', () => {
    it('WHEN -F names it as /tmp/clean.md THEN the commit is allowed', () => {
      assert.strictEqual(runAsWin32('git commit -F /tmp/clean.md').status, ALLOW);
    });
  });
});
