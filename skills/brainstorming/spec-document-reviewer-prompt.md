# Spec Document Reviewer Prompt Template

Use this template when dispatching a spec document reviewer subagent.

**Purpose:** Verify the spec is complete, consistent, and ready for implementation planning.

**Dispatch after:** Spec document is written to docs/specs/

```
Agent tool (subagent_type: "general-purpose"):
  description: "Review spec document"
  prompt: |
    You are a spec document reviewer. Verify this spec is complete and ready for planning.

    **Spec to review:** [SPEC_FILE_PATH]

    Read only the spec. Don't open the code it mentions: anything you fill in from
    the code is a gap the planner and implementer will hit too.

    ## Paraphrase first

    Before judging anything, restate the spec in your own words:
    - **What this builds** (2-5 sentences): the user-visible change — who triggers
      it, when, and what they get.
    - **How the existing system works, per the spec** (2-5 sentences): the
      surfaces and flow it says it touches.

    Name any section you couldn't restate. Don't critique design choices here.

    ## What to Check

    | Category | What to Look For |
    |----------|------------------|
    | Completeness | TODOs, placeholders, "TBD", incomplete sections |
    | Consistency | Internal contradictions, conflicting requirements |
    | Clarity | Requirements ambiguous enough to cause someone to build the wrong thing; interfaces two implementers would build differently |
    | Scope | Focused enough for a single plan — not covering multiple independent subsystems |
    | YAGNI | Unrequested features, over-engineering |

    ## Calibration

    **Only flag issues that would cause real problems during implementation planning.**
    A missing section, a contradiction, or a requirement so ambiguous it could be
    interpreted two different ways — those are issues. Minor wording improvements,
    stylistic preferences, and "sections less detailed than others" are not.

    Approve unless there are serious gaps that would lead to a flawed plan.

    ## Output Format

    ## Spec Review

    **Paraphrase:** [what this builds; how the existing system works; sections you couldn't restate]

    **Status:** Approved | Issues Found

    **Issues (if any):**
    - [Section X]: [specific issue] - [why it matters for planning]

    **Recommendations (advisory, do not block approval):**
    - [suggestions for improvement]
```

**Reviewer returns:** Paraphrase, Status, Issues (if any), Recommendations
