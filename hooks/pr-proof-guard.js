#!/usr/bin/env node
// PreToolUse guard: blocks `gh pr create|new` / `gh pr edit --body…` unless the PR body has a `## Proof` heading
// with a before/after pair under it (Before:/After: lines or a `| Before | After |` table).
// Enforces "every PR ships with proof" (code-review skill, proof mode) mechanically instead of by prose.
// ponytail: checks the heading and pair markers exist, not that the proof is real — the code-review reviewer judges content.
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
const heredocs = []; // operator index and [start, end) body of each heredoc in cmd, found by its delimiter line, not by quote matching
// ponytail: a `<<word` inside quotes or `$((1<<x))` is misread as a heredoc; one with no `word` line masks nothing,
// so it only hides text when a later line happens to equal `word`.
const heredocRe = /(?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/g;
// A word with no delimiter line after one `<<word` has none after any later one, so it is never searched again.
// ponytail: still one full scan per distinct unterminated word; fine for real commands.
const unterminated = new Set();
for (let m; (m = heredocRe.exec(cmd));) {
  const start = cmd.indexOf('\n', m.index) + 1;
  if (start === 0) break;
  if (unterminated.has(m[2])) continue;
  const endRe = new RegExp(`\\n[ \\t]*${m[2]}[ \\t]*(?=\\n|$)`, 'g');
  endRe.lastIndex = start - 1;
  const end = endRe.exec(cmd);
  if (!end) { unterminated.add(m[2]); continue; }
  heredocs.push({ op: m.index, start, end: end.index });
  for (let i = start; i < endRe.lastIndex; i++) chars[i] = '_';
  heredocRe.lastIndex = endRe.lastIndex;
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

const cd = masked.match(/^[ \t]*cd[ \t]+([^\s;&]+)[ \t]*(?:&&|;)/d);
const baseDir = path.resolve(cwd, cd ? expandHome(unquote(cmd.slice(...cd.indices[1]))) : '.');

// The Proof section runs from its heading to the next `## ` heading outside a code fence (output may print markdown).
// A pair is a `| … Before | After |` table row, or a line starting (after bullets/bold/quote marks) with `Before:` and
// one with `After:`, a parenthetical allowed before the colon (`Before (base abc123):`); prose like "after the fix" is not.
const PROOF_HEADING = /^[ \t]*## Proof\b/m;
const pairLine = (word) => new RegExp(String.raw`^[ \t>*|-]*${word}\b(?:\*\*)?(?:[ \t]*\([^)\n]*\))?[ \t]*[:|]`, 'im');
const hasPair = (text) => {
  const lines = text.slice(text.search(PROOF_HEADING)).split('\n');
  let inFence = false;
  const end = lines.findIndex((line, i) => {
    if (/^[ \t]*(```|~~~)/.test(line)) inFence = !inFence;

    return i > 0 && !inFence && /^[ \t]*## /.test(line);
  });
  const section = (end < 0 ? lines : lines.slice(0, end)).join('\n');

  return /^[ \t]*\|.*\bBefore\b.*\|.*\bAfter\b/im.test(section) || (pairLine('Before').test(section) && pairLine('After').test(section));
};
const HOW = 'Pass the full body via a heredoc, with the delimiter alone on its line and `)"` on the next:\n' +
  '--body "$(cat <<\'EOF\'\n...\nEOF\n)"\n' +
  'or via --body-file — a `\\n` inside quotes is not a newline. Relative --body-file paths resolve against the session cwd.';
const NO_PROOF = 'pr-proof-guard: PR body has no `## Proof` section. Load the pr-description skill: its Step 0 builds proof ' +
  'with the code-review skill (proof mode + fresh review) and appends `## Proof`. ' + HOW;
const NO_PAIR = 'pr-proof-guard: `## Proof` has no before/after pair. Every PR shows the change running, not the code it adds: ' +
  'a `Before:` line and an `After:` line (screenshot, CLI or console output of the real thing on base vs head), or a ' +
  '`| Before | After |` table. Test-runner output alone does not count. Base not capturable → `Before: not captured — <why>` ' +
  'and list it under Not verified. See code-review references/proof.md, Before/after pair. ' + HOW;
// Returns the block message for a body, or '' when it may run.
const proofGap = (text) => (!PROOF_HEADING.test(text) ? NO_PROOF : hasPair(text) ? '' : NO_PAIR);

// `gh pr create|new|edit` at command position: start, newline, `;`, `&&`, `||`, `|`, `(`, `$(`, backtick,
// after optional repeatable `VAR=x ` / `then` / `do` / `else` / `!` / `{` / `time` / `command` / `nohup` / `env` /
// `timeout N` / `sudo` prefixes, `rtk ` / `rtk proxy `, a path prefix on gh, and `-R x` / `--repo x` before or after `pr`.
const REPO_FLAGS = String.raw`(?:[ \t]+(?:-R|--repo)(?:=|[ \t]+)\S+)*`;
const INVOKE = new RegExp(String.raw`(?:^|[\n;&|(\`])[ \t]*(?:(?:\w+=\S*|then|do|else|!|\{|time|command|nohup|env|timeout[ \t]+\d\S*|sudo)[ \t]+)*` +
  String.raw`(?:rtk[ \t]+(?:proxy[ \t]+)?)?(?:[\w.~/-]*\/)?gh${REPO_FLAGS}[ \t]+pr${REPO_FLAGS}[ \t]+(?<verb>create|new|edit)(?![\w-])`, 'g');

// Last stdin redirect (`<<<word`, `<<word`, `<word`) in masked[start, end), or null.
const lastStdinRedirect = (start, end) => {
  const last = [...masked.slice(start, end).matchAll(/(?<![<\d])(<<<|<<-?|<)(?![<&(])[ \t]*(\S*)/dg)].at(-1);
  if (!last) return null;

  return { index: start + last.index, op: last[1], word: unquote(cmd.slice(start + last.indices[2][0], start + last.indices[2][1])) };
};

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
  if (inHeredoc.length) return proofGap(inHeredoc.map((h) => cmd.slice(h.start, h.end)).join('\n'));

  let value = unquote(cmd.slice(start, end));
  const catFile = !source.isFile && value.match(/^\$\(\s*cat\s+([^)\n]+?)\s*\)$/);
  if (!source.isFile && !catFile) return proofGap(value);
  if (catFile) value = unquote(catFile[1]);

  let scanEnd = inv.index; // earlier mentions of the body file are looked for before here
  if (value === '-') { // body from stdin: judge only this invocation's own stdin, never proof elsewhere in the command
    // a `||` gives an empty pipe source: the backward search stops at its first `|`
    const pipeStart = masked[inv.index] === '|' ? Math.max(...[...'\n;&|(`'].map((c) => masked.lastIndexOf(c, inv.index - 1))) + 1 : inv.index;
    const redirect = lastStdinRedirect(argsStart, argsEnd) || lastStdinRedirect(pipeStart, inv.index);
    const catSource = masked.slice(pipeStart, inv.index).match(/^[ \t]*cat[ \t]+(\S+)[ \t]*$/d);
    const printfSource = masked.slice(pipeStart, inv.index).match(/^[ \t]*printf[ \t]+/);
    scanEnd = pipeStart; // the pipe source reading the file (`cat pr.md |`) is not a stale write
    if (redirect?.op === '<<<') return proofGap(redirect.word);
    if (redirect && redirect.op !== '<') {
      const heredoc = heredocs.find((h) => h.op === redirect.index);
      return heredoc ? proofGap(cmd.slice(heredoc.start, heredoc.end)) : NO_PROOF;
    }
    if (redirect) value = redirect.word;
    else if (catSource) value = unquote(cmd.slice(pipeStart + catSource.indices[1][0], pipeStart + catSource.indices[1][1]));
    else if (printfSource) {
      return proofGap(unquote(cmd.slice(pipeStart + printfSource[0].length, inv.index)).replace(/\\n/g, '\n'));
    } else {
      const raw = cmd.slice(pipeStart, inv.index);
      const heading = /(^|['"])[ \t]*## Proof\b/m.exec(raw);

      return heading ? proofGap(raw.slice(heading.index + heading[1].length)) : NO_PROOF;
    }
  }
  if (value.includes('$')) return `pr-proof-guard: cannot resolve body file path \`${value}\` (it expands a variable). Pass a literal path. ${HOW}`;
  const file = path.resolve(baseDir, expandHome(value));
  // The hook runs before the command, so a body file created or changed earlier in this same command (>, tee, cp, mv,
  // sed -i, ...) is read stale or missing. ponytail: any earlier mention of the path counts, so a harmless
  // `ls pr.md && gh pr create -F pr.md` also blocks; the message says how to fix it, which beats a silent wrong allow.
  const mentions = [...masked.slice(0, scanEnd).matchAll(/[^\s;&|()<>`]+/dg)];
  if (mentions.some((w) => path.resolve(baseDir, expandHome(unquote(cmd.slice(...w.indices[0])))) === file)) {
    return `pr-proof-guard: this command touches ${file} before gh reads it. Write the body file in a separate Bash call — ` +
      'the hook reads it before your command runs.';
  }
  let body = '';
  try { body = fs.readFileSync(file, 'utf8'); } catch { return `pr-proof-guard: cannot read body file ${file}. ${HOW}`; }

  return proofGap(body);
};

for (const inv of masked.matchAll(INVOKE)) {
  const message = check(inv);
  if (!message) continue;
  const pushNote = /\bgit[ \t]+push\b/.test(masked)
    ? "\ncommit-guard's one-shot flag was already spent; re-touch it only if the user's request still covers the push." : '';
  process.stderr.write(message + pushNote);
  process.exit(2);
}
process.exit(0);
