// The allow half of delete-guard: a recursive delete, spelled strictly, of folders this session owns.
// It never uses delete-guard.js's parser: that one over-matches on purpose, which is right for refusing
// and wrong for allowing. Anything that does not fit the grammar below gets no decision.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ALLOW_JSON = '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"delete-guard: every target is a folder this session owns"}}';

// Separators are ASCII spaces only; a tab, newline or other whitespace never matches.
const BASH_PATH = String.raw`(?:\/(?!\/)[A-Za-z0-9_./@+-]*|'\/(?!\/)[A-Za-z0-9_./@+ -]*')`;
const RM = String.raw`rm +-(?:rf|fr|r|R|Rf|fR)(?: +--)?(?: +${BASH_PATH})+`;
const BASH = new RegExp(String.raw`^${RM}(?: +&& +${RM})*$`);
const PS_PATH = String.raw`(?:[A-Za-z]:[\\/][A-Za-z0-9_.\\/@+-]*|'[A-Za-z]:[\\/][A-Za-z0-9_.\\/@+ -]*')`;
const PS = new RegExp(String.raw`^Remove-Item +(?:-Recurse +-Force|-Force +-Recurse) +(${PS_PATH})$`);

const unquote = (word) => word.replace(/^'(.*)'$/, '$1');

// `text` without leading and trailing `chars`. Index loops, not a regular expression: `[ ]+$` rescans every
// inner run of spaces, which is quadratic on a long command.
function strip(text, chars) {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start++;
  while (end > start && chars.includes(text[end - 1])) end--;

  return text.slice(start, end);
}

// The literal target paths of a strictly spelled delete, or null.
function parse(cmd, ps) {
  const text = strip(cmd, ' \t\r\n');
  const match = text.match(ps ? PS : BASH);
  if (!match) return null;
  const paths = ps ? [unquote(match[1])] : text.match(/'[^']*'|[^ ]+/g).filter((w) => /^['/]/.test(w)).map(unquote);
  const segments = paths.flatMap((p) => p.split(ps ? /[\\/]/ : '/'));
  const odd = segments.some((s) => s === '.' || s === '..' || (ps && /[ .]$/.test(s)));

  return odd ? null : paths;
}

// A path under /proc, /sys or /dev means another folder to each process (`/proc/self/cwd`): the hook
// would check one folder and `rm` delete another. /dev/shm is shared temp space, the same for everyone.
const isPerProcess = (p) => /^\/+(?:proc|sys|dev)(?:\/|$)/.test(p) && !p.startsWith('/dev/shm/');

// True when `p` or a folder on the way to it is a link into a per-process tree. `realpath` cannot tell:
// it follows such a link to this process's answer and hides that it did. A chain of over 40 links counts too.
function crossesPerProcess(p, readlink) {
  let todo = p.split('/').filter(Boolean);
  let cur = '';
  for (let hops = 0; todo.length;) {
    const next = `${cur}/${todo.shift()}`;
    let to;
    try { to = readlink(next); } catch { cur = next; continue; }
    const target = path.posix.resolve(cur || '/', to);
    if (++hops > 40 || isPerProcess(`${target}/`)) return true;
    todo = [...target.split('/').filter(Boolean), ...todo];
    cur = '';
  }

  return false;
}

// realpath of the nearest existing ancestor of the parent folder (of the path itself when whole), plus the rest.
function resolve(p, whole, { lib, sep, realpath }) {
  if (!lib.isAbsolute(p)) throw new Error(`not absolute: ${p}`);
  const root = lib.parse(p).root;
  const segments = p.slice(root.length).split(sep).filter(Boolean);
  const head = whole ? segments : segments.slice(0, -1);
  const tail = whole ? [] : segments.slice(-1);
  for (let i = head.length; i >= 0; i--) {
    try {
      const base = realpath(lib.join(root, ...head.slice(0, i)));

      return lib.join(base, ...head.slice(i), ...tail);
    } catch (error) {
      if (i === 0) throw error;
    }
  }

  return null;
}

// True when `inner` (segments) equals `outer` or sits under it.
const inside = (outer, inner) => outer.length <= inner.length && outer.every((s, i) => inner[i] === s);
const equal = (a, b) => a.length === b.length && inside(a, b);

// Folders owned paths must sit strictly inside, resolved, as segment lists.
function zones({ win, mac, lib, home, env, tmpdir, real, key }) {
  const own = real(home);
  // macOS disks mostly ignore letter case: the tests that keep home out of a zone must too.
  const fold = (segments) => (mac ? segments.map((x) => x.toLowerCase()) : segments);
  // A zone under home counts only when no segment below home is a link: a missing `~/Library/Caches`
  // created as a link to `/` would turn every folder into temp space.
  const homeZone = (...tail) => {
    const zone = real(lib.join(home, ...tail));

    return equal(zone, [...own, ...key(lib.join(...tail))]) ? [zone] : [];
  };
  // Any other zone counts only when it resolves to its own spelling: a link at the zone or above it could
  // point anywhere. The one link accepted is macOS's `/private` in front (`/tmp`, `/var`).
  const plain = (p) => {
    const zone = real(p);
    const spelled = key(lib.normalize(p));
    const isOwnSpelling = equal(zone, spelled) || (mac && equal(zone, ['private', ...spelled]));

    return isOwnSpelling ? [zone] : [];
  };
  const fixed = win ? [] : ['/tmp', '/var/tmp', '/dev/shm'];
  const localTemp = win && env.LOCALAPPDATA ? lib.join(env.LOCALAPPDATA, 'Temp') : null;
  if (localTemp && lib.isAbsolute(localTemp)) fixed.push(localTemp);
  const resolved = [
    // A fixed zone that holds home (HOME=/tmp in a container) would make all of home temp space.
    ...fixed.flatMap(plain).filter((z) => !inside(fold(z), fold(own))), ...homeZone('.cache'), ...homeZone('Library', 'Caches'),
    ...(win && !env.LOCALAPPDATA ? homeZone('AppData', 'Local', 'Temp') : []),
  ];
  if (!tmpdir || !lib.isAbsolute(tmpdir)) return resolved;
  const [tmp] = plain(tmpdir);
  if (!tmp) return resolved;
  const nearHome = inside(fold(tmp), fold(own)) || (inside(fold(own), fold(tmp)) && tmp.length <= own.length + 1);
  // A root or a folder directly in one (`/etc`, `D:\Scratch`) is never temp space, whatever TMPDIR says.
  const depth = tmp.length - (mac && fold(tmp)[0] === 'private' ? 1 : 0);
  const shallow = depth < (win ? 3 : 2);

  return nearHome || shallow ? resolved : [...resolved, tmp];
}

const lower = (segments) => segments.map((s) => s.toLowerCase());

// Whether every target of `cmd` is an owned root or inside one, and none is the scratchpad or holds it.
// A target, owned line or scratchpad that reaches a per-process tree, also through a link, never counts.
function allowOwned(cmd, { tool = 'Bash', platform = process.platform, home = os.homedir(), env = process.env, owned = [], scratchpad, tmpdir = os.tmpdir(), realpath = fs.realpathSync, readlink = fs.readlinkSync } = {}) {
  const win = platform === 'win32';
  const mac = platform === 'darwin';
  const ps = tool === 'PowerShell';
  if (ps !== win || (!ps && tool !== 'Bash')) return false;
  const targets = parse(cmd, ps);
  if (!targets) return false;
  const lib = win ? path.win32 : path.posix;
  const sep = win ? /[\\/]/ : '/';
  const key = (p) => (win ? p.toLowerCase() : p).split(sep).filter(Boolean);
  const real = (p) => key(resolve(p, true, { lib, sep, realpath }));
  const at = (p) => key(resolve(p, ps || /[\\/]$/.test(p), { lib, sep, realpath }));
  const valid = (p) => lib.isAbsolute(p) && !p.split(sep).some((s) => s === '.' || s === '..');
  try {
    const stable = (p) => win || !(isPerProcess(`${p}/`) || crossesPerProcess(p, readlink));
    if (!targets.every(stable)) return false;
    const zoneKeys = zones({ win, mac, lib, home, env, tmpdir, real, key });
    const inZone = (k) => zoneKeys.some((z) => inside(z, k)) && !zoneKeys.some((z) => equal(z, k));
    // A home or a scratchpad in a shape this file does not read: no allow at all, not "no scratchpad".
    // (Home spelled another way would slip past the "zone holds home" tests in zones().)
    // That is: not a string, a `.`/`..` segment, relative, space or a control character at an end or
    // inside, and on Windows a form the system reads as another spelling of the same folder
    // (no drive letter, a segment ending in a space or dot, an 8.3 short name, a stream suffix), and on
    // macOS the `/System/Volumes/Data` spelling of the same disk.
    const windowsForm = (p) => /^[A-Za-z]:[\\/]/.test(p) && !p.slice(2).split(sep).some((s) => /[ .]$|[~:]/.test(s));
    const clean = (p) => typeof p === 'string' && valid(p) && p === p.trim() && !/[\0-\x1f\x7f]/.test(p) && (!win || windowsForm(p)) && !(mac && /^\/+System\/+Volumes(\/|$)/i.test(p));
    if (!clean(home)) return false;
    if (scratchpad != null && scratchpad !== '' && !(clean(scratchpad) && stable(scratchpad))) return false;
    const pad = typeof scratchpad === 'string' && scratchpad ? at(scratchpad) : null;
    // The scratchpad by both readings (last segment followed or not), compared without letter case:
    // it may be a link, and the disk may not tell `Scratchpad` from `scratchpad`.
    const pads = pad ? [pad, real(scratchpad)].map(lower) : [];
    const holdsPad = (k) => pads.some((p) => inside(lower(k), p));
    const lines = owned.map((line) => strip(line, ' \r')).filter((line) => valid(line) && stable(line));
    // A line that cannot be resolved (a drive that is gone) is skipped: it must not switch off the other lines.
    const rootOf = (line) => { try { return [at(line)]; } catch { return []; } };
    const roots = [...lines.flatMap(rootOf), ...(pad ? [pad] : [])].filter(inZone);
    const ok = (k) => roots.some((r) => inside(r, k)) && !holdsPad(k);

    return targets.map(at).every(ok);
  } catch {
    return false;
  }
}

module.exports = { allowOwned, ALLOW_JSON };
