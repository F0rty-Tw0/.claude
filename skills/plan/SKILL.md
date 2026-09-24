---
name: plan
description: Use when the user wants to plan before implementing ("plan this", "let's plan"), needs structured requirements gathering for a vague idea, wants an existing plan reviewed ("review this plan", --review), wants multi-perspective consensus on a plan (--consensus, "ralplan"), or when a task is broad/vague and needs scoping before any code is written.
---

<Purpose>
Plan creates comprehensive, actionable work plans through intelligent interaction. It auto-detects whether to interview the user (broad requests) or plan directly (detailed requests), and supports consensus mode (iterative Planner/Architect/Critic loop) and review mode (Critic evaluation of existing plans).
</Purpose>

<Use_When>

- User wants to plan before implementing -- "plan this", "plan the", "let's plan"
- User wants structured requirements gathering for a vague idea
- User wants an existing plan reviewed -- "review this plan", `--review`
- User wants multi-perspective consensus on a plan -- `--consensus`, "ralplan"
- Task is broad or vague and needs scoping before any code is written </Use_When>

<Do_Not_Use_When>

- User wants autonomous end-to-end execution -- use `autopilot` instead
- User wants to start coding immediately with a clear task -- use `ralph` or delegate to executor
- User asks a simple question that can be answered directly -- just answer it
- Task is a single focused fix with obvious scope -- skip planning, just do it </Do_Not_Use_When>

<Why_This_Exists> Jumping into code without understanding requirements leads to rework, scope creep, and missed edge
cases. Plan provides structured requirements gathering, expert analysis, and quality-gated plans so that execution
starts from a solid foundation. The consensus mode adds multi-perspective validation for high-stakes projects.
</Why_This_Exists>

<Execution_Policy>

- Auto-detect interview vs direct mode based on request specificity
- Ask focused questions that build on earlier answers -- at most 3 per `AskUserQuestion` call, each with a recommended default
- Look up codebase facts yourself (Grep/Read) before asking the user about them
- Plans cite file/line for codebase claims and give testable acceptance criteria
- Consensus mode requires explicit user approval before proceeding to implementation </Execution_Policy>

<Steps>

### Mode Selection

| Mode      | Trigger                         | Behavior                                            |
| --------- | ------------------------------- | --------------------------------------------------- |
| Interview | Default for broad requests      | Interactive requirements gathering                  |
| Direct    | `--direct`, or detailed request | Skip interview, generate plan directly              |
| Consensus | `--consensus`, "ralplan"        | Planner -> Architect -> Critic loop until agreement |
| Review    | `--review`, "review this plan"  | Critic evaluation of existing plan                  |

### Interview Mode (broad/vague requests)

1. **Classify the request**: Broad (vague verbs, no specific files, touches 3+ areas) triggers interview mode
2. **Ask one focused question** using `AskUserQuestion` for preferences, scope, and constraints
3. **Gather codebase facts first**: Before asking "what patterns does your code use?", look it up directly (use
   `explore` only for a wide multi-directory sweep), then ask informed follow-up questions
4. **Build on answers**: Each question builds on the previous answer
5. **Identify hidden requirements**, edge cases, and risks before drafting
6. **Create plan** when the user signals readiness: "create the plan", "I'm ready", "make it a work plan"

### Direct Mode (detailed requests)

1. **Quick Analysis**: note hidden requirements and risks
2. **Create plan**: Generate comprehensive work plan immediately
3. **Review** (optional): Critic review if requested

### Consensus Mode (`--consensus` / "ralplan")

1. **Planner** creates initial plan
2. **User feedback**: **MUST** use `AskUserQuestion` to present the draft plan with these options:
   - **Proceed to review** — send to Architect and Critic for evaluation
   - **Request changes** — return to step 1 with user feedback incorporated
   - **Skip review** — go directly to final approval (step 7)
3. **Architect** reviews for architectural soundness (prefer `mcp__agentic-mcp__ask_codex` for a second opinion)
4. **Critic** evaluates against quality criteria (prefer `mcp__agentic-mcp__ask_codex` for a second opinion)
5. **Re-review loop** (max 5 iterations): If Critic rejects, execute this closed loop: a. Collect all rejection feedback
   from Architect + Critic b. Pass feedback to Planner to produce a revised plan c. **Return to Step 3** — Architect
   reviews the revised plan d. **Return to Step 4** — Critic evaluates the revised plan e. Repeat until Critic approves
   OR max 5 iterations reached f. If max iterations reached without approval, present the best version to user via
   `AskUserQuestion` with note that expert consensus was not reached
6. **Apply improvements**: When reviewers approve with improvement suggestions, merge all accepted improvements into the
   plan file before proceeding. Specifically: a. Collect all improvement suggestions from Architect and Critic responses
   b. Deduplicate and categorize the suggestions c. Update the plan file in `.claude/local/plans/` with the accepted
   improvements (add missing details, refine steps, strengthen acceptance criteria, etc.) d. Note which improvements
   were applied in a brief changelog section at the end of the plan
7. On Critic approval (with improvements applied): **MUST** use `AskUserQuestion` to present the plan with these
   options:
   - **Approve and execute** — proceed to implementation via ralph+ultrawork
   - **Clear context and implement** — compact the context window first (recommended when context is large after
     planning), then start fresh implementation via ralph with the saved plan file
   - **Request changes** — return to step 1 with user feedback
   - **Reject** — discard the plan entirely
8. User chooses via the structured `AskUserQuestion` UI (never ask for approval in plain text)
9. On user approval:
   - **Approve and execute**: invoke `Skill("ralph")` (autonomous — parallel execution via ultrawork) **or** `Skill("subagent-driven-development")` (supervised — review-gated per task) with the approved plan path from `.claude/local/plans/`. Pick supervised for high-stakes or ambiguous work. Do NOT implement directly or edit source code files in the planning agent.
   - **Clear context and implement**: `/compact` is a built-in command only the user can run. Ask the user to run it,
     then invoke `Skill("ralph")` with the approved plan path from `.claude/local/plans/`.

### Review Mode (`--review`)

1. Read plan file from `.claude/local/plans/`
2. Evaluate via Critic (prefer `mcp__agentic-mcp__ask_codex` for a second opinion)
3. Return verdict: APPROVED, REVISE (with specific feedback), or REJECT (replanning required)

### Plan Output Format

Every plan includes:

- Requirements Summary
- Acceptance Criteria (testable)
- Implementation Steps (with file references)
- Risks and Mitigations
- Verification Steps

Plans are saved to `.claude/local/plans/`. Drafts go to `.claude/local/drafts/`. </Steps>

<Tool_Usage>

- Before first MCP tool use, call `ToolSearch("mcp")` to discover deferred MCP tools
- Use `AskUserQuestion` for preference questions (scope, priority, timeline, risk tolerance) -- provides clickable UI
- Use plain text for questions needing specific values (port numbers, names, follow-up clarifications)
- Use `explore` only when a codebase question needs a wide multi-directory sweep; answer single lookups directly
- Use `mcp__agentic-mcp__ask_codex` for planning validation on large-scope plans
- Use `mcp__agentic-mcp__ask_codex` for requirements analysis cross-checks
- Use `mcp__agentic-mcp__ask_codex` for plan review in consensus and review modes
- If ToolSearch finds no MCP tools or agentic-mcp is unavailable, fall back to equivalent Claude agents -- never block on
  external tools
- In consensus mode, **MUST** use `AskUserQuestion` for the user feedback step (step 2) and the final approval step
  (step 7) -- never ask for approval in plain text
- In consensus mode, on user approval invoke `Skill("ralph")` (autonomous) or `Skill("subagent-driven-development")` (supervised) for execution (step 9) -- never implement directly in the planning agent
- "Clear context and implement" needs the user to run `/compact` first; the saved plan file carries the context
  across </Tool_Usage>

<Examples>
<Good>
Adaptive interview (gathering facts before asking):
```
Planner: [greps for the authentication implementation]
Planner: [receives: "Auth is in src/auth/ using JWT with passport.js"]
Planner: "I see you're using JWT authentication with passport.js in src/auth/.
         For this new feature, should we extend the existing auth or add a separate auth flow?"
```
Why good: Answers its own codebase question first, then asks an informed preference question.
</Good>

<Good>
Single question at a time:
```
Q1: "What's the main goal?"
A1: "Improve performance"
Q2: "For performance, what matters more -- latency or throughput?"
A2: "Latency"
Q3: "For latency, are we optimizing for p50 or p99?"
```
Why good: Each question builds on the previous answer. Focused and progressive.
</Good>

<Bad>
Asking about things you could look up:
```
Planner: "Where is authentication implemented in your codebase?"
User: "Uh, somewhere in src/auth I think?"
```
Why bad: The planner should look this up itself, not ask the user.
</Bad>
</Examples>

<Escalation_And_Stop_Conditions>

- Stop interviewing when requirements are clear enough to plan -- do not over-interview
- In consensus mode, stop after 5 Planner/Architect/Critic iterations and present the best version
- Consensus mode requires explicit user approval before any implementation begins
- If the user says "just do it" or "skip planning", leave planning: do a single focused fix directly, and hand
  multi-step work to `Skill("ralph")` or `Skill("subagent-driven-development")`.
- Escalate to the user when there are irreconcilable trade-offs that require a business decision
  </Escalation_And_Stop_Conditions>

<Final_Checklist>

- [ ] Acceptance criteria are testable
- [ ] Codebase claims reference specific files/lines
- [ ] All risks have mitigations identified
- [ ] No vague terms without metrics ("fast" -> "p99 < 200ms")
- [ ] Plan saved to `.claude/local/plans/`
- [ ] In consensus mode: user explicitly approved before any execution </Final_Checklist>

<Advanced>
## Design Option Presentation

Present 2-3 options (including "do nothing" where it applies) with effort, risk, and maintenance trade-offs and an
opinionated recommendation, then wait for the user's pick.

## Question Classification

Before asking any interview question, classify it:

| Type            | Examples                              | Action                         |
| --------------- | ------------------------------------- | ------------------------------ |
| Codebase Fact   | "What patterns exist?", "Where is X?" | Explore first, do not ask user |
| User Preference | "Priority?", "Timeline?"              | Ask user via AskUserQuestion   |
| Scope Decision  | "Include feature Y?"                  | Ask user                       |
| Requirement     | "Performance constraints?"            | Ask user                       |

## Review Quality Criteria

| Criterion    | Standard                   |
| ------------ | -------------------------- |
| Clarity      | Codebase claims cite file/line |
| Testability  | Criteria are concrete and testable |
| Verification | All file refs exist        |
| Specificity  | No vague terms             |
</Advanced>
