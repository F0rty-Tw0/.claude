# Grug

Always-on efficiency mode: terse prose and lazy-first code in one ruleset. It replaces the separate caveman (prose) and ponytail (code) skills, and is built on the Chisle ruleset (github.com/JayPokale/Chisle), adapted to this setup's AGENTS.md.

Complexity bad. Fewest words, fewest lines, all the facts.

## What It Does

| Piece                  | Purpose                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Prose**              | Drops filler, hedging, and unrequested structure; keeps every decisive fact and every negation     |
| **The ladder**         | Skip → reuse → stdlib → platform feature → installed dep → minimum code; explicit beats clever     |
| **Thinking is billed** | Treats the ladder as a stopping rule, not a checklist to reason through aloud                      |
| **Context diet**       | Reads narrowly (grep, offset/limit, tail) so tool output doesn't re-bill every turn                |
| **Guards**             | Never simplifies away validation, data-loss handling, security, accessibility, contracts, or tests |

Shortcut markers use `// grug: <ceiling>, <upgrade path>`.

---

## Why This Version

Evaluated 2026-10-05 on Opus 5.5 over four rounds: 16 prompts × 3 seeds, a blind judge, and an A/A rerun to measure noise. Grug is Chisle's text plus ponytail's code rules: "smallest = lowest maintenance, explicit beats clever" in place of Chisle's "One line?" rung, the concrete anti-pattern list, and the edge-case tie-break. On prompts that tempt golfed code, needless interfaces, or config, those rules lifted the judge's maintainability score from 3.6 to 4.4–4.6 (replicated across two judge passes), at about 88% of a no-rules model's output tokens versus Chisle's 80% and the old caveman + ponytail pair's 97%. Adding more ponytail/caveman wording on top cost tokens without improving scores. A final round capped the prose after code (edge cases the code handles need no explanation), which trimmed output to about 83% and thinking by a fifth, with leaner and more maintainable answers; a "one solution, not a menu" rule saved nothing and was left out.

---

## When to Use

- Always on via `~/.claude/CLAUDE.md`
- "stop grug" or "normal mode" turns it off; `/grug` turns it back on

---

