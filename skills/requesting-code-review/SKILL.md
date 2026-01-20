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

**5. Highlight issues in code with solutions:**

After subagent review:

- Read the actual files mentioned in the review
- Show specific code snippets with line numbers
- Highlight problematic code with comments (❌ for issues)
- Provide concrete fix with corrected code snippet
- Show before/after for clarity

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
7. Show code snippets with lwith ❌ markers on problematic lines]
     [Provide concrete solution with ✅ corrected code]
     [Use multi_replace_string_in_file if user approves fixes
[Subagent returns review with issues]

You: [Read files mentioned in review]
     [Show highlighted code snippets]
     [Explain specific fixes needed]
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
