// Run: node --test hooks/pr-proof-guard.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hook = new URL('./pr-proof-guard.js', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'pr-proof-guard-'));
const PROOF = '# t\n\n## Proof\n$ node --test\nok\n';
const okBody = join(dir, 'ok.md');
const badBody = join(dir, 'bad.md');
writeFileSync(okBody, PROOF);
writeFileSync(badBody, '# t\nno proof here\n');
writeFileSync(join(dir, 'my ok.md'), PROOF);
mkdirSync(join(dir, 'sub'));
writeFileSync(join(dir, 'sub', 'only-in-sub.md'), PROOF);
after(() => rmSync(dir, { recursive: true, force: true }));

// HOME points at the temp dir so `~/ok.md` resolves there; the hook input's cwd is the temp dir unless a case overrides it.
const run = (command, { cwd = dir, spawnCwd } = {}) => spawnSync('node', [hook], {
  input: JSON.stringify({ tool_input: { command }, ...(cwd ? { cwd } : {}) }),
  env: { ...process.env, HOME: dir },
  cwd: spawnCwd,
  encoding: 'utf8',
});

const ALLOW = 0;
const BLOCK = 2;
const heredocBody = (proof) => `gh pr create --title x --body "$(cat <<'EOF'\nsummary with "quotes" and (#9) parens\n\n${proof}\n$ node --test\nEOF\n)"`;
const cases = [
  // valid bodies
  ['heredoc body with proof', "gh pr create --title x --body \"$(cat <<'EOF'\nsummary\n\n## Proof\n$ node --test\nEOF\n)\"", ALLOW],
  ['heredoc body with quotes and parens', heredocBody('## Proof'), ALLOW],
  ['inline body opening with the heading', 'gh pr create --draft --title x --body "## Proof\nblockers: ..."', ALLOW],
  ['edit body with proof', 'gh pr edit 5 --body "x\n## Proof\nok"', ALLOW],
  ['--body= form with proof', 'gh pr create --body="x\n## Proof\nok"', ALLOW],
  ['body file with proof', `gh pr create -t x --body-file ${okBody}`, ALLOW],
  ['--body-file= form', `gh pr create --body-file=${okBody}`, ALLOW],
  ['body file under ~', 'gh pr create --body-file ~/ok.md', ALLOW],
  ['quoted body file path with spaces', "gh pr create --body-file 'my ok.md'", ALLOW],
  ['relative body file against hook cwd', 'gh pr create -F ok.md', ALLOW],
  ['relative body file against process cwd', 'gh pr create -F ok.md', ALLOW, { cwd: null, spawnCwd: dir }],
  ['relative body file after leading cd', 'cd sub && gh pr create --body-file only-in-sub.md', ALLOW],
  ['--body "$(cat file)"', 'gh pr create --title x --body "$(cat ok.md)"', ALLOW],
  ['stdin body from preceding heredoc', "cat <<'EOF' | gh pr create --title x -F -\nsummary\n## Proof\nok\nEOF", ALLOW],
  ['stdin body from attached heredoc', "gh pr create --body-file - <<'EOF'\nsummary\n## Proof\nok\nEOF", ALLOW],
  ['stdin body from pipe', "printf '## Proof\\nok' | gh pr create -F -", ALLOW],
  // not a PR body at all
  ['edit that does not touch the body', 'gh pr edit 5 --add-label bug', ALLOW],
  ['edit label ending in -b', 'gh pr edit 5 --remove-label wip-b x', ALLOW],
  ['edit title containing -b', 'gh pr edit 5 --title "fix plan-b bug"', ALLOW],
  ['edit milestone ending in -b', 'gh pr edit 5 --milestone release-b 2', ALLOW],
  ['other gh pr command', 'gh pr view 5', ALLOW],
  ['unrelated command', 'git status', ALLOW],
  ['empty command', '', ALLOW],
  ['--help', 'gh pr create --help', ALLOW],
  ['-h', 'gh pr create -h', ALLOW],
  ['mention inside echo', "echo 'run gh pr create later'", ALLOW],
  ['mention inside commit message', "git commit -m 'docs: gh pr create needs proof'", ALLOW],
  ['mention inside heredoc file write', "cat > notes.md <<'EOF'\nthen gh pr create\nEOF", ALLOW],
  ['mention inside grep pattern', 'grep -rn "gh pr create" skills', ALLOW],
  ['unquoted mention not at command position', 'echo run gh pr create later', ALLOW],
  ['separator inside quotes', "echo 'first; gh pr create'", ALLOW],
  ['heredoc line starting with the command', "cat > notes.md <<'EOF'\ngh pr create --fill\nEOF", ALLOW],
  ['mention inside a comment', 'ls # && gh pr create', ALLOW],
  // missing proof
  ['body without proof', 'gh pr create --title x --body "just a summary"', BLOCK],
  ['heredoc body without proof', heredocBody('no heading'), BLOCK],
  ['--fill', 'gh pr create --fill', BLOCK],
  ['no body at all', 'gh pr create --title x', BLOCK],
  ['edit body without proof', 'gh pr edit 5 --body "new text"', BLOCK],
  ['edit with attached short body flag', 'gh pr edit 5 -bnope', BLOCK],
  ['--body= form without proof', 'gh pr create --body=nope', BLOCK],
  ['body file without proof', `gh pr create -t x -F ${badBody}`, BLOCK],
  ['missing body file', 'gh pr create -t x --body-file /nope.md', BLOCK],
  ['stdin body without proof', 'echo nope | gh pr create -F -', BLOCK],
  ['literal backslash-n is not a newline', 'gh pr create --body "summary\\n## Proof\\nok"', BLOCK],
  // proof outside the body does not count
  ['proof in the title', 'gh pr create --title "## Proof" --body "nothing"', BLOCK],
  ['proof in the title, no body', "gh pr create --title '## Proof'", BLOCK],
  ['proof in an earlier command', "echo '## Proof' && gh pr create --body nope", BLOCK],
  ['proof in a trailing comment', "gh pr create --body 'nope' # '## Proof'", BLOCK],
  // invocation shapes
  ['rtk-rewritten command', 'rtk gh pr create -b "x"', BLOCK],
  ['rtk proxy', 'rtk proxy gh pr create -b "x"', BLOCK],
  ['chained after cd', 'cd repo && gh pr create --title x --body "x"', BLOCK],
  ['path-prefixed gh', '/usr/bin/gh pr create --body nope', BLOCK],
  ['env assignment prefix', 'GH_TOKEN=x gh pr create --body nope', BLOCK],
  ['-R global flag', 'gh -R o/r pr create --body nope', BLOCK],
  ['--repo global flag', 'gh --repo o/r pr create --body nope', BLOCK],
  ['command substitution', 'url=$(gh pr create --body nope)', BLOCK],
  ['subshell', '(gh pr create --body nope)', BLOCK],
  ['new alias', 'gh pr new --body nope', BLOCK],
];

for (const [name, command, expected, opts] of cases) {
  test(`${expected === ALLOW ? 'allows' : 'blocks'}: ${name}`, () => {
    const { status, stderr } = run(command, opts);
    assert.strictEqual(status, expected, stderr);
  });
}

test('blocks an unresolvable body file path and asks for a literal one', () => {
  const { status, stderr } = run('gh pr create --body-file "$TMPDIR/b.md"');
  assert.strictEqual(status, BLOCK);
  assert.match(stderr, /literal path/);
});

test('block message points at heredoc / --body-file and the session cwd', () => {
  const { stderr } = run('gh pr create --body "x"');
  assert.match(stderr, /heredoc/);
  assert.match(stderr, /--body-file/);
  assert.match(stderr, /session cwd/);
});

test('allows unparseable input', () => {
  assert.strictEqual(spawnSync('node', [hook], { input: 'not json' }).status, ALLOW);
});
