#!/usr/bin/env node
// Global PreToolUse hook: wraps CPU-heavy builds and tests in the shared gate
// lock (`cpu-lock gate`) in every repo, so peers' benches stay clean. Never blocks.
// Skipped: Windows and any machine without flock (cpu-lock needs it), commands that
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
const { spawnSync } = require('child_process');
const path = require('path');

const LOCK = '~/.claude/scripts/cpu-lock';

// Command position: the start of the command or of a segment after ; & | ( or a
// newline, then `then`/`do`/`else`/`elif`/`{`/`!`, then VAR=x assignments and the
// env, sudo, xargs, time, nice and timeout prefixes. Heavy patterns also take an `rtk `
// prefix. Quoted text is masked before matching, so a mention (`echo "pnpm test"`,
// `man cargo test`, `git log --grep tsc`) is neither locked nor dropped from rtk
// compression. Missed, left open: prefix options with a value (`sudo -u me`), a
// `case` arm (`a) cargo test`), `"$(cargo test)"` inside quotes, `cargo +nightly test`.
const PREFIXES = [
  String.raw`\w+=\S*[ \t]+`,
  String.raw`xargs(?:[ \t]+-\S+)*[ \t]+`,
  String.raw`time(?:[ \t]+-p)?[ \t]+`,
  String.raw`nice(?:[ \t]+(?:-n[ \t]*-?\d+|-\d+|--adjustment=-?\d+))?[ \t]+`,
  String.raw`timeout(?:[ \t]+(?:-[sk][ \t]+\S+|-[sk]\S+|-[^sk\s]\S*))*[ \t]+\S+[ \t]+`,
];
const atCommand = (separators, prefixes) =>
  String.raw`((?:^|[${separators}])[ \t]*(?:(?:then|do|else|elif|\{|!)[ \t]+)*)((?:${prefixes.join('|')})*)`;
const AT_COMMAND = atCommand(String.raw`;&|(\n`, [...PREFIXES, String.raw`(?:env|sudo)(?:[ \t]+-\S+)*[ \t]+`]);
// Where rtk's form may go: not after env or sudo (both can reset PATH, and rtk lives in
// ~/.local/bin), and not after `(`, so `$(cargo test)` captures the raw output.
const AT_RTK = atCommand(String.raw`;&|\n`, PREFIXES);
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
  [String.raw`cargo\s+(build|test|clippy)\b`, 'rtk cargo $1'],
  [String.raw`${RUNNER}vitest(?:\s+run)?\b`, 'rtk vitest'],
  [String.raw`${RUNNER}tsc\b`, 'rtk tsc'],
  [String.raw`${RUNNER}playwright\s+test\b`, 'rtk playwright test'],
  [String.raw`pnpm\s+exec\s+turbo\b`, 'rtk pnpm exec turbo'],
  [String.raw`pnpm\s+run\s+build\b`, 'rtk pnpm run build'],
].map(([pattern, form]) => [new RegExp(AT_RTK + pattern, 'dg'), new RegExp(`^${pattern}`), form]);

// Heredoc opener line, body, and terminator, matched left to right in one pass. `<<-`
// lets the terminator carry leading tabs; a CRLF script ends it with `\r`; `<<<` is a
// here-string. Missed, left open: two heredocs on one line (`<<A <<B`), a delimiter
// with spaces (`<<"a b"`).
const DELIM = String.raw`(['"]?)\\?([^\s'"<>;&|()\\]+)`;
const HEREDOC = new RegExp(String.raw`(?<!<)<<(?:-[ \t]*${DELIM}\1[^\n]*\n[\s\S]*?\n\t*\2|(?![-<])[ \t]*${DELIM}\3[^\n]*\n[\s\S]*?\n\4)\r?(?=\n|$)`, 'g');
const QUOTED = /"(?:[^"\\]|\\[\s\S])*"|'[^']*'/g;
// mask(match, opener line) → replacement
const maskHeredocs = (cmd, mask) => cmd.replace(HEREDOC, (match) => mask(match, match.slice(0, match.indexOf('\n'))));

// Commit messages and heredoc bodies are prose, and a `cpu-lock bench` call's
// quoted script already holds the bench lock: none of them is checked.
const stripProse = (cmd) => maskHeredocs(cmd.replace(/(\s(?:-m|--message)(?:=|\s+))("[^"]*"|'[^']*')/g, "$1''"), (match, head) => head)
  .replace(/(\S*cpu-lock\s+bench\b[^;&|\n]*?)('[^']*'|"[^"]*")/g, "$1''");
const maskQuotes = (cmd) => cmd.replace(QUOTED, (quoted) => quoted[0].repeat(2));
// Same masks with the length kept, so a match offset is an offset in the raw command.
// The filler is not a word character, so `\b` after a command word still holds.
const blankProse = (cmd) => maskHeredocs(cmd, (body, head) => head + '\x01'.repeat(body.length - head.length))
  .replace(QUOTED, (quoted) => '\x01'.repeat(quoted.length));

// Rewrites only the command word found at command position in the blanked text, so
// quoted text and heredoc bodies (a file being written) reach the shell unchanged.
function withRtk(cmd) {
  if (/\bRTK_DISABLED=1\b/.test(cmd)) return cmd;
  const blanked = blankProse(cmd);
  const edits = RTK_FORMS.flatMap(([atCommand, word, form]) => [...blanked.matchAll(atCommand)].map((match) => {
    const start = match.indices[2][1];
    const end = match.index + match[0].length;

    return [start, end, cmd.slice(start, end).replace(word, form)];
  }));

  return edits.sort((a, b) => b[0] - a[0]).reduce((out, [start, end, text]) => out.slice(0, start) + text + out.slice(end), cmd);
}

function optedOut(cwd) {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude', 'cpu-guard.off'))) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

const probeFlock = () => spawnSync('flock', ['--version']).status === 0;

function decide(cmd, { cwd = process.cwd(), platform = process.platform, hasFlock } = {}) {
  const prose = maskQuotes(stripProse(cmd));
  const heavy = HEAVY.some((pattern) => pattern.test(prose)) && !WATCH.test(prose);
  const skipped = platform === 'win32' || /cpu-lock\s/.test(prose) || /^\s*(CQT_GUARD_OK|CPU_GUARD_OFF)=1\s/.test(cmd);
  if (skipped || !heavy || optedOut(cwd) || !(hasFlock ?? probeFlock())) return {};
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
