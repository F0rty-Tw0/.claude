import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('handoff skill', () => {
  const skill = read('skills/handoff/SKILL.md');
  const template = skill.match(/```markdown\n([\s\S]*?)\n```/)[1];
  const headings = [...template.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

  test('template puts Standing grants and Stop after right after Goal', () => {
    const goal = headings.indexOf('Goal');
    assert.deepEqual(headings.slice(goal, goal + 3), ['Goal', 'Standing grants', 'Stop after']);
  });

  test('a grant survives a chain: the next handoff copies the previous one unchanged', () => {
    assert.ok(skill.includes("copy the previous handoff's Standing grants and Stop after unchanged"));
    assert.doesNotMatch(skill, /recorded in a memory file/);
  });

  test('the next session honours both without asking, and the digest never swallows them', () => {
    assert.ok(template.includes('Honour these without asking again.'));
    assert.ok(template.includes('stops there and reports'));
    assert.ok(skill.includes('never move to the sign-off digest'));
  });
});

describe('flow skill', () => {
  const skill = read('skills/flow/SKILL.md');
  const readme = read('skills/flow/README.md');
  const stacked = read('skills/flow/references/stacked.md');

  test('describes the handoff chain with grants and stop points', () => {
    const chain = skill.match(/^## Handoff chain$([\s\S]*?)^## /m)[1];
    assert.match(chain, /`## Standing grants` \/ `## Stop after`/);
    assert.match(chain, /Flow writes no handoff itself/);
    assert.match(chain, /^- \*\*Stop after:\*\* if the user named a stage or any stop point/m);
  });

  test('README agrees with SKILL.md: no file-count heuristic, mentions the handoff chain', () => {
    assert.doesNotMatch(readme, /more than 10 files/);
    assert.match(readme, /the handoff chain \(`\/handoff`, `\/clear`, continue\) carries the user's standing grants/);
  });

  test('stacked D8 pairs the Next step line with the Standing grants line and the verbatim launch words', () => {
    const d8 = stacked.match(/^- \*\*D8\*\*[^\n]*$/m)[0];
    assert.match(d8, /`next: flow --stacked --resume <plan folder>` in Next step and `commits authorized: yes \(flow --stacked launch <date>\)`, plus the user's launch words verbatim, under Standing grants/);
  });
});
