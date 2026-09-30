#!/usr/bin/env node
// Reference lint: every skill/agent a prompt points at must exist, so deleting or renaming one can't leave dead links.
// Checks `skill:X`, `Skill("X")`, `subagent_type="X"` and `skills/X/` in live skills, agents, AGENTS.md, CLAUDE.md.
// Usage: node check-skill-refs.js   (exit 1 on any unresolved reference)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(require('os').homedir(), '.claude');
const SCAN = ['skills', 'agents', 'AGENTS.md', 'CLAUDE.md', 'scripts/skill-eval-spec.md'];
// Test data and vendored/synced content quote names that are not live references.
const SKIP = /\/evals\/|\/examples\/|^skills\/synced\//;
// Built into Claude Code, not files in this repo.
const BUILTIN_SKILLS = new Set(['claude-api', 'simplify', 'loop', 'schedule', 'init', 'update-config', 'run']);
const BUILTIN_AGENTS = new Set(['Explore', 'Plan', 'general-purpose', 'claude', 'claude-code-guide', 'statusline-setup']);

const skills = new Set(fs.readdirSync(path.join(REPO, 'skills')).filter((d) => fs.existsSync(path.join(REPO, 'skills', d, 'SKILL.md'))));
const agents = new Set(fs.readdirSync(path.join(REPO, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)));
const isSkill = (name) => skills.has(name) || BUILTIN_SKILLS.has(name);

const RULES = [
  [/skill:(?!anthropic-skills:)([a-z][a-z0-9-]+)/g, isSkill, 'skill'],
  [/Skill\(\s*["']([a-z][a-z0-9:-]+)["']/g, (n) => n.includes(':') || isSkill(n), 'skill'],
  [/subagent_type\s*=\s*["']([A-Za-z-]+)["']/g, (n) => agents.has(n) || BUILTIN_AGENTS.has(n), 'agent'],
  [/(?<![\w./-])skills\/([a-z][a-z0-9-]+)\//g, (n) => skills.has(n) || n === 'synced', 'skill dir'],
];

const files = execSync('git ls-files -- ' + SCAN.map((d) => `"${d}"`).join(' '), { cwd: REPO })
  .toString()
  .split('\n')
  .filter((f) => f.endsWith('.md') && !SKIP.test(f));

let hits = 0;
for (const rel of files) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) continue;
  fs.readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, exists, kind] of RULES) {
      for (const m of line.matchAll(re)) {
        if (exists(m[1])) continue;
        hits++;
        console.log(`${rel}:${i + 1}: unresolved ${kind} "${m[1]}"`);
      }
    }
  });
}
console.log(hits ? `skill-refs: ${hits} unresolved` : 'skill-refs: clean');
process.exit(hits ? 1 : 0);
