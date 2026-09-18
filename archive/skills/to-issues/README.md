# To Issues

Breaks a plan, spec, or PRD (Product Requirements Document) into independently-grabbable issues on the project's issue tracker, using tracer-bullet vertical slices rather than horizontal layer-by-layer tickets.

## What It Does

- Drafts vertical slices — each one cuts end-to-end through every layer (schema, API, UI, tests) and is demoable on its own, rather than "just the backend part" or "just the UI part"
- Tags each slice HITL (needs human interaction — a design call, an architecture decision) or AFK (agent can implement and merge unsupervised), preferring AFK where possible
- Presents the breakdown as a numbered list with title, type, dependencies, and covered user stories, and iterates with the user until the granularity and ordering are approved
- Publishes approved slices to the tracker in dependency order, using a standard template (what to build, acceptance criteria, blocked-by), with the correct triage label for AFK-ready work

Relies on `setup-engineering-skills` having already recorded the tracker and label vocabulary for this repo.

---

## When to Use

Trigger when you:
- have an approved plan or PRD that needs to become concrete, assignable tickets
- want work broken into thin end-to-end slices instead of one big ticket per layer
- need to hand off a batch of AFK-ready issues for agents to pick up independently
