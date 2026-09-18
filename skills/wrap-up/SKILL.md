---
name: wrap-up
description: Use when user says "wrap up", "close session", "end session", "wrap things up", "close out this task", or invokes /wrap-up — runs end-of-session checklist for cleanup, memory, and self-improvement
---

# Session Wrap-Up

Run three phases in order. Each phase is conversational and inline — no
separate documents. Present a consolidated report at the end.

## Phase 1: Clean Up

**File placement check:**

1. If any files were created or saved during this session:
   - Verify they follow the project's naming convention
   - Flag naming violations and propose renames — apply after confirmation
   - Verify they're in the correct subfolder per the project structure
   - Flag misplaced files and propose moves — apply after confirmation

2. If any document-type files (.md, .docx, .pdf, .xlsx, .pptx) were created
   at the workspace root or in code directories, suggest moving them to the
   docs folder if they belong there

**Task cleanup:**

3. Check the task list for in-progress or stale items
4. Mark completed tasks as done, flag orphaned ones

## Phase 2: Remember It

Review what was learned during the session. Decide where each piece of
knowledge belongs in the memory hierarchy:

**Memory placement guide:**

- **Auto memory** (Claude writes for itself) — Debugging insights, patterns
  discovered during the session, project quirks. Tell Claude to save these:
  "remember that..." or "save to memory that..."
- **CLAUDE.md** (instructions for Claude) — Permanent project rules,
  conventions, commands, architecture decisions that should guide all future
  sessions
- **`.claude/rules/`** (modular project rules) — Topic-specific instructions
  that apply to certain file types or areas. Use `paths:` frontmatter to scope
  rules to relevant files (e.g., testing rules scoped to `tests/**`)
- **`CLAUDE.local.md`** (private per-project notes) — Personal WIP context,
  local URLs, sandbox credentials, current focus areas that shouldn't be
  committed
- **`@import` references** — When a CLAUDE.md would benefit from referencing
  another file rather than duplicating its content

**Decision framework:**

- Is it a permanent project convention? → CLAUDE.md or `.claude/rules/`
- Is it scoped to specific file types? → `.claude/rules/` with `paths:`
  frontmatter
- Is it a pattern or insight Claude discovered? → Auto memory
- Is it personal/ephemeral context? → `CLAUDE.local.md`
- Is it duplicating content from another file? → Use `@import` instead

Note anything important in the appropriate location.

## Phase 3: Review & Apply

Analyze the conversation for self-improvement findings. If the session was
short or routine with nothing notable, say "Nothing to improve" and you're
done.

Present all findings for confirmation before applying. Apply approved changes,
then present a summary of what was done.

**Finding categories:**

- **Skill gap** — Things Claude struggled with, got wrong, or needed multiple
  attempts
- **Friction** — Repeated manual steps, things user had to ask for explicitly
  that should have been automatic
- **Knowledge** — Facts about projects, preferences, or setup that Claude
  didn't know but should have
- **Automation** — Repetitive patterns that could become skills, hooks, or
  scripts

**Action types:**

- **CLAUDE.md** — Edit the relevant project or global CLAUDE.md
- **Rules** — Create or update a `.claude/rules/` file
- **Auto memory** — Save an insight for future sessions
- **Skill / Hook** — Document a new skill or hook spec for implementation
- **CLAUDE.local.md** — Create or update per-project local memory

Present a summary in two sections — applied items first, then no-action items:

Findings (applied):

1. Skill gap: Cost estimates were wrong multiple times
   → [CLAUDE.md] Added token counting reference table

2. Knowledge: Worker crashes on 429/400 instead of retrying
   → [Rules] Added error-handling rules for worker

3. Automation: Checking service health after deploy is manual
   → [Skill] Created post-deploy health check skill spec

---

No action needed:

4. Knowledge: Discovered X works this way
   Already documented in CLAUDE.md

## Failure Modes

- Saying "Nothing to improve" without actually scanning for friction or repeated corrections → re-check before defaulting to it
- Listing findings in Phase 3 but not applying any of them → apply approved ones before the summary, don't just enumerate
- Saving the same fact to both CLAUDE.md and auto memory → pick one location, cross-reference instead of duplicating
- Elevating a one-off mistake to a permanent CLAUDE.md rule → confirm it would recur before codifying it
- Skipping Phase 1 because no new files "felt" created → check the task list and diff anyway
