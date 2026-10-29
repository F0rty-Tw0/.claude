// Run: node --test scripts/prompt-contracts.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const VERDICT_LINE = 'VERDICT: APPROVE | CHANGES | BLOCK';

describe('2.1 reviewer VERDICT first line', () => {
  for (const name of ['code-reviewer', 'quality-reviewer', 'security-reviewer', 'performance-reviewer']) {
    it(`agents/${name}.md demands the VERDICT line first`, () => {
      assert.ok(read(`agents/${name}.md`).includes(VERDICT_LINE));
      assert.match(read(`agents/${name}.md`), /Repro:/);
    });
  }
  it('code-review reviewer prompt demands it before the 7 sections', () => {
    assert.ok(read('skills/code-review/references/reviewer-prompt.md').includes(VERDICT_LINE));
    assert.match(read('skills/code-review/references/reviewer-prompt.md'), /Repro:.*BLOCK-KIND: proof|BLOCK-KIND: proof.*Repro:/s);
  });
  it('SDD spec reviewer prompt demands it', () => {
    assert.ok(read('skills/subagent-driven-development/spec-reviewer-prompt.md').includes(VERDICT_LINE));
  });
  it('critic keeps its own vocabulary', () => {
    const critic = read('agents/critic.md');
    assert.ok(critic.includes('OKAY-WITH-EDITS'));
    assert.ok(!critic.includes('VERDICT: APPROVE'));
  });
});
