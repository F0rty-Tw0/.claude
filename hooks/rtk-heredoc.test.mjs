// Run: node --test hooks/rtk-heredoc.test.mjs
//
// Cause of the "heredoc command hangs for 2 minutes" reports (see RTK.md "Heredocs"):
//   1. `rtk hook claude` leaves any command containing a heredoc alone (no `rtk ` rewrite).
//   2. So a bare `ls` in that command is not turned into `rtk ls`; it resolves to the interactive alias
//      `ls='eza --icons --group-directories-first'` that the shell snapshot copies from ~/.zshrc.
//   3. eza with no path argument and a non-tty stdin waits for file names on stdin. The Bash tool leaves
//      stdin open, so eza never returns. (`cat >> file` without a file does the same; that one is a typo.)
// None of the repo hooks is involved; the first block below proves they are fast on heredocs.
//
// The fix lives outside the repo (the user's ~/.zshrc): make the aliases fall back to coreutils when stdin is
// not a terminal. The test reads that snippet (SAFE_ALIASES) from RTK.md and runs it against the same commands.
import { after, test } from 'node:test';
import assert from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const has = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`]).status === 0;
const rtkMissing = has('rtk') ? false : 'rtk not on PATH';
const evalMissing = has('rtk') && has('zsh') && has('eza') ? false : 'rtk, zsh or eza not on PATH';
const hookDir = fileURLToPath(new URL('.', import.meta.url));

// What ~/.zshrc defines when eza is installed (the snapshot copies it into agent shells).
const EZA_ALIASES = "alias ls='eza --icons --group-directories-first'\nalias ll='eza -alF --icons --group-directories-first'\nalias la='eza -A --icons'\nalias l='eza -CF --icons'\n";
// The recommended replacement, read from the ```zsh block under RTK.md "## Heredocs" so the doc and the test cannot drift:
// icons on a terminal, plain coreutils everywhere else.
const rtkDoc = readFileSync(new URL('../RTK.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SAFE_ALIASES = rtkDoc.slice(rtkDoc.indexOf('\n## Heredocs\n')).match(/\n```zsh\n([\s\S]*?)```/)[1];

const work = mkdtempSync(join(tmpdir(), 'rtk-heredoc-'));
const bin = join(work, 'bin');
const repo = join(work, 'repo');
mkdirSync(bin);
mkdirSync(repo);
writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho "gh $*" | head -c 200\n', { mode: 0o755 });
spawnSync('git', ['init', '-q'], { cwd: repo });
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

const big = 'x'.repeat(99).concat('\n').repeat(3000);
const FORMS = {
  'git commit -m $(cat <<EOF)': "git commit -q --allow-empty -m \"$(cat <<'EOF'\nsubject\n\nbody line\nEOF\n)\"",
  'gh pr create --body $(cat <<EOF)': "gh pr create --title t --body \"$(cat <<'EOF'\n## Summary\nbody\nEOF\n)\"",
  'cat > f <<EOF': "cat > f.txt <<'EOF'\nhello\nEOF",
  'python3 - <<PY': "python3 - <<'PY'\nprint('hi')\nPY",
  'grep <<EOF': 'grep -c a <<EOF\nabc\nEOF',
  'git commit -F - <<EOF': 'git commit -q --allow-empty -F - <<EOF\nsubject\nEOF',
  'compound: cd && cat > f <<EOF': "cd . && cat > f.txt <<'EOF'\nhello\nEOF",
  'cat >> f <<EOF (append)': "cat >> f.txt <<'EOF'\nmore\nEOF",
  '300 KB body': `cat > big.txt <<'EOF'\n${big}EOF`,
  'CRLF line endings': "cat > crlf.txt <<'EOF'\r\nhello\r\nEOF\r",
};
const withLs = (cmd) => `${cmd}\nls`;

const preToolUse = (command) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: repo });
// What the harness runs: the hook's rewrite when there is one, else the original.
const afterRtk = (command) => {
  const { stdout } = spawnSync('rtk', ['hook', 'claude'], { input: preToolUse(command), encoding: 'utf8' });

  return stdout.trim() ? JSON.parse(stdout).hookSpecificOutput.updatedInput.command : command;
};

// The Bash tool leaves stdin open and non-tty; spawnSync closes it, so use spawn and never end stdin.
// Like the harness, source the alias setup first and then eval the command as one string (so the aliases apply to
// it); the command goes through a file because a 300 KB argv entry exceeds the kernel limit.
const execInZsh = (setup, command, { ms = 15000 } = {}) => new Promise((resolve) => {
  writeFileSync(join(work, 'cmd.sh'), command);
  writeFileSync(join(work, 'run.zsh'), `${setup}eval "$(<${join(work, 'cmd.sh')})"\n`);
  const child = spawn('zsh', [join(work, 'run.zsh')], { cwd: repo, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group exited between the timeout and the kill (ESRCH) */ }
  }, ms);
  child.stdout.resume();
  child.stderr.resume();
  child.on('close', (status) => { clearTimeout(timer); child.stdin.destroy(); resolve({ timedOut, status }); });
});

test('rtk leaves every heredoc form unrewritten (why aliases leak into these commands)', { skip: rtkMissing }, () => {
  for (const [name, cmd] of Object.entries(FORMS)) assert.strictEqual(afterRtk(cmd), cmd, name);
});

test('rtk does rewrite a bare ls, so the same ls without a heredoc never reaches eza', { skip: rtkMissing }, () => {
  assert.strictEqual(afterRtk('ls'), 'rtk ls');
});

test('repo hooks return fast on heredoc commands', () => {
  for (const hook of ['nul-guard.js', 'pr-proof-guard.js', 'cqt-guard.js']) {
    for (const [name, cmd] of Object.entries(FORMS)) {
      const r = spawnSync('node', [join(hookDir, hook)], { input: preToolUse(withLs(cmd)), timeout: 2000, encoding: 'utf8' });
      assert.notStrictEqual(r.error?.code, 'ETIMEDOUT', `${hook}: ${name}`);
    }
  }
});

test('cause: with the eza alias, ls after a heredoc blocks on open stdin', { skip: evalMissing }, async () => {
  const { timedOut } = await execInZsh(EZA_ALIASES, withLs(FORMS['cat > f <<EOF']), { ms: 3000 });
  assert.strictEqual(timedOut, true);
});

test('cause: ls with a path argument or </dev/null does not block under the same alias', { skip: evalMissing }, async () => {
  for (const tail of ['ls .', 'ls </dev/null', 'command ls', '/bin/ls']) {
    const r = await execInZsh(EZA_ALIASES, tail, { ms: 5000 });
    assert.deepStrictEqual({ tail, timedOut: r.timedOut, status: r.status }, { tail, timedOut: false, status: 0 });
  }
});

test('fix: with the stdin-aware aliases every heredoc form followed by ls returns', { skip: evalMissing }, async () => {
  for (const [name, cmd] of Object.entries(FORMS)) {
    for (const tail of ['ls', 'll', 'la', 'l']) {
      const r = await execInZsh(SAFE_ALIASES, `${afterRtk(cmd)}\n${tail}`);
      assert.deepStrictEqual({ name, tail, timedOut: r.timedOut, status: r.status }, { name, tail, timedOut: false, status: 0 });
    }
  }
});

test('fix: re-sourcing the snippet while the eza aliases exist still leaves functions, not aliases', { skip: evalMissing }, async () => {
  const allFunctions = 'for f in ls ll la l; do [[ "$(whence -w $f)" == "$f: function" ]] || exit 1; done';
  const r = await execInZsh(`${EZA_ALIASES}${SAFE_ALIASES}${SAFE_ALIASES}`, allFunctions);
  assert.deepStrictEqual({ timedOut: r.timedOut, status: r.status }, { timedOut: false, status: 0 });
});

after(() => rmSync(work, { recursive: true, force: true }));
