---
name: open-pr
description: Writes compact PR titles and descriptions with a before/after Proof section behind a fresh code-review gate. Use when creating or updating a pull request or describing branch changes for one.
---

# Open PR

Write PR titles and descriptions that are concise, honest about impact, and sound like a human wrote them. Analyze fully; write only what a reviewer needs to decide.

## When to Use

- Creating a new PR (`gh pr create`)
- Updating an existing PR description
- User asks "write a PR description" or "describe my changes"

## The Process

```
0. Proof gate        → proof bundle + fresh adversarial review (code-review skill); BLOCK → stop and ask
1. Gather changes    → git diff, git log against base branch
2. Scan repo context → understand what areas the changes touch and what depends on them
3. Write body        → compact template, same for every PR
4. Write title       → short, specific, lowercase
5. Write summary     → 1–3 sentences, whatever the size
6. Polish            → check Red Flags
7. Present           → show to user, ready for gh pr create
```

Blast radius, test counts, ticket numbers, and branch details are for your own orientation while building proof. They never go in the body.

### Before Step 0: One PR or Several?

Branch diff over ~400 changed lines, mixing trunk and leaf changes, or holding independent concerns → run skill:meaningful-prs first. It splits the branch and then runs this skill once per PR. For a stacked PR, `BASE` (Step 1) and the Step 0 review use the **parent branch**, the reviewer gets the stack map, and `## Stack` goes before `## Proof`. Called from `meaningful-prs`? Skip this routing step.

### Step 0: Proof Gate

Run skill:code-review. Every PR body carries a `## Proof` section — a hook (`hooks/pr-proof-guard.js`) blocks `gh pr create` without it, or without a `Before:`/`After:` pair (or `| Before | After |` table) under it.

1. **Build proof** — `code-review` `proof` mode (`references/proof.md`, `templates/pr-proof.md`). Re-run tests **fresh**; reuse executor/deep-executor `Proof` blocks only as leads, never as output. Bug fix → base-failure check. Every PR → before/after pair of the change running: screenshot for UI, CLI/console/HTTP output otherwise. Test output or the diff never counts as the pair (`references/proof.md`, Before/after pair).
2. **Fresh review** — `code-review` review mode on `<base>...HEAD`. It dispatches an independent reviewer; do not review your own work in this session.
3. **Verdict gate:**
   - `BLOCK — …` → **do not open the PR.** Show the blockers, then AskUserQuestion: *fix first (Recommended)* / *open as draft with blockers listed in Proof*. Only open (draft, `gh pr create --draft`) on the user's explicit choice.
   - `APPROVE — …` → continue.
   - No before/after pair (the reviewer reports it as a proof gap) → same as BLOCK: say why it's missing and ask *capture first (Recommended)* / *open as draft with `Before: not captured — <why>` and the gap in Not verified*. PRs used to ship with proof that code was written, not that it worked.
4. **Trim for the body** — the full proof bundle (blast radius, test counts, gate, invariants) stays with you. Only the compact `## Proof` from Step 3 goes in the body.

Updating a PR after new commits → re-run Step 0 (1–3) and replace the `## Proof` section; stale proof is no proof.

Screenshots go in with `gh pr create --attach <path>`, one flag per file, and the body references the same paths. Every later create or edit that sends a body (`--body`, `--body-file`) repeats the same `--attach` flags: the body still holds local paths, and without them it overwrites the hosted URLs and the images break.

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

### Step 3: Write Body

Every PR gets the same compact body, because long bodies go unread and bury the proof.

```
<title>

<1–3 sentences: what changed, and why if not obvious>

<optional sketch: one fenced block, Step 5>

## Stack            ← only if stacked, 1–3 lines
## Proof
- Before: `<same cmd / steps on base>` → <old output or behavior>   ← screenshot table below for UI
- After: `<same cmd / steps on head>` → <new output or behavior>
- Verified: <one line>
- Not verified: <one line>
- Review: <verdict> @ <short sha>
- Blockers: <one line each>   ← only on a draft opened despite BLOCK

<before/after screenshot table for UI changes, or fenced output when one line can't show it; the blank line above keeps GitHub from rendering it as text inside the last bullet>
```

No `What changed` / `Impact` / `Test plan` sections, no review history, no blast radius, test counts, `Closes #`, or `<details>` block. A non-obvious impact from Step 2 (callers, config, deploy order) gets one sentence in the summary.

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

### Step 5: Write the Summary

1–3 sentences whatever the size; the diff shows the size, the summary says what a reviewer can't see in it.

```
The user list was running a separate query per row to load profiles.
Added a JOIN so it's one query. Fixes 30s load times with 500+ users.
```

A 15-file feature is no longer, it just picks its sentences harder:

```
Adds JWT auth (login, register, password reset) with Redis sessions and rate limiting.
Every existing endpoint now sits behind the auth middleware; cart and order calls need a session token.
```

Keep it plain: factual words, motivation only when it isn't self-evident, "no behavior changes" once if it applies. Red Flags below lists the tells to rewrite.

**Sketch.** When the change has a shape a reviewer would otherwise rebuild from the diff (new control flow, moved files, a component added to a tree), add one fenced block under the summary. Pick the smallest view that shows it, keeping only the calls, files, or states the change touches:

| Change | View |
|---|---|
| Logic or algorithm | `text` pseudocode |
| Runtime control flow | `text` call tree (indented callee under caller) |
| UI structure | `text` component tree with the file path on the boundary that matters |
| File layout or broad refactor | `text` shallow file tree with one-line roles |
| Interaction across processes or services | `mermaid` `sequenceDiagram` |
| Edit to an existing shape | `diff` of the tree, call tree, or pseudocode, `+`/`-` on the changed lines |

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

A one-line fix, a rename, or a config bump gets no sketch; the summary already says it.

### Step 6: Polish

Check the title and description against Red Flags. Edit prose only; leave the `## Proof` section's commands, output, and verdict verbatim.

Append the compact `## Proof` from Step 3 at the end of the body.

### Step 7: Present

Output the title and description as two separate markdown code blocks so the user can easily copy each one:

**Title:**

```
<title>
```

**Description** (four-backtick fence, so a sketch or fenced output inside the body doesn't close it):

````
<description>
````

If the user wants to create the PR directly, use:

```bash
gh pr create --title "<title>" --attach <scratch>/pr-shots/<screen>-before.png --attach <scratch>/pr-shots/<screen>-after.png --body "$(cat <<'EOF'
<description>
EOF
)"
```

`--attach` only for UI PRs, one flag per image path in the body.

## Common Mistakes

**Writing the analysis into the body**
Step 2 findings, file lists and test plans are for you. The body gets the one impact a reviewer would miss, e.g. a new auth middleware that wraps all existing endpoints.

**AI voice**
Using "enhances", "fosters", "ensures", "leveraging". Write like a person.

## Red Flags

If your PR description has any of these, rewrite it:

- Any section besides `## Stack` and `## Proof`, or any `<details>` block
- A blast radius, test count, deep-read list, or `Closes #` line
- A summary over 3 sentences
- More than one sketch block, or a sketch that restates the diff line by line
- No `## Proof` section, or a `Verified:` claim with nothing observable behind it
- No `Before:`/`After:` pair, or one showing test output or code added instead of the change running
- Any bullet starting with a bold header followed by a colon
- The word "comprehensive", "robust", "seamless", or "leverage"
- A title over 60 characters
- Horizontal rules (`---`) between sections
