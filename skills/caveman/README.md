# Caveman Skill

Terse response register for Claude Code. Cuts filler while keeping full technical accuracy.

## Usage

```
/caveman              # activate (default: lite)
/caveman lite         # professional but tight (default)
/caveman full         # classic caveman
/caveman ultra        # maximum compression
```

## Deactivation

Say `stop caveman` or `normal mode` to revert.

## Intensity Levels

| Level | Style                                    |
| ----- | ---------------------------------------- |
| lite  | No filler/hedging, full sentences        |
| full  | Drop articles, fragments, short synonyms |
| ultra | Abbreviations, arrows, single words      |

## How It Works

**Drops:** articles (a/an/the), filler words, pleasantries, hedging language

**Keeps:** technical terms exact, code blocks unchanged, error messages quoted verbatim, negations (not/never/no/only/except), numbers and units

**Pattern:** `[thing] [action] [reason]. [next step].`

## Examples

> "Why does my React component re-render?"

- **lite:** "Your component re-renders because you create a new object reference each render. Wrap it in `useMemo`."
- **full:** "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."
- **ultra:** "Inline obj prop → new ref → re-render. `useMemo`."

## Safety

Caveman mode automatically disengages for:

- Security warnings
- Irreversible action confirmations
- Multi-step sequences where fragments risk misread
- Statements that dropped words would make ambiguous

Resumes after the critical section.

## Boundaries

- Anything saved outside the chat (code, comments, commits, PRs, docs, issues, memory files, messages to others) is written in normal language
- Persists across all responses until deactivated
- Level persists until changed or session ends

## Credits

Adapted from [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), MIT License, Copyright (c) 2026 Julius Brussee. See [LICENSE](LICENSE).
