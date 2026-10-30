#!/usr/bin/env node
// PreToolUse guard: blocks `gh pr create|new` / `gh pr edit --body…` unless the PR body has a `## Proof` heading
// with a before/after pair under it (Before:/After: lines or a `| Before | After |` table), plus screenshots whose local
// paths are all passed to --attach, or a `No screenshots: <why>` line.
// `gh pr create|new` also needs <= 800 counted changed lines vs its base, or a `Size-exempt: <reason>` body line.
// Enforces "every PR ships with proof" (code-review skill, proof mode) mechanically instead of by prose.
// ponytail: checks the heading and pair markers exist, not that the proof is real — the code-review reviewer judges content.
// ponytail: catches a forgotten proof, not deliberate evasion (eval, shell aliases, `"$(gh pr create)"` inside quotes).
const { spawnSync } = require('child_process');
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
// Bash expands ~ from $HOME; os.homedir() reads USERPROFILE on Windows, which can differ.
const expandHome = (p) => p.replace(/^~(?=\/|$)/, process.env.HOME || os.homedir());
// The shell, not this hook, owns $PWD / $OLDPWD (they follow the session's cd) and any variable the command assigns
// before `end` (NAME=, NAME+=, export/local/declare/typeset NAME=, for NAME in, read/mapfile/printf -v/unset … NAME).
// ponytail: `source`, `eval` and shell functions can assign too and are not seen.
// The first assignment's end is found once per name, so a long command with many `$VAR` words stays linear.
const assignedAt = new Map();
const shellOwned = (name, end) => {
  if (name === 'PWD' || name === 'OLDPWD') return true;
  if (!assignedAt.has(name)) {
    const m = new RegExp(String.raw`(?:^|[\s;&|(\`{])${name}\+?=|\b(?:for|select)[ \t]+${name}\b|` +
      String.raw`\b(?:read|readarray|mapfile|printf|getopts|unset)\b[^\n;&|]*?[ \t]${name}\b`).exec(masked);
    assignedAt.set(name, m ? m.index + m[0].length : Infinity);
  }

  return assignedAt.get(name) <= end;
};
// ponytail: this is Claude Code's environment, which can differ from the Bash shell's; a variable set only inside the
// shell, or owned by it, stays unresolved and is rejected below.
const expandEnv = (p, end) => p.replace(/\$(?:\{(\w+)\}|(\w+))/g, (m, a, b) => (shellOwned(a ?? b, end) ? m : process.env[a ?? b] ?? m));
const resolvePath = (p, end) => expandEnv(shellOwned('HOME', end) ? p.replace(/^~(?=\/|$)/, '$HOME') : expandHome(p), end);

const cd = masked.match(/^[ \t]*cd[ \t]+([^\s;&]+)[ \t]*(?:&&|;)/d);
const baseDir = path.resolve(cwd, cd ? resolvePath(unquote(cmd.slice(...cd.indices[1])), cd.index) : '.');

// The Proof section runs from its heading to the next `## ` heading outside a code fence (output may print markdown).
// A pair is a `| … Before | After |` table row, or a line starting (after bullets/bold/quote marks) with `Before:` and
// one with `After:`, a parenthetical allowed before the colon (`Before (base abc123):`); prose like "after the fix" is not.
const PROOF_HEADING = /^[ \t]*## Proof\b/m;
const pairLine = (word) => new RegExp(String.raw`^[ \t>*|-]*${word}\b(?:\*\*)?(?:[ \t]*\([^)\n]*\))?[ \t]*[:|]`, 'im');
const proofSection = (text) => {
  const lines = text.slice(text.search(PROOF_HEADING)).split('\n');
  let inFence = false;
  const end = lines.findIndex((line, i) => {
    if (/^[ \t]*(```|~~~)/.test(line)) inFence = !inFence;

    return i > 0 && !inFence && /^[ \t]*## /.test(line);
  });

  return (end < 0 ? lines : lines.slice(0, end)).join('\n');
};
const hasPair = (section) =>
  /^[ \t]*\|.*\bBefore\b.*\|.*\bAfter\b/im.test(section) || (pairLine('Before').test(section) && pairLine('After').test(section));
// The section also shows screenshots (`![alt](target)` / `<img src=target>`) or says why it has none in a
// `No screenshots: <why>` line. gh rewrites only the body paths passed to --attach, so every local target needs one.
const IMAGE = /!\[[^\]\n]*\]\([ \t]*<?([^)\s>]+)|<img\b[^>\n]*\bsrc[ \t]*=[ \t]*["']?([^"'\s>]+)/gi;
const OPT_OUT = /^[ \t>*|-]*No screenshots\b(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*\S/im;
const ATTACH_HOW = 'Reference each screenshot in the body by a path and pass that same path to --attach, one flag per file:\n' +
  'gh pr create --attach <scratch>/pr-shots/<screen>-before.png --attach <scratch>/pr-shots/<screen>-after.png --body-file pr.md\n' +
  'with `![<screen> after](<scratch>/pr-shots/<screen>-after.png)` in the body. Re-send the same --attach flags on every ' +
  'later `gh pr edit` that sends a body. See code-review references/proof.md, Screenshots.';
const NO_SHOTS = 'pr-proof-guard: `## Proof` has no screenshot. Add the before/after screenshots as Markdown images, or, when ' +
  'no screen changed (lib-only, CLI-only), a line `No screenshots: <why>` with a non-empty reason. ' + ATTACH_HOW;
const shotGap = (section, attached) => {
  const targets = [...section.matchAll(IMAGE)].map((m) => m[1] || m[2]);
  if (!targets.length) return OPT_OUT.test(section) ? '' : NO_SHOTS;
  const unattached = targets.filter((t) => !/^https?:\/\//i.test(t) && !attached.includes(t));
  if (!unattached.length) return '';

  return `pr-proof-guard: screenshot ${unattached.join(', ')} is a local path with no matching --attach flag, so the image ` +
    'breaks on GitHub. ' + ATTACH_HOW;
};
const HOW = 'Pass the full body via a heredoc, with the delimiter alone on its line and `)"` on the next:\n' +
  '--body "$(cat <<\'EOF\'\n...\nEOF\n)"\n' +
  'or via --body-file — a `\\n` inside quotes is not a newline. Relative --body-file paths resolve against the session cwd.';
const NO_PROOF = 'pr-proof-guard: PR body has no `## Proof` section. Load the open-pr skill: its Step 0 builds proof ' +
  'with the code-review skill (proof mode + fresh review) and appends `## Proof`. ' + HOW;
const NO_PAIR = 'pr-proof-guard: `## Proof` has no before/after pair. Every PR shows the change running, not the code it adds: ' +
  'a `Before:` line and an `After:` line (screenshot, CLI or console output of the real thing on base vs head), or a ' +
  '`| Before | After |` table. Test-runner output alone does not count. Base not capturable → `Before: not captured — <why>` ' +
  'and list it under Not verified. See code-review references/proof.md, Before/after pair. ' + HOW;
// PR size cap. Counted lines are the added + deleted lines of <base>...HEAD in baseDir.
const SIZE_LIMIT = 800;
const SIZE_EXEMPT = /^[ \t>*-]*Size-exempt\b(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*\S/im;
// Not counted, like open-pr's "One PR or Several?": lockfiles, snapshots, generated and eval-fixture paths.
const UNCOUNTED = /(?:^|\/)(?:[^/]*\.lock|package-lock\.json|pnpm-lock\.yaml|packages\.lock\.json|[^/]*\.snap|[^/]*\.min\.(?:js|css))$|(?:^|\/)(?:__snapshots__|generated|evals?\/fixtures?)\//;
let verb = ''; // set at the top of check(): 'create' | 'new' | 'edit'
let baseFlag = ''; // the --base / -B value of the invocation being checked, '' when absent
const git = (...args) => spawnSync('git', args, { cwd: baseDir, encoding: 'utf8' });
const baseCandidates = () => {
  if (baseFlag) return [`origin/${baseFlag}`, baseFlag];
  const head = git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD');

  return head.status === 0 ? [head.stdout.trim()] : [];
};
// Counted changed lines of <ref>...HEAD plus the ref used; null when git can't say (not a repo, base missing).
// ponytail: fail open, a size cap is not worth blocking on a git hiccup.
const changedLines = () => {
  const ref = baseCandidates().find((r) => git('rev-parse', '--verify', '--quiet', `${r}^{commit}`).status === 0);
  if (!ref) return null;
  // -z: paths come NUL-terminated and unquoted, so a non-ASCII or tab-bearing path still meets UNCOUNTED.
  const diff = git('diff', '--numstat', '-z', '--no-renames', `${ref}...HEAD`);
  if (diff.status !== 0) return null;
  const rows = diff.stdout.split('\0').filter(Boolean).map((entry) => entry.match(/^([^\t]*)\t([^\t]*)\t([\s\S]*)$/)).filter(Boolean);
  const counted = rows.filter(([, added, , file]) => added !== '-' && !UNCOUNTED.test(file));
  const n = counted.reduce((sum, [, added, deleted]) => sum + Number(added) + Number(deleted), 0);

  return { n, ref };
};
const sizeGap = (text) => {
  if (verb === 'edit' || SIZE_EXEMPT.test(text)) return '';
  const size = changedLines();
  if (!size || size.n <= SIZE_LIMIT) return '';

  return `pr-proof-guard: PR is ${size.n} changed lines vs ${size.ref}, over the ${SIZE_LIMIT} cap (lockfiles, snapshots, generated files not counted). ` +
    'Split it (open-pr references/stacking.md), or add a line `Size-exempt: <reason>` to the body.';
};
// Returns the block message for a body sent with these --attach paths, or '' when it may run.
const proofGap = (text, attached) => {
  if (!PROOF_HEADING.test(text)) return NO_PROOF;
  const section = proofSection(text);

  return hasPair(section) ? shotGap(section, attached) || sizeGap(text) : NO_PAIR;
};

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
  verb = inv.groups.verb;
  baseFlag = '';
  const argsStart = inv.index + inv[0].length;
  const stop = masked.slice(argsStart).search(/[\n;&|)`]/);
  const argsEnd = stop < 0 ? masked.length : argsStart + stop;
  const tokens = [...masked.slice(argsStart, argsEnd).matchAll(/\S+/g)]
    .map((t) => ({ start: argsStart + t.index, end: argsStart + t.index + t[0].length, flag: t[0] }));
  if (tokens.some((t) => t.flag === '--help' || t.flag === '-h')) return '';

  let source = null; // last body flag wins, like gh's flag parser
  const attached = []; // --attach paths as gh receives them, `#alt text` dropped
  tokens.forEach((t, i) => {
    const long = t.flag.match(/^--body(-file)?(=|$)/);
    const short = t.flag.match(/^-([bF])/);
    const attach = t.flag.match(/^--attach(=|$)/);
    const base = t.flag.match(/^(?:--base(?=$|=)|-B)=?/);
    const attachRange = attach && (attach[1] ? { start: t.start + attach[0].length, end: t.end } : tokens[i + 1]);
    const baseRange = base && (t.flag.length > base[0].length ? { start: t.start + base[0].length, end: t.end } : tokens[i + 1]);
    if (baseRange) baseFlag = unquote(cmd.slice(baseRange.start, baseRange.end));
    if (attachRange) attached.push(expandHome(unquote(cmd.slice(attachRange.start, attachRange.end))).split('#')[0]);
    if (long) source = { isFile: Boolean(long[1]), range: long[2] ? { start: t.start + long[0].length, end: t.end } : tokens[i + 1] };
    else if (short) source = { isFile: short[1] === 'F', range: t.flag.length > 2 ? { start: t.start + 2, end: t.end } : tokens[i + 1] };
  });
  if (!source) return inv.groups.verb === 'edit' ? '' : NO_PROOF; // an edit that doesn't touch the body is fine

  const { start, end } = source.range || { start: argsEnd, end: argsEnd };
  const inHeredoc = heredocs.filter((h) => h.start >= start && h.end <= end);
  if (inHeredoc.length) return proofGap(inHeredoc.map((h) => cmd.slice(h.start, h.end)).join('\n'), attached);

  let value = unquote(cmd.slice(start, end));
  const catFile = !source.isFile && value.match(/^\$\(\s*cat\s+([^)\n]+?)\s*\)$/);
  if (!source.isFile && !catFile) return proofGap(value, attached);
  if (catFile) value = unquote(catFile[1]);

  let scanEnd = inv.index; // earlier mentions of the body file are looked for before here
  if (value === '-') { // body from stdin: judge only this invocation's own stdin, never proof elsewhere in the command
    // a `||` gives an empty pipe source: the backward search stops at its first `|`
    const pipeStart = masked[inv.index] === '|' ? Math.max(...[...'\n;&|(`'].map((c) => masked.lastIndexOf(c, inv.index - 1))) + 1 : inv.index;
    const redirect = lastStdinRedirect(argsStart, argsEnd) || lastStdinRedirect(pipeStart, inv.index);
    const catSource = masked.slice(pipeStart, inv.index).match(/^[ \t]*cat[ \t]+(\S+)[ \t]*$/d);
    const printfSource = masked.slice(pipeStart, inv.index).match(/^[ \t]*printf[ \t]+/);
    scanEnd = pipeStart; // the pipe source reading the file (`cat pr.md |`) is not a stale write
    if (redirect?.op === '<<<') return proofGap(redirect.word, attached);
    if (redirect && redirect.op !== '<') {
      const heredoc = heredocs.find((h) => h.op === redirect.index);
      return heredoc ? proofGap(cmd.slice(heredoc.start, heredoc.end), attached) : NO_PROOF;
    }
    if (redirect) value = redirect.word;
    else if (catSource) value = unquote(cmd.slice(pipeStart + catSource.indices[1][0], pipeStart + catSource.indices[1][1]));
    else if (printfSource) {
      return proofGap(unquote(cmd.slice(pipeStart + printfSource[0].length, inv.index)).replace(/\\n/g, '\n'), attached);
    } else {
      const raw = cmd.slice(pipeStart, inv.index);
      const heading = /(^|['"])[ \t]*## Proof\b/m.exec(raw);

      return heading ? proofGap(raw.slice(heading.index + heading[1].length), attached) : NO_PROOF;
    }
  }
  // INVOKE's `VAR=x` prefix can swallow a whole `A=x;` statement, so gh's own statement starts after the last separator.
  const statementStart = inv.index + inv[0].search(/[^\n;&|(`]*$/);
  const resolved = resolvePath(value, statementStart);
  if (resolved.includes('$')) return `pr-proof-guard: cannot resolve body file path \`${value}\` (it expands a variable). Pass a literal path. ${HOW}`;
  const file = path.resolve(baseDir, resolved);
  // The hook runs before the command, so a body file created or changed earlier in this same command (>, tee, cp, mv,
  // sed -i, ...) is read stale or missing. ponytail: any earlier mention of the path counts, so a harmless
  // `ls pr.md && gh pr create -F pr.md` also blocks; the message says how to fix it, which beats a silent wrong allow.
  const mentions = [...masked.slice(0, scanEnd).matchAll(/[^\s;&|()<>`]+/dg)];
  if (mentions.some((w) => path.resolve(baseDir, resolvePath(unquote(cmd.slice(...w.indices[0])), w.index)) === file)) {
    return `pr-proof-guard: this command touches ${file} before gh reads it. Write the body file in a separate Bash call — ` +
      'the hook reads it before your command runs.';
  }
  let body = '';
  try { body = fs.readFileSync(file, 'utf8'); } catch { return `pr-proof-guard: cannot read body file ${file}. ${HOW}`; }

  return proofGap(body, attached);
};

for (const inv of masked.matchAll(INVOKE)) {
  const message = check(inv);
  if (!message) continue;
  process.stderr.write(message);
  process.exit(2);
}
process.exit(0);
