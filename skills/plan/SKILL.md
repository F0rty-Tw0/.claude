---
name: plan
description: Plans work before implementation - interviews on vague ideas, drafts plans with testable acceptance criteria and PR slices, reviews an existing plan (--review), or runs a Planner/Architect/Critic loop (--consensus, 'ralplan'). Use for 'plan this', 'let's plan', or broad work needing scoping.
---

<Purpose>
Plan creates actionable work plans. It interviews the user on broad requests, plans directly on detailed ones, and supports consensus mode (Planner/Architect/Critic loop) and review mode (Critic evaluation of an existing plan).
</Purpose>

<Use_When>

- User wants to plan before implementing -- "plan this", "plan the", "let's plan"
- User wants structured requirements gathering for a vague idea
- User wants an existing plan reviewed -- "review this plan", `--review`
- User wants multi-perspective consensus on a plan -- `--consensus`, "ralplan"
- Task is broad or vague and needs scoping before any code is written </Use_When>

<Do_Not_Use_When>

- User wants autonomous end-to-end execution -- use `flow --auto` instead
- User wants to start coding immediately with a clear task -- use `ralph` or delegate to executor
- User asks a simple question that can be answered directly -- just answer it
- Task is a single focused fix with obvious scope -- skip planning, just do it </Do_Not_Use_When>

<Execution_Policy>

- Auto-detect interview vs direct mode based on request specificity
- Ask focused questions that build on earlier answers -- at most 3 per `AskUserQuestion` call, each with a recommended default
- Look up codebase facts yourself (Read, `grep` via Bash) before asking the user about them
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
2. **Ask focused questions** (up to 3 per `AskUserQuestion` call) on preferences, scope, and constraints
3. **Gather codebase facts first**: Before asking "what patterns does your code use?", look it up directly (use
   the built-in `Explore` agent only for a wide multi-directory sweep), then ask informed follow-up questions
4. **Build on answers**: Each question builds on the previous answer
5. **Identify hidden requirements**, edge cases, and risks before drafting
6. **Create plan** when the user signals readiness: "create the plan", "I'm ready", "make it a work plan"

### Direct Mode (detailed requests)

1. **Quick Analysis**: note hidden requirements and risks
2. **Create plan**: Generate the work plan immediately
3. **Review** (optional): Critic review if requested

### Consensus Mode (`--consensus` / "ralplan")

1. **Planner** creates initial plan
2. **User feedback**: present the draft with `AskUserQuestion` (a clickable UI) and these options:
   - **Proceed to review** — send to Architect and Critic for evaluation
   - **Request changes** — return to step 1 with user feedback incorporated
   - **Skip review** — go directly to final approval (step 7)
3. **Architect** reviews for architectural soundness
4. **Critic** evaluates against quality criteria
5. **Re-review loop** (max 5 rounds): if Critic rejects, feed the Architect + Critic feedback to the Planner, then
   repeat steps 3-4 on the revision. No approval after 5 rounds → present the best version via `AskUserQuestion`,
   noting consensus was not reached.
6. **Apply improvements**: merge the accepted, deduplicated reviewer suggestions into the plan file in
   `.claude/local/plans/` and list them in a short changelog at the end of the plan.
7. On Critic approval (with improvements applied): present the plan with `AskUserQuestion` and these options:
   - **Approve and execute** — proceed to implementation via ralph
   - **Clear context and implement** — compact the context window first (recommended when context is large after
     planning), then start fresh implementation via ralph with the saved plan file
   - **Request changes** — return to step 1 with user feedback
   - **Reject** — discard the plan entirely
8. User chooses in the `AskUserQuestion` UI, not in plain text
9. On user approval:
   - **Approve and execute**: invoke `Skill("ralph")` (autonomous) **or** `Skill("subagent-driven-development")` (supervised — review-gated per task) with the approved plan path from `.claude/local/plans/`. Pick supervised for high-stakes or ambiguous work. The planning agent does not edit source files itself.
   - **Clear context and implement**: `/compact` is a built-in command only the user can run. Ask the user to run it,
     then invoke `Skill("ralph")` with the approved plan path from `.claude/local/plans/`.

### Review Mode (`--review`)

1. Read plan file from `.claude/local/plans/`
2. Evaluate via Critic
3. Return verdict: APPROVED, REVISE (with specific feedback), or REJECT (replanning required)

### Plan Output Format

Every plan includes:

- Requirements Summary
- Acceptance Criteria (testable)
- Implementation Steps (with file references)
- Risks and Mitigations
- Verification Steps
- PR Slices — when the work will exceed ~400 changed lines or mixes blast-radius classes: slice table (Slice, Branch, Base, Blast, Tasks — see `references/task-format.md`) per skill:meaningful-prs. Slicing at plan time is cheap; splitting a finished branch is not.

Plans are saved to `.claude/local/plans/`. Drafts go to `.claude/local/drafts/`.

When the plan will be executed task by task, write its tasks in the format in `references/task-format.md` (exact files, failing test, commands with expected output, PR-slice table). </Steps>

<Tool_Usage>

- Use `AskUserQuestion` for preference questions (scope, priority, timeline, risk tolerance); plain text for questions
  needing specific values (port numbers, names)
- Use the built-in `Explore` agent only when a codebase question needs a wide multi-directory sweep; answer single lookups directly
- Optional: a cross-model check via agentic-mcp, only if the user opted in for this repo (it sends plan and code context to an external provider); never block on it
  </Tool_Usage>

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
Questions that build on answers:
```
Round 1: "What's the main goal?" -> "Improve performance"
Round 2: "Latency or throughput?" + "Which endpoints matter most?" -> "Latency, /search"
Round 3: "Optimize p50 or p99 for /search?"
```
Why good: Each round builds on the previous answers, with at most 3 questions per round.
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
