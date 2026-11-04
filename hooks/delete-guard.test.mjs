// Run: node --test hooks/delete-guard.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { decide } = require('./delete-guard.js');

const WIN = { platform: 'win32', home: 'C:\\Users\\artio', cwd: 'E:\\wow-testkit', env: { HOME: '/c/Users/artio', TEMP: 'C:\\Users\\artio\\AppData\\Local\\Temp' } };
const MAC = { platform: 'darwin', home: '/Users/bob', cwd: '/Users/bob/code/app', env: { HOME: '/Users/bob', TMPDIR: '/var/folders/x/T' } };
const LINUX = { platform: 'linux', home: '/home/bob', cwd: '/home/bob/src/app', env: { HOME: '/home/bob' } };
const PS = { ...WIN, tool: 'PowerShell' };

const blocked = (cmd, opts) => assert.match(decide(cmd, opts).block || '', /^delete-guard: /, cmd);
const passes = (cmd, opts) => assert.deepEqual(decide(cmd, opts), {}, cmd);

describe('delete-guard', () => {
  it('WHEN the 2026-11-04 command runs again THEN it is blocked before rm sees "C:/"', () => {
    blocked(`cd /e/wow-testkit && D=$(ls -d C?*/ | grep -v CONTRIB | head -1); echo "$D" | od -c | head -3; rm -rf -- "$D"; git status --short`, WIN);
  });

  it('WHEN a recursive delete targets a drive or filesystem root THEN it is blocked on every platform', () => {
    for (const cmd of ['rm -rf -- "C:/"', 'rm -rf C:', 'rm -rf C:\\\\', 'rm -rf /c/', 'rm -rf /mnt/c', 'rm -rf /cygdrive/d/', 'rm -rf E:/wow-testkit', 'rm -rf C?*/', 'cmd //c "rd /s /q C:\\\\"']) blocked(cmd, WIN);
    for (const cmd of ['rm -rf /', 'rm -rf /*', 'sudo rm -rf /usr', 'rm -fr /etc/', 'rm -rf /Volumes/Backup', 'cd / && rm -rf ./*']) blocked(cmd, MAC);
    for (const cmd of ['rm -rf /', 'rm -Rf /var', 'find / -delete', 'rm -rf /mnt/c']) blocked(cmd, LINUX);
  });

  it('WHEN a recursive delete targets a home folder, a folder in it, or a parent THEN it is blocked', () => {
    for (const cmd of ['rm -rf ~', 'rm -rf ~/', 'rm -rf ~/*', 'rm -rf "$HOME"', 'rm -rf ~/.claude', 'rm -rf ~/Downloads', 'rm -r /c/Users/artio', 'rm -rf C:/Users', 'cd ~ && rm -rf *']) blocked(cmd, WIN);
    for (const cmd of ['rm -rf /Users/bob', 'rm -rf /Users/alice/Documents', 'rm -rf ~/.ssh', 'find ~ -delete', 'rm -rf ../../..']) blocked(cmd, MAC);
    for (const cmd of ['rm -Rf /home/bob/', 'rm -rf /home', 'rm -rf "${HOME}/.config"']) blocked(cmd, LINUX);
  });

  it('WHEN the target is not a literal path THEN it is blocked', () => {
    for (const cmd of ['rm -rf "$D"', 'rm -rf $(cat list.txt)', 'rm -rf "`pwd`/x"', 'ls | xargs rm -rf', 'S=/tmp/x; rm -rf "$S/out"', 'rm -rf "$UNSET_VAR/"', 'HOME=/; rm -rf "$HOME/x/y"', 'cd "$X" && rm -rf build', "bash -c 'rm -rf \"$D\"'", 'for d in */; do rm -rf "$d"; done']) blocked(cmd, LINUX);
  });

  it('WHEN PowerShell removes a root, a home or a non-literal path recursively THEN it is blocked', () => {
    for (const cmd of ['Remove-Item -Recurse -Force C:\\', 'Remove-Item C:\\Users\\artio -Recurse', 'rm -r -fo $env:USERPROFILE', 'Remove-Item -LiteralPath $d -Recurse', 'Get-ChildItem C:\\ | Remove-Item -Recurse', 'ri ~ -r', "Remove-Item -Path 'C:\\Users\\artio\\.claude' -Recurse -Force", 'gci x | ForEach-Object { Remove-Item $_ -Recurse }', 'Set-Location C:\\; Remove-Item .\\* -Recurse', 'pwsh -Command "Remove-Item C:\\ -Recurse"']) blocked(cmd, PS);
  });

  it('WHEN a recursive delete targets a literal path deep enough THEN it passes', () => {
    for (const cmd of ['rm -rf build', 'rm -rf node_modules dist', 'rm -rf ~/.claude/worktrees/agent-x', 'rm -rf "$HOME/.cache/pip"', 'rm -rf "$TEMP/claude-x"', 'cd /e/wow-testkit && rm -rf out/tmp', 'rm -rf -- E:/wow-testkit/out/C*']) passes(cmd, WIN);
    for (const cmd of ['rm -rf /tmp/foo', 'rm -rf "$TMPDIR/x"', 'rm -rf ./*', 'find . -name "*.pyc" -delete', 'rm -rf ~/code/app/dist']) passes(cmd, MAC);
    for (const cmd of ['Remove-Item -Recurse -Force .\\build', 'Remove-Item C:\\Users\\artio\\.claude\\cache -Recurse', 'Remove-Item -Recurse C:\\ -WhatIf', 'Remove-Item -Recurse:$true E:\\wow-testkit\\out', 'Remove-Item C:\\Users\\artio\\file.txt']) passes(cmd, PS);
  });

  it('WHEN a command only mentions a delete or is not recursive THEN it passes', () => {
    for (const cmd of ['git commit -m "never rm -rf /"', 'echo "rm -rf ~"', 'rm ~/notes.txt', 'rm -f /tmp/x.log', "cat > n.md <<'EOF'\nrm -rf /\nEOF", 'ls -d C?*/ # rm -rf C:/', 'grep -r "rm -rf" .', 'xargs rm -f < list']) passes(cmd, LINUX);
  });
});
