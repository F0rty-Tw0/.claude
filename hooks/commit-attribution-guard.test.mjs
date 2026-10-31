// Run: node --test hooks/commit-attribution-guard.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
