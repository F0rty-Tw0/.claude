#!/usr/bin/env node
// Sync .omp agent profiles from one source of truth.
// Source:   ~/.claude/.omp/agent-openai/agents/*.md   (edit agents HERE)
// Generated: ~/.claude/.omp/agent/agents/             (active profile, verbatim copy)
//            ~/.claude/.omp/agent-anthropic/agents/   (model lines mapped)
//            ~/.omp/agent/agents/                     (deployed runtime copy)
// Usage: node sync-omp-profiles.js [--check]   (--check: report drift, exit 1, write nothing)
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const SRC = path.join(HOME, '.claude', '.omp', 'agent-openai', 'agents');
const TARGETS = {
  verbatim: [
    path.join(HOME, '.claude', '.omp', 'agent', 'agents'),
    path.join(HOME, '.omp', 'agent', 'agents'),
  ],
  anthropic: [path.join(HOME, '.claude', '.omp', 'agent-anthropic', 'agents')],
};
const MODEL_MAP = {
  'openai-codex/sol': 'anthropic/claude-opus-4-8',
  'openai-codex/terra': 'anthropic/claude-sonnet-4-6',
  'openai-codex/luna': 'anthropic/claude-haiku-4-5',
};

const check = process.argv.includes('--check');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.md'));
if (!files.length) { console.error(`no agent files in ${SRC}`); process.exit(2); }

const toAnthropic = (s) =>
  Object.entries(MODEL_MAP).reduce((acc, [k, v]) => acc.replaceAll(`model: ${k}`, `model: ${v}`), s);

let drift = 0, written = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const variants = [
    ...TARGETS.verbatim.map((dir) => [dir, src]),
    ...TARGETS.anthropic.map((dir) => [dir, toAnthropic(src)]),
  ];
  for (const [dir, content] of variants) {
    const dst = path.join(dir, f);
    const current = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : null;
    if (current === content) continue;
    if (check) { console.log(`DRIFT: ${dst}`); drift++; continue; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dst, content);
    written++;
  }
}
// warn about files present in targets but not in source (never deleted automatically)
for (const dir of [...TARGETS.verbatim, ...TARGETS.anthropic]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    if (!files.includes(f)) console.log(`ORPHAN (not in source, left alone): ${path.join(dir, f)}`);
  }
}
console.log(check ? `${drift} drifted file(s)` : `synced ${files.length} agents, ${written} file(s) written`);
process.exit(check && drift ? 1 : 0);
