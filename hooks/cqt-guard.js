#!/usr/bin/env node
// PreToolUse guard for cqt-monitor sessions (registered in that repo's untracked
// .claude/settings.json). Blocks commands that killed shells or wiped mutant
// work there, refuses perf runs outside the machine lock, and wraps cargo
// builds and tests in the shared gate lock so peers' benches stay clean.
// A footgun net, not a security boundary: the model can type the user-approved
// exception prefix `CQT_GUARD_OK=1 ` itself, so the rules in cqt's CLAUDE.md
// say when it may. Known gaps, left open: a heredoc fed to a shell
// (`bash <<EOF`), prefixes with their own options (`sudo -u me`, `env -i`,
// `timeout -k 5`, `/usr/bin/time -v`), space-separated git long options
// (`--git-dir x`), and a bare pathspec checkout (`git checkout a.rs`).
// rtk's hook skips heavy cargo (exclude_commands in ~/.config/rtk/config.toml):
// when two hooks rewrite one command, rtk's rewrite won and the lock was lost.
const fs = require('fs');

const LOCK = '~/.claude/scripts/cpu-lock';
const OVERRIDE = 'A user-approved exception: prefix the command with `CQT_GUARD_OK=1 `.';

// Commit messages and heredoc bodies are prose, and a `cpu-lock bench` call's
// quoted script already holds the bench lock: none of them is checked.
const stripProse = (cmd) => cmd
  .replace(/(\s(?:-m|--message)(?:=|\s+))("[^"]*"|'[^']*')/g, "$1''")
  .replace(/(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n\3(?=\n|$)/g, '$1')
  .replace(/(\S*cpu-lock\s+bench\b[^;&|\n]*?)('[^']*'|"[^"]*")/g, "$1''");

// Leading `VAR=value` assignments and wrappers that run the next word as the command.
const PREFIX = /^(?:\w+=(?:"[^"]*"|'[^']*'|\S*)|sudo|env|command|exec|time|nohup|bash|sh|xargs(?:\s+-\S+)*|nice(?:\s+-n\s*-?\d+|\s+-\d+)?|timeout(?:\s+-\S+)*\s+\S+|taskset(?:\s+-c)?\s+\S+|\S*cpu-lock\s+gate)\s+/;
function command(part) {
  let rest = part.trim();
  for (let next = rest.replace(PREFIX, ''); next !== rest; next = rest.replace(PREFIX, '')) rest = next;
  return rest;
}

// Each command of a chain or pipeline, with its prefixes stripped.
const segments = (cmd) => cmd.split(/[;&|\n(]+/).map(command);

// git subcommands that drop uncommitted work, after global options (`-C <dir>`, `-c k=v`, `--git-dir=x`).
function wipesWork(segment) {
  const match = segment.match(/^(?:\S*\/)?git((?:\s+(?:-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S+)?))*)\s+(\S+)(.*)$/);
  if (!match) return false;
  const [, , sub, rest] = match;
  if (sub === 'stash') return !/^\s+(list|show)\b/.test(rest);
  if (sub === 'reset') return /\s--(hard|merge|keep)\b/.test(rest);
  if (sub === 'clean') return /\s(-\w*f\w*|--force)\b/.test(rest);
  if (sub === 'restore') return !/\s(--staged|-S)\b/.test(rest) || /\s(--worktree|-W)\b/.test(rest);
  if (sub === 'checkout') return /\s(--|-\w*f\w*|--force|\.)(\s|$)/.test(rest);
  if (sub === 'switch') return /\s(-\w*f\w*|--force|--discard-changes)(\s|$)/.test(rest);
  return false;
}

const RULES = [
  {
    test: (segment) => /^(\S*\/)?(pkill|pgrep)\b.*\s(-\w*f\w*|--full)\b/.test(segment),
    why: 'pkill/pgrep -f matches its own calling shell and can kill it. Use explicit pids from `ps -eo pid,args | grep "[p]attern"`.',
  },
  {
    test: wipesWork,
    why: 'git stash/reset --hard/restore/checkout --/clean -f wipe uncommitted work in a worktree. Restore a mutated file from its cp backup, then touch it.',
  },
  {
    test: (segment) => /^((\S*\/)?(perf|perfrun|tabrun|scroll)\.sh|hyperfine)\b/.test(segment)
      || (/^cargo\s+bench\b/.test(segment) && !/\s--no-run\b/.test(segment)),
    why: `perf and bench runs take the exclusive machine lock: \`${LOCK} bench <cmd>\`.`,
  },
];

const HEAVY = /\bcargo\s+(build|test|clippy|nextest|run|bench)\b|cargo\.sh\b|gates\.sh\b/;

// rtk's cargo filters, at command position only, so message text is left alone.
const withRtk = (cmd) => (/\bRTK_DISABLED=1\b/.test(cmd) ? cmd : cmd.replace(/(^|[;&|(\n]\s*)((?:\w+=\S*\s+)*)cargo\s+(build|test|clippy)\b/g, '$1$2rtk cargo $3'));

// The hook's answer for one command: a block reason, a wrapped command, or nothing.
function decide(cmd) {
  if (/^\s*CQT_GUARD_OK=1\s/.test(cmd)) return {};
  const prose = stripProse(cmd);
  const parts = segments(prose);
  const rule = RULES.find((r) => parts.some((part) => r.test(part)));
  if (rule) return { block: `cqt-guard: ${rule.why} ${OVERRIDE}` };
  if (!HEAVY.test(prose) || /cpu-lock\s/.test(cmd)) return {};

  return { command: `${LOCK} gate nice -n 19 "\${SHELL:-bash}" -c '${withRtk(cmd).replaceAll("'", `'\\''`)}'` };
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
