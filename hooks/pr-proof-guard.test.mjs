// Run: node --test hooks/pr-proof-guard.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hook = new URL('./pr-proof-guard.js', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'pr-proof-guard-'));
const PROOF = '# t\n\n## Proof\nBefore: a\nAfter: b\n$ node --test\nok\n';
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
  ['heredoc body with proof', "gh pr create --title x --body \"$(cat <<'EOF'\nsummary\n\n## Proof\nBefore: a\nAfter: b\n$ node --test\nEOF\n)\"", ALLOW],
  ['heredoc body with quotes and parens', heredocBody('## Proof\nBefore: a\nAfter: b'), ALLOW],
  ['inline body opening with the heading', 'gh pr create --draft --title x --body "## Proof\nBefore: a\nAfter: b\nblockers: ..."', ALLOW],
  ['edit body with proof', 'gh pr edit 5 --body "x\n## Proof\nBefore: a\nAfter: b\nok"', ALLOW],
  ['--body= form with proof', 'gh pr create --body="x\n## Proof\nBefore: a\nAfter: b\nok"', ALLOW],
  ['body file with proof', `gh pr create -t x --body-file ${okBody}`, ALLOW],
  ['--body-file= form', `gh pr create --body-file=${okBody}`, ALLOW],
  ['body file under ~', 'gh pr create --body-file ~/ok.md', ALLOW],
  ['quoted body file path with spaces', "gh pr create --body-file 'my ok.md'", ALLOW],
  ['relative body file against hook cwd', 'gh pr create -F ok.md', ALLOW],
  ['relative body file against process cwd', 'gh pr create -F ok.md', ALLOW, { cwd: null, spawnCwd: dir }],
  ['relative body file after leading cd', 'cd sub && gh pr create --body-file only-in-sub.md', ALLOW],
  ['--body "$(cat file)"', 'gh pr create --title x --body "$(cat ok.md)"', ALLOW],
  ['stdin body from preceding heredoc', "cat <<'EOF' | gh pr create --title x -F -\nsummary\n## Proof\nBefore: a\nAfter: b\nok\nEOF", ALLOW],
  ['stdin body from attached heredoc', "gh pr create --body-file - <<'EOF'\nsummary\n## Proof\nBefore: a\nAfter: b\nok\nEOF", ALLOW],
  ['stdin body from pipe', "printf '## Proof\\nBefore: a\\nAfter: b\\nok' | gh pr create -F -", ALLOW],
  ['stdin body from printf with \\n before the heading', "printf 'summary\\n\\n## Proof\\nBefore: a\\nAfter: b\\nok\\n' | gh pr create -F -", ALLOW],
  ['stdin body from echo pipe', "echo '## Proof\nBefore: a\nAfter: b' | gh pr create -F -", ALLOW],
  ['stdin body from cat file pipe', 'cat ok.md | gh pr create -F -', ALLOW],
  ['stdin body from < redirect', 'gh pr create -F - < ok.md', ALLOW],
  ['stdin body from here-string', "gh pr create -F - <<< '## Proof\nBefore: a\nAfter: b'", ALLOW],
  ['relative body file after leading cd ;', 'cd sub; gh pr create --body-file only-in-sub.md', ALLOW],
  ['last body flag wins (proof last)', 'gh pr create --body nope --body "## Proof\nBefore: a\nAfter: b\nok"', ALLOW],
  ['heredoc closed as EOF) on one line, judged by its text', "gh pr create --body \"$(cat <<'EOF'\nsum\n## Proof\nBefore: a\nAfter: b\nok\nEOF)\"", ALLOW],
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
  ['literal backslash-n is not a newline', 'gh pr create --body "summary\\n## Proof\\nBefore: a\\nAfter: b\\nok"', BLOCK],
  // proof outside the body does not count
  ['proof in the title', 'gh pr create --title "## Proof\nBefore: a\nAfter: b" --body "nothing"', BLOCK],
  ['proof in the title, no body', "gh pr create --title '## Proof\nBefore: a\nAfter: b'", BLOCK],
  ['proof in an earlier command', "echo '## Proof\nBefore: a\nAfter: b' && gh pr create --body nope", BLOCK],
  ['proof in a trailing comment', "gh pr create --body 'nope' # '## Proof'", BLOCK],
  ['last body flag wins (proof first)', 'gh pr create --body "## Proof\nBefore: a\nAfter: b\nok" --body nope', BLOCK],
  ['proof in an unrelated heredoc', "cat > x <<'A'\n## Proof\nBefore: a\nAfter: b\nA\ngh pr create --body \"$(cat <<'B'\nno\nB\n)\"", BLOCK],
  // stdin: only this invocation's own stdin source counts
  ['stdin proof in an earlier command', "echo '## Proof\nBefore: a\nAfter: b' >/dev/null; echo nope | gh pr create -F -", BLOCK],
  ['stdin proof in a later command', "echo nope | gh pr create -F - ; echo '## Proof\nBefore: a\nAfter: b'", BLOCK],
  ['stdin proof mid-line after the invocation', 'echo nope | gh pr create -F - && echo x## Proof', BLOCK],
  ['stdin proof mid-line in the pipe source', "echo 'x## Proof' | gh pr create -F -", BLOCK],
  ['stdin with no source', 'gh pr create -F -', BLOCK],
  ['stdin proof in the previous command, no pipe', "echo '## Proof\nBefore: a\nAfter: b'; gh pr create -F -", BLOCK],
  ['stdin proof before ||, not a pipe', "echo '## Proof\nBefore: a\nAfter: b' || gh pr create -F -", BLOCK],
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

// The Proof section needs a before/after pair of the change running: Before:/After: lines or a `| Before | After |` table.
writeFileSync(join(dir, 'nopair.md'), '# t\n\n## Proof\n- Tests: `node --test` → 9 pass\n');
// The proof template's text pair must pass on its own: screenshot table rows stripped so they can't carry it.
const template = readFileSync(new URL('../skills/code-review/templates/pr-proof.md', import.meta.url), 'utf8');
writeFileSync(join(dir, 'template.md'), template.split('\n').filter((line) => !line.startsWith('|')).join('\n'));
const pairCases = [
  ['bullet lines', 'gh pr create --body "x\n## Proof\n- Before: `cli x` → error\n- After: `cli x` → ok"', ALLOW],
  ['bold labels', 'gh pr create --body "x\n## Proof\n**Before:** shot\n**After:** shot"', ALLOW],
  ['screenshot table', 'gh pr create --body "x\n## Proof\n| | Before | After |\n|---|---|---|\n| home | ![a](a.png) | ![b](b.png) |"', ALLOW],
  ['gap written on the Before line', 'gh pr create --body "x\n## Proof\n- Before: not captured — new repo\n- After: ok\n- Not verified: before"', ALLOW],
  ['pair in the details block under Proof', 'gh pr create --body "x\n## Proof\n- Tests: ok\n<details>\n\nBefore: a\nAfter: b\n</details>"', ALLOW],
  ['proof template text pair, no table', 'gh pr create -F template.md', ALLOW],
  ['parenthetical before the colon', 'gh pr create --body "x\n## Proof\nBefore (base abc123):\nold\nAfter (head def456):\nnew"', ALLOW],
  ['bold word, colon outside', 'gh pr create --body "x\n## Proof\n**Before**: a\n**After**: b"', ALLOW],
  ['lowercase labels', 'gh pr create --body "x\n## Proof\n- before: a\n- after: b"', ALLOW],
  ['pair after a fence that prints a ## line', 'gh pr create -F - <<\'EOF\'\nx\n## Proof\n```\n## Heading in output\n```\n- Before: a\n- After: b\nEOF', ALLOW],
  ['pair after a ~~~ fence that prints a ## line', 'gh pr create -F - <<\'EOF\'\nx\n## Proof\n~~~\n## Heading in output\n~~~\n- Before: a\n- After: b\nEOF', ALLOW],
  ['pair under ### subsections', 'gh pr create --body "x\n## Proof\n### Tests\nok\n### Before / After\nBefore: a\nAfter: b"', ALLOW],
  ['heading without a pair', 'gh pr create --body "x\n## Proof\n- Tests: `node --test` → 9 pass"', BLOCK],
  ['only an After line', 'gh pr create --body "x\n## Proof\n- After: ok"', BLOCK],
  ['prose mentioning before and after', 'gh pr create --body "x\n## Proof\nafter the fix it works, before it did not"', BLOCK],
  ['line-start prose without a colon', 'gh pr create --body "x\n## Proof\nAfter the fix it works\nBefore the fix it crashed"', BLOCK],
  ['prose with a colon later in the line', 'gh pr create --body "x\n## Proof\n- After the fix: works\n- Before we merged: broken"', BLOCK],
  ['labels mid-line', 'gh pr create --body "x\n## Proof\n- Tests: 3 fail before: 9 pass after: ok"', BLOCK],
  ['parenthetical not followed by a colon', 'gh pr create --body "x\n## Proof\nBefore (x) it was\nAfter (y) it is"', BLOCK],
  ['pair above the Proof heading', 'gh pr create --body "Before: a\nAfter: b\n## Proof\nok"', BLOCK],
  ['pair in a later section', 'gh pr create --body "x\n## Proof\nok\n## Notes\nBefore: a\nAfter: b"', BLOCK],
  ['body file without a pair', 'gh pr create -F nopair.md', BLOCK],
  ['echo pipe without a pair', "echo '## Proof' | gh pr create -F -", BLOCK],
  ['here-string without a pair', "gh pr create -F - <<< '## Proof'", BLOCK],
  ['printf without a pair', "printf '## Proof\\nok' | gh pr create -F -", BLOCK],
];
for (const [name, command, expected] of pairCases) {
  test(`pair: ${expected === ALLOW ? 'allows' : 'blocks'}: ${name}`, () => {
    const { status, stderr } = run(command);
    assert.strictEqual(status, expected, stderr);
    if (expected === BLOCK) assert.match(stderr, /no before\/after pair/);
  });
}

test('pair block message says tests alone do not count and how to record a gap', () => {
  const { stderr } = run('gh pr create --body "x\n## Proof\nok"');
  assert.match(stderr, /Test-runner output alone does not count/);
  assert.match(stderr, /Before: not captured/);
});

test('a body with no Proof heading gets the heading message, not the pair one', () => {
  const { stderr } = run('gh pr create --body "x"');
  assert.match(stderr, /has no `## Proof` section/);
  assert.doesNotMatch(stderr, /before\/after pair/);
});

// The hook runs before the command, so a body file written by the same command is read stale or missing.
const sameCallWrites = [
  ['new file', "cat > new.md <<'EOF'\n# t\n## Proof\nBefore: a\nAfter: b\nok\nEOF\ngh pr create --body-file new.md"],
  ['older file without proof', "cat > bad.md <<'EOF'\n# t\n## Proof\nBefore: a\nAfter: b\nok\nEOF\ngh pr create -F bad.md"],
  ['older file with proof, new heredoc without', "cat > ok.md <<'EOF'\n# t\nno proof now\nEOF\ngh pr create --body-file ok.md"],
  ['append redirect', 'echo x >> ok.md; gh pr create -F ok.md'],
  ['tee -a', `echo x | tee -a ${okBody} && gh pr create -F ok.md`],
  ['$(cat file) body', 'echo x > ok.md && gh pr create --body "$(cat ok.md)"'],
  ['stdin from cat pipe', 'echo x > ok.md; cat ok.md | gh pr create -F -'],
  ['cp over the body file', `cp ${badBody} ok.md && gh pr create -F ok.md`],
  ['cp to a new body file', 'cp bad.md fresh.md && gh pr create -F fresh.md'],
  ['mv onto the body file', 'mv bad.md ok.md; gh pr create --body-file ok.md'],
  ['sed -i on the body file', "sed -i 's/Proof/x/' ok.md && gh pr create -F ok.md"],
  ['clobber redirect', 'echo x >| ok.md && gh pr create -F ok.md'],
];
for (const [name, command] of sameCallWrites) {
  test(`blocks a body file written in the same call: ${name}`, () => {
    const { status, stderr } = run(command);
    assert.strictEqual(status, BLOCK);
    assert.match(stderr, /write the body file in a separate Bash call — the hook reads it before your command runs/i);
  });
}

// Round-two targeted review: each of these kills a mutation that the table above let survive.
const mutationKillers = [
  ['last stdin redirect wins', `gh pr create -F - < ${okBody} < ${badBody}`, BLOCK],
  ['only the invocation\'s own heredoc counts', "cat <<'A' >/dev/null\n## Proof\nBefore: a\nAfter: b\nA\ngh pr create -F - <<'B'\nnope\nB", BLOCK],
  ['unterminated stdin heredoc is not a body', 'gh pr create -F - <<EOF\n## Proof\nBefore: a\nAfter: b', BLOCK],
  ['a write AFTER the invocation is fine', 'gh pr create -F ok.md && echo done > ok.md', ALLOW],
  ['last short -b wins', 'gh pr create -b "## Proof\nBefore: a\nAfter: b" -b no', BLOCK],
  ['reading the body via a cat pipe is not a write', 'cat ok.md | gh pr create -F -', ALLOW],
];
for (const [name, command, expected] of mutationKillers) {
  test(`${expected === ALLOW ? 'allows' : 'blocks'}: ${name}`, () => {
    const { status, stderr } = run(command);
    assert.strictEqual(status, expected, stderr);
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
