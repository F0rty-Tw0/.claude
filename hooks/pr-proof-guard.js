#!/usr/bin/env node
// PreToolUse guard: blocks `gh pr create|new` / `gh pr edit --body…` unless the PR body has a `## Proof` heading.
// Enforces "every PR ships with proof" (code-review skill, proof mode) mechanically instead of by prose.
// ponytail: checks the heading exists, not that the proof is real — the code-review reviewer judges content.
// ponytail: catches a forgotten proof, not deliberate evasion (eval, shell aliases, `"$(gh pr create)"` inside quotes).
const fs = require('fs');
const os = require('os');
const path = require('path');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { process.exit(0); }
const cmd = String((input.tool_input || {}).command || '');
const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();

// Masked copy of cmd, same length: heredoc bodies, quoted text and comments become `_`, so only real shell syntax is left.
const chars = cmd.split('');
const heredocs = []; // [start, end) of each heredoc body in cmd, found by its delimiter line, not by quote matching
// ponytail: a `<<word` inside a quoted string is misread as a heredoc; harmless unless a later line equals `word`.
const heredocRe = /(?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/g;
for (let m; (m = heredocRe.exec(cmd));) {
  const start = cmd.indexOf('\n', m.index) + 1;
  if (start === 0) break;
  const endRe = new RegExp(`\\n[ \\t]*${m[2]}[ \\t]*(?=\\n|$)`, 'g');
  endRe.lastIndex = start - 1;
  const end = endRe.exec(cmd);
  heredocs.push({ start, end: end ? end.index : cmd.length });
  const maskEnd = end ? endRe.lastIndex : cmd.length;
  for (let i = start; i < maskEnd; i++) chars[i] = '_';
  heredocRe.lastIndex = maskEnd;
}
for (let i = 0, quote = ''; i < chars.length; i++) {
  const c = chars[i];
  if (quote) {
    if (c === quote) quote = '';
    else { chars[i] = '_'; if (c === '\\' && quote === '"' && i + 1 < chars.length) chars[++i] = '_'; }
  } else if (c === '\\') i++;
  else if (c === "'" || c === '"') quote = c;
  else if (c === '#' && (i === 0 || /[\s;&|(]/.test(chars[i - 1]))) {
    for (; i < chars.length && chars[i] !== '\n'; i++) chars[i] = '_';
  }
}
const masked = chars.join('');

const unquote = (s) => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      const close = s.indexOf("'", i + 1) < 0 ? s.length : s.indexOf("'", i + 1);
      out += s.slice(i + 1, close);
      i = close;
    } else if (c === '"') {
      for (i++; i < s.length && s[i] !== '"'; i++) out += s[i] === '\\' && '"\\$`'.includes(s[i + 1]) ? s[++i] : s[i];
    } else if (c === '\\') out += s[++i] || '';
    else out += c;
  }
  return out;
};
const expandHome = (p) => p.replace(/^~(?=\/|$)/, os.homedir());

const cd = masked.match(/^[ \t]*cd[ \t]+(\S+)[ \t]*&&/d);
const baseDir = path.resolve(cwd, cd ? expandHome(unquote(cmd.slice(...cd.indices[1]))) : '.');

const hasProof = (text) => /^[ \t]*## Proof\b/m.test(text);
const HOW = 'Pass the full body via a heredoc (--body "$(cat <<\'EOF\' ... EOF)") or --body-file — a `\\n` inside quotes ' +
  'is not a newline. Relative --body-file paths resolve against the session cwd.';
const NO_PROOF = 'pr-proof-guard: PR body has no `## Proof` section. Load the pr-description skill: its Step 0 builds proof ' +
  'with the code-review skill (proof mode + fresh review) and appends `## Proof`. ' + HOW;

// `gh pr create|new|edit` at command position: start, newline, `;`, `&&`, `||`, `|`, `(`, `$(`, backtick,
// after optional `VAR=x ` assignments, `rtk ` / `rtk proxy `, a path prefix on gh, and `-R x` / `--repo x` global flags.
const INVOKE = /(?:^|[\n;&|(`])[ \t]*(?:\w+=\S*[ \t]+)*(?:rtk[ \t]+(?:proxy[ \t]+)?)?(?:[\w.~/-]*\/)?gh(?:[ \t]+(?:-R|--repo)(?:=|[ \t]+)\S+)*[ \t]+pr[ \t]+(?<verb>create|new|edit)(?![\w-])/g;

// Returns the block message for one invocation, or '' when it may run.
const check = (inv) => {
  const argsStart = inv.index + inv[0].length;
  const stop = masked.slice(argsStart).search(/[\n;&|)`]/);
  const argsEnd = stop < 0 ? masked.length : argsStart + stop;
  const tokens = [...masked.slice(argsStart, argsEnd).matchAll(/\S+/g)]
    .map((t) => ({ start: argsStart + t.index, end: argsStart + t.index + t[0].length, flag: t[0] }));
  if (tokens.some((t) => t.flag === '--help' || t.flag === '-h')) return '';

  let source = null; // last body flag wins, like gh's flag parser
  tokens.forEach((t, i) => {
    const long = t.flag.match(/^--body(-file)?(=|$)/);
    const short = t.flag.match(/^-([bF])/);
    if (long) source = { isFile: Boolean(long[1]), range: long[2] ? { start: t.start + long[0].length, end: t.end } : tokens[i + 1] };
    else if (short) source = { isFile: short[1] === 'F', range: t.flag.length > 2 ? { start: t.start + 2, end: t.end } : tokens[i + 1] };
  });
  if (!source) return inv.groups.verb === 'edit' ? '' : NO_PROOF; // an edit that doesn't touch the body is fine

  const { start, end } = source.range || { start: argsEnd, end: argsEnd };
  const inHeredoc = heredocs.filter((h) => h.start >= start && h.end <= end);
  if (inHeredoc.length) return hasProof(inHeredoc.map((h) => cmd.slice(h.start, h.end)).join('\n')) ? '' : NO_PROOF;

  let value = unquote(cmd.slice(start, end));
  const catFile = !source.isFile && value.match(/^\$\(\s*cat\s+([^)]+?)\s*\)$/);
  if (!source.isFile && !catFile) return hasProof(value) ? '' : NO_PROOF;
  if (catFile) value = unquote(catFile[1]);

  if (value === '-') { // body from stdin: look for the heading in the rest of the command (a pipe source or heredoc)
    const outside = cmd.slice(0, inv.index) + '\n' + cmd.slice(argsEnd);
    return /(^|['"])[ \t]*## Proof\b/m.test(outside) ? '' : NO_PROOF;
  }
  if (value.includes('$')) return `pr-proof-guard: cannot resolve body file path \`${value}\` (it expands a variable). Pass a literal path. ${HOW}`;
  const file = path.resolve(baseDir, expandHome(value));
  let body = '';
  try { body = fs.readFileSync(file, 'utf8'); } catch { return `pr-proof-guard: cannot read body file ${file}. ${HOW}`; }

  return hasProof(body) ? '' : NO_PROOF;
};

for (const inv of masked.matchAll(INVOKE)) {
  const message = check(inv);
  if (message) { process.stderr.write(message); process.exit(2); }
}
process.exit(0);
