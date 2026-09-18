# PR Review Comment Writing Style Guide

## Tone

- Technical, constructive, and specific
- Point out the issue, explain why it matters, suggest a fix
- No condescension ("Obviously...", "You should know...")
- No vague complaints ("This doesn't look right")
- No performative praise ("Nice work overall but...")
- Cite evidence: line numbers, code snippets, documentation

## Comment Structure

### When pointing out a factual error:
```
**Factual error: [brief label].**

The README states _"[quoted claim]"_ but the actual implementation in `ClassName.MethodName()` ([File.cs:L1-L2](full-url)) uses:
```code
// actual code snippet
```
[Explain the discrepancy and why it matters.]
```

### When something is missing:
```
**Missing: `SettingName`.**

[What it does and why it matters]. Defined in [File.cs:L](full-url) with default `value`. Should be included because [reason].
```

### When suggesting an improvement:
```
**Suggestion:** [What could be better and why.]

[Optional: concrete example of the improvement.]
```

### When asking a question:
```
[Direct question about the code/design choice.] [Context for why you're asking.]
```

## Severity Prefixes

Use bold severity labels at the start of comments to signal importance:

- `**Factual error:**` - Something is wrong and will mislead readers
- `**Missing:**` - Important information is absent
- `**Scope concern:**` - The change doesn't cover what it should
- `**Suggestion:**` - Could be better but not blocking
- `**Nitpick:**` - Minor style/formatting issue
- `**Question:**` - Genuine question, not a veiled criticism

## Code References

Always link code with a full, permanent URL to the exact line range (your host's permalink). Format:
```
[FileName.cs:L1-L2](https://<repo-host>/<org>/<repo>/blob/<branch>/path/to/file#L1-L2)
```

## Rules

1. One concern per comment thread — don't bundle unrelated issues
2. Lead with the severity label, not preamble
3. Always include evidence: code snippet, line reference, or link
4. Suggest a fix, not just point out a problem
5. Match technical depth to the issue — brief for nitpicks, detailed for errors
6. Use markdown formatting: bold for labels, backticks for code, blockquotes for quoted text
7. Reference related tickets and PRs by ID using your platform's linking syntax (e.g. `#123`)

## Adapting to the PR Author

Always use `persona-giga` (`~/.claude/personas/persona-giga.md`) as the writing persona for all PR review comments.

Load the persona before writing comments. Adapt:
- **Detail level**: Prescriptive reviewers expect precise comments; collaborative authors prefer questions
- **Focus areas**: Align comments with what the author typically cares about
- **Tone**: Match the team's communication style

## AI Writing Check

Before publishing any written text (PR comments, descriptions, documentation, commit messages), apply the `humanizer` skill as a final pass. Scan your output for AI writing patterns — especially:

- Significance inflation ("pivotal", "crucial", "key role")
- Filler phrases ("it's important to note", "in order to")
- Sycophantic openers ("Great question!", "Absolutely!")
- Em dash overuse, rule-of-three lists, bold-header bullet lists
- Generic positive conclusions, transition summaries ("Overall", "In conclusion")

If you catch yourself writing like a chatbot, rewrite before posting. Use `skill:humanizer` for the full pattern catalog when unsure.

## Anti-patterns

- "This is wrong" -> "**Factual error:** [what's wrong, what's correct, evidence]"
- "You forgot X" -> "**Missing:** [what's missing and why it matters]"
- "Why did you do this?" -> "**Question:** [specific question with context for asking]"
- "LGTM" without actually reviewing -> never; verify every claim first
- Piling on nitpicks without substantive feedback -> prioritize real issues
