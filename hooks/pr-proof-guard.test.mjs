// Run: node --test hooks/pr-proof-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hook = new URL('./pr-proof-guard.js', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'pr-proof-guard-'));
const okBody = join(dir, 'ok.md');
const badBody = join(dir, 'bad.md');
writeFileSync(okBody, '# t\n\n## Proof\n$ node --test\nok\n');
writeFileSync(badBody, '# t\nno proof here\n');

const run = (command) => spawnSync('node', [hook], { input: JSON.stringify({ tool_input: { command } }) }).status;

const ALLOW = 0;
const BLOCK = 2;
const cases = [
  ['heredoc body with proof', "gh pr create --title x --body \"$(cat <<'EOF'\nsummary\n\n## Proof\n$ node --test\nEOF\n)\"", ALLOW],
  ['inline body opening with the heading', 'gh pr create --draft --title x --body "## Proof\nblockers: ..."', ALLOW],
  ['edit body with proof', 'gh pr edit 5 --body "x\n## Proof\nok"', ALLOW],
  ['body file with proof', `gh pr create -t x --body-file ${okBody}`, ALLOW],
  ['edit that does not touch the body', 'gh pr edit 5 --add-label bug', ALLOW],
  ['other gh pr command', 'gh pr view 5', ALLOW],
  ['unrelated command', 'git status', ALLOW],
  ['empty command', '', ALLOW],
  ['body without proof', 'gh pr create --title x --body "just a summary"', BLOCK],
  ['--fill', 'gh pr create --fill', BLOCK],
  ['no body at all', 'gh pr create --title x', BLOCK],
  ['edit body without proof', 'gh pr edit 5 --body "new text"', BLOCK],
  ['body file without proof', `gh pr create -t x -F ${badBody}`, BLOCK],
  ['missing body file', 'gh pr create -t x --body-file /nope.md', BLOCK],
  ['rtk-rewritten command', 'rtk gh pr create -b "x"', BLOCK],
  ['chained after cd', 'cd repo && gh pr create --title x --body "x"', BLOCK],
];

for (const [name, command, expected] of cases) {
  test(`${expected === ALLOW ? 'allows' : 'blocks'}: ${name}`, () => {
    assert.strictEqual(run(command), expected);
  });
}
