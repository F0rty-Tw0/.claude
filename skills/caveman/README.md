# Caveman Skill

Ultra-compressed communication mode for Claude Code. Cuts token usage ~75% while keeping full technical accuracy.

## Usage

```
/caveman              # activate (default: full intensity)
/caveman lite         # professional but tight
/caveman full         # classic caveman (default)
/caveman ultra        # maximum compression
/caveman wenyan-lite  # semi-classical Chinese
/caveman wenyan-full  # full classical Chinese
/caveman wenyan-ultra # extreme classical Chinese compression
```

## Deactivation

Say `stop caveman` or `normal mode` to revert.

## Intensity Levels

| Level | Style | Token Savings |
|-------|-------|---------------|
| lite | No filler/hedging, full sentences | ~40% |
| full | Drop articles, fragments, short synonyms | ~65% |
| ultra | Abbreviations, arrows, single words | ~75% |
| wenyan-lite | Classical Chinese register, grammar intact | ~50% |
| wenyan-full | Full classical Chinese terseness | ~80-90% |
| wenyan-ultra | Extreme classical compression | ~90%+ |

## How It Works

**Drops:** articles (a/an/the), filler words, pleasantries, hedging language

**Keeps:** technical terms exact, code blocks unchanged, error messages quoted verbatim

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

Resumes after the critical section.

## Boundaries

- Code, commits, and PRs are always written in normal language
- Persists across all responses until deactivated
- Level persists until changed or session ends
