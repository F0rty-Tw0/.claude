// RTK auto-rewrite hook for Claude Code PreToolUse:Bash
// Transparently rewrites raw commands to their rtk equivalents.
// Outputs JSON with updatedInput to modify the command before execution.

const REWRITE_RULES = [
  // Git commands (all subcommands pass through rtk git)
  [/^git\s+status(\s|$)/, 'git status', 'rtk git status'],
  [/^git\s+diff(\s|$)/, 'git diff', 'rtk git diff'],
  [/^git\s+log(\s|$)/, 'git log', 'rtk git log'],
  [/^git\s+add(\s|$)/, 'git add', 'rtk git add'],
  [/^git\s+commit(\s|$)/, 'git commit', 'rtk git commit'],
  [/^git\s+push(\s|$)/, 'git push', 'rtk git push'],
  [/^git\s+pull(\s|$)/, 'git pull', 'rtk git pull'],
  [/^git\s+branch(\s|$)/, 'git branch', 'rtk git branch'],
  [/^git\s+fetch(\s|$)/, 'git fetch', 'rtk git fetch'],
  [/^git\s+stash(\s|$)/, 'git stash', 'rtk git stash'],
  [/^git\s+show(\s|$)/, 'git show', 'rtk git show'],
  [/^git\s+worktree(\s|$)/, 'git worktree', 'rtk git worktree'],
  // GitHub CLI (all subcommands pass through rtk gh)
  [/^gh\s+(pr|issue|run|repo|search|label|release|api|auth)(\s|$)/, 'gh ', 'rtk gh '],
  // Cargo
  [/^cargo\s+test(\s|$)/, 'cargo test', 'rtk cargo test'],
  [/^cargo\s+build(\s|$)/, 'cargo build', 'rtk cargo build'],
  [/^cargo\s+check(\s|$)/, 'cargo check', 'rtk cargo check'],
  [/^cargo\s+clippy(\s|$)/, 'cargo clippy', 'rtk cargo clippy'],
  // File operations
  [/^(env|printenv)(\s|$)/, /^(env|printenv)/, 'rtk env'],
  [/^diff\s+/, 'diff ', 'rtk diff '],
  [/^cat\s+/, 'cat ', 'rtk read '],
  [/^(rg|grep)\s+/, /^(rg|grep) /, 'rtk grep '],
  [/^ls(\s|$)/, 'ls', 'rtk ls'],
  [/^find\s+/, 'find ', 'rtk find '],
  [/^wc\s+/, 'wc ', 'rtk wc '],
  // JS/TS tooling — all `rtk err cmd /c` rules removed (exit codes swallowed + output lost, see rtk#212)
  // These tools run natively until rtk resolves .CMD wrappers on Windows
  // Containers
  [/^docker\s+(ps|images|logs)(\s|$)/, 'docker ', 'rtk docker '],
  [/^kubectl\s+(get|logs)(\s|$)/, 'kubectl ', 'rtk kubectl '],
  // Network
  [/^curl\s+/, 'curl ', 'rtk curl '],
  [/^wget\s+/, 'wget ', 'rtk wget '],
  // pnpm package management — excluded from rtk err (output lost, see rtk#212)
  // pnpm run typecheck/lint — excluded from rewrite so package.json scripts run natively
  // Python tooling
  [/^pytest(\s|$)/, 'pytest', 'rtk pytest'],
  [/^python\s+-m\s+pytest(\s|$)/, 'python -m pytest', 'rtk pytest'],
  [/^ruff\s+(check|format)(\s|$)/, 'ruff ', 'rtk ruff '],
  [/^(black|ruff\s+format)(\s|$)/, /^(black|ruff format)/, 'rtk format'],
  [/^pip\s+(list|outdated|install|show)(\s|$)/, 'pip ', 'rtk pip '],
  [/^uv\s+pip\s+(list|outdated|install|show)(\s|$)/, 'uv pip ', 'rtk pip '],
  // Go tooling
  [/^go\s+test(\s|$)/, 'go test', 'rtk go test'],
  [/^go\s+build(\s|$)/, 'go build', 'rtk go build'],
  [/^go\s+vet(\s|$)/, 'go vet', 'rtk go vet'],
  [/^golangci-lint(\s|$)/, 'golangci-lint', 'rtk golangci-lint'],
  // .NET tooling (via rtk proxy until native support lands)
  [/^dotnet\s+(build|test|run|restore|publish|clean)(\s|$)/, 'dotnet ', 'rtk proxy dotnet '],
];

// Split command on top-level shell operators (&&, ||, ;, |) respecting quotes
function splitTopLevel(cmd) {
  const segments = [];
  let i = 0,
    start = 0,
    inSingle = false,
    inDouble = false;

  while (i < cmd.length) {
    const ch = cmd[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      i++;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      i++;
    } else if (ch === '\\' && !inSingle) {
      i += 2;
    } else if (!inSingle && !inDouble) {
      let sep = null;
      if (cmd[i] === '&' && cmd[i + 1] === '&') sep = '&&';
      else if (cmd[i] === '|' && cmd[i + 1] === '|') sep = '||';
      else if (cmd[i] === ';') sep = ';';
      else if (cmd[i] === '|') sep = '|';

      if (sep) {
        segments.push(cmd.slice(start, i)); // command text
        segments.push(sep); // separator
        i += sep.length;
        start = i;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  segments.push(cmd.slice(start));
  return segments;
}

// Split compound command and rewrite each subcommand independently
function rewriteCompound(fullCmd) {
  const segments = splitTopLevel(fullCmd);
  let changed = false;

  const result = segments.map((seg, i) => {
    // Odd indices are separators (&&, ||, ;, |)
    if (i % 2 === 1) return seg;

    const trimmed = seg.trim();
    if (!trimmed) return seg;

    // Skip if this subcommand already uses rtk
    if (/^rtk\s|\/rtk\s/.test(trimmed)) return seg;

    for (const [match, find, replace] of REWRITE_RULES) {
      if (match.test(trimmed)) {
        const rewritten = trimmed.replace(
          find instanceof RegExp ? find : find,
          replace,
        );
        changed = true;
        const leading = seg.match(/^\s*/)[0];
        const trailing = seg.match(/\s*$/)[0];
        return leading + rewritten + trailing;
      }
    }
    return seg;
  });

  return changed ? result.join('') : null;
}

let rewriteInput = '';
process.stdin.on('data', (c) => {
  rewriteInput += c;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(rewriteInput);
    const cmd = (data.tool_input && data.tool_input.command) || '';
    if (!cmd) return;

    // Skip heredocs
    if (cmd.includes('<<')) return;

    const rewritten = rewriteCompound(cmd);
    if (rewritten) {
      const updatedInput = { ...data.tool_input, command: rewritten };
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            updatedInput,
          },
        }),
      );
    }
  } catch (_) {}
});
