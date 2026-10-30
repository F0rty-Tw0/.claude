// Run: node --test hooks/roster.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ARCHIVED_AGENTS = ['build-fixer', 'scientist', 'verifier'];
const ARCHIVED_SKILLS = ['using-agentic-mcp', 'rdx-audit'];
const BUILTIN = new Set(['Explore']);
// Live prose = files an agent loads; evals, examples and vendored skills quote names on purpose.
const liveFiles = (dir) => readdirSync(join(root, dir), { recursive: true }).map(String)
  .filter((f) => f.endsWith('.md') && !/(^|[\\/])(evals|examples|synced)[\\/]/.test(f)).map((f) => join(dir, f));
const hits = (files, names) => files.flatMap((f) => {
  const text = read(f);
  return names.filter((n) => new RegExp(`(?<![\\w-])${n}(?![\\w-])`).test(text)).map((n) => `${f}: ${n}`);
});
const tieBreaks = () => read('CLAUDE.md').split('\n').find((l) => l.includes('**Tie-breaks:**'));

test('archived agents live under archive/agents', () => {
  for (const n of ARCHIVED_AGENTS) {
    assert.ok(!existsSync(join(root, 'agents', `${n}.md`)), `${n} still in agents/`);
    assert.ok(existsSync(join(root, 'archive', 'agents', `${n}.md`)), `${n} missing from archive/agents/`);
  }
});

test('archived skills live under archive/skills', () => {
  for (const n of ARCHIVED_SKILLS) {
    assert.ok(!existsSync(join(root, 'skills', n, 'SKILL.md')), `${n} still in skills/`);
    assert.ok(existsSync(join(root, 'archive', 'skills', n, 'SKILL.md')), `${n} missing from archive/skills/`);
  }
});

test('no live prose names an archived entry', () => {
  const agentFiles = ['CLAUDE.md', 'AGENTS.md', ...liveFiles('agents')]; // 'verifier' is also an ordinary word in skills
  const skillFiles = [...agentFiles, 'README.md', ...liveFiles('skills')];
  assert.deepStrictEqual([...hits(agentFiles, ARCHIVED_AGENTS), ...hits(skillFiles, ARCHIVED_SKILLS)], []);
});

test('recipes name only live agents, and test-engineer is a tie-break, not a recipe step', () => {
  const lines = read('CLAUDE.md').split('\n');
  const recipes = lines.filter((l) => /^\s+- (Feature|Bug|Review panel):/.test(l));
  assert.equal(recipes.length, 3);
  for (const l of recipes) for (const [, raw] of l.matchAll(/`([^`]+)`/g)) {
    const n = raw.replace(/^\//, '');
    assert.ok(BUILTIN.has(n) || existsSync(join(root, 'agents', `${n}.md`)) || existsSync(join(root, 'skills', n, 'SKILL.md')), `recipe names missing "${n}"`);
  }
  assert.ok(!recipes.some((l) => l.includes('test-engineer')));
  assert.match(tieBreaks(), /`test-engineer`/);
});

test('debugger loads systematic-debugging', () => {
  assert.match(read('agents/debugger.md'), /load the `systematic-debugging` skill/);
  assert.ok(existsSync(join(root, 'skills', 'systematic-debugging', 'SKILL.md')));
});

test('deep-executor needs unclear requirements or an executor BLOCKED', () => {
  assert.match(tieBreaks(), /BLOCKED/);
  const desc = read('agents/deep-executor.md').match(/^description: (.*)$/m)[1];
  assert.match(desc, /BLOCKED/);
  assert.ok(desc.split(/\s+/).length <= 40, 'description over 40 words');
});
