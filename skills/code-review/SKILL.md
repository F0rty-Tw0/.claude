---
name: code-review
description: Use when the user requests "review this code" or "code review", before merging a pull request, after implementing a major feature, or when a quality assessment of code changes is wanted.
---

# Code Review Skill

Conduct a thorough code review for quality, security, and maintainability with severity-rated feedback.

## When to Use

This skill activates when:

- User requests "review this code", "code review"
- Before merging a pull request
- After implementing a major feature
- User wants quality assessment

## What It Does

Delegates to the `code-reviewer` agent (Opus model) for deep analysis:

1. **Identify Changes**
   - Run `git diff` to find changed files
   - Determine scope of review (specific files or entire PR)

2. **Review Categories**: Security, Code Quality, Performance, Best Practices, Maintainability -- see the full
   `## Review Checklist` below for the concrete items in each

3. **Severity Rating**
   - **CRITICAL** - Security vulnerability (must fix before merge)
   - **HIGH** - Bug or major code smell (should fix before merge)
   - **MEDIUM** - Minor issue (fix when possible)
   - **LOW** - Style/suggestion (consider fixing)

4. **Specific Recommendations**
   - File:line locations for each issue
   - Concrete fix suggestions
   - Code examples where applicable

## Agent Delegation

```
Agent(
  subagent_type="code-reviewer",
  model="opus",
  prompt="CODE REVIEW TASK

Review code changes for quality, security, and maintainability.

Scope: [git diff or specific files]

Apply the Review Checklist below. Output a code review report with:
- Files reviewed count
- Issues by severity (CRITICAL, HIGH, MEDIUM, LOW)
- Specific file:line locations
- Fix recommendations
- Approval recommendation (APPROVE / REQUEST CHANGES / COMMENT)"
)
```

## External Model Consultation (Preferred)

The code-reviewer agent SHOULD consult `mcp__agentic-mcp__review_codex` for cross-validation.

### Protocol

1. **Form your OWN review FIRST** - Complete the review independently
2. **Consult for validation** - Cross-check findings with `review_codex`
3. **Critically evaluate** - Never blindly adopt external findings
4. **Graceful fallback** - Never block if tools unavailable

### When to Consult

- Security-sensitive code changes
- Complex architectural patterns
- Unfamiliar codebases or languages
- High-stakes production code

### When to Skip

- Simple refactoring
- Well-understood patterns
- Time-critical reviews
- Small, isolated changes

### Tool Usage

Before first MCP tool use, call `ToolSearch("mcp")` to discover deferred MCP tools. Use `mcp__agentic-mcp__review_codex`
for the cross-check. If ToolSearch finds no MCP tools or agentic-mcp is unavailable, fall back to the `code-reviewer`
Claude agent alone -- never block on external tools.

## Output Format

```
CODE REVIEW REPORT
==================

Files Reviewed: 8
Total Issues: 15

CRITICAL (0)
-----------
(none)

HIGH (3)
--------
1. src/api/auth.ts:42
   Issue: User input not sanitized before SQL query
   Risk: SQL injection vulnerability
   Fix: Use parameterized queries or ORM

MEDIUM (7)
----------
...

LOW (5)
-------
...

RECOMMENDATION: REQUEST CHANGES

Critical security issues must be addressed before merge.
```

## Review Checklist

The code-reviewer agent checks:

### Security

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs sanitized
- [ ] SQL/NoSQL injection prevention
- [ ] XSS prevention (escaped outputs)
- [ ] CSRF protection on state-changing operations
- [ ] Authentication/authorization properly enforced

### Code Quality

- [ ] Functions < 50 lines (guideline)
- [ ] Cyclomatic complexity < 10
- [ ] No deeply nested code (> 4 levels)
- [ ] No duplicate logic (DRY principle)
- [ ] Clear, descriptive naming

### Performance

- [ ] No N+1 query patterns
- [ ] Appropriate caching where applicable
- [ ] Efficient algorithms (avoid O(n²) when O(n) possible)
- [ ] No unnecessary re-renders (React/Vue)

### Best Practices

- [ ] Error handling present and appropriate
- [ ] Logging at appropriate levels
- [ ] Documentation for public APIs
- [ ] Tests for critical paths
- [ ] No commented-out code

## Approval Criteria

**APPROVE** - No CRITICAL or HIGH issues, minor improvements only **REQUEST CHANGES** - CRITICAL or HIGH issues present
**COMMENT** - Only LOW/MEDIUM issues, no blocking concerns

## Use with Other Skills

**As a sequential agent chain:**

Drive it manually: `explore` -> `architect` -> `critic` -> `executor`, folding each stage's findings into the next prompt,
with this skill's `code-reviewer` delegation standing in for the `critic` stage.

**With Ralph:**

```
/ralph code-review then fix all issues
```

Review code, get feedback, fix until approved.

**With Ultrawork:**

```
/ultrawork review all files in src/
```

Parallel code review across multiple files.

## Best Practices

- **Review early** - Catch issues before they compound
- **Review often** - Small, frequent reviews better than huge ones
- **Address CRITICAL/HIGH first** - Fix security and bugs immediately
- **Consider context** - Some "issues" may be intentional trade-offs
- **Learn from reviews** - Use feedback to improve coding practices
