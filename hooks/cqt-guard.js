#!/usr/bin/env node
// PreToolUse guard for cqt-monitor sessions (registered in that repo's local
// .claude/settings.json). Blocks commands that killed shells or wiped mutant
// work there, refuses perf runs outside the machine lock, and wraps cargo
// builds and tests in the shared gate lock so peers' benches stay clean.
// A user-approved exception: prefix the command with `CQT_GUARD_OK=1 `.
const fs = require('fs');

const LOCK = '~/.claude/scripts/cpu-lock';

const BLOCKS = [
  {
    test: /(^|[;&|(]\s*|\s)(pkill|pgrep)\s+(-\w*f\w*|--full)\b/,
    why: 'pkill/pgrep -f matches its own calling shell and can kill it. Use explicit pids from `ps -eo pid,args | grep "[p]attern"`.',
  },
  {
    test: /\bgit\s+(stash(?!\s+(list|show)\b)|reset\s+--hard|restore(?!\s+--staged\b)|checkout\s+(--\s|\.(\s|$)))/,
    why: 'git stash/reset --hard/restore/checkout -- wipe uncommitted work in a worktree. Restore a mutated file from its cp backup, then touch it.',
  },
  {
    test: /(perf\.sh|perfrun\.sh|tabrun\.sh|scroll\.sh|cargo\s+bench(?![^;&|\n]*--no-run)|hyperfine)\b/,
    unless: /cpu-lock\s+bench\b/,
    why: `perf and bench runs take the exclusive machine lock: \`${LOCK} bench <cmd>\`.`,
  },
];

const HEAVY = /\bcargo\s+(build|test|clippy|nextest|run|bench)\b|cargo\.sh\b|gates\.sh\b/;

// The hook's answer for one command: a block reason, a wrapped command, or nothing.
function decide(cmd) {
  if (/^\s*CQT_GUARD_OK=1\s/.test(cmd)) return {};
  const block = BLOCKS.find((rule) => rule.test.test(cmd) && !(rule.unless && rule.unless.test(cmd)));
  if (block) return { block: `cqt-guard: ${block.why}` };
  if (!HEAVY.test(cmd) || /cpu-lock\s/.test(cmd)) return {};

  return { command: `${LOCK} gate nice -n 19 bash -c '${cmd.replaceAll("'", `'\\''`)}'` };
}

if (require.main === module) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { process.exit(0); }
  const cmd = (input.tool_input || {}).command || '';
  const result = decide(cmd);
  if (result.block) {
    process.stderr.write(result.block);
    process.exit(2);
  }
  if (result.command) {
    const updatedInput = { ...input.tool_input, command: result.command };
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecisionReason: 'cqt-guard: cargo under cpu-lock gate', updatedInput } }));
  }
}

module.exports = { decide };
