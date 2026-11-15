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
//
// Left alone: a file whose name only starts with nul (`>nul.txt`,
// `>nul-guard.log`, `>nulcheck.log`, `>null`), and anything inside single or
// double quotes, where `cmd /c "ping -n 2 127.0.0.1 >nul"` means cmd.exe's NUL.

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cmd = (data.tool_input && data.tool_input.command) || '';
    if (!cmd) return;

    // One pass, left to right. A backslash-escaped character or a quoted span
    // matches first and is put back as it was. What is left to match is a redirect
    // (optional fd digit, > or >>, optional whitespace) to the word "nul", which
    // must end there: at whitespace, a shell operator, or the end of the command.
    const nulPattern = /\\[\s\S]|"(?:[^"\\]|\\[\s\S])*"|'[^']*'|(\d?>>?)\s*nul(?=[\s;&|()<>`]|$)/g;
    const rewritten = cmd.replace(nulPattern, (match, redirect) => (redirect ? `${redirect}/dev/null` : match));
    if (rewritten === cmd) return;

    const updatedInput = { ...data.tool_input, command: rewritten };
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput
      }
    }));
  } catch (_) {}
});
