// Run: node --test hooks/deglaze-verdict.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

test('SKILL.md defines the machine-readable verdict line', () => {
  const skill = read('skills/deglaze/SKILL.md');
  assert.match(skill, /`DEGLAZE: CLEAN`/);
  assert.match(skill, /`DEGLAZE: GAPS <n>`/);
  assert.match(skill, /chat reply/);
});

test('README documents the verdict line', () => {
  assert.match(read('skills/deglaze/README.md'), /DEGLAZE: GAPS/);
});

test('AGENTS.md closing status asks for the DEGLAZE line', () => {
  assert.match(read('AGENTS.md'), /`DEGLAZE:` (verdict )?line/);
});
