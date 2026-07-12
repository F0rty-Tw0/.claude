---
name: note
description: Use when the user wants to save context to a persistent notepad for compaction resilience -- session notes, priority facts, or permanent manual entries.
---

# Note Skill

Save important context to `.claude/local/notepad.md` so it survives conversation compaction.

## Usage

| Command                     | Action                                        |
| ---------------------------- | --------------------------------------------- |
| `note <content>`            | Add to Working Memory with timestamp          |
| `note --priority <content>` | Add to Priority Context                       |
| `note --manual <content>`   | Add to MANUAL section (never pruned)          |
| `note --show`               | Display current notepad contents              |
| `note --prune`              | Remove entries older than 7 days              |
| `note --clear`               | Clear Working Memory (keep Priority + MANUAL) |

## Sections

### Priority Context (500 char limit)

- Reserved for critical facts: "Project uses pnpm", "API in src/api/client.ts"
- Keep it SHORT -- read it back at the start of a session with `note --show`, since nothing auto-loads it

### Working Memory

- Timestamped session notes
- Auto-pruned after 7 days
- Good for: debugging breadcrumbs, temporary findings

### MANUAL

- Never auto-pruned
- User-controlled permanent notes
- Good for: team contacts, deployment info

## Examples

```
note Found auth bug in UserContext - missing useEffect dependency
note --priority Project uses TypeScript strict mode, all files in src/
note --manual Contact: api-team@company.com for backend questions
note --show
note --prune
```

## Behavior

1. Creates `.claude/local/notepad.md` if it doesn't exist
2. Parses the argument to determine section
3. Appends content with timestamp (for Working Memory)
4. Warns if Priority Context exceeds 500 chars
5. Confirms what was saved

## Integration

Notepad content is not auto-loaded on session start -- there is no hook wired up for it (checked `.claude/settings.json`, no `notepad`-related hook exists). To bring it back into context, read it back manually with `note --show` or `Read .claude/local/notepad.md`, or invoke `/note --show` at the start of a session. This still helps survive conversation compaction: content written here persists in the file even after older turns are summarized away, as long as you read it back.
