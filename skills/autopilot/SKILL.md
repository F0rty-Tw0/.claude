---
name: autopilot
description: Use when the user wants end-to-end autonomous execution from an idea to working code -- says "autopilot", "auto pilot", "autonomous", "build me", "create me", "make me", "full auto", "handle it all", or "I want a/an..."; the task spans multiple phases (planning, coding, testing, validation); or the user wants hands-off execution and is willing to let the system run to completion.
---

<Purpose>
Autopilot takes a brief product idea and autonomously handles the full lifecycle: requirements analysis, technical design, planning, parallel implementation, QA cycling, and multi-perspective validation. It produces working, verified code from a 2-3 line description.
</Purpose>

<Use_When>

- User wants end-to-end autonomous execution from an idea to working code
- User says "autopilot", "auto pilot", "autonomous", "build me", "create me", "make me", "full auto", "handle it all",
  or "I want a/an..."
- Task requires multiple phases: planning, coding, testing, and validation
- User wants hands-off execution and is willing to let the system run to completion </Use_When>

<Do_Not_Use_When>

- User wants to explore options or brainstorm -- use `plan` skill instead
- User says "just explain", "draft only", or "what would you suggest" -- respond conversationally
- User wants a single focused code change -- use `ralph` or delegate to an executor agent
- User wants to review or critique an existing plan -- use `plan --review`
- Task is a quick fix or small bug -- use direct executor delegation </Do_Not_Use_When>

<Why_This_Exists> Most non-trivial software tasks require coordinated phases: understanding requirements, designing a
solution, implementing in parallel, testing, and validating quality. Autopilot orchestrates all of these phases
automatically so the user can describe what they want and receive working code without managing each step.
</Why_This_Exists>

<Execution_Policy>

- Each phase must complete before the next begins
- Parallel execution is used within phases where possible (Phase 2 and Phase 4)
- QA cycles repeat up to 5 times; if the same error persists 3 times, stop and report the fundamental issue
- Validation requires approval from all reviewers; rejected items get fixed and re-validated
- Cancel with `cancel` at any time; progress is preserved for resume </Execution_Policy>

<Steps>
1. **Phase 0 - Expansion**: Turn the user's idea into a detailed spec
   - Analyst (Opus): Extract requirements
   - Architect (Opus): Create technical specification
   - Output: `.claude/local/autopilot/spec.md`

2. **Phase 1 - Planning**: Create an implementation plan from the spec
   - Architect (Opus): Create plan (direct mode, no interview)
   - Critic (Opus): Validate plan
   - Output: `.claude/local/plans/autopilot-impl.md`

3. **Phase 2 - Execution**: Implement the plan using Ralph + Ultrawork
   - `executor` (Sonnet, or `model: "haiku"` override for simple tasks): Standard tasks
   - `deep-executor` (Opus): Complex tasks
   - Fire independent tasks in ONE message (concurrent). When two tasks touch overlapping files, give each `isolation: "worktree"` and merge in Phase 4; use `run_in_background: true` for long builds/installs.
   - Track subtasks with `TaskCreate` and flip each to completed via `TaskUpdate` so progress survives compaction.

4. **Phase 3 - QA**: Cycle until all tests pass (UltraQA mode)
   - Build, lint, test, fix failures
   - Repeat up to 5 cycles
   - Stop early if the same error repeats 3 times (indicates a fundamental issue)

5. **Phase 4 - Validation**: Multi-perspective review in parallel
   - Architect: Functional completeness
   - Security-reviewer: Vulnerability check
   - Code-reviewer: Quality review
   - All must approve; fix and re-validate on rejection

6. **Phase 5 - Finish & Cleanup**: Integrate the work, then delete all state files on successful completion
   - If the work was done on a dedicated branch or worktree, invoke `Skill("finishing-a-development-branch")` to integrate and clean up the branch
   - Remove `.claude/local/state/autopilot-state.json`, `ralph-state.json`, `ultrawork-state.json`, `ultraqa-state.json`
   - Run `cancel` for clean exit </Steps>

<Phase_Gates>
Do not advance until the gate's observation holds. If a gate cannot be met, stop and report -- never fake it.

| Transition        | Gate (observe, don't assume)                                              |
| ----------------- | ------------------------------------------------------------------------- |
| Expansion -> Plan | `spec.md` exists and lists concrete, testable requirements                |
| Plan -> Execution | Critic returns OKAY on the plan file                                      |
| Execution -> QA   | All Phase-2 subtasks `completed` in `TaskList`; worktree branches merged  |
| QA -> Validation  | Fresh `build` exit 0 AND `test` shows 0 failures (capture the numbers)    |
| Validation -> Finish | All reviewers APPROVED; each rejection fixed and re-run                 |
</Phase_Gates>

<Tool_Usage>

- Before first MCP tool use, call `ToolSearch("mcp")` to discover deferred MCP tools
- Use `mcp__agentic-mcp__ask_codex` for Phase 4 architecture validation (second-opinion cross-check)
- Use `mcp__agentic-mcp__ask_codex` for Phase 4 security review cross-validation
- Use `mcp__agentic-mcp__review_codex` for Phase 4 quality/code review
- Agents form their own analysis first, then consult agentic-mcp for cross-validation
- If ToolSearch finds no MCP tools or agentic-mcp is unavailable, proceed without it -- never block on external tools
  </Tool_Usage>

<Examples>
<Good>
User: "autopilot A REST API for a bookstore inventory with CRUD operations using TypeScript"
Why good: Specific domain (bookstore), clear features (CRUD), technology constraint (TypeScript). Autopilot has enough context to expand into a full spec.
</Good>

<Good>
User: "build me a CLI tool that tracks daily habits with streak counting"
Why good: Clear product concept with a specific feature. The "build me" trigger activates autopilot.
</Good>

<Bad>
User: "fix the bug in the login page"
Why bad: This is a single focused fix, not a multi-phase project. Use direct executor delegation or ralph instead.
</Bad>

<Bad>
User: "what are some good approaches for adding caching?"
Why bad: This is an exploration/brainstorming request. Respond conversationally or use the plan skill.
</Bad>
</Examples>

<Escalation_And_Stop_Conditions>

- Stop and report when the same QA error persists across 3 cycles (fundamental issue requiring human input)
- Stop and report when validation keeps failing after 3 re-validation rounds
- Stop when the user says "stop", "cancel", or "abort"
- If requirements were too vague and expansion produces an unclear spec, pause and ask the user for clarification before
  proceeding </Escalation_And_Stop_Conditions>

<Final_Checklist>

- [ ] All 5 phases completed (Expansion, Planning, Execution, QA, Validation)
- [ ] All validators approved in Phase 4
- [ ] Tests pass (verified with fresh test run output)
- [ ] Build succeeds (verified with fresh build output)
- [ ] Branch integrated via finishing-a-development-branch (if on a dedicated branch)
- [ ] State files cleaned up
- [ ] User informed of completion with summary of what was built </Final_Checklist>

<Advanced>
## Configuration

Optional settings in `.claude/settings.json`:

```json
{
  "autopilot": {
    "maxIterations": 10,
    "maxQaCycles": 5,
    "maxValidationRounds": 3,
    "pauseAfterExpansion": false,
    "pauseAfterPlanning": false,
    "skipQa": false,
    "skipValidation": false
  }
}
```

## Resume

If autopilot was cancelled or failed, run `autopilot` again to resume from where it stopped.

## Best Practices for Input

1. Be specific about the domain -- "bookstore" not "store"
2. Mention key features -- "with CRUD", "with authentication"
3. Specify constraints -- "using TypeScript", "with PostgreSQL"
4. Let it run -- avoid interrupting unless truly needed

## Troubleshooting

**Stuck in a phase?** Check TODO list for blocked tasks, review `.claude/local/autopilot-state.json`, or cancel and
resume.

**QA cycles exhausted?** The same error 3 times indicates a fundamental issue. Review the error pattern; manual
intervention may be needed.

**Validation keeps failing?** Review the specific issues. Requirements may have been too vague -- cancel and provide
more detail. </Advanced>
