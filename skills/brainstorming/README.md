# Brainstorming

Turn ideas into fully formed designs and specs through natural collaborative dialogue. Explores project context, refines requirements in short question rounds, then presents designs in small validated sections.

## What It Does

Guides a structured ideation process:

1. **Understanding** - Check project state, ask up to 3 questions per round (prefer multiple choice), then write back your understanding for the user to correct
2. **Exploring** - Propose 2-3 approaches with trade-offs, lead with recommendation. Wide mode (`lens-brainstorm.md`) runs parallel lens agents first for raw concepts
3. **Presenting** - Break design into 200-300 word sections, validate each incrementally
4. **Documenting** - Write validated design to `docs/specs/YYYY-MM-DD-<topic>-design.md`
5. **Cold-reader check** - A fresh reviewer sees only the spec and paraphrases it; a wrong paraphrase means a spec gap
6. **Critic check** - The `critic` agent checks the spec's claims against the code
7. **Handoff** - Hand the spec to `plan`, which runs `critic` again on the plan

---

## When to Use

Triggers when you:

- Have an open-ended idea or design question
- Add a feature or change existing behavior, even a small scoped one (short pass)
- Not for typos, config tweaks, version bumps, or bug fixes

---

## Key Principles

- Short question rounds (max 3) that build on earlier answers
- Multiple choice preferred over open-ended
- YAGNI ruthlessly - remove unnecessary features
- Always propose 2-3 approaches before settling
- Incremental validation - present in sections, confirm each

---
