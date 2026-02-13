Clean up the ~/.claude directory by removing old debug logs, transcripts, file history, shell snapshots, todos, and cache files. Optionally prune bloated JSONL conversation files.

## Steps

1. Run a dry-run first to show what would be cleaned:

```
node C:\Users\artio\.claude\scripts\clean-claude.mjs --deep
```

2. Show the report to the user and ask if they want to proceed.

3. If the user confirms, run the actual cleanup:

```
node C:\Users\artio\.claude\scripts\clean-claude.mjs --apply --deep
```

Report the before/after sizes to the user.
