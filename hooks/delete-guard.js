#!/usr/bin/env node
// PreToolUse guard (Bash, PowerShell) against recursive deletes that wipe a drive or a home folder.
// Why: on 2026-11-04 an autonomous session ran, in Git Bash,
//   D=$(ls -d C?*/ | grep -v CONTRIB | head -1); rm -rf -- "$D"
// to remove a stray folder named `C` + U+F03A (WSL's stand-in for ':'). Git Bash listed it as
// `C:/`, so rm deleted everything on drive C: the account could delete.
//
// Blocks a recursive delete (rm -r, find -delete / -exec rm, Remove-Item -Recurse, rd /s) when a target is
//   - a filesystem or drive root, or a folder directly in one (`/`, `/usr`, `C:`, `C:\Users`, `/mnt/c`),
//   - a home folder, a folder directly in it, or a parent of one (`~`, `~/.claude`, `/home/bob`),
//   - a device or mount point (`/dev/sda`, `/mnt/data`, `/media/bob/usb`), a network share root or a folder
//     directly in one (`\\nas\share\dir`), or a Windows device path (`\\.\`, `\\?\`),
//   - not a literal path: a shell variable, `$(...)`, backticks, xargs or pipeline input,
//     or a relative path after a `cd` to a non-literal place.
// Environment variables the command does not reassign resolve (HOME, USERPROFILE, TMPDIR, ...).
// A refused path has no override on purpose: the fix is to print the resolved path, check it, and delete it literally.
// A footgun net, not a security boundary. Gaps, left open: deletes inside interpreters
// (`python -c "shutil.rmtree(x)"`, `node -e`), script files, .NET calls, `eval`.
//
// Allow (owned-delete.js), only after nothing is refused: `rm -rf <literal absolute path>...` (PowerShell:
// `Remove-Item -Recurse -Force <path>`) whose every target is a folder the session owns gets a PreToolUse
// `allow`, so no permission prompt. Owned: a line of `<state>/owned-<session id>.txt` (state is
// DELETE_GUARD_STATE_DIR, else ~/.claude/state) or the stdin scratchpad_dir, strictly inside a temp or
// cache zone. The list is the session's own claim, not proof; the zones bound a wrong line to temp space.
// Anything else gets no decision (the normal permission flow), including `git worktree remove`, every
// other spelling, the Bash tool on Windows, and a path that reaches /proc, /sys or /dev, also through a link.
const fs = require('fs');
const os = require('os');
const { join } = require('path');
const { stripProse } = require('./cpu-guard.js');
const { allowOwned, ALLOW_JSON } = require('./owned-delete.js');

const DYNAMIC = 'is not a literal path (a variable, $(...), backticks, xargs or pipe input)';
const ROOT = 'is a drive or filesystem root, or a folder directly in one';
const HOME = 'is a home folder, a folder directly in one, or a parent of one';
const DEVICE = 'is a device, a mount point or a network share root';
const STREAMS = new Set(['null', 'stdout', 'stderr', 'tty']);

// Splits a command into its simple commands at unquoted ; & | newlines, parens and brace groups.
// Each part knows whether it reads a pipe. Unquoted # starts a comment.
function split(cmd, posix) {
  const parts = [];
  let cur = '', quote = null, piped = false;
  const push = (nextPiped) => {
    if (cur.trim()) parts.push({ text: cur.trim(), piped });
    cur = '';
    piped = nextPiped;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (posix && quote === '"' && c === '\\') { cur += c + (cmd[++i] ?? ''); continue; }
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (posix && c === '\\') { cur += c + (cmd[++i] ?? ''); continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '#' && /(^|\s)$/.test(cur)) { while (i < cmd.length && cmd[i] !== '\n') i++; push(false); continue; }
    const brace = (c === '{' && /\s/.test(cmd[i + 1] ?? ' ')) || (c === '}' && /(^|[\s;])$/.test(cur));
    if (/[;&|\n()]/.test(c) || brace) { push(c === '|' || (piped && brace)); continue; }
    cur += c;
  }
  push(false);
  return parts;
}

// Variables the command itself sets: their value at run time is unknown to the hook.
function assignedNames(cmd, posix) {
  const pattern = posix ? /(?:^|[\s;&|(])(?:export\s+|local\s+|for\s+)?(\w+)(?:=|\s+in\b)|\bread\s+(?:-\S+\s+)*(\w+)/g
    : /\$(?:env:)?(\w+)\s*=(?!=)/gi;
  return new Set([...cmd.matchAll(pattern)].map((m) => (m[1] || m[2]).toLowerCase()));
}

// The value of $NAME, or null when the hook cannot know it.
function lookup(name, plain, ctx) {
  if (ctx.assigned.has(name.toLowerCase())) return null;
  if (/^(home|userprofile)$/i.test(name)) return ctx.home;
  if (!ctx.posix && plain) return null;
  const key = Object.keys(ctx.env).find((k) => k === name || (!ctx.posix || ctx.win) && k.toLowerCase() === name.toLowerCase());
  return (key && ctx.env[key]) || null;
}

// Splits one simple command into words with quotes removed and known variables expanded.
function words(text, ctx) {
  const out = [];
  let val = '', dyn = false, started = false, quote = null;
  const end = () => {
    if (started) out.push({ val, dyn });
    val = ''; dyn = false; started = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!quote && /\s/.test(c)) { end(); continue; }
    started = true;
    if (quote === "'") { if (c === "'") quote = null; else val += c; continue; }
    if (c === "'") { quote = "'"; continue; }
    if (c === '"') { quote = quote ? null : '"'; continue; }
    if (ctx.posix && c === '\\') { val += text[++i] ?? ''; continue; }
    if (ctx.posix && c === '`') { dyn = true; continue; }
    if (c === '~' && !quote && val === '' && /^(?:$|[\s/\\])/.test(text.slice(i + 1, i + 2))) { val += ctx.home; continue; }
    const variable = c === '$' && text.slice(i).match(/^\$(?:\{(?:env:)?(\w+)\}|env:(\w+)|(\w+))/i);
    if (c === '$') {
      const value = variable && lookup(variable[1] || variable[2] || variable[3], Boolean(variable[3]), ctx);
      if (value == null) dyn = true; else val += value;
      if (variable) i += variable[0].length - 1;
      continue;
    }
    const percent = c === '%' && text.slice(i).match(/^%(\w+)%/);
    if (percent) {
      const value = lookup(percent[1], false, ctx);
      if (value == null) dyn = true; else val += value;
      i += percent[0].length - 1;
      continue;
    }
    val += c;
  }
  end();
  return out;
}

// A path as { drive, parts } (lowercased), resolved against cwd; null when cwd is unknown.
function normalize(p, cwd, ctx) {
  let s = p.replace(/\\/g, '/');
  if (ctx.mac) s = s.replace(/^\/(?:private|System\/Volumes\/Data)(?=\/|$)/i, '') || '/';
  const fold = (drive, rest) => {
    const parts = [];
    for (const part of rest.toLowerCase().split('/')) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    }
    return { drive: drive.toLowerCase(), parts };
  };
  let m;
  if ((m = s.match(/^([a-z]):(.*)$/i))) return fold(m[1], m[2]);
  if ((!ctx.posix || ctx.win) && (m = s.match(/^\/\/([^/]+)\/([^/]+)(\/.*|)$/))) return fold(`//${m[1]}/${m[2]}`, m[3]);
  if ((m = s.match(/^\/(?:mnt|cygdrive)\/([a-z])(\/.*|)$/i))) return fold(m[1], m[2]);
  if (ctx.win && (m = s.match(/^\/([a-z])(\/.*|)$/i))) return fold(m[1], m[2]);
  if (s.startsWith('/')) return fold('', s);
  if (!cwd) return null;
  return fold(cwd.drive, `${cwd.parts.join('/')}/${s}`);
}

const within = (outer, inner) => outer.drive === inner.drive && outer.parts.every((part, i) => inner.parts[i] === part);

// A device under /dev, a mount point under /mnt, /media or /run/media, or a UNC share root or a folder in one.
function isDevice({ drive, parts }) {
  if (drive.startsWith('//')) return parts.length <= 1;
  if (drive) return false;
  const [top, next] = parts;
  const n = parts.length;
  if (top === 'dev') return !((next === 'shm' && n >= 3) || (n === 2 && STREAMS.has(next)));
  if (top === 'mnt') return n === 2;
  if (top === 'media') return n === 2 || n === 3;

  return top === 'run' && next === 'media' && n <= 4;
}

// Why deleting this target is refused, or null when it is fine.
function danger(word, cwd, ctx) {
  if (word.dyn) return DYNAMIC;
  if ((!ctx.posix || ctx.win) && /^[\\/]{2}[.?][\\/]/.test(word.val)) return DEVICE;
  const path = normalize(word.val, cwd, ctx);
  if (!path) return DYNAMIC;
  const glob = path.parts.findIndex((part) => /[*?[]/.test(part));
  if (glob >= 0) path.parts = path.parts.slice(0, glob);
  if (isDevice(path)) return DEVICE;
  if (path.parts.length <= 1 || (path.parts[0] === 'volumes' && path.parts.length === 2)) return ROOT;
  const home = normalize(ctx.home, null, ctx);
  if (home && (within(path, home) || (within(home, path) && path.parts.length === home.parts.length + 1))) return HOME;
  if (/^(users|home)$/.test(path.parts[0]) && path.parts.length <= 3) return HOME;
  return null;
}

// Wrappers and shell keywords that run the next word as the command.
const PREFIX = /^(sudo|doas|command|exec|time|nohup|nice|env|builtin|do|then|else|elif|if|while|until|!)$/;
const commandName = (word) => (word ? word.val.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase() : '');

// Targets of a recursive delete in one simple command: [] when it is not one, or 'dynamic'.
function deleteTargets(list, piped, ctx) {
  const name = commandName(list[0]);
  const args = list.slice(1);
  if (ctx.posix && name === 'xargs') {
    const rm = args.findIndex((w) => commandName(w) === 'rm');
    return rm >= 0 && args.slice(rm + 1).some((w) => /^-[^-]*r/i.test(w.val) || w.val === '--recursive') ? 'dynamic' : [];
  }
  if (ctx.posix && name === 'rm') {
    const end = args.findIndex((w) => w.val === '--');
    const flags = (end < 0 ? args : args.slice(0, end)).filter((w) => w.val.startsWith('-'));
    if (!flags.some((w) => /^-[^-]*r/i.test(w.val) || w.val === '--recursive')) return [];
    return args.filter((w, i) => (end >= 0 && i > end) || !w.val.startsWith('-'));
  }
  if (ctx.posix && name === 'find') {
    const deletes = args.some((w, i) => w.val === '-delete' || (/^-exec(dir)?$/.test(w.val) && commandName(args[i + 1]) === 'rm'));
    if (!deletes) return [];
    const paths = [];
    for (const w of args) {
      if (/^-[HLP]$/.test(w.val)) continue;
      if (/^[-(!]/.test(w.val)) break;
      paths.push(w);
    }
    return paths.length ? paths : [{ val: '.', dyn: false }];
  }
  if (ctx.mode === 'cmd' && /^(rd|rmdir|del|erase)$/.test(name)) {
    if (!args.some((w) => /^\/s$/i.test(w.val))) return [];
    return args.filter((w) => !/^\/[a-z]$/i.test(w.val));
  }
  if (ctx.mode === 'ps' && /^(remove-item|ri|rm|rmdir|rd|del|erase)$/.test(name)) {
    let recursive = false;
    const targets = [];
    for (let i = 0; i < args.length; i++) {
      const param = args[i].val.match(/^-(\w+)/);
      if (!param) { targets.push(args[i]); continue; }
      const p = param[1].toLowerCase();
      if ('whatif'.startsWith(p) && p.length > 1) return [];
      if ('recurse'.startsWith(p)) recursive = true;
      else if (/^(path|literalpath|lp|pspath|p)$/.test(p)) { if (args[i + 1]) targets.push(args[++i]); }
      else if (/^(include|exclude|filter|credential|stream)$/.test(p)) i++;
    }
    if (!recursive) return [];
    if (!targets.length) return piped ? 'dynamic' : [];
    return targets.flatMap((w) => (w.dyn ? [w] : w.val.split(',').filter(Boolean).map((val) => ({ val, dyn: false }))));
  }
  return [];
}

// Walks the simple commands in order, following cd, and returns the first refusal.
function check(cmd, ctx, cwd) {
  for (const part of split(ctx.posix ? stripProse(cmd) : cmd, ctx.posix)) {
    let list = words(part.text, ctx);
    while (list.length && (PREFIX.test(commandName(list[0])) || (ctx.posix && /^\w+=/.test(list[0].val)))) {
      list = list.slice(1);
      while (list.length && list[0].val.startsWith('-')) list = list.slice(1);
    }
    const name = commandName(list[0]);
    if (!name) continue;

    const inner = list.findIndex((w, i) => i > 0 && (/^(bash|sh|zsh|dash)$/.test(name) ? w.val === '-c'
      : /^(pwsh|powershell)$/.test(name) ? /^-c(ommand)?$/i.test(w.val)
      : name === 'cmd' && /^\/{1,2}[ck]$/i.test(w.val)));
    if (inner > 0 && list[inner + 1]) {
      const mode = name === 'cmd' ? 'cmd' : /^(pwsh|powershell)$/.test(name) ? 'ps' : 'posix';
      const text = list.slice(inner + 1).map((w) => w.val).join(' ');
      const found = check(text, { ...ctx, mode, posix: mode === 'posix' }, cwd);
      if (found) return found;
      continue;
    }

    if (/^(cd|pushd|chdir|set-location|sl|push-location)$/.test(name)) {
      const to = list.slice(1).find((w) => !/^-\w/.test(w.val));
      cwd = !to ? normalize(ctx.home, null, ctx) : to.dyn || to.val === '-' ? null : normalize(to.val, cwd, ctx);
      continue;
    }

    const targets = deleteTargets(list, part.piped, ctx);
    if (targets === 'dynamic') return { target: part.text, why: DYNAMIC };
    for (const target of targets) {
      const why = danger(target, cwd, ctx);
      if (why) return { target: target.dyn ? part.text : target.val, why };
    }
  }
  return null;
}

// The hook's answer for one command: a block reason, an allow for a strict delete of owned folders, or nothing.
function decide(cmd, {
  tool = 'Bash', cwd = process.cwd(), home = os.homedir(), env = process.env, platform = process.platform,
  owned = [], scratchpad, tmpdir = os.tmpdir(), realpath = fs.realpathSync, readlink = fs.readlinkSync,
} = {}) {
  const posix = tool !== 'PowerShell';
  const ctx = { posix, mode: posix ? 'posix' : 'ps', home, env, win: platform === 'win32', mac: platform === 'darwin', assigned: assignedNames(cmd, posix) };
  const found = check(cmd, ctx, normalize(cwd, null, ctx));
  if (!found) return allowOwned(cmd, { tool, platform, home, env, owned, scratchpad, tmpdir, realpath, readlink }) ? { allow: true } : {};
  return {
    block: `delete-guard: blocked a recursive delete: \`${found.target}\` ${found.why}. `
      + 'Print the resolved path first, check it is the folder you mean, then delete it by its literal absolute path. '
      + 'Never delete a drive root, a home folder, or a folder directly in either.',
  };
}

if (require.main === module) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { process.exit(0); }
  const cmd = (input.tool_input || {}).command || '';
  const state = process.env.DELETE_GUARD_STATE_DIR || join(os.homedir(), '.claude', 'state');
  const ids = [...new Set([input.session_id, process.env.CLAUDE_CODE_SESSION_ID])]
    .filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id));
  const readLines = (file) => { try { return fs.readFileSync(file, 'utf8').split('\n'); } catch { return []; } };
  const owned = ids.flatMap((id) => readLines(join(state, `owned-${id}.txt`)));
  const scratchpad = typeof input.scratchpad_dir === 'string' ? input.scratchpad_dir : undefined;
  const result = decide(cmd, { tool: input.tool_name, cwd: input.cwd || process.cwd(), owned, scratchpad });
  if (result.block) {
    process.stderr.write(result.block);
    process.exit(2);
  }
  if (result.allow) process.stdout.write(ALLOW_JSON);
}

module.exports = { decide };
