#!/usr/bin/env node
// PreToolUse guard: blocks `git commit` / `git push` unless explicitly authorized.
// Enforces the AGENTS.md law "NEVER git commit or push unless the user explicitly asks
// in the current request" mechanically instead of by prose.
//
// Authorization: when (and only when) the user has explicitly asked to commit/push,
// create the one-shot flag first:  touch ~/.claude/.allow-commit-$CLAUDE_CODE_SESSION_ID
// The flag is consumed (deleted) on first use — one flag per commit/push.
// The flag is per session: a single shared flag let a concurrent session's commit
// spend another session's authorization.
const fs = require('fs');
const path = require('path');
const os = require('os');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
let input;
try { input = JSON.parse(raw) || {}; } catch { process.exit(0); }
const cmd = (input.tool_input || {}).command || '';

// matches `git commit`, `git push`, `rtk git commit`, `/usr/bin/git commit`, `git -c k=v commit`, `git -C x push`, etc.
// deliberately NOT matching commit-ish read ops (log/show/diff) or `commit` in prose args after -m
const isGuarded = /(^|[;&|]\s*|\s)(rtk\s+)?(\S*\/)?git(\s+-[Cc]\s+\S+|\s+-[A-Za-z]\S*|\s+--\S+)*\s+(commit|push)\b/.test(cmd);
if (!isGuarded) process.exit(0);

const session = input.session_id || '';
if (/^[\w-]+$/.test(session)) { // also keeps the flag path inside ~/.claude
  // the unlink is the check: a directory or a flag a parallel call already took stays blocked
  try {
    fs.unlinkSync(path.join(os.homedir(), '.claude', `.allow-commit-${session}`));
    process.exit(0); // authorized — flag consumed
  } catch {}
}
process.stderr.write(
  'commit-guard: git commit/push blocked. If the USER explicitly asked for this in the current request, ' +
  'load the meaningful-commits skill (commit) or open-pr skill (PR), then ' +
  'run `touch ~/.claude/.allow-commit-$CLAUDE_CODE_SESSION_ID` in a separate Bash call and retry (flag is one-shot). If they did not ask, do not commit.'
);
process.exit(2);
