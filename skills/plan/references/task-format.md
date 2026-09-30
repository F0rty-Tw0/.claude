# Task-level plan format

Load this when the plan will be executed task by task (by `subagent-driven-development` or `ralph`). The reader is an implementer with no context from this session, so every task carries its own files, test, and commands.

Save to `.claude/local/plans/YYYY-MM-DD-<feature>.md` unless the user names another location.

## Scope and file map

- A spec spanning several independent subsystems becomes one plan per subsystem; each plan must yield working, testable software on its own.
- Before writing tasks, list the files to create or modify and the one responsibility each has. Files that change together live together. In existing codebases, follow the established structure; propose a split only for a file you are already changing that has grown unwieldy.

## PR Slices

Plan expected to exceed ~400 changed lines, or mixing trunk and leaf work? Group tasks into PR slices now, per skill:meaningful-prs. Add a table after the header and tag every task with its slice:

```markdown
| Slice | Branch | Base | Blast | Tasks |
|---|---|---|---|---|
| 1 | feat/x-1-ledger | main | Trunk | 1, 2 |
| 2 | feat/x-2-core | feat/x-1-ledger | Branch | 3, 4 |
| 3 | feat/x-3-badge | main | Leaf | 5 |
```

Tasks for one slice sit contiguously, and each slice must build and pass tests on its own. At PR time `meaningful-prs` reads this table instead of re-deriving the split. Working on per-slice branches during execution needs commits, so only do that when the user has authorized commits.

## Header

```markdown
# [Feature Name] Implementation Plan

> Execute task by task with skill:subagent-driven-development (or skill:ralph if the user asked for autonomous). Steps use `- [ ]` checkboxes for tracking.

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]
```

## Task template

Each step is one action of a few minutes.

````markdown
### Task N: [Component Name]

**PR slice:** [N — only when the plan has a PR Slices table]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `src/exact/path/to/file.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('should do specific behavior', () => {
  const result = myFunction(input);
  expect(result).toBe(expected);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --testPathPattern=file.spec.ts`
Expected: FAIL with "myFunction is not defined"

- [ ] **Step 3: Minimal implementation** — `export function myFunction(input: InputType): OutputType` plus the rule it must implement.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test -- --testPathPattern=file.spec.ts`
Expected: PASS

- [ ] **Step 5: Checkpoint** — stage the task's files by name. Commit only if the user authorized commits.
````

Show test assertions and signatures, not the full implementation: writing the code twice inflates the plan and the implementer writes it anyway.

## No placeholders

These are plan failures: "TBD", "implement later", "add appropriate error handling", "write tests for the above" without the test, "similar to Task N" (tasks may be read out of order), and references to types or functions no task defines.

## Self-review before handing off

1. **Spec coverage:** every requirement maps to a task; add a task for any gap.
2. **Placeholder scan:** none of the patterns above.
3. **Name consistency:** a function called `clearLayers()` in Task 3 is not `clearFullLayers()` in Task 7.

Fix issues inline; no second pass or subagent needed.
