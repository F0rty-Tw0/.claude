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
// Every heredoc operator on a line opens a body, read in order after that line (`cat <<A && cat <<B`).
// The scan resumes after the last masked body, so a `<<` inside one (C++ `cout << x`) is never searched again: linear.
const heredocRe = /(?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/g;
for (let m; (m = heredocRe.exec(cmd));) {
  const lineEnd = cmd.indexOf('\n', m.index);
  if (lineEnd < 0) break;
  const words = [m[2]];
  for (let n; (n = heredocRe.exec(cmd)) && n.index < lineEnd;) words.push(n[2]);
  let start = lineEnd + 1;
  for (const word of words) {
    const endRe = new RegExp(`\\n[ \\t]*${word}[ \\t]*(?=\\n|$)`, 'g');
    endRe.lastIndex = start - 1;
    const end = endRe.exec(cmd);
    const stop = end ? end.index : cmd.length;
    for (let i = start; i < stop; i++) chars[i] = '_';
    start = end ? endRe.lastIndex + 1 : cmd.length;
  }
  heredocRe.lastIndex = start - 1;
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

// `git [-C dir | -c k=v | --flag]… commit` at command position, after optional `VAR=x ` / env / sudo / then / `{` …
// prefixes and a path on git.
const INVOKE = new RegExp(String.raw`(?:^|[\n;&|(\`])[ \t]*(?:(?:\w+=\S*|then|do|else|!|\{|time|command|nohup|env|sudo|timeout[ \t]+\S+)[ \t]+)*` +
  String.raw`(?:[\w.~/-]*\/)?git(?:[ \t]+-[Cc][ \t]+\S+|[ \t]+--?[\w-]+(?:=\S+)?)*[ \t]+commit(?![\w-])`, 'g');
const invocations = [...masked.matchAll(INVOKE)];
if (!invocations.length) process.exit(0);

const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');
const word = (start, end) => unquote(cmd.slice(start, end));
// `$'…\n…'`, printf and `echo -e` carry `\n` escapes: also scan a copy with those decoded. Only those spans (printf /
// echo -e up to the next `;&|)` or newline), because a `\n` in a plain "…" message is a literal backslash-n.
// ponytail: raw text, not masked, so `$(printf …)` inside a quoted -m is seen; a message that mentions printf with a
// `\n` trailer in it is a false positive.
const ESCAPED = /\$'(?:\\.|[^'\\])*'|\b(?:printf|echo[ \t]+-[a-zA-Z]*e[a-zA-Z]*)\b[^\n;&|)]*/g;
const texts = [cmd, cmd.replace(ESCAPED, (s) => s.replace(/\\n/g, '\n'))];
// ponytail: only `cd` at command position earlier in this command is followed; a cd from an earlier Bash call is
// already in the hook's cwd.
const cds = [...masked.matchAll(/(?:^|[\n;&|(])[ \t]*cd[ \t]+([^\s;&|)<>]+)/dg)];
for (const inv of invocations) {
  let dir = cwd;
  for (const cd of cds.filter((c) => c.index < inv.index)) dir = path.resolve(dir, word(...cd.indices[1]));
  for (const c of inv[0].matchAll(/[ \t]-C[ \t]+(\S+)/dg)) dir = path.resolve(dir, word(inv.index + c.indices[1][0], inv.index + c.indices[1][1]));
  const argsStart = inv.index + inv[0].length;
  const stop = masked.slice(argsStart).search(/[\n;&|)`]/);
  const args = [...masked.slice(argsStart, stop < 0 ? masked.length : argsStart + stop).matchAll(/\S+/g)];
  // `args` come from the masked copy, so a `--trailer=` or `-F` written inside a quoted message is not an argument.
  args.forEach((t, i) => {
    const flag = t[0].match(/^(?:--file(?:=|$)|-F|--trailer(?:=|$))/);
    if (!flag) return;
    const inline = t[0].length > flag[0].length;
    const next = args[i + 1];
    const range = inline ? [argsStart + t.index + flag[0].length, argsStart + t.index + t[0].length]
      : next && [argsStart + next.index, argsStart + next.index + next[0].length];
    const value = range && word(...range);
    if (!value) return;
    // git takes `key=value` as well as `key: value`.
    if (flag[0].startsWith('--trailer')) { texts.push(value.replace(/^([\w-]+)[ \t]*=/, '$1:')); return; }
    if (value === '-') return;
    try { texts.push(fs.readFileSync(path.resolve(dir, value), 'utf8')); } catch { /* unreadable: fail open */ }
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
