// RTK auto-rewrite hook for Claude Code PreToolUse:Bash
// Delegates all rewrite logic to `rtk rewrite` (single source of truth).
// Requires: rtk >= 0.23.0

const { execFileSync } = require('child_process');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cmd = data.tool_input?.command || '';
    if (!cmd || cmd.includes('<<')) return;

    // Delegate to rtk rewrite — exits 1 if no rewrite available
    const rewritten = execFileSync('rtk', ['rewrite', cmd], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    if (!rewritten || rewritten === cmd) return;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { ...data.tool_input, command: rewritten },
      },
    }));
  } catch (_) {
    // rtk rewrite exits 1 for no-rewrite or rtk not found — pass through silently
  }
});
