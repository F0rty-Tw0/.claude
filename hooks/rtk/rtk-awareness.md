# RTK - Rust Token Killer

**Version**: 0.31.0
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
rtk rewrite <cmd>     # Show what rtk would rewrite a command to (exits 1 if no rewrite)
```

## Hook-Based Usage

All commands are automatically rewritten by the Claude Code hook (`~/.claude/hooks/rtk/rtk-rewrite.js`).
The hook delegates to `rtk rewrite` — the Rust binary is the single source of truth for all rewrite rules.
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

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

No need to update hook rules — `rtk rewrite` handles everything.
