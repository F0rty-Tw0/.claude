# RTK - Rust Token Killer

**Usage**: Token-optimized CLI proxy (60-90% savings on dev operations)

## Meta Commands (always use rtk directly)

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
```

## Installation Verification

```bash
rtk --version         # Should show: rtk X.Y.Z
rtk gain              # Should work (not "command not found")
which rtk             # Verify correct binary
```

⚠️ **Name collision**: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## Hook-Based Usage

All other commands are automatically rewritten by the Claude Code hook.
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

Refer to CLAUDE.md for full command reference.

## Heredocs

**Symptom**: a Bash call with a heredoc followed by `ls` (or `ll`, `la`, `l`) hangs until the 120 s tool timeout. Of the 41 heredoc calls over 60 s in `~/.claude/projects/*/*.jsonl`, 5 end with a bare `ls` (4 of them at exactly the 120 s timeout); most others are long-running work, and one is a stray `cat >> file` with no file operand (that waits on stdin by itself).

**Cause** (reproduced, `hooks/rtk-heredoc.test.mjs`):

1. `rtk hook claude` never rewrites a command that contains a heredoc, so `ls` is not turned into `rtk ls`.
2. A bare `ls` then hits `alias ls='eza --icons --group-directories-first'`, copied from `~/.zshrc` into the shell snapshot.
3. eza with no path and a non-tty stdin waits for file names on stdin. The Bash tool leaves stdin open, so it blocks forever (wchan `unix_stream_data_wait`).

No repo hook is involved (`nul-guard`, `pr-proof-guard`, `cqt-guard` return in well under 2 s on 300 KB heredocs, CRLF, and every form above).

**Workaround today**: after a heredoc, never use a bare `ls`/`ll`/`la`/`l`. Use `command ls`, `/bin/ls`, `ls <path>`, or `ls </dev/null`.

**Fix (outside this repo, user applies)**: in `~/.zshrc`, replace the four eza aliases with functions that use eza only on a terminal. `[[ -t 0 ]]` is false for the Bash tool, so agent shells get coreutils `ls`. The `unalias` line sits before the `if` because zsh expands aliases while it parses the whole block, so a re-`source ~/.zshrc` with the old aliases still defined would otherwise fail with "defining function based on alias":

```zsh
unalias ls ll la l 2>/dev/null
if command -v eza >/dev/null 2>&1; then
  ls() { if [[ -t 0 ]]; then eza --icons --group-directories-first "$@"; else command ls "$@"; fi }
  ll() { if [[ -t 0 ]]; then eza -alF --icons --group-directories-first "$@"; else command ls -alF "$@"; fi }
  la() { if [[ -t 0 ]]; then eza -A --icons "$@"; else command ls -A "$@"; fi }
  l()  { if [[ -t 0 ]]; then eza -CF --icons "$@"; else command ls -CF "$@"; fi }
fi
```

Then restart Claude Code so it rebuilds the shell snapshot (it copies aliases and functions from the rc file). Not done here: an `rtk` `exclude_commands` entry cannot help, since the problem is that rtk does not rewrite.

**If a heredoc command hangs for another reason**: capture it while stuck with `ps -o pid,ppid,stat,wchan:24,cmd --forest -g <pid>`; a process in `unix_stream_data_wait` or `pipe_read` with fd 0 open is waiting on stdin.
