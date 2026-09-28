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
  ['stdin body from printf with \\n before the heading', "printf 'summary\\n\\n## Proof\\nok\\n' | gh pr create -F -", ALLOW],
  ['stdin body from echo pipe', "echo '## Proof' | gh pr create -F -", ALLOW],
  ['stdin body from cat file pipe', 'cat ok.md | gh pr create -F -', ALLOW],
  ['stdin body from < redirect', 'gh pr create -F - < ok.md', ALLOW],
  ['stdin body from here-string', "gh pr create -F - <<< '## Proof'", ALLOW],
  ['relative body file after leading cd ;', 'cd sub; gh pr create --body-file only-in-sub.md', ALLOW],
  ['last body flag wins (proof last)', 'gh pr create --body nope --body "## Proof\nok"', ALLOW],
  ['heredoc closed as EOF) on one line, judged by its text', "gh pr create --body \"$(cat <<'EOF'\nsum\n## Proof\nok\nEOF)\"", ALLOW],
  ['escaped quote inside double quotes', 'echo "a \\" ; gh pr create --fill"', ALLOW],
  ['writing a different file before reading the body file', 'echo x > other.md && gh pr create -F ok.md 2>/dev/null', ALLOW],
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
  ['last body flag wins (proof first)', 'gh pr create --body "## Proof\nok" --body nope', BLOCK],
  ['proof in an unrelated heredoc', "cat > x <<'A'\n## Proof\nA\ngh pr create --body \"$(cat <<'B'\nno\nB\n)\"", BLOCK],
  // stdin: only this invocation's own stdin source counts
  ['stdin proof in an earlier command', "echo '## Proof' >/dev/null; echo nope | gh pr create -F -", BLOCK],
  ['stdin proof in a later command', "echo nope | gh pr create -F - ; echo '## Proof'", BLOCK],
  ['stdin proof mid-line after the invocation', 'echo nope | gh pr create -F - && echo x## Proof', BLOCK],
  ['stdin proof mid-line in the pipe source', "echo 'x## Proof' | gh pr create -F -", BLOCK],
  ['stdin with no source', 'gh pr create -F -', BLOCK],
  ['stdin proof in the previous command, no pipe', "echo '## Proof'; gh pr create -F -", BLOCK],
  ['stdin proof before ||, not a pipe', "echo '## Proof' || gh pr create -F -", BLOCK],
  ['stdin from cat file pipe without proof', 'cat bad.md | gh pr create -F -', BLOCK],
  ['stdin from < redirect without proof', 'gh pr create --body-file - < bad.md', BLOCK],
  ['stdin from here-string without proof', 'gh pr create -F - <<< nope', BLOCK],
  // an unterminated `<<word` masks nothing
  ['misread << in quoted python', 'python3 -c "print(1<<y)\nprint(2)" && gh pr create --fill', BLOCK],
  ['unterminated heredoc', 'cat <<EOF\nx\ngh pr create --fill', BLOCK],
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
  ['if/then', 'if true; then gh pr create --fill; fi', BLOCK],
  ['loop do', 'for i in 1; do gh pr create --fill; done', BLOCK],
  ['else', 'if false; then :; else gh pr create --fill; fi', BLOCK],
  ['negation', '! gh pr create --fill', BLOCK],
  ['brace group', '{ gh pr create --fill; }', BLOCK],
  ['time', 'time gh pr create --fill', BLOCK],
  ['command builtin', 'command gh pr create --fill', BLOCK],
  ['nohup', 'nohup gh pr create --fill', BLOCK],
  ['env with assignments', 'env GH_PAGER=cat A=1 gh pr create --fill', BLOCK],
  ['timeout', 'timeout 60 gh pr create --fill', BLOCK],
  ['sudo', 'sudo gh pr create --fill', BLOCK],
  ['stacked wrappers', 'sudo env A=1 nohup timeout 5s gh pr create --fill', BLOCK],
  ['--repo between pr and verb', 'gh pr --repo o/r create --fill', BLOCK],
];

for (const [name, command, expected, opts] of cases) {
  test(`${expected === ALLOW ? 'allows' : 'blocks'}: ${name}`, () => {
    const { status, stderr } = run(command, opts);
    assert.strictEqual(status, expected, stderr);
  });
}

// The hook runs before the command, so a body file written by the same command is read stale or missing.
const sameCallWrites = [
  ['new file', "cat > new.md <<'EOF'\n# t\n## Proof\nok\nEOF\ngh pr create --body-file new.md"],
  ['older file without proof', "cat > bad.md <<'EOF'\n# t\n## Proof\nok\nEOF\ngh pr create -F bad.md"],
  ['older file with proof, new heredoc without', "cat > ok.md <<'EOF'\n# t\nno proof now\nEOF\ngh pr create --body-file ok.md"],
  ['append redirect', 'echo x >> ok.md; gh pr create -F ok.md'],
  ['tee -a', `echo x | tee -a ${okBody} && gh pr create -F ok.md`],
  ['$(cat file) body', 'echo x > ok.md && gh pr create --body "$(cat ok.md)"'],
  ['stdin from cat pipe', 'echo x > ok.md; cat ok.md | gh pr create -F -'],
];
for (const [name, command] of sameCallWrites) {
  test(`blocks a body file written in the same call: ${name}`, () => {
    const { status, stderr } = run(command);
    assert.strictEqual(status, BLOCK);
    assert.match(stderr, /write the body file in a separate Bash call — the hook reads it before your command runs/i);
  });
}

test('block message shows the heredoc delimiter alone on its line', () => {
  const { stderr } = run('gh pr create --fill');
  assert.match(stderr, /\nEOF\n\)"/);
  assert.doesNotMatch(stderr, /EOF\)/);
  assert.doesNotMatch(stderr, /one-shot flag/);
});

test('block message after a push warns the commit-guard flag is spent', () => {
  const { stderr } = run(['git', 'push -u origin x && gh pr create --fill'].join(' '));
  assert.match(stderr, /commit-guard's one-shot flag was already spent; re-touch it only if the user's request still covers the push/);
});

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
