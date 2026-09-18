// nul-guard hook for Claude Code PreToolUse:Bash
// Prevents creation of "nul" files by rewriting Windows-style redirections
// to their Unix equivalents.
//
// Problem: The model sometimes emits `2>nul` (Windows CMD syntax) in bash,
// which creates a literal file named "nul" instead of discarding output.
//
// Rewrites:
//   2>nul   → 2>/dev/null
//   >nul    → >/dev/null
//   1>nul   → 1>/dev/null
//   2>>nul  → 2>>/dev/null  (append variant, rare but possible)

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cmd = (data.tool_input && data.tool_input.command) || '';
    if (!cmd) return;

    // Match: optional fd digit, > or >>, optional whitespace, "nul" as whole word
    // \b ensures we don't match "null", "nulcheck.log", etc.
    const nulPattern = /(\d?>>?)\s*\bnul\b/g;

    if (!nulPattern.test(cmd)) return;

    // Reset lastIndex after .test()
    nulPattern.lastIndex = 0;
    const rewritten = cmd.replace(nulPattern, '$1/dev/null');

    const updatedInput = { ...data.tool_input, command: rewritten };
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput
      }
    }));
  } catch (_) {}
});
