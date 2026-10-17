# Phase Writer Prompt Template

Use this template when a plan has 3+ phases and skill:plan fans out one writer per phase.

**Purpose:** Write one phase file with full task detail, consistent with the plan's index.md.

**Dispatch after:** index.md is complete, including Cross-phase interfaces, the Phases table, and the Outline with reserved ruling ids. At most 3 writers run in parallel.

```
Agent tool (subagent_type: "general-purpose", model: "sonnet", effort: "high"):
  description: "Write plan phase [PHASE_N]"
  prompt: |
    You write one phase file of an implementation plan. Other writers handle the
    other phases in parallel, so consistency comes from index.md, not from them.

    **Spec:** [SPEC_PATH]
    **Plan index:** [INDEX_PATH]
    **Your phase:** [PHASE_N]
    **Write only:** [PHASE_FILE_PATH]
    **Format:** ~/.claude/skills/plan/references/task-format.md (sections "Phase file",
    "Task template", "Model and effort", "Ruling rows", "No placeholders")

    ## Read first

    1. index.md in full.
    2. The spec sections listed in your phase's `Spec §` cell of the Phases table
       (`**Spec:** none` → index.md's Requirements Summary is your spec).
    3. The code your tasks touch: open each file before naming lines in it.

    ## Rules

    - Write only [PHASE_FILE_PATH]. Never edit index.md, the spec, or another phase file.
    - Use the task ids and titles from your phase's Outline entry verbatim, in that order.
    - Use names and signatures from Cross-phase interfaces verbatim.
    - Use only the ruling ids reserved for your phase in the Outline. Never invent one.
      A ruling marked `(index.md)` gets no row from you: only `**After:** RK` on the
      tasks it blocks.
    - Every task gets: a Model line from the format's table, Files with exact paths,
      Interfaces, failing test or check code, and a run command with expected output
      for both the failing and the passing run.
    - Leave `## Handoff` with its placeholder line only; it is filled at execution.
    - Proportion: signatures and assertions, not full implementations.

    ## Return

    Either `DONE [PHASE_FILE_PATH]`, or, writing nothing, one line per need:
    - `NEEDS_INTERFACE <name — why your phase needs it>`: a cross-phase name or
      signature index.md lacks. Don't guess it.
    - `NEEDS_RULING <question — tasks it blocks>`: a decision only the user can make.
    - `NEEDS_OUTLINE <task — spec section>`: work the spec asks of your phase that
      no Outline task covers.

    Return status lines only, never the file contents.
```

**Writer returns:** `DONE`, or `NEEDS_*` lines with no file written. The planner adds each interface to Cross-phase interfaces, reserves each ruling id in the Outline (writing a multi-phase ruling into index.md `## Rulings`), adds each missing task to the Outline, then re-dispatches the affected writers; a re-dispatched writer writes its phase-local ruling rows itself.
