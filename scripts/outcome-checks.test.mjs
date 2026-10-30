// Run: node --test scripts/outcome-checks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const repoText = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Task 3.3 AGENTS.md: baseline before any fix round, reports lead with the delta', () => {
  const t = repoText('AGENTS.md');
  assert.match(t, /records a baseline number before any fix round/);
  assert.match(t, /Every report leads with the change from it/);
});
test('Task 3.3 SDD: open-ended fix rounds carry the baseline and stop when it does not move', () => {
  assert.match(repoText('skills/subagent-driven-development/SKILL.md'), /brief carries the baseline number and its command; a round that leaves the number unchanged or worse stops the loop/);
});
test('Task 3.3 proof.md: UI proof is a real run that performs the interaction', () => {
  const t = repoText('skills/code-review/references/proof.md');
  assert.match(t, /launch the real app with skill:run/);
  assert.match(t, /double-click/);
  assert.match(t, /A UI PR may not use `No screenshots:`/);
});
test('Task 3.3 open-pr: UI PR After screenshot comes from a real run', () => {
  assert.match(repoText('skills/open-pr/SKILL.md'), /UI PR → the After screenshot comes from a real run \(skill:run\)/);
});
test('Task 3.4 handoff: blocked section links the digest instead of re-listing', () => {
  const t = repoText('skills/handoff/SKILL.md');
  assert.match(t, /Sign-offs: ~\/\.claude\/handoffs\/<project>-SIGNOFFS\.md \(<n> open\)/);
  assert.match(t, /Never re-list carried ❓ or sign-off items/);
});
test('Task 3.4 handoff: digest rule defines the line format and the write exception', () => {
  const t = repoText('skills/handoff/SKILL.md');
  assert.match(t, /- \[ \] <id> · first seen <YYYY-MM-DD> · <what to verify> · <command or path>/);
  assert.match(t, /- \[x\] <id> · closed <YYYY-MM-DD> · <how>/);
  assert.match(t, /Only the step-1 checks, the Write and the digest update/);
});
test('Task 3.4 handoff: <project> is the same for every worktree of a repo', () => {
  const t = repoText('skills/handoff/SKILL.md');
  assert.match(t, /basename "\$\(dirname "\$\(git rev-parse --path-format=absolute --git-common-dir\)"\)"/);
  assert.doesNotMatch(t, /repo root's basename/);
  assert.match(t, /outside a git repo, the cwd's basename/);
});
test('Task 3.4 handoff: step 1 reads the digest, first write creates it', () => {
  const step1 = repoText('skills/handoff/SKILL.md').split('\n').find((l) => l.startsWith('1. Run `date'));
  assert.match(step1, /Read `~\/\.claude\/handoffs\/<project>-SIGNOFFS\.md` if it exists; the first write creates it/);
});
for (const agent of ['executor', 'deep-executor']) {
  test(`Task 6.3 ${agent}: self-check against the brief before returning`, () => {
    const t = repoText(`agents/${agent}.md`);
    assert.match(t, /Before reporting, self-check: list each ask in the brief, re-read your `git diff` against it/);
    assert.match(t, /- Self-check: \[n\]\/\[n\] asks met/);
    assert.match(t, /17 under-delivery patterns/); // the deglaze scan stays
  });
}
test('Task 6.4 AGENTS.md: three flat rounds or the stated spend stop open-ended work', () => {
  const t = repoText('AGENTS.md');
  assert.match(t, /Three rounds in a row that do not improve the number, or the stated spend, stop the work/);
  assert.match(t, /Outside an SDD fix loop \(which stops at the first unchanged round\)/);
});
test('Task 6.4 the 3.3 rules survive and SDD still stops at one unchanged round', () => {
  assert.match(repoText('AGENTS.md'), /records a baseline number before any fix round/);
  assert.match(repoText('skills/subagent-driven-development/SKILL.md'), /a round that leaves the number unchanged or worse stops the loop/);
});
