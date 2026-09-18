#!/usr/bin/env node
// Link omp's agent dir to the one source of truth in this repo.
// Source: ~/.claude/.omp/agent-openai/agents/   (edit agents HERE)
// Link:   ~/.omp/agent/agents  ->  source        (junction on Windows, symlink elsewhere)
// Run once per machine. Idempotent: exits 0 if the link already points at source.
// A pre-existing real dir is moved aside to ~/.omp/agent/agents.pre-link (never deleted).
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const SRC = path.join(HOME, '.claude', '.omp', 'agent-openai', 'agents');
const LINK = path.join(HOME, '.omp', 'agent', 'agents');

if (!fs.existsSync(SRC)) {
  console.error(`source missing: ${SRC}`);
  process.exit(2);
}

const stat = fs.lstatSync(LINK, { throwIfNoEntry: false });
if (stat) {
  // junctions and symlinks both report isSymbolicLink() via lstat
  if (stat.isSymbolicLink() && path.resolve(fs.readlinkSync(LINK)) === path.resolve(SRC)) {
    console.log(`ok: ${LINK} -> ${SRC}`);
    process.exit(0);
  }
  const aside = `${LINK}.pre-link`;
  if (fs.existsSync(aside)) {
    console.error(`refusing: ${aside} already exists, remove it first`);
    process.exit(1);
  }
  fs.renameSync(LINK, aside);
  console.log(`moved existing ${LINK} -> ${aside}`);
}

fs.mkdirSync(path.dirname(LINK), { recursive: true });
fs.symlinkSync(SRC, LINK, process.platform === 'win32' ? 'junction' : 'dir');
console.log(`linked: ${LINK} -> ${SRC}`);
