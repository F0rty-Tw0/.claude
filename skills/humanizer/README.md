# Humanizer

Audit and rewrite text to remove signs of AI-generated writing.

## Modes

- **`rewrite`** (default) — flag AI-isms and rewrite the text to fix them, with a second-pass audit of the rewrite itself.
- **`detect`** — flag only, no rewriting. Triggered by "detect," "flag only," "audit only," "just flag," "scan," or "what AI patterns are in this."

## What It Does

Scans for and rewrites these categories of AI patterns:

| Category                  | Examples                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| **Tiered vocabulary**     | Tier 1 always-flag (delve, tapestry, robust), Tier 2 cluster-only (harness, foster, streamline), Tier 3 density-only (significant, innovative) |
| **Content**               | Significance inflation, promotional language, vague attributions, novelty inflation, emotional flatline, false concession |
| **Sentence structure**    | Negative parallelisms, copula avoidance, rule of three, synonym cycling, hollow intensifiers |
| **Style & formatting**    | Em dashes, bold overuse, inline-header lists, emojis, title case, excessive structure, numbered list inflation |
| **Communication**         | Chatbot artifacts, sycophancy, acknowledgment loops, "let's explore," rhetorical questions, reasoning chain artifacts |
| **Filler & hedging**      | Filler phrases, parenthetical hedging, generic conclusions, transition summaries, confidence calibration stacking |
| **Template phrases**      | Slot-fill constructions ("Whether you're X or Y," "a [adj] step towards [adj] AI") |
| **Rhythm & uniformity**   | Sentence length uniformity, paragraph length uniformity, read-aloud test, over-polishing warning |

Also emphasizes adding personality: opinions, varied rhythm, first-person perspective, and specificity about feelings.

## Severity tiers (for triage)

- **P0** — Credibility killers (cutoff disclaimers, chatbot artifacts, vague attributions, significance inflation)
- **P1** — Obvious AI smell (Tier 1 vocab, template phrases, "let's" openers, synonym cycling, em dashes)
- **P2** — Stylistic polish (generic conclusions, rule of three, uniform paragraphs, copula avoidance, "Moreover")

Quick passes fix P0+P1. Full audit covers all three.

## Context profiles

Adjust rule strictness based on the text type. Auto-detected from content cues if not specified:

- **`linkedin`** — short-form social; relaxed on formatting, strict on voice
- **`blog`** — default; all rules at full strength
- **`technical-blog`** — technical terms get a pass (robust, ecosystem, leverage in technical context)
- **`investor-email`** — extra strict on promotional language and significance inflation
- **`docs`** — clarity over voice; relaxed on em dashes, emoji, hedging
- **`casual`** — only catches P0 offenders

## When to Use

- Edit AI-drafted content before publishing
- Review text that sounds "off" or generic
- Polish docs, articles, or messages that feel robotic
- Audit published content without rewriting it (detect mode)

## When NOT to Use

- Technical documentation where precision matters more than voice
- Code comments, API docs, changelogs
- Legal or compliance text with required phrasing
