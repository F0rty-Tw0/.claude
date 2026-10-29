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
