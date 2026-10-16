// Usage: node review-stamp.mjs lookup <base> [<material>...]
//        node review-stamp.mjs write <base> <reviewed-sha> <full|delta|proof> <report-file> [<material>...]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

const USAGE = 'usage: review-stamp.mjs lookup <base> [<material>...] | write <base> <reviewed-sha> <full|delta|proof> <report-file> [<material>...]';
const MODES = ['full', 'delta', 'proof'];
const STAMP_NAME = /^[0-9a-f]{40,64}\.md$/;
const HEADER = /^mb: ([0-9a-f]{40,64})\ndigest: ([0-9a-f]{64})\ndate: ([^\n]*)\nmode: (full|delta|proof)\n\n/;
const EXCUSED_UNTRACKED = ['?? .claude/local/', '?? docs/specs/'];
const QUOTED_UNTRACKED = /^\?\? "/;
const VERDICT_SECTION = /^## 7\b/m;
const VERDICT_LINE = /^\**(APPROVE|BLOCK) — /m;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  const stderr = (result.stderr ?? '').trim();
  const failure = result.error ? result.error.message : stderr;

  return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: failure };
};

// Porcelain v1 quotes paths with special characters; drop the quote so the prefix test still matches.
const isDirtyLine = (line) => {
  const unquoted = line.replace(QUOTED_UNTRACKED, '?? ');
  const excused = EXCUSED_UNTRACKED.some((prefix) => unquoted.startsWith(prefix));

  return !excused;
};

const hasDirt = (porcelain) => porcelain.split('\n').filter((line) => line !== '').some(isDirtyLine);

const digestOf = (materials) => {
  const existing = materials.filter((file) => existsSync(file));
  const hashes = existing.map((file) => sha256(readFileSync(file)));

  return sha256(hashes.join('\n'));
};

const readHeader = (file) => {
  try {
    const text = readFileSync(file, 'utf8');
    const match = HEADER.exec(text);
    // A stamp whose body lost its verdict (truncated, hand-edited) is not a review.
    const body = match ? text.slice(match[0].length) : '';
    if (!match || !VERDICT_SECTION.test(body) || !VERDICT_LINE.test(body)) return null;

    return { mb: match[1], digest: match[2] };
  } catch {
    return null;
  }
};

// Resolves everything a command needs, or the first failure as `error`.
const inspect = (base) => {
  const topResult = git(process.cwd(), 'rev-parse', '--show-toplevel');
  if (!topResult.ok) return { error: topResult.stderr || 'not a git repository' };

  const top = topResult.stdout;
  const status = git(top, 'status', '--porcelain', '--untracked-files=all');
  if (!status.ok) return { error: status.stderr };
  if (hasDirt(status.stdout)) return { error: 'dirty', dirty: true };

  const headResult = git(top, 'rev-parse', 'HEAD');
  if (!headResult.ok) return { error: headResult.stderr || 'no HEAD commit' };

  const mbResult = git(top, 'merge-base', base, 'HEAD');
  if (!mbResult.ok) return { error: mbResult.stderr || `no merge-base for ${base}` };

  const commonResult = git(top, 'rev-parse', '--git-common-dir');
  if (!commonResult.ok) return { error: commonResult.stderr };

  const stampDir = join(resolve(top, commonResult.stdout), 'claude-review');

  return { top, head: headResult.stdout, mb: mbResult.stdout, stampDir };
};

const isUsableAhead = (top, sha, head) => {
  const ancestor = git(top, 'merge-base', '--is-ancestor', sha, head);
  if (!ancestor.ok) return false;

  const merges = git(top, 'rev-list', '--merges', `${sha}..${head}`);

  return merges.ok && merges.stdout === '';
};

const findNearest = ({ top, head, mb, stampDir }) => {
  if (!existsSync(stampDir)) return null;

  const names = readdirSync(stampDir).filter((name) => STAMP_NAME.test(name));
  const found = [];
  for (const name of names) {
    const sha = name.slice(0, -3);
    const header = readHeader(join(stampDir, name));
    if (!header || header.mb !== mb || sha === head) continue;
    if (!isUsableAhead(top, sha, head)) continue;

    const count = git(top, 'rev-list', '--count', `${sha}..${head}`);
    if (!count.ok) continue;

    found.push({ sha, header, count: Number(count.stdout), file: join(stampDir, name) });
  }
  found.sort((a, b) => a.count - b.count);

  return found[0] ?? null;
};

const lookup = (base, materials) => {
  const info = inspect(base);
  if (info.error) return { case: 3, reason: info.error };

  const digest = digestOf(materials);
  const exactFile = join(info.stampDir, `${info.head}.md`);
  const exact = readHeader(exactFile);
  if (exact && exact.mb === info.mb) {
    return { case: 1, stamp: exactFile, materialChanged: exact.digest !== digest };
  }

  const ahead = findNearest(info);
  if (ahead) {
    const range = `${ahead.sha}..${info.head}`;

    return { case: 2, stamp: ahead.file, range, materialChanged: ahead.header.digest !== digest };
  }

  return { case: 3, reason: 'no reusable stamp' };
};

const write = (base, reviewed, mode, reportFile, materials) => {
  const info = inspect(base);
  if (info.error) return { status: 1, message: `no stamp written: ${info.error}` };
  if (info.head !== reviewed) return { status: 1, message: `no stamp written: HEAD ${info.head} is not ${reviewed}` };

  const report = readFileSync(reportFile, 'utf8');
  const header = [`mb: ${info.mb}`, `digest: ${digestOf(materials)}`, `date: ${new Date().toISOString()}`, `mode: ${mode}`];
  mkdirSync(info.stampDir, { recursive: true });
  const target = join(info.stampDir, `${reviewed}.md`);
  const pending = `${target}.tmp`;
  writeFileSync(pending, `${header.join('\n')}\n\n${report}`);
  renameSync(pending, target);

  return { status: 0 };
};

// A missing file is legal (skipped); a missing or root parent directory is a caller bug such as an unset $SCRATCH.
const isOrphan = (file) => {
  const parent = dirname(resolve(file));

  return parent === parse(parent).root || !existsSync(parent);
};

const orphanMaterial = (materials) => materials.find(isOrphan);

const isCompleteReport = (reportFile) => {
  const text = readFileSync(reportFile, 'utf8');

  return VERDICT_SECTION.test(text) && VERDICT_LINE.test(text);
};

const usageFail = (message = USAGE) => {
  console.error(message);

  return 2;
};

const orphanFail = (orphan) => usageFail(`${USAGE}\nmaterial parent directory does not exist: ${orphan}`);

const main = (argv) => {
  const [command, ...rest] = argv;

  if (command === 'lookup' && rest.length >= 1) {
    const orphan = orphanMaterial(rest.slice(1));
    if (orphan) return orphanFail(orphan);

    console.log(JSON.stringify(lookup(rest[0], rest.slice(1))));

    return 0;
  }

  if (command === 'write' && rest.length >= 4) {
    const [base, reviewed, mode, reportFile, ...materials] = rest;
    if (!MODES.includes(mode) || !existsSync(reportFile)) return usageFail();
    if (!isCompleteReport(reportFile)) return usageFail(`${USAGE}\nreport lacks a "## 7" section and an "APPROVE — " or "BLOCK — " verdict line: ${reportFile}`);

    const orphan = orphanMaterial(materials);
    if (orphan) return orphanFail(orphan);

    const result = write(base, reviewed, mode, reportFile, materials);
    if (result.message) console.error(result.message);

    return result.status;
  }

  return usageFail();
};

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`review-stamp: ${error.message}`);
  process.exitCode = 1;
}
