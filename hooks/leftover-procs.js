#!/usr/bin/env node
// PostToolUse:Agent report: lists this user's waiter and server processes older
// than 10 minutes, so the session sees leftovers when a subagent returns.
// Each process is reported once per session (state/leftover-seen-<session_id>.json).
// Never kills anything and never blocks; any internal error exits 0 silently.
const { execFileSync } = require('child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('fs');
const { homedir } = require('os');
const { dirname, join } = require('path');

const MIN_AGE_SECONDS = 600;
const MAX_COMMAND = 120;
const LEFTOVER_PATTERNS = [
  /\buntil\s+grep\b/,
  /(?:^|[\s/;|&(])tail\s(?:.*\s)?(?:-[a-zA-Z0-9]*[fF]|--follow)(?:[\s=]|$)/,
  /\bhttp\.server\b/,
  /(?:^|[\s/])Xvfb\b/,
  /\bwhile\s+!\s.*\bsleep\b/,
];
const INSTRUCTION = 'Leftover background processes older than 10 min. The list shows processes of every session of this user: stop only the ones this session or its subagents started, by PID (`kill <pid>`), never `pkill -f`; leave other sessions\' processes alone:';

// Linux `etimes` is plain seconds; macOS has only `etime`, formatted [[dd-]hh:]mm:ss.
function ageSeconds(elapsed) {
  const isSeconds = /^\d+$/.test(elapsed);
  if (isSeconds) return Number(elapsed);

  const match = elapsed.match(/^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/);
  if (!match) return null;

  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));

  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

function parsePs(text) {
  const processes = [];

  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;

    const age = ageSeconds(match[2]);
    if (age === null) continue;

    const entry = { pid: Number(match[1]), age, command: match[3].trim() };
    processes.push(entry);
  }

  return processes;
}

function isLeftover({ age, command }) {
  const matchesPattern = LEFTOVER_PATTERNS.some((pattern) => pattern.test(command));

  return age > MIN_AGE_SECONDS && matchesPattern;
}

function formatAge(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const pad = (value) => String(value).padStart(2, '0');
  if (days > 0) return `${days}d${pad(hours % 24)}h`;
  if (hours > 0) return `${hours}h${pad(minutes % 60)}m`;

  return `${minutes}m`;
}

const formatRow = ({ pid, age, command }) => `PID ${pid}  ${formatAge(age)}  ${command.slice(0, MAX_COMMAND)}`;

// One `-o` per column: BSD ps reads everything after the first `=` as header text.
function readPs(platform) {
  const elapsed = platform === 'darwin' ? 'etime=' : 'etimes=';
  const args = ['-ww', '-u', String(process.getuid()), '-o', 'pid=', '-o', elapsed, '-o', 'args='];
  const options = { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] };

  return execFileSync('ps', args, options);
}

// The session id becomes a file name, so anything but a plain id means no state file.
function statePath(sessionId) {
  const isSafeId = typeof sessionId === 'string' && /^[\w-]+$/.test(sessionId);
  if (!isSafeId) return null;

  const stateDir = process.env.LEFTOVER_PROCS_STATE_DIR || join(homedir(), '.claude', 'state');

  return join(stateDir, `leftover-seen-${sessionId}.json`);
}

function readSeen(file) {
  try {
    const seen = JSON.parse(readFileSync(file, 'utf8'));
    const isMap = seen !== null && typeof seen === 'object' && !Array.isArray(seen);

    return isMap ? seen : {};
  } catch {
    return {};
  }
}

function writeSeen(file, seen) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(seen));
  } catch {
    // Without the file the next run reports the same processes again.
  }
}

// The file maps PID to command line, so a recycled PID counts as new. It is
// rewritten from the current matches, which forgets PIDs that are gone.
function unseen(matches, sessionId) {
  const file = statePath(sessionId);
  if (!file) return matches;

  const seen = readSeen(file);
  const current = Object.fromEntries(matches.map(({ pid, command }) => [pid, command]));
  const isChanged = JSON.stringify(current) !== JSON.stringify(seen);
  if (isChanged) writeSeen(file, current);

  return matches.filter(({ pid, command }) => seen[pid] !== command);
}

function report(platform, readProcesses = readPs, sessionId = undefined) {
  if (platform === 'win32') return '';

  const psOutput = readProcesses(platform);
  const matches = parsePs(psOutput).filter(isLeftover);
  const rows = unseen(matches, sessionId).map(formatRow);
  if (!rows.length) return '';

  return [INSTRUCTION, ...rows].join('\n');
}

// A background Agent call returns at launch (`async_launched`), before the subagent has done anything.
function hookOutput(input, platform, readProcesses = readPs) {
  if (input?.tool_response?.status === 'async_launched') return '';

  const additionalContext = report(platform, readProcesses, input?.session_id);
  if (!additionalContext) return '';

  const hookEventName = input?.hook_event_name === 'UserPromptSubmit' ? 'UserPromptSubmit' : 'PostToolUse';
  const hookSpecificOutput = { hookEventName, additionalContext };

  return JSON.stringify({ hookSpecificOutput }) + '\n';
}

function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    process.stdout.write(hookOutput(input, process.platform));
  } catch {
    // A hook must not break the session.
  }
}

if (require.main === module) main();
module.exports = { ageSeconds, hookOutput, isLeftover, parsePs, report };
