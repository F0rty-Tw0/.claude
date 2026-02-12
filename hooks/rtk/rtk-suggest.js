// RTK suggest hook for Claude Code PreToolUse:Bash
// Emits system reminders when rtk-compatible commands are detected.
// Outputs JSON with systemMessage to inform Claude Code without modifying execution.

const RULES = [
  // Git commands
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
  // GitHub CLI
  [/^gh\s+(pr|issue|run)(\s|$)/, 'gh ', 'rtk gh '],
  // Cargo
  [/^cargo\s+test(\s|$)/, 'cargo test', 'rtk cargo test'],
  [/^cargo\s+build(\s|$)/, 'cargo build', 'rtk cargo build'],
  [/^cargo\s+clippy(\s|$)/, 'cargo clippy', 'rtk cargo clippy'],
  // File operations
  [/^cat\s+/, 'cat ', 'rtk read '],
  [/^(rg|grep)\s+/, /^(rg|grep) /, 'rtk grep '],
  [/^ls(\s|$)/, 'ls', 'rtk ls'],
  // JS/TS tooling
  [/^(pnpm\s+)?vitest(\s|$)/, /^(pnpm )?vitest/, 'rtk vitest run'],
  [/^pnpm\s+test(\s|$)/, 'pnpm test', 'rtk vitest run'],
  [/^pnpm\s+tsc(\s|$)/, 'pnpm tsc', 'rtk tsc'],
  [/^(npx\s+)?tsc(\s|$)/, /^(npx )?tsc/, 'rtk tsc'],
  [/^pnpm\s+lint(\s|$)/, 'pnpm lint', 'rtk lint'],
  [/^(npx\s+)?eslint(\s|$)/, /^(npx )?eslint/, 'rtk lint'],
  [/^(npx\s+)?prettier(\s|$)/, /^(npx )?prettier/, 'rtk prettier'],
  [/^(npx\s+)?playwright(\s|$)/, /^(npx )?playwright/, 'rtk playwright'],
  [/^pnpm\s+playwright(\s|$)/, 'pnpm playwright', 'rtk playwright'],
  [/^(npx\s+)?prisma(\s|$)/, /^(npx )?prisma/, 'rtk prisma'],
  // Containers
  [/^docker\s+(ps|images|logs)(\s|$)/, 'docker ', 'rtk docker '],
  [/^kubectl\s+(get|logs)(\s|$)/, 'kubectl ', 'rtk kubectl '],
  // Network
  [/^curl\s+/, 'curl ', 'rtk curl '],
  // pnpm package management
  [/^pnpm\s+(list|ls|outdated)(\s|$)/, 'pnpm ', 'rtk pnpm '],
  // Python tooling
  [/^pytest(\s|$)/, 'pytest', 'rtk pytest'],
  [/^python\s+-m\s+pytest(\s|$)/, 'python -m pytest', 'rtk pytest'],
  [/^ruff\s+(check|format)(\s|$)/, 'ruff ', 'rtk ruff '],
  [/^pip\s+(list|outdated|install|show)(\s|$)/, 'pip ', 'rtk pip '],
  [/^uv\s+pip\s+(list|outdated|install|show)(\s|$)/, 'uv pip ', 'rtk pip '],
  // Go tooling
  [/^go\s+test(\s|$)/, 'go test', 'rtk go test'],
  [/^go\s+build(\s|$)/, 'go build', 'rtk go build'],
  [/^go\s+vet(\s|$)/, 'go vet', 'rtk go vet'],
  [/^golangci-lint(\s|$)/, 'golangci-lint', 'rtk golangci-lint'],
];

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cmd = (data.tool_input && data.tool_input.command) || '';
    if (!cmd) return;

    // Skip if already using rtk
    if (/^rtk\s|\/rtk\s/.test(cmd)) return;
    // Skip heredocs
    if (cmd.includes('<<')) return;

    for (const [match, find, replace] of RULES) {
      if (match.test(cmd)) {
        const suggestion = cmd.replace(find instanceof RegExp ? find : find, replace);
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            systemMessage: `\u26A1 RTK available: \`${suggestion}\` (60-90% token savings)`
          }
        }));
        return;
      }
    }
  } catch (_) {}
});
