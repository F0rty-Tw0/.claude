# RTK - Rust Token Killer

**Version**: 0.22.0
**Binary**: `~/bin/rtk.exe`
**Usage**: Token-optimized CLI proxy (60-90% savings on dev operations)

## Meta Commands (always use rtk directly)

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk cc-economics      # Spending vs savings analysis
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
rtk hook-audit        # Hook rewrite audit metrics (requires RTK_HOOK_AUDIT=1)
```

## Installation Verification

```bash
rtk --version         # Should show: rtk 0.22.0
rtk gain              # Should work (not "command not found")
which rtk             # Verify correct binary (~/bin/rtk.exe)
```

⚠️ **Name collision**: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## Hook-Based Usage

All other commands are automatically rewritten by the Claude Code hook (`~/.claude/hooks/rtk/rtk-rewrite.js`).
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

### Auto-Rewritten Commands (59 rules)

| Category | Commands |
|---|---|
| **Git** (12) | status, diff, log, add, commit, push, pull, branch, fetch, stash, show, worktree |
| **GitHub CLI** (1) | gh pr/issue/run/repo/search/label/release/api/auth |
| **File ops** (7) | cat→read, rg/grep→grep, ls, find, wc, env/printenv→env, diff→diff |
| **JS/TS** (17) | vitest, pnpm test, pnpm run test, tsc/npx tsc, pnpm tsc, eslint/npx eslint, pnpm lint, prettier/npx prettier, playwright/npx playwright, pnpm playwright, prisma/npx prisma, npx, npm run, npm view, pnpm nx→npx nx, next build/dev, pnpm next |
| **pnpm mgmt** (3) | pnpm list/ls/outdated, pnpm run typecheck/tsc→tsc, pnpm run lint→eslint |
| **Rust** (4) | cargo test/build/check/clippy |
| **Python** (6) | pytest, python -m pytest, ruff check/format, black/ruff format→format, pip list/outdated/install/show, uv pip→pip |
| **Go** (4) | go test/build/vet, golangci-lint |
| **Containers** (2) | docker ps/images/logs, kubectl get/logs |
| **Network** (2) | curl, wget |
| **.NET** (1) | dotnet build/test/run/restore/publish/clean (via proxy) |

Note: JS/TS rules use `rtk err cmd /c` wrapper on Windows since RTK can't resolve .CMD wrappers directly. See [rtk-ai/rtk#212](https://github.com/rtk-ai/rtk/issues/212). Once fixed upstream, these rules can be simplified to use native rtk commands (e.g., `rtk vitest`, `rtk tsc`).

### Available but NOT auto-rewritten (manual use)

| Command | Use case |
|---|---|
| `rtk smart <file>` | 2-line technical summary of a file |
| `rtk summary <cmd>` | Heuristic summary of any command output |
| `rtk json <file>` | Show JSON structure without values |
| `rtk deps` | Summarize project dependencies |
| `rtk log` | Filter/deduplicate log output (pipe or file) |
| `rtk tree` | Compact directory tree (requires native `tree` installed) |

## Updating RTK

To update RTK to a new version:

1. **Check the latest release**:
   https://github.com/rtk-ai/rtk/releases

2. **Download the Windows binary**:
   ```bash
   curl -fsSL -o /tmp/rtk-update.zip "https://github.com/rtk-ai/rtk/releases/download/vX.Y.Z/rtk-x86_64-pc-windows-msvc.zip"
   ```

3. **Extract and replace**:
   ```bash
   unzip -o /tmp/rtk-update.zip -d /tmp/rtk-update
   cp /tmp/rtk-update/rtk.exe ~/bin/rtk.exe
   ```

4. **Verify**:
   ```bash
   rtk --version
   ```

5. **Check for new commands**:
   ```bash
   rtk --help
   ```
   Compare against the hook rules in `~/.claude/hooks/rtk/rtk-rewrite.js` and add rewrites for any new commands worth auto-proxying.

6. **Update this file** with the new version number and any new commands.
