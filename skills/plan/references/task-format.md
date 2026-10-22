# Task-level plan format

Every plan uses this layout; its tasks are executed task by task (by `subagent-driven-development` or `ralph`). The implementer sees only its own task, so every task carries its own files, test, and commands. During execution the orchestrator reads `index.md` plus the current phase file, not the whole plan.

## Layout

Save each plan as a folder unless the user names another location:

```
.claude/local/plans/YYYY-MM-DD-<feature>/
  spec.md          the design spec (written here by skill:brainstorming)
  index.md         everything plan-wide + phase table + outline + log
  01-<phase>.md    one file per phase
  02-<phase>.md
```

- Every plan is a folder, including a one-phase plan.
- A **phase** is a top-level milestone grouping several tasks; PR slices may cross phase boundaries.
- **Numbering:** phases start at 1. File `NN` = heading `# Phase N` = task ids `Task N.M` (task M of phase N). Ruling ids (`R1`, `R2`, …) are plan-wide.
- **Legacy detection:** a directory, or a path to a folder's `index.md`, is a plan folder. Any other path ending in `.md` is a legacy single-file plan, executed as before.

## Spec location

- skill:brainstorming writes the spec to `.claude/local/plans/YYYY-MM-DD-<topic>/spec.md`; a user-preferred location wins.
- `**Spec:**` paths are relative to the repo root, e.g. `.claude/local/plans/<folder>/spec.md`.
- Use the spec's folder only when the spec sits at `.claude/local/plans/<folder>/spec.md`. Otherwise create a new folder whose `**Spec:**` is the spec's repo-relative path (never write plan files beside an outside spec).
- When one spec yields several plans, the first plan takes the spec's folder; each further plan gets a sibling folder whose `**Spec:**` points at the first folder's spec.md.
- The folder already has an index.md with any phase not `todo` → stop and ask before overwriting; it holds execution state.
- No spec → a folder without `spec.md`, and `**Spec:** none`.

## Scope and file map

- A spec spanning several independent subsystems becomes one plan folder per subsystem (sibling folders, see Spec location); each plan must yield working, testable software on its own.
- Before writing tasks, list the files to create or modify and the one responsibility each has. Files that change together live together. In existing codebases, follow the established structure; propose a split only for a file you are already changing that has grown unwieldy.
- Right-size tasks: fold setup, config, and docs into the task whose deliverable needs them; split only where a reviewer could reject one task and approve its neighbour.
- Split a task whose parts need different models (a mechanical rename plus a design call), so each part runs on its own model. Merge tasks that read the same context, so it is read once.
- Size by the new logic to write, not by files touched: threading a parameter or rename through 30 files is a small task.

## Model and effort

Every task carries a **Model** line, passed to its implementer as the Agent call's `model` and `effort`. Start at sonnet; opus needs a reason from the table (design or UI, an area the repo flags as delicate, or sonnet already failed). A task sounding hard is not a reason. Opus costs more and spends the scarcer limit. No `low` effort on either model: it benchmarks badly. Sonnet · medium is weak at open-ended agentic coding (Terminal-Bench 4.0, Artificial Analysis, Oct 2026: 30% vs 44% at high), so it gets only tasks where the plan already did the thinking.

| Work | Model · effort |
|---|---|
| Mechanical edits, renames, prose from an exact list | sonnet · medium |
| Task whose text carries the code shape: signatures, the failing test, and the rule to implement | sonnet · medium |
| Clear spec without that detail, pinned algorithm, bug with a known cause | sonnet · high (default) |
| Unknown-cause diagnosis, judgment against a contract | sonnet · high |
| UI, layout, visual choices; code the repo flags as delicate (landmines, warnings) | opus · high |
| Hard bugs that resisted debugging, cross-cutting architecture | opus · high |

A failed attempt climbs one step: sonnet · medium → sonnet · high → opus · high.

## Ruling rows

A decision only the user can make, and that blocks a task, gets its own row just before that task (or in index.md `## Rulings` when it blocks tasks in several phases). Then execution stops at it instead of guessing past it:

```markdown
### Ruling R1: [the question, with the recommended answer]

**Model:** none · **Blocks:** Task N.M

- [ ] Answer recorded here
```

The blocked task's header line gets `**After:** R1`; for an index.md ruling that line is all the phase file carries, no row. The planner reserves every ruling id in the index.md Outline, listing a multi-phase ruling under the first phase it blocks with `(index.md)`.

## PR Slices

Plan expected to exceed ~400 changed lines, or mixing trunk and leaf work? Group tasks into PR slices now, per skill:open-pr (`references/stacking.md`). Put the table in index.md and tag every task with its slice:

```markdown
| Slice | Branch | Base | Blast | Tasks |
|---|---|---|---|---|
| 1 | feat/x-1-ledger | main | Trunk | 1.1, 1.2 |
| 2 | feat/x-2-core | feat/x-1-ledger | Branch | 1.3, 2.1 |
| 3 | feat/x-3-badge | main | Leaf | 2.2 |
```

Tasks for one slice sit contiguously, and each slice must build and pass tests on its own. At PR time `open-pr`'s split path reads this table instead of re-deriving the split. Working on per-slice branches during execution needs commits, so only do that when the user has authorized commits.

## index.md

Holds every plan-wide section, in this order:

````markdown
# [Feature Name] Implementation Plan

> Execute phase by phase with skill:subagent-driven-development (or skill:ralph if the user asked for autonomous). Steps use `- [ ]` checkboxes for tracking.

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]
**Spec:** .claude/local/plans/<folder>/spec.md [repo-relative, or `none` — implementers read it; conflicts in the plan resolve against it, except changes logged under a phase's **Applied to**, which override it]

## Requirements Summary
## Global Constraints

[Version floors, dependency limits, naming and copy rules, exact values — one line each, copied verbatim from the spec. Every task implicitly includes this section.]

## Review Focus

[Up to five inputs or failure modes the spec implies but no task's tests exercise, most likely first. Each line names the input and the behavior a reasonable user expects; add its test to the task that owns the code. The spec's silence on an input isn't permission for it to break.]

## Acceptance Criteria (whole plan)
## Risks and Mitigations
## Verification Steps
## Depth check

[Any other plan-wide section the work needs: autonomy and git rules, gates the agent cannot pass.]

## Cross-phase interfaces

| Name / signature | Produced by | Consumed by |
|---|---|---|
| `slugify(input: string): string` | Task 1.2 | Tasks 2.1, 3.1 |

## PR Slices  [when needed, see above]

## Phases

| Phase | File | Goal | Spec § | Slices | Status |
|---|---|---|---|---|---|
| 1 | 01-core.md | [one line] | 3, 4.1 | 1 | todo |

[Status: `todo` · `in progress` · `done` · `blocked`. Set only by the orchestrator, see Handoff.]

## Outline

**Phase 1**
- Task 1.1: [title]
- Ruling R1: [question] (reserved)

## Rulings  [those blocking tasks in more than one phase]

## Log

[Execution appends one line per finished task: `<date> · task N.M · <model> · <effort> · <done|blocked> · agent <id, or - inline> · retries <n>`]

## Changelog  [consensus mode only]
````

## Phase file

`NN-<phase>.md`, one per phase:

```markdown
# Phase N — <name>

**Goal:** one sentence · **Spec §:** 4, 6.3 · **Slices:** 3, 4 · **After:** Phase N-1 (or a ruling)

## Tasks

### Ruling RK: … (a ruling blocking only this phase's tasks sits just before the first task it blocks)
### Task N.1: …   (task template below)

## Handoff
_Filled at execution; empty at plan time._
- **Changed vs plan:** deviations, renamed or re-typed interfaces, moved files
- **Decisions:** `Decision: <what> — <why> — <cost if wrong>` lines made during this phase
- **Landmines:** what later phases must not trip on
- **Applied to:** every later file patched (index.md, phase files, task ids)
```

Task ids and titles match the Outline verbatim. Names crossing phases match Cross-phase interfaces verbatim.

## Task template

Each step is one action of a few minutes.

````markdown
### Task N.M: [Component Name]

**Model:** sonnet · medium [from the Model and effort table]
**PR slice:** [N — only when the plan has a PR Slices table]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `src/exact/path/to/file.spec.ts`

**Interfaces:**
- Consumes: [exact signatures from earlier tasks]
- Produces: [exact names and types later tasks rely on]

- [ ] **Step 1: Write the failing test**

```typescript
it('should do specific behavior', () => {
  const result = myFunction(input);
  expect(result).toBe(expected);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter <package> exec vitest run src/file.spec.ts`
Expected: FAIL with "myFunction is not defined"

- [ ] **Step 3: Minimal implementation** — `export function myFunction(input: InputType): OutputType` plus the rule it must implement.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter <package> exec vitest run src/file.spec.ts`
Expected: PASS

- [ ] **Step 5: Checkpoint** — stage the task's files by name. Commit only if the user authorized commits.
````

Show test assertions and signatures, not the full implementation: writing the code twice inflates the plan and the implementer writes it anyway. The implementer sees only its own task, so the Interfaces block is how it learns the names and types its neighbours use.

## Handoff

The orchestrator (subagent-driven-development's controller, or ralph) owns phase state:

- Sets the phase's Status to `in progress` at its first task.
- Records `Decision:` lines in the current phase's Handoff as they happen.
- When the last task is ticked: fills the rest of the Handoff, then applies it. Every changed interface or file is grep'd for in index.md and **all later** phase files, and each hit is patched where it sits: task text, Cross-phase interfaces, other index.md prose. An Outline title and its phase-file heading change together. Each patched file and task id goes under **Applied to**.
- A hit in Acceptance Criteria, Global Constraints, Review Focus, or a slice boundary stops for the user. Other patches proceed and are logged as Decisions.
- Sets Status `blocked` when execution stops inside the phase: an unresolved BLOCKED task, an unanswered ruling, or a protected-section patch (previous bullet). Resume treats `blocked` like any phase not `done`.
- Sets Status `done` only after the Handoff is written and applied.
- On resume, opens the first phase not `done`; a phase with every task ticked but Status not `done` gets its Handoff written and applied first.

Implementer dispatches don't change: task text, the interfaces it touches, global constraints, never summaries of earlier tasks. The Handoff reaches implementers only through patched task text. The Interfaces block is the plan-time contract; the Handoff is never written at plan time.

## No placeholders

These are plan failures: "TBD", "implement later", "add appropriate error handling", "write tests for the above" without the test, "similar to Task N.M" (tasks may be read out of order), and references to types or functions no task defines.

## Self-review before handing off

Run across index.md and every phase file:

1. **Spec coverage:** every requirement maps to a task; add a task for any gap.
2. **Placeholder scan:** none of the patterns above.
3. **Name consistency across files:** a function called `clearLayers()` in Task 1.3 is not `clearFullLayers()` in Task 3.2, and every cross-phase name matches Cross-phase interfaces.
4. **Outline match:** every Outline task id and title has the same heading in its phase file, and every reserved ruling id is used.
5. **Review Focus:** each line has its test in the owning task. An empty section means you checked and found none.
6. **Models:** every task has a Model line; each opus line has its reason from the table.
7. **Proportion:** a phase file several times longer than the spec sections in its `**Spec §:**` line is a transcript. Replace bodies with signatures and assertions.
8. **Commands:** every Run line is copied from the repo's `.claude/local/plans/CONVENTIONS.md` when it exists, else from its package.json scripts and CI workflow. A `test -- <file>` form runs the whole suite in most runners; a target that depends on a build (e2e, integration) goes through the build or the task runner first.
9. **Each slice green alone:** grep the existing tests, type pins (`toStrictEqual`, snapshots), stubs and typecheck scopes (e2e folders included) for every shape a task changes. Each hit is listed in the task that breaks it, so no commit goes red.
10. **Oracles:** each expected value comes from a fixture or the spec, not from running the new code. Each mutant a task names has the test row that kills it.
11. **Size budget:** a task that grows a file or function near the lint caps (`~/.claude/skills/artification/references/module-size.md`) names the split.

Fix issues inline; no second pass or subagent needed.
