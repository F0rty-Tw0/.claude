#!/usr/bin/env node
// PreToolUse guard: blocks `git commit` / `git push` unless explicitly authorized.
// Enforces the AGENTS.md law "NEVER git commit or push unless the user explicitly asks
// in the current request" mechanically instead of by prose.
//
// Authorization: when (and only when) the user has explicitly asked to commit/push,
// create the one-shot flag first:  touch ~/.claude/.allow-commit
// The flag is consumed (deleted) on first use — one flag per commit/push.
const fs = require('fs');
const path = require('path');
const os = require('os');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
let cmd = '';
try { cmd = (JSON.parse(raw).tool_input || {}).command || ''; } catch { process.exit(0); }

// matches `git commit`, `git push`, `rtk git commit`, `git -C x push`, etc.
// deliberately NOT matching commit-ish read ops (log/show/diff) or `commit` in prose args after -m
const isGuarded = /(^|[;&|]\s*|\s)(rtk\s+)?git(\s+-[A-Za-z]\S*|\s+--\S+|\s+-C\s+\S+)*\s+(commit|push)\b/.test(cmd);
if (!isGuarded) process.exit(0);

const flag = path.join(os.homedir(), '.claude', '.allow-commit');
if (fs.existsSync(flag)) {
  try { fs.unlinkSync(flag); } catch {}
  process.exit(0); // authorized — flag consumed
}
process.stderr.write(
  'commit-guard: git commit/push blocked. If the USER explicitly asked for this in the current request, ' +
  'run `touch ~/.claude/.allow-commit` and retry (flag is one-shot). If they did not ask, do not commit.'
);
process.exit(2);
