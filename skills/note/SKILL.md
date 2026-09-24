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

### Which section?

| If the fact is...                                | Use            |
| -------------------------------------------------- | --------------- |
| Short, needed every session (stack, entry point)  | `--priority`    |
| Temporary — a debugging trail, a finding to revisit | plain (Working) |
| Permanent and non-critical (contacts, deploy URLs) | `--manual`      |

## Failure Modes

- Priority Context silently exceeds 500 chars → trim it, don't let old entries push out new ones
- Nothing reads the notepad back → it isn't auto-loaded; say `/note --show` explicitly, don't assume it's in context
- A permanent fact lands in Working Memory → gets pruned after 7 days; move it to `--manual`
- Same fact re-added every session → check `--show` before appending duplicates

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

Notepad content is not auto-loaded; read it back with `note --show` (or `Read .claude/local/notepad.md`) at the start of a session or after compaction. The file persists after older turns are summarized away, so anything written here survives compaction once read back.
