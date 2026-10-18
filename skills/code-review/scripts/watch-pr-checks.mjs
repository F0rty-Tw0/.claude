// Usage: node watch-pr-checks.mjs <PR#> <SHA> <exit-file> [--no-fail-fast] [--repo <owner/repo>]
// Blocks until the PR's checks for <SHA> finish, writes the exit code to <exit-file>, and exits with it.
// Run it as a background job: the harness re-invokes the model on exit; the exit file survives a lost notification.
// 0 passed · 1 a check failed or other gh failure · 3 head is <SHA> but no CI registered
// 5 head never became <SHA> · 6 gh error while waiting, or a crash · 7 a check was cancelled, none failed
// 2/4 from `gh pr checks --watch` · 64 usage
import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const USAGE = 'usage: watch-pr-checks.mjs <PR#> <SHA> <exit-file> [--no-fail-fast] [--repo <owner/repo>]';
const POLLS = 20;
const DEFAULT_POLL_MS = 30000;
const NO_CHECKS = 'no checks reported';
const WAITING_CODES = [0, 1, 8]; // pass, fail or "no checks reported", pending
const PR_NUMBER = /^\d+$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const LINE_BREAK = /\r?\n/;
const PASSED = 0;
const FAILED = 1;
const INTERRUPTED = 2;
const NO_CI = 3;
const HEAD_MISSING = 5;
const GH_ERROR = 6;
const CANCELLED = 7;
const USAGE_ERROR = 64;

const pollEnv = Number(process.env.WATCH_PR_POLL_MS ?? DEFAULT_POLL_MS);
const POLL_MS = Number.isFinite(pollEnv) ? pollEnv : DEFAULT_POLL_MS;

const parse = (argv) => {
  const opts = { failFast: true, repo: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-fail-fast') opts.failFast = false;
    else if (argv[i] === '--repo') opts.repo = argv[++i] ?? '';
    else positional.push(argv[i]);
  }

  const [pr, sha, exitFile] = positional;
  const repoIsFlag = opts.repo?.startsWith('--') ?? false;
  const repoValid = opts.repo !== '' && !repoIsFlag;
  const argsValid = positional.length === 3 && PR_NUMBER.test(pr) && FULL_SHA.test(sha);
  const parsed = { pr, sha, exitFile, ...opts };

  return argsValid && repoValid ? parsed : null;
};

// WATCH_PR_GH_SCRIPT swaps gh for a node script (tests only).
const gh = (args, repo, options) => {
  const repoArgs = repo ? ['-R', repo] : [];
  const full = [...args, ...repoArgs];
  const fake = process.env.WATCH_PR_GH_SCRIPT;
  if (fake) return spawnSync(process.execPath, [fake, ...full], options);

  return spawnSync('gh', full, options);
};

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const writeExit = (exitFile, code) => {
  const pending = `${exitFile}.tmp`;

  mkdirSync(dirname(exitFile), { recursive: true });
  writeFileSync(pending, `${code}\n`);
  renameSync(pending, exitFile);
};

// Returns an exit code to stop with, or null once <SHA> is the head and its checks have registered.
const waitForChecks = ({ pr, sha, repo }) => {
  let head = '';
  for (let i = 0; i < POLLS; i++) {
    if (i > 0) sleep(POLL_MS);

    const view = gh(['pr', 'view', pr, '--json', 'headRefOid', '-q', '.headRefOid'], repo, { encoding: 'utf8' });
    if (view.status !== 0) return GH_ERROR;

    head = view.stdout.trim();
    const checks = gh(['pr', 'checks', pr], repo, { encoding: 'utf8' });
    const expected = WAITING_CODES.includes(checks.status);
    if (!expected) return GH_ERROR;

    const output = `${checks.stdout}${checks.stderr}`;
    const noChecks = output.includes(NO_CHECKS);
    if (head === sha && !noChecks) return null;
  }

  return head === sha ? NO_CI : HEAD_MISSING;
};

// `gh pr checks --watch` exits 0 when checks are cancelled, so a pass is re-read by bucket.
const bucketCode = (pr, repo) => {
  const read = gh(['pr', 'checks', pr, '--json', 'bucket', '-q', '.[].bucket'], repo, { encoding: 'utf8' });
  if (read.status !== 0) return GH_ERROR;

  const buckets = read.stdout.split(LINE_BREAK);
  if (buckets.includes('fail')) return FAILED;
  if (buckets.includes('cancel')) return CANCELLED;

  return PASSED;
};

const watchChecks = ({ pr, failFast, repo }) => {
  const failFastArgs = failFast ? ['--fail-fast'] : [];
  const watch = gh(['pr', 'checks', pr, '--watch', ...failFastArgs], repo, { stdio: 'inherit' });
  if (watch.status !== PASSED) return watch.status ?? INTERRUPTED;

  return bucketCode(pr, repo);
};

const settle = (opts) => {
  const early = waitForChecks(opts);
  if (early !== null) return early;

  return watchChecks(opts);
};

const crash = (exitFile, error) => {
  console.error(`watch-pr-checks: ${error.message}`);
  try {
    writeExit(exitFile, GH_ERROR);
  } catch {
    // The exit file's own path may be what failed; the exit code still reports the crash.
  }

  return GH_ERROR;
};

const main = (argv) => {
  const opts = parse(argv);
  if (!opts) {
    console.error(USAGE);

    return USAGE_ERROR;
  }

  try {
    const code = settle(opts);
    writeExit(opts.exitFile, code);

    return code;
  } catch (error) {
    return crash(opts.exitFile, error);
  }
};

process.exitCode = main(process.argv.slice(2));
