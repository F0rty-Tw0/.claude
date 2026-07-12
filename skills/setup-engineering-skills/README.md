# Setup Engineering Skills

Scaffolds the per-repo configuration that `to-issues`, `triage`, `ralph-init`, `systematic-debugging`, `tdd`, and `zoom-out` all assume exists: where the issue tracker lives, what the triage label strings actually are, and how domain docs (`CONTEXT.md`, ADRs) are laid out.

## What It Does

- Explores the repo first (git remote, existing `AGENTS.md`/`CLAUDE.md`, `CONTEXT.md`/`CONTEXT-MAP.md`, `docs/adr/`, `.scratch/`) rather than assuming a starting state
- Walks the user through three decisions one at a time, each with a plain-language explainer and a sensible default:
  - **Issue tracker** — GitHub, GitLab, local markdown under `.scratch/`, or a freeform "other"
  - **Triage label vocabulary** — maps the five canonical triage roles to this repo's actual label strings
  - **Domain docs layout** — single-context (`CONTEXT.md` + `docs/adr/` at root) vs. multi-context (`CONTEXT-MAP.md` pointing to per-context docs)
- Writes an `## Agent skills` block into whichever of `CLAUDE.md`/`AGENTS.md` already exists (never creates the other), plus `docs/agents/issue-tracker.md`, `triage-labels.md`, and `domain.md`

---

## When to Use

Trigger when you:
- are about to use `to-issues`, `triage`, or another engineering skill for the first time in this repo
- notice one of those skills is missing context about the tracker, labels, or domain doc location
- need to switch issue trackers or reset this configuration from scratch
