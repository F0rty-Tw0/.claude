---
name: "source-command-clean-claude"
description: "Migrated source command `clean-Codex`"
---

# source-command-clean-claude

Use this skill when the user asks to run the migrated source command `clean-claude`.

## Command Template

Clean up the ~/.Codex directory by removing old debug logs, transcripts, file history, shell snapshots, todos, and cache files. Optionally prune bloated JSONL conversation files.

## Steps

1. Run a dry-run first to show what would be cleaned:

```
node "$HOME\.Codex\scripts\clean-Codex.mjs" --deep
```

2. Show the report to the user and ask if they want to proceed.

3. If the user confirms, run the actual cleanup:

```
node "$HOME\.Codex\scripts\clean-Codex.mjs" --apply --deep
```

Report the before/after sizes to the user.
