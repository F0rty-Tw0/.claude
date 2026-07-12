#!/usr/bin/env node
// Portability lint for the multi-machine ~/.claude repo (Linux/Mac/Windows).
// Flags machine-specific absolute paths in shared config. Run standalone or as a git pre-commit hook.
// Usage: node check-portability.js [file ...]   (no args: lint all tracked files in scanned dirs)
// Install as hook (per machine): printf '#!/bin/sh\nexec node "$HOME/.claude/scripts/check-portability.js" $(git diff --cached --name-only)\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(require('os').homedir(), '.claude');
const SCAN_DIRS = ['settings.json', 'settings.local.json', 'CLAUDE.md', 'AGENTS.md', 'skills', 'agents', 'copilot', '.omp', 'hooks', 'scripts'];
const PATTERNS = [
  [/\/home\/[a-z0-9_-]+\//i, 'hardcoded Linux home path'],
  [/\/Users\/[a-z0-9_-]+\//i, 'hardcoded macOS home path'],
  [/[A-Z]:\\+Users\\+[a-z0-9_-]+/i, 'hardcoded Windows home path'],
  [/\.nvm\/versions\/node\/v\d+\.\d+\.\d+/, 'pinned nvm node version'],
];
const ALLOW = /<user>|<absolute path|e\.g\.|example/i; // placeholder/example lines are fine

let files = process.argv.slice(2).filter((f) => f.trim());
if (!files.length) {
  const out = execSync('git ls-files -- ' + SCAN_DIRS.map((d) => `"${d}"`).join(' '), { cwd: REPO }).toString();
  files = out.split('\n').filter(Boolean);
}
let hits = 0;
for (const rel of files) {
  const abs = path.isAbsolute(rel) ? rel : path.join(REPO, rel);
  if (!SCAN_DIRS.some((d) => rel.replaceAll('\\', '/').startsWith(d))) continue;
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (ALLOW.test(line)) return;
    for (const [re, why] of PATTERNS) {
      if (re.test(line)) { console.log(`${rel}:${i + 1}  ${why}: ${line.trim().slice(0, 100)}`); hits++; }
    }
  });
}
if (hits) { console.error(`\n${hits} portability issue(s) — this repo syncs across Linux/Mac/Windows. Use $HOME / runtime resolution instead.`); process.exit(1); }
console.log('portability: clean');
