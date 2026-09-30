---
name: pr-description
description: Writes PR titles and descriptions sized to the change, with a blast-radius-scaled Proof section behind a fresh code-review gate. Use when creating or updating a pull request or describing branch changes for one.
---

# PR Description Generator

Write PR titles and descriptions that are concise, honest about impact, and sound like a human wrote them.

For a long prose body, optionally polish it with skill:anthropic-skills:avoid-ai-writing; Red Flags below covers short ones.

## When to Use

- Creating a new PR (`gh pr create`)
- Updating an existing PR description
- User asks "write a PR description" or "describe my changes"

## The Process

```
0. Proof gate        → proof bundle + fresh adversarial review (code-review skill); BLOCK → stop and ask
1. Gather changes    → git diff, git log against base branch
2. Scan repo context → understand what areas the changes touch and what depends on them
3. Audience + size   → ask: for us or for someone else? then small / medium / large
4. Write title       → short, specific, lowercase
5. Write description → proportional to change size
6. Add ticket link   → extract ticket number from branch name, append "Closes #<number>"
7. Polish            → check Red Flags; optionally avoid-ai-writing
8. Present           → show to user, ready for gh pr create
```

### Before Step 0: One PR or Several?

Branch diff over ~400 changed lines, mixing trunk and leaf changes, or holding independent concerns → run skill:meaningful-prs first. It splits the branch and then runs this skill once per PR. For a stacked PR, `BASE` (Step 1) and the Step 0 review use the **parent branch**, the reviewer gets the stack map, and `## Stack` goes before `## Proof`. Called from `meaningful-prs`? Skip this routing step.

### Step 0: Proof Gate

Run skill:code-review. Every PR body carries a `## Proof` section — a hook (`hooks/pr-proof-guard.js`) blocks `gh pr create` without it.

1. **Build proof** — `code-review` `proof` mode (`references/proof.md`, `templates/pr-proof.md`). Re-run tests **fresh**; reuse executor/deep-executor `Proof` blocks only as leads, never as output. Bug fix → base-failure check. UI change → before/after screenshot pair (`references/proof.md`, Visual pair).
2. **Fresh review** — `code-review` review mode on `<base>...HEAD`. It dispatches an independent reviewer; do not review your own work in this session.
3. **Verdict gate:**
   - `BLOCK — …` → **do not open the PR.** Show the blockers, then AskUserQuestion: *fix first (Recommended)* / *open as draft with blockers listed in Proof*. Only open (draft, `gh pr create --draft`) on the user's explicit choice.
   - `APPROVE — …` → continue.
   - UI change without its before/after pair → same as BLOCK: say why it's missing and ask *capture first (Recommended)* / *open without, gap listed in Not verified*. UI PRs used to ship with no screenshots at all.
4. **Scale proof to blast radius** — keep small PRs small. (For-us format. The for-someone-else format in Step 3 always uses its compact Proof instead.)

| Class | `## Proof` contains |
|---|---|
| Leaf | Test command + counts, visual/log for visible change, **Not verified** line, review verdict — ~4 lines |
| Branch | + base-failure check (bug fix), one non-mocked runtime log |
| Trunk | Full `templates/pr-proof.md`: gate, rollback, invariants, canary metric, human must deep-read list |

Updating a PR after new commits → re-run Step 0 (1–3) and replace the `## Proof` section; stale proof is no proof.

Screenshots go in with `gh pr create --attach <path>`, one flag per file, and the body references the same paths.

Run `git push` and `gh pr create` as **separate** Bash calls. If the hook blocks a chained call, the push never runs, but commit-guard has already used up its one-shot flag.

### Step 1: Gather Changes

```bash
# Base: PARENT=<parent-branch> for a stacked PR, else the repo default (never assume main)
DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null)
DEFAULT=${DEFAULT:-$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')}
BASE=$(git merge-base HEAD "origin/${PARENT:-$DEFAULT}")
[ -n "$BASE" ] || { echo "cannot resolve base branch; ask the user" >&2; exit 1; }

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

### Step 3: Audience, then Size

**Ask first** with AskUserQuestion: *Who is this PR for?* Ask once per PR, or once for a whole `meaningful-prs` stack.

- **For us (Recommended in own repos)** — our repo or team. Use the size-based format below with the full blast-radius `## Proof` from Step 0. Some extra context is fine.
- **For someone else** — upstream, OSS, another team, a reviewer without our context. **Very short, nothing else:**

```
<title>

<1–3 sentences: what changed, and why if not obvious>

## Stack            ← only if stacked, 1–3 lines
## Proof
- Blast radius: <Leaf|Branch|Trunk> <n>/10 — rollback: <flag off | revert | …>
- Tests: `<cmd>` → <pass/fail counts>
- Verified: <one line>
- Not verified: <one line>
- Blockers: <one line each>   ← only on a draft opened despite BLOCK
<before/after table, UI changes only>

Closes #<n>         ← only if the branch has a ticket
```

  No `What changed` / `Impact` / `Test plan` sections, no review history, no deep-read list. For the external format, the size table below does not apply.

### Size (for-us format)

| Size   | Criteria                             | Output length         |
| ------ | ------------------------------------ | --------------------- |
| Small  | 1-3 files, <50 lines, single concern | Plain sentences, no sections |
| Medium | 4-10 files, one feature or theme     | Short bullet list     |
| Large  | 10+ files, multiple concerns         | Sections with bullets |

Match output to change size: a 1-line bugfix gets no Problem/Solution/Impact sections, and a 15-file feature gets more than a 2-sentence summary.

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

**Large changes (10+ files) — all 3 sections:**

1. `## What changed` — what was added/modified
2. `## Impact on existing code` — how this affects the rest of the codebase (callers, dependencies, config, deployment). Reviewers need this most.
3. `## Test plan` — non-obvious verification steps only

Don't skip the impact section: a change touching 10+ files affects something, so say what.

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

**Keep it plain:** state what changed in factual words, include only non-obvious test steps, explain motivation only
when it isn't self-evident, and use plain bullets and headings; say "no behavior changes" once if it applies.
Red Flags below lists the specific tells to rewrite.

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

### Step 7: Polish

Check the title and description against Red Flags. For a long prose body, optionally run `skill:anthropic-skills:avoid-ai-writing`. Edit prose only; leave the `## Proof` section's commands, output, and verdict verbatim.

Append the `## Proof` section at the end of the body, before `Closes #…`: the class-scaled one from Step 0 for us, or the compact one from Step 3 for someone else. It does not count toward the size-based section limits.

### Step 8: Present

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

- More than 2 sections for a change under 5 files (`## Proof` excluded)
- No `## Proof` section, or proof claims ("tests pass", "verified") with no pasted output
- Any bullet starting with a bold header followed by a colon
- The word "comprehensive", "robust", "seamless", or "leverage"
- A test plan padded with obvious steps
- A title over 60 characters
- Horizontal rules (`---`) between sections
