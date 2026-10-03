---
name: brainstorming
description: Turns a vague idea into an approved design spec through context exploration, focused questions, and 2-3 approaches. Use when the request is an open-ended idea or design question, not a concrete, scoped change.
---

# Brainstorming Ideas Into Designs

Turn an idea into an approved design and a written spec. No code, scaffolding, or implementation skill until the user has approved the design, because unexamined assumptions are where the rework comes from. A reply approves only the stage you presented. Agreeing to an idea or scope doesn't approve a design or spec that doesn't exist yet. After any approval, resume at the earliest stage not yet done. A concrete, scoped change skips this skill.

**Scale.** A spike (a "can we…" feasibility question) gets a 2-3 sentence probe plan and a nod, no spec. Label anything built as throwaway; keeping it is a new request. Complexity discovered mid-task escalates to the full process: stop and say so. Nothing de-escalates.

## Steps

1. **Explore context** — relevant files, docs, recent commits. Look up codebase facts yourself instead of asking.
2. **Check scope first.** If the request spans several independent subsystems ("a platform with chat, file storage, billing, and analytics"), say so before refining details. Help split it into sub-projects (the pieces, how they relate, build order) and brainstorm the first one; each gets its own spec → plan → implementation cycle.
3. **Offer the visual companion when it's needed**, not upfront: the first time a question would be clearer shown than told. A UI topic alone doesn't justify it. See `visual-companion.md`.
4. **Ask questions** on purpose, constraints, and success criteria: up to 3 per `AskUserQuestion` round, each building on earlier answers, multiple choice where it fits.
5. **Write back your understanding** in a short note: the intended outcome, who it's for, constraints, success criteria. Mark what the user said apart from what you assumed. Take their correction before proposing approaches.
6. **Propose 2-3 approaches** with trade-offs, leading with your recommendation and why. Run wide mode (`lens-brainstorm.md`) first only when the user asks for a wide or divergent brainstorm, or your step 5 note has no candidate direction yet: one session converges on its first idea, and parallel fresh agents with different lenses don't. It costs 4-6 agent runs.
7. **Present the design** in sections scaled to their complexity (a few sentences when straightforward), covering architecture, components, data flow, error handling, and testing. Confirm each section before the next.
8. **Write the spec** to `docs/specs/YYYY-MM-DD-<topic>-design.md` (a user-preferred location wins).
9. **Self-review the spec** and fix inline: placeholders ("TBD", vague requirements), contradictions between sections, scope too big for one plan, requirements that read two ways (pick one, make it explicit).
10. **Cold-reader check.** Dispatch a fresh reviewer with `spec-document-reviewer-prompt.md`, giving it only the spec path — no chat history, no intent. You hold context the spec doesn't, so you can't see its gaps yourself. Compare the reviewer's paraphrase with what the user approved: anything it got wrong or couldn't restate is a spec gap, even when it approves. Fix gaps and issues, then re-dispatch; after 3 rounds, take the remaining open points to the user.
11. **User reviews the spec:** "Spec written to `<path>`. Review it and tell me any changes before I write the implementation plan." Revise until approved.
12. **Hand off** to skill:plan with the spec path. The plan comes before any implementation.

## Design guidance

- Split the system into units with one clear purpose each, a well-defined interface, and no need to read internals to use them. If you can't say what a unit does, how to use it, and what it depends on, the boundaries need work.
- In existing codebases, follow established patterns. Include targeted fixes for problems that affect this work (a file that has grown too large, tangled responsibilities); leave unrelated refactoring out.
- Cut features the goal doesn't need.
