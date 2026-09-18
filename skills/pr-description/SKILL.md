---
name: pr-description
description: Use when creating or updating a pull request and need to generate a title and description, or when asked to describe branch changes for a PR
---

# PR Description Generator

Write PR titles and descriptions that are concise, honest about impact, and sound like a human wrote them.

**REQUIRED SUB-SKILL:** Use skill:humanizer on final output before presenting to user.

## When to Use

- Creating a new PR (`gh pr create`)
- Updating an existing PR description
- User asks "write a PR description" or "describe my changes"

## The Process

```
1. Gather changes    → git diff, git log against base branch
2. Scan repo context → understand what areas the changes touch and what depends on them
3. Size the change   → small / medium / large (determines output format)
4. Write title       → short, specific, lowercase
5. Write description → proportional to change size
6. Add ticket link   → extract ticket number from branch name, append "Closes #<number>"
7. Humanize          → run output through humanizer patterns
8. Self-check        → verify format matches size rules
9. Present           → show to user, ready for gh pr create
```

### Step 1: Gather Changes

```bash
# Find base branch
BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null)

# What changed
git diff --stat $BASE..HEAD
git log --oneline $BASE..HEAD
git diff $BASE..HEAD  # read the actual diff
```

Read the actual diff. Don't guess from file names.

### Step 2: Scan Repo Context

Before writing, understand the blast radius:

- What modules/features do the changed files belong to?
- What other code imports or depends on changed files?
- Are there related config files, tests, or docs that were (or should have been) updated?
- Could this break anything downstream?

Mention impact only when it's real and non-obvious. Don't manufacture significance.

### Step 3: Size the Change

| Size   | Criteria                             | Output length         |
| ------ | ------------------------------------ | --------------------- |
| Small  | 1-3 files, <50 lines, single concern | 1-2 sentences         |
| Medium | 4-10 files, one feature or theme     | 3-5 bullet points     |
| Large  | 10+ files, multiple concerns         | Sections with bullets |

**This is the most important step.** A 1-line bugfix does NOT get Problem/Solution/Impact sections. A 15-file feature does NOT get a 2-sentence summary. Match output to change size.

### Step 4: Write the Title

Rules:

- Under 60 characters
- Lowercase (except proper nouns)
- Say what changed, not why
- No period at the end
- Prefix with type if repo uses conventional commits (check git log)

```
# Good
fix n+1 query in user list endpoint
add jwt authentication and password reset
split payment service into focused modules

# Bad
Fix: Resolve N+1 Query Performance Issue in User Repository ListUsers Method
Add JWT Authentication, Session Management, Password Reset, and Rate Limiting
Refactor: Enhance Payment Service Architecture for Better Maintainability
```

### Step 5: Write the Description

**Format based on size:**

**Small changes (1-3 files):**

```
The user list was running a separate query per row to load profiles.
Added a JOIN so it's one query. Fixes 30s load times with 500+ users.
```

That's it. No sections. No headers. No test plan for obvious changes.

**Medium changes (4-10 files):**

```
## What changed
- Extracted PaymentService (800 lines) into PaymentProcessor, RefundHandler, and WebhookReceiver
- Updated 8 import sites to use new module paths
- All 47 tests pass unchanged — no behavior changes

## Worth noting
- WebhookReceiver now owns all Stripe event routing, so new webhook types go there
- The old `paymentService` import path no longer exists
```

**Large changes (10+ files) — MUST include all 3 sections:**

1. `## What changed` — what was added/modified
2. `## Impact on existing code` — how this affects the rest of the codebase (callers, dependencies, config, deployment). Reviewers need this most.
3. `## Test plan` — non-obvious verification steps only (max 5 items)

Skipping the impact section is the most common mistake. If the change touches 10+ files, it affects something — say what.

```
## What changed
- JWT auth with login/register endpoints
- Redis session management
- Password reset flow (email → token → update)
- Rate limiting on auth endpoints
- Migrations for users, sessions, and reset_tokens tables

## Impact on existing code
- All existing endpoints (products, cart, orders) now sit behind the auth middleware
- Cart and order endpoints require a valid session token
- No changes to existing business logic

## Test plan
- Auth flow: register → login → access protected route → logout
- Password reset: request → verify email → use token → confirm new password works
- Rate limiting: hit login 10 times rapidly, confirm 429 response
```

**What to NEVER include:**

- Obvious test steps ("verify the endpoint returns 200")
- Promotional adjectives ("robust", "scalable", "comprehensive", "seamless")
- Motivation/justification sections for self-evident changes
- Tables restating what the bullets already say
- Horizontal rules between sections
- Bold-header bullet lists (`**Speed:** it's faster`)
- "No behavior changes" repeated multiple times
- Significance inflation ("pivotal", "crucial", "critical improvement")

### Step 6: Add Ticket Link

Extract the ticket number from the current branch name and append a closing reference at the end of the description.

```bash
# Get current branch name
git branch --show-current
# Example: story/28543/add-description-to-tar → ticket is 28543
```

Parse the ticket number from the branch name (typically the numeric segment after `story/`, `bug/`, `feature/`, or similar prefixes). Append to the very end of the description:

```
Closes #<ticket_number>
```

If the branch has no recognizable ticket number, skip this step silently — don't ask the user.

### Step 7: Humanize

Run the final title and description through `skill:humanizer` to remove AI-sounding language before presenting.

### Step 8: Self-Check

Before presenting, verify:

- Small change → no sections, just sentences? ✓
- Medium change → bullets with optional "Worth noting"? ✓
- Large change → has all 3 required sections (What changed, Impact, Test plan)? ✓
- Title under 60 chars and lowercase? ✓
- No red flag words (comprehensive, robust, seamless, leverage, pivotal, crucial)? ✓
- No bold-header bullets or horizontal rules? ✓

If any check fails, rewrite before presenting.

### Step 9: Present

Output the title and description as two separate markdown code blocks so the user can easily copy each one:

**Title:**

```
<title>
```

**Description:**

```
<description>
```

If the user wants to create the PR directly, use:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<description>
EOF
)"
```

## Common Mistakes

**Over-formatting small changes**
A 1-line fix with Problem/Solution/Impact/Test Plan sections. Match output to change size.

**Missing repo context**
Describing changes in isolation without mentioning what they affect. A new auth middleware that wraps all existing endpoints is important context.

**Padding the test plan**
Listing every possible manual test. Include only non-obvious verification steps. If the test plan is "run the tests", you don't need a test plan section.

**AI voice**
Using "enhances", "fosters", "ensures", "leveraging". Write like a person.

## Red Flags

If your PR description has any of these, rewrite it:

- More than 2 sections for a change under 5 files
- Any bullet starting with a bold header followed by a colon
- The word "comprehensive", "robust", "seamless", or "leverage"
- A test plan with more than 5 items
- A title over 60 characters
- Horizontal rules (`---`) between sections
