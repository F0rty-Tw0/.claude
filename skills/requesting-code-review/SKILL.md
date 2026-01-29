---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Dispatch agents:code-reviewer subagent to catch issues before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**

- After each task in subagent-driven development
- After completing major feature
- Before merge to master

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/master
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code-reviewer subagent:**

Use Task tool with agents:code-reviewer type, fill template at `code-reviewer.md`

**Placeholders:**

- `{WHAT_WAS_IMPLEMENTED}` - What you just built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
- `{DESCRIPTION}` - Brief summary

**3. Act on feedback:**

- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

**4. Highlight issues in code with solutions:**

After subagent review:

- Read the actual files mentioned in the review
- Show specific code snippets with line numbers
- Highlight problematic code with comments (❌ for issues)
- Provide concrete fix with corrected code snippet
- Show before/after for clarity

**5. Generate PR Title and Description:**

After addressing review feedback, create a comprehensive PR description in markdown format:

- **Title**: Use conventional commit format (feat/fix/refactor/etc)
- **Summary**: Brief overview of what changed and why
- **What's Changed**: Detailed breakdown of new features, improvements, fixes
- **Breaking Changes**: Clearly mark and explain any breaking changes
- **Testing**: Summary of test coverage and verification
- **Example**: Include request/response examples for API changes
- **Related**: Link to story/issue number

Template structure:
```markdown
# <type>: <Short description>

## Summary
[1-2 sentences explaining the change and motivation]

## What's Changed
### New Features
- [Feature descriptions with technical details]

### Improvements
- [Enhancement descriptions]

### Breaking Changes
⚠️ [If any, explain impact and migration path]

## Testing
- ✅ [Test results and coverage summary]

## Example
[Request/response examples for APIs, or usage examples for libraries]

## Related
Story #[NUMBER]
```

## Example

```
[User requests: "Review this pull request"]

You:
1. Run: git branch --show-current
2. Run: git log --oneline -10
3. Run: git rev-parse HEAD
4. Determine base branch (master/main/develop)
5. Dispatch runSubagent with code-reviewer prompt
6. After review, read files with issues to highlight problematic code
7. Show code snippets with ❌ markers on problematic lines
8. Provide concrete solution with ✅ corrected code
9. Use multi_replace_string_in_file if user approves fixes
10. After fixes applied, generate PR title and description in markdown

[Subagent returns review with issues]

You: [Read files mentioned in review]
     [Show highlighted code snippets]
     [Explain specific fixes needed]
     [Apply fixes if approved]
     [Generate PR description with summary, changes, testing, examples]
```

## Integration with Workflows

**Subagent-Driven Development:**

- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**

- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-Hoc Development:**

- Review before merge
- Review when stuck

## Red Flags

**Never:**

- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**

- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: requesting-code-review/code-reviewer.md
