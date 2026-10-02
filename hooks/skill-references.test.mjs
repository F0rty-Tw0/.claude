// Run: node --test hooks/skill-references.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = fileURLToPath(new URL('.', import.meta.url));
const skillsDir = fileURLToPath(new URL('../skills/', import.meta.url));
// Skill names are kebab-case, so a hyphen separates them from prose like "the skill".
const SKILL_MENTION = /\b([a-z]+(?:-[a-z]+)+) skill\b/g;

const mentions = readdirSync(hooksDir)
  .filter((file) => file.endsWith('.js'))
  .flatMap((file) => [...readFileSync(join(hooksDir, file), 'utf8').matchAll(SKILL_MENTION)]
    .map(([, name]) => ({ file, name })));

test('the scan finds the skills the guard messages point to', () => {
  const names = mentions.map(({ name }) => name);
  assert.ok(names.includes('open-pr'));
  assert.ok(names.includes('meaningful-commits'));
});

test('every skill a hook message names exists', () => {
  const missing = mentions.filter(({ name }) => !existsSync(join(skillsDir, name, 'SKILL.md')));
  assert.deepStrictEqual(missing, []);
});
