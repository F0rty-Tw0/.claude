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
  assert.match(repoText('skills/subagent-driven-development/SKILL.md'), /brief carries the baseline number and its command; a round that leaves the number unchanged stops the loop/);
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
