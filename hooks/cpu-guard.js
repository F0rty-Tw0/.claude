#!/usr/bin/env node
// Global PreToolUse hook: wraps CPU-heavy builds and tests in the shared gate
// lock (`cpu-lock gate`) in every repo, so peers' benches stay clean. Never blocks.
// Skipped: Windows (cpu-lock needs flock, which Git Bash lacks), commands that
// already hold a lock, the one-off prefixes `CPU_GUARD_OFF=1 ` and
// `CQT_GUARD_OK=1 `, and repos with a `.claude/cpu-guard.off` file in the cwd or
// an ancestor.
// The wrap runs in a child shell, so its cd, export, and functions don't carry over.
// When two hooks rewrite one command, rtk's rewrite wins and the lock is lost.
// So rtk's hook must skip every heavy command, and this hook puts rtk's own form
// back inside the wrap.
// Known gap: rtk 1.0.1 checks each part of a compound on its own, so in
// `git status && pnpm turbo run test` it rewrites `git status`, its rewrite wins,
// and the heavy part runs unlocked (cargo had the same gap under cqt-guard). Bare
// commands and `cd x && <heavy>` are wrapped. Root fix: one hook does all rewriting.
// User step, once per machine, after this hook is live in ~/.claude (earlier, rtk
// stops compressing these commands and nothing wraps them): in the `[hooks]`
// table of ~/.config/rtk/config.toml, replace `exclude_commands` with these lines.
// Revert by restoring the old line. cpu-guard.test.mjs test 8 checks this line.
// # Heavy cargo and the heavy JS commands are left to ~/.claude/hooks/cpu-guard.js,
// # which wraps them in cpu-lock and adds `rtk` back inside the wrap. Two hooks
// # rewriting one command: rtk's won.
// exclude_commands = ['^.*\bcargo\s+(build|test|clippy|nextest|run|bench)\b', '^(?:\w+=\S*\s+)*(?:(?:pnpm|npx|yarn)\s+(?:exec\s+)?)?(?:vitest|playwright\s+test|tsc)\b', '^(?:\w+=\S*\s+)*pnpm\s+(?:run\s+build|exec\s+turbo)\b']
// # rtk tests each pattern against one segment of a compound at a time, and a
// # pattern not starting with `^` is a literal prefix, not a regex. So `^` is the
// # command-position anchor here, and a mention (`git log --grep tsc`) keeps rtk
// # compression. Check: `rtk hook check git log --grep tsc` still prints a rewrite.
const fs = require('fs');
const path = require('path');

const LOCK = '~/.claude/scripts/cpu-lock';

// Command position: the start of the command or of a segment after ; & | ( or a
// newline, then VAR=x assignments. Heavy patterns also take an `rtk ` prefix. Quoted
// text is masked before matching, so a mention (`echo "pnpm test"`, `man cargo test`,
// `git log --grep tsc`) is neither locked nor dropped from rtk compression.
const AT_COMMAND = String.raw`(^|[;&|(\n]\s*)((?:\w+=\S*\s+)*)`;
const RUNNER = String.raw`(?:(?:pnpm|npx)\s+(?:exec\s+)?)?`;
const HEAVY = [
  String.raw`cargo\s+(?:build|test|clippy|nextest|run|bench)\b|(?:(?:ba)?sh\s+)?\S*\b(?:cargo|gates)\.sh\b`,
  String.raw`(?:pnpm|npm|yarn)\s+(?:-r\s+|--filter\s+\S+\s+)*test\b`,
  String.raw`(?:pnpm|npx)\s+(?:turbo|nx)\s`,
  String.raw`node\s+--test\b`,
  // Excluded in rtk config.toml, rtk form re-inserted below.
  String.raw`(?:(?:pnpm|npx|yarn)\s+(?:exec\s+)?)?(?:vitest|playwright\s+test|tsc)\b`,
  String.raw`pnpm\s+(?:run\s+build|exec\s+turbo)\b`,
].map((pattern) => new RegExp(String.raw`${AT_COMMAND}(?:rtk\s+)?(?:${pattern})`));
const WATCH = /\s--watch\b|\s-w\b|\swatch\b|:watch\b|\bpnpm\s+dev\b/;

// rtk's own form of each command it no longer rewrites, measured with `rtk rewrite`
// on rtk 1.0.1 before the exclusion.
const RTK_FORMS = [
  [String.raw`cargo\s+(build|test|clippy)\b`, '$1$2rtk cargo $3'],
  [String.raw`${RUNNER}vitest(?:\s+run)?\b`, '$1$2rtk vitest'],
  [String.raw`${RUNNER}tsc\b`, '$1$2rtk tsc'],
  [String.raw`${RUNNER}playwright\s+test\b`, '$1$2rtk playwright test'],
  [String.raw`pnpm\s+exec\s+turbo\b`, '$1$2rtk pnpm exec turbo'],
  [String.raw`pnpm\s+run\s+build\b`, '$1$2rtk pnpm run build'],
].map(([pattern, form]) => [new RegExp(AT_COMMAND + pattern, 'g'), form]);

// Commit messages and heredoc bodies are prose, and a `cpu-lock bench` call's
// quoted script already holds the bench lock: none of them is checked.
const stripProse = (cmd) => cmd
  .replace(/(\s(?:-m|--message)(?:=|\s+))("[^"]*"|'[^']*')/g, "$1''")
  .replace(/(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n\3(?=\n|$)/g, '$1')
  .replace(/(\S*cpu-lock\s+bench\b[^;&|\n]*?)('[^']*'|"[^"]*")/g, "$1''");
const maskQuotes = (cmd) => cmd.replace(/"(?:[^"\\]|\\[\s\S])*"|'[^']*'/g, (quoted) => quoted[0].repeat(2));

function withRtk(cmd) {
  if (/\bRTK_DISABLED=1\b/.test(cmd)) return cmd;

  return RTK_FORMS.reduce((out, [pattern, form]) => out.replace(pattern, form), cmd);
}

function optedOut(cwd) {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude', 'cpu-guard.off'))) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

function decide(cmd, { cwd = process.cwd(), platform = process.platform } = {}) {
  const prose = maskQuotes(stripProse(cmd));
  const heavy = HEAVY.some((pattern) => pattern.test(prose)) && !WATCH.test(prose);
  const skipped = platform === 'win32' || /cpu-lock\s/.test(prose) || /^\s*(CQT_GUARD_OK|CPU_GUARD_OFF)=1\s/.test(cmd);
  if (skipped || !heavy || optedOut(cwd)) return {};
  const quoted = withRtk(cmd).replaceAll("'", `'\\''`);

  return { command: `${LOCK} gate nice -n 19 "\${SHELL:-bash}" -c '${quoted}'` };
}

if (require.main === module) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { process.exit(0); }
  const toolInput = input.tool_input || {};
  const command = typeof toolInput.command === 'string' ? toolInput.command : '';
  const cwd = typeof input.cwd === 'string' ? input.cwd : undefined;
  const result = decide(command, { cwd });
  if (result.command) {
    const updatedInput = { ...toolInput, command: result.command };
    const hookSpecificOutput = { hookEventName: 'PreToolUse', permissionDecisionReason: 'cpu-guard: heavy command under cpu-lock gate', updatedInput };
    process.stdout.write(JSON.stringify({ hookSpecificOutput }));
  }
}

module.exports = { decide, stripProse, optedOut };
