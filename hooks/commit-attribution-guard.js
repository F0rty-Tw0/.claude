#!/usr/bin/env node
// PreToolUse guard: blocks `git commit` when its message carries Claude attribution (`Co-Authored-By: Claude…` /
// `…noreply@anthropic.com`, `Claude-Session:`, a claude.ai/code session URL). settings.json `attribution` is empty,
// but cloud prompts and old habits still add these lines, so the rule is enforced here instead of by prose.
// Message sources: the whole command text (-m, --message, heredoc) plus a literal -F / --file path.
// ponytail: messages built via variables or eval, and git merge/rebase messages, are not seen.
const fs = require('fs');
const path = require('path');

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { process.exit(0); }
const cmd = String((input.tool_input || {}).command || '');
const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();

// Masked copy of cmd, same length: heredoc bodies and quoted text become `_`, so only real shell syntax is left
// and `echo "git commit"` is not read as a commit.
const chars = cmd.split('');
for (const m of cmd.matchAll(/(?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/g)) {
  const start = cmd.indexOf('\n', m.index) + 1;
  if (start === 0) break;
  const end = new RegExp(`\\n[ \\t]*${m[2]}[ \\t]*(?=\\n|$)`).exec(cmd.slice(start - 1));
  const stop = end ? start - 1 + end.index : cmd.length;
  for (let i = start; i < stop; i++) chars[i] = '_';
}
for (let i = 0, quote = ''; i < chars.length; i++) {
  const c = chars[i];
  if (quote) {
    if (c === quote) quote = '';
    else { chars[i] = '_'; if (c === '\\' && quote === '"' && i + 1 < chars.length) chars[++i] = '_'; }
  } else if (c === '\\') i++;
  else if (c === "'" || c === '"') quote = c;
}
const masked = chars.join('');

// `git [-C dir | -c k=v | --flag]… commit` at command position, after optional `VAR=x ` prefixes and a path on git.
const INVOKE = /(?:^|[\n;&|(`])[ \t]*(?:\w+=\S*[ \t]+)*(?:[\w.~/-]*\/)?git(?:[ \t]+-[Cc][ \t]+\S+|[ \t]+--?[\w-]+(?:=\S+)?)*[ \t]+commit(?![\w-])/g;
const invocations = [...masked.matchAll(INVOKE)];
if (!invocations.length) process.exit(0);

const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');
const texts = [cmd];
for (const inv of invocations) {
  const argsStart = inv.index + inv[0].length;
  const stop = masked.slice(argsStart).search(/[\n;&|)`]/);
  const args = [...masked.slice(argsStart, stop < 0 ? masked.length : argsStart + stop).matchAll(/\S+/g)];
  args.forEach((t, i) => {
    const flag = t[0].match(/^(?:--file(?:=|$)|-F)/);
    if (!flag) return;
    const inline = t[0].length > flag[0].length;
    const next = args[i + 1];
    const range = inline ? [argsStart + t.index + flag[0].length, argsStart + t.index + t[0].length]
      : next && [argsStart + next.index, argsStart + next.index + next[0].length];
    const file = range && unquote(cmd.slice(...range));
    if (!file || file === '-') return;
    try { texts.push(fs.readFileSync(path.resolve(cwd, file), 'utf8')); } catch { /* unreadable: fail open */ }
  });
}

const TRAILER = /(?:^|['"])[ \t]*((?:Co-Authored-By:[^\n]*(?:Claude|noreply@anthropic\.com)|Claude-Session:)[^\n'"]*)|(claude\.ai\/code\/session_[^\s'"]*)/im;
for (const text of texts) {
  const hit = TRAILER.exec(text);
  if (!hit) continue;
  process.stderr.write(`commit-attribution-guard: the commit message carries Claude attribution: \`${(hit[1] || hit[2]).trim()}\`. ` +
    'Attribution is off (settings.json `attribution.commit` is empty): remove every `Co-Authored-By: Claude…` and ' +
    '`Claude-Session:` line from the message, then run the commit again.');
  process.exit(2);
}
process.exit(0);
