#!/usr/bin/env node
// Usage: node convention-only.mjs <range>
// Exit 0: every changed file is fully explained by the repo's own formatters (prettier, eslint --fix, rustfmt): format(old) === format(new).
// A file with no formatter is never cosmetic, whitespace included: whitespace can be semantic (strings, regexes, templates, CRLF, indentation).
// Exit 1: not convention-only; prints `not convention-only: <file> (<reason>)` for the first offending file.
// Exit 2: usage error (no range, not a repo, or git rejects the range). Callers treat any non-0 exit as "review".
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const TIMEOUT_MS = 20000;
const MAX_BUFFER = 64 * 1024 * 1024;
const BINARY_PROBE_BYTES = 8000;
const SUBMODULE_MODE = '160000';
const SYMLINK_MODE = '120000';
const DEFAULT_RUST_EDITION = '2021';
const PRETTIER_EXT = new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.md', '.html', '.yaml', '.yml', '.vue']);
const ESLINT_EXT = new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx']);
const NOT_COSMETIC = { A: 'added', D: 'deleted', T: 'type change' };

class FormatterError extends Error {}

const extOf = (file) => {
  const name = basename(file);
  const dot = name.lastIndexOf('.');

  return dot > 0 ? name.slice(dot) : '';
};
const fail = (file, reason, code = 1) => {
  console.log(`not convention-only: ${file}${reason ? ` (${reason})` : ''}`);
  process.exit(code);
};

const range = process.argv[2];
if (!range || range.startsWith('-')) {
  console.error('usage: convention-only.mjs <range>');
  process.exit(2);
}

const topRun = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
if (topRun.status !== 0) {
  console.error('not a git repository');
  process.exit(2);
}
const top = resolve(topRun.stdout.trim());

// Every git call runs from the top, where the top-relative paths of `diff --raw` resolve.
const git = (args, { encoding } = {}) => spawnSync('git', args, { cwd: top, encoding, maxBuffer: MAX_BUFFER });

// --ignore-submodules=none: a repo config or .gitmodules `ignore=all` must not hide a submodule bump from the list.
const rawRun = git(['diff', '--raw', '-z', '--no-abbrev', '--no-renames', '--ignore-submodules=none', range], { encoding: 'utf8' });
if (rawRun.status !== 0) {
  console.error(rawRun.stderr);
  process.exit(2);
}

// `:<oldmode> <newmode> <oldsha> <newsha> <status>\0<path>\0` per entry.
const parseRaw = (raw) => {
  const parts = raw.split('\0').filter(Boolean);
  const entries = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [oldMode, newMode, oldSha, newSha, status] = parts[i].slice(1).split(' ');
    entries.push({ oldMode, newMode, oldSha, newSha, status: status[0], file: parts[i + 1] });
  }

  return entries;
};
const entries = parseRaw(rawRun.stdout);
if (!entries.length) fail('(empty diff)', '');

const blob = (sha) => {
  const run = git(['cat-file', 'blob', sha]);

  return run.error || run.status !== 0 ? null : run.stdout;
};
const isBinary = (buf) => buf.subarray(0, BINARY_PROBE_BYTES).includes(0);

// Formatters resolve from <top>/node_modules/<pkg> only: require.resolve would walk into parent and global node_modules.
const packageBin = (pkg) => {
  const manifest = join(top, 'node_modules', pkg, 'package.json');
  if (!existsSync(manifest)) return null;
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  const rel = typeof bin === 'string' ? bin : bin?.[pkg];

  return rel ? join(top, 'node_modules', pkg, rel) : null;
};
const spawnFormatter = (name, command, args, input, options = {}) => {
  const run = spawnSync(command, args, { cwd: top, input, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, ...options });
  if (run.error) throw new FormatterError(name);

  return run;
};
const runNodeTool = (name, args, input, okStatuses) => {
  const run = spawnFormatter(name, process.execPath, [packageBin(name), ...args], input);
  if (!okStatuses.includes(run.status)) throw new FormatterError(name);

  return run.stdout;
};

const prettier = (file) => (input) => runNodeTool('prettier', ['--stdin-filepath', file], input, [0]);
const eslint = (file) => (input) => {
  const out = runNodeTool('eslint', ['--stdin', '--stdin-filename', file, '--fix-dry-run', '--format', 'json'], input, [0, 1]);
  try {
    return JSON.parse(out)[0].output ?? input;
  } catch {
    throw new FormatterError('eslint');
  }
};

const rustEdition = (file) => {
  for (let dir = join(top, dirname(file)); dir.startsWith(top); dir = dirname(dir)) {
    const manifest = join(dir, 'Cargo.toml');
    const edition = existsSync(manifest) && readFileSync(manifest, 'utf8').match(/edition\s*=\s*"(\d+)"/);
    if (edition) return edition[1];
    if (dir === top || dir === dirname(dir)) break;
  }

  return DEFAULT_RUST_EDITION;
};
let rustfmtPresent;
const hasRustfmt = () => {
  rustfmtPresent ??= !spawnSync('rustfmt', ['--version'], { timeout: TIMEOUT_MS }).error;

  return rustfmtPresent;
};
const rustfmt = (file) => (input) => {
  const run = spawnFormatter('rustfmt', 'rustfmt', ['--emit', 'stdout', '--edition', rustEdition(file)], input);
  if (run.status !== 0) throw new FormatterError('rustfmt');

  return run.stdout;
};

// Test seam, inert unless CONVENTION_FMT_TEST=1 too: a stray CONVENTION_FMT_CMD (say `true`) must never make every diff look cosmetic.
const seamCommand = process.env.CONVENTION_FMT_TEST === '1' ? process.env.CONVENTION_FMT_CMD : '';
const seamFormatter = (input) => {
  const run = spawnFormatter('CONVENTION_FMT_CMD', seamCommand, [], input, { shell: true });
  if (run.status !== 0) throw new FormatterError('CONVENTION_FMT_CMD');

  return run.stdout;
};

// Ordered stages for a file; empty when the repo has no formatter for it.
const stagesFor = (file) => {
  if (seamCommand) return [seamFormatter];
  const ext = extOf(file);
  const stages = [];
  if (PRETTIER_EXT.has(ext) && packageBin('prettier')) stages.push(prettier(file));
  if (ESLINT_EXT.has(ext) && packageBin('eslint')) stages.push(eslint(file));
  if (ext === '.rs' && hasRustfmt()) stages.push(rustfmt(file));

  return stages;
};
const format = (stages, text) => stages.reduce((acc, stage) => stage(acc), text);

// Returns '' when the file is cosmetic, else the reason it is not.
const verdict = ({ oldMode, newMode, oldSha, newSha, status, file }) => {
  if (status !== 'M') return NOT_COSMETIC[status] ?? `status ${status}`;
  if (oldMode !== newMode) return 'mode change';
  if (newMode === SUBMODULE_MODE) return 'submodule';
  if (newMode === SYMLINK_MODE) return 'symlink retarget';

  const before = blob(oldSha);
  const after = blob(newSha);
  if (!before || !after) return 'cannot read blob';
  if (isBinary(before) || isBinary(after)) return 'binary';

  const stages = stagesFor(file);
  if (!stages.length) return 'no formatter for this file';

  const formatted = format(stages, before.toString('utf8')) === format(stages, after.toString('utf8'));

  return formatted ? '' : 'changed beyond formatting';
};

for (const entry of entries) {
  try {
    const reason = verdict(entry);
    if (reason) fail(entry.file, reason);
  } catch (error) {
    if (!(error instanceof FormatterError)) throw error;
    fail(entry.file, `formatter error: ${error.message}`);
  }
}
