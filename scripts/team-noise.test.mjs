// Run: node --test scripts/team-noise.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const claude = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');

test('Task 6.2 CLAUDE.md: agents are spawned without name', () => {
  const bullet = claude.split('\n').find((l) => l.includes('**Agent lifecycle.**'));
  assert.match(bullet, /Spawn agents without `name`/);
  assert.match(bullet, /idle_notification/);
  assert.match(bullet, /SendMessage` reaches an unnamed agent by id/);
  assert.match(bullet, /Name one only when the user asks for a team/);
});
